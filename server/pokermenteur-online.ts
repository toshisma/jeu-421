/**
 * Poker menteur en ligne (2 à 6 joueurs) : tables par code ou lien (`/?poker=CODE`), partie rapide,
 * ordinateurs pour compléter, tchat et réactions, spectateurs amis. Espace Socket.IO « /poker ».
 *
 * Calqué sur Le Courtisan en ligne (server/dixmille-online.ts) : jeton de reprise, 30 s par décision
 * puis coup automatique, serveur qui joue pour un absent, retour possible, tchat modéré. Pas de mise.
 *
 * Le serveur fait foi : moteur partagé (shared/pokermenteur/engine.ts), nouvelle graine secrète tirée
 * (source cryptographique) avant chaque action, relance par POSITIONS seulement. SECRET DU GOBELET :
 * chaque destinataire reçoit sa propre vue (`viewFor`) ; les dés ne partent que vers le détenteur du
 * gobelet, jamais vers les autres joueurs ni les spectateurs, et les événements ne les montrent qu'à
 * la révélation (« Menteur ! »).
 */
import { noteOnlineGame } from './chiffres';
import type { RepInfo } from '../shared/progress/repu';
import { randomInt, randomUUID } from 'node:crypto';
import type { Namespace, Server, Socket } from 'socket.io';
import { act, cleanPmOptions, currentPlayer, newGame, placeOf, timeoutAction, viewFor, type PmAction, type PmEvent, type PmLevel, type PmOptions, type PmState } from '../shared/pokermenteur/engine';
import { decide } from '../shared/pokermenteur/ai';
import { trackPmFeats, type PmFeats } from '../shared/pokermenteur/feats';
import { isDice } from '../shared/pokermenteur/hands';
import { PM_DECISION_SECONDS, PM_TABLE_MAX, type PmPublicTable, type PmRewardMsg, type PmUpdate } from '../shared/pokermenteur/protocol';
import { AVATARS, MAX_SPECTATORS, isReaction, type Ack } from '../shared/protocol';
import { muteText } from '../shared/moderation';
import { COUNTER_BOTS } from '../shared/bot-names';
import { avoidBotName, guestLabel, tableName } from '../shared/names';
import { getItem } from '../shared/progress/catalog';
import type { Store, UserRow } from './db';
import type { TableChatEntry } from './moderation';
import type { Reward } from '../shared/progress/profile';

export interface PmOnlineOptions {
  decisionMs?: number;
  disconnectMs?: number;
  autoplayMs?: number;
  now?: () => number;
  animMs?: number;
  quickFillMs?: number;
  quickStartMs?: number;
}

/** Ce que le serveur sait d'un joueur en fin de partie. */
export interface PmEndFacts {
  won: boolean; place: number; players: number; humans: number; botLevels: PmLevel[]; minutes: number; day: string; abandoned: boolean;
  feats?: { callsRight: number; bluffsPassed: number; pokerAs: number; livesLost: number };
}

interface Ctx {
  io: Server;
  store: Store;
  userFromToken: (t: unknown) => UserRow | undefined;
  banOf: (userId: string) => unknown;
  muteOf: (userId: string) => { until: number; reason: string } | undefined;
  publicInfo: (userId: string) => { account: string; photo?: string | null; accessory?: string; dice?: string; rep?: RepInfo } | null;
  isBlocked: (a: string, b: string) => boolean;
  reward: (userId: string, o: PmEndFacts)
    => { reward: Reward; applied: { profile: unknown; levelBefore: number; levelAfter: number; bagsFound?: number; questsDone?: { id: string; text: string }[]; achievementsDone?: { id: string }[] } } | null;
  recordChat: (e: TableChatEntry) => void;
  verifiedGame?: (g: { game: 'poker'; players: { userId: string; won: boolean; abandoned: boolean }[] }) => unknown;
  adminNames: string[];
  /** Jour officiel (Bruxelles). */
  today: () => string;
  taken: (code: string) => boolean;
  opts?: PmOnlineOptions;
}

interface Member {
  id: string; token: string; name: string; avatar: string; ready: boolean; socketId: string | null; left: boolean;
  userId?: string; bot?: PmLevel; filler?: boolean; dice?: string;
  /** A quitté la partie en cours : ne touche pas la récompense, même s'il revient. */
  quit?: boolean;
}
interface Table {
  code: string; title: string; hostId: string; members: Member[]; kicked: Set<string>;
  options: PmOptions; visibility: 'private' | 'public';
  status: 'lobby' | 'playing'; game: PmState | null; version: number; players: string[];
  timer: NodeJS.Timeout | null; deadline: number | null; autoOf: string | null;
  startedAt: number; rewarded: boolean; feats: PmFeats; lastActivity: number;
  spectators: Map<string, { name: string; userId?: string }>;
  quick?: { waitSince: number; fillAt: number | null; startAt: number | null; timer: NodeJS.Timeout | null };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LEVELS: PmLevel[] = ['debutant', 'habitue', 'fouine'];
const QUICK_TARGET = 3;
export const cleanPmCode = (v: unknown) => (typeof v === 'string' && /^[A-Z0-9]{5}$/.test(v.toUpperCase()) ? v.toUpperCase() : null);
function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return n.length ? n : null;
}
const cleanAvatar = (v: unknown) => (typeof v === 'string' && AVATARS.includes(v) ? v : AVATARS[0]);
const cleanLevel = (v: unknown): PmLevel => (LEVELS.includes(v as PmLevel) ? (v as PmLevel) : 'habitue');
const cleanDice = (v: unknown) => {
  const it = typeof v === 'string' ? getItem(v) : undefined;
  return it && it.category === 'dice' && !it.rarity && !it.pass ? it.id : undefined;
};
/** Action venue d'un navigateur : forme stricte, jamais de valeur de dé pour une relance (positions seulement). */
export function cleanPmAction(v: any): PmAction | null {
  if (v?.type === 'menteur' || v?.type === 'croire') return { type: v.type };
  if (v?.type === 'relancer') {
    const p = v.pick;
    if (!Array.isArray(p) || p.length > 5 || !p.every((x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 5) || new Set(p).size !== p.length) return null;
    return { type: 'relancer', pick: [...p] };
  }
  if (v?.type === 'annoncer' && isDice(v.hand)) return { type: 'annoncer', hand: [...v.hand] };
  return null;
}
/** Temps d'animation chez les joueurs (en « unités » de animMs). */
function animUnits(events: PmEvent[]): number {
  let u = 0;
  for (const e of events) u += e.kind === 'revelation' ? 3.4 : e.kind === 'manche' ? 1 : e.kind === 'relance' ? 1.4 : e.kind === 'croit' ? 0.9 : e.kind === 'annonce' ? 0.6 : e.kind === 'elimine' ? 0.8 : 0;
  return u;
}

export function createPokerOnline(c: Ctx) {
  const o = c.opts ?? {};
  const DECISION = o.decisionMs ?? PM_DECISION_SECONDS * 1000;
  const AWAY = o.disconnectMs ?? 20_000;
  const AUTOPLAY = o.autoplayMs ?? 1_500;
  const ANIM = o.animMs ?? 1000;
  const QUICK_FILL = o.quickFillMs ?? 30_000;
  const QUICK_START = o.quickStartMs ?? 10_000;
  const ns: Namespace = c.io.of('/poker');
  const tables = new Map<string, Table>();
  let chatSeq = 0;

  const sock = (id: string | null | undefined) => (id ? ns.sockets.get(id) : undefined);
  const humanHere = (m: Member) => !m.bot && !m.left && m.socketId != null;
  const seatsTaken = (t: Table) => t.members.filter((m) => !m.filler).length;
  const friendsEither = (a: string, b: string) => c.store.isFriend(a, b) || c.store.isFriend(b, a);
  const blockedAt = (userId: string | undefined, others: Member[]) =>
    !!userId && others.some((x) => x.userId && x.userId !== userId && c.isBlocked(x.userId, userId));
  const newCode = () => {
    let code: string;
    do code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while (tables.has(code) || c.taken(code));
    return code;
  };

  // --- Diffusion ---------------------------------------------------------------------------------
  function publicTable(t: Table): PmPublicTable {
    return {
      code: t.code, title: t.title, hostId: t.hostId, status: t.status, options: t.options, visibility: t.visibility, max: PM_TABLE_MAX,
      deadline: t.deadline, spectators: t.spectators.size,
      ...(t.quick ? { quick: { fillAt: t.quick.fillAt, startAt: t.quick.startAt } } : {}),
      members: t.members.map((m) => {
        const info = m.userId ? c.publicInfo(m.userId) : null;
        return {
          id: m.id, name: m.name, avatar: m.avatar, ready: m.ready, connected: m.socketId != null || !!m.bot, left: m.left, isHost: m.id === t.hostId,
          ...(m.bot ? { bot: m.bot } : {}), ...(m.filler ? { filler: true } : {}), ...(m.quit ? { quit: true } : {}),
          ...(info ? { account: info.account, photo: info.photo ?? null, ...(info.accessory ? { accessory: info.accessory } : {}), ...(info.rep ? { rep: info.rep } : {}) } : {}),
          dice: info?.dice ?? m.dice,
        };
      }),
    };
  }
  const broadcast = (t: Table) => ns.to(t.code).emit('table:state', publicTable(t));
  const notice = (t: Table, text: string, kind: 'info' | 'warning' = 'info') => ns.to(t.code).emit('table:notice', { kind, text });
  /** Envoi personnel : chaque joueur reçoit SA vue, les spectateurs la vue publique. */
  function emitEach(t: Table, ev: string, make: (viewer: string | null) => unknown) {
    for (const m of t.members) { const s = sock(m.socketId); if (s) s.emit(ev, make(m.id)); }
    for (const id of t.spectators.keys()) sock(id)?.emit(ev, make(null));
  }
  const snapshotFor = (t: Table, viewer: string | null) => ({ version: t.version, state: viewFor(t.game!, viewer) });

  function makeTable(host: Member, title: string, options: PmOptions, visibility: 'private' | 'public'): Table {
    const t: Table = {
      code: newCode(), title, hostId: host.id, members: [host], kicked: new Set(), options, visibility, status: 'lobby', game: null, version: 0, players: [],
      timer: null, deadline: null, autoOf: null, startedAt: Date.now(), rewarded: false, feats: {}, lastActivity: Date.now(), spectators: new Map(),
    };
    tables.set(t.code, t);
    return t;
  }
  function addBot(t: Table, level: PmLevel, filler = false) {
    const taken = t.members.map((m) => m.name);
    const free = COUNTER_BOTS.filter((b) => !taken.includes(b.name));
    const b = free.length ? free[randomInt(free.length)] : { name: `Ordi ${taken.length + 1}`, avatar: '🎲' };
    t.members.push({ id: randomUUID(), token: randomUUID(), name: b.name, avatar: b.avatar, ready: true, socketId: null, left: false, bot: level, ...(filler ? { filler: true } : {}) });
  }
  function fillWithBots(t: Table, upTo: number, level: PmLevel = 'habitue') {
    let n = 0;
    while (t.members.length < Math.min(upTo, PM_TABLE_MAX)) { addBot(t, level, true); n++; }
    return n;
  }

  // --- Partie rapide ------------------------------------------------------------------------------
  function quickPlan(t: Table) {
    const q = t.quick;
    if (!q) return;
    if (q.timer) clearTimeout(q.timer);
    q.timer = null;
    if (t.status !== 'lobby' || !t.members.some(humanHere)) { q.fillAt = null; q.startAt = null; return; }
    const humans = t.members.filter((m) => !m.bot).length;
    if (humans >= QUICK_TARGET || t.members.some((m) => m.bot)) { q.fillAt = null; q.startAt ??= Date.now() + QUICK_START; }
    else { q.startAt = null; q.fillAt = q.waitSince + QUICK_FILL; }
    const at = q.startAt ?? q.fillAt!;
    q.timer = setTimeout(() => quickFire(t), Math.max(0, at - Date.now()));
  }
  function quickFire(t: Table) {
    const q = t.quick;
    if (!q || tables.get(t.code) !== t || t.status !== 'lobby') return;
    q.timer = null;
    if (!t.members.some(humanHere)) { quickPlan(t); return; }
    if (q.startAt == null) {
      const n = fillWithBots(t, QUICK_TARGET);
      if (n) notice(t, `${n > 1 ? `${n} ordinateurs complètent` : 'Un ordinateur complète'} la table. Départ dans ${Math.round(QUICK_START / 1000)} s : un joueur qui arrive d’ici là prend la place d’un ordinateur.`);
      quickPlan(t);
      broadcast(t);
      return;
    }
    if (Date.now() < q.startAt) { quickPlan(t); return; }
    t.members = t.members.filter((m) => m.bot || m.socketId != null);
    if (!t.members.some((m) => m.id === t.hostId)) t.hostId = t.members.find(humanHere)!.id;
    fillWithBots(t, 2);
    for (const m of t.members) m.ready = true;
    startGame(t);
  }

  // --- Déroulement -------------------------------------------------------------------------------
  function startGame(t: Table) {
    const players = t.members.filter((m) => !m.left);
    for (const m of t.members) m.quit = false;
    if (t.quick) { if (t.quick.timer) clearTimeout(t.quick.timer); t.quick.timer = null; t.quick.fillAt = null; t.quick.startAt = null; }
    // Ordre tiré au sort : personne n'a toujours l'avantage de commencer.
    for (let i = players.length - 1; i > 0; i--) { const j = randomInt(i + 1); [players[i], players[j]] = [players[j], players[i]]; }
    t.players = players.map((m) => m.id);
    t.game = newGame(players.map((m) => ({ id: m.id, name: m.name, ...(m.bot ? { bot: m.bot } : {}) })), t.options, randomInt(2 ** 31));
    t.status = 'playing';
    t.version = 1;
    t.autoOf = null;
    t.rewarded = false;
    t.feats = {};
    t.startedAt = (o.now ?? Date.now)();
    t.lastActivity = Date.now();
    emitEach(t, 'game:state', (v) => snapshotFor(t, v));
    schedule(t, Math.round(ANIM * 1.2));
    broadcast(t);
  }

  const memberOf = (t: Table, id: string) => t.members.find((m) => m.id === id);

  function schedule(t: Table, grace: number) {
    if (t.timer) clearTimeout(t.timer);
    t.timer = null;
    t.deadline = null;
    const g = t.game;
    if (t.status !== 'playing' || !g || g.phase === 'fini') return;
    if (!t.members.some((m) => humanHere(m) && t.players.includes(m.id))) return;
    const pid = currentPlayer(g).id;
    if (t.autoOf && t.autoOf !== pid) t.autoOf = null;
    const m = memberOf(t, pid)!;
    if (m.bot) {
      const think = AUTOPLAY * (0.5 + Math.random() * 0.6) + (g.phase === 'decision' && Math.random() < 0.3 ? AUTOPLAY * 0.5 : 0);
      t.timer = setTimeout(() => autoPlay(t, pid, 'bot'), grace + Math.round(think));
      return;
    }
    let delay: number, mode: 'temps' | 'absent';
    if (m.left) { delay = grace + AUTOPLAY; mode = 'absent'; }
    else if (m.socketId == null) { delay = grace + (t.autoOf === pid ? AUTOPLAY : AWAY); mode = 'absent'; }
    else if (t.autoOf === pid) { delay = grace + AUTOPLAY; mode = 'temps'; }
    else { delay = grace + DECISION; mode = 'temps'; }
    t.deadline = Date.now() + delay;
    t.timer = setTimeout(() => autoPlay(t, pid, mode), delay);
  }

  function autoPlay(t: Table, pid: string, mode: 'bot' | 'temps' | 'absent') {
    const g = t.game;
    if (!g || g.phase === 'fini' || currentPlayer(g).id !== pid) return;
    const m = memberOf(t, pid)!;
    if (mode !== 'bot' && t.autoOf !== pid) {
      t.autoOf = pid;
      if (mode === 'temps') notice(t, `Temps écoulé pour ${m.name} : le serveur joue à sa place.`, 'warning');
      else if (!m.left) notice(t, `${m.name} ne répond pas : le serveur joue à sa place.`, 'warning');
    }
    let a: PmAction = mode === 'bot' ? decide(g, m.bot ?? 'habitue') : timeoutAction(g);
    if (mode !== 'bot' && a.type === 'annoncer') a = { ...a, auto: true };
    apply(t, m, a, mode === 'bot' ? 'bot' : mode);
  }

  function apply(t: Table, m: Member, a: PmAction, auto?: PmUpdate['auto']): string | null {
    const g = t.game!;
    const r = act({ ...g, seed: randomInt(2 ** 31), draws: 0 }, a);
    if ('error' in r) return r.error;
    trackPmFeats(t.feats, g, a, r.state, !auto || auto === 'bot');
    t.game = r.state;
    t.version++;
    t.lastActivity = Date.now();
    if (currentPlayer(r.state).id !== m.id || r.state.phase === 'fini') { if (t.autoOf === m.id) t.autoOf = null; }
    emitEach(t, 'game:update', (viewer): PmUpdate => ({
      version: t.version, state: viewFor(r.state, viewer), events: r.state.events, by: m.id, action: a.type, ...(auto ? { auto } : {}),
    }));
    schedule(t, Math.round(ANIM * animUnits(r.state.events)));
    if (r.state.phase === 'fini') endGame(t);
    broadcast(t);
    return null;
  }

  function endGame(t: Table) {
    if (t.rewarded) return;
    t.rewarded = true;
    if (t.timer) clearTimeout(t.timer);
    t.timer = null;
    t.deadline = null;
    const g = t.game!;
    const inGame = t.members.filter((m) => t.players.includes(m.id));
    const humans = inGame.filter((m) => !m.bot).length;
    const botLevels = inGame.flatMap((m) => (m.bot ? [m.bot] : []));
    const minutes = ((o.now ?? Date.now)() - t.startedAt) / 60000;
    for (const m of inGame) {
      if (!m.userId) continue;
      const out = c.reward(m.userId, {
        won: g.winner === m.id, place: placeOf(g, m.id), players: g.players.length, humans, botLevels, minutes, day: c.today(), abandoned: !!m.quit,
        feats: t.feats[m.id] ?? { callsRight: 0, bluffsPassed: 0, pokerAs: 0, livesLost: 0 },
      });
      if (out && m.socketId) sock(m.socketId)?.emit('profile:reward', {
        reward: out.reward, levelBefore: out.applied.levelBefore, levelAfter: out.applied.levelAfter, profile: out.applied.profile,
        bags: out.applied.bagsFound ?? 0, quests: (out.applied.questsDone ?? []).map((q) => q.text), achievements: (out.applied.achievementsDone ?? []).map((x) => x.id),
      } satisfies PmRewardMsg);
    }
    noteOnlineGame(c.store, 'poker'); // « Le 421 en chiffres » (server/chiffres.ts)
    c.verifiedGame?.({ game: 'poker', players: inGame.filter((m) => m.userId && !m.bot).map((m) => ({ userId: m.userId!, won: g.winner === m.id, abandoned: !!m.quit })) });
  }

  // --- Présence (amis), spectateurs ---------------------------------------------------------------
  function presence(userId: string) {
    for (const t of tables.values()) {
      const m = t.members.find((x) => x.userId === userId && !x.left && x.socketId != null);
      if (!m) continue;
      const lobby = t.status === 'lobby';
      return {
        code: t.code, status: lobby ? 'salon' as const : 'partie' as const, joinable: lobby && seatsTaken(t) < PM_TABLE_MAX,
        watchable: !lobby && !!t.game && t.game.phase !== 'fini', game: 'poker' as const,
      };
    }
    return null;
  }
  function watchProblem(t: Table, userId: string | undefined): string | null {
    if (t.status !== 'playing' || !t.game) return 'Aucune partie en cours à cette table pour l’instant.';
    if (userId && t.members.some((m) => m.userId === userId && !m.left && !m.bot)) return 'Vous êtes joueur à cette table.';
    if (blockedAt(userId, t.members) || (userId && t.kicked.has(userId))) return 'Impossible de regarder cette partie.';
    if (t.visibility === 'private') {
      if (!userId) return 'Partie privée : seuls les amis des joueurs peuvent la regarder (connectez-vous à votre compte).';
      if (!t.members.some((m) => m.userId && friendsEither(m.userId, userId))) return 'Partie privée : seuls les amis des joueurs peuvent la regarder.';
    }
    if (t.spectators.size >= MAX_SPECTATORS) return `Trop de spectateurs pour cette partie (${MAX_SPECTATORS} au maximum).`;
    return null;
  }
  function transferHost(t: Table, reason: string) {
    const next = t.members.find((m) => m.id !== t.hostId && !m.bot && !m.left && m.socketId != null);
    if (!next) return;
    t.hostId = next.id;
    next.ready = true;
    notice(t, `${reason} ${next.name} devient l'hôte.`, 'warning');
  }
  function removeIfEmpty(t: Table) {
    if (t.members.some((m) => !m.bot && (m.socketId != null || (t.status === 'playing' && !m.left)))) return;
    if (t.status === 'playing' && t.game && t.game.phase !== 'fini') return;
    close(t);
  }
  function close(t: Table) {
    if (t.timer) clearTimeout(t.timer);
    if (t.quick?.timer) clearTimeout(t.quick.timer);
    for (const id of t.spectators.keys()) { const s = sock(id); s?.emit('spectate:closed', { text: 'La table a été fermée.' }); s?.leave(t.code); if (s) s.data.watch = null; }
    tables.delete(t.code);
  }
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const t of [...tables.values()]) if (t.members.every((m) => m.socketId == null) && now - t.lastActivity > 10 * 60_000) close(t);
  }, 60_000);

  // --- Connexions --------------------------------------------------------------------------------
  ns.on('connection', (socket: Socket) => {
    let bucket = 25;
    const refill = setInterval(() => (bucket = 25), 1000);
    socket.use((_pkt, next) => (bucket-- > 0 ? next() : next(new Error('Trop de requêtes'))));
    const safeAck = (a: unknown) => (typeof a === 'function' ? (a as (x: Ack<any>) => void) : () => {});
    const ctx = () => {
      const t = tables.get(socket.data.code as string);
      const m = t?.members.find((x) => x.id === socket.data.playerId);
      return t && m ? { t, m } : null;
    };
    const unwatch = () => {
      const t = socket.data.watch ? tables.get(socket.data.watch as string) : undefined;
      if (t && t.spectators.delete(socket.id)) { socket.leave(t.code); broadcast(t); }
      socket.data.watch = null;
    };
    const attach = (t: Table, m: Member) => {
      unwatch();
      const prev = sock(m.socketId);
      if (prev && prev.id !== socket.id) prev.disconnect(true); // un seul onglet par joueur
      const old = socket.data.code ? tables.get(socket.data.code as string) : undefined;
      if (old && old !== t) { socket.leave(old.code); const om = old.members.find((x) => x.id === socket.data.playerId); if (om?.socketId === socket.id) om.socketId = null; }
      m.socketId = socket.id;
      socket.data.code = t.code;
      socket.data.playerId = m.id;
      socket.join(t.code);
      t.lastActivity = Date.now();
    };
    const userOf = (p: any) => { const u = c.userFromToken(p?.auth); return u && !c.banOf(u.id) ? u : undefined; };
    const banned = (p: any) => { const u = c.userFromToken(p?.auth); return !!u && !!c.banOf(u.id); };
    const newMember = (p: any, name: string): Member => ({
      id: randomUUID(), token: randomUUID(), name, avatar: cleanAvatar(p?.avatar), ready: false, socketId: null, left: false,
      userId: userOf(p)?.id, dice: cleanDice(p?.dice),
    });
    const seatName = (p: any) => tableName(userOf(p), cleanName(p?.name), c.adminNames);
    const joined = (t: Table, m: Member) => ({ ok: true as const, code: t.code, playerId: m.id, token: m.token });

    socket.on('table:create', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      if (banned(p)) return reply({ ok: false, error: 'Votre compte est suspendu.' });
      const seat = seatName(p);
      if ('error' in seat) return reply({ ok: false, error: seat.error });
      const m = { ...newMember(p, seat.name), ready: true };
      const t = makeTable(m, `Table de ${seat.name}`, cleanPmOptions(p?.options), p?.visibility === 'public' ? 'public' : 'private');
      attach(t, m);
      reply(joined(t, m));
      broadcast(t);
    });

    function seatNew(t: Table, p: any): Ack<{ code: string; playerId: string; token: string }> {
      const seat = seatName(p);
      if ('error' in seat) return { ok: false, error: seat.error };
      const userId = userOf(p)?.id;
      if (t.status !== 'lobby') return { ok: false, error: 'La partie a déjà commencé.' };
      if (userId && t.kicked.has(userId)) return { ok: false, error: 'L’hôte vous a retiré de cette table.' };
      if (blockedAt(userId, t.members)) return { ok: false, error: 'Impossible de rejoindre cette table.' };
      const same = userId ? t.members.find((x) => x.userId === userId && !x.bot) : undefined;
      if (same) { attach(t, same); broadcast(t); return joined(t, same); }
      if (seatsTaken(t) >= PM_TABLE_MAX) return { ok: false, error: `La table est complète (${PM_TABLE_MAX} joueurs).` };
      const wanted = userId ? seat.name : avoidBotName(seat.name, t.members.filter((m) => m.bot).map((m) => m.name));
      let finalName = wanted;
      for (let k = 2; t.members.some((m) => m.name === finalName); k++) finalName = `${wanted} ${k}`;
      const m = { ...newMember(p, finalName), ready: !!t.quick };
      const filler = [...t.members].reverse().find((x) => x.filler);
      if (filler) t.members = t.members.filter((x) => x !== filler);
      else if (t.members.length >= PM_TABLE_MAX) { const bot = [...t.members].reverse().find((x) => x.bot); if (bot) t.members = t.members.filter((x) => x !== bot); }
      t.members.push(m);
      attach(t, m);
      notice(t, filler ? `${m.name} prend la place de ${filler.name} (ordinateur).` : `${m.name} a rejoint la table.`);
      quickPlan(t);
      broadcast(t);
      return joined(t, m);
    }

    socket.on('table:join', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      if (banned(p)) return reply({ ok: false, error: 'Votre compte est suspendu.' });
      const code = cleanPmCode(p?.code);
      const t = code ? tables.get(code) : undefined;
      if (!t) return reply({ ok: false, error: 'Table introuvable. Vérifiez le code.' });
      const existing = typeof p?.token === 'string' ? t.members.find((m) => m.token === p.token && !m.bot) : undefined;
      if (existing) {
        const running = t.status === 'playing' && !!t.game && t.game.phase !== 'fini' && t.players.includes(existing.id);
        if (existing.left) {
          if (!running) return reply({ ok: false, error: 'Cette partie est terminée.' });
          existing.left = false;
          notice(t, `${existing.name} revient à la table.`);
        } else if (existing.socketId == null) notice(t, `${existing.name} est de retour.`);
        // Rattacher un compte à une place d'invité : seulement en salon, et si ce compte n'a pas déjà une
        // place à cette table (sinon un même compte jouerait deux places et serait récompensé deux fois).
        const acct = userOf(p)?.id;
        if (existing.userId == null && acct && t.status === 'lobby' && !t.members.some((y) => y !== existing && y.userId === acct)) existing.userId = acct;
        attach(t, existing);
        reply(joined(t, existing));
        broadcast(t);
        if (t.game) socket.emit('game:state', snapshotFor(t, existing.id));
        if (running && t.autoOf === existing.id) t.autoOf = null;
        if (running) schedule(t, 600);
        if (t.status === 'lobby') quickPlan(t);
        return;
      }
      reply(seatNew(t, p));
    });

    socket.on('table:quick', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      if (banned(p)) return reply({ ok: false, error: 'Votre compte est suspendu.' });
      const seat = seatName(p);
      if ('error' in seat) return reply({ ok: false, error: seat.error });
      const userId = userOf(p)?.id;
      const humansAt = (t: Table) => t.members.filter((m) => !m.bot).length;
      const candidates = [...tables.values()].filter((t) => t.status === 'lobby' && t.visibility === 'public' && seatsTaken(t) < PM_TABLE_MAX
        && t.members.some(humanHere) && !blockedAt(userId, t.members) && !(userId && t.kicked.has(userId)))
        .sort((a, b) => humansAt(b) - humansAt(a) || Number(!!b.quick) - Number(!!a.quick) || a.startedAt - b.startedAt);
      if (candidates.length) return reply(seatNew(candidates[0], p));
      const m = { ...newMember(p, seat.name), ready: true };
      const t = makeTable(m, `Partie rapide de ${seat.name}`, cleanPmOptions({}), 'public');
      t.quick = { waitSince: Date.now(), fillAt: null, startAt: null, timer: null };
      attach(t, m);
      quickPlan(t);
      reply({ ...joined(t, m), created: true } as any);
      broadcast(t);
    });

    const hostOnly = (reply: (a: Ack<any>) => void) => {
      const x = ctx();
      if (!x || x.t.status !== 'lobby') { reply({ ok: false, error: 'Action impossible' }); return null; }
      if (x.m.id !== x.t.hostId) { reply({ ok: false, error: 'Seul l’hôte peut le faire.' }); return null; }
      return x;
    };
    socket.on('table:addBot', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const x = hostOnly(reply);
      if (!x) return;
      if (x.t.members.length >= PM_TABLE_MAX) return reply({ ok: false, error: 'La table est complète.' });
      addBot(x.t, cleanLevel(p?.level));
      reply({ ok: true });
      quickPlan(x.t);
      broadcast(x.t);
    });
    socket.on('table:removeBot', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const x = hostOnly(reply);
      if (!x) return;
      x.t.members = x.t.members.filter((m) => !(m.bot && m.id === p?.id));
      if (x.t.quick && !x.t.members.some((m) => m.bot)) { x.t.quick.waitSince = Date.now(); x.t.quick.startAt = null; }
      reply({ ok: true });
      quickPlan(x.t);
      broadcast(x.t);
    });
    socket.on('table:kick', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const x = hostOnly(reply);
      if (!x) return;
      const target = x.t.members.find((m) => m.id === String(p?.playerId ?? ''));
      if (!target || target.id === x.m.id) return reply({ ok: false, error: 'Joueur introuvable.' });
      x.t.members = x.t.members.filter((m) => m !== target);
      if (target.userId) x.t.kicked.add(target.userId);
      const ts = sock(target.socketId);
      if (ts) { ts.emit('table:kicked', { text: 'L’hôte vous a retiré de la table.' }); ts.leave(x.t.code); ts.data.code = null; }
      reply({ ok: true });
      notice(x.t, `${target.name} a été retiré de la table.`);
      quickPlan(x.t);
      broadcast(x.t);
    });
    socket.on('table:ready', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const x = ctx();
      if (!x || x.t.status !== 'lobby') return reply({ ok: false, error: 'Action impossible' });
      x.m.ready = x.m.id === x.t.hostId ? true : !!p?.ready;
      reply({ ok: true });
      broadcast(x.t);
    });
    socket.on('table:config', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const x = hostOnly(reply);
      if (!x) return;
      if (p?.options !== undefined) x.t.options = cleanPmOptions({ ...x.t.options, ...p.options });
      if (p?.visibility === 'public' || p?.visibility === 'private') x.t.visibility = p.visibility;
      for (const m of x.t.members) if (m.id !== x.t.hostId && !m.bot && !x.t.quick) m.ready = false;
      reply({ ok: true });
      broadcast(x.t);
    });
    socket.on('table:start', (_p: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      const x = hostOnly(reply);
      if (!x) return;
      const players = x.t.members.filter((m) => !m.left);
      if (players.length < 2) return reply({ ok: false, error: 'Il faut au moins 2 joueurs' });
      if (players.some((m) => !m.ready)) return reply({ ok: false, error: 'Tous les joueurs doivent être prêts' });
      startGame(x.t);
      reply({ ok: true });
    });
    socket.on('table:rematch', (_p: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      const x = ctx();
      if (!x || x.m.id !== x.t.hostId) return reply({ ok: false, error: 'Seul l’hôte peut proposer une revanche.' });
      if (x.t.status !== 'playing' || (x.t.game && x.t.game.phase !== 'fini')) return reply({ ok: false, error: 'La partie est en cours' });
      const t = x.t;
      t.status = 'lobby';
      t.game = null;
      t.players = [];
      t.members = t.members.filter((m) => !m.left && (m.bot || m.socketId != null));
      for (const m of t.members) m.ready = m.id === t.hostId || !!m.bot || !!t.quick;
      if (t.quick) { t.quick.waitSince = Date.now(); t.quick.startAt = null; }
      reply({ ok: true });
      notice(t, 'L’hôte propose une revanche : retour à la table.');
      ns.to(t.code).emit('game:state', null);
      quickPlan(t);
      broadcast(t);
    });

    // Action de jeu : bon joueur, bonne version, entrée valide.
    socket.on('game:act', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      if (socket.data.watch) return reply({ ok: false, error: 'Vous regardez la partie : les spectateurs ne jouent pas.' });
      const x = ctx();
      if (!x || x.t.status !== 'playing' || !x.t.game) return reply({ ok: false, error: 'Aucune partie en cours' });
      const { t, m } = x;
      const g = t.game!;
      if (g.phase === 'fini') return reply({ ok: false, error: 'La partie est terminée.' });
      if (currentPlayer(g).id !== m.id) return reply({ ok: false, error: 'Ce n’est pas votre tour.' });
      if (p?.version !== t.version) return reply({ ok: false, error: 'Action ignorée (déjà prise en compte)' });
      const a = cleanPmAction(p?.action);
      if (!a) return reply({ ok: false, error: 'Action invalide' });
      const prevAuto = t.autoOf;
      if (t.autoOf === m.id) t.autoOf = null;
      const err = apply(t, m, a);
      if (err) { t.autoOf = prevAuto; return reply({ ok: false, error: err }); }
      reply({ ok: true });
    });

    let lastEmote = 0;
    socket.on('game:emote', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const x = ctx();
      if (!x) return reply({ ok: false, error: 'Aucune table' });
      if (!isReaction(p?.emote)) return reply({ ok: false, error: 'Réaction inconnue' });
      const now = Date.now();
      if (now - lastEmote < 1200) return reply({ ok: false, error: 'Doucement !' });
      lastEmote = now;
      reply({ ok: true });
      ns.to(x.t.code).emit('game:emote', { playerId: x.m.id, emote: p.emote });
    });

    let lastChat = 0;
    socket.on('table:chat', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const x = ctx();
      const st = !x && socket.data.watch ? tables.get(socket.data.watch as string) : undefined;
      const spec = st?.spectators.get(socket.id);
      if (!x && !(st && spec)) return reply({ ok: false, error: 'Aucune table' });
      const text = String(p?.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+/gi, '[lien]').trim().slice(0, 200);
      if (!text) return reply({ ok: false, error: 'Message vide' });
      const uid = x ? x.m.userId : spec!.userId;
      const mute = uid ? c.muteOf(uid) : undefined;
      if (mute) return reply({ ok: false, error: muteText(mute) });
      const now = Date.now();
      if (now - lastChat < 1000) return reply({ ok: false, error: 'Doucement !' });
      lastChat = now;
      reply({ ok: true });
      const t = x ? x.t : st!;
      const id = `pm${++chatSeq}-${randomInt(1e6)}`;
      c.recordChat({
        id, code: t.code, where: `Poker menteur, table ${t.code}`, userId: uid ?? null, name: x ? x.m.name : spec!.name, text, at: now,
        audience: [...t.members.map((m) => m.userId), ...[...t.spectators.values()].map((s) => s.userId)].filter((v): v is string => !!v),
      });
      const account = uid ? c.publicInfo(uid)?.account ?? null : null;
      ns.to(t.code).emit('table:chat', x
        ? { id, playerId: x.m.id, name: x.m.name, account, text, at: now }
        : { id, playerId: `spectateur:${socket.id}`, name: spec!.name, account, text, at: now, spectator: true });
    });

    socket.on('spectate:join', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const code = cleanPmCode(p?.code);
      const t = code ? tables.get(code) : undefined;
      if (!t) return reply({ ok: false, error: 'Partie introuvable. Elle est peut-être déjà terminée.' });
      if (ctx()) return reply({ ok: false, error: 'Quittez d’abord votre table pour regarder une partie.' });
      const u = userOf(p);
      if (socket.data.watch !== t.code || !t.spectators.has(socket.id)) {
        const problem = watchProblem(t, u?.id);
        if (problem) return reply({ ok: false, error: problem });
        unwatch();
        t.spectators.set(socket.id, { name: u?.username ?? guestLabel(cleanName(p?.name), c.adminNames) ?? 'Spectateur', userId: u?.id });
        socket.data.watch = t.code;
        socket.join(t.code);
      }
      reply({ ok: true, code: t.code });
      broadcast(t);
      socket.emit('table:state', publicTable(t));
      if (t.game) socket.emit('game:state', snapshotFor(t, null));
    });
    socket.on('spectate:leave', (_p: unknown, ack: unknown) => { unwatch(); safeAck(ack)({ ok: true }); });

    function leave() {
      const x = ctx();
      if (!x) return;
      const { t, m } = x;
      socket.leave(t.code);
      socket.data.code = null;
      m.socketId = null;
      const wasHost = m.id === t.hostId;
      const running = t.status === 'playing' && !!t.game && t.game.phase !== 'fini' && t.players.includes(m.id);
      if (t.status === 'lobby') t.members = t.members.filter((y) => y !== m);
      else if (running && (t.game!.players.find((y) => y.id === m.id)?.out ?? 0) > 0) {
        // Déjà éliminé : il part sans abandonner (il garde sa place au classement et ses gains).
        m.left = true;
      } else if (running) {
        m.left = true;
        m.quit = true;
        notice(t, `${m.name} a quitté la partie : le serveur joue à sa place (il peut revenir).`, 'warning');
        if (currentPlayer(t.game!).id === m.id) schedule(t, 0);
        else if (!t.members.some((y) => humanHere(y) && t.players.includes(y.id))) schedule(t, 0);
      }
      if (wasHost) transferHost(t, `L’hôte ${m.name} est parti.`);
      if (t.status === 'lobby') quickPlan(t);
      broadcast(t);
      removeIfEmpty(t);
    }
    socket.on('table:leave', (_p: unknown, ack: unknown) => { leave(); safeAck(ack)({ ok: true }); });

    socket.on('disconnect', () => {
      clearInterval(refill);
      unwatch();
      const x = ctx();
      if (!x || x.m.socketId !== socket.id) return;
      const { t, m } = x;
      m.socketId = null;
      t.lastActivity = Date.now();
      if (t.status === 'lobby') {
        quickPlan(t);
        if (m.id === t.hostId) setTimeout(() => { if (m.socketId == null && t.hostId === m.id) { transferHost(t, `L’hôte ${m.name} est parti.`); broadcast(t); } }, 15_000);
      } else if (t.game && t.game.phase !== 'fini') {
        notice(t, `${m.name} a perdu la connexion.`, 'warning');
        if (currentPlayer(t.game).id === m.id || !t.members.some((y) => humanHere(y) && t.players.includes(y.id))) schedule(t, 0);
      }
      broadcast(t);
    });
  });

  return {
    presence,
    has: (code: string) => tables.has(code),
    closeTable: (code: string) => { const t = tables.get(code); if (t) close(t); },
    status: (code: string) => tables.get(code)?.status ?? null,
    tables,
    close: () => { clearInterval(sweeper); for (const t of tables.values()) { if (t.timer) clearTimeout(t.timer); if (t.quick?.timer) clearTimeout(t.quick.timer); } },
  };
}
