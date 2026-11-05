/**
 * Messages privés entre amis.
 *
 *  - Seulement entre amis acceptés (dans les deux sens) et si personne n'a bloqué l'autre.
 *  - Réception en direct par Socket.IO (espace « /messages », authentifié par le jeton du compte) ;
 *    sinon le message attend en base et la pastille l'annonce à la prochaine connexion.
 *  - Notification push « Nouveau message de X » seulement si le destinataire n'a pas le jeu ouvert.
 *  - 500 caractères, caractères de contrôle et liens retirés (comme le tchat de table) ; le texte
 *    est affiché tel quel (jamais interprété comme du HTML) par le client.
 *  - Anti-spam : au plus 8 messages en 10 s et 60 en 10 min par compte.
 */
import type { Request, Response, Router, NextFunction } from 'express';
import type { Namespace, Server } from 'socket.io';
import type { PmRow, Store, UserRow } from './db';
import { muteText } from '../shared/moderation';

export const PM_MAX = 500;
const BURST = { n: 8, ms: 10_000 };
const SUSTAINED = { n: 60, ms: 10 * 60_000 };

interface Ctx {
  router: Router;
  store: Store;
  auth: (req: Request, res: Response, next: NextFunction) => void;
  userOf: (req: Request) => UserRow;
  fail: (res: Response, status: number, error: string) => void;
  push: (userId: string, title: string, body: string, url?: string) => Promise<void>;
  userFromToken: (token: unknown) => UserRow | undefined;
  now: () => number;
}

/** Même nettoyage que le tchat de table : contrôles et liens retirés, espaces superflus réduits. */
export function cleanMessage(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[lien]')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, PM_MAX);
}

export function createMessages(c: Ctx) {
  const { router, store, auth, userOf, fail } = c;
  /** Sockets ouverts par compte (le jeu est ouvert sur au moins un appareil). */
  const sockets = new Map<string, Set<string>>();
  let ns: Namespace | null = null;
  const sent = new Map<string, number[]>();

  const isOpen = (userId: string) => (sockets.get(userId)?.size ?? 0) > 0;
  const emitTo = (userId: string, ev: string, data: unknown) => { for (const id of sockets.get(userId) ?? []) ns?.sockets.get(id)?.emit(ev, data); };
  const canTalk = (a: string, b: string) => store.isFriend(a, b) && store.isFriend(b, a) && !store.isBlocked(a, b);
  const view = (m: PmRow, meId: string, names: Record<string, string>) => ({
    id: m.id, from: names[m.from_id] ?? 'Joueur supprimé', text: m.text, at: m.created_at, mine: m.from_id === meId, read: m.read_at !== null,
  });
  /** Débit : renvoie un message d'erreur si le compte envoie trop vite. */
  function throttle(userId: string): string | null {
    const t = Date.now();
    const list = (sent.get(userId) ?? []).filter((x) => t - x < SUSTAINED.ms);
    if (list.filter((x) => t - x < BURST.ms).length >= BURST.n) return 'Doucement ! Attendez quelques secondes avant le message suivant.';
    if (list.length >= SUSTAINED.n) return 'Trop de messages envoyés : réessayez dans quelques minutes.';
    list.push(t);
    sent.set(userId, list);
    return null;
  }
  const other = (req: Request) => store.userByName(String(req.params.username ?? '').trim());

  router.get('/messages-unread', auth, (req, res) => { res.json({ ok: true, unread: store.pmUnread(userOf(req).id) }); });

  router.get('/messages', auth, (req, res) => {
    const me = userOf(req);
    const conversations = store.pmConversations(me.id)
      .filter((x) => !store.isBlocked(me.id, x.other.id))
      .map((x) => ({
        username: x.other.username, unread: x.unread, friend: canTalk(me.id, x.other.id),
        last: { text: x.last.text, at: x.last.created_at, mine: x.last.from_id === me.id },
      }));
    res.json({ ok: true, conversations, unread: store.pmUnread(me.id) });
  });

  /** Fil d'une conversation (les 50 derniers messages, ou ceux avant ?before=id). Ouvrir = lire. */
  router.get('/messages/:username', auth, (req, res) => {
    const me = userOf(req), f = other(req);
    if (!f || f.id === me.id || store.isBlocked(me.id, f.id)) return fail(res, 404, 'Conversation introuvable.');
    const before = Number(req.query.before);
    const rows = store.pmThread(me.id, f.id, 50, Number.isInteger(before) && before > 0 ? before : undefined);
    const names = { [me.id]: me.username, [f.id]: f.username };
    const marked = store.pmMarkRead(me.id, f.id, c.now());
    if (marked) { emitTo(f.id, 'pm:read', { by: me.username }); emitTo(me.id, 'pm:unread', { unread: store.pmUnread(me.id) }); }
    res.json({ ok: true, username: f.username, friend: canTalk(me.id, f.id), messages: rows.map((m) => view(m, me.id, names)), more: rows.length === 50 });
  });

  router.post('/messages/:username/read', auth, (req, res) => {
    const me = userOf(req), f = other(req);
    if (f && store.pmMarkRead(me.id, f.id, c.now())) { emitTo(f.id, 'pm:read', { by: me.username }); emitTo(me.id, 'pm:unread', { unread: store.pmUnread(me.id) }); }
    res.json({ ok: true, unread: store.pmUnread(me.id) });
  });

  router.post('/messages/:username', auth, (req, res) => {
    const me = userOf(req), f = other(req);
    if (!f || f.id === me.id) return fail(res, 404, 'Aucun joueur avec ce pseudo.');
    if (!canTalk(me.id, f.id)) return fail(res, 403, 'Vous ne pouvez écrire qu’à vos amis.');
    const mute = store.modMuteOf(me.id, c.now());
    if (mute) return fail(res, 403, muteText(mute));
    const text = cleanMessage(req.body?.text);
    if (!text) return fail(res, 400, 'Message vide.');
    if (typeof req.body?.text === 'string' && req.body.text.length > PM_MAX * 2) return fail(res, 400, `Message trop long (${PM_MAX} caractères au plus).`);
    const slow = throttle(me.id);
    if (slow) return fail(res, 429, slow);
    const m = store.pmAdd(me.id, f.id, text, c.now());
    const names = { [me.id]: me.username, [f.id]: f.username };
    // Destinataire : en direct si le jeu est ouvert, sinon notification push.
    emitTo(f.id, 'pm:message', { with: me.username, message: view(m, f.id, names), unread: store.pmUnread(f.id) });
    emitTo(me.id, 'pm:message', { with: f.username, message: view(m, me.id, names) }); // autres appareils de l'expéditeur
    if (!isOpen(f.id)) {
      const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
      void c.push(f.id, `Nouveau message de ${me.username}`, preview, `/?messages=${encodeURIComponent(me.username)}`);
    }
    res.json({ ok: true, message: view(m, me.id, names) });
  });

  /** Branche l'espace Socket.IO « /messages » (réception en direct). */
  function attach(io: Server) {
    ns = io.of('/messages');
    ns.on('connection', (socket) => {
      const u = c.userFromToken(socket.handshake.auth?.token);
      if (!u) { socket.disconnect(true); return; }
      const set = sockets.get(u.id) ?? new Set<string>();
      set.add(socket.id);
      sockets.set(u.id, set);
      socket.emit('pm:unread', { unread: store.pmUnread(u.id) });
      socket.on('disconnect', () => {
        set.delete(socket.id);
        if (!set.size) sockets.delete(u.id);
      });
    });
  }

  return { attach, isOpen, cleanMessage };
}
