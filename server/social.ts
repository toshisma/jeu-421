/**
 * Social : demandes d'amis, défis entre amis à distance, notifications (dans le jeu et push).
 *
 * Défis : les deux joueurs reçoivent exactement les mêmes dés (suite tirée de l'identifiant du
 * défi) ; le serveur rejoue les décisions pour calculer le score. Les mises sont prélevées à
 * l'envoi (pour celui qui défie) et au moment de jouer (pour l'autre), et rendues si le défi est
 * refusé ou expire. Elles ne passent pas par le séquestre des tables : un défi survit aux
 * redémarrages du serveur.
 */
import { randomUUID } from 'node:crypto';
import type { Request, Response, Router, NextFunction } from 'express';
import webpush from 'web-push';
import { playChallenge } from '../shared/challenge';
import type { DuelRow, Store, UserRow } from './db';
import { dailyStatus } from '../shared/progress/profile';
import { happyHourOfDay } from '../shared/progress/events';
import { fetePush } from '../shared/progress/fetes';
import { isLang, type Lang } from '../shared/i18n';
import { translateServerText } from '../shared/i18n/server-texts';

/** Texte d'une notification push dans la langue de l'appareil (enregistrée à l'abonnement ; français sinon). */
const pushText = (lang: string | null, text: string): string => (isLang(lang) ? translateServerText(lang as Lang, text) : text);

export const DUEL_STAKES = [0, 10, 25, 50];
export const DUEL_HOURS = 72;
/** Après un refus : délai avant de pouvoir redemander la même personne. */
export const FRIEND_RETRY_DAYS = 7;
/** Demandes d'amis (personnes différentes) par expéditeur et par 24 h. */
export const FRIEND_REQUESTS_PER_DAY = 20;

interface Ctx {
  router: Router;
  store: Store;
  auth: (req: Request, res: Response, next: NextFunction) => void;
  userOf: (req: Request) => UserRow;
  fail: (res: Response, status: number, error: string) => void;
  adjust: (userId: string, delta: number) => unknown;
  coinsOf: (userId: string) => number;
  brusselsDate: (t: number) => string;
  brusselsHour: () => number;
  now: () => number;
}

export function createSocial(c: Ctx) {
  const { router, store, auth, userOf, fail } = c;

  // --- Notifications push (application installée) -------------------------------------------
  // Clés VAPID : variables d'environnement, sinon créées une fois et gardées dans la base.
  let vapid: { publicKey: string; privateKey: string } | null = null;
  try {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    else {
      const saved = store.getMeta('vapid');
      vapid = saved ? JSON.parse(saved) : webpush.generateVAPIDKeys();
      if (!saved) store.setMeta('vapid', JSON.stringify(vapid));
    }
    webpush.setVapidDetails(`mailto:${process.env.CONTACT_EMAIL ?? 'samrenson@gmail.com'}`, vapid!.publicKey, vapid!.privateKey);
  } catch { vapid = null; }

  const sent: { userId: string; title: string; body: string }[] = []; // pour les tests
  async function push(userId: string, title: string, body: string, url = '/') {
    sent.push({ userId, title, body });
    if (sent.length > 200) sent.shift();
    if (!vapid || process.env.VITEST) return;
    for (const s of store.pushOf(userId)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: pushText(s.lang, title), body: pushText(s.lang, body), url }), { TTL: 6 * 3600 });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) store.pushRemove(s.endpoint); // abonnement expiré
      }
    }
  }
  router.get('/push/key', (_req, res) => res.json({ ok: true, key: vapid?.publicKey ?? null }));
  router.post('/push/subscribe', auth, (req, res) => {
    const s = req.body?.subscription;
    const endpoint = typeof s?.endpoint === 'string' ? s.endpoint : '';
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof s?.keys?.p256dh !== 'string' || typeof s?.keys?.auth !== 'string') return fail(res, 400, 'Abonnement invalide.');
    store.pushAdd(userOf(req).id, endpoint, s.keys.p256dh.slice(0, 200), s.keys.auth.slice(0, 100), isLang(req.body?.lang) ? req.body.lang : null);
    res.json({ ok: true });
  });
  router.post('/push/lang', auth, (req, res) => {
    if (typeof req.body?.endpoint === 'string' && isLang(req.body?.lang)) store.pushSetLang(req.body.endpoint, userOf(req).id, req.body.lang);
    res.json({ ok: true });
  });
  router.post('/push/unsubscribe', auth, (req, res) => {
    if (typeof req.body?.endpoint === 'string') store.pushRemove(req.body.endpoint);
    res.json({ ok: true });
  });

  // --- Demandes d'amis ------------------------------------------------------------------------
  const target = (req: Request) => (typeof req.body?.username === 'string' ? store.userByName(req.body.username.trim()) : undefined);
  /** Ajouter un ami : une demande, que l'autre accepte ou refuse. Si lui m'avait déjà demandé : amis tout de suite. */
  function request(me: UserRow, f: UserRow | undefined, res: Response) {
    if (!f) return fail(res, 404, 'Aucun joueur avec ce pseudo.');
    if (f.id === me.id) return fail(res, 400, 'C\'est vous !');
    if (store.isBlocked(me.id, f.id)) return fail(res, 403, 'Impossible d’ajouter ce joueur.');
    if (store.isFriend(me.id, f.id) && store.isFriend(f.id, me.id)) return fail(res, 409, 'Vous êtes déjà amis.');
    if (store.hasFriendRequest(f.id, me.id)) { accept(me, f); return res.json({ ok: true, result: 'accepted' }); }
    if (store.hasFriendRequest(me.id, f.id)) return res.json({ ok: true, result: 'pending' });
    const t = c.now(), limits = store.friendLimit(me.id, f.id);
    if (limits.declinedAt && t - limits.declinedAt < FRIEND_RETRY_DAYS * 86400_000) return fail(res, 429, `Ce joueur a refusé votre demande : réessayez dans quelques jours (${FRIEND_RETRY_DAYS} jours après le refus).`);
    const renewed = t - limits.sentAt < 86400_000; // demande annulée puis renvoyée : pas de nouvelle notification
    if (!renewed && store.friendSentSince(me.id, t - 86400_000) >= FRIEND_REQUESTS_PER_DAY) return fail(res, 429, 'Trop de demandes d’amis aujourd’hui : réessayez demain.');
    store.friendRequest(me.id, f.id);
    if (!renewed) {
      store.friendSentMark(me.id, f.id, t);
      void push(f.id, 'Demande d’ami', `${me.username} veut être votre ami.`, '/?notifs=1');
    }
    res.json({ ok: true, result: 'sent' });
  }
  function accept(me: UserRow, f: UserRow) {
    store.deleteFriendRequest(f.id, me.id);
    store.deleteFriendRequest(me.id, f.id);
    store.friendLimitClear(me.id, f.id);
    store.addFriend(me.id, f.id);
    store.addFriend(f.id, me.id);
    void push(f.id, 'Nouvel ami', `${me.username} a accepté votre demande d’ami.`);
  }
  router.post('/friends', auth, (req, res) => request(userOf(req), target(req), res));
  router.get('/friends/requests', auth, (req, res) => {
    const me = userOf(req);
    res.json({ ok: true, incoming: store.incomingRequests(me.id), outgoing: store.outgoingRequests(me.id) });
  });
  router.post('/friends/accept', auth, (req, res) => {
    const me = userOf(req), f = target(req);
    if (!f || !store.hasFriendRequest(f.id, me.id)) return fail(res, 404, 'Demande introuvable.');
    accept(me, f);
    res.json({ ok: true });
  });
  router.post('/friends/decline', auth, (req, res) => {
    const me = userOf(req), f = target(req);
    if (f) {
      if (store.hasFriendRequest(f.id, me.id)) store.friendDeclineMark(f.id, me.id, c.now());
      store.deleteFriendRequest(f.id, me.id);
      store.deleteFriendRequest(me.id, f.id);
    }
    res.json({ ok: true });
  });
  router.delete('/friends/:username', auth, (req, res) => {
    const me = userOf(req);
    const f = store.userByName(String(req.params.username));
    if (f) { store.removeFriend(me.id, f.id); store.removeFriend(f.id, me.id); store.deleteFriendRequest(me.id, f.id); }
    res.json({ ok: true });
  });

  // --- Défis entre amis -----------------------------------------------------------------------
  const nameOf = (id: string) => store.userById(id)?.username ?? 'Joueur supprimé';
  /** Défis ouverts depuis plus de 72 h : mises rendues, défi expiré. */
  function expireDuels() {
    for (const d of store.duelsOpenBefore(c.now() - DUEL_HOURS * 3600_000)) {
      if (d.stake) { c.adjust(d.from_id, d.stake); if (d.to_points !== null) c.adjust(d.to_id, d.stake); }
      if (d.from_points !== null && d.to_points === null) void push(d.from_id, 'Défi expiré', `${nameOf(d.to_id)} n'a pas joué votre défi à temps.${d.stake ? ' Mise rendue.' : ''}`);
      store.duelUpdate(d.id, { status: 'expire', ended_at: c.now(), from_seen: 0 });
    }
  }
  /** Vue d'un défi pour un joueur : le score de l'autre reste caché tant qu'on n'a pas joué. */
  function view(d: DuelRow, meId: string) {
    const mineFrom = d.from_id === meId;
    const mine = mineFrom ? (d.from_points === null ? null : { points: d.from_points, throws: d.from_throws! }) : (d.to_points === null ? null : { points: d.to_points, throws: d.to_throws! });
    const theirsRaw = mineFrom ? (d.to_points === null ? null : { points: d.to_points, throws: d.to_throws! }) : (d.from_points === null ? null : { points: d.from_points, throws: d.from_throws! });
    return {
      id: d.id, opponent: nameOf(mineFrom ? d.to_id : d.from_id), sent: mineFrom, stake: d.stake, status: d.status, createdAt: d.created_at,
      expiresAt: d.created_at + DUEL_HOURS * 3600_000, mine, theirsPlayed: !!theirsRaw, theirs: mine || d.status !== 'ouvert' ? theirsRaw : null,
      winner: d.winner_id ? nameOf(d.winner_id) : null, pot: d.winner_id ? d.stake * 2 : 0,
      seen: !!(mineFrom ? d.from_seen : d.to_seen),
    };
  }
  router.post('/duels', auth, (req, res) => {
    expireDuels();
    const me = userOf(req), f = target(req);
    if (!f || f.id === me.id) return fail(res, 404, 'Choisissez un ami à défier.');
    if (!store.isFriend(me.id, f.id) && !store.isFriend(f.id, me.id)) return fail(res, 403, 'Vous ne pouvez défier que vos amis.');
    if (store.isBlocked(me.id, f.id)) return fail(res, 403, 'Impossible de défier ce joueur.');
    const stake = DUEL_STAKES.includes(Number(req.body?.stake)) ? Number(req.body.stake) : 0;
    if (stake && c.coinsOf(me.id) < stake) return fail(res, 400, `Il vous faut ${stake} pièces pour cette mise.`);
    if (stake) c.adjust(me.id, -stake);
    const id = randomUUID();
    store.duelCreate({ id, from: me.id, to: f.id, stake, at: c.now() });
    res.json({ ok: true, duel: view(store.duel(id)!, me.id) });
  });
  router.get('/duels', auth, (req, res) => {
    expireDuels();
    const me = userOf(req);
    res.json({ ok: true, duels: store.duelsOf(me.id, c.now()).map((d) => view(d, me.id)), stakes: DUEL_STAKES });
  });
  router.post('/duels/:id/play', auth, (req, res) => {
    expireDuels();
    const me = userOf(req);
    const d = store.duel(String(req.params.id));
    if (!d || (d.from_id !== me.id && d.to_id !== me.id)) return fail(res, 404, 'Défi introuvable.');
    if (d.status !== 'ouvert') return fail(res, 409, 'Ce défi est terminé.');
    const isFrom = d.from_id === me.id;
    if ((isFrom ? d.from_points : d.to_points) !== null) return fail(res, 409, 'Vous avez déjà joué ce défi.');
    const result = playChallenge(`duel-${d.id}`, req.body?.decisions);
    if (!result) return fail(res, 400, 'Partie invalide.');
    if (!isFrom && d.stake) {
      if (c.coinsOf(me.id) < d.stake) return fail(res, 400, `Il vous faut ${d.stake} pièces pour relever ce défi.`);
      c.adjust(me.id, -d.stake);
    }
    store.duelUpdate(d.id, isFrom ? { from_points: result.points, from_throws: result.throws } : { to_points: result.points, to_throws: result.throws, to_seen: 1 });
    let n = store.duel(d.id)!;
    if (n.from_points !== null && n.to_points !== null) {
      // Les deux ont joué : le plus de points gagne, puis le moins de lancers ; sinon égalité.
      const a = { id: n.from_id, p: n.from_points, t: n.from_throws! }, b = { id: n.to_id, p: n.to_points, t: n.to_throws! };
      const w = a.p !== b.p ? (a.p > b.p ? a : b) : a.t !== b.t ? (a.t < b.t ? a : b) : null;
      if (n.stake) { if (w) c.adjust(w.id, n.stake * 2); else { c.adjust(a.id, n.stake); c.adjust(b.id, n.stake); } }
      store.duelUpdate(n.id, { status: 'fini', winner_id: w?.id ?? null, ended_at: c.now(), from_seen: isFrom ? 1 : 0, to_seen: isFrom ? 0 : 1 });
      n = store.duel(d.id)!;
      const other = isFrom ? n.to_id : n.from_id;
      const otherPts = isFrom ? n.to_points : n.from_points;
      const msg = !w ? `Égalité contre ${me.username} (${result.points} points chacun).` : w.id === other ? `Vous avez battu ${me.username} : ${otherPts} à ${result.points} !` : `${me.username} vous a battu : ${result.points} à ${otherPts}.`;
      void push(other, 'Résultat du défi', msg, '/?notifs=1');
    } else if (isFrom) {
      void push(n.to_id, 'Nouveau défi !', `${me.username} vous défie au 421${n.stake ? ` (mise : ${n.stake} pièces)` : ''}. Mêmes dés pour vous deux.`, '/?notifs=1');
    }
    res.json({ ok: true, result, duel: view(n, me.id) });
  });
  router.post('/duels/:id/decline', auth, (req, res) => {
    const me = userOf(req);
    const d = store.duel(String(req.params.id));
    if (!d || d.to_id !== me.id || d.status !== 'ouvert' || d.to_points !== null) return fail(res, 404, 'Défi introuvable.');
    if (d.stake) c.adjust(d.from_id, d.stake);
    store.duelUpdate(d.id, { status: 'refuse', ended_at: c.now(), from_seen: 0 });
    void push(d.from_id, 'Défi refusé', `${me.username} a refusé votre défi.${d.stake ? ' Mise rendue.' : ''}`);
    res.json({ ok: true });
  });
  router.post('/duels/:id/seen', auth, (req, res) => {
    const me = userOf(req);
    const d = store.duel(String(req.params.id));
    if (d) store.duelUpdate(d.id, d.from_id === me.id ? { from_seen: 1 } : d.to_id === me.id ? { to_seen: 1 } : {});
    res.json({ ok: true });
  });

  // --- Notifications dans le jeu : ce qui attend une action ou n'a pas encore été vu ----------
  router.get('/notifications', auth, (req, res) => {
    expireDuels();
    const me = userOf(req);
    const requests = store.incomingRequests(me.id);
    const duels = store.duelsOf(me.id, c.now()).map((d) => view(d, me.id));
    const toPlay = duels.filter((d) => d.status === 'ouvert' && !d.mine);
    const results = duels.filter((d) => d.status !== 'ouvert' && !d.seen);
    const notices = store.modNotices(me.id);
    res.json({ ok: true, requests, toPlay, results, notices, count: requests.length + toPlay.filter((d) => !d.sent).length + results.length + notices.length });
  });

  /** Avis de la modération lus (affichés dans le panneau des notifications). */
  router.post('/notifications/seen', auth, (req, res) => {
    const ids = Array.isArray(req.body?.notices) ? req.body.notices.filter((x: unknown) => Number.isInteger(x)).slice(0, 50) : [];
    store.modNoticesSeen(userOf(req).id, ids);
    res.json({ ok: true });
  });

  // --- Rappels programmés (vérifiés toutes les 10 minutes) ------------------------------------
  function reminders() {
    const t = c.now();
    const day = c.brusselsDate(t);
    const hour = c.brusselsHour();
    // Happy hour : prévenir au début de l'heure.
    const hh = happyHourOfDay(day);
    if (hh && hour === hh.hour && store.getMeta('push_hh') !== day) {
      store.setMeta('push_hh', day);
      for (const id of store.pushUsers()) void push(id, 'Happy hour !', 'Pièces doublées sur toutes les parties pendant une heure.');
    }
    // Saint-Nicolas (6/12), réveillon (24/12), Nouvel An (1/1) : une notification vers 10 h.
    const fp = fetePush(day);
    if (fp && hour >= 10 && store.getMeta('push_fete') !== day) {
      store.setMeta('push_fete', day);
      for (const id of store.pushUsers()) void push(id, fp.title, fp.body);
    }
    // Série de connexions en danger : rappel vers 19 h, une fois par jour.
    if (hour >= 19 && store.getMeta('push_streak') !== day) {
      store.setMeta('push_streak', day);
      for (const id of store.pushUsers()) {
        const u = store.userById(id);
        if (!u) continue;
        const st = dailyStatus(store.profileOf(u), day);
        if (st.canClaim && (store.profileOf(u).daily?.count ?? 0) >= 2) void push(id, 'Votre série va se perdre', `Votre série de ${store.profileOf(u).daily!.count} jours s'arrête à minuit : passez récupérer votre récompense.`);
      }
    }
  }
  const timer = process.env.VITEST ? null : setInterval(reminders, 10 * 60_000);
  timer?.unref?.();

  return { push, sent, reminders, expireDuels, close: () => { if (timer) clearInterval(timer); } };
}
