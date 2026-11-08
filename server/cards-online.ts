/**
 * « Coups Fourrés » en ligne (mode cartes) : parties contre l'ordinateur récompensées sans triche,
 * duels entre amis, tables privées à code (2 à 4), parties classées 1 contre 1, spectateurs,
 * tchat de table, présence des amis dans le mode.
 *
 * Le serveur fait foi : il garde l'état complet (moteur shared/cards/engine.ts), tire les dés avec un
 * générateur cryptographique, et n'envoie à chacun que sa vue (`viewFor`), ses actions possibles et
 * les événements qu'il a le droit de voir (`eventsFor`). Spectateurs : vue publique sans rien de caché.
 *
 * Fenêtres de réponse : les parties en ligne sont créées avec `windows: true`. Un joueur qui a
 * vraiment une Riposte ou un Dernier mot jouable a 15 s (`windowMs`) pour décider ; « Laisser faire »
 * ou jouer la carte fait reprendre la partie tout de suite. Sans carte jouable : aucune pause.
 *
 * Routes (préfixe /api, comptes) : POST /cf/bot/start, POST /cf/bot/end, POST /cf/bot/abandon,
 * GET /cf/friends, POST /cf/presence, GET /cf/challenges. (POST /cf/decks/auto est dans cards.ts.)
 * Socket.IO : espace « /cf » (voir shared/cards/protocol.ts pour la forme des messages).
 */
import { randomInt, randomUUID } from 'node:crypto';
import { parcoursStepOf } from '../shared/cards/parcours';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Namespace, Server, Socket } from 'socket.io';
import { photoUrl, type Store, type UserRow } from './db';
import type { CardsApi, CfGameReward } from './cards';
import type { TableChatEntry } from './moderation';
import { CARDS, CF_RULES, STARTER_DECKS, cardDef, type CardRarity } from '../shared/cards/catalog';
import { buildAutoDeck } from '../shared/cards/autodeck';
import {
  apply, decisionKind, defaultAction, eventsFor, legalActions, newGame, viewFor, waitingFor,
  type CfAction, type CfEvent, type CfState,
} from '../shared/cards/engine';
import { replayBotMatch, type BotMatchSetup } from '../shared/cards/botmatch';
import { CF_LEVEL_LABEL, type CfLevel } from '../shared/cards/ai';
import { cfDivisionOf, type CfMissionKind } from '../shared/cards/progress';
import { CfPlayTracker, deckCounts } from '../shared/cards/stats';
import type { CfStatsApi } from './cf-stats';
import type { CfConfig } from '../shared/cards/engine';
import {
  CF_SPECTATOR_ID, type CfChallengeMsg, type CfFriendPresence, type CfGameMode, type CfHelloMsg, type CfQueueMsg,
  type CfStateMsg, type CfTableMsg, type CfWireSeat, type CfWireSnapshot,
} from '../shared/cards/protocol';
import { isReaction } from '../shared/protocol';
import { muteText } from '../shared/moderation';

export interface CfOnlineOptions {
  /** Durée minimale d'une partie contre l'ordinateur pour être récompensée (0 : désactivé, essais). */
  minBotMs?: number;
  /** Durée de validité d'une partie contre l'ordinateur commencée. */
  botTtlMs?: number;
  /** Temps par décision et réserve de la partie (par défaut : livre de règles, 30 s et 60 s). */
  decisionMs?: number;
  reserveMs?: number;
  /** Fenêtre de réponse fixe après une carte jouée / avant les comptes (Dernier mot), et après des dés gardés. */
  windowMs?: number;
  keepWindowMs?: number;
  /** Temps pour revenir après une déconnexion (sinon : abandon en duel, le serveur joue à sa place à 3-4). */
  disconnectMs?: number;
  /** File classée : proposition d'une partie contre l'ordinateur au bout de ce temps. */
  botOfferMs?: number;
  matchTickMs?: number;
  /** Défi entre amis : délai de réponse. */
  challengeMs?: number;
  /** Présence dans le menu du mode : expire sans nouveau signal. */
  presenceMs?: number;
  /** Délai avant que le serveur joue pour un joueur parti (partie à 3-4). */
  autoplayMs?: number;
}

interface Ctx {
  io: Server;
  store: Store;
  cards: CardsApi;
  userFromToken: (t: unknown) => UserRow | undefined;
  banOf: (userId: string) => { until: number | null; reason: string } | undefined;
  muteOf: (userId: string) => { until: number; reason: string } | undefined;
  push: (userId: string, title: string, body: string, url?: string) => void;
  /** Tchat de table : le message est gardé avec ceux du jeu de base (signalements). */
  recordChat: (e: TableChatEntry) => void;
  now?: () => number;
  opts?: CfOnlineOptions;
  /** Statistiques réelles des cartes (administration). */
  stats?: CfStatsApi;
}

/**
 * Temps de réponse en ligne (Riposte, Dernier mot), seulement quand le joueur a une carte jouable.
 * Seul endroit où le régler.
 */
// Sam (0.39) : 15 s pour réfléchir, seulement quand on a vraiment une carte à jouer.
export const CF_RESPONSE_WINDOW_MS = 15000;
export const CF_KEEP_WINDOW_MS = 15000;
/** Fin d'une partie en ligne (tournoi du samedi : avancement du tableau). */
export interface CfGameEnd { id: string; mode: CfGameMode; winner: string; losers: string[]; abandon: string | null }

// --- Parties contre l'ordinateur ------------------------------------------------------------------
const LEVELS: CfLevel[] = ['debutant', 'habitue', 'fine-fouine'];
/** Noms de bistrot originaux pour les ordinateurs. */
export const CF_BOT_NAMES = [
  'Mimile du comptoir', 'Tonton Gaston', 'La Mère Ginette', 'Fredo des Halles', 'Bébert la Tournée', 'Le Grand Raymond',
  'Zézette', 'Momo le Zingueur', 'Riton du Marché', 'Paulette Belote', 'Dédé Deux-Dés', 'Nénette du Port',
];
const deckList = (cards: Record<string, number>) => CARDS.flatMap((c) => Array<string>(cards[c.id] ?? 0).fill(c.id));
const RARITY_WEIGHT: Record<CardRarity, number> = { commune: 8, rare: 3, epique: 1, legendaire: 0.4 };

/** Deck d'un ordinateur : un deck de départ, ou un deck automatique tiré d'une collection au hasard. */
export function cfBotDeck(rand: (n: number) => number = randomInt): { name: string; cards: Record<string, number> } {
  if (rand(3) === 0) { const d = STARTER_DECKS[rand(STARTER_DECKS.length)]; return { name: d.name, cards: { ...d.cards } }; }
  const total = CARDS.reduce((a, c) => a + RARITY_WEIGHT[c.rarity], 0);
  for (let attempt = 0; attempt < 5; attempt++) {
    const owned: Record<string, number> = {};
    for (let i = 0; i < 60; i++) { // 0.40 : assez de cartes pour remplir un deck de 2 familles
      let x = (rand(1_000_000) / 1_000_000) * total;
      const c = CARDS.find((k) => (x -= RARITY_WEIGHT[k.rarity]) < 0) ?? CARDS[0];
      owned[c.id] = (owned[c.id] ?? 0) + 1;
    }
    const deck = buildAutoDeck(owned);
    if (deck) return { name: 'Deck maison', cards: deck };
  }
  return { name: STARTER_DECKS[0].name, cards: { ...STARTER_DECKS[0].cards } };
}

/** Missions alimentées par les événements d'une partie : pièges, cartes, Habitués, Dernier mot gagnant. */
export function cfMissionCounts(events: CfEvent[], dmThisRound: Set<string>): Map<string, Partial<Record<CfMissionKind, number>>> {
  const out = new Map<string, Partial<Record<CfMissionKind, number>>>();
  const add = (pid: string | undefined, k: CfMissionKind) => {
    if (!pid) return;
    const m = out.get(pid) ?? {};
    m[k] = (m[k] ?? 0) + 1;
    out.set(pid, m);
  };
  for (const e of events) {
    if (e.kind === 'manche') dmThisRound.clear();
    else if (e.kind === 'pose') { add(e.player, 'cartes'); add(e.player, 'pieges'); }
    else if (e.kind === 'carte') {
      add(e.player, 'cartes');
      const d = e.card ? cardDef(e.card) : undefined;
      if (d?.type === 'habitue') add(e.player, 'habitues');
      if (d?.type === 'dernier-mot' && e.player) dmThisRound.add(e.player);
    } else if (e.kind === 'comptes' && e.player && dmThisRound.has(e.player)) { add(e.player, 'dernier-mot'); dmThisRound.clear(); }
  }
  return out;
}

// --- Parties en ligne ------------------------------------------------------------------------------
interface Seat {
  id: string;
  userId: string;
  name: string;
  account: string;
  photo?: string;
  label?: string;
  socketId: string | null;
  awayAt: number | null;
  awayTimer: NodeJS.Timeout | null;
  left: boolean;
  reserveMs: number;
}

interface Game {
  id: string;
  mode: CfGameMode;
  ranked: boolean;
  seats: Seat[];
  state: CfState;
  startedAt: number;
  spectators: Map<string, { userId: string; name: string }>;
  /** Début de la décision en cours de chaque joueur attendu, et son minuteur. */
  since: Map<string, number>;
  timers: Map<string, NodeJS.Timeout>;
  /** Fenêtre de réponse (Riposte / Dernier mot) : durée fixe, décision « passer » retenue jusqu'à la fin. */
  window: { key: string; player: string; until: number; kind: 'respond' | 'lastword'; buffered: CfAction | null; timer: NodeJS.Timeout } | null;
  autoTimer: NodeJS.Timeout | null;
  ended: boolean;
  endedAt: number;
  standings: string[];
  abandon: string | null;
  rewards: Map<string, CfGameReward>;
  dm: Set<string>;
  /** Statistiques des cartes : decks de départ (par siège), premier meneur, cartes jouées. */
  decks: Map<string, string[]>;
  track: CfPlayTracker;
}

interface TableMember { userId: string; name: string; account: string; photo?: string; deckId: string | null; socketId: string | null }
interface Table { code: string; hostId: string; members: TableMember[]; kicked: Set<string>; createdAt: number }
interface Challenge { id: string; fromId: string; toId: string; fromDeck: string | null; at: number; timer: NodeJS.Timeout }
interface QueueEntry { userId: string; points: number; deckId: string | null; since: number; socketId: string; offered: boolean }

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_TABLE = 4;
const MAX_SPECTATORS = 20;
const officialDie = () => randomInt(1, 7);
const cleanCode = (v: unknown) => (typeof v === 'string' && /^[A-Z0-9]{5}$/.test(v.toUpperCase()) ? v.toUpperCase() : null);

export function createCfOnline(c: Ctx) {
  const { io, store, cards } = c;
  const o = c.opts ?? {};
  const now = c.now ?? Date.now;
  const MIN_BOT = o.minBotMs ?? 30_000;
  const BOT_TTL = o.botTtlMs ?? 6 * 3600_000;
  const DECISION = o.decisionMs ?? CF_RULES.decisionSeconds * 1000;
  const RESERVE = o.reserveMs ?? CF_RULES.reserveSeconds * 1000;
  const WINDOW = o.windowMs ?? CF_RESPONSE_WINDOW_MS;
  const KEEP_WINDOW = o.keepWindowMs ?? CF_KEEP_WINDOW_MS;
  const AWAY = o.disconnectMs ?? 60_000;
  const BOT_OFFER = o.botOfferMs ?? 60_000;
  const CHALLENGE = o.challengeMs ?? 120_000;
  const PRESENCE = o.presenceMs ?? 90_000;
  const AUTOPLAY = o.autoplayMs ?? 800;
  const ns: Namespace = io.of('/cf');

  const games = new Map<string, Game>();
  const socketSubs = new Set<(socket: Socket, userId: string) => void>();
  const tables = new Map<string, Table>();
  const challenges = new Map<string, Challenge>();
  const queue = new Map<string, QueueEntry>();
  const menu = new Map<string, number>(); // userId → dernier signal « dans le menu du mode »
  const userSockets = new Map<string, Set<string>>();
  const bots = new Map<string, { userId: string; setup: BotMatchSetup; startedAt: number }>();
  let chatSeq = 0;

  const sock = (id: string | null | undefined) => (id ? ns.sockets.get(id) : undefined);
  const toUser = (userId: string, ev: string, payload: unknown) => { for (const id of userSockets.get(userId) ?? []) sock(id)?.emit(ev, payload); };
  const friends = (a: string, b: string) => store.isFriend(a, b) || store.isFriend(b, a);
  const newCode = () => {
    let code: string;
    do code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while (games.has(code) || tables.has(code));
    return code;
  };
  const liveGameOf = (userId: string) => [...games.values()].find((g) => !g.ended && g.seats.some((s) => s.userId === userId && !s.left));
  /** 0.43 : partie à 3 ou 4 qu'on a quittée et qui continue (le serveur joue pour vous) : on peut y revenir. */
  const rejoinableOf = (userId: string) => [...games.values()].find((g) => !g.ended && g.seats.length > 2 && g.seats.some((s) => s.userId === userId && s.left));
  const tableOf = (userId: string) => [...tables.values()].find((t) => t.members.some((m) => m.userId === userId));
  const photoOf = (u: UserRow) => photoUrl(u) ?? undefined;

  /** Deck de partie d'un compte : celui demandé, sinon le deck actif ; il doit être jouable. */
  function deckFor(userId: string, deckId?: string | null, parcours = false): { cards: string[]; deckId: string; name: string } | { error: string } {
    // Parcours débutant : deck d'entraînement (pas besoin de le posséder), contre l'ordinateur seulement.
    const pc = parcours ? parcoursStepOf(deckId) : null;
    if (pc) return { cards: deckList(pc.cards), deckId: `parcours:${pc.step}`, name: `Parcours ${pc.step} · ${pc.title}` };
    const st = cards.state(userId);
    if (!st.discovered) return { error: 'Découvrez d’abord le mode Coups Fourrés.' };
    const d = st.decks.find((x) => x.id === (deckId || st.activeDeck));
    if (!d) return { error: 'Choisissez d’abord un deck.' };
    if (!d.valid) return { error: `Le deck « ${d.name} » n’est pas jouable : ${d.problems.join(' ')}` };
    return { cards: deckList(d.cards), deckId: d.id, name: d.name };
  }
  const cleanDeckId = (v: unknown) => (typeof v === 'string' && v.length <= 64 ? v : null);

  // --- Présence --------------------------------------------------------------------------------
  /** Où en est ce compte dans le mode (pour ses amis). */
  function presence(userId: string): Omit<CfFriendPresence, 'username' | 'photo'> | null {
    const g = liveGameOf(userId);
    if (g) return { status: 'partie', code: g.id, watchable: true };
    const t = menu.get(userId);
    if (queue.has(userId) || tableOf(userId) || (t !== undefined && now() - t < PRESENCE)) return { status: 'menu' };
    return null;
  }
  function friendsInMode(userId: string): CfFriendPresence[] {
    return store.friendsOf(userId).filter((f) => !store.isBlocked(userId, f.id)).flatMap((f) => {
      const p = presence(f.id);
      return p ? [{ username: f.username, ...(photoOf(f) ? { photo: photoOf(f) } : {}), ...p }] : [];
    });
  }

  // --- Vues ----------------------------------------------------------------------------------------
  const seatOf = (g: Game, id: string) => g.seats.find((s) => s.id === id);
  const wireSeats = (g: Game): CfWireSeat[] => g.seats.map((s) => ({
    id: s.id, name: s.name, account: s.account, ...(s.photo ? { photo: s.photo } : {}), ...(s.label ? { label: s.label } : {}),
    ...(s.awayAt != null ? { away: true } : {}), ...(s.left ? { left: true } : {}),
  }));
  function snapshot(g: Game, pid: string | null): CfWireSnapshot {
    const s = g.state;
    const waiting = g.ended ? [] : waitingFor(s);
    let legal = pid && !g.ended ? legalActions(s, pid) : [];
    if (g.window && g.window.player === pid && g.window.buffered) legal = [];
    const ref = pid && waiting.includes(pid) ? pid : waiting[0];
    const deadline = g.ended ? null : g.window ? g.window.until : ref && g.since.has(ref) ? g.since.get(ref)! + DECISION : null;
    const me = pid ? g.seats.find((x) => x.id === pid) : undefined;
    return {
      view: viewFor(s, pid ?? CF_SPECTATOR_ID),
      legal,
      waitingFor: waiting,
      seats: wireSeats(g),
      deadline,
      reserve: Object.fromEntries(g.seats.map((x) => [x.id, Math.max(0, Math.ceil(x.reserveMs / 1000))])),
      finished: g.ended ? { standings: g.standings, reward: me ? g.rewards.get(me.userId) ?? null : null, abandon: g.abandon } : null,
      responseWindow: g.window && !g.ended ? { player: g.window.player, until: g.window.until, kind: g.window.kind } : null,
    };
  }
  const message = (g: Game, pid: string | null, events: CfEvent[]): CfStateMsg =>
    ({ id: g.id, mode: g.mode, ranked: g.ranked, you: pid, snap: snapshot(g, pid), events: eventsFor(events, pid ?? CF_SPECTATOR_ID) });
  function publish(g: Game, events: CfEvent[] = []) {
    for (const seat of g.seats) sock(seat.socketId)?.emit('cf:state', message(g, seat.id, events));
    if (g.spectators.size) ns.to(`cfw:${g.id}`).emit('cf:state', message(g, null, events));
  }
  const notice = (g: Game, text: string) => ns.to(`cfg:${g.id}`).emit('cf:notice', { text });

  // --- Déroulement -------------------------------------------------------------------------------
  function clearTimers(g: Game) {
    for (const t of g.timers.values()) clearTimeout(t);
    g.timers.clear();
    if (g.window) clearTimeout(g.window.timer);
    g.window = null;
    if (g.autoTimer) clearTimeout(g.autoTimer);
    g.autoTimer = null;
  }

  /** Après chaque changement : minuteurs des décisions, fenêtres de réponse, joueurs partis. */
  function schedule(g: Game) {
    if (g.ended) return clearTimers(g);
    const s = g.state;
    const kind = decisionKind(s);
    const waiting = waitingFor(s);
    if (g.autoTimer) { clearTimeout(g.autoTimer); g.autoTimer = null; }
    // Fenêtre de réponse : durée fixe, la même pour tous.
    if (s.windows && (kind === 'respond' || kind === 'lastword') && waiting.length === 1) {
      const pid = waiting[0];
      const key = `${s.version}:${pid}`;
      if (g.window?.key !== key) {
        if (g.window) clearTimeout(g.window.timer);
        const top = s.stack[s.stack.length - 1];
        const seat = seatOf(g, pid);
        // Décision de Sam : pas de pause si le joueur n'a aucune Riposte / aucun Dernier mot jouable ;
        // s'il en a un, il a toujours tout son temps (15 s), sauf s'il répond avant.
        const canPlay = legalActions(s, pid).some((a) => a.type === 'play');
        const dur = !canPlay ? 0 : kind === 'respond' && top?.kind === 'keep' ? KEEP_WINDOW : WINDOW;
        const len = seat?.left ? Math.min(dur, AUTOPLAY) : dur;
        g.window = { key, player: pid, until: now() + len, kind, buffered: null, timer: setTimeout(() => closeWindow(g, key), len) };
      }
      for (const t of g.timers.values()) clearTimeout(t);
      g.timers.clear();
      g.since.clear();
      return;
    }
    if (g.window) { clearTimeout(g.window.timer); g.window = null; }
    for (const [pid, t] of [...g.timers]) if (!waiting.includes(pid)) { clearTimeout(t); g.timers.delete(pid); g.since.delete(pid); }
    for (const pid of [...g.since.keys()]) if (!waiting.includes(pid)) g.since.delete(pid);
    for (const pid of waiting) {
      const seat = seatOf(g, pid);
      if (!seat) continue;
      if (seat.left) {
        // Joueur parti (partie à 3-4) : le serveur joue à sa place, sans attendre.
        g.autoTimer ??= setTimeout(() => { g.autoTimer = null; autoPlay(g); }, AUTOPLAY);
        continue;
      }
      if (!g.since.has(pid)) g.since.set(pid, now());
      if (!g.timers.has(pid)) {
        const left = g.since.get(pid)! + DECISION + seat.reserveMs - now();
        g.timers.set(pid, setTimeout(() => timeout(g, pid), Math.max(0, left)));
      }
    }
  }

  function autoPlay(g: Game) {
    if (g.ended) return;
    const pid = waitingFor(g.state).find((id) => seatOf(g, id)?.left);
    if (!pid) return;
    const a = defaultAction(g.state, pid);
    if (a) doApply(g, pid, a, true);
  }

  /** Temps et réserve écoulés : action par défaut. */
  function timeout(g: Game, pid: string) {
    g.timers.delete(pid);
    if (g.ended || !waitingFor(g.state).includes(pid)) return;
    const seat = seatOf(g, pid);
    if (seat) seat.reserveMs = 0;
    const a = defaultAction(g.state, pid);
    if (!a) return;
    notice(g, `${seat?.name ?? 'Un joueur'} n’a pas joué à temps : action automatique.`);
    doApply(g, pid, a, true);
  }

  function closeWindow(g: Game, key: string, answer?: CfAction) {
    if (!g.window || g.window.key !== key || g.ended) return;
    const { player, buffered } = g.window;
    g.window = null;
    doApply(g, player, answer ?? buffered ?? { type: 'pass' }, !answer);
  }

  /** Applique une action (déjà autorisée côté joueur) et diffuse. Renvoie un message d'erreur ou null. */
  function doApply(g: Game, pid: string, action: CfAction, auto = false): string | null {
    const r = apply(g.state, pid, action, { rollDie: officialDie });
    if (!r.ok) return r.error ?? 'Action impossible.';
    g.track.action(g.state, pid, action);
    g.track.events(r.events);
    const seat = seatOf(g, pid);
    // Réserve : le temps pris au-delà des 30 s de la décision (pas pour les fenêtres, à durée fixe).
    const since = g.since.get(pid);
    if (seat && since !== undefined && !auto) seat.reserveMs = Math.max(0, seat.reserveMs - Math.max(0, now() - since - DECISION));
    g.since.delete(pid);
    const t = g.timers.get(pid);
    if (t) { clearTimeout(t); g.timers.delete(pid); }
    g.state = r.state;
    progressMissions(g, r.events);
    if (g.state.phase === 'over') finishGame(g, g.state.ranking, null);
    else schedule(g);
    publish(g, r.events);
    return null;
  }

  function progressMissions(g: Game, events: CfEvent[]) {
    for (const [pid, counts] of cfMissionCounts(events, g.dm)) {
      const seat = seatOf(g, pid);
      if (!seat) continue;
      for (const [k, n] of Object.entries(counts)) cards.progressCfMission(seat.userId, k as CfMissionKind, n);
    }
  }

  /** Fin de partie : classement, gains (enregistrés par cards.recordCfGame), minuteurs arrêtés. */
  function finishGame(g: Game, standings: string[], abandonSeat: string | null) {
    if (g.ended) return;
    g.ended = true;
    g.endedAt = now();
    g.standings = standings;
    g.abandon = abandonSeat;
    clearTimers(g);
    for (const s of g.seats) if (s.awayTimer) { clearTimeout(s.awayTimer); s.awayTimer = null; }
    const user = (id: string) => seatOf(g, id)!.userId;
    const quit = (id: string) => id === abandonSeat || !!seatOf(g, id)?.left;
    let rewards: CfGameReward[] = [];
    if (standings.length === 2) {
      rewards = cards.recordCfGame({ winnerId: user(standings[0]), loserId: user(standings[1]), ranked: g.ranked, vsBot: false, abandoned: quit(standings[1]) });
    } else if (standings.length > 2) {
      rewards = cards.recordCfGame({ winnerId: user(standings[0]), loserId: user(standings[1]), ranked: false, vsBot: false, abandoned: quit(standings[1]) });
      for (const id of standings.slice(2))
        rewards.push(...cards.recordCfGame({ winnerId: user(standings[0]), loserId: user(id), ranked: false, vsBot: false, abandoned: quit(id), onlyLoser: true }));
    }
    for (const r of rewards) g.rewards.set(r.userId, r);
    recordStats(g, standings, abandonSeat);
    const end: CfGameEnd = { id: g.id, mode: g.mode, winner: user(standings[0]), losers: standings.slice(1).map(user), abandon: abandonSeat ? user(abandonSeat) : null };
    for (const cb of endSubs) { try { cb(end); } catch (e) { console.warn('[cf] fin de partie', e); } }
    // Les parties finies restent un moment (dernier écran, reprise), puis sont effacées.
    setTimeout(() => { if (games.get(g.id) === g) games.delete(g.id); }, 10 * 60_000).unref?.();
  }

  /** Statistiques des cartes (une partie abandonnée pendant la première manche n'est pas notée). */
  function recordStats(g: Game, standings: string[], abandonSeat: string | null) {
    if (!c.stats || !standings.length || (abandonSeat && g.state.round <= 1)) return;
    const first = g.track.firstLeader;
    c.stats.recordGame({
      mode: g.mode, players: g.seats.length, rounds: g.state.round, durationMs: now() - g.startedAt,
      firstLeaderWon: g.seats.length === 2 && first ? standings[0] === first : null,
      humans: g.seats.map((s) => ({ userId: s.userId, won: standings[0] === s.id, deck: deckCounts(g.decks.get(s.id) ?? []), plays: g.track.playsOf(s.id), firstLeader: s.id === first })),
    });
  }
  const endSubs = new Set<(e: CfGameEnd) => void>();

  function abandon(g: Game, seat: Seat, why: string) {
    if (g.ended) return;
    if (g.seats.length === 2) {
      const other = g.seats.find((s) => s.id !== seat.id)!;
      seat.left = true;
      notice(g, why);
      finishGame(g, [other.id, seat.id], seat.id);
      publish(g, []);
      return;
    }
    seat.left = true;
    notice(g, `${why} Le serveur jouera à sa place.`);
    schedule(g);
    publish(g, []);
  }

  function attachSeat(socket: Socket, g: Game, seat: Seat) {
    const prev = sock(seat.socketId);
    if (prev && prev.id !== socket.id) { prev.leave(`cfg:${g.id}`); prev.emit('cf:replaced', { text: 'La partie a été reprise sur un autre appareil.' }); }
    seat.socketId = socket.id;
    if (seat.awayTimer) { clearTimeout(seat.awayTimer); seat.awayTimer = null; }
    const back = seat.awayAt != null;
    seat.awayAt = null;
    socket.join(`cfg:${g.id}`);
    socket.data.cfGame = g.id;
    if (back && !g.ended) notice(g, `${seat.name} est de retour.`);
  }

  function createGame(mode: CfGameMode, players: { userId: string; deck: string[]; socketId: string | null }[], config: Partial<CfConfig> = {}): Game {
    const id = newCode();
    const seats: Seat[] = players.map((p, i) => {
      const u = store.userById(p.userId)!;
      const label = mode === 'classee' ? cfDivisionOf(cards.league(p.userId).me.points).name : undefined;
      return { id: `j${i + 1}-${randomUUID().slice(0, 6)}`, userId: p.userId, name: u.username, account: u.username, photo: photoOf(u), label, socketId: null, awayAt: null, awayTimer: null, left: false, reserveMs: RESERVE };
    });
    // Ordre des sièges au hasard (le moteur tire ensuite le meneur).
    for (let i = seats.length - 1; i > 0; i--) { const j = randomInt(i + 1); [seats[i], seats[j]] = [seats[j], seats[i]]; }
    const deckOf = new Map(players.map((p) => [p.userId, p.deck]));
    const state = newGame({ ...config, windows: true, commandes: true }, seats.map((s) => ({ id: s.id, name: s.name, deck: deckOf.get(s.userId)! })), randomInt(1, 2 ** 31));
    const g: Game = {
      id, mode, ranked: mode === 'classee', seats, state, startedAt: now(), spectators: new Map(), since: new Map(), timers: new Map(),
      window: null, autoTimer: null, ended: false, endedAt: 0, standings: [], abandon: null, rewards: new Map(), dm: new Set(),
      decks: new Map(seats.map((s) => [s.id, deckOf.get(s.userId)!])), track: new CfPlayTracker(),
    };
    games.set(id, g);
    for (const p of players) {
      // Plus de file, de table ni de défi en attente pour les joueurs de cette partie.
      leaveQueue(p.userId);
      const t = tableOf(p.userId);
      if (t && t.members.length && !players.every((x) => t.members.some((m) => m.userId === x.userId))) removeFromTable(t, p.userId);
      for (const ch of [...challenges.values()]) if (ch.fromId === p.userId || ch.toId === p.userId) closeChallenge(ch, 'L’un des joueurs a commencé une autre partie.');
      const seat = g.seats.find((s) => s.userId === p.userId)!;
      const so = sock(p.socketId);
      if (so) attachSeat(so, g, seat);
      else {
        seat.awayAt = now();
        seat.awayTimer = setTimeout(() => awayExpired(g, seat), AWAY);
      }
    }
    schedule(g);
    publish(g, []);
    return g;
  }

  function awayExpired(g: Game, seat: Seat) {
    seat.awayTimer = null;
    if (g.ended || seat.awayAt == null) return;
    abandon(g, seat, `${seat.name} n’est pas revenu à temps.`);
  }

  // --- File classée ------------------------------------------------------------------------------
  function leaveQueue(userId: string) {
    const e = queue.get(userId);
    if (!e) return;
    queue.delete(userId);
    toUser(userId, 'cf:queue', { waiting: false, since: null, offer: false } satisfies CfQueueMsg);
  }
  const gapOf = (e: QueueEntry, t: number) => 100 + Math.floor((t - e.since) / 1000) * 10;
  function matchTick() {
    const t = now();
    const list = [...queue.values()].sort((a, b) => a.since - b.since);
    const used = new Set<string>();
    for (const a of list) {
      if (used.has(a.userId)) continue;
      let best: QueueEntry | null = null;
      for (const b of list) {
        if (b === a || used.has(b.userId) || store.isBlocked(a.userId, b.userId)) continue;
        const d = Math.abs(a.points - b.points);
        if (d > Math.max(gapOf(a, t), gapOf(b, t))) continue;
        if (!best || d < Math.abs(a.points - best.points)) best = b;
      }
      if (best) {
        used.add(a.userId); used.add(best.userId);
        const da = deckFor(a.userId, a.deckId), db = deckFor(best.userId, best.deckId);
        if ('error' in da) { leaveQueue(a.userId); continue; }
        if ('error' in db) { leaveQueue(best.userId); continue; }
        queue.delete(a.userId); queue.delete(best.userId);
        createGame('classee', [{ userId: a.userId, deck: da.cards, socketId: a.socketId }, { userId: best.userId, deck: db.cards, socketId: best.socketId }]);
        continue;
      }
      if (!a.offered && t - a.since >= BOT_OFFER) {
        a.offered = true;
        sock(a.socketId)?.emit('cf:queue', { waiting: true, since: a.since, offer: true, text: 'Aucun adversaire pour l’instant. Voulez-vous jouer une partie non classée contre l’ordinateur en attendant ?' } satisfies CfQueueMsg);
      }
    }
  }
  const matchTimer = setInterval(matchTick, o.matchTickMs ?? 1000);
  matchTimer.unref?.();

  // --- Tables privées à code -------------------------------------------------------------------------
  const tableMsg = (t: Table): CfTableMsg => ({
    code: t.code, host: t.members.find((m) => m.userId === t.hostId)?.account ?? '', max: MAX_TABLE,
    players: t.members.map((m) => {
      // Deck choisi : revérifié à chaque envoi (une carte recyclée peut le rendre injouable).
      const d = deckFor(m.userId, m.deckId);
      return {
        account: m.account, name: m.name, ...(m.photo ? { photo: m.photo } : {}), host: m.userId === t.hostId,
        deck: m.deckId ? deckName(m.userId, m.deckId) : null, deckId: m.deckId, ready: !('error' in d), ...('error' in d ? { why: d.error } : {}),
      };
    }),
  });
  const deckName = (userId: string, deckId: string) => store.cfDecks(userId).find((d) => d.id === deckId)?.name ?? null;
  const broadcastTable = (t: Table) => ns.to(`cft:${t.code}`).emit('cf:table', tableMsg(t));
  function removeFromTable(t: Table, userId: string) {
    const m = t.members.find((x) => x.userId === userId);
    if (!m) return;
    t.members = t.members.filter((x) => x.userId !== userId);
    const so = sock(m.socketId);
    if (so) { so.leave(`cft:${t.code}`); so.data.cfTable = null; }
    if (!t.members.length) { tables.delete(t.code); return; }
    if (t.hostId === userId) t.hostId = t.members[0].userId;
    broadcastTable(t);
  }

  // --- Défis entre amis ----------------------------------------------------------------------------
  const challengeMsg = (ch: Challenge): CfChallengeMsg => {
    const u = store.userById(ch.fromId);
    return { id: ch.id, from: u?.username ?? '?', ...(u && photoOf(u) ? { photo: photoOf(u) } : {}), at: ch.at };
  };
  function closeChallenge(ch: Challenge, reason: string) {
    clearTimeout(ch.timer);
    challenges.delete(ch.id);
    toUser(ch.fromId, 'cf:challenge:closed', { id: ch.id, reason });
    toUser(ch.toId, 'cf:challenge:closed', { id: ch.id, reason });
  }
  const challengesFor = (userId: string) => [...challenges.values()].filter((ch) => ch.toId === userId).map(challengeMsg);

  // --- Socket.IO -----------------------------------------------------------------------------------
  ns.use((socket, next) => {
    const u = c.userFromToken(socket.handshake.auth?.token);
    if (!u) return next(new Error('Coups Fourrés en ligne demande un compte (gratuit).'));
    const b = c.banOf(u.id);
    if (b) return next(new Error('Votre compte est suspendu.'));
    socket.data.userId = u.id;
    next();
  });

  ns.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    for (const cb of socketSubs) cb(socket, userId);
    const me = () => store.userById(userId);
    const set = userSockets.get(userId) ?? new Set<string>();
    set.add(socket.id);
    userSockets.set(userId, set);
    let bucket = 25;
    const refill = setInterval(() => (bucket = 25), 1000);
    socket.use((_pkt, next) => {
      if (bucket-- <= 0) return next(new Error('Trop de requêtes'));
      if (c.banOf(userId)) { socket.emit('account:banned', { text: 'Votre compte est suspendu.' }); return next(new Error('Compte suspendu')); }
      next();
    });
    const ack = (a: unknown) => (typeof a === 'function' ? (a as (x: object) => void) : () => {});
    const fail = (a: unknown, error: string) => ack(a)({ ok: false, error });
    const busy = (): string | null => {
      if (liveGameOf(userId)) return 'Vous avez déjà une partie en cours : reprenez-la ou abandonnez-la.';
      return busyCheck(userId);
    };

    // Ce que le serveur sait déjà (reprise après rechargement de la page).
    {
      const g = liveGameOf(userId) ?? rejoinableOf(userId);
      const hello: CfHelloMsg = { game: g ? { id: g.id, mode: g.mode, ranked: g.ranked } : null, table: tableOf(userId)?.code ?? null, queue: queue.has(userId), challenges: challengesFor(userId) };
      socket.emit('cf:hello', hello);
    }

    socket.on('cf:presence', (p: { in?: boolean } | undefined, a: unknown) => {
      if (p?.in === false) menu.delete(userId);
      else menu.set(userId, now());
      ack(a)({ ok: true });
    });

    // File classée.
    socket.on('cf:queue:join', (p: { deckId?: unknown } | undefined, a: unknown) => {
      const b = busy(); if (b) return fail(a, b);
      const deckId = cleanDeckId(p?.deckId);
      const d = deckFor(userId, deckId); if ('error' in d) return fail(a, d.error);
      const t = tableOf(userId); if (t) removeFromTable(t, userId);
      const e: QueueEntry = { userId, points: cards.league(userId).me.points, deckId: d.deckId, since: queue.get(userId)?.since ?? now(), socketId: socket.id, offered: false };
      queue.set(userId, e);
      menu.set(userId, now());
      ack(a)({ ok: true, since: e.since });
      socket.emit('cf:queue', { waiting: true, since: e.since, offer: false } satisfies CfQueueMsg);
      matchTick();
    });
    socket.on('cf:queue:leave', (_p: unknown, a: unknown) => { leaveQueue(userId); ack(a)({ ok: true }); });

    // Défier un ami.
    socket.on('cf:challenge', (p: { username?: unknown; deckId?: unknown } | undefined, a: unknown) => {
      const b = busy(); if (b) return fail(a, b);
      const to = typeof p?.username === 'string' ? store.userByName(p.username.trim()) : undefined;
      if (!to || to.id === userId || !friends(userId, to.id)) return fail(a, 'Vous ne pouvez défier que vos amis.');
      if (store.isBlocked(userId, to.id)) return fail(a, 'Impossible de défier ce joueur.');
      if (liveGameOf(to.id)) return fail(a, `${to.username} est déjà en partie.`);
      const deckId = cleanDeckId(p?.deckId);
      const d = deckFor(userId, deckId); if ('error' in d) return fail(a, d.error);
      for (const ch of [...challenges.values()]) if (ch.fromId === userId && ch.toId === to.id) closeChallenge(ch, 'Défi remplacé.');
      const id = randomUUID();
      const ch: Challenge = { id, fromId: userId, toId: to.id, fromDeck: d.deckId, at: now(), timer: setTimeout(() => { if (challenges.has(id)) closeChallenge(ch, 'Le défi a expiré.'); }, CHALLENGE) };
      challenges.set(id, ch);
      toUser(to.id, 'cf:challenge:incoming', challengeMsg(ch));
      c.push(to.id, `${me()?.username ?? 'Un ami'} vous défie à Coups Fourrés`, 'Touchez pour accepter le duel.', `/?cf-defi=${id}`);
      ack(a)({ ok: true, id });
    });
    socket.on('cf:challenge:cancel', (p: { id?: unknown } | undefined, a: unknown) => {
      const ch = challenges.get(String(p?.id ?? ''));
      if (ch && ch.fromId === userId) closeChallenge(ch, `${me()?.username ?? 'Votre ami'} a annulé le défi.`);
      ack(a)({ ok: true });
    });
    socket.on('cf:challenge:answer', (p: { id?: unknown; accept?: unknown; deckId?: unknown } | undefined, a: unknown) => {
      const ch = challenges.get(String(p?.id ?? ''));
      if (!ch || ch.toId !== userId) return fail(a, 'Ce défi n’existe plus.');
      if (p?.accept !== true) { closeChallenge(ch, `${me()?.username ?? 'Votre ami'} a refusé le défi.`); return ack(a)({ ok: true }); }
      const b = busy(); if (b) return fail(a, b);
      if (liveGameOf(ch.fromId)) { closeChallenge(ch, 'Votre ami a déjà commencé une autre partie.'); return fail(a, 'Votre ami a déjà commencé une autre partie.'); }
      const fromSock = [...(userSockets.get(ch.fromId) ?? [])][0];
      if (!fromSock) return fail(a, 'Votre ami n’est plus dans Coups Fourrés.');
      const mine = deckFor(userId, cleanDeckId(p?.deckId)); if ('error' in mine) return fail(a, mine.error);
      const theirs = deckFor(ch.fromId, ch.fromDeck);
      if ('error' in theirs) { closeChallenge(ch, 'Le deck de votre ami n’est plus jouable.'); return fail(a, 'Le deck de votre ami n’est plus jouable.'); }
      clearTimeout(ch.timer);
      challenges.delete(ch.id);
      ack(a)({ ok: true });
      const g = createGame('ami', [{ userId: ch.fromId, deck: theirs.cards, socketId: fromSock }, { userId, deck: mine.cards, socketId: socket.id }]);
      toUser(ch.fromId, 'cf:challenge:closed', { id: ch.id, reason: 'accepte', game: g.id });
    });

    // Tables privées à code.
    const myTable = () => tableOf(userId);
    const joinTable = (t: Table, deckId: string | null) => {
      const u = me()!;
      const m: TableMember = { userId, name: u.username, account: u.username, photo: photoOf(u), deckId, socketId: socket.id };
      const old = t.members.find((x) => x.userId === userId);
      if (old) { old.socketId = socket.id; if (deckId) old.deckId = deckId; } else t.members.push(m);
      socket.join(`cft:${t.code}`);
      socket.data.cfTable = t.code;
      broadcastTable(t);
    };
    socket.on('cf:table:create', (p: { deckId?: unknown } | undefined, a: unknown) => {
      const b = busy(); if (b) return fail(a, b);
      const d = deckFor(userId, cleanDeckId(p?.deckId)); if ('error' in d) return fail(a, d.error);
      leaveQueue(userId);
      const old = myTable(); if (old) removeFromTable(old, userId);
      const t: Table = { code: newCode(), hostId: userId, members: [], kicked: new Set(), createdAt: now() };
      tables.set(t.code, t);
      joinTable(t, d.deckId);
      ack(a)({ ok: true, code: t.code });
    });
    socket.on('cf:table:join', (p: { code?: unknown; deckId?: unknown } | undefined, a: unknown) => {
      const code = cleanCode(p?.code);
      const t = code ? tables.get(code) : undefined;
      if (!t) {
        if (code && games.has(code) && !games.get(code)!.ended) return ack(a)({ ok: false, error: 'La partie a déjà commencé : vous pouvez la regarder.', playing: true });
        return fail(a, 'Aucune table avec ce code. Vérifiez-le.');
      }
      const already = t.members.some((m) => m.userId === userId);
      if (!already) {
        const b = busy(); if (b) return fail(a, b);
        if (t.kicked.has(userId)) return fail(a, 'L’hôte vous a retiré de cette table.');
        if (t.members.some((m) => store.isBlocked(m.userId, userId))) return fail(a, 'Impossible de rejoindre cette table.');
        if (t.members.length >= MAX_TABLE) return fail(a, `La table est complète (${MAX_TABLE} joueurs).`);
      }
      const d = deckFor(userId, cleanDeckId(p?.deckId)); if ('error' in d) return fail(a, d.error);
      leaveQueue(userId);
      const old = myTable(); if (old && old !== t) removeFromTable(old, userId);
      joinTable(t, d.deckId);
      ack(a)({ ok: true, code: t.code });
    });
    socket.on('cf:table:deck', (p: { deckId?: unknown } | undefined, a: unknown) => {
      const t = myTable(); if (!t) return fail(a, 'Aucune table.');
      const d = deckFor(userId, cleanDeckId(p?.deckId)); if ('error' in d) return fail(a, d.error);
      t.members.find((m) => m.userId === userId)!.deckId = d.deckId;
      broadcastTable(t);
      ack(a)({ ok: true });
    });
    socket.on('cf:table:kick', (p: { account?: unknown } | undefined, a: unknown) => {
      const t = myTable(); if (!t) return fail(a, 'Aucune table.');
      if (t.hostId !== userId) return fail(a, 'Seul l’hôte peut retirer un joueur.');
      const m = t.members.find((x) => x.account === String(p?.account ?? ''));
      if (!m || m.userId === userId) return fail(a, 'Joueur introuvable.');
      t.kicked.add(m.userId);
      const so = sock(m.socketId);
      removeFromTable(t, m.userId);
      so?.emit('cf:table:kicked', { text: 'L’hôte vous a retiré de la table.' });
      ack(a)({ ok: true });
    });
    socket.on('cf:table:leave', (_p: unknown, a: unknown) => { const t = myTable(); if (t) removeFromTable(t, userId); ack(a)({ ok: true }); });
    socket.on('cf:table:start', (_p: unknown, a: unknown) => {
      const t = myTable(); if (!t) return fail(a, 'Aucune table.');
      if (t.hostId !== userId) return fail(a, 'Seul l’hôte lance la partie.');
      if (t.members.length < 2) return fail(a, 'Il faut au moins 2 joueurs.');
      const players: { userId: string; deck: string[]; socketId: string | null }[] = [];
      for (const m of t.members) {
        // Chacun joue SON deck choisi au salon : revérifié ici (possédé, jouable selon les règles de construction).
        const d = deckFor(m.userId, m.deckId);
        if ('error' in d) { broadcastTable(t); return fail(a, `${m.name} n’est pas prêt : ${d.error}`); }
        if (liveGameOf(m.userId)) return fail(a, `${m.name} est déjà en partie.`);
        players.push({ userId: m.userId, deck: d.cards, socketId: m.socketId });
      }
      ack(a)({ ok: true });
      tables.delete(t.code);
      for (const m of t.members) { const so = sock(m.socketId); if (so) { so.leave(`cft:${t.code}`); so.data.cfTable = null; } }
      createGame('table', players);
    });

    // Partie.
    const myGame = (id?: unknown) => {
      const g = typeof id === 'string' ? games.get(id) : liveGameOf(userId) ?? rejoinableOf(userId);
      const seat = g?.seats.find((s) => s.userId === userId);
      return g && seat ? { g, seat } : null;
    };
    socket.on('cf:resume', (p: { id?: unknown } | undefined, a: unknown) => {
      const x = myGame(p?.id ?? undefined) ?? myGame();
      if (!x || x.g.ended) return fail(a, 'Aucune partie à reprendre.');
      if (x.seat.left) {
        // 0.43 : retour à une table à 3 ou 4 quittée en cours de partie.
        if (x.g.seats.length <= 2) return fail(a, 'Vous avez quitté cette partie.');
        x.seat.left = false;
        notice(x.g, `${x.seat.name} revient à la table.`);
        attachSeat(socket, x.g, x.seat);
        schedule(x.g);
        ack(a)({ ok: true, id: x.g.id });
        publish(x.g, []);
        return;
      }
      attachSeat(socket, x.g, x.seat);
      ack(a)({ ok: true, id: x.g.id });
      publish(x.g, []);
    });
    socket.on('cf:act', (p: { id?: unknown; action?: unknown } | undefined, a: unknown) => {
      const x = myGame(p?.id);
      if (!x) return fail(a, 'Aucune partie en cours.');
      if (x.g.ended) return fail(a, 'La partie est terminée.');
      const { g, seat } = x;
      if (seat.left) return fail(a, 'Vous avez quitté cette partie.');
      if (seat.socketId !== socket.id) attachSeat(socket, g, seat);
      const action = p?.action as CfAction;
      if (!action || typeof action !== 'object') return fail(a, 'Action invalide.');
      if (g.window && g.window.player === seat.id) {
        // Fenêtre de réponse : jouer une carte part tout de suite ; passer attend la fin de la fenêtre.
        if (g.window.buffered) return fail(a, 'Vous avez déjà répondu.');
        const legal = legalActions(g.state, seat.id);
        if (action.type === 'pass') {
          // « Laisser faire » : la partie reprend tout de suite.
          ack(a)({ ok: true });
          clearTimeout(g.window.timer);
          closeWindow(g, g.window.key, { type: 'pass' });
          return;
        }
        if (!legal.length) return fail(a, 'Action impossible maintenant.');
      }
      const err = doApply(g, seat.id, action);
      if (err) return fail(a, err);
      ack(a)({ ok: true });
    });
    socket.on('cf:leave', (p: { id?: unknown } | undefined, a: unknown) => {
      const x = myGame(p?.id);
      if (x && !x.g.ended && !x.seat.left) abandon(x.g, x.seat, `${x.seat.name} abandonne la partie.`);
      if (x) { socket.leave(`cfg:${x.g.id}`); if (x.seat.socketId === socket.id) x.seat.socketId = null; }
      ack(a)({ ok: true });
    });

    // Spectateurs : vue publique, sans rien de caché.
    const unwatch = () => {
      const id = socket.data.cfWatch as string | undefined;
      if (!id) return;
      socket.data.cfWatch = null;
      socket.leave(`cfw:${id}`);
      socket.leave(`cfg:${id}`);
      games.get(id)?.spectators.delete(socket.id);
    };
    socket.on('cf:watch', (p: { code?: unknown } | undefined, a: unknown) => {
      const code = cleanCode(p?.code);
      const g = code ? games.get(code) : undefined;
      if (!g || g.ended) return fail(a, 'Partie introuvable. Elle est peut-être déjà terminée.');
      if (g.seats.some((s) => s.userId === userId && !s.left)) return fail(a, 'Vous êtes joueur dans cette partie.');
      if (g.seats.some((s) => store.isBlocked(s.userId, userId))) return fail(a, 'Impossible de regarder cette partie.');
      if (!g.ranked && g.mode !== 'tournoi' && !g.seats.some((s) => friends(s.userId, userId))) return fail(a, 'Seuls les amis des joueurs peuvent regarder cette partie.');
      if (g.spectators.size >= MAX_SPECTATORS && !g.spectators.has(socket.id)) return fail(a, `Trop de spectateurs (${MAX_SPECTATORS} au plus).`);
      unwatch();
      g.spectators.set(socket.id, { userId, name: me()?.username ?? 'Spectateur' });
      socket.data.cfWatch = g.id;
      socket.join(`cfw:${g.id}`);
      socket.join(`cfg:${g.id}`);
      ack(a)({ ok: true, id: g.id });
      socket.emit('cf:state', message(g, null, []));
    });
    socket.on('cf:unwatch', (_p: unknown, a: unknown) => { unwatch(); ack(a)({ ok: true }); });

    // Tchat de table (salon à code, partie ou spectateur) et réactions.
    let lastChat = 0, lastEmote = 0;
    const chatPlace = (): { room: string; where: string; audience: string[]; playerId: string; spectator: boolean } | null => {
      const x = myGame();
      if (x && !x.seat.left) {
        return { room: `cfg:${x.g.id}`, where: `Coups Fourrés, partie ${x.g.id}`, playerId: x.seat.id, spectator: false,
          audience: [...x.g.seats.map((s) => s.userId), ...[...x.g.spectators.values()].map((s) => s.userId)] };
      }
      const w = socket.data.cfWatch ? games.get(socket.data.cfWatch as string) : undefined;
      if (w) return { room: `cfg:${w.id}`, where: `Coups Fourrés, partie ${w.id}`, playerId: `spectateur:${socket.id}`, spectator: true,
        audience: [...w.seats.map((s) => s.userId), ...[...w.spectators.values()].map((s) => s.userId)] };
      const t = myTable();
      if (t) return { room: `cft:${t.code}`, where: `Coups Fourrés, table ${t.code}`, playerId: me()?.username ?? '', spectator: false, audience: t.members.map((m) => m.userId) };
      return null;
    };
    socket.on('cf:chat', (p: { text?: unknown } | undefined, a: unknown) => {
      const place = chatPlace();
      if (!place) return fail(a, 'Aucune table.');
      const text = String(p?.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+/gi, '[lien]').trim().slice(0, 200);
      if (!text) return fail(a, 'Message vide.');
      const mute = c.muteOf(userId);
      if (mute) return fail(a, muteText(mute));
      const t = now();
      if (t - lastChat < 1000) return fail(a, 'Doucement !');
      lastChat = t;
      const id = `cf${++chatSeq}-${randomInt(1e6)}`;
      const name = me()?.username ?? '?';
      c.recordChat({ id, code: place.room, where: place.where, userId, name, text, at: t, audience: place.audience });
      ack(a)({ ok: true });
      ns.to(place.room).emit('cf:chat', { id, playerId: place.playerId, name, account: name, text, at: t, ...(place.spectator ? { spectator: true } : {}) });
    });
    socket.on('cf:emote', (p: { emote?: unknown } | undefined, a: unknown) => {
      const x = myGame();
      if (!x || x.seat.left) return fail(a, 'Aucune partie.');
      if (!isReaction(p?.emote)) return fail(a, 'Réaction inconnue.');
      const t = now();
      if (t - lastEmote < 1200) return fail(a, 'Doucement !');
      lastEmote = t;
      ack(a)({ ok: true });
      ns.to(`cfg:${x.g.id}`).emit('cf:emote', { playerId: x.seat.id, emote: p!.emote });
    });

    socket.on('disconnect', () => {
      clearInterval(refill);
      set.delete(socket.id);
      if (!set.size) { userSockets.delete(userId); menu.delete(userId); }
      unwatch();
      const q = queue.get(userId);
      if (q && q.socketId === socket.id) leaveQueue(userId);
      const t = myTable();
      const m = t?.members.find((x) => x.userId === userId);
      if (t && m && m.socketId === socket.id) removeFromTable(t, userId);
      for (const ch of [...challenges.values()]) if (ch.fromId === userId && !userSockets.has(userId)) closeChallenge(ch, 'Votre ami a quitté Coups Fourrés.');
      // Partie : 60 s pour revenir (reprise après rechargement), sinon abandon.
      for (const g of games.values()) {
        const seat = g.seats.find((s) => s.socketId === socket.id);
        if (!seat) continue;
        seat.socketId = null;
        if (g.ended || seat.left) continue;
        seat.awayAt = now();
        notice(g, `${seat.name} s’est déconnecté : ${Math.round(AWAY / 1000)} s pour revenir.`);
        seat.awayTimer = setTimeout(() => awayExpired(g, seat), AWAY);
        publish(g, []);
      }
    });
  });

  // --- Routes HTTP -----------------------------------------------------------------------------------
  const router = express.Router();
  const userOfReq = (req: Request) => {
    const h = req.headers.authorization ?? '';
    return c.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  };
  const failRes = (res: Response, status: number, error: string) => { res.status(status).json({ ok: false, error }); };
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const u = userOfReq(req);
    if (!u) return failRes(res, 401, 'Session expirée : reconnectez-vous.');
    (req as Request & { cfUser: UserRow }).cfUser = u;
    next();
  };
  const user = (req: Request) => (req as Request & { cfUser: UserRow }).cfUser;
  router.use('/cf', (_req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });
  router.use('/cf/bot', express.json({ limit: '512kb' }));
  router.use('/cf/presence', express.json({ limit: '1kb' }));

  router.post('/cf/bot/start', auth, (req, res) => {
    const u = user(req);
    const level = LEVELS.includes(req.body?.level) ? (req.body.level as CfLevel) : null;
    if (!level) return failRes(res, 400, `Niveau inconnu (${LEVELS.map((l) => CF_LEVEL_LABEL[l]).join(', ')}).`);
    const d = deckFor(u.id, cleanDeckId(req.body?.deckId), true);
    if ('error' in d) return failRes(res, 400, d.error);
    const t = now();
    for (const [id, b] of bots) if (t - b.startedAt > BOT_TTL) bots.delete(id);
    const mine = [...bots].filter(([, b]) => b.userId === u.id).sort((x, y) => x[1].startedAt - y[1].startedAt);
    while (mine.length >= 5) bots.delete(mine.shift()![0]);
    // 1 à 3 ordinateurs (0.39 : parties à 3 ou 4 contre l'ordinateur), noms tous différents.
    const n = Math.min(3, Math.max(1, Math.floor(Number(req.body?.opponents) || 1)));
    const names = [...CF_BOT_NAMES];
    const botSeats = Array.from({ length: n }, (_, i) => {
      const name = names.splice(randomInt(names.length), 1)[0];
      return { id: i ? `ordi${i + 1}` : 'ordi', name, deck: parcoursStepOf(d.deckId) ? [...d.cards] : deckList(cfBotDeck().cards), level };
    });
    const setup: BotMatchSetup = { seed: randomInt(1, 2 ** 31), me: { id: 'joueur', name: u.username, deck: d.cards }, bots: botSeats };
    const gameId = randomUUID();
    bots.set(gameId, { userId: u.id, setup, startedAt: t });
    menu.set(u.id, t);
    res.json({ ok: true, gameId, ...setup });
  });
  router.post('/cf/bot/end', auth, (req, res) => {
    const u = user(req);
    const id = String(req.body?.gameId ?? '');
    const b = bots.get(id);
    if (!b || b.userId !== u.id) return failRes(res, 404, 'Partie inconnue ou déjà terminée.');
    const actions = req.body?.actions;
    if (!Array.isArray(actions) || actions.length > 5000) return failRes(res, 400, 'Partie invalide.');
    const t = now();
    if (t - b.startedAt > BOT_TTL) { bots.delete(id); return failRes(res, 410, 'Partie trop ancienne.'); }
    const need = MIN_BOT > 0 ? Math.max(MIN_BOT, actions.length * 250) : 0;
    if (t - b.startedAt < need) { bots.delete(id); return failRes(res, 400, 'Partie trop rapide pour être récompensée.'); }
    bots.delete(id); // un seul « end » par partie, même en cas de refus
    const events: CfEvent[] = [];
    const track = new CfPlayTracker();
    const r = replayBotMatch(b.setup, actions as CfAction[], (ev) => { events.push(...ev); track.events(ev); }, (before, a) => track.action(before, b.setup.me.id, a));
    if (!r.ok) return failRes(res, 400, 'Partie invalide : le serveur ne retrouve pas ce résultat.');
    if (r.state.phase !== 'over') return failRes(res, 400, 'La partie n’est pas terminée.');
    const won = r.state.winner === b.setup.me.id;
    const counts = cfMissionCounts(events, new Set()).get(b.setup.me.id) ?? {};
    const missionsDone: string[] = [];
    for (const [k, n] of Object.entries(counts)) missionsDone.push(...cards.progressCfMission(u.id, k as CfMissionKind, n).map((m) => m.id));
    const reward = cards.recordCfGame({ winnerId: won ? u.id : null, loserId: won ? null : u.id, ranked: false, vsBot: true })[0] ?? null;
    c.stats?.recordGame({
      mode: 'bot', level: b.setup.bots[0]?.level ?? null, players: 1 + b.setup.bots.length, rounds: r.state.round, durationMs: t - b.startedAt,
      firstLeaderWon: b.setup.bots.length === 1 && track.firstLeader ? r.state.winner === track.firstLeader : null,
      humans: [{ userId: u.id, won, deck: deckCounts(b.setup.me.deck), plays: track.playsOf(b.setup.me.id), firstLeader: track.firstLeader === b.setup.me.id }],
    });
    if (reward) reward.missions = [...missionsDone, ...reward.missions];
    res.json({ ok: true, won, reward, state: cards.state(u.id) });
  });
  router.post('/cf/bot/abandon', auth, (req, res) => {
    const b = bots.get(String(req.body?.gameId ?? ''));
    if (b && b.userId === user(req).id) bots.delete(String(req.body.gameId));
    res.json({ ok: true });
  });
  router.get('/cf/friends', auth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, friends: friendsInMode(user(req).id) });
  });
  router.post('/cf/presence', auth, (req, res) => {
    const u = user(req);
    if (req.body?.in === false) menu.delete(u.id); else menu.set(u.id, now());
    res.json({ ok: true });
  });
  router.get('/cf/challenges', auth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, challenges: challengesFor(user(req).id) });
  });

  // Ménage : tables vides, parties finies.
  const sweeper = setInterval(() => {
    const t = now();
    for (const tb of tables.values()) if (tb.members.every((m) => !sock(m.socketId)) && t - tb.createdAt > 10 * 60_000) tables.delete(tb.code);
    for (const [id, g] of games) if (g.ended && t - g.endedAt > 10 * 60_000) games.delete(id);
    for (const [id, m] of menu) if (t - m > PRESENCE) menu.delete(id);
  }, 60_000);
  sweeper.unref?.();

  function close() {
    clearInterval(matchTimer);
    clearInterval(sweeper);
    for (const g of games.values()) { clearTimers(g); for (const s of g.seats) if (s.awayTimer) clearTimeout(s.awayTimer); }
    for (const ch of challenges.values()) clearTimeout(ch.timer);
    games.clear(); tables.clear(); challenges.clear(); queue.clear();
  }

  // --- Pour le tournoi du samedi (server/cf-tournament.ts) ---------------------------------------
  let busyCheck: (userId: string) => string | null = () => null;
  /** Compte connecté à l'espace « /cf » (dans le mode, sur au moins un appareil). */
  const isConnected = (userId: string) => (userSockets.get(userId)?.size ?? 0) > 0;
  /**
   * Partie imposée par le serveur (tournoi) : decks actifs des comptes, sièges rattachés à leurs
   * sockets s'ils sont connectés (sinon ils ont le délai habituel pour revenir, puis c'est perdu).
   */
  function createMatch(mode: CfGameMode, userIds: string[], config: Partial<CfConfig> = {}): { id: string } | { error: string; userId: string } {
    const players: { userId: string; deck: string[]; socketId: string | null }[] = [];
    for (const u of userIds) {
      const d = deckFor(u);
      if ('error' in d) return { error: d.error, userId: u };
      if (liveGameOf(u)) return { error: 'Déjà dans une autre partie.', userId: u };
      players.push({ userId: u, deck: d.cards, socketId: [...(userSockets.get(u) ?? [])][0] ?? null });
    }
    const g = createGame(mode, players, config);
    for (const u of userIds) menu.set(u, now());
    return { id: g.id };
  }
  /** Envoie un message à tous les appareils d'un compte connectés au mode. */
  const emitTo = (userId: string, ev: string, payload: unknown) => toUser(userId, ev, payload);

  return {
    router, presence, friendsInMode, games, tables, queue, bots, matchTick, close,
    createMatch, isConnected, emitTo, onEnd: (cb: (e: CfGameEnd) => void) => { endSubs.add(cb); return () => endSubs.delete(cb); },
    setBusyCheck: (f: (userId: string) => string | null) => { busyCheck = f; },
    /** Ce compte a-t-il des sockets dans « /cf » qui ont signalé une action ? (événements du socket : voir `onSocket`). */
    onSocket: (cb: (socket: Socket, userId: string) => void) => { socketSubs.add(cb); return () => socketSubs.delete(cb); },
  };
}
export type CfOnline = ReturnType<typeof createCfOnline>;
