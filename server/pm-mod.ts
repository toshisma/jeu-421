/**
 * Messages privés : protection des joueurs (des mineurs peuvent jouer), transparence et traçabilité.
 *
 *  - Signalement d'une CONVERSATION par un joueur : le serveur fige une copie des 50 derniers messages
 *    (les deux sens) dans la file de modération (`mod_reports`, lieu « prive ») ; une suppression ou une
 *    purge ultérieure n'efface pas cette preuve. Le signaleur peut bloquer l'autre dans le même geste.
 *    Les administrateurs reçoivent l'alerte push habituelle.
 *  - Alertes automatiques discrètes : chaque message envoyé est passé au crible des catégories de
 *    shared/pm-safety.ts (jamais bloqué) ; au-delà du seuil, la conversation entre dans « À vérifier »
 *    (une alerte par conversation et par jour au plus).
 *  - Lecture par l'équipe : ADMINISTRATEURS : recherche par pseudo, conversations d'un compte, lecture
 *    de n'importe quelle conversation. MODÉRATEURS : seulement les conversations signalées ou alertées
 *    encore à traiter. Chaque ouverture exige un motif et s'inscrit au journal d'administration.
 *  - Actions depuis la conversation : suspendre, fermer l'échange entre les deux comptes, supprimer un
 *    message (gardé à part, visible barré par l'équipe), marquer traité.
 *  - Conservation : PM_RETENTION_DAYS (12 mois) ; purge automatique, sauf les conversations liées à un
 *    signalement ou une alerte non traités. Copies figées des signalements traités : texte effacé 12 mois
 *    après la décision.
 */
import express, { type Request, type Response } from 'express';
import type { PmRow, Store, UserRow } from './db';
import {
  ALERT_THRESHOLD, ALERT_WINDOW_MS, PM_REPORT_SNAPSHOT, PM_RETENTION_DAYS, READ_MOTIVES, SIGNAL_RETENTION_DAYS,
  conversationScore, isPmReportReason, pairKey, riskLabel, scanMessage, type RiskCat,
} from '../shared/pm-safety';
import { REPORT_COMMENT_MAX, REPORTS_PER_HOUR, reasonLabel } from '../shared/moderation';
import { today } from '../shared/progress/quests';

const DAY = 86400_000;
const SUSPEND: Record<string, { label: string; ms: number | null }> = {
  '1j': { label: '1 jour', ms: DAY }, '7j': { label: '7 jours', ms: 7 * DAY }, '30j': { label: '30 jours', ms: 30 * DAY }, def: { label: 'définitive', ms: null },
};

export interface PmModCtx {
  store: Store;
  isAdmin: (u: UserRow | undefined) => boolean;
  userFromToken: (t: unknown) => UserRow | undefined;
  now: () => number;
  ban: (u: UserRow, reason: string, until: number | null, by: string) => void;
  banOf: (userId: string) => { until: number | null; reason: string } | undefined;
  log: (by: string, action: string, target: UserRow | null, details: string) => void;
  notifyAdmins: (title: string, body: string) => void;
  /** Purge automatique périodique (désactivée par 0, par exemple dans les tests). */
  purgeEveryMs?: number;
}

export function createPmMod(c: PmModCtx) {
  const { store } = c;
  const db = store.sqlite;
  // S'assure que les tables de modération existent (création paresseuse dans db.ts).
  store.modPendingCount();
  db.exec(`
    -- Catégories à risque repérées dans un message (servent au score de la semaine).
    CREATE TABLE IF NOT EXISTS pm_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, msg_id INTEGER NOT NULL, pair TEXT NOT NULL, from_id TEXT NOT NULL, cats TEXT NOT NULL, at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pm_signals_pair ON pm_signals(pair, at);
    -- Conversations à vérifier (une alerte par conversation et par jour au plus).
    CREATE TABLE IF NOT EXISTS pm_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pair TEXT NOT NULL, a_id TEXT NOT NULL, b_id TEXT NOT NULL, day TEXT NOT NULL,
      cats TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ouvert', handled_by TEXT, handled_at INTEGER, note TEXT,
      UNIQUE (pair, day)
    );
    CREATE INDEX IF NOT EXISTS idx_pm_alerts_status ON pm_alerts(status, created_at DESC);
    -- Messages supprimés par l'équipe : retirés de la conversation des joueurs, gardés ici (purgés à 12 mois).
    CREATE TABLE IF NOT EXISTS pm_removed (
      id INTEGER PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL,
      removed_by TEXT NOT NULL, removed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pm_removed_pair ON pm_removed(from_id, to_id);
    -- Échanges fermés par l'équipe entre deux comptes.
    CREATE TABLE IF NOT EXISTS pm_pair_blocks (pair TEXT PRIMARY KEY, by_name TEXT NOT NULL, at INTEGER NOT NULL);
  `);

  const pairBlocked = (a: string, b: string) => !!db.prepare('SELECT 1 FROM pm_pair_blocks WHERE pair = ?').get(pairKey(a, b));
  const openAlertsOf = (pair: string) => db.prepare(`SELECT * FROM pm_alerts WHERE pair = ? AND status = 'ouvert' ORDER BY created_at DESC`).all(pair) as unknown as AlertRow[];
  /** Signalements de conversation privée encore ouverts entre ces deux comptes (dans un sens ou l'autre). */
  const openReportsOf = (a: string, b: string) => db.prepare(`SELECT id, reporter_name, target_name, reason, comment, created_at, msg_ref FROM mod_reports
    WHERE status = 'ouvert' AND msg_place = 'prive' AND ((reporter_id = ? AND target_id = ?) OR (reporter_id = ? AND target_id = ?)) ORDER BY created_at DESC`)
    .all(a, b, b, a) as unknown as { id: number; reporter_name: string; target_name: string; reason: string; comment: string; created_at: number; msg_ref: string }[];
  /** Conversation « suivie » : signalement ou alerte non traités (accès des modérateurs, purge suspendue). */
  const watched = (a: string, b: string) => openAlertsOf(pairKey(a, b)).length > 0 || openReportsOf(a, b).length > 0;

  // --- Repérage à l'envoi ------------------------------------------------------------------------
  let pushes: number[] = [];
  const pushAdmins = (title: string, body: string) => {
    const t = c.now();
    pushes = pushes.filter((x) => t - x < 3600_000);
    if (pushes.length >= 30) return;
    pushes.push(t);
    try { c.notifyAdmins(title, body); } catch { /* jamais bloquant */ }
  };

  /** Appelé après chaque message privé enregistré. Ne bloque jamais le message. */
  function afterSend(m: PmRow) {
    try {
      const cats = scanMessage(m.text);
      if (!cats.length) return null;
      const pair = pairKey(m.from_id, m.to_id), t = c.now();
      db.prepare('INSERT INTO pm_signals (msg_id, pair, from_id, cats, at) VALUES (?, ?, ?, ?, ?)').run(m.id, pair, m.from_id, cats.join(','), t);
      const rows = db.prepare('SELECT cats FROM pm_signals WHERE pair = ? AND at >= ?').all(pair, t - ALERT_WINDOW_MS) as { cats: string }[];
      const { score, cats: all } = conversationScore(rows.map((r) => r.cats.split(',') as RiskCat[]));
      if (score < ALERT_THRESHOLD) return null;
      const day = today(new Date(t));
      const [a, b] = pair.split('|');
      const ins = db.prepare(`INSERT OR IGNORE INTO pm_alerts (pair, a_id, b_id, day, cats, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(pair, a, b, day, all.join(','), score, t);
      if (!Number(ins.changes)) {
        // Déjà alertée aujourd'hui : on tient le score et les catégories à jour, sans nouvelle alerte.
        db.prepare(`UPDATE pm_alerts SET cats = ?, score = MAX(score, ?) WHERE pair = ? AND day = ?`).run(all.join(','), score, pair, day);
        return null;
      }
      const ua = store.userById(a), ub = store.userById(b);
      pushAdmins('Conversation privée à vérifier', `${ua?.username ?? '?'} ↔ ${ub?.username ?? '?'} : ${all.map(riskLabel).join(', ')}`);
      return { score, cats: all };
    } catch (e) { console.warn('[pm-mod]', e); return null; }
  }

  // --- Purge --------------------------------------------------------------------------------------
  /** Efface les vieux messages (12 mois), sauf conversations liées à un signalement ou une alerte non traités. */
  function purge(at = c.now()) {
    const limit = at - PM_RETENTION_DAYS * DAY;
    const old = db.prepare('SELECT DISTINCT from_id, to_id FROM private_messages WHERE created_at < ?').all(limit) as { from_id: string; to_id: string }[];
    const keep = new Set<string>();
    for (const r of old) { const p = pairKey(r.from_id, r.to_id); if (!keep.has(p) && watched(r.from_id, r.to_id)) keep.add(p); }
    let removed = 0;
    const del = db.prepare('DELETE FROM private_messages WHERE from_id = ? AND to_id = ? AND created_at < ?');
    const delRemoved = db.prepare('DELETE FROM pm_removed WHERE from_id = ? AND to_id = ? AND removed_at < ?');
    for (const r of old) {
      if (keep.has(pairKey(r.from_id, r.to_id))) continue;
      removed += Number(del.run(r.from_id, r.to_id, limit).changes);
    }
    const oldRemoved = db.prepare('SELECT DISTINCT from_id, to_id FROM pm_removed WHERE removed_at < ?').all(limit) as { from_id: string; to_id: string }[];
    for (const r of oldRemoved) if (!keep.has(pairKey(r.from_id, r.to_id))) delRemoved.run(r.from_id, r.to_id, limit);
    db.prepare('DELETE FROM pm_signals WHERE at < ?').run(at - SIGNAL_RETENTION_DAYS * DAY);
    db.prepare(`DELETE FROM pm_alerts WHERE status = 'traite' AND handled_at < ?`).run(limit);
    // Copies figées des signalements de messages privés traités depuis plus de 12 mois : texte effacé.
    const wiped = Number(db.prepare(`UPDATE mod_reports SET msg_text = '[effacé après 12 mois]', msg_context = NULL, comment = ''
      WHERE msg_place = 'prive' AND status = 'traite' AND decided_at < ? AND msg_context IS NOT NULL`).run(limit).changes);
    return { removed, kept: keep.size, wiped };
  }
  const every = c.purgeEveryMs ?? 6 * 3600_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  if (every > 0) {
    setTimeout(() => { try { purge(); } catch (e) { console.warn('[pm-mod purge]', e); } }, 30_000).unref?.();
    timer = setInterval(() => { try { purge(); } catch (e) { console.warn('[pm-mod purge]', e); } }, every);
    timer.unref?.();
  }

  // --- Routes ------------------------------------------------------------------------------------
  const router = express.Router();
  const json = express.json({ limit: '8kb' });
  const fail = (res: Response, status: number, error: string) => { res.status(status).json({ ok: false, error }); };
  const userOf = (req: Request) => {
    const h = req.headers.authorization ?? '';
    return c.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  };
  const isMod = (u: UserRow | undefined) => !!u && store.isModerator(u.id);
  const names = (...us: UserRow[]) => Object.fromEntries(us.map((u) => [u.id, u.username])) as Record<string, string>;

  /** Signalement d'une conversation par un joueur. */
  router.post('/pm-mod/report', json, (req, res) => {
    const me = userOf(req);
    if (!me) return fail(res, 401, 'Créez un compte (gratuit) pour signaler un joueur.');
    const reason = req.body?.reason;
    if (!isPmReportReason(reason)) return fail(res, 400, 'Choisissez la raison du signalement.');
    const target = typeof req.body?.username === 'string' ? store.userByName(req.body.username.trim()) : undefined;
    if (!target) return fail(res, 404, 'Joueur introuvable.');
    if (target.id === me.id) return fail(res, 400, 'Vous ne pouvez pas vous signaler vous-même.');
    const rows = store.pmThread(me.id, target.id, PM_REPORT_SNAPSHOT);
    if (!rows.length) return fail(res, 400, 'Aucun message dans cette conversation.');
    const comment = String(req.body?.comment ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, REPORT_COMMENT_MAX);
    const block = req.body?.block === true;
    const dup = db.prepare(`SELECT 1 FROM mod_reports WHERE reporter_id = ? AND target_id = ? AND status = 'ouvert' AND msg_ref LIKE 'conv:%'`).get(me.id, target.id);
    if (dup) {
      if (block) store.block(me.id, target.id);
      return fail(res, 409, 'Vous avez déjà signalé cette conversation : l’équipe de modération va l’examiner.');
    }
    if (store.modReportsSince(me.id, c.now() - 3600_000) >= REPORTS_PER_HOUR) return fail(res, 429, 'Vous avez envoyé beaucoup de signalements : réessayez dans une heure.');
    const n = names(me, target);
    const last = [...rows].reverse().find((m) => m.from_id === target.id);
    const context = rows.filter((m) => m !== last).map((m) => ({ author: n[m.from_id] ?? '?', text: m.text, at: m.created_at }));
    const id = store.modAddReport({
      reporter_id: me.id, reporter_name: me.username, target_id: target.id, target_name: target.username,
      kind: 'message', reason, comment, created_at: c.now(),
      msg_ref: `conv:${pairKey(me.id, target.id)}:${rows[rows.length - 1].id}`, msg_place: 'prive',
      msg_where: `Conversation privée entre ${me.username} et ${target.username} (${rows.length} derniers messages figés)`,
      msg_text: last?.text ?? '(aucun message de ce joueur)', msg_at: last?.created_at ?? rows[rows.length - 1].created_at,
      msg_context: JSON.stringify(context),
    });
    if (block) store.block(me.id, target.id);
    pushAdmins(reason === 'mineur' ? '⚠ Signalement : mineur' : 'Signalement d’une conversation privée',
      `${me.username} signale ${target.username} (${riskReasonLabel(reason)})${comment ? ` : ${comment.slice(0, 80)}` : ''}`);
    res.json({ ok: true, id, blocked: block });
  });

  // --- Équipe : admins (tout) et modérateurs (conversations suivies) -------------------------------
  const staff = express.Router();
  staff.use(json, (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const u = userOf(req);
    if (!(c.isAdmin(u) || isMod(u))) return fail(res, 403, 'Accès réservé à l’équipe de modération.');
    (req as Request & { staff: UserRow }).staff = u!;
    next();
  });
  const staffOf = (req: Request) => (req as Request & { staff: UserRow }).staff;
  const adminOnly = (req: Request, res: Response) => { if (c.isAdmin(staffOf(req))) return true; fail(res, 403, 'Réservé aux administrateurs.'); return false; };
  const findUser = (k: unknown) => (typeof k === 'string' && k ? store.userById(k) ?? store.userByName(k.trim()) : undefined);
  /** Les deux comptes d'une conversation, et le droit d'y accéder. */
  function pairOf(req: Request, res: Response): [UserRow, UserRow] | null {
    const a = findUser(req.body?.a ?? req.query.a), b = findUser(req.body?.b ?? req.query.b);
    if (!a || !b || a.id === b.id) { fail(res, 404, 'Conversation introuvable.'); return null; }
    if (!c.isAdmin(staffOf(req)) && !watched(a.id, b.id)) { fail(res, 403, 'Les modérateurs ne voient que les conversations signalées ou alertées, encore à traiter.'); return null; }
    return [a, b];
  }
  const statusOf = (u: UserRow) => {
    const b = c.banOf(u.id);
    return { id: u.id, username: u.username, createdAt: u.created_at, admin: c.isAdmin(u), moderator: isMod(u), ban: b ? { until: b.until, reason: b.reason } : null };
  };

  /** File « À vérifier » : alertes automatiques et signalements de conversations privées non traités. */
  staff.get('/queue', (_req, res) => {
    const alerts = (db.prepare(`SELECT * FROM pm_alerts WHERE status = 'ouvert' ORDER BY created_at DESC LIMIT 200`).all() as unknown as AlertRow[]).map((r) => ({
      id: r.id, a: store.userById(r.a_id)?.username ?? '?', b: store.userById(r.b_id)?.username ?? '?', aId: r.a_id, bId: r.b_id,
      day: r.day, at: r.created_at, score: r.score, cats: r.cats.split(',').map((x) => ({ id: x, label: riskLabel(x) })),
    }));
    const reports = (db.prepare(`SELECT id, reporter_id, reporter_name, target_id, target_name, reason, comment, created_at, msg_ref FROM mod_reports
      WHERE status = 'ouvert' AND msg_place = 'prive' ORDER BY created_at DESC LIMIT 200`).all() as unknown as
      { id: number; reporter_id: string; reporter_name: string; target_id: string; target_name: string; reason: string; comment: string; created_at: number; msg_ref: string }[])
      .map((r) => ({ id: r.id, reporter: r.reporter_name, target: r.target_name, reporterId: r.reporter_id, targetId: r.target_id, reason: riskReasonLabel(r.reason), comment: r.comment, at: r.created_at, whole: r.msg_ref.startsWith('conv:') }));
    res.json({ ok: true, alerts, reports });
  });

  /** Recherche d'un compte par pseudo (administrateurs). */
  staff.get('/search', (req, res) => {
    if (!adminOnly(req, res)) return;
    const q = String(req.query.q ?? '').trim().slice(0, 40);
    if (q.length < 2) return res.json({ ok: true, users: [] });
    const rows = db.prepare(`SELECT u.id, u.username,
        (SELECT COUNT(*) FROM private_messages p WHERE p.from_id = u.id OR p.to_id = u.id) AS n
      FROM users u WHERE u.username LIKE ? ESCAPE '\\' ORDER BY (lower(u.username) = lower(?)) DESC, n DESC, u.username LIMIT 30`)
      .all(`%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`, q) as { id: string; username: string; n: number }[];
    res.json({ ok: true, users: rows.map((r) => ({ id: r.id, username: r.username, messages: r.n })) });
  });

  /** Conversations d'un compte (sans le contenu ; administrateurs). */
  staff.get('/user/:name', (req, res) => {
    if (!adminOnly(req, res)) return;
    const u = findUser(String(req.params.name));
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    const rows = db.prepare(`SELECT other, COUNT(*) AS n, MAX(created_at) AS last, MIN(created_at) AS first FROM (
        SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS other, created_at FROM private_messages WHERE from_id = ? OR to_id = ?
      ) GROUP BY other ORDER BY last DESC LIMIT 300`).all(u.id, u.id, u.id) as { other: string; n: number; last: number; first: number }[];
    const conversations = rows.flatMap((r) => {
      const o = store.userById(r.other);
      if (!o) return [];
      const p = pairKey(u.id, o.id);
      return [{ username: o.username, id: o.id, messages: r.n, first: r.first, last: r.last, alerts: openAlertsOf(p).length, reports: openReportsOf(u.id, o.id).length, closed: pairBlocked(u.id, o.id) }];
    });
    c.log(staffOf(req).username, 'mp-liste', null, `Liste des conversations privées de ${u.username} (sans contenu)`);
    res.json({ ok: true, user: statusOf(u), conversations });
  });

  /** Lecture d'une conversation complète : motif obligatoire, inscrite au journal. */
  staff.post('/conversation', (req, res) => {
    const motive = READ_MOTIVES.find((m) => m.id === req.body?.motive);
    if (!motive) return fail(res, 400, 'Choisissez le motif de la lecture.');
    const detail = String(req.body?.detail ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
    if (motive.id === 'autre' && detail.length < 3) return fail(res, 400, 'Précisez le motif.');
    const pair = pairOf(req, res);
    if (!pair) return;
    const [a, b] = pair;
    const me = staffOf(req);
    c.log(me.username, 'mp-lecture', null, `Lecture de la conversation privée ${a.username} ↔ ${b.username} — motif : ${motive.label}${detail ? ` (${detail})` : ''}`);
    const n = names(a, b);
    const live = db.prepare(`SELECT * FROM private_messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id`).all(a.id, b.id, b.id, a.id) as unknown as PmRow[];
    const gone = db.prepare(`SELECT * FROM pm_removed WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`).all(a.id, b.id, b.id, a.id) as unknown as
      { id: number; from_id: string; to_id: string; text: string; created_at: number; removed_by: string; removed_at: number }[];
    const sig = new Map((db.prepare('SELECT msg_id, cats FROM pm_signals WHERE pair = ?').all(pairKey(a.id, b.id)) as { msg_id: number; cats: string }[]).map((r) => [r.msg_id, r.cats.split(',')]));
    const messages = [
      ...live.map((m) => ({ id: m.id, from: n[m.from_id], text: m.text, at: m.created_at, readAt: m.read_at, removed: null as null | { by: string; at: number } })),
      ...gone.map((m) => ({ id: m.id, from: n[m.from_id], text: m.text, at: m.created_at, readAt: null, removed: { by: m.removed_by, at: m.removed_at } })),
    ].sort((x, y) => x.id - y.id).map((m) => ({ ...m, cats: (sig.get(m.id) ?? []).map((x) => ({ id: x, label: riskLabel(x) })) }));
    res.json({
      ok: true, a: statusOf(a), b: statusOf(b), messages, closed: pairBlocked(a.id, b.id),
      alerts: openAlertsOf(pairKey(a.id, b.id)).map((r) => ({ id: r.id, day: r.day, score: r.score, cats: r.cats.split(',').map(riskLabel) })),
      reports: openReportsOf(a.id, b.id).map((r) => ({ id: r.id, reporter: r.reporter_name, target: r.target_name, reason: riskReasonLabel(r.reason), comment: r.comment, at: r.created_at })),
      retentionDays: PM_RETENTION_DAYS,
    });
  });

  /** Supprime un message (retiré chez les joueurs, gardé barré pour l'équipe). */
  staff.post('/messages/:id/delete', (req, res) => {
    const m = store.pmById(Number(req.params.id));
    if (!m) return fail(res, 404, 'Message introuvable.');
    req.body = { ...(req.body ?? {}), a: m.from_id, b: m.to_id };
    const pair = pairOf(req, res);
    if (!pair) return;
    const me = staffOf(req);
    store.tx(() => {
      db.prepare('INSERT OR REPLACE INTO pm_removed (id, from_id, to_id, text, created_at, removed_by, removed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(m.id, m.from_id, m.to_id, m.text, m.created_at, me.username, c.now());
      db.prepare('DELETE FROM private_messages WHERE id = ?').run(m.id);
    });
    const [from, to] = m.from_id === pair[0].id ? pair : [pair[1], pair[0]];
    c.log(me.username, 'mp-suppression', null, `Message privé supprimé (${from.username} → ${to.username}, n° ${m.id})`);
    res.json({ ok: true });
  });

  /** Ferme (ou rouvre) l'échange entre deux comptes. */
  staff.post('/pair/block', (req, res) => {
    const pair = pairOf(req, res);
    if (!pair) return;
    const [a, b] = pair, me = staffOf(req), on = req.body?.block !== false;
    if (on) db.prepare('INSERT OR REPLACE INTO pm_pair_blocks (pair, by_name, at) VALUES (?, ?, ?)').run(pairKey(a.id, b.id), me.username, c.now());
    else db.prepare('DELETE FROM pm_pair_blocks WHERE pair = ?').run(pairKey(a.id, b.id));
    c.log(me.username, on ? 'mp-fermeture' : 'mp-reouverture', null, `${on ? 'Échange fermé' : 'Échange rouvert'} entre ${a.username} et ${b.username}`);
    res.json({ ok: true, closed: on });
  });

  /** Suspend l'un des deux comptes depuis la conversation. */
  staff.post('/suspend', (req, res) => {
    const pair = pairOf(req, res);
    if (!pair) return;
    const me = staffOf(req);
    const target = findUser(req.body?.user);
    if (!target || !pair.some((u) => u.id === target.id)) return fail(res, 400, 'Choisissez l’un des deux comptes.');
    const d = SUSPEND[String(req.body?.duration)];
    if (!d) return fail(res, 400, 'Choisissez une durée.');
    if (c.isAdmin(target)) return fail(res, 403, 'Un compte administrateur ne peut pas être sanctionné.');
    if (isMod(target) && !c.isAdmin(me)) return fail(res, 403, 'Un modérateur ne peut pas sanctionner un autre modérateur.');
    if (target.id === me.id) return fail(res, 403, 'Vous ne pouvez pas vous sanctionner vous-même.');
    const reason = String(req.body?.reason ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) || 'Comportement inquiétant en messages privés';
    const t = c.now(), until = d.ms == null ? null : t + d.ms;
    store.modAddSanction({ userId: target.id, kind: d.ms == null ? 'bannissement' : 'suspension', reason, until, by: me.username, at: t, note: 'depuis les messages privés' });
    c.ban(target, reason, until, me.username);
    const other = pair.find((u) => u.id !== target.id)!;
    c.log(me.username, 'mod-suspension', target, `Suspension ${d.label} depuis la conversation privée avec ${other.username} — ${reason}`);
    res.json({ ok: true });
  });

  /** Marque la conversation traitée : alertes et signalements de conversation ouverts sont clos. */
  staff.post('/handled', (req, res) => {
    const pair = pairOf(req, res);
    if (!pair) return;
    const [a, b] = pair, me = staffOf(req), t = c.now();
    const note = String(req.body?.note ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
    const al = Number(db.prepare(`UPDATE pm_alerts SET status = 'traite', handled_by = ?, handled_at = ?, note = ? WHERE pair = ? AND status = 'ouvert'`)
      .run(me.username, t, note, pairKey(a.id, b.id)).changes);
    const reps = openReportsOf(a.id, b.id).map((r) => r.id);
    store.modDecide(reps, { decision: 'classer', duration: null, by: me.username, at: t, note: note || 'Traité depuis la conversation privée', sanctionId: null });
    c.log(me.username, 'mp-traite', null, `Conversation ${a.username} ↔ ${b.username} marquée traitée (${al} alerte${al > 1 ? 's' : ''}, ${reps.length} signalement${reps.length > 1 ? 's' : ''})${note ? ` — ${note}` : ''}`);
    res.json({ ok: true, alerts: al, reports: reps.length });
  });

  router.use('/pm-mod', staff);
  const close = () => { if (timer) clearInterval(timer); };
  return { router, afterSend, pairBlocked, purge, close };
}

interface AlertRow { id: number; pair: string; a_id: string; b_id: string; day: string; cats: string; score: number; created_at: number; status: string }

const riskReasonLabel = (id: string) => (id === 'autre_mp' ? 'Autre (conversation)' : reasonLabel(id));
