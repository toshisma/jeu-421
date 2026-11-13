/**
 * Rappels par notification push : utiles et rares.
 *
 * Types (chacun désactivable dans les Réglages) :
 *  - bistrot : « X vous a dépassé dans votre bistrot » (au plus 1 par jour et par bistrot) ;
 *  - tournoi : « Le tournoi de 21 h commence dans 10 min » (inscrits, et ceux qui ont demandé « Me prévenir ») ;
 *  - serie : « Votre série de N jours vous attend » vers 19 h (série ≥ 3, rien joué ce jour-là),
 *            sinon, à défaut, le rappel du cadeau du jour (jamais les deux) ;
 *  - evenements : happy hour, Saint-Nicolas, réveillon, Nouvel An.
 * Règles communes : seulement les comptes qui ont accepté les notifications (abonnement push) ;
 * 2 rappels au plus par jour et par compte ; jamais entre 22 h et 9 h (Bruxelles) ; textes dans la
 * langue de chaque appareil ; jamais deux fois le même (marqueur en base `notif_sent`, qui survit
 * aux redémarrages). Les messages liés à une action d'un autre joueur (demande d'ami, défi…) ou à
 * une inscription payée (salon ouvert, remboursement) ne passent pas par ici et ne sont pas plafonnés.
 */
import type { NextFunction, Request, Response, Router } from 'express';
import type { Store, UserRow } from './db';
import { translate, type Lang, type MessageKey } from '../shared/i18n';
import { today } from '../shared/progress/quests';
import { dailyStatus } from '../shared/progress/profile';
import { serieView } from '../shared/progress/serie';
import { nextSlots } from '../shared/scheduled';

export const NOTIF_KINDS = ['bistrot', 'tournoi', 'serie', 'evenements'] as const;
export type NotifKind = (typeof NOTIF_KINDS)[number];
export const NOTIF_DAILY_CAP = 2;
/** Heures calmes (Bruxelles) : rien de 22 h à 9 h. */
export const QUIET_FROM = 22;
export const QUIET_TO = 9;
/** Rappel du tournoi : tant de minutes avant l'heure. */
export const TOURNEY_NOTICE_MIN = 10;
/** Rappel de la série : à partir de cette heure (Bruxelles). */
export const SERIE_HOUR = 19;
export const SERIE_MIN_DAYS = 3;

const isKind = (k: unknown): k is NotifKind => typeof k === 'string' && (NOTIF_KINDS as readonly string[]).includes(k);
const HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', hourCycle: 'h23' });
export const brusselsHourAt = (t: number) => Number(HOUR.format(new Date(t))) % 24;
export const quietAt = (t: number) => { const h = brusselsHourAt(t); return h >= QUIET_FROM || h < QUIET_TO; };

/** Texte d'un rappel : clés de la zone `ser.` (traduites pour chaque appareil), ou texte français du serveur. */
export type NotifText = { key: MessageKey; bodyKey: MessageKey; vars?: Record<string, string | number>; url?: string } | { title: string; body: string; url?: string };
export type Pusher = (userId: string, title: string, body: string, url?: string, localize?: (lang: Lang) => { title: string; body: string }) => void;

export interface NotifsDeps {
  store: Store;
  router: Router;
  auth: (req: Request, res: Response, next: NextFunction) => void;
  userOf: (req: Request) => UserRow;
  fail: (res: Response, status: number, error: string) => void;
  now: () => number;
  push: Pusher;
}

export type NotifResult = 'sent' | 'no-push' | 'off' | 'quiet' | 'already' | 'cap';

export function createNotifs(d: NotifsDeps) {
  const db = d.store.sqlite;
  db.exec(`
    CREATE TABLE IF NOT EXISTS notif_prefs (user_id TEXT NOT NULL, kind TEXT NOT NULL, off INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (user_id, kind));
    CREATE TABLE IF NOT EXISTS notif_sent (user_id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, kind, ref));
    CREATE INDEX IF NOT EXISTS idx_notif_sent_day ON notif_sent(user_id, day);
    CREATE TABLE IF NOT EXISTS sched_watch (user_id TEXT NOT NULL, slot_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, slot_id));
  `);
  const dayNow = () => today(new Date(d.now()));

  const prefs = (userId: string): Record<NotifKind, boolean> => {
    const off = new Set((db.prepare('SELECT kind FROM notif_prefs WHERE user_id = ? AND off = 1').all(userId) as { kind: string }[]).map((r) => r.kind));
    return Object.fromEntries(NOTIF_KINDS.map((k) => [k, !off.has(k)])) as Record<NotifKind, boolean>;
  };
  const setPref = (userId: string, kind: NotifKind, on: boolean) => {
    if (on) db.prepare('DELETE FROM notif_prefs WHERE user_id = ? AND kind = ?').run(userId, kind);
    else db.prepare('INSERT OR REPLACE INTO notif_prefs (user_id, kind, off) VALUES (?, ?, 1)').run(userId, kind);
  };
  const sentToday = (userId: string, day: string) => (db.prepare('SELECT COUNT(*) AS n FROM notif_sent WHERE user_id = ? AND day = ?').get(userId, day) as { n: number }).n;

  /**
   * Envoie un rappel si toutes les règles le permettent. Le marqueur est posé avant l'envoi, dans la
   * même opération synchrone que les vérifications : deux appels simultanés n'envoient qu'une fois.
   */
  function notify(userId: string, kind: NotifKind, ref: string, text: NotifText): NotifResult {
    if (!d.store.pushOf(userId).length) return 'no-push';
    if (!prefs(userId)[kind]) return 'off';
    const t = d.now();
    if (quietAt(t)) return 'quiet';
    if (db.prepare('SELECT 1 FROM notif_sent WHERE user_id = ? AND kind = ? AND ref = ?').get(userId, kind, ref)) return 'already';
    const day = dayNow();
    if (sentToday(userId, day) >= NOTIF_DAILY_CAP) return 'cap';
    const ins = db.prepare('INSERT OR IGNORE INTO notif_sent (user_id, kind, ref, day, at) VALUES (?, ?, ?, ?, ?)').run(userId, kind, ref, day, t);
    if (!Number(ins.changes)) return 'already';
    if ('key' in text) {
      const loc = (l: Lang) => ({ title: translate(l, text.key, text.vars), body: translate(l, text.bodyKey, text.vars) });
      const fr = loc('fr');
      d.push(userId, fr.title, fr.body, text.url ?? '/', loc);
    } else d.push(userId, text.title, text.body, text.url ?? '/');
    return 'sent';
  }

  // --- Bistrots ------------------------------------------------------------------------------------
  /** `by` vient de dépasser `userId` au classement de la semaine du bistrot. */
  function bistrotOvertaken(userId: string, by: string, bistrot: { id: string; name: string }) {
    return notify(userId, 'bistrot', `${bistrot.id}:${dayNow()}`, { key: 'ser.n.bistrotT', bodyKey: 'ser.n.bistrotB', vars: { name: by, bistrot: bistrot.name }, url: '/?bistrot-ouvrir=1' });
  }

  // --- Tournois programmés -------------------------------------------------------------------------
  const watchers = (slotId: string) => (db.prepare('SELECT user_id FROM sched_watch WHERE slot_id = ?').all(slotId) as { user_id: string }[]).map((r) => r.user_id);
  const watchedBy = (userId: string) => (db.prepare('SELECT slot_id FROM sched_watch WHERE user_id = ?').all(userId) as { slot_id: string }[]).map((r) => r.slot_id);
  /** Inscrits (payés) et curieux d'un rendez-vous, prévenus 10 minutes avant l'heure. */
  function tourneyTick(t: number) {
    for (const s of nextSlots(t, 2)) {
      const left = s.startsAt - t;
      if (left <= 0 || left > TOURNEY_NOTICE_MIN * 60_000) continue;
      const regs = (d.store.schedRegs(s.id, 'inscrit') as { user_id: string }[]).map((r) => r.user_id);
      for (const u of new Set([...regs, ...watchers(s.id)])) {
        notify(u, 'tournoi', `tournoi:${s.id}`, { key: 'ser.n.tourT', bodyKey: 'ser.n.tourB', vars: { h: s.hour, m: Math.ceil(left / 60_000) }, url: '/?tournois=1' });
      }
    }
    db.prepare('DELETE FROM sched_watch WHERE at < ?').run(t - 3 * 86400_000);
  }
  /** Le rappel des 10 minutes est-il déjà parti pour ce compte ? (le rappel « 5 minutes » des inscrits s'efface alors) */
  const tourneyWarned = (userId: string, slotId: string) => !!db.prepare('SELECT 1 FROM notif_sent WHERE user_id = ? AND kind = ? AND ref = ?').get(userId, 'tournoi', `tournoi:${slotId}`);

  // --- Série du soir -------------------------------------------------------------------------------
  /** Vers 19 h : série ≥ 3 jours sans partie aujourd'hui ; à défaut, le cadeau du jour (série de connexions). */
  function serieTick(t: number) {
    if (brusselsHourAt(t) < SERIE_HOUR) return;
    const day = dayNow();
    for (const id of d.store.pushUsers()) {
      const u = d.store.userById(id);
      if (!u) continue;
      const p = d.store.profileOf(u);
      const v = serieView(p.serie, day);
      if (v.status === 'pending' && v.count >= SERIE_MIN_DAYS) {
        notify(id, 'serie', `serie:${day}`, { key: 'ser.n.serieT', bodyKey: v.jokers ? 'ser.n.serieBJ' : 'ser.n.serieB', vars: { n: v.count, j: v.jokers } });
        continue;
      }
      const st = dailyStatus(p, day);
      if (st.canClaim && (p.daily?.count ?? 0) >= 2) notify(id, 'serie', `serie:${day}`, { key: 'ser.n.giftT', bodyKey: 'ser.n.giftB', vars: { n: st.cycleDay } });
    }
  }

  function tick() {
    const t = d.now();
    try { tourneyTick(t); } catch (e) { console.warn('[notifs] tournoi', e); }
    try { serieTick(t); } catch (e) { console.warn('[notifs] série', e); }
    db.prepare('DELETE FROM notif_sent WHERE at < ?').run(t - 30 * 86400_000);
  }
  const timer = process.env.VITEST ? null : setInterval(tick, 60_000);
  timer?.unref?.();

  // --- API ------------------------------------------------------------------------------------------
  d.router.get('/notifs/prefs', d.auth, (req, res) => {
    const me = d.userOf(req);
    const open = new Set(nextSlots(d.now(), 2).map((s) => s.id));
    res.json({ ok: true, prefs: prefs(me.id), push: d.store.pushOf(me.id).length > 0, watched: watchedBy(me.id).filter((s) => open.has(s)) });
  });
  d.router.post('/notifs/prefs', d.auth, (req, res) => {
    const me = d.userOf(req);
    if (!isKind(req.body?.kind)) return d.fail(res, 400, 'Réglage inconnu.');
    setPref(me.id, req.body.kind, !!req.body.on);
    res.json({ ok: true, prefs: prefs(me.id) });
  });
  /** « Me prévenir » : rappel 10 minutes avant un des deux prochains tournois programmés. */
  d.router.post('/notifs/tournoi', d.auth, (req, res) => {
    const me = d.userOf(req);
    const slot = nextSlots(d.now(), 2).find((s) => s.id === req.body?.slot && s.startsAt > d.now());
    if (!slot) return d.fail(res, 404, 'Ce tournoi n’est plus ouvert aux inscriptions.');
    if (req.body?.on === false) db.prepare('DELETE FROM sched_watch WHERE user_id = ? AND slot_id = ?').run(me.id, slot.id);
    else {
      db.prepare('INSERT OR IGNORE INTO sched_watch (user_id, slot_id, at) VALUES (?, ?, ?)').run(me.id, slot.id, d.now());
      if (!prefs(me.id).tournoi) setPref(me.id, 'tournoi', true); // demander un rappel, c'est le vouloir
    }
    res.json({ ok: true, watched: watchedBy(me.id) });
  });

  return { notify, prefs, setPref, bistrotOvertaken, tourneyTick, serieTick, tick, tourneyWarned, watchers, close: () => { if (timer) clearInterval(timer); } };
}
export type NotifsApi = ReturnType<typeof createNotifs>;
