/**
 * Serveur de jeu : salons privés et publics, tournois, autorité sur les dés et sur les règles,
 * synchronisation temps réel. Les salons et tournois vivent en mémoire ; les comptes (pièces,
 * mises, gains) sont en base.
 */
import express from 'express';
import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { DEFAULT_CONFIG, isSuddenDeath, sanitizeConfig, type GameConfig } from '../shared/config';
import { createGame, currentPlayerId, rollAction, stopAction, type GameState } from '../shared/engine';
import { decide, type Difficulty } from '../shared/ai';
import { AVATARS, isReaction, type Ack, type PublicRoom } from '../shared/protocol';
import { sanitizeGesture, type ThrowGesture } from '../shared/gesture';
import {
  MIN_TOURNAMENT_PLAYERS, prizes, qualifiersOf, sanitizeTable, sanitizeTournament, splitPot, splitTables,
  type LobbyEntry, type PublicTournament, type TableSettings, type TournamentEntry, type TournamentSettings,
} from '../shared/tournament';
import { Store } from './db';
import { clientDay, createAccounts, type AccountsOptions } from './accounts';
import { createStats, type StatsOptions } from './stats';
import { albumKey, didWin, finalPlace } from '../shared/progress/profile';
import type { ComboKind } from '../shared/combos';
import { getItem } from '../shared/progress/catalog';
import { COLLECTION } from '../shared/progress/dice-collection';

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
}

type TableStats = { count421: number; combos: Partial<Record<ComboKind, number>>; gestures: number; roundsLost: number; maxTokens: number; keys: string[]; best: { label: string; rank: number } | null };

interface Room {
  code: string;
  title: string;
  hostId: string;
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
  /** Début de la partie en cours (durée réelle : récompenses et statistiques). */
  startedAt: number;
  /** Mises engagées pour la partie en cours (comptes débités au lancement). */
  pot: number;
  /** Tournoi auquel appartient cette table. */
  tournament: string | null;
  /** Numéro de partie (référence du séquestre des mises). */
  games: number;
}

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
  accounts?: AccountsOptions;
  stats?: StatsOptions;
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
const emptyStats = (): TableStats => ({ count421: 0, combos: {}, gestures: 0, roundsLost: 0, maxTokens: 0, keys: [], best: null });

export async function startServer(opts: ServerOptions) {
  const DISCONNECT_GRACE = opts.disconnectGraceMs ?? 20_000;
  const AUTOPLAY_DELAY = opts.autoPlayDelayMs ?? 2_600;
  const HOST_GRACE = opts.hostGraceMs ?? 15_000;
  const ROLL_GRACE = opts.rollGraceMs ?? 4_000;
  const STOP_GRACE = opts.stopGraceMs ?? 1_500;
  const T_PAUSE = opts.tournamentPauseMs ?? 12_000;
  const T_FULL_START = opts.tournamentFullStartMs ?? 6_000;

  const app = express();
  app.set('trust proxy', 1); // adresse IP réelle derrière l'hébergeur (limite de tentatives)
  const store = new Store(opts.dbPath ?? (process.env.VITEST ? ':memory:' : process.env.DATABASE_PATH ?? 'data/421.sqlite'));
  // eslint-disable-next-line prefer-const
  let stats: ReturnType<typeof createStats>;
  const accounts = createAccounts(store, { ...opts.accounts, onSoloFinished: (g) => stats.recordSolo(g) });
  const rooms = new Map<string, Room>();
  const tournaments = new Map<string, Tournament>();
  const humanConnected = (m: Member) => !m.bot && !m.left && m.socketId != null;
  stats = createStats(store, {
    minSoloMs: opts.accounts?.minSoloMs, ...opts.stats, userFromToken: accounts.userFromToken,
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
  app.use('/api', stats.router);

  // Listes publiques : salons en attente de joueurs et tournois ouverts aux inscriptions.
  app.get('/api/lobbies', (_req, res) => {
    const lobbies: LobbyEntry[] = [...rooms.values()]
      .filter((r) => r.status === 'lobby' && !r.tournament && r.table.visibility === 'public' && r.members.length < r.table.maxPlayers
        && r.members.some((m) => m.socketId != null))
      .sort((a, b) => b.members.length - a.members.length)
      .slice(0, 50)
      .map((r) => ({
        code: r.code, title: r.title, host: r.members.find((m) => m.id === r.hostId)?.name ?? '?', players: r.members.length,
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
  // Un code saisi : table ou tournoi ?
  app.get('/api/code/:code', (req, res) => {
    const code = cleanCode(req.params.code);
    const kind = code && rooms.has(code) && !rooms.get(code)!.tournament ? 'room' : code && tournaments.has(code) ? 'tournament' : null;
    res.setHeader('Cache-Control', 'no-store');
    if (!kind) return res.status(404).json({ ok: false, error: 'Aucune table ni aucun tournoi avec ce code. Vérifiez-le.' });
    res.json({ ok: true, kind });
  });
  app.use('/api', accounts.router);
  const http = createServer(app);
  const io = new Server(http, { cors: { origin: true } });
  stats.attach(io);

  app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size, tournaments: tournaments.size }));
  const here = dirname(fileURLToPath(import.meta.url));
  const clientDir = join(here, '..', 'dist', 'client');
  if (existsSync(clientDir)) {
    // sw.js et index.html ne doivent jamais rester en cache : sinon les mises à jour n'arrivent pas.
    app.use(express.static(clientDir, {
      extensions: ['html'], // /regles-du-421 → regles-du-421.html (pages lisibles par les moteurs de recherche)
      setHeaders: (res, path) => {
        if (path.endsWith('sw.js') || path.endsWith('index.html') || path.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
        if (path.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
      },
    }));
    app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(join(clientDir, 'index.html')); });
  }

  const newCode = () => {
    let code: string;
    do code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while (rooms.has(code) || tournaments.has(code));
    return code;
  };

  function makeRoom(o: { title: string; host: Member; members: Member[]; config: GameConfig; table: TableSettings; tournament?: string }): Room {
    const r: Room = {
      code: newCode(), title: o.title, hostId: o.host.id, members: o.members, config: o.config, table: o.table, status: 'lobby',
      game: null, turnTimer: null, turnDeadline: null, autoTurnOf: null, timeoutEnd: null, hostTimer: null, stats: new Map(),
      rewarded: false, startedAt: Date.now(), lastSummarySeq: -1, lastActivity: Date.now(), pot: 0, tournament: o.tournament ?? null, games: 0,
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
    members: r.members.map((m) => ({
      id: m.id, name: m.name, avatar: m.avatar, ready: m.ready,
      connected: m.socketId != null || !!m.bot, left: m.left, isHost: m.id === r.hostId, ...(m.bot ? { bot: m.bot } : {}),
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
      r.turnTimer = setTimeout(() => autoPlay(r, pid, 'ai'), grace + Math.round(AUTOPLAY_DELAY * (0.3 + Math.random() * 0.4)));
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
        afterAction(r, rollAction(g, pid, [false, false, false], officialDie));
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
    const res = d.kind === 'roll' ? rollAction(g, pid, d.keep, officialDie) : stopAction(g, pid);
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

  /** Gagnants d'une partie (ex æquo possibles aux points). */
  const winnersOf = (g: GameState) => g.players.filter((p) => didWin(g, p.id)).map((p) => p.id)
    .sort((a, b) => g.ranking.indexOf(a) - g.ranking.indexOf(b));

  /**
   * Fin de partie en ligne : la cagnotte éventuelle va au(x) gagnant(s), puis chaque joueur
   * connecté à un compte reçoit sa récompense (calculée ici).
   */
  function rewardOnline(r: Room) {
    r.rewarded = true;
    const g = r.game!;
    if (r.pot > 0) {
      const winners = winnersOf(g);
      const shares = splitPot(r.pot, winners.length);
      winners.forEach((id, i) => {
        const m = r.members.find((x) => x.id === id);
        if (m?.userId) sendProfile(m.socketId, accounts.winPot(m.userId, shares[i])?.profile);
      });
      const names = winners.map((id) => r.members.find((x) => x.id === id)?.name).join(' et ');
      notice(r, `${names} remporte${winners.length > 1 ? 'nt' : ''} la cagnotte de ${r.pot} pièces.`);
      r.pot = 0;
    }
    accounts.release(`R:${r.code}:${r.games}`);
    for (const m of r.members) {
      if (!m.userId || !g.players.some((p) => p.id === m.id)) continue;
      const st = r.stats.get(m.id) ?? emptyStats();
      const out = accounts.onlineGameEnd(m.userId, didWin(g, m.id), g.round, {
        mode: 'online', opponents: g.players.length - 1, count421: st.count421, combos: st.combos, gestureThrows: st.gestures,
        rounds: g.round, roundsLost: g.config.variant === 'manches' ? undefined : st.roundsLost, maxTokens: st.maxTokens,
        suddenDeath: isSuddenDeath(g.config),
        comboKeys: st.keys, best: st.best ?? undefined,
        opponentNames: r.members.filter((x) => x.id !== m.id && g.players.some((p) => p.id === x.id)).map((x) => x.name),
        place: finalPlace(g, m.id),
        minutes: (Date.now() - r.startedAt) / 60000,
      }, m.day, m.left);
      if (out && m.socketId) io.to(m.socketId).emit('profile:reward', out);
    }
    // Saison classée : entre au moins deux humains, sans mort subite. Places parmi les humains.
    const humans = r.members.filter((m) => !m.bot && g.players.some((p) => p.id === m.id));
    if (humans.length >= 2 && !isSuddenDeath(g.config)) {
      // Un joueur parti est dernier ; sinon : 1 + humains restés et mieux classés (ex æquo possibles).
      const placed = humans.map((m) => ({ m, place: m.left ? humans.length : 1 + humans.filter((x) => !x.left && finalPlace(g, x.id) < finalPlace(g, m.id)).length }));
      accounts.seasonGame(placed.filter((x) => x.m.userId).map((x) => ({ userId: x.m.userId!, place: x.place, won: x.place === 1 })), humans.length);
    }
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
    if (r.table.stake > 0 && !r.tournament) {
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
    r.lastSummarySeq = -1;
    broadcastRoom(r); // d'abord la table (les joueurs de tournoi y sont installés), puis la donne
    io.to(r.code).emit('game:state', { state: r.game });
    scheduleTurn(r, STOP_GRACE);
    broadcastRoom(r);
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
      if (r.turnTimer) clearTimeout(r.turnTimer);
      if (r.hostTimer) clearTimeout(r.hostTimer);
      rooms.delete(r.code);
    }
  }

  /** Branche un socket sur un membre de salon (en le détachant de son salon précédent). */
  function attachSocket(socket: Socket, r: Room, m: Member) {
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
    const groups = splitTables(ids, t.settings.tableSize);
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
      if (p.userId) sendProfile(p.socketId, accounts.tournamentEnd(p.userId, place, gains[place] ?? 0)?.profile);
    });
    accounts.release(`T:${t.code}`);
    const champ = t.players.find((p) => p.id === standings[0])!;
    tNotice(t, `${champ.name} remporte le tournoi${gains[0] ? ` et ${gains[0]} pièces` : ''} !`);
    broadcastT(t);
    // Les tables restent consultables un moment, puis tout est rangé.
    setTimeout(() => {
      for (const rd of t.rounds) for (const tb of rd.tables) { const r = rooms.get(tb.code); if (r?.turnTimer) clearTimeout(r.turnTimer); rooms.delete(tb.code); }
      tournaments.delete(t.code);
    }, 15 * 60_000).unref?.();
  }

  // Ménage des salons et tournois abandonnés.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values())
      if (!r.tournament && r.members.every((m) => m.socketId == null) && now - r.lastActivity > 10 * 60_000) {
        if (r.turnTimer) clearTimeout(r.turnTimer);
        rooms.delete(r.code);
      }
    for (const t of tournaments.values())
      if (t.status === 'inscriptions' && t.players.every((p) => p.socketId == null) && now - t.lastActivity > 10 * 60_000) {
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
        if (existing.left) return reply({ ok: false, error: 'Vous avez quitté cette partie.' });
        const wasAway = existing.socketId == null;
        existing.userId = existing.userId ?? accounts.userFromToken(p?.auth)?.id;
        attach(r, existing);
        reply({ ok: true, code: r.code, playerId: existing.id, token: existing.token });
        if (wasAway) notice(r, `${existing.name} est de retour.`);
        broadcastRoom(r);
        if (r.game) socket.emit('game:state', { state: r.game });
        // Seul le retour du joueur actif change son minuteur (fin du délai de déconnexion).
        if (r.status === 'playing' && r.game && wasAway && currentPlayerId(r.game) === existing.id) scheduleTurn(r, STOP_GRACE);
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
      if (r.members.length >= r.table.maxPlayers) return { ok: false, error: `Le salon est complet (${r.table.maxPlayers} joueurs).` };
      const userId = accounts.userFromToken(p?.auth)?.id;
      const problem = stakeProblem(userId, r.table.stake);
      if (problem) return { ok: false, error: problem };
      if (blockedAt(userId, r.members)) return { ok: false, error: 'Impossible de rejoindre cette table.' };
      let finalName = name;
      for (let k = 2; r.members.some((m) => m.name === finalName); k++) finalName = `${name} ${k}`;
      const m: Member = { id: randomUUID(), token: randomUUID(), name: finalName, avatar: cleanAvatar(p?.avatar), dice: cleanDice(p?.dice), ready: false, socketId: null, left: false, disconnectedAt: null, userId, day: clientDay(p?.day) };
      r.members.push(m);
      attach(r, m);
      notice(r, `${m.name} a rejoint le salon.`);
      broadcastRoom(r);
      return { ok: true, code: r.code, playerId: m.id, token: m.token };
    }

    // Partie rapide : une table publique sans mise qui attend des joueurs, sinon une nouvelle.
    socket.on('room:quick', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      if (!cleanName(p?.name)) return reply({ ok: false, error: 'Choisissez un nom' });
      const userId = accounts.userFromToken(p?.auth)?.id;
      const candidates = [...rooms.values()].filter((r) => r.status === 'lobby' && !r.tournament && r.table.visibility === 'public' && r.table.stake === 0
        && r.members.length < r.table.maxPlayers && r.members.some((m) => m.socketId != null) && !blockedAt(userId, r.members))
        .sort((a, b) => b.members.filter((m) => !m.bot).length - a.members.filter((m) => !m.bot).length);
      if (candidates.length) return reply(seatNew(candidates[0], p));
      const name = cleanName(p.name)!;
      const m: Member = { id: randomUUID(), token: randomUUID(), name, avatar: cleanAvatar(p?.avatar), dice: cleanDice(p?.dice), ready: true, socketId: null, left: false, disconnectedAt: null, userId, day: clientDay(p?.day) };
      const r = makeRoom({ title: `Partie rapide de ${name}`, host: m, members: [m], config: DEFAULT_CONFIG, table: { visibility: 'public', maxPlayers: 4, stake: 0 } });
      attach(r, m);
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
      broadcastRoom(c.r);
    });
    socket.on('room:removeBot', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c || c.r.status !== 'lobby' || c.m.id !== c.r.hostId) return reply({ ok: false, error: 'Action impossible' });
      c.r.members = c.r.members.filter((m) => !(m.bot && m.id === p?.id));
      reply({ ok: true });
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
      for (const m of c.r.members) if (m.id !== c.r.hostId && !m.bot) m.ready = false;
      reply({ ok: true });
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
      const c = ctx();
      if (!c || c.r.status !== 'playing' || !c.r.game) return reply({ ok: false, error: 'Aucune partie en cours' });
      const g = c.r.game;
      if (p?.version !== g.version) return reply({ ok: false, error: 'Action ignorée (déjà prise en compte)' });
      if (c.r.autoTurnOf === c.m.id) c.r.autoTurnOf = null; // le joueur reprend la main
      if (c.r.timeoutEnd === c.m.id) return reply({ ok: false, error: 'Temps écoulé' });
      const res = kind === 'roll' ? rollAction(g, c.m.id, p?.keep, officialDie) : stopAction(g, c.m.id);
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
    socket.on('game:roll', gameAction('roll'));
    socket.on('game:stop', gameAction('stop'));

    socket.on('room:rematch', (_p: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      const c = ctx();
      if (!c || c.m.id !== c.r.hostId || c.r.tournament) return reply({ ok: false, error: "Seul l'hôte peut relancer" });
      if (c.r.game && c.r.game.phase !== 'fini') return reply({ ok: false, error: 'La partie est en cours' });
      const r = c.r;
      r.status = 'lobby';
      r.game = null;
      r.members = r.members.filter((m) => !m.left);
      for (const m of r.members) m.ready = m.id === r.hostId || !!m.bot;
      reply({ ok: true });
      notice(r, "L'hôte propose une revanche : retour au salon.");
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
      else {
        m.left = true;
        notice(r, `${m.name} a quitté la partie : le serveur jouera à sa place.`, 'warning');
        scheduleTurn(r);
      }
      if (wasHost) transferHost(r, `L'hôte ${m.name} a quitté la partie.`);
      broadcastRoom(r);
      removeIfEmpty(r);
    }
    socket.on('room:leave', (_p: unknown, ack: unknown) => { leave(); safeAck(ack)({ ok: true }); });

    // --- Tournois -------------------------------------------------------------------------------
    function tAttach(t: Tournament, p: TPlayer) {
      const prev = p.socketId && io.sockets.sockets.get(p.socketId);
      if (prev && prev.id !== socket.id) prev.disconnect(true);
      p.socketId = socket.id;
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
        if (r && m && t.status === 'en-cours' && !tb!.ranking) {
          const wasAway = m.socketId == null;
          attach(r, m);
          broadcastRoom(r);
          if (r.game) socket.emit('game:state', { state: r.game });
          if (wasAway && r.game && currentPlayerId(r.game) === m.id) scheduleTurn(r, STOP_GRACE);
        }
        broadcastT(t);
        return;
      }
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
      if (t.status === 'inscriptions') {
        t.players = t.players.filter((x) => x !== p);
        tNotice(t, `${p.name} s'est désinscrit.`);
        if (t.timer) { clearTimeout(t.timer); t.timer = null; t.nextRoundAt = null; }
        if (!t.players.length) { tournaments.delete(t.code); return; }
        if (t.hostId === p.id) t.hostId = (t.players.find((x) => x.socketId) ?? t.players[0]).id;
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
      const tc = tctx();
      if (tc && tc.p.socketId === socket.id) {
        tc.p.socketId = null;
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
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : opts.port;
  return {
    port,
    rooms,
    tournaments,
    accounts,
    close: () => new Promise<void>((resolve) => {
      accounts.social.close();
      clearInterval(sweeper);
      for (const r of rooms.values()) { if (r.turnTimer) clearTimeout(r.turnTimer); if (r.hostTimer) clearTimeout(r.hostTimer); }
      for (const t of tournaments.values()) if (t.timer) clearTimeout(t.timer);
      rooms.clear();
      tournaments.clear();
      // Les connexions se ferment d'abord (leurs gestionnaires lisent encore la base), puis la base.
      io.close();
      http.close(() => { store.close(); resolve(); });
    }),
  };
}
