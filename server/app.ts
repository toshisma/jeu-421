/**
 * Serveur de jeu : salons privés et publics, tournois, autorité sur les dés et sur les règles,
 * synchronisation temps réel. Les salons et tournois vivent en mémoire ; les comptes (pièces,
 * mises, gains) sont en base.
 */
import express from 'express';
import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { DEFAULT_CONFIG, isSuddenDeath, sanitizeConfig, type GameConfig } from '../shared/config';
import { createGame, currentPlayerId, rollAction, stopAction, type GameState } from '../shared/engine';
import { decide, type Difficulty } from '../shared/ai';
import { AVATARS, MAX_SPECTATORS, isReaction, type Ack, type LiveEntry, type PublicRoom } from '../shared/protocol';
import { sanitizeGesture, type ThrowGesture } from '../shared/gesture';
import {
  MIN_TOURNAMENT_PLAYERS, prizes, qualifiersOf, sanitizeTable, sanitizeTournament, splitTables,
  type LobbyEntry, type PublicTournament, type TableSettings, type TournamentEntry, type TournamentSettings,
} from '../shared/tournament';
import { Store } from './db';
import { clientDay, createAccounts, type AccountsOptions } from './accounts';
import { createStats, type StatsOptions } from './stats';
import { createAdmin } from './admin';
import { createModeration, type TableChatEntry } from './moderation';
import { muteText } from '../shared/moderation';
import { canonicalHostRedirect, serveClient } from './static';
import { albumKey, botTableRules, didWin, finalPlace } from '../shared/progress/profile';
import type { ComboKind } from '../shared/combos';
import { getItem } from '../shared/progress/catalog';
import { COLLECTION } from '../shared/progress/dice-collection';
import { SCHED_CONFIG, SCHED_LOBBY_MS, SCHED_MAX, bagPrizes, bagsLabel, hourLabel, nextSlots, schedTables, type SlotStatus } from '../shared/scheduled';
import { createScheduled, slotLabel } from './scheduled';
import { createDiscordHooks } from './discord-hooks';
import { createCfOnline, type CfOnlineOptions } from './cards-online';
import { createCfStats } from './cf-stats';
import { createCfTournament, type CfTourOptions } from './cf-tournament';
import { cleanDmCode, createDixMilleOnline, type DmOnlineOptions } from './dixmille-online';
import { createGroschen } from './groschen';

interface Member {
  id: string;
  token: string; // secret de reconnexion, jamais diffusé
  name: string;
  avatar: string;
  ready: boolean;
  socketId: string | null;
  left: boolean;
  disconnectedAt: number | null;
  /** Compte du joueur (facultatif) et son jour local, pour les récompenses et les défis. */
  userId?: string;
  day: string;
  /** Joueur ordinateur (niveau de jeu). */
  bot?: Difficulty;
  /** Dés affichés quand il lance (invités : dés de la boutique seulement ; comptes : lus sur le serveur). */
  dice?: string;
  /** Ordinateur de complément : il cède sa place au premier vrai joueur qui arrive avant le départ. */
  filler?: boolean;
  /**
   * Parti après avoir fini sa partie (sorti, place définitive, récompense déjà versée) : ce n'est
   * pas un abandon. Comme tout joueur parti (`left`), il ne peut plus revenir à cette partie.
   */
  quit?: 'cashed';
}

type TableStats = { count421: number; combos: Partial<Record<ComboKind, number>>; gestures: number; roundsLost: number; maxTokens: number; keys: string[]; best: { label: string; rank: number } | null };

interface Room {
  code: string;
  title: string;
  hostId: string;
  /** Comptes retirés par l'hôte : ils ne peuvent pas revenir. */
  kicked?: Set<string>;
  members: Member[];
  config: GameConfig;
  table: TableSettings;
  status: 'lobby' | 'playing';
  game: GameState | null;
  turnTimer: NodeJS.Timeout | null;
  turnDeadline: number | null;
  autoTurnOf: string | null;
  /** Joueur dont le tour est en train d'être terminé pour cause de temps écoulé. */
  timeoutEnd: string | null;
  hostTimer: NodeJS.Timeout | null;
  lastActivity: number;
  /** Statistiques de la partie par joueur (défis), et récompenses déjà distribuées ? */
  stats: Map<string, TableStats>;
  lastSummarySeq: number;
  rewarded: boolean;
  /**
   * Joueurs déjà récompensés pour la partie en cours : chacun l'est dès que sa place est
   * définitive (sorti avant les autres), ou à la fin. Jamais deux fois.
   */
  paid: Set<string>;
  /** Parts de cagnotte déjà versées (joueurs sortis avant la fin), par joueur. */
  potPaid: Map<string, number>;
  /** Début de la partie en cours (durée réelle : récompenses et statistiques). */
  startedAt: number;
  /** Mises engagées pour la partie en cours (comptes débités au lancement). */
  pot: number;
  /** Tournoi auquel appartient cette table. */
  tournament: string | null;
  /** Numéro de partie (référence du séquestre des mises). */
  games: number;
  /** Spectateurs (par socket) : ils voient tout, ne jouent pas, ne comptent pas comme joueurs. */
  spectators: Map<string, Spectator>;
  /**
   * Partie rapide : table publique sans mise qui se complète toute seule avec des ordinateurs
   * après un moment d'attente, puis démarre après un court compte à rebours.
   */
  quick?: { waitSince: number; fillAt: number | null; startAt: number | null; timer: NodeJS.Timeout | null };
}

interface Spectator { name: string; userId?: string }

interface TPlayer {
  id: string;
  token: string;
  name: string;
  avatar: string;
  userId?: string;
  day: string;
  socketId: string | null;
  left: boolean;
  out: number | null;
  bot?: Difficulty;
  dice?: string;
  /** Tournoi programmé : déconnecté depuis (salon d'attente). */
  awayAt?: number | null;
  /**
   * Son tournoi est fini avant la fin de sa table (éliminé, ou place de finale acquise) : il peut
   * partir sans que ce soit un abandon. Ses gains de tournoi restent les siens.
   */
  finished?: boolean;
}
interface TTable { code: string; ids: string[]; ranking: string[] | null; qualified: number }
interface Tournament {
  code: string;
  hostId: string;
  settings: TournamentSettings;
  status: 'inscriptions' | 'en-cours' | 'termine';
  players: TPlayer[];
  rounds: { tables: TTable[] }[];
  pot: number;
  standings: string[] | null;
  nextRoundAt: number | null;
  timer: NodeJS.Timeout | null;
  lastActivity: number;
  /** Finalistes sortis avant la fin de la finale : gain de tournoi déjà versé. */
  paidEarly?: Set<string>;
  /** Tournoi programmé (11h / 21h) : rendez-vous, départ, partants, annulation. */
  sched?: { slot: string; hour: number; startsAt: number; beginsAt: number; starters: number | null; cancelled: string | null };
}

export interface ServerOptions {
  port: number;
  /** Délais (ms), réduits dans les tests. */
  turnTimeoutMs?: number;
  disconnectGraceMs?: number;
  autoPlayDelayMs?: number;
  hostGraceMs?: number;
  /** Temps laissé aux navigateurs pour animer un lancer / une fin de tour avant de décompter. */
  rollGraceMs?: number;
  stopGraceMs?: number;
  /** Pause entre deux tours de tournoi, et compte à rebours quand un tournoi est complet. */
  tournamentPauseMs?: number;
  tournamentFullStartMs?: number;
  /** Base de données des comptes (fichier SQLite, ':memory:' pour les tests). */
  dbPath?: string;
  /** Horloge des tournoi programmés (tests), et intervalle de vérification (ms, 0 = manuel). */
  now?: () => number;
  schedTickMs?: number;
  /** Règles des parties de tournoi programmé (tests : parties courtes). */
  schedConfig?: GameConfig;
  accounts?: AccountsOptions;
  stats?: StatsOptions;
  /** Administration (horloge des tests). */
  admin?: { now?: () => number };
  /** Annonces Discord (tests : liens et envoi simulés ; délai avant l'annonce des nouveautés, 0 = jamais automatiquement). */
  discordHooks?: { env?: Record<string, string | undefined>; send?: (url: string, body: unknown) => Promise<void>; newsDelayMs?: number };
  /** Coups Fourrés en ligne (délais réduits dans les tests). */
  cf?: CfOnlineOptions;
  /** Partie rapide : attente avant que des ordinateurs complètent la table, puis compte à rebours du départ (ms). */
  quickFillMs?: number;
  quickStartMs?: number;
  /** Tournoi Coups Fourrés du samedi (tests : horloge manuelle, pauses courtes, duels courts). */
  cfTour?: CfTourOptions;
  /** Le Courtisan en ligne (délais réduits dans les tests). */
  dm?: DmOnlineOptions;
  /** Tests seulement : dés imposés (selon le joueur et la partie) au lieu du tirage officiel. */
  testDie?: (playerId: string, state: GameState) => number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const officialDie = () => randomInt(1, 7); // source cryptographique : résultats officiels

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return n.length ? n : null;
}
const cleanAvatar = (v: unknown) => (typeof v === 'string' && AVATARS.includes(v) ? v : AVATARS[0]);
/** Dés annoncés par un invité : seulement ceux de la boutique (les dés de collection exigent un compte). */
const cleanDice = (v: unknown) => {
  const it = typeof v === 'string' ? getItem(v) : undefined;
  return it && it.category === 'dice' && !it.rarity && !it.pass ? it.id : undefined;
};
/** Les ordinateurs en ligne jouent avec un dé de collection commun ou rare. */
const botDice = () => { const pool = COLLECTION.filter((c) => c.rarity === 'commun' || c.rarity === 'rare'); return pool[randomInt(pool.length)].id; };
const cleanCode = (v: unknown) => (typeof v === 'string' && /^[A-Z0-9]{5}$/.test(v.toUpperCase()) ? v.toUpperCase() : null);
const BOTS: { name: string; avatar: string }[] = [
  { name: 'Marcel', avatar: '🐻' }, { name: 'Josiane', avatar: '🦉' }, { name: 'Le Baron', avatar: '🎩' }, { name: 'Lulu', avatar: '🦊' },
  { name: 'Dédé', avatar: '⚓' }, { name: 'Simone', avatar: '🍷' }, { name: 'Gégé', avatar: '🐸' }, { name: 'Fernand', avatar: '🐙' },
  { name: 'Odette', avatar: '🍀' }, { name: 'Raymond', avatar: '🦁' }, { name: 'Huguette', avatar: '🐧' }, { name: 'Firmin', avatar: '🐯' },
];
const DIFFS: Difficulty[] = ['facile', 'normal', 'difficile'];
const cleanDiff = (v: unknown): Difficulty => (DIFFS.includes(v as Difficulty) ? (v as Difficulty) : 'normal');
/** Nom libre pour un ordinateur (pas deux fois le même à une table). */
function botIdentity(taken: string[]) {
  const free = BOTS.filter((b) => !taken.includes(b.name));
  const b = free.length ? free[randomInt(free.length)] : { name: `Ordi ${taken.length + 1}`, avatar: '🎲' };
  return b;
}
/** Partie rapide : nombre de joueurs visé quand des ordinateurs complètent la table. */
const QUICK_TARGET = 3;
const emptyStats = (): TableStats => ({ count421: 0, combos: {}, gestures: 0, roundsLost: 0, maxTokens: 0, keys: [], best: null });

export async function startServer(opts: ServerOptions) {
  const DISCONNECT_GRACE = opts.disconnectGraceMs ?? 20_000;
  const AUTOPLAY_DELAY = opts.autoPlayDelayMs ?? 2_600;
  const HOST_GRACE = opts.hostGraceMs ?? 15_000;
  const ROLL_GRACE = opts.rollGraceMs ?? 4_000;
  const STOP_GRACE = opts.stopGraceMs ?? 1_500;
  const T_PAUSE = opts.tournamentPauseMs ?? 12_000;
  const T_FULL_START = opts.tournamentFullStartMs ?? 6_000;
  const QUICK_FILL = opts.quickFillMs ?? 30_000;
  const QUICK_START = opts.quickStartMs ?? 10_000;
  /** Source des dés d'un lancer : tirage cryptographique officiel (dés imposés seulement dans les tests). */
  const dieFor = (g: GameState, pid: string) => (opts.testDie && process.env.VITEST ? () => opts.testDie!(pid, g) : officialDie);
  /**
   * Horloge des tournois programmés. Pour les essais, SCHED_TEST_NOW (date ISO) fait croire au
   * serveur qu'il est cette heure-là au démarrage ; ignoré en production (NODE_ENV=production ou Render).
   */
  const testNow = process.env.SCHED_TEST_NOW && process.env.NODE_ENV !== 'production' && !process.env.RENDER ? Date.parse(process.env.SCHED_TEST_NOW) : NaN;
  const clockOffset = Number.isFinite(testNow) ? testNow - Date.now() : 0;
  if (clockOffset && !process.env.VITEST) console.log(`Horloge de test des tournois programmés : ${new Date(Date.now() + clockOffset).toISOString()}`);
  const clock = opts.now ?? (() => Date.now() + clockOffset);
  const testing = process.env.NODE_ENV !== 'production' && !process.env.RENDER;
  // SCHED_TEST_QUICK=1 (essais seulement) : parties de tournoi programmé en une manche aux points.
  const schedConfig = opts.schedConfig ? sanitizeConfig({ ...SCHED_CONFIG, ...opts.schedConfig }) : (testing && process.env.SCHED_TEST_QUICK ? sanitizeConfig({ ...SCHED_CONFIG, variant: 'manches', rounds: 1, turnSeconds: 10 }) : SCHED_CONFIG);

  const app = express();
  app.set('trust proxy', 1); // adresse IP réelle derrière l'hébergeur (limite de tentatives)
  // En production sur Render : l'adresse technique *.onrender.com et le « www » renvoient vers le domaine officiel.
  if (process.env.RENDER) canonicalHostRedirect(app);
  const store = new Store(opts.dbPath ?? (process.env.VITEST ? ':memory:' : process.env.DATABASE_PATH ?? 'data/421.sqlite'));
  // eslint-disable-next-line prefer-const
  let stats: ReturnType<typeof createStats>;
  const accounts = createAccounts(store, { ...opts.accounts, onSoloFinished: (g) => stats.recordSolo(g) });
  const rooms = new Map<string, Room>();
  const tournaments = new Map<string, Tournament>();
  const humanConnected = (m: Member) => !m.bot && !m.left && m.socketId != null;
  /** Places prises à une table en attente (les ordinateurs de complément cèdent la leur). */
  const seatsTaken = (r: Room) => r.members.filter((m) => !m.filler).length;
  stats = createStats(store, {
    minSoloMs: opts.accounts?.minSoloMs, ...opts.stats, userFromToken: accounts.userFromToken,
    notifyAdmins: (title, body) => {
      for (const name of (process.env.ADMIN_USERS ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
        const u = store.userByName(name);
        if (u) void accounts.social.push(u.id, title, body, '/');
      }
    },
    live: () => {
      let onlineGames = 0, inRooms = 0;
      for (const r of rooms.values()) {
        const here = r.members.filter(humanConnected).length;
        inRooms += here;
        if (r.game && r.game.phase !== 'fini' && here > 0) onlineGames++;
      }
      return { onlineGames, inRooms };
    },
  });
  // Administration (avant les autres routes : elle filtre aussi les comptes suspendus).
  const admin = createAdmin(store, { ...opts.admin, isAdmin: stats.isAdmin, userFromToken: accounts.userFromToken });
  app.use('/api', admin.router);
  app.use('/api', stats.router);
  // Coups Fourrés : statistiques réelles des cartes (onglet d'administration).
  const cfStats = createCfStats({ store, now: opts.accounts?.now ?? Date.now, isAdmin: stats.isAdmin, userFromToken: accounts.userFromToken });
  app.use('/api', cfStats.router);
  // Tchat de table : derniers messages gardés en mémoire (signalements : le serveur retrouve le texte).
  const tableChat: TableChatEntry[] = [];
  let tableChatSeq = 0;
  const TABLE_CHAT_KEEP = 3000;
  const moderation = createModeration({
    store, isAdmin: stats.isAdmin, userFromToken: accounts.userFromToken, now: opts.admin?.now ?? Date.now,
    push: (u, title, body, url) => void accounts.social.push(u, title, body, url),
    ban: admin.ban, unban: admin.unban, banOf: admin.banOf, log: admin.log,
    tableMessage: (id) => {
      const i = tableChat.findIndex((m) => m.id === id);
      if (i < 0) return undefined;
      const msg = tableChat[i];
      const before: TableChatEntry[] = [];
      for (let j = i - 1; j >= 0 && before.length < 3; j--) if (tableChat[j].code === msg.code) before.unshift(tableChat[j]);
      return { msg, before };
    },
  });
  app.use('/api', moderation.router);

  // Le Courtisan en ligne (créé plus bas) : sa présence s'ajoute à celle des tables du 421.
  let dmPresence: (userId: string) => ReturnType<Parameters<typeof accounts.setPresence>[0]> = () => null;
  let dmHas: (code: string) => boolean = () => false;
  accounts.setPresence((userId) => {
    const dm = dmPresence(userId);
    if (dm) return dm;
    for (const r of rooms.values()) {
      const m = r.members.find((x) => x.userId === userId && x.socketId != null);
      if (!m) continue;
      const lobby = r.status === 'lobby';
      return { code: r.code, status: lobby ? 'salon' : 'partie', joinable: lobby && !r.tournament && seatsTaken(r) < r.table.maxPlayers, watchable: !lobby && !!r.game && r.game.phase !== 'fini' };
    }
    return null;
  });

  // Listes publiques : salons en attente de joueurs et tournois ouverts aux inscriptions.
  app.get('/api/lobbies', (_req, res) => {
    const lobbies: LobbyEntry[] = [...rooms.values()]
      .filter((r) => r.status === 'lobby' && !r.tournament && r.table.visibility === 'public' && seatsTaken(r) < r.table.maxPlayers
        && r.members.some((m) => m.socketId != null))
      .sort((a, b) => seatsTaken(b) - seatsTaken(a))
      .slice(0, 50)
      .map((r) => ({
        code: r.code, title: r.title, host: r.members.find((m) => m.id === r.hostId)?.name ?? '?', players: seatsTaken(r),
        max: r.table.maxPlayers, stake: r.table.stake, variant: r.config.variant, turnSeconds: r.config.turnSeconds,
      }));
    const tours: TournamentEntry[] = [...tournaments.values()]
      .filter((t) => t.status === 'inscriptions' && t.settings.visibility === 'public' && t.players.length < t.settings.maxPlayers
        && t.players.some((p) => p.socketId != null))
      .sort((a, b) => b.players.length - a.players.length)
      .slice(0, 50)
      .map((t) => ({
        code: t.code, title: t.settings.title, host: t.players.find((p) => p.id === t.hostId)?.name ?? '?', players: t.players.length,
        max: t.settings.maxPlayers, stake: t.settings.stake, tableSize: t.settings.tableSize, payout: t.settings.payout,
      }));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, lobbies, tournaments: tours });
  });
  // Parties en cours qu'on peut regarder (tables publiques et tournois publics).
  app.get('/api/live', (_req, res) => {
    const games: LiveEntry[] = [...rooms.values()]
      .filter((r) => {
        if (r.status !== 'playing' || !r.game || r.game.phase === 'fini' || !r.members.some((m) => m.socketId != null)) return false;
        const t = r.tournament ? tournaments.get(r.tournament) : undefined;
        return (t ? t.settings.visibility : r.table.visibility) === 'public';
      })
      .sort((a, b) => b.spectators.size - a.spectators.size || b.startedAt - a.startedAt)
      .slice(0, 30)
      .map((r) => ({
        code: r.code, title: r.title, spectators: r.spectators.size, round: r.game!.round, startedAt: r.startedAt,
        tournament: r.tournament ? tournaments.get(r.tournament)?.settings.title ?? null : null,
        players: r.members.filter((m) => r.game!.players.some((p) => p.id === m.id))
          .map((m) => ({ name: m.name, avatar: m.avatar, ...(m.bot ? { bot: true } : {}) })),
      }));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, games });
  });
  // Historique global : les dernières parties jouées sur le site.
  app.get('/api/recent-games', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, games: store.recentGames(20) });
  });
  // Un code saisi : table ou tournoi ?
  app.get('/api/code/:code', (req, res) => {
    const code = cleanCode(req.params.code);
    if (code && dmHas(code)) { res.setHeader('Cache-Control', 'no-store'); return res.json({ ok: true, kind: 'courtisan' }); }
    const kind = code && rooms.has(code) && !rooms.get(code)!.tournament ? 'room' : code && tournaments.has(code) ? 'tournament' : null;
    res.setHeader('Cache-Control', 'no-store');
    if (!kind) return res.status(404).json({ ok: false, error: 'Aucune table ni aucun tournoi avec ce code. Vérifiez-le.' });
    // Table déjà en partie : on propose de la regarder (mode spectateur).
    const playing = kind === 'room' && rooms.get(code!)!.status === 'playing';
    res.json({ ok: true, kind, ...(playing ? { playing: true } : {}) });
  });
  // Tournois programmés : routes de l'API (inscription, désinscription, programme).
  const schedRouter = express.Router();
  schedRouter.use('/tournois', express.json({ limit: '8kb' }));
  const profileTo = (userId: string) => {
    const u = store.userById(userId);
    if (!u) return;
    const profile = store.profileOf(u);
    const ids = new Set<string>();
    for (const t of tournaments.values()) for (const p of t.players) if (p.userId === userId && p.socketId) ids.add(p.socketId);
    for (const r of rooms.values()) for (const m of r.members) if (m.userId === userId && m.socketId) ids.add(m.socketId);
    for (const id of ids) sendProfile(id, profile);
  };
  const schedLive = (slot: string) => {
    for (const t of tournaments.values()) if (t.sched?.slot === slot) {
      const status: SlotStatus = t.sched.cancelled ? 'annule' : t.status === 'inscriptions' ? 'salon' : t.status === 'en-cours' ? 'en-cours' : 'termine';
      return { code: t.code, status };
    }
    return null;
  };
  const sched = createScheduled({
    store, router: schedRouter, now: clock, userFromToken: accounts.userFromToken,
    push: (u, title, body, url) => void accounts.social.push(u, title, body, url), onProfile: (u) => profileTo(u), live: schedLive,
    mine: (userId) => {
      for (const t of tournaments.values()) if (t.sched && !t.sched.cancelled && t.status === 'en-cours' && t.players.some((p) => p.userId === userId))
        return { code: t.code, hour: t.sched.hour, status: 'en-cours' };
      return null;
    },
  });
  app.use('/api', schedRouter);
  const dHooks = createDiscordHooks({ store, env: opts.discordHooks?.env, send: opts.discordHooks?.send });
  // Coups Fourrés en ligne : branché avant les comptes (fin de partie contre l'ordinateur : corps jusqu'à 512 ko).
  const cfMount = express.Router();
  app.use('/api', cfMount);
  app.use('/api', accounts.router);
  const http = createServer(app);
  const io = new Server(http, { cors: { origin: true } });
  admin.attach(io);
  stats.attach(io);
  accounts.messages.attach(io);
  // Coups Fourrés en ligne : espace Socket.IO « /cf » et routes /api/cf/bot/*, /api/cf/friends…
  const cfOnline = createCfOnline({
    io, store, cards: accounts.cards, userFromToken: accounts.userFromToken, banOf: admin.banOf, muteOf: moderation.muteOf,
    push: (u, title, body, url) => void accounts.social.push(u, title, body, url),
    recordChat: (e) => { tableChat.push(e); if (tableChat.length > TABLE_CHAT_KEEP) tableChat.splice(0, tableChat.length - TABLE_CHAT_KEEP); },
    now: opts.accounts?.now, opts: { minBotMs: opts.accounts?.minSoloMs, ...opts.cf }, stats: cfStats,
  });
  cfMount.use(cfOnline.router);
  // Tournoi Coups Fourrés du samedi (20 h 30). Essais : SCHED_TEST_NOW (horloge), SCHED_TEST_QUICK=1 (duels à 3 jetons, pauses de 10 s).
  const cfTour = createCfTournament({
    store, cards: accounts.cards, online: cfOnline, now: clock, userFromToken: accounts.userFromToken,
    push: (u, title, body, url) => void accounts.social.push(u, title, body, url), discord: (ev) => dHooks.cfTournament(ev),
    opts: opts.cfTour ?? (testing && process.env.SCHED_TEST_QUICK ? { pauseMs: 10_000, config: { startTokens: 3 } } : undefined),
  });
  cfMount.use(cfTour.router);
  accounts.setCfPresence(cfOnline.presence);
  // Le Courtisan : Groschen (monnaie du mode) et tables en ligne, espace Socket.IO « /dixmille ».
  const groschen = createGroschen({ store, userFromToken: accounts.userFromToken, isAdmin: stats.isAdmin, now: opts.accounts?.now });
  cfMount.use(groschen.router);
  const dmOnline = createDixMilleOnline({
    io, store, userFromToken: accounts.userFromToken, banOf: admin.banOf, muteOf: moderation.muteOf, publicInfo: accounts.publicInfo,
    isBlocked: accounts.isBlocked, reward: accounts.dixMilleOnlineEnd, groschen,
    recordChat: (e) => { tableChat.push(e); if (tableChat.length > TABLE_CHAT_KEEP) tableChat.splice(0, tableChat.length - TABLE_CHAT_KEEP); },
    taken: (code) => rooms.has(code) || tournaments.has(code), opts: opts.dm,
  });
  dmPresence = dmOnline.presence;
  dmHas = (code) => !!cleanDmCode(code) && dmOnline.has(code);

  app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size, tournaments: tournaments.size }));
  const here = dirname(fileURLToPath(import.meta.url));
  const clientDir = join(here, '..', 'dist', 'client');
  if (existsSync(clientDir)) {
    // sw.js et index.html ne doivent jamais rester en cache : sinon les mises à jour n'arrivent pas.
    // Lien de parrainage : l'aperçu partagé dit qui invite.
    let indexHtml: string | null = null;
    app.get('/', (req, res, next) => {
      const who = typeof req.query.parrain === 'string' ? req.query.parrain.replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 20) : '';
      if (!who) return next();
      indexHtml ??= readFileSync(join(clientDir, 'index.html'), 'utf8');
      const t = `${who} vous invite à jouer au 421`;
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(indexHtml
        .replace(/(<meta property="og:title" content=")[^"]*/, `$1${t}`)
        .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${t}`)
        .replace(/(<meta property="og:description" content=")[^"]*/, '$1Rejoignez la partie : le 421 du comptoir, en ligne et gratuit. Lancez les dés dans un vrai bac en 3D.'));
    });
    // Fichiers du jeu compressés, cache long pour /assets/ (noms versionnés), jamais pour les pages (voir static.ts).
    serveClient(app, clientDir);
  }

  const newCode = () => {
    let code: string;
    do code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while (rooms.has(code) || tournaments.has(code) || dmHas(code));
    return code;
  };

  function makeRoom(o: { title: string; host: Member; members: Member[]; config: GameConfig; table: TableSettings; tournament?: string }): Room {
    const r: Room = {
      code: newCode(), title: o.title, hostId: o.host.id, members: o.members, config: o.config, table: o.table, status: 'lobby',
      game: null, turnTimer: null, turnDeadline: null, autoTurnOf: null, timeoutEnd: null, hostTimer: null, stats: new Map(),
      rewarded: false, paid: new Set(), potPaid: new Map(), startedAt: Date.now(), lastSummarySeq: -1, lastActivity: Date.now(), pot: 0, tournament: o.tournament ?? null, games: 0,
      spectators: new Map(),
    };
    rooms.set(r.code, r);
    return r;
  }

  // --- Diffusion ------------------------------------------------------------------------------
  const publicRoom = (r: Room): PublicRoom => ({
    code: r.code,
    hostId: r.hostId,
    status: r.status,
    config: r.config,
    turnDeadline: r.turnDeadline,
    title: r.title,
    table: r.table,
    pot: r.pot,
    tournament: r.tournament,
    spectators: r.spectators.size,
    ...(r.quick ? { quick: { fillAt: r.quick.fillAt, startAt: r.quick.startAt } } : {}),
    members: r.members.map((m) => ({
      id: m.id, name: m.name, avatar: m.avatar, ready: m.ready,
      connected: m.socketId != null || !!m.bot, left: m.left, isHost: m.id === r.hostId, ...(m.bot ? { bot: m.bot } : {}), ...(m.filler ? { filler: true } : {}),
      ...(m.dice ? { dice: m.dice } : {}),
      ...(m.userId ? accounts.publicInfo(m.userId) ?? {} : {}),
    })),
  });
  const broadcastRoom = (r: Room) => io.to(r.code).emit('room:state', publicRoom(r));
  const notice = (r: Room, text: string, kind: 'info' | 'warning' = 'info') => io.to(r.code).emit('room:notice', { kind, text });
  const sendProfile = (socketId: string | null, profile: unknown) => { if (socketId && profile) io.to(socketId).emit('profile:update', { profile }); };

  // --- Tours : délai de jeu, joueurs déconnectés ou partis -------------------------------------
  /**
   * Programme l'action automatique du tour en cours :
   *  - joueur parti ou déconnecté : le serveur joue à sa place (IA), après un délai de grâce ;
   *  - joueur présent mais trop lent (temps de la partie écoulé) : le tour est terminé pour lui —
   *    s'il n'a pas lancé, un lancer est fait, puis le tour est validé.
   * `grace` laisse aux navigateurs le temps d'animer le dernier lancer avant de décompter.
   */
  function scheduleTurn(r: Room, grace = 0) {
    if (r.turnTimer) clearTimeout(r.turnTimer);
    r.turnTimer = null;
    r.turnDeadline = null;
    const g = r.game;
    if (r.status !== 'playing' || !g || g.phase === 'fini') return;
    const pid = currentPlayerId(g)!;
    if (r.autoTurnOf && r.autoTurnOf !== pid) r.autoTurnOf = null;
    if (r.timeoutEnd && r.timeoutEnd !== pid) r.timeoutEnd = null;
    const m = r.members.find((x) => x.id === pid)!;
    const turnMs = opts.turnTimeoutMs ?? r.config.turnSeconds * 1000;
    let delay: number;
    let mode: 'ai' | 'timeout';
    if (m.bot) {
      // L'ordinateur « réfléchit » un peu, après l'animation du lancer précédent ; pas de compte à rebours affiché.
      // Rythme naturel : parfois vif, parfois un temps d'hésitation (surtout avant de relancer).
      const think = AUTOPLAY_DELAY * (0.3 + Math.random() * 0.5) + (g.throwsUsed > 0 && Math.random() < 0.25 ? AUTOPLAY_DELAY * 0.5 : 0);
      r.turnTimer = setTimeout(() => autoPlay(r, pid, 'ai'), grace + Math.round(think));
      return;
    }
    if (m.left) { delay = AUTOPLAY_DELAY; mode = 'ai'; }
    else if (m.left) { delay = AUTOPLAY_DELAY; mode = 'ai'; }
    else if (m.socketId == null) { delay = r.autoTurnOf === pid ? AUTOPLAY_DELAY : DISCONNECT_GRACE; mode = 'ai'; }
    else if (r.timeoutEnd === pid) { delay = grace + 600; mode = 'timeout'; }
    else if (turnMs > 0) { delay = grace + turnMs; mode = 'timeout'; }
    else return; // pas de limite de temps
    r.turnDeadline = Date.now() + delay;
    r.turnTimer = setTimeout(() => autoPlay(r, pid, mode), delay);
  }

  function autoPlay(r: Room, pid: string, mode: 'ai' | 'timeout') {
    const g = r.game;
    if (!g || currentPlayerId(g) !== pid) return;
    const m = r.members.find((x) => x.id === pid)!;
    if (mode === 'timeout') {
      if (r.timeoutEnd !== pid) notice(r, `Temps écoulé pour ${m.name} : son tour est terminé automatiquement.`, 'warning');
      if (g.throwsUsed === 0) {
        r.timeoutEnd = pid;
        afterAction(r, rollAction(g, pid, [false, false, false], dieFor(g, pid)));
      } else {
        r.timeoutEnd = null;
        afterAction(r, stopAction(g, pid));
      }
      return;
    }
    if (r.autoTurnOf !== pid && !m.bot) {
      r.autoTurnOf = pid;
      if (!m.left) notice(r, `${m.name} ne répond pas : le serveur joue à sa place.`, 'warning');
    }
    const d = decide(g, pid, m.bot ?? 'normal', Math.random);
    const res = d.kind === 'roll' ? rollAction(g, pid, d.keep, dieFor(g, pid)) : stopAction(g, pid);
    afterAction(r, res);
  }

  function afterAction(r: Room, res: ReturnType<typeof rollAction>, gesture?: ThrowGesture) {
    if (!res.ok || !r.game) return;
    r.lastActivity = Date.now();
    if (res.roll) {
      const st = r.stats.get(res.roll.playerId) ?? emptyStats();
      st.combos[res.roll.combo.kind] = (st.combos[res.roll.combo.kind] ?? 0) + 1;
      if (res.roll.combo.kind === '421' && !res.roll.rolloff) st.count421++;
      if (gesture) st.gestures++;
      const k = albumKey(res.roll.dice);
      if (k && !st.keys.includes(k)) st.keys.push(k);
      if (!st.best || res.roll.combo.rank > st.best.rank) st.best = { label: res.roll.combo.label, rank: res.roll.combo.rank };
      r.stats.set(res.roll.playerId, st);
    }
    // Succès : manches perdues et maximum de jetons détenus, par joueur.
    const g0 = r.game;
    for (const p of g0.players) {
      const st = r.stats.get(p.id) ?? emptyStats();
      st.maxTokens = Math.max(st.maxTokens, p.tokens);
      r.stats.set(p.id, st);
    }
    const sm = g0.lastSummary;
    if (sm && sm.seq !== r.lastSummarySeq) {
      r.lastSummarySeq = sm.seq;
      if (!sm.barrage && sm.loserId) r.stats.get(sm.loserId)!.roundsLost++;
    }
    // Joueurs qui viennent de sortir alors que la partie continue : leur place est définitive,
    // ils sont récompensés tout de suite (et peuvent partir ou rester regarder).
    if (g0.phase !== 'fini') settleEarly(r);
    // Le geste du lanceur (direction, force) est relayé : tout le monde voit le même lancer.
    if (res.roll) io.to(r.code).emit('game:roll', { roll: res.roll, seed: randomInt(0, 2 ** 31 - 1), gesture, state: r.game });
    else io.to(r.code).emit('game:state', { state: r.game });
    scheduleTurn(r, res.roll ? ROLL_GRACE : STOP_GRACE);
    broadcastRoom(r);
    if (r.game.phase === 'fini' && !r.rewarded) {
      rewardOnline(r);
      if (r.tournament) tableDone(r);
    }
  }

  /** Parts de cagnotte selon la place (poids n, n-1, …, 1), le reste d'arrondi au premier. */
  const rankShares = (pot: number, n: number) => {
    if (n <= 0) return [];
    const total = (n * (n + 1)) / 2;
    const out = Array.from({ length: n }, (_, i) => Math.floor((pot * (n - i)) / total));
    out[0] += pot - out.reduce((a, b) => a + b, 0);
    return out;
  };

  /** Membres qui jouent la partie en cours. */
  const inGameMembers = (r: Room) => r.members.filter((m) => r.game!.players.some((p) => p.id === m.id));
  /** Abandon : parti avant d'avoir fini (le serveur a joué à sa place). Partir après avoir fini n'en est pas un. */
  const abandoned = (m: Member) => m.left && m.quit !== 'cashed';
  const nameIn = (r: Room, id: string) => r.members.find((x) => x.id === id)?.name ?? '?';

  /**
   * Part de cagnotte d'un joueur sorti avant la fin, ou null si elle ne peut être connue qu'à la fin.
   * Comme à la fin : tous sauf le dernier, poids selon la place. Connue d'avance quand tous les
   * joueurs ont un compte (c'est le cas aux tables avec mise) : sa place parmi eux est acquise.
   */
  function earlyPotShare(r: Room, id: string): number | null {
    const g = r.game!;
    const all = inGameMembers(r);
    if (r.pot <= 0 || all.length !== g.players.length || all.some((m) => !m.userId)) return null;
    const shares = rankShares(r.pot, g.players.length - 1);
    return shares[finalPlace(g, id) - 1] ?? 0;
  }

  /**
   * Récompense d'un joueur (une seule fois par partie) : XP, pièces, défis, succès, classement,
   * saison classée. Appelée dès que sa place est définitive (sorti avant les autres) ou à la fin.
   */
  function rewardMember(r: Room, m: Member) {
    if (r.paid.has(m.id)) return;
    r.paid.add(m.id);
    if (!m.userId) return;
    const g = r.game!;
    const inGame = inGameMembers(r);
    // Ordinateurs à la table : barème du solo, plafond quotidien du solo, hors classement.
    const botRules = botTableRules(inGame.filter((x) => !x.bot).length, inGame.flatMap((x) => (x.bot ? [x.bot] : [])));
    const st = r.stats.get(m.id) ?? emptyStats();
    const won = didWin(g, m.id);
    const place = finalPlace(g, m.id);
    const out = accounts.onlineGameEnd(m.userId, won, g.round, {
      ...botRules, opponents: g.players.length - 1, count421: st.count421, combos: st.combos, gestureThrows: st.gestures,
      rounds: g.round, roundsLost: g.config.variant === 'manches' ? undefined : st.roundsLost, maxTokens: st.maxTokens,
      suddenDeath: isSuddenDeath(g.config),
      comboKeys: st.keys, best: st.best ?? undefined,
      opponentNames: inGame.filter((x) => x.id !== m.id).map((x) => x.name),
      place,
      // Durée de SA partie : jusqu'à sa sortie (s'il est sorti avant la fin), sinon jusqu'à la fin.
      minutes: (Date.now() - r.startedAt) / 60000,
    }, m.day, abandoned(m));
    if (out && m.socketId) io.to(m.socketId).emit('profile:reward', out);
    // Saison classée : entre au moins deux humains, sans mort subite ni ordinateur. Places parmi les humains :
    // un joueur qui a abandonné est dernier ; sinon 1 + humains (n'ayant pas abandonné) mieux classés.
    const humans = inGame.filter((x) => !x.bot);
    if (humans.length >= 2 && !isSuddenDeath(g.config) && !botRules.botLevel) {
      const sp = abandoned(m) ? humans.length : 1 + humans.filter((x) => x !== m && !abandoned(x) && finalPlace(g, x.id) < place).length;
      accounts.seasonGame([{ userId: m.userId, place: sp, won: sp === 1 }], humans.length);
    }
  }

  /**
   * Joueurs sortis alors que la partie continue : place définitive, donc récompense tout de suite
   * (part de cagnotte comprise quand elle est connue), et en tournoi, élimination ou place de finale
   * acquise. Ceux qui ont abandonné avant de sortir sont traités à la fin, comme avant.
   */
  function settleEarly(r: Room) {
    const g = r.game!;
    for (const p of g.players) {
      if (!p.out || p.finishPos == null || r.paid.has(p.id)) continue;
      const m = r.members.find((x) => x.id === p.id);
      if (!m || abandoned(m)) continue;
      const share = earlyPotShare(r, m.id);
      if (share != null) {
        r.potPaid.set(m.id, share);
        if (share > 0) sendProfile(m.socketId, accounts.winPot(m.userId!, share)?.profile);
        accounts.release(`R:${r.code}:${r.games}`, m.userId);
        notice(r, `${m.name} finit ${p.finishPos === 1 ? '1er' : `${p.finishPos}e`} et empoche ${share} pièce${share > 1 ? 's' : ''} de la cagnotte.`);
      }
      rewardMember(r, m);
      if (r.tournament) tournamentEarly(r, m.id, p.finishPos);
    }
  }

  /**
   * Fin de partie en ligne : la cagnotte éventuelle va au(x) gagnant(s), puis chaque joueur
   * pas encore récompensé reçoit sa récompense (calculée ici).
   */
  function rewardOnline(r: Room) {
    r.rewarded = true;
    const g = r.game!;
    if (r.pot > 0) {
      // Cagnotte répartie entre tous sauf le dernier, selon la place : le premier touche le plus,
      // les suivants moins (parfois moins que leur mise). À deux, le gagnant rafle tout.
      // Les parts déjà versées (joueurs sortis avant la fin) ne le sont pas une deuxième fois.
      const ranked = g.ranking.slice(0, -1).filter((id) => r.members.find((x) => x.id === id)?.userId);
      const shares = rankShares(r.pot, ranked.length);
      ranked.forEach((id, i) => {
        if (r.potPaid.has(id)) return;
        const m = r.members.find((x) => x.id === id)!;
        r.potPaid.set(id, shares[i]);
        sendProfile(m.socketId, accounts.winPot(m.userId!, shares[i])?.profile);
      });
      notice(r, ranked.length ? `Cagnotte de ${r.pot} pièces : ${ranked.map((id) => `${nameIn(r, id)} +${r.potPaid.get(id) ?? 0}`).join(', ')}.` : 'Cagnotte rendue impossible : aucun gagnant avec un compte.');
      r.pot = 0;
    }
    accounts.release(`R:${r.code}:${r.games}`);
    for (const m of inGameMembers(r)) rewardMember(r, m);
    // Statistiques : la partie est terminée, on l'enregistre une fois.
    stats.recordOnline({
      startedAt: r.startedAt,
      bots: r.members.filter((m) => m.bot && g.players.some((p) => p.id === m.id)).length,
      humans: r.members.filter((m) => !m.bot && g.players.some((p) => p.id === m.id))
        .map((m) => ({ key: m.userId ? `u:${m.userId}` : `g:${m.id}`, userId: m.userId ?? null, won: didWin(g, m.id) })),
    });
    // Rivalités entre comptes : qui a fini devant qui.
    const ranked = g.ranking.map((id) => r.members.find((m) => m.id === id)?.userId).filter((x): x is string => !!x);
    if (ranked.length > 1) accounts.recordRivalry(ranked);
  }

  /**
   * Plus personne ne joue vraiment (seulement des ordinateurs, ou des joueurs partis) alors que des
   * joueurs ont déjà empoché : la fin est jouée d'un coup par le serveur, pour clore la partie
   * (récompenses restantes, statistiques, cagnotte) avant de ranger la table.
   */
  function playOutNow(r: Room) {
    const g = r.game!;
    if (r.turnTimer) clearTimeout(r.turnTimer);
    r.turnTimer = null;
    const over = () => g.phase === 'fini';
    for (let guard = 0; guard < 20000 && !over(); guard++) {
      const pid = currentPlayerId(g)!;
      const m = r.members.find((x) => x.id === pid);
      const d = decide(g, pid, m?.bot ?? 'normal', Math.random);
      const res = d.kind === 'roll' ? rollAction(g, pid, d.keep, dieFor(g, pid)) : stopAction(g, pid);
      if (!res.ok) stopAction(g, pid);
      if (!over()) settleEarly(r);
    }
    if (over() && !r.rewarded) rewardOnline(r);
  }

  /** Un compte bloqué par (ou ayant bloqué) quelqu'un de la table ne peut pas s'y asseoir. */
  const blockedAt = (userId: string | undefined, others: { userId?: string }[]) =>
    !!userId && others.some((o) => o.userId && o.userId !== userId && accounts.isBlocked(o.userId, userId));

  /** Mise : vérifie qu'un joueur peut payer. Renvoie un message d'erreur, ou null. */
  function stakeProblem(userId: string | undefined, stake: number): string | null {
    if (stake <= 0) return null;
    if (!userId) return 'Les parties avec mise demandent un compte (vos pièces sont gardées sur le serveur).';
    if (accounts.coinsOf(userId) < stake) return `Il faut ${stake} pièces pour cette mise.`;
    return null;
  }

  /** Lancement d'une partie de table : prélève les mises puis distribue la donne. */
  function startTableGame(r: Room, players: Member[]) {
    r.pot = 0;
    r.games++;
    if (r.quick) { if (r.quick.timer) clearTimeout(r.quick.timer); r.quick.timer = null; r.quick.fillAt = null; r.quick.startAt = null; }
    const withBots = players.some((m) => m.bot);
    if (r.table.stake > 0 && !r.tournament && !withBots) {
      for (const m of players) {
        const p = accounts.stake(m.userId!, r.table.stake, `R:${r.code}:${r.games}`);
        sendProfile(m.socketId, p);
        r.pot += r.table.stake;
      }
    }
    r.status = 'playing';
    r.game = createGame(r.config, players.map((x) => ({ id: x.id, name: x.name })), randomInt(players.length));
    r.startedAt = Date.now();
    r.autoTurnOf = null;
    r.timeoutEnd = null;
    r.stats = new Map();
    r.rewarded = false;
    r.paid = new Set();
    r.potPaid = new Map();
    r.lastSummarySeq = -1;
    broadcastRoom(r); // d'abord la table (les joueurs de tournoi y sont installés), puis la donne
    io.to(r.code).emit('game:state', { state: r.game });
    scheduleTurn(r, STOP_GRACE);
    broadcastRoom(r);
    if (withBots && !r.tournament) notice(r, 'Partie avec des ordinateurs : sans mise et hors classement, récompenses comme contre l’ordinateur.');
  }

  // --- Partie rapide : ordinateurs de complément et départ automatique ------------------------
  /** La partie rapide s'applique : table publique, sans mise, en attente, hors tournoi. */
  const quickOn = (r: Room) => !!r.quick && r.status === 'lobby' && !r.tournament && r.table.visibility === 'public' && r.table.stake === 0;

  /** Des ordinateurs de complément prennent les places libres jusqu'à `target` joueurs. Renvoie leur nombre. */
  function fillWithBots(r: Room, target: number, level: Difficulty = 'normal'): number {
    let added = 0;
    while (r.members.length < Math.min(target, r.table.maxPlayers)) {
      const b = botIdentity(r.members.map((m) => m.name));
      r.members.push({ id: randomUUID(), token: randomUUID(), name: b.name, avatar: b.avatar, dice: botDice(), ready: true, socketId: null, left: false, disconnectedAt: null, day: '', bot: level, filler: true });
      added++;
    }
    return added;
  }

  /**
   * (Re)programme la partie rapide : tant qu'on est moins de QUICK_TARGET humains sans ordinateur,
   * des ordinateurs complètent la table QUICK_FILL après l'ouverture ; dès qu'il y a assez de
   * monde (ou des ordinateurs), départ automatique après QUICK_START.
   */
  function quickPlan(r: Room) {
    const q = r.quick;
    if (!q) return;
    if (q.timer) clearTimeout(q.timer);
    q.timer = null;
    if (!quickOn(r) || !r.members.some(humanConnected)) { q.fillAt = null; q.startAt = null; return; }
    const humans = r.members.filter((m) => !m.bot).length;
    if (humans >= QUICK_TARGET || r.members.some((m) => m.bot)) { q.fillAt = null; q.startAt ??= Date.now() + QUICK_START; }
    else { q.startAt = null; q.fillAt = q.waitSince + QUICK_FILL; }
    const at = q.startAt ?? q.fillAt!;
    q.timer = setTimeout(() => quickFire(r), Math.max(0, at - Date.now()));
  }

  function quickFire(r: Room) {
    const q = r.quick;
    if (!q || rooms.get(r.code) !== r) return;
    q.timer = null;
    if (!quickOn(r) || !r.members.some(humanConnected)) { quickPlan(r); return; }
    if (q.startAt == null) {
      // Personne n'est venu à temps : des ordinateurs prennent les places libres.
      const n = fillWithBots(r, QUICK_TARGET);
      if (n) notice(r, `${n > 1 ? `${n} ordinateurs complètent` : 'Un ordinateur complète'} la table. Départ dans ${Math.round(QUICK_START / 1000)} s : un joueur qui arrive d’ici là prend la place d’un ordinateur.`);
      quickPlan(r);
      broadcastRoom(r);
      return;
    }
    if (Date.now() < q.startAt) { quickPlan(r); return; }
    // Départ : les joueurs partis du salon ne sont pas attendus.
    r.members = r.members.filter((m) => m.bot || m.socketId != null);
    if (!r.members.some((m) => m.id === r.hostId)) r.hostId = r.members.find(humanConnected)!.id;
    fillWithBots(r, 2);
    for (const m of r.members) m.ready = true;
    startTableGame(r, r.members.slice());
  }

  function transferHost(r: Room, reason: string) {
    const next = r.members.find((m) => m.id !== r.hostId && m.socketId != null && !m.left);
    if (!next) return;
    r.hostId = next.id;
    next.ready = true;
    notice(r, `${reason} ${next.name} devient l'hôte.`, 'warning');
    broadcastRoom(r);
  }

  function removeIfEmpty(r: Room) {
    if (r.tournament) return; // les tables de tournoi vivent avec le tournoi
    if (r.members.every((m) => m.socketId == null || m.left)) {
      const g = r.game;
      // 0.43 : le dernier joueur humain a quitté une partie en cours sans empocher : la table reste
      // en pause (le ménage la ferme au bout de 10 min) pour qu'il puisse revenir depuis l'accueil.
      if (r.status === 'playing' && g && g.phase !== 'fini' && r.paid.size === 0 && r.members.some((m) => !m.bot && m.left && m.quit !== 'cashed')) {
        if (r.turnTimer) { clearTimeout(r.turnTimer); r.turnTimer = null; }
        r.lastActivity = Date.now();
        return;
      }
      // Partie en cours où quelqu'un a déjà empoché : on la mène à son terme plutôt que de l'effacer.
      if (r.status === 'playing' && g && g.phase !== 'fini' && r.paid.size > 0) {
        const stillIn = r.members.filter((m) => g.players.some((p) => p.id === m.id && !p.out));
        // Des joueurs encore en jeu sont seulement déconnectés : le serveur joue pour eux, la partie se termine normalement.
        if (stillIn.some((m) => !m.bot && !m.left)) return;
        playOutNow(r);
      }
      if (r.turnTimer) clearTimeout(r.turnTimer);
      if (r.hostTimer) clearTimeout(r.hostTimer);
      if (r.quick?.timer) clearTimeout(r.quick.timer);
      closeSpectators(r, 'Tous les joueurs ont quitté la table.');
      rooms.delete(r.code);
    }
  }

  // --- Spectateurs ---------------------------------------------------------------------------
  /** Détache un socket de la partie qu'il regardait (s'il en regardait une). */
  function unwatch(socket: Socket) {
    const code = socket.data.watch as string | undefined;
    if (!code) return;
    socket.data.watch = null;
    const r = rooms.get(code);
    // Le socket peut aussi être joueur de cette table (cas limite) : on ne le retire alors pas du canal.
    if (socket.data.code !== code) socket.leave(code);
    if (r && r.spectators.delete(socket.id)) broadcastRoom(r);
  }
  /** La table disparaît : les spectateurs sont prévenus et détachés. */
  function closeSpectators(r: Room, text: string) {
    for (const sid of r.spectators.keys()) {
      const sock = io.sockets.sockets.get(sid);
      if (!sock) continue;
      sock.emit('spectate:closed', { text });
      sock.data.watch = null;
      if (sock.data.code !== r.code) sock.leave(r.code);
    }
    r.spectators.clear();
  }
  const friendsEither = (a: string, b: string) => store.isFriend(a, b) || store.isFriend(b, a);
  /**
   * Qui peut regarder une table en partie ? Tables publiques : tout le monde. Tables privées
   * (sur invitation) et tournois privés : seulement les comptes amis d'un des joueurs.
   * Renvoie un message d'erreur, ou null.
   */
  function watchProblem(r: Room, userId: string | undefined): string | null {
    if (r.status !== 'playing' || !r.game) return 'Aucune partie en cours à cette table pour l’instant.';
    const t = r.tournament ? tournaments.get(r.tournament) : undefined;
    const isPrivate = t ? t.settings.visibility === 'private' : r.table.visibility === 'private';
    if (userId && r.members.some((m) => m.userId === userId && !m.left && !m.bot)) return 'Vous êtes joueur à cette table.';
    if (blockedAt(userId, r.members)) return 'Impossible de regarder cette partie.';
    if (userId && r.kicked?.has(userId)) return 'Impossible de regarder cette partie.';
    // Un joueur de la table qui a empoché et quitté peut regarder la fin de sa partie.
    const wasPlayer = !!userId && r.members.some((m) => m.userId === userId && m.quit === 'cashed');
    if (isPrivate && !wasPlayer) {
      if (!userId) return 'Partie privée : seuls les amis des joueurs peuvent la regarder (connectez-vous à votre compte).';
      if (!r.members.some((m) => m.userId && friendsEither(m.userId, userId))) return 'Partie privée : seuls les amis des joueurs peuvent la regarder.';
    }
    if (r.spectators.size >= MAX_SPECTATORS) return `Trop de spectateurs pour cette partie (${MAX_SPECTATORS} au maximum).`;
    return null;
  }

  /** Branche un socket sur un membre de salon (en le détachant de son salon précédent). */
  function attachSocket(socket: Socket, r: Room, m: Member) {
    unwatch(socket); // un joueur ne regarde pas en même temps
    const prev = m.socketId && io.sockets.sockets.get(m.socketId);
    if (prev && prev.id !== socket.id) prev.disconnect(true); // un seul onglet par joueur
    const oldCode = socket.data.code as string | undefined;
    if (oldCode && oldCode !== r.code) {
      socket.leave(oldCode);
      const old = rooms.get(oldCode)?.members.find((x) => x.id === socket.data.playerId);
      if (old && old.socketId === socket.id) old.socketId = null;
    }
    m.socketId = socket.id;
    m.disconnectedAt = null;
    socket.data.code = r.code;
    socket.data.playerId = m.id;
    socket.join(r.code);
    r.lastActivity = Date.now();
  }

  // --- Tournois ---------------------------------------------------------------------------------
  const publicTournament = (t: Tournament): PublicTournament => ({
    code: t.code,
    hostId: t.hostId,
    status: t.status,
    settings: t.settings,
    pot: t.pot,
    prizes: prizes(t.pot, t.players.length, t.settings.payout),
    standings: t.standings,
    nextRoundAt: t.nextRoundAt,
    ...(t.sched ? { sched: {
      slot: t.sched.slot, hour: t.sched.hour, startsAt: t.sched.startsAt, beginsAt: t.sched.beginsAt, serverNow: clock(),
      registered: store.schedCount(t.sched.slot), cancelled: t.sched.cancelled, starters: t.sched.starters,
      bags: bagPrizes(t.sched.starters ?? t.players.length),
    } } : {}),
    rounds: t.rounds.map((rd) => ({ tables: rd.tables.map((tb) => ({ code: tb.code, ids: tb.ids, ranking: tb.ranking, qualified: tb.qualified })) })),
    players: t.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, connected: p.socketId != null || !!p.bot, left: p.left, out: p.out, ...(p.bot ? { bot: true } : {}),
      ...(p.userId ? accounts.publicInfo(p.userId) ?? {} : {}),
    })),
  });
  const tRoom = (code: string) => `T:${code}`;
  const broadcastT = (t: Tournament) => { t.lastActivity = Date.now(); io.to(tRoom(t.code)).emit('tournament:state', publicTournament(t)); };
  const tNotice = (t: Tournament, text: string, kind: 'info' | 'warning' = 'info') => io.to(tRoom(t.code)).emit('room:notice', { kind, text });

  /** Démarre le tournoi : prélève les droits d'entrée, puis lance le premier tour. */
  function startTournament(t: Tournament): string | null {
    if (t.status !== 'inscriptions') return 'Le tournoi a déjà commencé';
    if (t.timer) { clearTimeout(t.timer); t.timer = null; }
    t.nextRoundAt = null;
    const stake = t.settings.stake;
    if (stake > 0) {
      // Ceux qui ne peuvent plus payer sont désinscrits.
      for (const p of [...t.players]) {
        if (stakeProblem(p.userId, stake)) {
          t.players = t.players.filter((x) => x !== p);
          tNotice(t, `${p.name} n'a plus assez de pièces : désinscrit.`, 'warning');
          if (p.socketId) io.to(p.socketId).emit('tournament:removed', { reason: `Il faut ${stake} pièces pour ce tournoi.` });
        }
      }
    }
    if (t.players.length < MIN_TOURNAMENT_PLAYERS) { broadcastT(t); return `Il faut au moins ${MIN_TOURNAMENT_PLAYERS} joueurs`; }
    if (!t.players.some((p) => p.id === t.hostId)) t.hostId = t.players[0].id;
    t.pot = 0;
    if (stake > 0) for (const p of t.players) { sendProfile(p.socketId, accounts.stake(p.userId!, stake, `T:${t.code}`)); t.pot += stake; }
    t.status = 'en-cours';
    // Ordre de départ tiré au sort, puis répartition en tables.
    const order = t.players.map((p) => p.id);
    for (let i = order.length - 1; i > 0; i--) { const j = randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    startRound(t, order);
    return null;
  }

  /** Complet : départ automatique après un court compte à rebours. */
  function autoStartIfFull(t: Tournament) {
    if (t.players.length < t.settings.maxPlayers || t.timer) return;
    t.nextRoundAt = Date.now() + T_FULL_START;
    t.timer = setTimeout(() => { t.timer = null; if (startTournament(t)) { t.nextRoundAt = null; broadcastT(t); } }, T_FULL_START);
  }

  function startRound(t: Tournament, ids: string[]) {
    t.nextRoundAt = null;
    const groups = t.sched ? schedTables(ids) : splitTables(ids, t.settings.tableSize);
    const final = groups.length === 1;
    const tables: TTable[] = [];
    for (const g of groups) {
      const members: Member[] = g.map((id) => {
        const p = t.players.find((x) => x.id === id)!;
        return { id: p.id, token: p.token, name: p.name, avatar: p.avatar, dice: p.dice, ready: true, socketId: null, left: p.left, disconnectedAt: null, userId: p.userId, day: p.day, bot: p.bot };
      });
      const r = makeRoom({ title: t.settings.title, host: members[0], members, config: t.settings.config, table: { visibility: 'private', maxPlayers: members.length, stake: 0 }, tournament: t.code });
      // Les joueurs connectés au tournoi sont installés directement à leur table.
      for (const m of members) {
        const p = t.players.find((x) => x.id === m.id)!;
        const sock = p.socketId ? io.sockets.sockets.get(p.socketId) : undefined;
        if (sock) attachSocket(sock, r, m);
      }
      tables.push({ code: r.code, ids: g, ranking: null, qualified: final ? 1 : qualifiersOf(g.length) });
      startTableGame(r, members);
    }
    t.rounds.push({ tables });
    broadcastT(t);
    const label = final ? 'La finale commence' : `Tour ${t.rounds.length} : ${tables.length} tables`;
    tNotice(t, `${label}. Bonne chance !`);
  }

  /** Une table de tournoi vient de finir : qualifications, puis tour suivant ou fin. */
  function tableDone(r: Room) {
    const t = tournaments.get(r.tournament!);
    if (!t || t.status !== 'en-cours') return;
    const roundIdx = t.rounds.length - 1;
    const round = t.rounds[roundIdx];
    const tb = round.tables.find((x) => x.code === r.code);
    if (!tb || tb.ranking) return;
    tb.ranking = r.game!.ranking.slice();
    const final = round.tables.length === 1;
    if (!final) for (const id of tb.ranking.slice(tb.qualified)) t.players.find((p) => p.id === id)!.out = roundIdx;
    if (round.tables.some((x) => !x.ranking)) { broadcastT(t); return; }
    if (final) { finishTournament(t); return; }
    // Qualifiés : les premiers de chaque table d'abord, puis les deuxièmes… (têtes de série).
    const next: string[] = [];
    for (let rank = 0; rank < Math.max(...round.tables.map((x) => x.qualified)); rank++)
      for (const x of round.tables) if (rank < x.qualified) next.push(x.ranking![rank]);
    t.nextRoundAt = Date.now() + T_PAUSE;
    t.timer = setTimeout(() => { t.timer = null; if (t.status === 'en-cours') startRound(t, next); }, T_PAUSE);
    broadcastT(t);
  }

  /**
   * Un joueur sort de sa table de tournoi avant la fin de celle-ci. Qualifié : rien ne change, il
   * attend le tour suivant (il peut regarder ou consulter le tableau). Éliminé : son tournoi est
   * fini, il peut partir (son gain éventuel lui sera versé à la fin du tournoi, sur son compte).
   * Finale : sa place au tournoi est acquise, son gain de tournoi (cagnotte, sacs) est versé tout de suite.
   */
  function tournamentEarly(r: Room, id: string, finishPos: number) {
    const t = tournaments.get(r.tournament!);
    if (!t || t.status !== 'en-cours') return;
    const roundIdx = t.rounds.length - 1;
    const round = t.rounds[roundIdx];
    const tb = round.tables.find((x) => x.code === r.code);
    const p = t.players.find((x) => x.id === id);
    if (!tb || tb.ranking || !p) return;
    const place = finishPos - 1;
    if (round.tables.length === 1) {
      p.finished = true;
      const paid = (t.paidEarly ??= new Set());
      if (!paid.has(id) && p.userId) {
        paid.add(id);
        const gains = prizes(t.pot, t.players.length, t.settings.payout);
        sendProfile(p.socketId, accounts.tournamentEnd(p.userId, place, gains[place] ?? 0)?.profile);
        accounts.release(`T:${t.code}`, p.userId);
        if (t.sched) sched.award(t.sched.slot, p.userId, place);
      }
    } else if (place >= tb.qualified) {
      p.finished = true;
      p.out = roundIdx;
    }
    broadcastT(t);
  }

  function finishTournament(t: Tournament) {
    const last = t.rounds[t.rounds.length - 1].tables[0];
    const standings = last.ranking!.slice();
    for (let ri = t.rounds.length - 2; ri >= 0; ri--) {
      const outs = t.rounds[ri].tables.flatMap((tb) => tb.ranking!.slice(tb.qualified).map((id, k) => ({ id, k: tb.qualified + k })));
      outs.sort((a, b) => a.k - b.k);
      standings.push(...outs.map((o) => o.id));
    }
    t.standings = standings;
    t.status = 'termine';
    t.nextRoundAt = null;
    const gains = prizes(t.pot, t.players.length, t.settings.payout);
    standings.forEach((id, place) => {
      const p = t.players.find((x) => x.id === id)!;
      if (p.userId && !t.paidEarly?.has(id)) sendProfile(p.socketId, accounts.tournamentEnd(p.userId, place, gains[place] ?? 0)?.profile);
    });
    accounts.release(`T:${t.code}`);
    admin.tournamentFinished();
    const champ = t.players.find((p) => p.id === standings[0])!;
    if (t.sched) {
      // Tournoi programmé : sacs de dés selon la place et le nombre de partants (enregistré en base).
      const bags = sched.finish(t.sched.slot, standings.map((id) => t.players.find((x) => x.id === id)!.userId!));
      void dHooks.tournament({ kind: 'fin', slotId: t.sched.slot, hour: t.sched.hour, bags: bags[0] ?? 0, podium: standings.slice(0, 3).map((id) => t.players.find((x) => x.id === id)!.name) });
      tNotice(t, `${champ.name} remporte le ${slotLabel(t.sched.slot)}${bags[0] ? ` et ${bagsLabel(bags[0])} de dés` : ''} !`);
      standings.forEach((id, place) => {
        const p = t.players.find((x) => x.id === id)!;
        if (p.userId && !p.bot) void accounts.social.push(p.userId, `Tournoi de ${hourLabel(t.sched!.hour)} terminé`,
          `Vous finissez ${place === 0 ? '1er' : `${place + 1}e`} sur ${standings.length}${bags[place] ? ` : ${bagsLabel(bags[place])} de dés gagnés !` : '.'}`, '/?tournois=1');
      });
    } else
    tNotice(t, `${champ.name} remporte le tournoi${gains[0] ? ` et ${gains[0]} pièces` : ''} !`);
    broadcastT(t);
    // Les tables restent consultables un moment, puis tout est rangé.
    setTimeout(() => {
      for (const rd of t.rounds) for (const tb of rd.tables) { const r = rooms.get(tb.code); if (r?.turnTimer) clearTimeout(r.turnTimer); if (r) closeSpectators(r, 'Le tournoi est terminé.'); rooms.delete(tb.code); }
      tournaments.delete(t.code);
    }, 15 * 60_000).unref?.();
  }

  // --- Tournois programmés : ouverture du salon, départ, annulation ----------------------------
  /** Un inscrit est « présent » au départ s'il est dans le salon (connecté, ou coupé depuis moins de 30 s). */
  const PRESENT_GRACE = 30_000;
  const schedOf = (slot: string) => [...tournaments.values()].find((t) => t.sched?.slot === slot);

  function openSalon(slot: { id: string; hour: number; startsAt: number }) {
    const t: Tournament = {
      code: newCode(), hostId: '', status: 'inscriptions', players: [], rounds: [], pot: 0, standings: null, nextRoundAt: null, timer: null, lastActivity: Date.now(),
      settings: { title: `Tournoi de ${hourLabel(slot.hour)}`, visibility: 'private', maxPlayers: SCHED_MAX, tableSize: 4, stake: 0, payout: 'winner', config: schedConfig },
      sched: { slot: slot.id, hour: slot.hour, startsAt: slot.startsAt, beginsAt: slot.startsAt + SCHED_LOBBY_MS, starters: null, cancelled: null },
    };
    tournaments.set(t.code, t);
    sched.markSlot(slot.id, 'salon');
    return t;
  }

  /** Fin d'un tournoi programmé annulé : tout le monde est prévenu, les tables sont rangées plus tard. */
  function schedCancelled(t: Tournament, reason: string) {
    t.sched!.cancelled = reason;
    t.status = 'termine';
    t.standings = [];
    tNotice(t, reason, 'warning');
    broadcastT(t);
    setTimeout(() => tournaments.delete(t.code), 15 * 60_000).unref?.();
  }

  /** H+5 min : départ avec les présents (les absents sont retirés et remboursés), ou annulation. */
  function schedBegin(t: Tournament) {
    const now = Date.now();
    const present = t.players.filter((p) => p.userId && (p.socketId != null || (p.awayAt != null && now - p.awayAt < PRESENT_GRACE)));
    for (const p of t.players) if (!present.includes(p) && p.socketId) io.to(p.socketId).emit('tournament:removed', { reason: 'Absent au départ : vous êtes remboursé.' });
    t.players = present;
    const res = sched.begin(t.sched!.slot, present.map((p) => p.userId!));
    if (!res.ok) {
      void dHooks.tournament({ kind: 'annule', slotId: t.sched!.slot, hour: t.sched!.hour, players: present.length });
      return schedCancelled(t, `${res.reason} Tous les inscrits sont remboursés.`);
    }
    t.sched!.starters = present.length;
    t.status = 'en-cours';
    const order = present.map((p) => p.id);
    for (let i = order.length - 1; i > 0; i--) { const j = randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    const bags = bagPrizes(present.length);
    void dHooks.tournament({ kind: 'depart', slotId: t.sched!.slot, hour: t.sched!.hour, players: present.length, prizes: bags });
    tNotice(t, `Départ avec ${present.length} joueurs. À gagner : ${bags.map((b, i) => `${i === 0 ? '1er' : `${i + 1}e`} ${bagsLabel(b)}`).join(', ')}.`);
    startRound(t, order);
  }

  /** Horloge des tournois programmés (appelée régulièrement, et directement par les tests). */
  function schedTick() {
    const now = clock();
    for (const s of nextSlots(now, 2)) {
      sched.remind(s.id, s.startsAt, now);
      const row = store.schedSlot(s.id);
      if (now >= s.startsAt && now < s.startsAt + SCHED_LOBBY_MS && (!row || row.status === 'a-venir' || row.status === 'salon') && !schedOf(s.id)) {
        store.schedEnsureSlot(s.id, s.startsAt);
        openSalon(s);
      }
      // Annonces Discord : 30 minutes avant, puis à l'ouverture du salon (pas en retard après un redémarrage).
      if (now >= s.startsAt - 30 * 60_000 && now < s.startsAt - 20 * 60_000)
        void dHooks.tournament({ kind: 'bientot', slotId: s.id, hour: s.hour, registered: store.schedCount(s.id) });
      const salon = schedOf(s.id);
      if (salon && salon.status === 'inscriptions' && now < s.startsAt + 2 * 60_000)
        void dHooks.tournament({ kind: 'salon', slotId: s.id, hour: s.hour, registered: store.schedCount(s.id), code: salon.code });
    }
    for (const t of [...tournaments.values()]) {
      if (t.sched && t.status === 'inscriptions' && !t.sched.cancelled && now >= t.sched.beginsAt) schedBegin(t);
    }
    // Départ manqué (serveur arrêté à ce moment-là) : annulé et remboursé.
    for (const row of store.schedSlotsByStatus(['a-venir', 'salon']))
      if (now >= row.starts_at + SCHED_LOBBY_MS && !schedOf(row.id))
        sched.cancel(row.id, `Le ${slotLabel(row.id)} n’a pas pu avoir lieu (serveur indisponible).`);
  }
  sched.recover();
  schedTick();
  const schedTimer = opts.schedTickMs === 0 ? null : setInterval(schedTick, opts.schedTickMs ?? 2000);

  // Ménage des salons et tournois abandonnés.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values())
      if (!r.tournament && r.members.every((m) => m.socketId == null) && now - r.lastActivity > 10 * 60_000) {
        if (r.turnTimer) clearTimeout(r.turnTimer);
        if (r.quick?.timer) clearTimeout(r.quick.timer);
        closeSpectators(r, 'La table a été fermée.');
        rooms.delete(r.code);
      }
    for (const t of tournaments.values())
      if (!t.sched && t.status === 'inscriptions' && t.players.every((p) => p.socketId == null) && now - t.lastActivity > 10 * 60_000) {
        if (t.timer) clearTimeout(t.timer);
        tournaments.delete(t.code);
      }
  }, 60_000);

  // --- Connexions -------------------------------------------------------------------------------
  io.on('connection', (socket: Socket) => {
    // Limiteur simple : 25 messages par seconde maximum.
    let bucket = 25;
    const refill = setInterval(() => (bucket = 25), 1000);
    socket.use((_pkt, next) => (bucket-- > 0 ? next() : next(new Error('Trop de requêtes'))));

    const ctx = () => {
      const r = rooms.get(socket.data.code as string);
      const m = r?.members.find((x) => x.id === socket.data.playerId);
      return r && m ? { r, m } : null;
    };
    const tctx = () => {
      const t = tournaments.get(socket.data.tcode as string);
      const p = t?.players.find((x) => x.id === socket.data.tplayerId);
      return t && p ? { t, p } : null;
    };
    const safeAck = (ack: unknown) => (typeof ack === 'function' ? (ack as (a: Ack<any>) => void) : () => {});
    const attach = (r: Room, m: Member) => attachSocket(socket, r, m);

    socket.on('room:create', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const name = cleanName(p?.name);
      if (!name) return reply({ ok: false, error: 'Choisissez un nom' });
      const userId = accounts.userFromToken(p?.auth)?.id;
      const table = sanitizeTable(p?.table);
      const problem = stakeProblem(userId, table.stake);
      if (problem) return reply({ ok: false, error: problem });
      const m: Member = { id: randomUUID(), token: randomUUID(), name, avatar: cleanAvatar(p?.avatar), dice: cleanDice(p?.dice), ready: true, socketId: null, left: false, disconnectedAt: null, userId, day: clientDay(p?.day) };
      const r = makeRoom({ title: `Table de ${name}`, host: m, members: [m], config: sanitizeConfig(p?.config ?? DEFAULT_CONFIG), table });
      attach(r, m);
      reply({ ok: true, code: r.code, playerId: m.id, token: m.token });
      broadcastRoom(r);
    });

    socket.on('room:join', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const code = cleanCode(p?.code);
      const r = code ? rooms.get(code) : undefined;
      if (!r) {
        if (code && tournaments.has(code)) return reply({ ok: false, error: 'Ce code est celui d’un tournoi.', tournament: true } as any);
        return reply({ ok: false, error: 'Salon introuvable. Vérifiez le code.' });
      }
      // Reconnexion avec le jeton secret.
      const existing = typeof p?.token === 'string' ? r.members.find((m) => m.token === p.token) : undefined;
      if (existing) {
        // 0.43 : un joueur qui a quitté (sans avoir empoché) peut revenir tant que la partie n'est pas finie.
        let back = false;
        if (existing.left) {
          const canReturn = existing.quit !== 'cashed' && !r.tournament && r.status === 'playing' && !!r.game && r.game.phase !== 'fini';
          if (!canReturn) return reply({ ok: false, error: existing.quit === 'cashed' ? 'Vous avez déjà empoché vos gains et quitté cette partie.' : 'Cette partie est terminée.' });
          existing.left = false;
          existing.quit = undefined;
          back = true;
        }
        const wasAway = existing.socketId == null;
        existing.userId = existing.userId ?? accounts.userFromToken(p?.auth)?.id;
        attach(r, existing);
        reply({ ok: true, code: r.code, playerId: existing.id, token: existing.token });
        if (wasAway) notice(r, `${existing.name} est de retour.`);
        broadcastRoom(r);
        if (r.game) socket.emit('game:state', { state: r.game });
        // Seul le retour du joueur actif change son minuteur (fin du délai de déconnexion).
        if (back && r.status === 'playing' && r.game) scheduleTurn(r, currentPlayerId(r.game) === existing.id ? STOP_GRACE : undefined);
        else if (r.status === 'playing' && r.game && wasAway && currentPlayerId(r.game) === existing.id) scheduleTurn(r, STOP_GRACE);
        if (r.status === 'lobby') quickPlan(r);
        return;
      }
      if (r.tournament) return reply({ ok: false, error: 'Cette table fait partie d’un tournoi.' });
      reply(seatNew(r, p));
    });

    /** Nouveau joueur à une table en attente. */
    function seatNew(r: Room, p: any): Ack<{ code: string; playerId: string; token: string }> {
      const name = cleanName(p?.name);
      if (!name) return { ok: false, error: 'Choisissez un nom' };
      if (r.status !== 'lobby') return { ok: false, error: 'La partie a déjà commencé.' };
      if (seatsTaken(r) >= r.table.maxPlayers) return { ok: false, error: `Le salon est complet (${r.table.maxPlayers} joueurs).` };
      const userId = accounts.userFromToken(p?.auth)?.id;
      const problem = stakeProblem(userId, r.table.stake);
      if (problem) return { ok: false, error: problem };
      if (blockedAt(userId, r.members)) return { ok: false, error: 'Impossible de rejoindre cette table.' };
      if (userId && r.kicked?.has(userId)) return { ok: false, error: 'L’hôte vous a retiré de cette table.' };
      // Même compte déjà assis (autre onglet, double clic, invitation) : on reprend sa place, pas de doublon.
      const same = userId ? r.members.find((x) => x.userId === userId && !x.left && !x.bot) : undefined;
      if (same) {
        attach(r, same);
        broadcastRoom(r);
        return { ok: true, code: r.code, playerId: same.id, token: same.token };
      }
      let finalName = name;
      for (let k = 2; r.members.some((m) => m.name === finalName); k++) finalName = `${name} ${k}`;
      // Partie rapide : pas de bouton « prêt », le départ est automatique.
      const m: Member = { id: randomUUID(), token: randomUUID(), name: finalName, avatar: cleanAvatar(p?.avatar), dice: cleanDice(p?.dice), ready: !!r.quick, socketId: null, left: false, disconnectedAt: null, userId, day: clientDay(p?.day) };
      // Un vrai joueur prend la place d'un ordinateur de complément.
      const filler = [...r.members].reverse().find((x) => x.filler);
      if (filler) r.members = r.members.filter((x) => x !== filler);
      r.members.push(m);
      attach(r, m);
      notice(r, filler ? `${m.name} prend la place de ${filler.name} (ordinateur).` : `${m.name} a rejoint le salon.`);
      quickPlan(r);
      broadcastRoom(r);
      return { ok: true, code: r.code, playerId: m.id, token: m.token };
    }

    // Partie rapide : une table publique sans mise qui attend des joueurs, sinon une nouvelle.
    socket.on('room:quick', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      if (!cleanName(p?.name)) return reply({ ok: false, error: 'Choisissez un nom' });
      const userId = accounts.userFromToken(p?.auth)?.id;
      // Tables compatibles : publiques, sans mise, avec une place (un ordinateur de complément cède la sienne).
      // D'abord celles où il y a le plus de vrais joueurs, puis les parties rapides, puis les plus anciennes.
      const humansAt = (r: Room) => r.members.filter((m) => !m.bot).length;
      const candidates = [...rooms.values()].filter((r) => r.status === 'lobby' && !r.tournament && r.table.visibility === 'public' && r.table.stake === 0
        && seatsTaken(r) < r.table.maxPlayers && r.members.some((m) => m.socketId != null) && !blockedAt(userId, r.members)
        && !(userId && r.kicked?.has(userId)))
        .sort((a, b) => humansAt(b) - humansAt(a) || Number(!!b.quick) - Number(!!a.quick) || a.startedAt - b.startedAt);
      if (candidates.length) return reply(seatNew(candidates[0], p));
      const name = cleanName(p.name)!;
      const m: Member = { id: randomUUID(), token: randomUUID(), name, avatar: cleanAvatar(p?.avatar), dice: cleanDice(p?.dice), ready: true, socketId: null, left: false, disconnectedAt: null, userId, day: clientDay(p?.day) };
      const r = makeRoom({ title: `Partie rapide de ${name}`, host: m, members: [m], config: DEFAULT_CONFIG, table: { visibility: 'public', maxPlayers: 4, stake: 0 } });
      r.quick = { waitSince: Date.now(), fillAt: null, startAt: null, timer: null };
      attach(r, m);
      quickPlan(r);
      reply({ ok: true, code: r.code, playerId: m.id, token: m.token, created: true });
      broadcastRoom(r);
    });

    // Ordinateurs à une table en attente (l'hôte les ajoute ou les retire).
    socket.on('room:addBot', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c || c.r.status !== 'lobby' || c.r.tournament) return reply({ ok: false, error: 'Action impossible' });
      if (c.m.id !== c.r.hostId) return reply({ ok: false, error: "Seul l'hôte ajoute des ordinateurs" });
      if (c.r.table.stake > 0) return reply({ ok: false, error: 'Pas d’ordinateur aux tables avec mise.' });
      if (c.r.members.length >= c.r.table.maxPlayers) return reply({ ok: false, error: 'La table est complète.' });
      const b = botIdentity(c.r.members.map((m) => m.name));
      const bot: Member = { id: randomUUID(), token: randomUUID(), name: b.name, avatar: b.avatar, dice: botDice(), ready: true, socketId: null, left: false, disconnectedAt: null, day: '', bot: cleanDiff(p?.difficulty) };
      c.r.members.push(bot);
      reply({ ok: true });
      quickPlan(c.r);
      broadcastRoom(c.r);
    });
    // « Compléter avec l'ordinateur » : demandé explicitement par l'hôte (jamais avec une mise).
    socket.on('room:fill', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c || c.r.status !== 'lobby' || c.r.tournament) return reply({ ok: false, error: 'Action impossible' });
      if (c.m.id !== c.r.hostId) return reply({ ok: false, error: "Seul l'hôte complète la table" });
      if (c.r.table.stake > 0) return reply({ ok: false, error: 'Pas d’ordinateur aux tables avec mise.' });
      const n = c.r.members.length;
      const added = fillWithBots(c.r, n < QUICK_TARGET ? QUICK_TARGET : n + 1, cleanDiff(p?.difficulty));
      if (!added) return reply({ ok: false, error: 'La table est complète.' });
      reply({ ok: true });
      notice(c.r, `${added > 1 ? `${added} ordinateurs complètent` : 'Un ordinateur complète'} la table : un joueur qui arrive avant le départ prend la place d’un ordinateur.`);
      quickPlan(c.r);
      broadcastRoom(c.r);
    });
    socket.on('room:removeBot', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c || c.r.status !== 'lobby' || c.m.id !== c.r.hostId) return reply({ ok: false, error: 'Action impossible' });
      c.r.members = c.r.members.filter((m) => !(m.bot && m.id === p?.id));
      reply({ ok: true });
      if (c.r.quick && !c.r.members.some((m) => m.bot)) { c.r.quick.waitSince = Date.now(); c.r.quick.startAt = null; }
      quickPlan(c.r);
      broadcastRoom(c.r);
    });

    socket.on('room:ready', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c || c.r.status !== 'lobby') return reply({ ok: false, error: 'Action impossible' });
      c.m.ready = c.m.id === c.r.hostId ? true : !!p?.ready;
      reply({ ok: true });
      broadcastRoom(c.r);
    });

    socket.on('room:config', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c || c.r.status !== 'lobby') return reply({ ok: false, error: 'Action impossible' });
      if (c.m.id !== c.r.hostId) return reply({ ok: false, error: "Seul l'hôte modifie les règles" });
      if (p?.config) c.r.config = sanitizeConfig(p.config);
      if (p?.table) {
        const table = sanitizeTable(p.table);
        if (table.maxPlayers < c.r.members.length) return reply({ ok: false, error: `Il y a déjà ${c.r.members.length} joueurs à la table.` });
        if (table.stake > 0 && !c.m.userId) return reply({ ok: false, error: 'Les parties avec mise demandent un compte.' });
        if (table.stake > 0 && c.r.members.some((m) => m.bot)) return reply({ ok: false, error: 'Retirez les ordinateurs avant de fixer une mise.' });
        c.r.table = table;
      }
      // Changer les règles annule les « prêt » : chacun doit relire.
      for (const m of c.r.members) if (m.id !== c.r.hostId && !m.bot && !c.r.quick) m.ready = false;
      reply({ ok: true });
      quickPlan(c.r);
      broadcastRoom(c.r);
    });

    socket.on('room:start', (_p: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c || c.r.status !== 'lobby') return reply({ ok: false, error: 'Action impossible' });
      const { r, m } = c;
      if (m.id !== r.hostId) return reply({ ok: false, error: "Seul l'hôte lance la partie" });
      const players = r.members.filter((x) => !x.left);
      if (players.length < 2) return reply({ ok: false, error: 'Il faut au moins 2 joueurs' });
      if (players.some((x) => !x.ready)) return reply({ ok: false, error: 'Tous les joueurs doivent être prêts' });
      if (r.table.stake > 0 && players.some((x) => x.bot)) return reply({ ok: false, error: 'Pas d’ordinateur aux tables avec mise.' });
      for (const x of players.filter((y) => !y.bot)) {
        const problem = stakeProblem(x.userId, r.table.stake);
        if (problem) return reply({ ok: false, error: `${x.name} : ${problem}` });
      }
      reply({ ok: true });
      startTableGame(r, players);
    });

    // Actions de jeu : vérification du tour, de la version d'état (double clic), des entrées.
    const gameAction = (kind: 'roll' | 'stop') => (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      if (socket.data.watch && socket.data.code !== socket.data.watch) return reply({ ok: false, error: 'Vous regardez la partie : les spectateurs ne jouent pas.' });
      const c = ctx();
      if (!c || c.r.status !== 'playing' || !c.r.game) return reply({ ok: false, error: 'Aucune partie en cours' });
      const g = c.r.game;
      if (p?.version !== g.version) return reply({ ok: false, error: 'Action ignorée (déjà prise en compte)' });
      if (c.r.autoTurnOf === c.m.id) c.r.autoTurnOf = null; // le joueur reprend la main
      if (c.r.timeoutEnd === c.m.id) return reply({ ok: false, error: 'Temps écoulé' });
      const res = kind === 'roll' ? rollAction(g, c.m.id, p?.keep, dieFor(g, c.m.id)) : stopAction(g, c.m.id);
      if (!res.ok) return reply(res);
      reply({ ok: true });
      afterAction(c.r, res, kind === 'roll' ? sanitizeGesture(p?.gesture) : undefined);
    };
    // Réactions rapides : liste fermée, une toutes les 1,2 s par joueur, relayées à toute la table.
    let lastEmote = 0;
    socket.on('game:emote', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c) return reply({ ok: false, error: 'Aucune partie' });
      if (!isReaction(p?.emote)) return reply({ ok: false, error: 'Réaction inconnue' });
      const now = Date.now();
      if (now - lastEmote < 1200) return reply({ ok: false, error: 'Doucement !' });
      lastEmote = now;
      reply({ ok: true });
      io.to(c.r.code).emit('game:emote', { playerId: c.m.id, emote: p.emote });
    });
    // Tchat de table : 200 caractères, un message par seconde, liens et contrôles retirés.
    let lastChat = 0;
    socket.on('room:chat', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      const sp = !c && socket.data.watch ? rooms.get(socket.data.watch as string) : undefined;
      const spec = sp?.spectators.get(socket.id);
      if (!c && !(sp && spec)) return reply({ ok: false, error: 'Aucune table' });
      const text = String(p?.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+/gi, '[lien]').trim().slice(0, 200);
      if (!text) return reply({ ok: false, error: 'Message vide' });
      const now = Date.now();
      // Joueur réduit au silence par la modération : rien ne part, il voit l'échéance.
      const mute = (c ? c.m.userId : spec?.userId) ? moderation.muteOf((c ? c.m.userId : spec!.userId)!) : undefined;
      if (mute) return reply({ ok: false, error: muteText(mute) });
      if (now - lastChat < 1000) return reply({ ok: false, error: 'Doucement !' });
      lastChat = now;
      reply({ ok: true });
      const room = c ? c.r : sp!;
      const id = `${++tableChatSeq}-${randomInt(1e6)}`;
      const t = room.tournament ? tournaments.get(room.tournament) : undefined;
      tableChat.push({
        id, code: room.code, where: t ? `Tournoi « ${t.settings.title} », table ${room.code}` : `Table ${room.code}${room.title ? ` « ${room.title} »` : ''}`,
        userId: (c ? c.m.userId : spec!.userId) ?? null, name: c ? c.m.name : spec!.name, text, at: now,
        audience: [...room.members.map((x) => x.userId), ...[...room.spectators.values()].map((x) => x.userId)].filter((x): x is string => !!x),
      });
      if (tableChat.length > TABLE_CHAT_KEEP) tableChat.splice(0, tableChat.length - TABLE_CHAT_KEEP);
      if (!c) {
        // Spectateur : son message est signalé comme tel.
        const account = spec!.userId ? accounts.publicInfo(spec!.userId)?.account ?? null : null;
        io.to(sp!.code).emit('room:chat', { id, playerId: `spectateur:${socket.id}`, name: spec!.name, account, text, at: now, spectator: true });
        return;
      }
      const account = c.m.userId ? accounts.publicInfo(c.m.userId)?.account ?? null : null;
      io.to(c.r.code).emit('room:chat', { id, playerId: c.m.id, name: c.m.name, account, text, at: now });
    });
    socket.on('game:roll', gameAction('roll'));
    socket.on('game:stop', gameAction('stop'));

    // --- Mode spectateur ---------------------------------------------------------------------
    // Regarder une partie en cours : le spectateur reçoit l'état et les lancers, n'a aucune
    // action de jeu, n'occupe aucune place et ne reçoit aucune récompense.
    socket.on('spectate:join', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const code = cleanCode(p?.code);
      const r = code ? rooms.get(code) : undefined;
      if (!r) return reply({ ok: false, error: 'Partie introuvable. Elle est peut-être déjà terminée.' });
      if (socket.data.code) return reply({ ok: false, error: 'Quittez d’abord votre table pour regarder une partie.' });
      const user = accounts.userFromToken(p?.auth);
      // Reconnexion du même spectateur : déjà compté.
      if (socket.data.watch === r.code && r.spectators.has(socket.id)) {
        reply({ ok: true, code: r.code });
        socket.emit('room:state', publicRoom(r));
        if (r.game) socket.emit('game:state', { state: r.game });
        return;
      }
      const problem = watchProblem(r, user?.id);
      if (problem) return reply({ ok: false, error: problem });
      unwatch(socket);
      const name = user?.username ?? cleanName(p?.name) ?? 'Spectateur';
      r.spectators.set(socket.id, { name, userId: user?.id });
      socket.data.watch = r.code;
      socket.join(r.code);
      reply({ ok: true, code: r.code });
      broadcastRoom(r);
      socket.emit('game:state', { state: r.game });
    });
    socket.on('spectate:leave', (_p: unknown, ack: unknown) => { unwatch(socket); safeAck(ack)({ ok: true }); });

    socket.on('room:rematch', (_p: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c || c.m.id !== c.r.hostId || c.r.tournament) return reply({ ok: false, error: "Seul l'hôte peut relancer" });
      if (c.r.game && c.r.game.phase !== 'fini') return reply({ ok: false, error: 'La partie est en cours' });
      const r = c.r;
      r.status = 'lobby';
      r.game = null;
      r.members = r.members.filter((m) => !m.left);
      for (const m of r.members) m.ready = m.id === r.hostId || !!m.bot || !!r.quick;
      if (r.quick) { r.quick.waitSince = Date.now(); r.quick.startAt = null; }
      reply({ ok: true });
      notice(r, "L'hôte propose une revanche : retour au salon.");
      quickPlan(r);
      broadcastRoom(r);
    });

    function leave() {
      const c = ctx();
      if (!c) return;
      const { r, m } = c;
      socket.leave(r.code);
      socket.data.code = null;
      m.socketId = null;
      const wasHost = m.id === r.hostId;
      if (r.status === 'lobby') r.members = r.members.filter((x) => x.id !== m.id);
      else if (r.game && r.game.phase !== 'fini' && r.paid.has(m.id) && !m.left) {
        // Sa partie était finie (sorti, récompensé) : il empoche et s'en va, ce n'est pas un abandon.
        m.left = true;
        m.quit = 'cashed';
        notice(r, `${m.name} a empoché ses gains et quitté la table.`);
      } else {
        m.left = true;
        notice(r, `${m.name} a quitté la partie : le serveur jouera à sa place.`, 'warning');
        scheduleTurn(r);
      }
      if (wasHost) transferHost(r, `L'hôte ${m.name} a quitté la partie.`);
      if (r.status === 'lobby') quickPlan(r);
      broadcastRoom(r);
      removeIfEmpty(r);
    }
    socket.on('room:leave', (_p: unknown, ack: unknown) => { leave(); safeAck(ack)({ ok: true }); });
    // L'hôte retire un joueur du salon (avant le début de la partie). Un compte retiré ne peut pas revenir.
    socket.on('room:kick', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c) return reply({ ok: false, error: 'Aucune table' });
      const { r, m } = c;
      if (m.id !== r.hostId) return reply({ ok: false, error: 'Seul l’hôte peut retirer un joueur.' });
      if (r.status !== 'lobby') return reply({ ok: false, error: 'La partie a déjà commencé.' });
      const target = r.members.find((x) => x.id === String(p?.playerId ?? ''));
      if (!target || target.id === m.id) return reply({ ok: false, error: 'Joueur introuvable.' });
      r.members = r.members.filter((x) => x.id !== target.id);
      if (target.userId) (r.kicked ??= new Set()).add(target.userId);
      const ts = target.socketId && io.sockets.sockets.get(target.socketId);
      if (ts) { ts.emit('room:kicked', { text: 'L’hôte vous a retiré de la table.' }); ts.leave(r.code); ts.data.code = null; }
      reply({ ok: true });
      notice(r, `${target.name} a été retiré de la table.`);
      broadcastRoom(r);
    });

    // --- Tournois -------------------------------------------------------------------------------
    function tAttach(t: Tournament, p: TPlayer) {
      const prev = p.socketId && io.sockets.sockets.get(p.socketId);
      if (prev && prev.id !== socket.id) prev.disconnect(true);
      p.socketId = socket.id;
      p.awayAt = null;
      socket.data.tcode = t.code;
      socket.data.tplayerId = p.id;
      socket.join(tRoom(t.code));
    }

    socket.on('tournament:create', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const name = cleanName(p?.name);
      if (!name) return reply({ ok: false, error: 'Choisissez un nom' });
      const userId = accounts.userFromToken(p?.auth)?.id;
      const settings = sanitizeTournament(p?.settings, `Tournoi de ${name}`);
      const problem = stakeProblem(userId, settings.stake);
      if (problem) return reply({ ok: false, error: problem });
      const player: TPlayer = { id: randomUUID(), token: randomUUID(), name, avatar: cleanAvatar(p?.avatar), dice: cleanDice(p?.dice), userId, day: clientDay(p?.day), socketId: null, left: false, out: null };
      const t: Tournament = {
        code: newCode(), hostId: player.id, settings, status: 'inscriptions', players: [player], rounds: [], pot: 0,
        standings: null, nextRoundAt: null, timer: null, lastActivity: Date.now(),
      };
      tournaments.set(t.code, t);
      tAttach(t, player);
      reply({ ok: true, code: t.code, playerId: player.id, token: player.token });
      broadcastT(t);
    });

    socket.on('tournament:join', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const code = cleanCode(p?.code);
      const t = code ? tournaments.get(code) : undefined;
      if (!t) return reply({ ok: false, error: 'Tournoi introuvable. Vérifiez le code.' });
      const existing = typeof p?.token === 'string' ? t.players.find((x) => x.token === p.token) : undefined;
      if (existing) {
        tAttach(t, existing);
        reply({ ok: true, code: t.code, playerId: existing.id, token: existing.token });
        // Retour à sa table si une partie est en cours.
        const tb = t.rounds.at(-1)?.tables.find((x) => x.ids.includes(existing.id));
        const r = tb && rooms.get(tb.code);
        const m = r?.members.find((x) => x.id === existing.id);
        if (r && m && t.status === 'en-cours' && !tb!.ranking && m.quit !== 'cashed') {
          const wasAway = m.socketId == null;
          attach(r, m);
          broadcastRoom(r);
          if (r.game) socket.emit('game:state', { state: r.game });
          if (wasAway && r.game && currentPlayerId(r.game) === m.id) scheduleTurn(r, STOP_GRACE);
        }
        broadcastT(t);
        return;
      }
      if (t.sched) return reply(schedJoin(t, p));
      const name = cleanName(p?.name);
      if (!name) return reply({ ok: false, error: 'Choisissez un nom' });
      if (t.status !== 'inscriptions') return reply({ ok: false, error: 'Les inscriptions sont closes.' });
      if (t.players.length >= t.settings.maxPlayers) return reply({ ok: false, error: 'Le tournoi est complet.' });
      const userId = accounts.userFromToken(p?.auth)?.id;
      const problem = stakeProblem(userId, t.settings.stake);
      if (problem) return reply({ ok: false, error: problem });
      if (userId && t.settings.stake > 0 && t.players.some((x) => x.userId === userId)) return reply({ ok: false, error: 'Ce compte est déjà inscrit.' });
      if (blockedAt(userId, t.players)) return reply({ ok: false, error: 'Impossible de rejoindre ce tournoi.' });
      let finalName = name;
      for (let k = 2; t.players.some((x) => x.name === finalName); k++) finalName = `${name} ${k}`;
      const player: TPlayer = { id: randomUUID(), token: randomUUID(), name: finalName, avatar: cleanAvatar(p?.avatar), dice: cleanDice(p?.dice), userId, day: clientDay(p?.day), socketId: null, left: false, out: null };
      t.players.push(player);
      tAttach(t, player);
      reply({ ok: true, code: t.code, playerId: player.id, token: player.token });
      tNotice(t, `${player.name} s'est inscrit.`);
      autoStartIfFull(t);
      broadcastT(t);
    });

    /**
     * Salon d'un tournoi programmé : comptes inscrits seulement. Pendant les 5 minutes, un compte
     * non inscrit peut s'inscrire ici (avec `pay: true` : 10 pièces débitées par le serveur).
     */
    function schedJoin(t: Tournament, p: any): Ack<{ code: string; playerId: string; token: string }> {
      const u = accounts.userFromToken(p?.auth);
      if (!u) return { ok: false, error: 'Les tournois programmés demandent un compte (gratuit). Créez-en un depuis l’accueil.' };
      const same = t.players.find((x) => x.userId === u.id);
      if (same) {
        same.awayAt = null;
        tAttach(t, same);
        broadcastT(t);
        return { ok: true, code: t.code, playerId: same.id, token: same.token };
      }
      if (t.status !== 'inscriptions' || t.sched!.cancelled) return { ok: false, error: 'Le tournoi a déjà commencé.' };
      if (!sched.registered(t.sched!.slot).includes(u.id)) {
        if (!p?.pay) return { ok: false, error: 'Inscrivez-vous d’abord (10 pièces).' };
        const err = sched.register(u.id, t.sched!.slot);
        if (err) return { ok: false, error: err };
      }
      const player: TPlayer = { id: randomUUID(), token: randomUUID(), name: u.username, avatar: cleanAvatar(p?.avatar), dice: cleanDice(p?.dice), userId: u.id, day: clientDay(p?.day), socketId: null, left: false, out: null };
      t.players.push(player);
      tAttach(t, player);
      tNotice(t, `${player.name} a rejoint le salon.`);
      broadcastT(t);
      return { ok: true, code: t.code, playerId: player.id, token: player.token };
    }

    socket.on('tournament:fillBots', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = tctx();
      if (!c || c.t.status !== 'inscriptions') return reply({ ok: false, error: 'Action impossible' });
      if (c.p.id !== c.t.hostId) return reply({ ok: false, error: "Seul l'organisateur complète le tournoi" });
      if (c.t.settings.stake > 0) return reply({ ok: false, error: 'Pas d’ordinateur dans un tournoi avec mise.' });
      const level = cleanDiff(p?.difficulty);
      while (c.t.players.length < c.t.settings.maxPlayers) {
        const b = botIdentity(c.t.players.map((x) => x.name));
        c.t.players.push({ id: randomUUID(), token: randomUUID(), name: b.name, avatar: b.avatar, dice: botDice(), day: '', socketId: null, left: false, out: null, bot: level });
      }
      reply({ ok: true });
      tNotice(c.t, 'Le tournoi est complété par des ordinateurs.');
      autoStartIfFull(c.t);
      broadcastT(c.t);
    });

    socket.on('tournament:settings', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = tctx();
      if (!c || c.t.status !== 'inscriptions') return reply({ ok: false, error: 'Action impossible' });
      if (c.p.id !== c.t.hostId) return reply({ ok: false, error: "Seul l'organisateur modifie le tournoi" });
      const s = sanitizeTournament(p?.settings, c.t.settings.title);
      if (s.maxPlayers < c.t.players.length) return reply({ ok: false, error: `Il y a déjà ${c.t.players.length} inscrits.` });
      if (s.stake !== c.t.settings.stake && c.t.players.length > 1) return reply({ ok: false, error: 'La mise ne change plus une fois des joueurs inscrits.' });
      const problem = stakeProblem(c.p.userId, s.stake);
      if (problem) return reply({ ok: false, error: problem });
      c.t.settings = s;
      reply({ ok: true });
      broadcastT(c.t);
    });

    socket.on('tournament:start', (_p: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      const c = tctx();
      if (!c) return reply({ ok: false, error: 'Action impossible' });
      if (c.p.id !== c.t.hostId) return reply({ ok: false, error: "Seul l'organisateur lance le tournoi" });
      const err = startTournament(c.t);
      reply(err ? { ok: false, error: err } : { ok: true });
    });

    function tLeave() {
      const c = tctx();
      if (!c) return;
      const { t, p } = c;
      socket.leave(tRoom(t.code));
      socket.data.tcode = null;
      p.socketId = null;
      if (t.sched && t.status === 'inscriptions') {
        // Salon programmé : on quitte le salon mais on reste inscrit (absent au départ = remboursé).
        t.players = t.players.filter((x) => x !== p);
        tNotice(t, `${p.name} a quitté le salon.`);
      } else if (t.status === 'inscriptions') {
        t.players = t.players.filter((x) => x !== p);
        tNotice(t, `${p.name} s'est désinscrit.`);
        if (t.timer) { clearTimeout(t.timer); t.timer = null; t.nextRoundAt = null; }
        if (!t.players.length) { tournaments.delete(t.code); return; }
        if (t.hostId === p.id) t.hostId = (t.players.find((x) => x.socketId) ?? t.players[0]).id;
      } else if (t.status === 'en-cours' && p.finished) {
        // Son tournoi est fini (éliminé, ou place de finale acquise) : il part, ce n'est pas un abandon.
        const tb = t.rounds.at(-1)!.tables.find((x) => x.ids.includes(p.id));
        const r = tb && rooms.get(tb.code);
        const m = r?.members.find((x) => x.id === p.id);
        if (r && m && !m.left) {
          m.left = true;
          m.quit = 'cashed';
          if (m.socketId === socket.id) { m.socketId = null; socket.leave(r.code); socket.data.code = null; }
          if (!tb!.ranking) notice(r, `${m.name} a fini sa partie et quitté la table.`);
          broadcastRoom(r);
        }
      } else if (t.status === 'en-cours' && p.out == null) {
        // Abandon : le serveur joue ses parties (il ne peut pas aller loin).
        p.left = true;
        const tb = t.rounds.at(-1)!.tables.find((x) => x.ids.includes(p.id));
        const r = tb && rooms.get(tb.code);
        const m = r?.members.find((x) => x.id === p.id);
        if (r && m && !m.left) {
          m.left = true;
          if (m.socketId === socket.id) { m.socketId = null; socket.leave(r.code); socket.data.code = null; }
          notice(r, `${m.name} abandonne le tournoi : le serveur jouera à sa place.`, 'warning');
          scheduleTurn(r);
          broadcastRoom(r);
        }
      }
      broadcastT(t);
    }
    socket.on('tournament:leave', (_p: unknown, ack: unknown) => { tLeave(); safeAck(ack)({ ok: true }); });

    socket.on('disconnect', () => {
      clearInterval(refill);
      unwatch(socket);
      const tc = tctx();
      if (tc && tc.p.socketId === socket.id) {
        tc.p.socketId = null;
        tc.p.awayAt = Date.now();
        if (tc.t.status === 'inscriptions' && tc.t.hostId === tc.p.id) {
          const next = tc.t.players.find((x) => x.socketId != null);
          if (next) tc.t.hostId = next.id;
        }
        broadcastT(tc.t);
      }
      const c = ctx();
      if (!c || c.m.socketId !== socket.id) return;
      const { r, m } = c;
      m.socketId = null;
      m.disconnectedAt = Date.now();
      r.lastActivity = Date.now();
      notice(r, `${m.name} s'est déconnecté.`, 'warning');
      if (r.status === 'playing' && r.game && currentPlayerId(r.game) === m.id) scheduleTurn(r);
      if (r.status === 'lobby') quickPlan(r);
      if (m.id === r.hostId && !r.tournament) {
        if (r.hostTimer) clearTimeout(r.hostTimer);
        r.hostTimer = setTimeout(() => {
          if (m.socketId == null && r.hostId === m.id) transferHost(r, `L'hôte ${m.name} a quitté la partie.`);
        }, HOST_GRACE);
      }
      broadcastRoom(r);
    });
  });

  await new Promise<void>((resolve) => http.listen(opts.port, resolve));
  // Nouveautés de la version publiée : annoncées sur Discord peu après le démarrage.
  const newsDelay = opts.discordHooks?.newsDelayMs ?? (process.env.VITEST ? 0 : 20_000);
  const newsTimer = newsDelay ? setTimeout(() => void dHooks.news(), newsDelay) : null;
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : opts.port;
  return {
    port,
    rooms,
    closeDmTable: (code: string) => dmOnline.closeTable(code),
    tournaments,
    accounts,
    store,
    schedTick,
    cfOnline,
    cfTour,
    cfStats,
    close: () => new Promise<void>((resolve) => {
      accounts.social.close();
      cfTour.close();
      cfOnline.close();
      dmOnline.close();
      clearInterval(sweeper);
      if (schedTimer) clearInterval(schedTimer);
      if (newsTimer) clearTimeout(newsTimer);
      for (const r of rooms.values()) { if (r.turnTimer) clearTimeout(r.turnTimer); if (r.hostTimer) clearTimeout(r.hostTimer); if (r.quick?.timer) clearTimeout(r.quick.timer); }
      for (const t of tournaments.values()) if (t.timer) clearTimeout(t.timer);
      rooms.clear();
      tournaments.clear();
      // Les connexions se ferment d'abord (leurs gestionnaires lisent encore la base), puis la base.
      io.close();
      http.close(() => { store.close(); resolve(); });
    }),
  };
}
