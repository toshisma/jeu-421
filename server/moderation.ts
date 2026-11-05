/**
 * Modération : signalements des joueurs et de leurs messages, panel des admins et modérateurs,
 * sanctions (avertissement, muet, suspension, bannissement) et avis aux joueurs.
 *
 *  - Le serveur fait foi : pour un message, le client n'envoie qu'un identifiant ; le serveur
 *    retrouve le message, vérifie que celui qui signale pouvait le voir, et fige une copie du
 *    texte, de l'auteur, du lieu, de l'heure et des quelques messages qui le précèdent.
 *  - Comptes seulement ; pas de doublon ; au plus REPORTS_PER_HOUR signalements par heure.
 *  - Modérateurs (nommés par un admin, gardés en base) : panel et sanctions, rien d'autre.
 *    Personne ne sanctionne un admin ; un modérateur ne sanctionne pas un autre modérateur.
 *  - Sanction prise : ceux qui ont signalé reçoivent un remerciement (sans détail), le joueur
 *    sanctionné un avis avec la raison et l'échéance.
 */
import express, { type Request, type Response } from 'express';
import type { ModReportRow, Store, UserRow } from './db';
import {
  DURATIONS, PLACE_LABEL, REPORTS_PER_HOUR, REPORT_COMMENT_MAX, REPORT_CONTEXT, THANKS_TEXT,
  brusselsDateTime, decisionLabel, isReportReason, reasonLabel, type Decision, type MessagePlace,
} from '../shared/moderation';

/** Message de tchat de table gardé en mémoire (les tables ne sont pas en base). */
export interface TableChatEntry {
  id: string; code: string; where: string; userId: string | null; name: string; text: string; at: number;
  /** Comptes présents à la table au moment du message (seuls eux peuvent le signaler). */
  audience: string[];
}

interface Ctx {
  store: Store;
  isAdmin: (u: UserRow | undefined) => boolean;
  userFromToken: (t: unknown) => UserRow | undefined;
  now: () => number;
  push: (userId: string, title: string, body: string, url?: string) => void;
  ban: (u: UserRow, reason: string, until: number | null, by: string) => void;
  unban: (userId: string) => boolean;
  banOf: (userId: string) => { until: number | null; reason: string } | undefined;
  log: (by: string, action: string, target: UserRow | null, details: string) => void;
  /** Tchat de table : message et ceux qui le précèdent sur la même table. */
  tableMessage: (id: string) => { msg: TableChatEntry; before: TableChatEntry[] } | undefined;
}

type Frozen = { author: string; text: string; at: number; reported?: boolean };

export function createModeration(c: Ctx) {
  const { store } = c;
  const router = express.Router();
  const json = express.json({ limit: '8kb' });
  const fail = (res: Response, status: number, error: string) => { res.status(status).json({ ok: false, error }); };
  const userOf = (req: Request) => {
    const h = req.headers.authorization ?? '';
    return c.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  };
  const isMod = (u: UserRow | undefined) => !!u && store.isModerator(u.id);
  const isStaff = (u: UserRow | undefined) => c.isAdmin(u) || isMod(u);
  const muteOf = (userId: string) => store.modMuteOf(userId, c.now());

  // --- Rôle -----------------------------------------------------------------------------------
  router.get('/moderation/whoami', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const u = userOf(req);
    const admin = c.isAdmin(u), moderator = isMod(u);
    res.json({ ok: true, admin, moderator, pending: admin || moderator ? store.modPendingCount() : 0 });
  });

  // --- Signaler -------------------------------------------------------------------------------
  /** Retrouve et fige un message signalé ; erreur (texte) si impossible. */
  function freeze(me: UserRow, place: MessagePlace, rawId: unknown):
    { author: UserRow; ref: string; where: string; text: string; at: number; context: Frozen[] } | string {
    if (place === 'prive') {
      const id = Number(rawId);
      const m = Number.isInteger(id) ? store.pmById(id) : undefined;
      if (!m || (m.from_id !== me.id && m.to_id !== me.id)) return 'Message introuvable.';
      if (m.from_id === me.id) return 'Vous ne pouvez pas signaler votre propre message.';
      const author = store.userById(m.from_id);
      if (!author) return 'Ce joueur n’existe plus.';
      const names: Record<string, string> = { [me.id]: me.username, [author.id]: author.username };
      const context = store.pmThread(me.id, author.id, REPORT_CONTEXT, m.id).map((x) => ({ author: names[x.from_id] ?? '?', text: x.text, at: x.created_at }));
      return { author, ref: `prive:${m.id}`, where: `Message privé de ${author.username} à ${me.username}`, text: m.text, at: m.created_at, context };
    }
    if (place === 'club') {
      const id = Number(rawId);
      const m = Number.isInteger(id) ? store.clubChatById(id) : undefined;
      const mine = store.clubOf(me.id);
      if (!m || !mine || mine.id !== m.club_id) return 'Message introuvable.';
      if (m.user_id === me.id) return 'Vous ne pouvez pas signaler votre propre message.';
      const author = store.userById(m.user_id);
      if (!author) return 'Ce joueur n’existe plus.';
      const context = store.clubChatBefore(m.club_id, m.id, REPORT_CONTEXT).map((x) => ({ author: x.username, text: x.phrase, at: x.created_at }));
      return { author, ref: `club:${m.id}`, where: `Club « ${mine.name} »`, text: m.phrase, at: m.created_at, context };
    }
    const found = typeof rawId === 'string' && rawId.length <= 40 ? c.tableMessage(rawId) : undefined;
    if (!found || !found.msg.audience.includes(me.id)) return 'Message introuvable (il est peut-être trop ancien).';
    const { msg, before } = found;
    if (msg.userId === me.id) return 'Vous ne pouvez pas signaler votre propre message.';
    if (!msg.userId) return 'Ce message vient d’un invité sans compte : il ne peut pas être signalé. Vous pouvez couper le tchat de la table.';
    const author = store.userById(msg.userId);
    if (!author) return 'Ce joueur n’existe plus.';
    return { author, ref: `table:${msg.id}`, where: msg.where, text: msg.text, at: msg.at, context: before.map((x) => ({ author: x.name, text: x.text, at: x.at })) };
  }

  router.post('/moderation/report', json, (req, res) => {
    const me = userOf(req);
    if (!me) return fail(res, 401, 'Créez un compte (gratuit) pour signaler un joueur.');
    const reason = req.body?.reason;
    if (!isReportReason(reason)) return fail(res, 400, 'Choisissez la raison du signalement.');
    const comment = String(req.body?.comment ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, REPORT_COMMENT_MAX);
    const m = req.body?.message;
    let target: UserRow | undefined;
    let frozen: Exclude<ReturnType<typeof freeze>, string> | null = null;
    if (m && typeof m === 'object') {
      const place = m.place as MessagePlace;
      if (!(place in PLACE_LABEL)) return fail(res, 400, 'Message introuvable.');
      const f = freeze(me, place, m.id);
      if (typeof f === 'string') return fail(res, 400, f);
      frozen = f; target = f.author;
    } else {
      target = typeof req.body?.username === 'string' ? store.userByName(req.body.username.trim()) : undefined;
      if (!target) return fail(res, 404, 'Joueur introuvable.');
    }
    if (target.id === me.id) return fail(res, 400, 'Vous ne pouvez pas vous signaler vous-même.');
    if (store.modDuplicate(me.id, target.id, frozen?.ref ?? null)) {
      return fail(res, 409, frozen ? 'Vous avez déjà signalé ce message.' : 'Vous avez déjà signalé ce joueur : l’équipe de modération va examiner votre signalement.');
    }
    if (store.modReportsSince(me.id, c.now() - 3600_000) >= REPORTS_PER_HOUR) return fail(res, 429, 'Vous avez envoyé beaucoup de signalements : réessayez dans une heure.');
    // Photo de profil : l'ancien compteur (masquage automatique à 3 signalements) continue de servir.
    if (!frozen && reason === 'profil') store.report(me.id, target.id, 'photo');
    store.modAddReport({
      reporter_id: me.id, reporter_name: me.username, target_id: target.id, target_name: target.username,
      kind: frozen ? 'message' : 'joueur', reason, comment, created_at: c.now(),
      msg_ref: frozen?.ref ?? null, msg_place: frozen ? (m.place as string) : null, msg_where: frozen?.where ?? null,
      msg_text: frozen?.text ?? null, msg_at: frozen?.at ?? null, msg_context: frozen ? JSON.stringify(frozen.context) : null,
    });
    res.json({ ok: true });
  });

  // --- Panel (admins et modérateurs, vérifiés à chaque appel) ---------------------------------
  const staff = express.Router();
  staff.use(json, (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const u = userOf(req);
    if (!isStaff(u)) return fail(res, 403, 'Accès réservé à l’équipe de modération.');
    (req as Request & { staff: UserRow }).staff = u!;
    next();
  });
  const staffOf = (req: Request) => (req as Request & { staff: UserRow }).staff;
  const role = (u: UserRow) => (c.isAdmin(u) ? 'admin' : isMod(u) ? 'moderateur' : null);

  /** État actuel d'un joueur : suspendu, muet. */
  const statusOf = (userId: string) => {
    const b = c.banOf(userId), mu = muteOf(userId);
    return { ban: b ? { until: b.until, reason: b.reason } : null, mute: mu ? { id: mu.id, until: mu.until, reason: mu.reason } : null };
  };
  const view = (r: ModReportRow) => ({
    id: r.id, reporter: r.reporter_name, target: r.target_name, targetId: r.target_id, kind: r.kind,
    reason: r.reason, reasonLabel: reasonLabel(r.reason), comment: r.comment, at: r.created_at,
    message: r.kind === 'message' ? {
      place: r.msg_place, placeLabel: PLACE_LABEL[r.msg_place as MessagePlace] ?? '', where: r.msg_where, text: r.msg_text, at: r.msg_at,
      context: r.msg_context ? JSON.parse(r.msg_context) as Frozen[] : [],
    } : null,
    status: r.status, decision: r.decision, decisionLabel: r.decision ? decisionLabel(r.decision) : null, duration: r.duration,
    decidedBy: r.decided_by, decidedAt: r.decided_at, note: r.note,
  });

  staff.get('/reports', (req, res) => {
    const s = String(req.query.status ?? 'ouvert');
    const status = s === 'traite' || s === 'tous' ? s : 'ouvert';
    const rows = store.modReports(status);
    // Antécédents de chaque joueur signalé (une seule fois par joueur).
    const targets: Record<string, unknown> = {};
    for (const r of rows) {
      if (targets[r.target_id]) continue;
      const u = store.userById(r.target_id);
      const all = store.modReportsOf(r.target_id);
      targets[r.target_id] = {
        username: u?.username ?? r.target_name, exists: !!u, role: u ? role(u) : null,
        reports: all.length, pending: all.filter((x) => x.status === 'ouvert').length,
        sanctions: store.modSanctionsOf(r.target_id).length, ...statusOf(r.target_id),
      };
    }
    res.json({ ok: true, reports: rows.map(view), targets, pending: store.modPendingCount() });
  });

  /** Fiche de modération d'un joueur : statut, sanctions précédentes, signalements reçus. */
  staff.get('/players/:name', (req, res) => {
    const k = String(req.params.name);
    const u = store.userById(k) ?? store.userByName(k);
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    res.json({
      ok: true, player: {
        id: u.id, username: u.username, createdAt: u.created_at, role: role(u), ...statusOf(u.id),
        sanctions: store.modSanctionsOf(u.id).map((s) => ({ id: s.id, kind: s.kind, label: decisionLabel(s.kind), reason: s.reason, until: s.until, by: s.by_name, at: s.at, note: s.note, liftedAt: s.lifted_at, liftedBy: s.lifted_by })),
        reports: store.modReportsOf(u.id).map(view),
      },
    });
  });

  staff.post('/reports/:id/decide', (req, res) => {
    const me = staffOf(req);
    const r = store.modReport(Number(req.params.id));
    if (!r) return fail(res, 404, 'Signalement introuvable.');
    if (r.status !== 'ouvert') return fail(res, 409, 'Ce signalement a déjà été traité.');
    const decision = req.body?.decision as Decision;
    if (!['classer', 'avertissement', 'muet', 'suspension', 'bannissement'].includes(decision)) return fail(res, 400, 'Décision inconnue.');
    const note = String(req.body?.note ?? '').trim().slice(0, 500);
    let duration: { id: string; label: string; ms: number } | null = null;
    if (decision === 'muet' || decision === 'suspension') {
      duration = DURATIONS[decision].find((d) => d.id === req.body?.duration) ?? null;
      if (!duration) return fail(res, 400, 'Choisissez une durée.');
    }
    const target = store.userById(r.target_id);
    if (decision !== 'classer') {
      if (!target) return fail(res, 404, 'Ce compte n’existe plus : classez le signalement.');
      if (c.isAdmin(target)) return fail(res, 403, 'Un compte administrateur ne peut pas être sanctionné.');
      if (isMod(target) && !c.isAdmin(me)) return fail(res, 403, 'Un modérateur ne peut pas sanctionner un autre modérateur.');
      if (target.id === me.id) return fail(res, 403, 'Vous ne pouvez pas vous sanctionner vous-même.');
    }
    // Tous les signalements en attente sur ce joueur (par défaut), ou seulement celui-ci.
    const reports = req.body?.all === false ? [r] : store.modPendingOf(r.target_id);
    const t = c.now();
    const why = reasonLabel(r.reason);
    let sanctionId: number | null = null;
    if (decision !== 'classer' && target) {
      const until = decision === 'bannissement' ? null : decision === 'avertissement' ? null : t + duration!.ms;
      sanctionId = store.modAddSanction({ userId: target.id, kind: decision, reason: why, until, by: me.username, at: t, note });
      if (decision === 'suspension' || decision === 'bannissement') c.ban(target, why, until, me.username);
      // Avis au joueur sanctionné.
      const text = decision === 'avertissement' ? `Avertissement de la modération : ${why}. Merci de respecter les autres joueurs, sinon des sanctions plus lourdes suivront.`
        : decision === 'muet' ? `Vous ne pouvez plus écrire (tchats et messages privés) jusqu’au ${brusselsDateTime(until!)}. Motif : ${why}.`
          : decision === 'suspension' ? `Votre compte a été suspendu jusqu’au ${brusselsDateTime(until!)}. Motif : ${why}.`
            : `Votre compte a été suspendu définitivement. Motif : ${why}.`;
      store.modNotify(target.id, decision, text, t);
      if (decision === 'avertissement' || decision === 'muet') c.push(target.id, 'Message de la modération', text, '/?notifs=1');
      // Remerciement à ceux qui ont signalé (sans détail sur la sanction).
      for (const rid of new Set(reports.map((x) => x.reporter_id))) {
        if (rid === target.id || rid === me.id || !store.userById(rid)) continue;
        store.modNotify(rid, 'merci', THANKS_TEXT, t);
        c.push(rid, 'Signalement traité', THANKS_TEXT, '/?notifs=1');
      }
    }
    store.modDecide(reports.map((x) => x.id), { decision, duration: duration?.id ?? null, by: me.username, at: t, note, sanctionId });
    c.log(me.username, `mod-${decision}`, target ?? null,
      `${decisionLabel(decision)}${duration ? ` (${duration.label})` : ''} — ${reports.length} signalement${reports.length > 1 ? 's' : ''} (${why})${note ? ` — note : ${note}` : ''}`);
    res.json({ ok: true, decided: reports.length, pending: store.modPendingCount() });
  });

  /** Lever un muet ou une suspension avant l'échéance. */
  staff.post('/sanctions/:id/lift', (req, res) => {
    const me = staffOf(req);
    const s = store.modSanction(Number(req.params.id));
    if (!s || s.lifted_at) return fail(res, 404, 'Sanction introuvable.');
    if (s.kind !== 'muet' && s.kind !== 'suspension' && s.kind !== 'bannissement') return fail(res, 400, 'Un avertissement ne se lève pas.');
    if (s.kind === 'bannissement' && !c.isAdmin(me)) return fail(res, 403, 'Seul un administrateur peut lever un bannissement définitif.');
    store.modLiftSanction(s.id, me.username, c.now());
    if (s.kind !== 'muet') c.unban(s.user_id);
    const u = store.userById(s.user_id);
    c.log(me.username, 'mod-levee', u ?? null, `${decisionLabel(s.kind)} levé${s.kind === 'suspension' ? 'e' : ''}`);
    res.json({ ok: true });
  });

  // --- Modérateurs (administrateurs seulement) ------------------------------------------------
  const adminOnly = (req: Request, res: Response) => { if (c.isAdmin(staffOf(req))) return true; fail(res, 403, 'Réservé aux administrateurs.'); return false; };
  staff.get('/moderators', (req, res) => {
    if (!adminOnly(req, res)) return;
    res.json({ ok: true, moderators: store.moderators().map((m) => ({ username: m.username, addedBy: m.added_by, at: m.at })) });
  });
  staff.post('/moderators', (req, res) => {
    if (!adminOnly(req, res)) return;
    const u = typeof req.body?.username === 'string' ? store.userByName(req.body.username.trim()) : undefined;
    if (!u) return fail(res, 404, 'Aucun joueur avec ce pseudo.');
    if (c.isAdmin(u)) return fail(res, 400, 'Ce joueur est déjà administrateur.');
    if (store.isModerator(u.id)) return fail(res, 409, 'Ce joueur est déjà modérateur.');
    store.addModerator(u.id, staffOf(req).username, c.now());
    store.modNotify(u.id, 'role', 'Vous faites maintenant partie de l’équipe de modération : le menu « Plus » contient l’entrée « Modération ».', c.now());
    c.log(staffOf(req).username, 'mod-nomme', u, 'nommé modérateur');
    res.json({ ok: true });
  });
  staff.delete('/moderators/:name', (req, res) => {
    if (!adminOnly(req, res)) return;
    const u = store.userByName(String(req.params.name));
    if (!u || !store.removeModerator(u.id)) return fail(res, 404, 'Ce joueur n’est pas modérateur.');
    c.log(staffOf(req).username, 'mod-retire', u, 'n’est plus modérateur');
    res.json({ ok: true });
  });

  router.use('/moderation', staff);
  return { router, muteOf, isStaff };
}
