/**
 * Statistiques de TOUS les jeux pour l'administration (onglet « Jeux » et aperçu ventilé par jeu).
 *
 * Ce qui existait déjà, et qui est relu ici sans être modifié :
 *  - 421 : games_log + game_players (server/stats.ts) — parties terminées solo (comptes et invités) et
 *    en ligne, depuis le début ;
 *  - Coups Fourrés : cf_stat_games + cf_stat_players (server/cf-stats.ts) — comptes seulement, parties
 *    vérifiées (en ligne, tournoi, contre l'ordinateur rejouées par le serveur) ;
 *  - Courtisan et Poker menteur en ligne : simple compteur par jour (pub_counts « game:courtisan » /
 *    « game:poker », server/chiffres.ts), sans joueurs ni durée ;
 *  - Groschen : dm_wallet (soldes) et dm_ledger (tous les mouvements) ;
 *  - profils : totaux cumulés par compte (dm.games, pm.games, stats.bossWins, étoiles de la Tournée « tdc ») ;
 *  - tournois programmés : sched_slots / sched_regs ; tournois terminés : daily_counts « tournois » ;
 *  - premier jeu lancé par un visiteur : visit_events first_play (jeu, provenance).
 *
 * Ce qui commence à être enregistré ICI (table game_runs, une ligne par partie terminée) :
 *  - Courtisan et Poker menteur : solo des comptes (/dixmille|poker/start|end), solo des invités (petit
 *    jeton anonyme, routes /stats/guest/start|end), tables du serveur (en ligne, ordinateurs compris) ;
 *  - 421 : détails seulement (variante, partie libre / patron / fête / Tournée / tournoi / partie rapide) pour
 *    le solo des comptes et les tables en ligne — les COMPTES du 421 restent ceux de games_log.
 * Joueurs : clé opaque (« u:<compte> », « d:<empreinte d'appareil> » ou « g:<partie> » pour un invité) ; à la
 * suppression d'un compte, ses lignes sont anonymisées. Rien n'est jamais renvoyé au client hors administration.
 * Une statistique ne doit jamais gêner une partie : toutes les écritures sont protégées.
 */
import { createHash, randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Store, UserRow } from './db';
import { brusselsDay, brusselsMidnight } from './stats';
import { isSuddenDeath, type GameConfig } from '../shared/config';
import { BOSSES } from '../shared/progress/boss';
import { starCount, TDC_BISTROS } from '../shared/progress/comptoirs';
import { setupDmFrom } from '../shared/rejeu/dixmille';
import { setupPmFrom } from '../shared/rejeu/poker';

export type RunGame = '421' | 'courtisan' | 'poker';
export type GameKey = RunGame | 'cf';
export const GAME_KEYS: GameKey[] = ['421', 'courtisan', 'cf', 'poker'];

export interface RunPlayer { key: string; userId: string | null; won: boolean; left?: boolean }
export interface RunInput {
  game: RunGame;
  /** 'solo' : contre l'ordinateur (sur l'appareil, ou table du serveur sans autre humain pour le Courtisan avec mise). */
  mode: 'solo' | 'online';
  /** Partie jouée par le serveur (résultat sûr) plutôt que sur l'appareil. */
  server: boolean;
  startedAt: number;
  endedAt?: number;
  bots: number;
  level?: string | null;
  variant?: string | null;
  kind?: string | null;
  opts?: Record<string, string | number | boolean>;
  players: RunPlayer[];
}

const DAY_MS = 86_400_000;
const jjmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '?');
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const ready = new WeakSet<DatabaseSync>();
function ensure(store: Store): DatabaseSync {
  const db = store.sqlite;
  if (ready.has(db)) return db;
  db.exec(`
    -- Parties terminées du Courtisan, du Poker menteur, et détails du 421 (administration seulement).
    CREATE TABLE IF NOT EXISTS game_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game TEXT NOT NULL, mode TEXT NOT NULL, server INTEGER NOT NULL DEFAULT 0,
      humans INTEGER NOT NULL, bots INTEGER NOT NULL, guests INTEGER NOT NULL DEFAULT 0, abandoned INTEGER NOT NULL DEFAULT 0,
      level TEXT, variant TEXT, kind TEXT, opts TEXT,
      started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, duration_s INTEGER NOT NULL, day TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_game_runs_day ON game_runs(game, day);
    CREATE TABLE IF NOT EXISTS game_run_players (
      run_id INTEGER NOT NULL, player_key TEXT NOT NULL, user_id TEXT, won INTEGER NOT NULL, left_early INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (run_id, player_key)
    );
    CREATE INDEX IF NOT EXISTS idx_game_run_players_user ON game_run_players(user_id);
    -- Parties commencées (solo) par jour : avec les parties terminées, donne une idée des abandons.
    CREATE TABLE IF NOT EXISTS game_starts (day TEXT NOT NULL, game TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, game, who));
  `);
  if (!store.getMeta('game_runs_since')) store.setMeta('game_runs_since', brusselsDay(Date.now()));
  ready.add(db);
  return db;
}

/** Enregistre une partie terminée (jamais bloquant). */
export function noteRun(store: Store, r: RunInput) {
  try {
    const db = ensure(store);
    const end = r.endedAt ?? Date.now();
    const humans = r.players.length;
    if (!humans) return;
    const res = db.prepare(`INSERT INTO game_runs (game, mode, server, humans, bots, guests, abandoned, level, variant, kind, opts, started_at, ended_at, duration_s, day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      r.game, r.mode, r.server ? 1 : 0, humans, Math.max(0, r.bots), r.players.filter((p) => !p.userId).length, r.players.filter((p) => p.left).length,
      r.level ?? null, r.variant ?? null, r.kind ?? null, r.opts ? JSON.stringify(r.opts) : null,
      r.startedAt, end, Math.max(0, Math.round((end - r.startedAt) / 1000)), brusselsDay(end));
    const id = Number(res.lastInsertRowid);
    const ins = db.prepare('INSERT OR IGNORE INTO game_run_players (run_id, player_key, user_id, won, left_early) VALUES (?, ?, ?, ?, ?)');
    for (const p of r.players) ins.run(id, p.key.slice(0, 80), p.userId, p.won ? 1 : 0, p.left ? 1 : 0);
  } catch (e) { console.warn('[games-stats] partie non notée', e); }
}

export function noteStart(store: Store, game: RunGame | 'cf', who: 'compte' | 'invite') {
  try {
    ensure(store).prepare('INSERT INTO game_starts (day, game, who, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, game, who) DO UPDATE SET n = n + 1').run(brusselsDay(Date.now()), game, who);
  } catch { /* jamais bloquant */ }
}

/** Variante du 421 telle qu'on la nomme dans le jeu (préréglages Blitz et Mort subite reconnus). */
export function variant421(c: Partial<GameConfig> | null | undefined): string | null {
  if (!c?.variant) return null;
  if (isSuddenDeath({ variant: c.variant, rounds: c.rounds ?? 0 })) return 'mort-subite';
  if (c.variant === 'classique' && (c.turnSeconds ?? 30) > 0 && (c.turnSeconds ?? 30) <= 10) return 'blitz';
  return c.variant;
}
/** Genre de partie solo du 421 d'après l'étiquette du jeton (« tdc:<bistrot> », patron, fête). */
export function kind421(tag: string | null | undefined): string {
  if (!tag) return 'libre';
  if (tag.startsWith('tdc:')) return tag;
  return BOSSES.some((b) => b.id === tag) ? 'patron' : 'fete';
}

// --- Parties solo en cours (jeton → table), par base ----------------------------------------------
interface Pending { game: RunGame; startedAt: number; key: string; userId: string | null; level?: string | null; variant?: string | null; kind?: string | null; bots: number; opts?: RunInput['opts'] }
const pendingBy = new WeakMap<DatabaseSync, Map<string, Pending>>();
function pendingOf(store: Store) {
  let m = pendingBy.get(store.sqlite);
  if (!m) { m = new Map(); pendingBy.set(store.sqlite, m); }
  const cut = Date.now() - 12 * 3600_000;
  if (m.size > 2000) for (const [k, v] of m) if (v.startedAt < cut) m.delete(k);
  return m;
}
/** Début d'une partie solo d'un compte (appelé par server/accounts.ts). */
export function soloStart(store: Store, token: string, p: Omit<Pending, 'startedAt' | 'key'> & { userId: string }) {
  try {
    pendingOf(store).set(token, { ...p, startedAt: Date.now(), key: `u:${p.userId}` });
    noteStart(store, p.game, 'compte');
  } catch { /* jamais bloquant */ }
}
/** Fin d'une partie solo (jeton à usage unique). `bots` : nombre réel d'adversaires s'il est connu à la fin. */
export function soloEnd(store: Store, token: unknown, o: { won: boolean; bots?: number; level?: string | null; extra?: RunInput['opts'] }) {
  try {
    if (typeof token !== 'string') return;
    const m = pendingOf(store);
    const p = m.get(token);
    if (!p) return;
    m.delete(token);
    noteRun(store, {
      game: p.game, mode: 'solo', server: false, startedAt: p.startedAt, bots: o.bots ?? p.bots, level: o.level ?? p.level, variant: p.variant, kind: p.kind,
      opts: { ...p.opts, ...o.extra }, players: [{ key: p.key, userId: p.userId, won: o.won }],
    });
  } catch { /* jamais bloquant */ }
}

// --- Routes : invités (solo sur l'appareil) et administration -----------------------------------
export function createGamesStats(store: Store, opts: { isAdmin: (u: UserRow | undefined) => boolean; userFromToken: (t: unknown) => UserRow | undefined; minSoloMs?: number; now?: () => number }) {
  const db = ensure(store);
  const now = opts.now ?? Date.now;
  const MIN_SOLO = opts.minSoloMs ?? 20_000;
  // Ménage : deux ans gardés.
  try {
    const old = brusselsDay(now() - 730 * DAY_MS);
    db.prepare('DELETE FROM game_run_players WHERE run_id IN (SELECT id FROM game_runs WHERE day < ?)').run(old);
    db.prepare('DELETE FROM game_runs WHERE day < ?').run(old);
  } catch { /* */ }
  // Compte supprimé : ses parties restent dans les totaux, sans lien avec lui.
  const prevDelete = store.onUserDelete;
  store.onUserDelete = (userId) => {
    try { prevDelete?.(userId); } finally {
      try { db.prepare(`UPDATE game_run_players SET user_id = NULL, player_key = 'x:' || run_id || ':' || abs(random() % 1000000) WHERE user_id = ?`).run(userId); } catch { /* */ }
    }
  };

  const router = express.Router();
  const json = express.json({ limit: '4kb' });

  // Invités : Courtisan et Poker menteur contre l'ordinateur se jouent sur l'appareil. Un jeton anonyme au
  // début, la fin acceptée une fois après la durée minimale ; résultat annoncé par l'appareil (statistique seulement).
  const guest = new Map<string, Pending & { ip: string }>();
  const perIpDay = new Map<string, number>();
  const salt = (() => { let s = store.getMeta('visit_salt'); if (!s) { s = randomUUID(); store.setMeta('visit_salt', s); } return s; })();
  router.post('/stats/guest/start', json, (req, res) => {
    const b = req.body ?? {};
    const game: RunGame | null = b.game === 'courtisan' || b.game === 'poker' ? b.game : null;
    if (!game) return res.status(400).json({ ok: false, error: 'Jeu inconnu.' });
    const ip = req.ip ?? '?';
    const t = now();
    for (const [k, v] of guest) if (t - v.startedAt > 6 * 3600_000) guest.delete(k);
    if ([...guest.values()].filter((v) => v.ip === ip).length >= 20) return res.status(429).json({ ok: false, error: 'Trop de parties ouvertes.' });
    const token = randomUUID();
    let level: string | null = null, bots = 1;
    let o: RunInput['opts'] | undefined;
    if (game === 'courtisan') { const s = setupDmFrom(b.setup, { campaign: true }); if (s) { level = s.level; bots = s.bots.length; o = { target: s.target }; } }
    else { const s = setupPmFrom(b.setup); if (s) { level = s.level; bots = s.bots.length; o = { lives: s.lives, noStraights: s.noStraights }; } }
    guest.set(token, { game, startedAt: t, ip, key: `g:${token}`, userId: null, level, bots, opts: o });
    noteStart(store, game, 'invite');
    res.json({ ok: true, token });
  });
  router.post('/stats/guest/end', json, (req, res) => {
    const b = req.body ?? {};
    const g = typeof b.token === 'string' ? guest.get(b.token) : undefined;
    if (!g) return res.status(400).json({ ok: false, error: 'Partie inconnue.' });
    const t = now();
    if (t - g.startedAt < MIN_SOLO) return res.status(400).json({ ok: false, error: 'Partie trop courte.' });
    guest.delete(b.token);
    const k = `${brusselsDay(t)}|${g.ip}`;
    const n = (perIpDay.get(k) ?? 0) + 1;
    perIpDay.set(k, n);
    if (perIpDay.size > 5000) perIpDay.clear();
    if (n > 150) return res.status(429).json({ ok: false, error: 'Plafond atteint.' });
    // Appareil : seulement une empreinte salée (comme les visites), pour compter les joueurs distincts.
    const dev = typeof b.device === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.device) ? `d:${createHash('sha256').update(`${salt}|${b.device}`).digest('hex').slice(0, 24)}` : g.key;
    noteRun(store, { game: g.game, mode: 'solo', server: false, startedAt: g.startedAt, endedAt: t, bots: g.bots, level: g.level, opts: g.opts, players: [{ key: dev, userId: null, won: !!b.won }] });
    res.json({ ok: true });
  });

  const adminOf = (req: Request) => {
    const h = req.headers.authorization ?? '';
    const u = opts.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    return opts.isAdmin(u) ? u : undefined;
  };
  let cache: { at: number; data: object } | null = null;
  router.get('/admin/games', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!adminOf(req)) return res.status(403).json({ ok: false, error: 'Accès réservé à l’administration.' });
    const t = now();
    if (!cache || t - cache.at > 20_000 || req.query.fresh) cache = { at: t, data: gamesReport(store, t) };
    res.json({ ok: true, ...cache.data });
  });
  return { router };
}

// --- Calcul du rapport ----------------------------------------------------------------------------
interface Run { id: string; day: string; mode: 'solo' | 'online'; dur: number; keys: string[] }
const all = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T[] => {
  try { return db.prepare(sql).all(...args) as unknown as T[]; } catch { return []; }
};
const one = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T | undefined => {
  try { return db.prepare(sql).get(...args) as unknown as T | undefined; } catch { return undefined; }
};
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const parse = (s: string | null): Record<string, unknown> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
function group(rows: { id: string | number; day: string; mode: string; dur: number; key: string | null }[]): Run[] {
  const m = new Map<string, Run>();
  for (const r of rows) {
    const id = String(r.id);
    let x = m.get(id);
    if (!x) { x = { id, day: r.day, mode: r.mode === 'solo' ? 'solo' : 'online', dur: r.dur, keys: [] }; m.set(id, x); }
    if (r.key) x.keys.push(r.key);
  }
  return [...m.values()];
}
const tally = <T>(xs: T[], f: (x: T) => string | null | undefined) => {
  const m = new Map<string, number>();
  for (const x of xs) { const k = f(x); if (k != null) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
};

export function gamesReport(store: Store, t = Date.now()) {
  const db = ensure(store);
  const day = brusselsDay(t);
  const from = addDays(day, -29), from7 = addDays(day, -6);
  const runsSince = store.getMeta('game_runs_since') ?? day;
  const pubSince = store.getMeta('pub_since');

  // Parties des 30 derniers jours, par jeu (chacun depuis sa meilleure source).
  const runs: Record<GameKey, Run[]> = {
    '421': group(all(db, `SELECT g.id, g.day, g.mode, g.duration_s AS dur, gp.player_key AS key FROM games_log g LEFT JOIN game_players gp ON gp.game_id = g.id WHERE g.day >= ?`, from)),
    cf: group(all<{ id: number; at: number; mode: string; d: number; key: string | null }>(db,
      `SELECT g.id, g.at, g.mode, g.duration_ms AS d, 'u:' || p.user_id AS key FROM cf_stat_games g LEFT JOIN cf_stat_players p ON p.game_id = g.id WHERE g.at >= ?`, brusselsMidnight(from))
      .map((r) => ({ id: r.id, day: brusselsDay(r.at), mode: r.mode === 'bot' ? 'solo' : 'online', dur: Math.round(r.d / 1000), key: r.key }))),
    courtisan: [], poker: [],
  };
  for (const g of ['courtisan', 'poker'] as const) {
    runs[g] = group(all(db, `SELECT r.id, r.day, r.mode, r.duration_s AS dur, p.player_key AS key FROM game_runs r LEFT JOIN game_run_players p ON p.run_id = r.id WHERE r.game = ? AND r.day >= ?`, g, from));
  }
  // Avant game_runs : parties en ligne du Courtisan / du Poker menteur comptées par « Le 421 en chiffres ».
  const legacyOnline: Record<string, Map<string, number>> = {};
  for (const g of ['courtisan', 'poker'] as const) {
    legacyOnline[g] = new Map(all<{ day: string; n: number }>(db, `SELECT day, n FROM pub_counts WHERE key = ? AND day >= ? AND day < ?`, `game:${g}`, from, runsSince).map((r) => [r.day, r.n]));
  }
  const since: Record<GameKey, { all: string | null; solo: string | null; online: string | null; note: string }> = {
    '421': { all: one<{ d: string | null }>(db, 'SELECT MIN(day) AS d FROM games_log')?.d ?? null, solo: null, online: null, note: 'Comptes et invités, solo et en ligne.' },
    cf: (() => { const a = one<{ a: number | null }>(db, 'SELECT MIN(at) AS a FROM cf_stat_games')?.a; return { all: a ? brusselsDay(a) : null, solo: null, online: null, note: 'Comptes seulement (parties vérifiées : en ligne, tournoi, ordinateur rejoué). Invités non mesurés.' }; })(),
    courtisan: { all: runsSince, solo: runsSince, online: pubSince && pubSince < runsSince ? pubSince : runsSince, note: '' },
    poker: { all: runsSince, solo: runsSince, online: pubSince && pubSince < runsSince ? pubSince : runsSince, note: '' },
  };
  for (const g of ['courtisan', 'poker'] as const) {
    since[g].note = `Solo (comptes et invités), joueurs et durées mesurés depuis le ${jjmm(since[g].solo)}${since[g].online !== since[g].solo ? ` ; parties en ligne comptées (sans joueurs ni durée) depuis le ${jjmm(since[g].online)}` : ''}.`;
  }

  const days = Array.from({ length: 30 }, (_, i) => addDays(from, i)).map((d) => {
    const row: Record<string, number | string> = { day: d };
    for (const g of GAME_KEYS) {
      const rs = runs[g].filter((r) => r.day === d);
      row[`${g}_solo`] = rs.filter((r) => r.mode === 'solo').length;
      row[`${g}_online`] = rs.filter((r) => r.mode === 'online').length + (legacyOnline[g]?.get(d) ?? 0);
    }
    return row;
  });

  const per = Object.fromEntries(GAME_KEYS.map((g) => {
    const rs = runs[g];
    const d7 = rs.filter((r) => r.day >= from7);
    const keys = (xs: Run[]) => new Set(xs.flatMap((r) => r.keys));
    const accounts = (xs: Run[]) => [...keys(xs)].filter((k) => k.startsWith('u:')).length;
    const legacy = [...(legacyOnline[g]?.entries() ?? [])];
    const legacyN = (f: string) => legacy.filter(([d]) => d >= f).reduce((a, [, n]) => a + n, 0);
    const n30 = rs.length + legacyN(from);
    const online30 = rs.filter((r) => r.mode === 'online').length + legacyN(from);
    return [g, {
      today: rs.filter((r) => r.day === day).length + (legacyOnline[g]?.get(day) ?? 0),
      d7: d7.length + legacyN(from7), d30: n30,
      solo30: rs.filter((r) => r.mode === 'solo').length, online30,
      players7: keys(d7).size, players30: keys(rs).size, accounts7: accounts(d7), accounts30: accounts(rs),
      medianS: median(rs.map((r) => r.dur)), medianSoloS: median(rs.filter((r) => r.mode === 'solo').map((r) => r.dur)), medianOnlineS: median(rs.filter((r) => r.mode === 'online').map((r) => r.dur)),
      onlineShare: n30 ? online30 / n30 : null,
      since: since[g],
    }];
  }));

  // Qui joue à quoi : comptes actifs sur 7 jours, par jeu, et nombre de jeux différents par compte.
  const byUser = new Map<string, Set<GameKey>>();
  for (const g of GAME_KEYS) for (const r of runs[g]) if (r.day >= from7) for (const k of r.keys) if (k.startsWith('u:')) {
    const s = byUser.get(k) ?? new Set<GameKey>(); s.add(g); byUser.set(k, s);
  }
  const combos = tally([...byUser.values()], (s) => GAME_KEYS.filter((g) => s.has(g)).join('+'));
  const who = {
    accounts: byUser.size,
    perGame: Object.fromEntries(GAME_KEYS.map((g) => [g, [...byUser.values()].filter((s) => s.has(g)).length])),
    gamesPerAccount: [1, 2, 3, 4].map((n) => ({ n, accounts: [...byUser.values()].filter((s) => s.size === n).length })),
    combos: combos.slice(0, 8),
  };

  // Abandons approximatifs : parties solo commencées / terminées (30 jours, depuis game_runs).
  const starts = all<{ game: string; who: string; n: number }>(db, 'SELECT game, who, SUM(n) AS n FROM game_starts WHERE day >= ? GROUP BY game, who', from);
  const runDetails = (g: RunGame) => all<{ mode: string; server: number; humans: number; bots: number; guests: number; abandoned: number; level: string | null; variant: string | null; kind: string | null; opts: string | null; duration_s: number }>(db,
    'SELECT mode, server, humans, bots, guests, abandoned, level, variant, kind, opts, duration_s FROM game_runs WHERE game = ? AND day >= ?', g, from);
  const wonRate = (g: RunGame) => one<{ n: number; w: number }>(db, `SELECT COUNT(*) AS n, COALESCE(SUM(p.won), 0) AS w FROM game_run_players p JOIN game_runs r ON r.id = p.run_id WHERE r.game = ? AND r.mode = 'solo' AND r.day >= ?`, g, from);
  const startsOf = (g: string) => ({ compte: starts.find((s) => s.game === g && s.who === 'compte')?.n ?? 0, invite: starts.find((s) => s.game === g && s.who === 'invite')?.n ?? 0 });

  // Profils (totaux cumulés, toute la vie des comptes).
  const prof = all<{ tdc: string | null; bw: number | null; dm: number | null; pm: number | null }>(db,
    `SELECT json_extract(profile, '$.tdc') AS tdc, json_extract(profile, '$.stats.bossWins') AS bw, json_extract(profile, '$.dm.games') AS dm, json_extract(profile, '$.pm.games') AS pm FROM users`);
  const tdcStars = new Map<string, { stars: number; won: number }>();
  let starsTotal = 0, starsAccounts = 0, bossWins = 0, dmGames = 0, dmAccounts = 0, pmGames = 0, pmAccounts = 0;
  for (const p of prof) {
    bossWins += Number(p.bw) || 0;
    if (Number(p.dm) > 0) { dmGames += Number(p.dm); dmAccounts++; }
    if (Number(p.pm) > 0) { pmGames += Number(p.pm); pmAccounts++; }
    const tdc = parse(p.tdc);
    let mine = 0;
    for (const [b, mask] of Object.entries(tdc)) {
      const m = Number(mask) || 0;
      const s = starCount(m);
      mine += s;
      const x = tdcStars.get(b) ?? { stars: 0, won: 0 };
      x.stars += s; if (m & 1) x.won++;
      tdcStars.set(b, x);
    }
    starsTotal += mine;
    if (mine) starsAccounts++;
  }

  // 421 : détails (game_runs) + tournois.
  const r421 = runDetails('421');
  const kindLabel = (k: string | null) => (!k ? 'inconnu' : k.startsWith('tdc:') ? 'Tournée des comptoirs' : k);
  const sched = {
    slots: tally(all<{ status: string }>(db, 'SELECT status FROM sched_slots WHERE starts_at >= ?', brusselsMidnight(from)), (s) => s.status),
    regs: tally(all<{ status: string }>(db, 'SELECT r.status FROM sched_regs r JOIN sched_slots s ON s.id = r.slot_id WHERE s.starts_at >= ?', brusselsMidnight(from)), (s) => s.status),
  };
  const tournois30 = one<{ n: number }>(db, `SELECT COALESCE(SUM(n), 0) AS n FROM daily_counts WHERE key = 'tournois' AND day >= ?`, from)?.n ?? 0;
  const bistroName = (id: string) => { const b = TDC_BISTROS.find((x) => x.id === id); return b ? `${id.replace(/-/g, ' ')} (${b.patron})` : id; };
  const game421 = {
    measuredSince: runsSince,
    runs: r421.length,
    variants: tally(r421, (r) => r.variant ?? 'inconnue'),
    kinds: tally(r421, (r) => kindLabel(r.kind)),
    soloKinds: tally(r421.filter((r) => r.mode === 'solo'), (r) => kindLabel(r.kind)),
    tdcPlayed: tally(r421.filter((r) => r.kind?.startsWith('tdc:')), (r) => bistroName(r.kind!.slice(4))).slice(0, 10),
    tdc: {
      starsTotal, starsAccounts,
      byBistro: [...tdcStars.entries()].map(([k, v]) => ({ k: bistroName(k), stars: v.stars, won: v.won })).sort((a, b) => b.stars - a.stars).slice(0, 15),
      bistros: TDC_BISTROS.length,
    },
    boss: { winsAllTime: bossWins, games30: r421.filter((r) => r.kind === 'patron').length },
    fete30: r421.filter((r) => r.kind === 'fete').length,
    sched, tournois30,
    starts: startsOf('421'),
  };

  // Courtisan : objectifs, ordinateurs, mises ; Groschen (journal complet).
  const dmRuns = runDetails('courtisan');
  const botLevels = (rs: typeof dmRuns) => {
    const m = new Map<string, number>();
    for (const r of rs) {
      const o = parse(r.opts);
      const lv = typeof o.levels === 'string' && o.levels ? o.levels.split(',') : r.level && r.bots ? Array(r.bots).fill(r.level) : [];
      for (const l of new Set(lv)) m.set(l, (m.get(l) ?? 0) + 1);
    }
    return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
  };
  const wallet = one<{ total: number; holders: number }>(db, 'SELECT COALESCE(SUM(balance), 0) AS total, COUNT(*) AS holders FROM dm_wallet WHERE balance > 0') ?? { total: 0, holders: 0 };
  const ledger = all<{ reason: string; n: number; sum: number; users: number }>(db,
    'SELECT reason, COUNT(*) AS n, COALESCE(SUM(delta), 0) AS sum, COUNT(DISTINCT user_id) AS users FROM dm_ledger WHERE at >= ? GROUP BY reason ORDER BY reason', brusselsMidnight(from));
  const ledgerSince = one<{ a: number | null }>(db, 'SELECT MIN(at) AS a FROM dm_ledger')?.a ?? null;
  const dmWon = wonRate('courtisan');
  const courtisan = {
    measuredSince: runsSince, runs: dmRuns.length,
    targets: tally(dmRuns, (r) => (parse(r.opts).target != null ? String(parse(r.opts).target) : 'inconnu')),
    levels: botLevels(dmRuns),
    players: tally(dmRuns, (r) => String(r.humans + r.bots)),
    stakes: tally(dmRuns.filter((r) => r.server), (r) => { const s = Number(parse(r.opts).stake) || 0; return s ? `${s} Groschen` : 'sans mise'; }),
    guests: dmRuns.filter((r) => r.mode === 'solo' && r.guests > 0).length,
    abandoned: dmRuns.reduce((a, r) => a + r.abandoned, 0),
    soloWinRate: dmWon?.n ? dmWon.w / dmWon.n : null,
    starts: startsOf('courtisan'),
    profiles: { games: dmGames, accounts: dmAccounts },
    groschen: { circulation: wallet.total, holders: wallet.holders, since: ledgerSince ? brusselsDay(ledgerSince) : null, ledger },
  };

  // Poker menteur : vies, joueurs, niveaux, durée.
  const pmRuns = runDetails('poker');
  const pmWon = wonRate('poker');
  const poker = {
    measuredSince: runsSince, runs: pmRuns.length,
    lives: tally(pmRuns, (r) => (parse(r.opts).lives != null ? `${parse(r.opts).lives} vies` : 'inconnu')),
    noStraights: pmRuns.filter((r) => parse(r.opts).noStraights === true).length,
    players: tally(pmRuns, (r) => String(r.humans + r.bots)),
    levels: botLevels(pmRuns),
    medianSoloS: median(pmRuns.filter((r) => r.mode === 'solo').map((r) => r.duration_s)),
    medianOnlineS: median(pmRuns.filter((r) => r.mode === 'online').map((r) => r.duration_s)),
    guests: pmRuns.filter((r) => r.mode === 'solo' && r.guests > 0).length,
    abandoned: pmRuns.reduce((a, r) => a + r.abandoned, 0),
    soloWinRate: pmWon?.n ? pmWon.w / pmWon.n : null,
    starts: startsOf('poker'),
    profiles: { games: pmGames, accounts: pmAccounts },
  };

  // Coups Fourrés : résumé (le détail par carte est dans son propre onglet).
  const cfRows = all<{ mode: string; level: string | null; players: number; rounds: number; duration_ms: number }>(db,
    'SELECT mode, level, players, rounds, duration_ms FROM cf_stat_games WHERE at >= ?', brusselsMidnight(from));
  const cf = {
    runs: cfRows.length,
    modes: tally(cfRows, (r) => r.mode),
    levels: tally(cfRows.filter((r) => r.mode === 'bot'), (r) => r.level ?? 'inconnu'),
    players: tally(cfRows, (r) => String(r.players)),
    medianS: median(cfRows.map((r) => Math.round(r.duration_ms / 1000))),
    avgRounds: cfRows.length ? cfRows.reduce((a, r) => a + r.rounds, 0) / cfRows.length : null,
  };

  // Accueil : premier jeu lancé par les nouveaux visiteurs (une fois par visiteur), par provenance.
  const firstPlay = all<{ game: string | null; via: string | null; n: number }>(db,
    `SELECT game, via, COUNT(*) AS n FROM visit_events WHERE kind = 'first_play' AND day >= ? GROUP BY game, via`, from);
  const firstSince = one<{ d: string | null }>(db, `SELECT MIN(day) AS d FROM visit_events WHERE kind = 'first_play' AND game IS NOT NULL`)?.d ?? null;

  return {
    day, from, runsSince,
    days, per, who,
    details: { '421': game421, courtisan, cf, poker },
    clicks: { since: firstSince, rows: firstPlay.map((r) => ({ game: r.game ?? 'inconnu', via: r.via ?? 'inconnu', n: r.n })) },
  };
}
