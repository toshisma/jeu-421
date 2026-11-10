/**
 * Outils d'administration (comptes listés dans ADMIN_USERS, vérifiés côté serveur à chaque appel).
 *
 * - Commandes : suspendre / rétablir un compte, fiche d'un joueur, don ou retrait de pièces,
 *   d'objets du catalogue et de sacs de dés. Chaque commande est journalisée (qui, quoi, quand).
 * - Tableau de bord : vue d'ensemble, visiteurs (suivi anonyme), rétention, journal d'activité
 *   des joueurs, économie (pièces gagnées / dépensées par source).
 *
 * Suivi des visiteurs : aucun cookie, aucune adresse IP stockée. L'identifiant d'appareil tiré
 * au hasard par le jeu (localStorage) est haché avec un sel secret gardé en base ; sans lui, une
 * empreinte salée de l'adresse et du navigateur, qui change chaque jour.
 *
 * Journal et économie : les enregistrements de profil sont observés (avant / après) pour noter
 * achats, sacs ouverts, succès et mouvements de pièces, sans toucher aux règles du jeu.
 */
import { createHash, randomBytes } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Server, Socket } from 'socket.io';
import { toPublic, type Store, type UserRow } from './db';
import { brusselsDay, brusselsMidnight } from './stats';
import { CATEGORY_LABELS, ITEMS, getItem } from '../shared/progress/catalog';
import { FX, FX_KIND_LABEL, RARITY_LABEL, fxDef } from '../shared/progress/dice-collection';
import { ACHIEVEMENTS } from '../shared/progress/achievements';
import { BAGS_MAX, levelInfo, newProfile, sanitizeProfile, type Profile } from '../shared/progress/profile';
import { CF_CARD_LIST, cfAdminAdjust, cfAdminView } from './cards';
import { COUNTRY_SOURCE_LABEL, countryName, flag, guessCountry, type CountrySource } from '../shared/geo';
import { buildLive, type PresenceEntry, type SeatInfo } from './live';

export const BANNED_MESSAGE = 'Votre compte est suspendu.';
const DAY_MS = 86400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const FREE = new Set(newProfile().owned);
const rarityOf = (it: ReturnType<typeof getItem>) => (it && it.category === 'dice' ? it.rarity ?? null : null);

/** Libellés des sources de pièces (économie) et des types d'activité. */
export const SOURCE_LABELS: Record<string, string> = {
  partie: 'Parties en ligne', solo: 'Parties solo', cagnotte: 'Cagnottes', tournoi: 'Tournois', mise: 'Mises',
  remboursement: 'Mises rendues', boutique: 'Boutique', coffre: 'Coffre', serie: 'Série de connexions', pass: 'Pass de saison',
  quete: 'Quêtes', defi: 'Défi du jour', duel: 'Défis entre amis', club: 'Clubs', tutoriel: 'Partie guidée', fabrication: 'Fabrication',
  saison: 'Saisons et ligues', parrainage: 'Parrainage', admin: 'Administration', autre: 'Autre',
};
const PATH_SOURCES: [RegExp, string][] = [
  [/^\/shop\//, 'boutique'], [/^\/chest\//, 'coffre'], [/^\/daily\//, 'serie'], [/^\/season\//, 'pass'], [/^\/quests\//, 'quete'],
  [/^\/challenge\//, 'defi'], [/^\/duels/, 'duel'], [/^\/clubs/, 'club'], [/^\/tutorial\//, 'tutoriel'], [/^\/solo\//, 'solo'],
  [/^\/collection\//, 'fabrication'], [/^\/bags\//, 'sac'], [/^\/(me|league|referral)$/, 'saison'], [/^\/prestige/, 'autre'],
];

/** Étapes du parcours d'un visiteur (voir POST /visit/event). */
export const VISIT_EVENTS = ['guide_play', 'solo', 'online', 'invite', 'invited', 'cards', 'first_play', 'first_roll'] as const;
/** Première partie : d'où elle a été lancée (bouton « Lancer les dés » de l'accueil, lien direct ?jouer=, menus). */
export const PLAY_VIA = ['accueil', 'lien', 'menu'] as const;
/** Délai arrivée → première partie / premier lancer, envoyé par le navigateur : gardé seulement s'il est plausible (0 à 6 h). */
export function cleanDelayMs(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 6 * 3600_000 ? n : null;
}
export interface FirstEventRow { visitor: string; kind: string; at: number; ms: number | null; via: string | null; game: string | null }
/**
 * « Première partie » des nouveaux visiteurs : combien ont lancé une partie / les dés, délai médian depuis
 * l'arrivée (secondes), part des premiers lancers en moins de 30 s et 60 s, par provenance et par jeu.
 * Un visiteur qui avait déjà joué avant la mesure (solo, en ligne, cartes plus d'une minute avant) est écarté.
 */
export function firstPlayStats(visitors: string[], rows: FirstEventRow[]) {
  const fresh = new Set(visitors);
  const play = new Map<string, FirstEventRow>(), roll = new Map<string, FirstEventRow>(), before = new Map<string, number>();
  for (const r of rows) {
    if (!fresh.has(r.visitor)) continue;
    if (r.kind === 'first_play') play.set(r.visitor, r);
    else if (r.kind === 'first_roll') roll.set(r.visitor, r);
    else before.set(r.visitor, Math.min(before.get(r.visitor) ?? Infinity, r.at));
  }
  const legacy = (r: FirstEventRow) => (before.get(r.visitor) ?? Infinity) < r.at - 60_000;
  const P = [...play.values()].filter((r) => !legacy(r));
  const R = [...roll.values()].filter((r) => { const p = play.get(r.visitor); return !p || !legacy(p); });
  const secs = (xs: FirstEventRow[]) => { const m = median(xs.map((x) => x.ms).filter((x): x is number => x != null)); return m == null ? null : Math.round(m / 100) / 10; };
  const block = (p: FirstEventRow[], r: FirstEventRow[]) => ({
    launched: p.length, rolled: r.length, medianPlayS: secs(p), medianRollS: secs(r),
    rollUnder30: r.filter((x) => x.ms != null && x.ms <= 30_000).length, rollUnder60: r.filter((x) => x.ms != null && x.ms <= 60_000).length,
  });
  return {
    visitors: fresh.size, ...block(P, R),
    byVia: PLAY_VIA.map((via) => ({ via, ...block(P.filter((x) => (x.via ?? 'menu') === via), R.filter((x) => (x.via ?? 'menu') === via)) })),
    byGame: ['421', 'courtisan', 'cartes', 'online'].map((game) => ({ game, launched: P.filter((x) => x.game === game).length })),
  };
}
/** Médiane (null si vide). */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

/** Temps de présence : plafond par battement, tolérance, et plafond par visiteur et par jour. */
export const BEAT_MAX_S = 60;
export const DAY_MAX_S = 12 * 3600;
/**
 * Secondes créditées pour un battement : jamais plus que le temps réellement écoulé depuis le
 * battement précédent (+5 s de marge), ni plus de BEAT_MAX_S, ni au-delà du plafond du jour.
 */
export function creditBeat(claimed: unknown, sincePrevS: number | null, dayTotalS: number): number {
  const c = Math.floor(Number(claimed));
  if (!Number.isFinite(c) || c <= 0) return 0;
  const elapsed = sincePrevS == null ? 35 : Math.max(0, sincePrevS) + 5;
  return Math.max(0, Math.min(c, BEAT_MAX_S, Math.floor(elapsed), DAY_MAX_S - dayTotalS));
}

export interface AdminOptions {
  isAdmin: (u: UserRow | undefined) => boolean;
  userFromToken: (t: unknown) => UserRow | undefined;
  now?: () => number;
  /** « En ligne maintenant » : onglets reliés (présence), table d'un compte, codes de table existants. */
  presence?: () => PresenceEntry[];
  seatOf?: (userId: string) => SeatInfo | null;
  codeKnown?: (code: string) => boolean;
}

export function createAdmin(store: Store, opts: AdminOptions) {
  const now = opts.now ?? Date.now;
  const db = store.sqlite;
  db.exec(`
    -- Comptes suspendus : jusqu'à une date, ou définitivement (until NULL).
    CREATE TABLE IF NOT EXISTS admin_bans (
      user_id TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '', until INTEGER, by_admin TEXT NOT NULL, at INTEGER NOT NULL
    );
    -- Journal des commandes d'administration.
    CREATE TABLE IF NOT EXISTS admin_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, admin TEXT NOT NULL, action TEXT NOT NULL,
      target_id TEXT, target_name TEXT, details TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_admin_log_at ON admin_log(at DESC);
    -- Activité des joueurs (connexions, achats, sacs, succès, niveaux, commandes admin…).
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_at ON activity(at DESC);
    -- Jours où un compte s'est servi du jeu (rétention, actifs).
    CREATE TABLE IF NOT EXISTS user_days (user_id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (user_id, day));
    CREATE INDEX IF NOT EXISTS idx_user_days_day ON user_days(day);
    -- Économie : pièces gagnées et dépensées par jour et par source.
    CREATE TABLE IF NOT EXISTS economy (
      day TEXT NOT NULL, source TEXT NOT NULL, earned INTEGER NOT NULL DEFAULT 0, spent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, source)
    );
    -- Compteurs divers par jour (tournois terminés…).
    CREATE TABLE IF NOT EXISTS daily_counts (day TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, key));
    -- Visites (y compris sans compte) : visiteur = empreinte salée, jamais d'adresse IP.
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, day TEXT NOT NULL, visitor TEXT NOT NULL,
      referrer TEXT NOT NULL, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, country TEXT, lang TEXT,
      device TEXT NOT NULL, landing TEXT NOT NULL, user_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);
    CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor);
    -- Temps passé sur le site (onglet visible), par visiteur et par jour.
    CREATE TABLE IF NOT EXISTS visitor_time (visitor TEXT NOT NULL, day TEXT NOT NULL, seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (visitor, day));
    CREATE INDEX IF NOT EXISTS idx_visitor_time_day ON visitor_time(day);
    -- Parcours des visiteurs (conversion) : PREMIÈRE fois qu'un visiteur fait chaque étape.
    CREATE TABLE IF NOT EXISTS visit_events (
      visitor TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, day TEXT NOT NULL, page TEXT,
      PRIMARY KEY (visitor, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_visit_events_day ON visit_events(day);
  `);
  for (const col of ['tz TEXT', 'country_src TEXT']) { try { db.exec(`ALTER TABLE visits ADD COLUMN ${col}`); } catch { /* déjà présente */ } }
  // Première partie (first_play / first_roll) : délai depuis l'arrivée, provenance (accueil, lien, menu), jeu.
  for (const col of ['ms INTEGER', 'via TEXT', 'game TEXT']) { try { db.exec(`ALTER TABLE visit_events ADD COLUMN ${col}`); } catch { /* déjà présente */ } }
  // Ménage : activité et visites gardées un an.
  db.prepare('DELETE FROM activity WHERE at < ?').run(now() - 365 * DAY_MS);
  db.prepare('DELETE FROM visits WHERE at < ?').run(now() - 365 * DAY_MS);
  db.prepare('DELETE FROM visitor_time WHERE day < ?').run(addDays(brusselsDay(now()), -366));
  db.prepare('DELETE FROM visit_events WHERE at < ?').run(now() - 365 * DAY_MS);

  let salt = store.getMeta('visit_salt');
  if (!salt) { salt = randomBytes(24).toString('base64url'); store.setMeta('visit_salt', salt); }
  const hash = (s: string) => createHash('sha256').update(`${salt}|${s}`).digest('hex').slice(0, 24);

  // --- Suspensions --------------------------------------------------------------------------------
  type Ban = { user_id: string; reason: string; until: number | null; by_admin: string; at: number };
  const banOf = (userId: string): Ban | undefined => {
    const b = db.prepare('SELECT * FROM admin_bans WHERE user_id = ?').get(userId) as Ban | undefined;
    if (!b) return undefined;
    if (b.until != null && b.until <= now()) { db.prepare('DELETE FROM admin_bans WHERE user_id = ?').run(userId); return undefined; }
    return b;
  };
  const isBanned = (userId: string | undefined | null) => !!userId && !!banOf(userId);
  const banText = (b: Ban) => {
    let t = BANNED_MESSAGE;
    if (b.until) t += ` Jusqu’au ${new Date(b.until).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.`;
    if (b.reason) t += ` Motif : ${b.reason}`;
    return t;
  };

  // --- Activité -------------------------------------------------------------------------------------
  const insActivity = db.prepare('INSERT INTO activity (at, user_id, kind, text) VALUES (?, ?, ?, ?)');
  const activity = (userId: string, kind: string, text: string) => { insActivity.run(now(), userId, kind, text.slice(0, 300)); };
  const seenDays = new Set<string>();
  const insDay = db.prepare('INSERT OR IGNORE INTO user_days (user_id, day) VALUES (?, ?)');
  const markActive = (userId: string) => {
    const k = `${userId}|${brusselsDay(now())}`;
    if (seenDays.has(k)) return;
    if (seenDays.size > 20000) seenDays.clear();
    seenDays.add(k);
    insDay.run(userId, brusselsDay(now()));
  };
  const bumpEco = db.prepare(`INSERT INTO economy (day, source, earned, spent) VALUES (?, ?, ?, ?)
    ON CONFLICT(day, source) DO UPDATE SET earned = earned + excluded.earned, spent = spent + excluded.spent`);
  const bumpCount = db.prepare(`INSERT INTO daily_counts (day, key, n) VALUES (?, ?, 1) ON CONFLICT(day, key) DO UPDATE SET n = n + 1`);

  // Requête HTTP en cours par compte : elle donne la source d'un mouvement de pièces.
  const pending = new Map<string, string>();
  let forced: string | null = null;
  const itemName = (id: string) => getItem(id)?.name ?? fxDef(id)?.name ?? id;

  store.onProfileSave = (userId, before, after) => {
    if (!before) return;
    const path = pending.get(userId);
    let source = forced ?? (path ? PATH_SOURCES.find(([re]) => re.test(path))?.[1] ?? 'autre' : null);
    if (!source) {
      // Hors requête (partie en ligne, tournoi, mises) : déduit de ce qui a changé.
      if (after.stats.tournaments > before.stats.tournaments) source = 'tournoi';
      else if (after.stats.potsWon > before.stats.potsWon) source = 'cagnotte';
      else if (after.stats.played > before.stats.played) source = 'partie';
      else if (after.coins < before.coins) source = 'mise';
      else source = 'remboursement';
    }
    const delta = after.coins - before.coins;
    const day = brusselsDay(now());
    if (delta) bumpEco.run(day, source === 'sac' ? 'autre' : source, Math.max(0, delta), Math.max(0, -delta));
    if (forced) return; // les commandes admin ont leur propre ligne d'activité
    const gained = after.owned.filter((id) => !before.owned.includes(id));
    if ((after.bags ?? 0) < (before.bags ?? 0) && source === 'sac') {
      activity(userId, 'sac', gained.length ? `Sac ouvert : ${gained.map(itemName).join(', ')}` : `Sac ouvert : doublon (+${(after.shards ?? 0) - (before.shards ?? 0)} éclats)`);
    } else if (gained.length && source === 'boutique') {
      activity(userId, 'achat', `Achat : ${gained.map(itemName).join(', ')} (${-delta} pièces)`);
    } else if (gained.length && source === 'fabrication') {
      activity(userId, 'achat', `Fabrication : ${gained.map(itemName).join(', ')}`);
    }
    if ((after.bags ?? 0) > (before.bags ?? 0)) activity(userId, 'sac', `Sac gagné (${after.bags} en réserve)`);
    for (const id of Object.keys(after.achievements)) {
      if (!before.achievements[id]) activity(userId, 'succes', `Succès : ${ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id}`);
    }
    const lb = levelInfo(before.xp).level, la = levelInfo(after.xp).level;
    if (la > lb) activity(userId, 'niveau', `Niveau ${la} atteint`);
    if (source === 'coffre' || source === 'serie' || source === 'pass' || source === 'quete' || source === 'defi') {
      if (delta > 0) activity(userId, 'gain', `${SOURCE_LABELS[source]} : +${delta} pièces`);
    }
    if ((source === 'cagnotte' || source === 'tournoi') && delta > 0) activity(userId, 'gain', `${SOURCE_LABELS[source]} : +${delta} pièces`);
  };
  store.onUserDelete = (userId) => {
    db.prepare('DELETE FROM activity WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_days WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM admin_bans WHERE user_id = ?').run(userId);
    // Données de visite rattachées au compte : effacées avec lui.
    db.prepare('DELETE FROM visitor_time WHERE visitor IN (SELECT DISTINCT visitor FROM visits WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM visit_events WHERE visitor IN (SELECT DISTINCT visitor FROM visits WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM visits WHERE visitor IN (SELECT DISTINCT visitor FROM visits WHERE user_id = ?)').run(userId);
    peopleCache = null;
  };

  // --- Sockets : coupure des sessions des comptes suspendus ---------------------------------------
  const socketsOf = new Map<string, Set<Socket>>();
  const track = (s: Socket, userId: string) => {
    let set = socketsOf.get(userId);
    if (!set) socketsOf.set(userId, (set = new Set()));
    if (set.has(s)) return;
    set.add(s);
    s.once('disconnect', () => { set!.delete(s); if (!set!.size) socketsOf.delete(userId); });
  };
  function attach(io: Server) {
    // Doit être appelé avant les autres gestionnaires de connexion (ce filtre passe en premier).
    io.on('connection', (socket) => {
      socket.use((pkt, next) => {
        const payload = pkt[1] as { auth?: unknown } | undefined;
        const u = payload && typeof payload === 'object' && payload.auth ? opts.userFromToken(payload.auth) : undefined;
        if (u) {
          const b = banOf(u.id);
          if (b) {
            const ack = pkt[pkt.length - 1];
            if (typeof ack === 'function') ack({ ok: false, error: banText(b), banned: true });
            socket.emit('account:banned', { text: banText(b) });
            return; // commande refusée
          }
          track(socket, u.id);
        }
        next();
      });
    });
    io.of('/presence').on('connection', (socket) => {
      const u = opts.userFromToken(socket.handshake.auth?.token);
      if (!u) return;
      const b = banOf(u.id);
      if (b) { socket.emit('account:banned', { text: banText(b) }); setTimeout(() => socket.disconnect(true), 200); return; }
      track(socket, u.id);
      markActive(u.id);
    });
  }
  const cutSessions = (userId: string, text: string) => {
    for (const s of socketsOf.get(userId) ?? []) { s.emit('account:banned', { text }); setTimeout(() => s.disconnect(true), 200); }
  };

  /** Suspension (until null : définitive), utilisée par l'administration et la modération. */
  const ban = (u: UserRow, reason: string, until: number | null, by: string) => {
    db.prepare('INSERT OR REPLACE INTO admin_bans (user_id, reason, until, by_admin, at) VALUES (?, ?, ?, ?, ?)').run(u.id, reason, until, by, now());
    tokenCache.clear();
    cutSessions(u.id, banText(banOf(u.id)!));
  };
  const unban = (userId: string) => Number(db.prepare('DELETE FROM admin_bans WHERE user_id = ?').run(userId).changes) > 0;
  /** Journal d'administration (décisions de modération comprises). */
  const log = (by: string, action: string, target: UserRow | null, details: string) => {
    db.prepare('INSERT INTO admin_log (at, admin, action, target_id, target_name, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(now(), by, action, target?.id ?? null, target?.username ?? null, details.slice(0, 500));
    if (target) activity(target.id, 'admin', `${action.startsWith('mod') ? 'Modération' : 'Administration'} (${by}) : ${details}`);
  };

  /** Fin d'un tournoi (comptage) : à brancher sur la levée du séquestre « T:… ». */
  const tournamentFinished = () => bumpCount.run(brusselsDay(now()), 'tournois');

  // --- Routes -------------------------------------------------------------------------------------
  const router = express.Router();
  const json = express.json({ limit: '8kb' });
  const fail = (res: Response, status: number, error: string, extra: object = {}) => { res.status(status).json({ ok: false, error, ...extra }); };

  // Jetons récemment vus (évite une lecture de session en plus à chaque requête).
  const tokenCache = new Map<string, { id: string | null; at: number }>();
  const userOfToken = (token: string): string | null => {
    const c = tokenCache.get(token);
    if (c && now() - c.at < 60_000) return c.id;
    const id = opts.userFromToken(token)?.id ?? null;
    if (tokenCache.size > 5000) tokenCache.clear();
    tokenCache.set(token, { id, at: now() });
    return id;
  };
  const loginJson = express.json({ limit: '32kb' });
  // Filtre de toutes les requêtes /api : comptes suspendus refusés, source des mouvements de pièces, jours actifs.
  router.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.path === '/login' || req.path === '/recover') && req.method === 'POST') {
      return loginJson(req, res, () => {
        const u = typeof req.body?.username === 'string' ? store.userByName(req.body.username.trim()) : undefined;
        const b = u && banOf(u.id);
        if (b) return fail(res, 403, banText(b), { banned: true });
        if (u && req.path === '/login') res.on('finish', () => { if (res.statusCode === 200) { activity(u.id, 'connexion', 'Connexion'); markActive(u.id); } });
        next();
      });
    }
    if (req.path === '/register' && req.method === 'POST') {
      res.on('finish', () => {
        if (res.statusCode !== 200) return;
        const u = typeof req.body?.username === 'string' ? store.userByName(req.body.username.trim()) : undefined;
        if (u) { activity(u.id, 'connexion', 'Inscription'); markActive(u.id); }
      });
      return next();
    }
    const h = req.headers.authorization ?? '';
    if (!h.startsWith('Bearer ')) return next();
    const userId = userOfToken(h.slice(7));
    if (!userId) return next();
    const b = banOf(userId);
    if (b && req.path !== '/logout') return fail(res, 403, banText(b), { banned: true });
    markActive(userId);
    pending.set(userId, req.path);
    res.on('finish', () => { if (pending.get(userId) === req.path) pending.delete(userId); });
    res.on('close', () => { if (pending.get(userId) === req.path) pending.delete(userId); });
    next();
  });

  // Visite (publique, anonyme) : une par visiteur et par demi-heure.
  const lastVisit = new Map<string, number>();
  const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) || null : null);
  router.post('/visit', json, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const b = req.body ?? {};
    const ua = String(req.headers['user-agent'] ?? '');
    if (/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua)) return res.json({ ok: true, skipped: true });
    const device = typeof b.device === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.device) ? b.device : null;
    const t = now();
    const day = brusselsDay(t);
    const visitor = device ? hash(`d:${device}`) : hash(`ip:${req.ip}|${ua}|${day}`);
    const token = (req.headers.authorization ?? '').startsWith('Bearer ') ? (req.headers.authorization as string).slice(7) : null;
    const userId = token ? userOfToken(token) : null;
    if (b.link) {
      if (userId) db.prepare('UPDATE visits SET user_id = ? WHERE visitor = ? AND user_id IS NULL').run(userId, visitor);
      peopleCache = null;
      return res.json({ ok: true });
    }
    if (t - (lastVisit.get(visitor) ?? 0) < 30 * 60_000) return res.json({ ok: true, skipped: true });
    if (lastVisit.size > 20000) lastVisit.clear();
    lastVisit.set(visitor, t);
    // Provenance : domaine du site d'origine ; liens internes (pages d'aide du site) gardés avec leur chemin.
    let referrer = '(direct)';
    const host = String(req.headers.host ?? '').toLowerCase();
    try {
      const r = typeof b.ref === 'string' && b.ref ? new URL(b.ref) : null;
      if (r && /^https?:$/.test(r.protocol)) {
        const rh = r.hostname.replace(/^www\./, '').toLowerCase();
        referrer = host && host.split(':')[0].replace(/^www\./, '') === rh ? `(interne) ${r.pathname.slice(0, 60)}` : rh.slice(0, 80);
      }
    } catch { /* adresse invalide */ }
    const utm = (b.utm && typeof b.utm === 'object' ? b.utm : {}) as Record<string, unknown>;
    const cc = [req.headers['cf-ipcountry'], req.headers['x-vercel-ip-country'], req.headers['cloudfront-viewer-country'], req.headers['x-country-code']]
      .map((v) => (typeof v === 'string' ? v.toUpperCase() : '')).find((v) => /^[A-Z]{2}$/.test(v) && v !== 'XX') ?? null;
    const lang = clean(b.lang, 12);
    const tz = typeof b.tz === 'string' && /^[A-Za-z_+\-/0-9]{1,40}$/.test(b.tz) ? b.tz : null;
    const g = cc ? { country: cc, source: 'entete' as CountrySource } : guessCountry(tz, lang);
    const deviceKind = /iPad|Tablet/i.test(ua) ? 'tablette' : /Mobi|Android|iPhone|iPod/i.test(ua) ? 'mobile' : 'ordinateur';
    let landing = clean(b.landing, 80) ?? '/';
    if (!landing.startsWith('/')) landing = '/';
    db.prepare(`INSERT INTO visits (at, day, visitor, referrer, utm_source, utm_medium, utm_campaign, country, lang, device, landing, user_id, tz, country_src)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(t, day, visitor, referrer, clean(utm.utm_source, 60), clean(utm.utm_medium, 60), clean(utm.utm_campaign, 60),
      g.country, lang, deviceKind, landing, userId, tz, g.source);
    lastBeat.set(visitor, t);
    peopleCache = null;
    res.json({ ok: true });
  });

  // Étapes du parcours (conversion), enregistrées une seule fois par visiteur et par étape :
  //  - guide_play : clic sur « Jouer » depuis une page d'aide (règles, stratégie…) ;
  //  - solo : première partie contre l'ordinateur lancée ;
  //  - online : première table en ligne rejointe ou créée (partie rapide, salon, tournoi) ;
  //  - invite : invitation envoyée (lien ou code de table partagé) ;
  //  - invited : arrivée par un lien d'invitation (table, tournoi, partie à regarder, parrainage) ;
  //  - cards : première partie de Coups Fourrés lancée (ordinateur, partie guidée, en ligne, tournoi).
  //  - first_play / first_roll : première partie lancée / premier lancer de dés, avec le délai depuis l'arrivée.
  const addEvent = db.prepare('INSERT OR IGNORE INTO visit_events (visitor, kind, at, day, page, ms, via, game) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  router.post('/visit/event', express.json({ limit: '1kb', type: () => true }), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const b = (req.body ?? {}) as { device?: unknown; kind?: unknown; page?: unknown; ms?: unknown; via?: unknown; game?: unknown };
    const ua = String(req.headers['user-agent'] ?? '');
    if (/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua)) return res.json({ ok: true, skipped: true });
    const device = typeof b.device === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.device) ? b.device : null;
    if (!device) return fail(res, 400, 'Appareil inconnu.');
    if (typeof b.kind !== 'string' || !(VISIT_EVENTS as readonly string[]).includes(b.kind)) return fail(res, 400, 'Étape inconnue.');
    let page = clean(b.page, 80);
    if (page && !page.startsWith('/')) page = null;
    const t = now();
    const first = b.kind === 'first_play' || b.kind === 'first_roll';
    const via = first && typeof b.via === 'string' && (PLAY_VIA as readonly string[]).includes(b.via) ? b.via : null;
    const game = first && typeof b.game === 'string' && /^(421|courtisan|cartes|online)$/.test(b.game) ? b.game : null;
    const r = addEvent.run(hash(`d:${device}`), b.kind, t, brusselsDay(t), page, first ? cleanDelayMs(b.ms) : null, via, game);
    if (r.changes) peopleCache = null;
    res.json({ ok: true, first: !!r.changes });
  });

  // Battement de présence (onglet visible) : temps passé, plafonné côté serveur.
  const lastBeat = new Map<string, number>();
  const knownVisitor = db.prepare('SELECT 1 AS x FROM visits WHERE visitor = ? LIMIT 1');
  const dayTime = db.prepare('SELECT seconds FROM visitor_time WHERE visitor = ? AND day = ?');
  const addTime = db.prepare(`INSERT INTO visitor_time (visitor, day, seconds) VALUES (?, ?, ?)
    ON CONFLICT(visitor, day) DO UPDATE SET seconds = seconds + excluded.seconds`);
  router.post('/visit/beat', express.json({ limit: '1kb', type: () => true }), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const b = (req.body ?? {}) as { device?: unknown; seconds?: unknown };
    const device = typeof b.device === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.device) ? b.device : null;
    if (!device) return fail(res, 400, 'Appareil inconnu.');
    const visitor = hash(`d:${device}`);
    if (!knownVisitor.get(visitor)) return res.json({ ok: true, credited: 0 });
    const t = now(), day = brusselsDay(t);
    const prev = lastBeat.get(visitor);
    const total = (dayTime.get(visitor, day) as { seconds: number } | undefined)?.seconds ?? 0;
    const credited = creditBeat(b.seconds, prev == null ? null : (t - prev) / 1000, total);
    if (lastBeat.size > 50000) lastBeat.clear();
    lastBeat.set(visitor, t);
    if (credited > 0) { addTime.run(visitor, day, credited); peopleCache = null; }
    res.json({ ok: true, credited });
  });

  // --- Administration -----------------------------------------------------------------------------
  const adminOf = (req: Request) => {
    const h = req.headers.authorization ?? '';
    const u = opts.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    return opts.isAdmin(u) ? u : undefined;
  };
  const admin = express.Router();
  admin.use((req, res, next) => {
    // Routes historiques du tableau de bord : gérées par stats.ts.
    if (req.path === '/whoami' || req.path === '/stats') return next('router');
    res.setHeader('Cache-Control', 'no-store');
    const a = adminOf(req);
    if (!a) return fail(res, 403, 'Accès réservé à l’administration.');
    (req as Request & { admin: UserRow }).admin = a;
    next();
  });
  const adminName = (req: Request) => (req as Request & { admin: UserRow }).admin.username;
  const logAdmin = (req: Request, action: string, target: UserRow | null, details: string) => log(adminName(req), action, target, details);
  const target = (req: Request) => {
    const k = String(req.params.id ?? '');
    return store.userById(k) ?? store.userByName(k);
  };
  const lastSeen = (u: UserRow) => {
    const a = store.lastSeenOf(u.id);
    const d = (db.prepare('SELECT MAX(at) AS t FROM activity WHERE user_id = ?').get(u.id) as { t: number | null }).t ?? 0;
    const g = (db.prepare('SELECT MAX(g.ended_at) AS t FROM game_players gp JOIN games_log g ON g.id = gp.game_id WHERE gp.user_id = ?').get(u.id) as { t: number | null }).t ?? 0;
    return Math.max(a, d, g) || null;
  };
  const gamesOf = (userId: string) => db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN g.mode = 'solo' THEN 1 ELSE 0 END), 0) AS solo,
    COALESCE(SUM(gp.won), 0) AS won FROM game_players gp JOIN games_log g ON g.id = gp.game_id WHERE gp.user_id = ?`).get(userId) as { n: number; solo: number; won: number };

  function sheet(u: UserRow) {
    const p = store.profileOf(u);
    const li = levelInfo(p.xp);
    const b = banOf(u.id);
    const g = gamesOf(u.id);
    const items = p.owned.filter((id) => !FREE.has(id)).map((id) => {
      const it = getItem(id), fx = fxDef(id);
      return { id, name: itemName(id), category: it ? CATEGORY_LABELS[it.category] : fx ? FX_KIND_LABEL[fx.kind] : '?', rarity: rarityOf(it) ?? fx?.rarity ?? null };
    });
    return {
      id: u.id, username: u.username, createdAt: u.created_at, lastSeen: lastSeen(u), admin: opts.isAdmin(u),
      coins: p.coins, xp: p.xp, level: li.level, prestige: p.prestige ?? 0, bags: p.bags ?? 0, shards: p.shards ?? 0,
      items, equipped: p.equipped,
      games: { total: g.n, solo: g.solo, online: g.n - g.solo, won: g.won, onlineRanked: u.online_games, onlineWins: u.online_wins, played: p.stats.played },
      achievements: Object.keys(p.achievements).length,
      ban: b ? { reason: b.reason, until: b.until, by: b.by_admin, at: b.at, text: banText(b) } : null,
      photo: toPublic(u).photo,
      cf: (({ discovered, capsules, shards, boosters, total }) => ({ discovered, capsules, shards, boosters, cards: total }))(cfAdminView(store, u.id)),
    };
  }

  admin.get('/players', (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 30);
    const rows = db.prepare(`SELECT id, username, created_at, json_extract(profile, '$.coins') AS coins, json_extract(profile, '$.xp') AS xp
      FROM users WHERE username LIKE ? ESCAPE '\\' ORDER BY ${q ? 'length(username), username' : 'created_at DESC'} LIMIT 30`)
      .all(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) as { id: string; username: string; created_at: number; coins: number; xp: number }[];
    res.json({ ok: true, players: rows.map((r) => ({ id: r.id, username: r.username, createdAt: r.created_at, coins: r.coins ?? 0, level: levelInfo(r.xp ?? 0).level, banned: isBanned(r.id) })) });
  });
  admin.get('/players/:id', (req, res) => {
    const u = target(req);
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    res.json({ ok: true, player: sheet(u) });
  });

  admin.post('/players/:id/ban', json, (req, res) => {
    const u = target(req);
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    if (opts.isAdmin(u)) return fail(res, 400, 'Impossible de suspendre un compte administrateur.');
    const reason = clean(req.body?.reason, 200) ?? '';
    const days = req.body?.days == null || req.body.days === '' ? null : Math.floor(Number(req.body.days));
    if (days != null && (!Number.isFinite(days) || days < 1 || days > 3650)) return fail(res, 400, 'Durée : de 1 à 3650 jours, ou vide pour une suspension définitive.');
    const until = days == null ? null : now() + days * DAY_MS;
    ban(u, reason, until, adminName(req));
    logAdmin(req, 'ban', u, `suspension ${days == null ? 'définitive' : `de ${days} jour${days > 1 ? 's' : ''}`}${reason ? ` (motif : ${reason})` : ''}`);
    res.json({ ok: true, player: sheet(u) });
  });
  admin.post('/players/:id/unban', json, (req, res) => {
    const u = target(req);
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    if (!unban(u.id)) return fail(res, 400, 'Ce compte n’est pas suspendu.');
    logAdmin(req, 'unban', u, 'suspension levée');
    res.json({ ok: true, player: sheet(u) });
  });

  /** Modifie le profil côté serveur (recalcul complet), journalise et renvoie la fiche. */
  const edit = (req: Request, res: Response, fn: (p: Profile) => Profile | string, action: string, details: (before: Profile, after: Profile) => string) => {
    const u = target(req);
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    const before = store.profileOf(u);
    const out = fn(structuredClone(before));
    if (typeof out === 'string') return fail(res, 400, out);
    const after = sanitizeProfile(JSON.parse(JSON.stringify(out)));
    forced = 'admin';
    try { store.saveProfile(u.id, after); } finally { forced = null; }
    logAdmin(req, action, u, details(before, after));
    res.json({ ok: true, player: sheet(store.userById(u.id)!) });
  };
  admin.post('/players/:id/coins', json, (req, res) => {
    const delta = Math.trunc(Number(req.body?.delta));
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000) return fail(res, 400, 'Montant invalide (entier non nul, au plus 1 000 000).');
    edit(req, res, (p) => {
      if (p.coins + delta < 0) return `Le joueur n’a que ${p.coins} pièces.`;
      return { ...p, coins: p.coins + delta };
    }, delta > 0 ? 'coins+' : 'coins-', (b, a) => `${delta > 0 ? 'don' : 'retrait'} de ${Math.abs(delta)} pièces (${b.coins} → ${a.coins})`);
  });
  admin.post('/players/:id/bags', json, (req, res) => {
    const delta = Math.trunc(Number(req.body?.delta));
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > BAGS_MAX) return fail(res, 400, `Nombre de sacs invalide (1 à ${BAGS_MAX}).`);
    edit(req, res, (p) => {
      const n = (p.bags ?? 0) + delta;
      if (n < 0) return `Le joueur n’a que ${p.bags ?? 0} sac(s).`;
      if (n > BAGS_MAX) return `Au plus ${BAGS_MAX} sacs en réserve.`;
      return { ...p, bags: n };
    }, delta > 0 ? 'bags+' : 'bags-', (b, a) => `${delta > 0 ? 'don' : 'retrait'} de ${Math.abs(delta)} sac${Math.abs(delta) > 1 ? 's' : ''} de dés (${b.bags ?? 0} → ${a.bags ?? 0})`);
  });
  admin.post('/players/:id/items', json, (req, res) => {
    const id = String(req.body?.id ?? '');
    const give = req.body?.action !== 'remove';
    if (!getItem(id) && !fxDef(id)) return fail(res, 400, 'Objet inconnu du catalogue.');
    if (FREE.has(id)) return fail(res, 400, 'Objet gratuit : tout le monde le possède.');
    edit(req, res, (p) => {
      const has = p.owned.includes(id);
      if (give && has) return 'Le joueur possède déjà cet objet.';
      if (!give && !has) return 'Le joueur ne possède pas cet objet.';
      if (give) return { ...p, owned: [...p.owned, id] };
      // Retrait : l'objet équipé est remplacé par celui par défaut (recalcul au nettoyage du profil).
      return { ...p, owned: p.owned.filter((x) => x !== id), showcase: p.showcase?.filter((x) => x !== id) };
    }, give ? 'item+' : 'item-', () => `${give ? 'don' : 'retrait'} de l’objet « ${itemName(id)} »`);
  });

  // Coups Fourrés (mode cartes) : collection, capsules, éclats, boosters d'un joueur.
  admin.get('/players/:id/cf', (req, res) => {
    const u = target(req);
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    res.json({ ok: true, username: u.username, cf: cfAdminView(store, u.id), cards: CF_CARD_LIST });
  });
  /** { what: 'capsules' | 'shards' | 'boosters' | 'card', delta, cardId?, shiny? } */
  admin.post('/players/:id/cf', json, (req, res) => {
    const u = target(req);
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    const what = String(req.body?.what ?? '');
    const delta = Math.trunc(Number(req.body?.delta));
    const out = cfAdminAdjust(store, u.id, what, delta, typeof req.body?.cardId === 'string' ? req.body.cardId : undefined, req.body?.shiny === true);
    if ('error' in out) return fail(res, 400, out.error);
    logAdmin(req, `cf-${what}${delta > 0 ? '+' : '-'}`, u, `Coups Fourrés : ${out.details}`);
    res.json({ ok: true, username: u.username, cf: cfAdminView(store, u.id) });
  });

  admin.get('/catalog', (_req, res) => {
    const items = [
      ...ITEMS.filter((i) => !FREE.has(i.id)).map((i) => ({ id: i.id, name: i.name, category: CATEGORY_LABELS[i.category], rarity: rarityOf(i) ? RARITY_LABEL[rarityOf(i)!] : null })),
      ...FX.map((f) => ({ id: f.id, name: f.name, category: FX_KIND_LABEL[f.kind], rarity: RARITY_LABEL[f.rarity] })),
    ];
    res.json({ ok: true, items });
  });
  admin.get('/log', (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    res.json({ ok: true, log: db.prepare('SELECT at, admin, action, target_name AS target, details FROM admin_log ORDER BY at DESC, id DESC LIMIT ?').all(limit) });
  });

  // Journal d'activité : activité notée + parties terminées (statistiques), filtrable par joueur et par type.
  admin.get('/activity', (req, res) => {
    const name = String(req.query.user ?? '').trim();
    const kind = String(req.query.kind ?? '').trim();
    const u = name ? store.userByName(name) : undefined;
    if (name && !u) return fail(res, 404, 'Joueur introuvable.');
    const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 100));
    type Row = { at: number; username: string; kind: string; text: string };
    let rows: Row[] = [];
    if (kind !== 'partie') {
      rows = db.prepare(`SELECT a.at, u.username, a.kind, a.text FROM activity a JOIN users u ON u.id = a.user_id
        WHERE (? = '' OR a.user_id = ?) AND (? = '' OR a.kind = ?) ORDER BY a.at DESC LIMIT ?`).all(u?.id ?? '', u?.id ?? '', kind, kind, limit) as unknown as Row[];
    }
    if (!kind || kind === 'partie') {
      const games = db.prepare(`SELECT g.ended_at AS at, u.username, g.mode, g.humans, g.bots, g.duration_s AS d, gp.won FROM game_players gp
        JOIN games_log g ON g.id = gp.game_id JOIN users u ON u.id = gp.user_id WHERE (? = '' OR gp.user_id = ?) ORDER BY g.ended_at DESC LIMIT ?`)
        .all(u?.id ?? '', u?.id ?? '', limit) as { at: number; username: string; mode: string; humans: number; bots: number; d: number; won: number }[];
      rows.push(...games.map((g) => ({ at: g.at, username: g.username, kind: 'partie',
        text: `Partie ${g.mode === 'solo' ? 'solo' : 'en ligne'} ${g.won ? 'gagnée' : 'perdue'} (${g.humans} humain${g.humans > 1 ? 's' : ''}${g.bots ? `, ${g.bots} ordi.` : ''}, ${Math.max(1, Math.round(g.d / 60))} min)` })));
    }
    rows.sort((a, b) => b.at - a.at);
    res.json({ ok: true, activity: rows.slice(0, limit) });
  });

  // Jours actifs par compte : jours notés + jours de parties terminées.
  const activeUnion = `SELECT user_id, day FROM user_days UNION SELECT gp.user_id, g.day FROM game_players gp JOIN games_log g ON g.id = gp.game_id WHERE gp.user_id IS NOT NULL`;
  const activeSince = (day: string) => (db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM (${activeUnion}) WHERE day >= ?`).get(day) as { n: number }).n;
  const series = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

  admin.get('/overview', (_req, res) => {
    const t = now(), day = brusselsDay(t), from = addDays(day, -29);
    const users = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    const eco = db.prepare(`SELECT COALESCE(SUM(json_extract(profile, '$.coins')), 0) AS coins, COALESCE(SUM(json_extract(profile, '$.bags')), 0) AS bags FROM users`).get() as { coins: number; bags: number };
    const banned = (db.prepare('SELECT COUNT(*) AS n FROM admin_bans WHERE until IS NULL OR until > ?').get(t) as { n: number }).n;
    const games = db.prepare(`SELECT mode, COUNT(*) AS n FROM games_log GROUP BY mode`).all() as { mode: string; n: number }[];
    const tournaments = (db.prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM daily_counts WHERE key = 'tournois'`).get() as { n: number }).n;
    const perDay = db.prepare(`SELECT day, mode, COUNT(*) AS n FROM games_log WHERE day >= ? GROUP BY day, mode`).all(from) as { day: string; mode: string; n: number }[];
    const tPerDay = new Map((db.prepare(`SELECT day, n FROM daily_counts WHERE key = 'tournois' AND day >= ?`).all(from) as { day: string; n: number }[]).map((r) => [r.day, r.n]));
    const signups = new Map<string, number>();
    for (const r of db.prepare('SELECT created_at FROM users WHERE created_at >= ?').all(brusselsMidnight(from)) as { created_at: number }[]) {
      const d = brusselsDay(r.created_at); signups.set(d, (signups.get(d) ?? 0) + 1);
    }
    const activePerDay = new Map((db.prepare(`SELECT day, COUNT(DISTINCT user_id) AS n FROM (${activeUnion}) WHERE day >= ? GROUP BY day`).all(from) as { day: string; n: number }[]).map((r) => [r.day, r.n]));
    const days = series(from, 30).map((d) => ({
      day: d, signups: signups.get(d) ?? 0, active: activePerDay.get(d) ?? 0, tournaments: tPerDay.get(d) ?? 0,
      solo: perDay.find((r) => r.day === d && r.mode === 'solo')?.n ?? 0, online: perDay.find((r) => r.day === d && r.mode === 'online')?.n ?? 0,
    }));
    res.json({
      ok: true, day, users, bannedCount: banned, coins: eco.coins, bags: eco.bags,
      active: { today: activeSince(day), week: activeSince(addDays(day, -6)), month: activeSince(from) },
      games: { solo: games.find((g) => g.mode === 'solo')?.n ?? 0, online: games.find((g) => g.mode === 'online')?.n ?? 0, tournaments },
      days,
    });
  });

  admin.get('/visitors', (req, res) => {
    const n = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const day = brusselsDay(now()), from = addDays(day, -(n - 1));
    const per = new Map((db.prepare(`SELECT day, COUNT(*) AS visits, COUNT(DISTINCT visitor) AS visitors FROM visits WHERE day >= ? GROUP BY day`).all(from) as { day: string; visits: number; visitors: number }[]).map((r) => [r.day, r]));
    const top = (col: string, limit = 12) => db.prepare(`SELECT COALESCE(${col}, '(inconnu)') AS k, COUNT(*) AS n, COUNT(DISTINCT visitor) AS v FROM visits WHERE day >= ? GROUP BY k ORDER BY n DESC LIMIT ?`).all(from, limit) as { k: string; n: number; v: number }[];
    const totals = db.prepare('SELECT COUNT(*) AS visits, COUNT(DISTINCT visitor) AS visitors FROM visits WHERE day >= ?').get(from) as { visits: number; visitors: number };
    // Conversion : nouveaux visiteurs de la période (première visite dans la période), dont combien ont créé un compte depuis.
    const conv = db.prepare(`SELECT COUNT(*) AS fresh, COALESCE(SUM(CASE WHEN converted THEN 1 ELSE 0 END), 0) AS converted FROM (
        SELECT v.visitor, MIN(v.day) AS first, MAX(CASE WHEN v.user_id IS NOT NULL AND u.created_at >= ? THEN 1 ELSE 0 END) AS converted
        FROM visits v LEFT JOIN users u ON u.id = v.user_id GROUP BY v.visitor) WHERE first >= ?`).get(brusselsMidnight(from), from) as { fresh: number; converted: number };
    const anyCountry = (db.prepare('SELECT COUNT(*) AS n FROM visits WHERE country IS NOT NULL AND day >= ?').get(from) as { n: number }).n > 0;
    const utm = db.prepare(`SELECT utm_source AS source, COALESCE(utm_medium, '') AS medium, COALESCE(utm_campaign, '') AS campaign, COUNT(*) AS n FROM visits
      WHERE day >= ? AND utm_source IS NOT NULL GROUP BY source, medium, campaign ORDER BY n DESC LIMIT 12`).all(from);
    // Parcours des nouveaux visiteurs de la période : combien ont franchi chaque étape (à n'importe quel moment depuis),
    // et combien sont revenus un autre jour. Par page d'arrivée (première page vue).
    const freshRows = db.prepare(`SELECT v.visitor AS visitor, MIN(v.day) AS first,
        (SELECT landing FROM visits x WHERE x.visitor = v.visitor ORDER BY x.at LIMIT 1) AS landing,
        COUNT(DISTINCT v.day) AS days
      FROM visits v GROUP BY v.visitor HAVING first >= ?`).all(from) as { visitor: string; first: string; landing: string; days: number }[];
    const evOf = new Map<string, Set<string>>();
    for (const e of db.prepare('SELECT visitor, kind FROM visit_events').all() as { visitor: string; kind: string }[]) {
      let x = evOf.get(e.visitor); if (!x) evOf.set(e.visitor, (x = new Set())); x.add(e.kind);
    }
    const step = (rows: typeof freshRows) => {
      const has = (k: string) => rows.filter((r) => evOf.get(r.visitor)?.has(k)).length;
      return {
        visitors: rows.length, guidePlay: has('guide_play'), solo: has('solo'), online: has('online'), cards: has('cards'),
        played: rows.filter((r) => { const e = evOf.get(r.visitor); return !!e && (e.has('solo') || e.has('online') || e.has('cards')); }).length,
        invite: has('invite'), invited: has('invited'), returned: rows.filter((r) => r.days > 1).length,
      };
    };
    const byLanding = new Map<string, typeof freshRows>();
    for (const r of freshRows) { const k = r.landing || '/'; const l = byLanding.get(k); if (l) l.push(r); else byLanding.set(k, [r]); }
    const funnel = { ...step(freshRows), byLanding: [...byLanding.entries()].map(([landing, rows]) => ({ landing, ...step(rows) })).sort((a, b) => b.visitors - a.visitors).slice(0, 15) };
    const firstPlay = firstPlayStats(freshRows.map((r) => r.visitor),
      db.prepare(`SELECT visitor, kind, at, ms, via, game FROM visit_events WHERE kind IN ('first_play', 'first_roll', 'solo', 'online', 'cards')`).all() as unknown as FirstEventRow[]);
    res.json({
      ok: true, days: series(from, n).map((d) => ({ day: d, visits: per.get(d)?.visits ?? 0, visitors: per.get(d)?.visitors ?? 0 })),
      totals, conversion: { newVisitors: conv.fresh, converted: conv.converted }, funnel: { ...funnel, firstPlay },
      referrers: top('referrer'), utm, countries: anyCountry ? top('country') : [], langs: top('lang'), devices: top('device', 5), landings: top('landing'),
    });
  });

  admin.get('/retention', (req, res) => {
    const byWeek = req.query.by === 'week';
    const today = brusselsDay(now());
    if (req.query.who === 'visiteurs') {
      // Cohortes de visiteurs (anonymes compris) : jour ou semaine de la première visite.
      const ws = (d: string) => { const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; return addDays(d, -wd); };
      const fromDay = addDays(today, byWeek ? -7 * 12 : -30);
      const cs = new Map<string, { size: number; d1: number; d7: number; d30: number; ok: [number, number, number] }>();
      for (const p of people()) {
        if (!p.visits || p.firstDay < fromDay) continue;
        const k = byWeek ? ws(p.firstDay) : p.firstDay;
        const c = cs.get(k) ?? { size: 0, d1: 0, d7: 0, d30: 0, ok: [0, 0, 0] };
        c.size++;
        ([[1, 'd1', 0], [7, 'd7', 1], [30, 'd30', 2]] as const).forEach(([kk, key, i]) => { const b = backAt(p, kk, today); if (b != null) { c.ok[i]++; if (b) c[key]++; } });
        cs.set(k, c);
      }
      // Une colonne n'apparaît que si toute la cohorte a eu le temps d'y arriver.
      const rows = [...cs.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, c]) => ({
        cohort: k, size: c.size, d1: c.ok[0] === c.size ? c.d1 : null, d7: c.ok[1] === c.size ? c.d7 : null, d30: c.ok[2] === c.size ? c.d30 : null,
      }));
      return res.json({ ok: true, by: byWeek ? 'week' : 'day', who: 'visiteurs', rows });
    }
    const users = db.prepare('SELECT id, created_at FROM users WHERE created_at >= ?').all(brusselsMidnight(addDays(today, byWeek ? -7 * 12 : -30))) as { id: string; created_at: number }[];
    const active = new Map<string, Set<string>>();
    if (users.length) {
      for (const r of db.prepare(`SELECT user_id, day FROM (${activeUnion}) WHERE day >= ?`).all(addDays(today, byWeek ? -7 * 12 : -30)) as { user_id: string; day: string }[]) {
        let s = active.get(r.user_id); if (!s) active.set(r.user_id, (s = new Set())); s.add(r.day);
      }
    }
    const weekStart = (d: string) => { const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; return addDays(d, -wd); };
    const cohorts = new Map<string, { size: number; d1: number; d7: number; d30: number; first: string }>();
    // Retour JN : le compte a rejoué (ou ouvert le jeu) au moins une fois N jours ou plus après son inscription.
    const back = (days: Set<string> | undefined, d0: string, k: number) => !!days && [...days].some((d) => d >= addDays(d0, k));
    for (const u of users) {
      const d0 = brusselsDay(u.created_at);
      const key = byWeek ? weekStart(d0) : d0;
      const c = cohorts.get(key) ?? { size: 0, d1: 0, d7: 0, d30: 0, first: key };
      const days = active.get(u.id);
      c.size++;
      if (back(days, d0, 1)) c.d1++;
      if (back(days, d0, 7)) c.d7++;
      if (back(days, d0, 30)) c.d30++;
      cohorts.set(key, c);
    }
    // Une colonne n'a de sens que si la cohorte entière a eu le temps d'y arriver.
    const span = byWeek ? 6 : 0;
    const age = (k: string) => Math.round((Date.parse(today) - Date.parse(addDays(k, span))) / DAY_MS);
    const rows = [...cohorts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, c]) => ({
      cohort: k, size: c.size, d1: age(k) >= 1 ? c.d1 : null, d7: age(k) >= 7 ? c.d7 : null, d30: age(k) >= 30 ? c.d30 : null,
    }));
    res.json({ ok: true, by: byWeek ? 'week' : 'day', rows });
  });

  // --- Personnes : une ligne par visiteur (anonyme ou lié à un compte), plus les comptes sans visite suivie ---
  interface Person {
    key: string; label: string; userId: string | null; username: string | null; country: string | null; countrySrc: string | null;
    device: string | null; source: string; firstAt: number; lastAt: number; visits: number; activeDays: number; seconds: number;
    games: number; firstDay: string; days: Set<string>;
  }
  let peopleCache: { at: number; rows: Person[] } | null = null;
  function people(): Person[] {
    if (peopleCache && now() - peopleCache.at < 15_000) return peopleCache.rows;
    const visitors = db.prepare(`SELECT v.visitor, MIN(v.at) AS first, MAX(v.at) AS last, COUNT(*) AS visits, MAX(v.user_id) AS user_id,
        (SELECT referrer FROM visits x WHERE x.visitor = v.visitor ORDER BY x.at LIMIT 1) AS referrer,
        (SELECT utm_source FROM visits x WHERE x.visitor = v.visitor ORDER BY x.at LIMIT 1) AS utm,
        (SELECT utm_campaign FROM visits x WHERE x.visitor = v.visitor ORDER BY x.at LIMIT 1) AS campaign,
        (SELECT country FROM visits x WHERE x.visitor = v.visitor AND x.country IS NOT NULL ORDER BY x.at DESC LIMIT 1) AS country,
        (SELECT country_src FROM visits x WHERE x.visitor = v.visitor AND x.country IS NOT NULL ORDER BY x.at DESC LIMIT 1) AS country_src,
        (SELECT device FROM visits x WHERE x.visitor = v.visitor ORDER BY x.at DESC LIMIT 1) AS device
      FROM visits v GROUP BY v.visitor`).all() as { visitor: string; first: number; last: number; visits: number; user_id: string | null; referrer: string; utm: string | null; campaign: string | null; country: string | null; country_src: string | null; device: string }[];
    const days = new Map<string, Set<string>>();
    const addDay = (k: string, d: string) => { let x = days.get(k); if (!x) days.set(k, (x = new Set())); x.add(d); };
    for (const r of db.prepare('SELECT DISTINCT visitor, day FROM visits').all() as { visitor: string; day: string }[]) addDay(r.visitor, r.day);
    const secs = new Map<string, number>();
    for (const r of db.prepare('SELECT visitor, day, seconds FROM visitor_time').all() as { visitor: string; day: string; seconds: number }[]) {
      secs.set(r.visitor, (secs.get(r.visitor) ?? 0) + r.seconds);
      if (r.seconds >= 10) addDay(r.visitor, r.day);
    }
    const userDays = new Map<string, Set<string>>();
    for (const r of db.prepare(`SELECT user_id, day FROM (${activeUnion})`).all() as { user_id: string; day: string }[]) {
      let x = userDays.get(r.user_id); if (!x) userDays.set(r.user_id, (x = new Set())); x.add(r.day);
    }
    const userGames = new Map((db.prepare('SELECT user_id, COUNT(*) AS n FROM game_players WHERE user_id IS NOT NULL GROUP BY user_id').all() as { user_id: string; n: number }[]).map((r) => [r.user_id, r.n]));
    // Parties d'invité : clé « d:<appareil> », rattachée au visiteur par la même empreinte.
    const guestGames = new Map<string, number>();
    for (const r of db.prepare(`SELECT player_key, COUNT(*) AS n FROM game_players WHERE user_id IS NULL AND player_key LIKE 'd:%' GROUP BY player_key`).all() as { player_key: string; n: number }[]) {
      const h = hash(`d:${r.player_key.slice(2)}`); guestGames.set(h, (guestGames.get(h) ?? 0) + r.n);
    }
    const users = new Map((db.prepare('SELECT id, username, created_at FROM users').all() as { id: string; username: string; created_at: number }[]).map((u) => [u.id, u]));
    const rows: Person[] = [];
    const linked = new Set<string>();
    for (const v of visitors) {
      const u = v.user_id ? users.get(v.user_id) : undefined;
      if (u) linked.add(u.id);
      const d = new Set(days.get(v.visitor) ?? []);
      if (u) for (const x of userDays.get(u.id) ?? []) if (x >= brusselsDay(v.first)) d.add(x);
      const source = v.utm ? `${v.utm}${v.campaign ? ` · ${v.campaign}` : ''} (campagne)` : v.referrer;
      rows.push({
        key: v.visitor, label: `Visiteur #${v.visitor.slice(0, 4)}`, userId: u?.id ?? null, username: u?.username ?? null,
        country: v.country, countrySrc: v.country_src, device: v.device, source, firstAt: v.first, lastAt: v.last, visits: v.visits,
        activeDays: d.size, seconds: secs.get(v.visitor) ?? 0, games: (guestGames.get(v.visitor) ?? 0) + (u ? userGames.get(u.id) ?? 0 : 0),
        firstDay: brusselsDay(v.first), days: d,
      });
    }
    // Comptes jamais vus par le suivi de visite (inscrits avant, ou appli sans suivi).
    for (const u of users.values()) {
      if (linked.has(u.id)) continue;
      const d = new Set(userDays.get(u.id) ?? []);
      const last = Math.max(u.created_at, store.lastSeenOf(u.id));
      rows.push({ key: `u:${u.id}`, label: u.username, userId: u.id, username: u.username, country: null, countrySrc: null, device: null, source: '(non suivi)',
        firstAt: u.created_at, lastAt: last, visits: 0, activeDays: d.size, seconds: 0, games: userGames.get(u.id) ?? 0, firstDay: brusselsDay(u.created_at), days: d });
    }
    peopleCache = { at: now(), rows };
    return rows;
  }
  /** Retour à JN : actif au moins un jour ≥ premier jour + N ; null si c'est encore trop tôt pour le savoir. */
  const backAt = (p: { firstDay: string; days: Set<string> }, k: number, today: string): boolean | null => {
    if (addDays(p.firstDay, k) > today) return null;
    const lim = addDays(p.firstDay, k);
    for (const d of p.days) if (d >= lim) return true;
    return false;
  };

  admin.get('/people', (req, res) => {
    const today = brusselsDay(now());
    const q = String(req.query.q ?? '').trim().toLowerCase().replace(/^#/, '').slice(0, 30);
    const kind = String(req.query.kind ?? '');
    const country = String(req.query.country ?? '');
    const device = String(req.query.device ?? '');
    const sort = String(req.query.sort ?? 'last');
    const page = Math.max(0, Math.floor(Number(req.query.page) || 0));
    const size = Math.min(100, Math.max(5, Math.floor(Number(req.query.size) || 25)));
    let rows = people();
    const countries = [...new Set(rows.map((r) => r.country ?? ''))].map((c) => ({ code: c, name: c ? countryName(c) : 'Inconnu', flag: flag(c) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (kind === 'comptes') rows = rows.filter((r) => r.userId);
    else if (kind === 'visiteurs') rows = rows.filter((r) => !r.userId);
    if (country) rows = rows.filter((r) => (r.country ?? '-') === country);
    if (device) rows = rows.filter((r) => r.device === device);
    if (q) rows = rows.filter((r) => r.key.startsWith(q) || (r.username ?? '').toLowerCase().includes(q) || r.label.toLowerCase().includes(q));
    const by: Record<string, (a: Person, b: Person) => number> = {
      last: (a, b) => b.lastAt - a.lastAt, first: (a, b) => b.firstAt - a.firstAt, time: (a, b) => b.seconds - a.seconds || b.lastAt - a.lastAt,
      visits: (a, b) => b.visits - a.visits || b.lastAt - a.lastAt, days: (a, b) => b.activeDays - a.activeDays || b.lastAt - a.lastAt,
    };
    rows = [...rows].sort(by[sort] ?? by.last);
    res.json({
      ok: true, total: rows.length, page, size, countries,
      people: rows.slice(page * size, page * size + size).map((r) => ({
        key: r.key, label: r.label, userId: r.userId, username: r.username, country: r.country, countryName: r.country ? countryName(r.country) : 'Inconnu',
        flag: flag(r.country), countrySrc: r.countrySrc ? COUNTRY_SOURCE_LABEL[r.countrySrc as CountrySource] ?? null : null,
        device: r.device, source: r.source, firstAt: r.firstAt, lastAt: r.lastAt, visits: r.visits, activeDays: r.activeDays,
        seconds: r.seconds, avgSeconds: r.visits ? Math.round(r.seconds / r.visits) : 0, games: r.games,
        back: { d1: backAt(r, 1, today), d7: backAt(r, 7, today), d30: backAt(r, 30, today) },
      })),
    });
  });

  // Synthèses : temps passé (moyennes, par jour) et répartition par pays.
  admin.get('/audience', (req, res) => {
    const n = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const today = brusselsDay(now()), from = addDays(today, -(n - 1));
    const perDay = new Map((db.prepare('SELECT day, SUM(seconds) AS s, COUNT(*) AS v FROM visitor_time WHERE day >= ? AND seconds > 0 GROUP BY day').all(from) as { day: string; s: number; v: number }[]).map((r) => [r.day, r]));
    const tot = db.prepare('SELECT COALESCE(SUM(seconds), 0) AS s, COUNT(*) AS pairs, COUNT(DISTINCT visitor) AS v FROM visitor_time WHERE day >= ? AND seconds > 0').get(from) as { s: number; pairs: number; v: number };
    const visitsN = (db.prepare('SELECT COUNT(*) AS n FROM visits WHERE day >= ?').get(from) as { n: number }).n;
    const rows = people().filter((p) => p.lastAt >= brusselsMidnight(from));
    const byCountry = new Map<string, { visitors: number; accounts: number; seconds: number; d1: [number, number]; d7: [number, number]; src: Map<string, number> }>();
    for (const p of rows) {
      const k = p.country ?? '';
      const c = byCountry.get(k) ?? { visitors: 0, accounts: 0, seconds: 0, d1: [0, 0], d7: [0, 0], src: new Map() };
      c.visitors++;
      if (p.userId) c.accounts++;
      c.seconds += p.seconds;
      for (const [key, kk] of [['d1', 1], ['d7', 7]] as const) { const b = backAt(p, kk, today); if (b != null) { c[key][1]++; if (b) c[key][0]++; } }
      if (p.countrySrc) c.src.set(p.countrySrc, (c.src.get(p.countrySrc) ?? 0) + 1);
      byCountry.set(k, c);
    }
    const countries = [...byCountry.entries()].map(([k, c]) => ({
      code: k || null, name: k ? countryName(k) : 'Inconnu', flag: flag(k), visitors: c.visitors, accounts: c.accounts, seconds: c.seconds,
      avgSeconds: c.visitors ? Math.round(c.seconds / c.visitors) : 0,
      d1: c.d1[1] ? c.d1[0] / c.d1[1] : null, d7: c.d7[1] ? c.d7[0] / c.d7[1] : null,
      method: [...c.src.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => COUNTRY_SOURCE_LABEL[m as CountrySource]).filter(Boolean)[0] ?? null,
    })).sort((a, b) => b.visitors - a.visitors || b.seconds - a.seconds);
    res.json({
      ok: true,
      totals: { seconds: tot.s, visitors: tot.v, avgPerVisitorDay: tot.pairs ? Math.round(tot.s / tot.pairs) : 0, avgPerVisitor: tot.v ? Math.round(tot.s / tot.v) : 0, avgPerVisit: visitsN ? Math.round(tot.s / visitsN) : 0 },
      days: series(from, n).map((d) => { const r = perDay.get(d); return { day: d, avg: r && r.v ? Math.round(r.s / r.v / 60 * 10) / 10 : 0, minutes: r ? Math.round(r.s / 60) : 0 }; }),
      countries,
    });
  });

  admin.get('/economy', (req, res) => {
    const n = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const day = brusselsDay(now()), from = addDays(day, -(n - 1));
    const bySource = (db.prepare('SELECT source, SUM(earned) AS earned, SUM(spent) AS spent FROM economy WHERE day >= ? GROUP BY source ORDER BY SUM(earned) + SUM(spent) DESC').all(from) as { source: string; earned: number; spent: number }[])
      .map((r) => ({ ...r, label: SOURCE_LABELS[r.source] ?? r.source }));
    const per = new Map((db.prepare('SELECT day, SUM(earned) AS earned, SUM(spent) AS spent FROM economy WHERE day >= ? GROUP BY day').all(from) as { day: string; earned: number; spent: number }[]).map((r) => [r.day, r]));
    const richest = (db.prepare(`SELECT username, json_extract(profile, '$.coins') AS coins FROM users ORDER BY coins DESC LIMIT 10`).all() as { username: string; coins: number }[]);
    res.json({ ok: true, bySource, days: series(from, n).map((d) => ({ day: d, earned: per.get(d)?.earned ?? 0, spent: per.get(d)?.spent ?? 0 })), richest });
  });

  // « En ligne maintenant » : chaque appareil relié, ce qu'il fait, d'où il vient (jamais d'IP).
  admin.get('/live', (_req, res) => {
    const t = now();
    const today = brusselsDay(t);
    const rowsP = people();
    const byKey = new Map(rowsP.map((p) => [p.key, p]));
    const byUser = new Map<string, Person>();
    for (const p of rowsP) if (p.userId && (!byUser.has(p.userId) || p.lastAt > byUser.get(p.userId)!.lastAt)) byUser.set(p.userId, p);
    const live = buildLive(opts.presence?.() ?? [], {
      now: t,
      seatOf: (id) => opts.seatOf?.(id) ?? null,
      codeKnown: (c) => opts.codeKnown?.(c) ?? false,
      visitorKey: (device) => hash(`d:${device}`),
      visitorInfo: (key, userId) => {
        const p = byKey.get(key) ?? (userId ? byUser.get(userId) : undefined);
        if (!p) return null;
        return { country: p.country, countryName: p.country ? countryName(p.country) : null, flag: p.country ? flag(p.country) : null, newcomer: p.firstDay === today, activeDays: p.activeDays };
      },
      userInfo: (id) => {
        const u = store.userById(id);
        if (!u) return null;
        return { username: u.username, level: levelInfo(store.profileOf(u).xp).level, photo: toPublic(u).photo ?? null, admin: opts.isAdmin(u) };
      },
    });
    res.json({ ok: true, at: t, ...live });
  });

  router.use('/admin', admin);
  return { router, attach, isBanned, banOf, banText, ban, unban, log, tournamentFinished, activity };
}
