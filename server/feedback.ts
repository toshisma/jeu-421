/**
 * Boîte à idées / signaler un souci (menu « Plus » → « Une idée ? Un souci ? »).
 *
 *  - Envoi : comptes et invités (un invité ne peut pas recevoir de réponse). Type (idée / souci / autre),
 *    texte de 10 à 1000 caractères (caractères de contrôle retirés), « me prévenir » pour les comptes.
 *    Contexte joint, non personnel : version du jeu, langue, taille d'écran, écran en cours.
 *    Jamais d'adresse IP ni d'e-mail en base : l'adresse sert seulement au débit, en mémoire, hachée.
 *  - Anti-spam : 5 envois par compte et 10 par adresse sur 24 h glissantes. Repérage discret
 *    (shared/pm-safety.ts, liens) : un drapeau pour l'équipe, jamais un blocage.
 *  - « Mes envois » : un compte ne voit que les siens, avec le statut et la réponse éventuelle.
 *  - Administration (comptes ADMIN_USERS, vérifiés à chaque appel) : liste filtrable, statut
 *    Lue / Faite / Pas retenue, réponse courte (300 caractères). Chaque décision est journalisée
 *    (admin_log). « Faite » ou une réponse : le joueur est prévenu (panneau des notifications du jeu
 *    et notification push si « me prévenir »), titre traduit dans la langue de son appareil.
 *  - Nouvel envoi : alerte aux administrateurs (au plus une toutes les 10 minutes).
 */
import express, { type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import type { Store, UserRow } from './db';
import { translate, type Lang } from '../shared/i18n';
import { scanMessage } from '../shared/pm-safety';
import {
  FB_DAILY_ACCOUNT, FB_DAILY_IP, FB_MAX, FB_MIN, FB_REPLY_MAX, cleanFbContext, cleanFbText, isFbKind, isFbStatus, type FbKind, type FbStatus,
} from '../shared/feedback';

const DAY = 86400_000;

export interface FeedbackDeps {
  store: Store;
  userFromToken: (t: unknown) => UserRow | undefined;
  isAdmin: (u: UserRow | undefined) => boolean;
  log: (by: string, action: string, target: UserRow | null, details: string) => void;
  push: (userId: string, title: string, body: string, url?: string, localize?: (lang: Lang) => { title: string; body: string }) => void;
  notifyAdmins?: (title: string, body: string) => void;
  now?: () => number;
  limits?: { account?: number; ip?: number };
}

interface FbRow {
  id: number; user_id: string | null; kind: FbKind; text: string; lang: string; version: string; viewport: string; screen: string;
  notify: number; status: FbStatus; reply: string | null; flags: string; created_at: number; updated_at: number; player_unseen: number;
}

export function createFeedback(d: FeedbackDeps) {
  const now = d.now ?? Date.now;
  const db = d.store.sqlite;
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'fr',
      version TEXT NOT NULL DEFAULT '',
      viewport TEXT NOT NULL DEFAULT '',
      screen TEXT NOT NULL DEFAULT '',
      notify INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'recue',
      reply TEXT,
      flags TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      player_unseen INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
  `);
  const LIM_ACCOUNT = d.limits?.account ?? FB_DAILY_ACCOUNT;
  const LIM_IP = d.limits?.ip ?? FB_DAILY_IP;
  /** Envois récents par adresse (hachée, en mémoire seulement). */
  const byIp = new Map<string, number[]>();
  let lastAlert = 0;

  const router = express.Router();
  const json = express.json({ limit: '8kb' });
  router.use('/feedback', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Day');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  /** Erreur : texte français (repli) et code traduit par le client (zone `fb.`). */
  const fail = (res: Response, status: number, code: string, error: string) => { res.status(status).json({ ok: false, code, error }); };
  const viewer = (req: Request) => { const h = req.headers.authorization ?? ''; return d.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : ''); };
  const ipKey = (req: Request) => createHash('sha256').update(`fb:${req.ip ?? '?'}`).digest('hex').slice(0, 24);

  const mineView = (r: FbRow) => ({ id: r.id, kind: r.kind, text: r.text, status: r.status, reply: r.reply, at: r.created_at, updatedAt: r.updated_at, fresh: !!r.player_unseen });

  // --- Joueurs ------------------------------------------------------------------------------------
  router.post('/feedback', json, (req, res) => {
    const me = viewer(req);
    const kind = req.body?.kind;
    if (!isFbKind(kind)) return fail(res, 400, 'fb.err.kind', 'Choisissez : idée, souci ou autre.');
    const text = cleanFbText(req.body?.text, FB_MAX + 1);
    if (text.length < FB_MIN) return fail(res, 400, 'fb.err.short', `Écrivez au moins ${FB_MIN} caractères.`);
    if (text.length > FB_MAX) return fail(res, 400, 'fb.err.long', `${FB_MAX} caractères au plus.`);
    const t = now();
    const ip = ipKey(req);
    const recentIp = (byIp.get(ip) ?? []).filter((x) => t - x < DAY);
    const recentAcc = me ? (db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at > ?').get(me.id, t - DAY) as { n: number }).n : 0;
    if (recentIp.length >= LIM_IP || (me && recentAcc >= LIM_ACCOUNT)) return fail(res, 429, 'fb.err.rate', 'Merci ! Vous avez déjà beaucoup écrit aujourd’hui : réessayez demain.');
    recentIp.push(t);
    if (byIp.size > 20000) byIp.clear();
    byIp.set(ip, recentIp);
    const ctx = cleanFbContext(req.body?.context);
    const flags = [...scanMessage(text), ...(/https?:\/\/|www\./i.test(text) ? ['lien'] : [])];
    const r = db.prepare(`INSERT INTO feedback (user_id, kind, text, lang, version, viewport, screen, notify, status, flags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'recue', ?, ?, ?)`)
      .run(me?.id ?? null, kind, text, ctx.lang || 'fr', ctx.version, ctx.viewport, ctx.screen, me && req.body?.notify !== false ? 1 : 0, [...new Set(flags)].join(','), t, t);
    if (d.notifyAdmins && t - lastAlert > 10 * 60_000) {
      lastAlert = t;
      const label = kind === 'idee' ? 'Nouvelle idée' : kind === 'souci' ? 'Nouveau souci signalé' : 'Nouveau message';
      d.notifyAdmins(`${label} (boîte à idées)`, `${me?.username ?? 'Un invité'} : ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`);
    }
    res.json({ ok: true, id: Number(r.lastInsertRowid), account: !!me });
  });

  router.get('/feedback/mine', (req, res) => {
    const me = viewer(req);
    if (!me) return fail(res, 401, 'fb.err.account', 'Créez un compte pour suivre vos envois.');
    const rows = db.prepare('SELECT * FROM feedback WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30').all(me.id) as unknown as FbRow[];
    res.json({ ok: true, items: rows.map(mineView) });
  });
  /** Réponses et statuts vus par le joueur (liste « Mes envois » ou panneau des notifications). */
  router.post('/feedback/seen', json, (req, res) => {
    const me = viewer(req);
    if (!me) return fail(res, 401, 'fb.err.account', 'Créez un compte pour suivre vos envois.');
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown) => Number.isInteger(x)).slice(0, 50) : [];
    const q = db.prepare('UPDATE feedback SET player_unseen = 0 WHERE user_id = ? AND id = ?');
    for (const id of ids) q.run(me.id, id);
    res.json({ ok: true });
  });

  /** Pour le panneau des notifications (server/social.ts) : réponses et idées réalisées pas encore vues. */
  const unseenFor = (userId: string) =>
    (db.prepare('SELECT * FROM feedback WHERE user_id = ? AND player_unseen = 1 AND notify = 1 ORDER BY updated_at DESC LIMIT 10').all(userId) as unknown as FbRow[])
      .map((r) => ({ id: r.id, kind: r.kind, status: r.status, reply: r.reply, text: r.text.slice(0, 80), at: r.updated_at }));

  // --- Administration -----------------------------------------------------------------------------
  const admin = express.Router();
  admin.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const u = viewer(req);
    if (!d.isAdmin(u)) return fail(res, 403, 'fb.err.admin', 'Accès réservé à l’administration.');
    (req as Request & { admin: UserRow }).admin = u!;
    next();
  });
  const unread = () => (db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE status = 'recue'").get() as { n: number }).n;
  const counts = () => Object.fromEntries((db.prepare('SELECT status, COUNT(*) AS n FROM feedback GROUP BY status').all() as { status: string; n: number }[]).map((r) => [r.status, r.n]));
  const adminView = (r: FbRow & { username: string | null }) => ({
    id: r.id, kind: r.kind, text: r.text, status: r.status, reply: r.reply, at: r.created_at, updatedAt: r.updated_at,
    // Le pseudo (déjà visible partout dans l'administration) ou « Invité » : ni adresse, ni e-mail.
    username: r.username, guest: !r.user_id, notify: !!r.notify,
    context: { version: r.version, lang: r.lang, viewport: r.viewport, screen: r.screen }, flags: r.flags ? r.flags.split(',') : [],
  });

  admin.get('/unread', (_req, res) => res.json({ ok: true, unread: unread() }));
  admin.get('/', (req, res) => {
    const status = isFbStatus(req.query.status) ? req.query.status : '';
    const kind = isFbKind(req.query.kind) ? req.query.kind : '';
    const rows = db.prepare(`SELECT f.*, u.username FROM feedback f LEFT JOIN users u ON u.id = f.user_id
      WHERE (? = '' OR f.status = ?) AND (? = '' OR f.kind = ?) ORDER BY f.created_at DESC, f.id DESC LIMIT 200`)
      .all(status, status, kind, kind) as unknown as (FbRow & { username: string | null })[];
    res.json({ ok: true, items: rows.map(adminView), unread: unread(), counts: counts() });
  });
  /** { status?: 'lue' | 'faite' | 'refusee' | 'recue', reply?: string } */
  admin.post('/:id', json, (req, res) => {
    const by = (req as unknown as { admin: UserRow }).admin.username;
    const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(Number(req.params.id)) as unknown as FbRow | undefined;
    if (!row) return fail(res, 404, 'fb.err.none', 'Message introuvable.');
    const status = req.body?.status === undefined ? row.status : req.body.status;
    if (!isFbStatus(status)) return fail(res, 400, 'fb.err.status', 'Statut inconnu.');
    const replyRaw = req.body?.reply;
    const reply = replyRaw === undefined ? row.reply : cleanFbText(replyRaw, FB_REPLY_MAX + 1) || null;
    if (reply && reply.length > FB_REPLY_MAX) return fail(res, 400, 'fb.err.reply', `Réponse : ${FB_REPLY_MAX} caractères au plus.`);
    if (reply && !row.user_id) return fail(res, 400, 'fb.err.guest', 'Message d’un invité : impossible de lui répondre.');
    const t = now();
    const becameDone = status === 'faite' && row.status !== 'faite';
    const newReply = !!reply && reply !== row.reply;
    const tell = !!row.user_id && (becameDone || newReply);
    db.prepare('UPDATE feedback SET status = ?, reply = ?, updated_at = ?, player_unseen = CASE WHEN ? THEN 1 ELSE player_unseen END WHERE id = ?')
      .run(status, reply, t, tell ? 1 : 0, row.id);
    const target = row.user_id ? d.store.userById(row.user_id) ?? null : null;
    const parts = [status !== row.status ? `statut ${row.status} → ${status}` : '', newReply ? `réponse : ${reply}` : ''].filter(Boolean);
    if (parts.length) d.log(by, 'idee', target, `Boîte à idées n° ${row.id} : ${parts.join(' ; ')}`);
    if (tell && row.notify && target) {
      const titleKey = becameDone ? 'fb.n.doneT' : 'fb.n.replyT';
      const loc = (l: Lang) => ({ title: translate(l, titleKey), body: newReply ? reply! : translate(l, 'fb.n.doneB') });
      const fr = loc('fr');
      d.push(target.id, fr.title, fr.body, '/?idees=1', loc);
    }
    const updated = db.prepare('SELECT f.*, u.username FROM feedback f LEFT JOIN users u ON u.id = f.user_id WHERE f.id = ?').get(row.id) as unknown as FbRow & { username: string | null };
    res.json({ ok: true, item: adminView(updated), unread: unread(), notified: tell && !!row.notify });
  });
  router.use('/admin/feedback', admin);

  return { router, unseenFor, unread };
}
export type FeedbackApi = ReturnType<typeof createFeedback>;
