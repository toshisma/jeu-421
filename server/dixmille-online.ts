/**
 * Le Courtisan en ligne (jeu de dés du Dix mille, 2 à 6 joueurs) : tables par code ou lien,
 * partie rapide, ordinateurs pour compléter, tchat et réactions, spectateurs amis.
 *
 * Module à part (espace Socket.IO « /dixmille ») plutôt qu'une extension des salons du 421 :
 * les salons du 421 sont liés à son moteur (manches, jetons, mises, tournois). Ici, on reprend
 * leurs principes (jeton de reprise, minuteur par décision, serveur qui joue pour un absent,
 * retour après avoir quitté, tchat modéré) sans toucher à leur code.
 *
 * Le serveur fait foi : moteur partagé (shared/dixmille/engine.ts), nouvelle graine tirée au
 * hasard (source cryptographique) avant chaque action, donc aucun joueur ne peut prévoir les dés ;
 * l'état envoyé ne contient jamais cette graine. Chaque action porte la version de l'état
 * (anti double-clic) et n'est acceptée que du joueur dont c'est le tour.
 */
import { randomInt, randomUUID } from 'node:crypto';
import type { Namespace, Server, Socket } from 'socket.io';
import { act, currentPlayer, newGame, placeOf, DM_TARGETS, type DmAction, type DmEvent, type DmLevel, type DmState } from '../shared/dixmille/engine';
import { cleanStake } from '../shared/dixmille/groschen';
import type { GroschenApi } from './groschen';
import { decide } from '../shared/dixmille/ai';
import { DM_DECISION_SECONDS, DM_TABLE_MAX, type DmPublicTable, type DmRewardMsg, type DmUpdate } from '../shared/dixmille/protocol';
import { AVATARS, MAX_SPECTATORS, isReaction, type Ack } from '../shared/protocol';
import { sanitizeGesture, type ThrowGesture } from '../shared/gesture';
import { muteText } from '../shared/moderation';
import { getItem } from '../shared/progress/catalog';
import type { Store, UserRow } from './db';
import type { TableChatEntry } from './moderation';
import type { Reward } from '../shared/progress/profile';

export interface DmOnlineOptions {
  /** Temps par décision (ms). */
  decisionMs?: number;
  /** Absent (déconnecté) : délai avant que le serveur joue pour lui. */
  disconnectMs?: number;
  /** Rythme du serveur quand il joue (ordinateur, joueur parti). */
  autoplayMs?: number;
  /** Temps laissé aux navigateurs pour animer (multiplié selon ce qui se passe ; 0 dans les tests). */
  animMs?: number;
  /** Partie rapide : attente avant les ordinateurs, puis compte à rebours. */
  quickFillMs?: number;
  quickStartMs?: number;
}

interface Ctx {
  io: Server;
  store: Store;
  userFromToken: (t: unknown) => UserRow | undefined;
  banOf: (userId: string) => unknown;
  muteOf: (userId: string) => { until: number; reason: string } | undefined;
  publicInfo: (userId: string) => { account: string; photo?: string | null; accessory?: string; dice?: string; trail?: string } | null;
  isBlocked: (a: string, b: string) => boolean;
  /** Récompense d'un compte en fin de partie (calculée par les comptes). */
  reward: (userId: string, o: { won: boolean; place: number; players: number; humans: number; botLevels: DmLevel[]; minutes: number; day: string; abandoned: boolean; bestTurn?: number; potWon?: number })
    => { reward: Reward; applied: { profile: unknown; levelBefore: number; levelAfter: number; bagsFound?: number; questsDone?: { id: string; text: string }[] } } | null;
  recordChat: (e: TableChatEntry) => void;
  /** Les Groschen (mises). */
  groschen: GroschenApi;
  /** Codes déjà pris par les autres jeux (tables du 421, tournois). */
  taken: (code: string) => boolean;
  opts?: DmOnlineOptions;
}

interface Member {
  id: string;
  token: string;
  name: string;
  avatar: string;
  ready: boolean;
  socketId: string | null;
  left: boolean;
  userId?: string;
  day: string;
  bot?: DmLevel;
  filler?: boolean;
  dice?: string;
  /**
   * A quitté la partie en cours (abandon) : même s'il revient, il ne touche ni le pot ni la
   * récompense de cette partie. Remis à zéro à la partie suivante.
   */
  quit?: boolean;
}
interface Table {
  code: string;
  title: string;
  hostId: string;
  members: Member[];
  kicked: Set<string>;
  target: number;
  visibility: 'private' | 'public';
  /** Mise en Groschen par joueur (0 : gratuit). Les ordinateurs misent la même somme. */
  stake: number;
  /** Pot de la partie en cours, et référence de ses mises bloquées. */
  pot: number;
  ref: string;
  games: number;
  /** Partie contre l'ordinateur avec mise (jouée par le serveur pour que le résultat soit sûr). */
  solo?: boolean;
  status: 'lobby' | 'playing';
  game: DmState | null;
  version: number;
  /** Joueurs de la partie en cours (dans l'ordre du jeu). */
  players: string[];
  timer: NodeJS.Timeout | null;
  deadline: number | null;
  /** Joueur pour qui le serveur joue la fin du tour (temps écoulé, absent). */
  autoOf: string | null;
  startedAt: number;
  rewarded: boolean;
  lastActivity: number;
  spectators: Map<string, { name: string; userId?: string }>;
  quick?: { waitSince: number; fillAt: number | null; startAt: number | null; timer: NodeJS.Timeout | null };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LEVELS: DmLevel[] = ['debutant', 'habitue', 'fouine'];
const BOTS: { name: string; avatar: string }[] = [
  { name: 'Marcel', avatar: '🐻' }, { name: 'Josiane', avatar: '🦉' }, { name: 'Le Baron', avatar: '🎩' }, { name: 'Lulu', avatar: '🦊' },
  { name: 'Dédé', avatar: '⚓' }, { name: 'Simone', avatar: '🍷' }, { name: 'Gégé', avatar: '🐸' }, { name: 'Fernand', avatar: '🐙' },
  { name: 'Odette', avatar: '🍀' }, { name: 'Raymond', avatar: '🦁' }, { name: 'Huguette', avatar: '🐧' }, { name: 'Firmin', avatar: '🐯' },
];
const QUICK_TARGET = 3;
export const cleanDmCode = (v: unknown) => (typeof v === 'string' && /^[A-Z0-9]{5}$/.test(v.toUpperCase()) ? v.toUpperCase() : null);
function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return n.length ? n : null;
}
const cleanAvatar = (v: unknown) => (typeof v === 'string' && AVATARS.includes(v) ? v : AVATARS[0]);
const cleanLevel = (v: unknown): DmLevel => (LEVELS.includes(v as DmLevel) ? (v as DmLevel) : 'habitue');
const cleanTarget = (v: unknown) => ((DM_TARGETS as readonly number[]).includes(Number(v)) ? Number(v) : 4000);
/** Dés annoncés par un invité : seulement ceux de la boutique. */
const cleanDice = (v: unknown) => {
  const it = typeof v === 'string' ? getItem(v) : undefined;
  return it && it.category === 'dice' && !it.rarity && !it.pass ? it.id : undefined;
};
/** Un tableau d'indices de dés (0 à 5), sans rien d'autre. */
function cleanPick(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 6) return null;
  if (!v.every((x) => Number.isInteger(x) && x >= 0 && x < 6)) return null;
  return v as number[];
}
function cleanAction(v: any): DmAction | null {
  if (v?.type === 'lancer') return { type: 'lancer' };
  if (v?.type === 'relancer' || v?.type === 'encaisser') { const pick = cleanPick(v.pick); return pick ? { type: v.type, pick } : null; }
  return null;
}
/** Temps d'animation d'une action chez les joueurs (lancer, raté, main pleine…), en « unités ». */
function animUnits(events: DmEvent[]): number {
  let u = 0;
  for (const e of events) u += e.kind === 'lancer' ? 2.6 : e.kind === 'rate' ? 1.8 : e.kind === 'main-pleine' ? 1.1 : e.kind === 'encaisse' ? 0.7 : 0;
  return u;
}
/** L'état envoyé aux joueurs : sans la graine (le serveur en tire une nouvelle à chaque action de toute façon). */
const wire = (s: DmState): DmState => ({ ...s, seed: 0, draws: 0 });

export function createDixMilleOnline(c: Ctx) {
  const o = c.opts ?? {};
  const DECISION = o.decisionMs ?? DM_DECISION_SECONDS * 1000;
  const AWAY = o.disconnectMs ?? 20_000;
  const AUTOPLAY = o.autoplayMs ?? 1_400;
  const ANIM = o.animMs ?? 1000;
  const QUICK_FILL = o.quickFillMs ?? 30_000;
  const QUICK_START = o.quickStartMs ?? 10_000;
  const ns: Namespace = c.io.of('/dixmille');
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
  function publicTable(t: Table): DmPublicTable {
    return {
      code: t.code, title: t.title, hostId: t.hostId, status: t.status, target: t.target, visibility: t.visibility, max: DM_TABLE_MAX,
      stake: t.stake, pot: t.pot, ...(t.solo ? { solo: true } : {}),
      deadline: t.deadline, spectators: t.spectators.size,
      ...(t.quick ? { quick: { fillAt: t.quick.fillAt, startAt: t.quick.startAt } } : {}),
      members: t.members.map((m) => {
        const info = m.userId ? c.publicInfo(m.userId) : null;
        return {
          id: m.id, name: m.name, avatar: m.avatar, ready: m.ready, connected: m.socketId != null || !!m.bot, left: m.left, isHost: m.id === t.hostId,
          ...(m.bot ? { bot: m.bot } : {}), ...(m.filler ? { filler: true } : {}), ...(m.quit ? { quit: true } : {}),
          ...(info ? { account: info.account, photo: info.photo ?? null, ...(info.accessory ? { accessory: info.accessory } : {}), ...(info.trail ? { trail: info.trail } : {}) } : {}),
          dice: info?.dice ?? m.dice,
        };
      }),
    };
  }
  const broadcast = (t: Table) => ns.to(t.code).emit('table:state', publicTable(t));
  const notice = (t: Table, text: string, kind: 'info' | 'warning' = 'info') => ns.to(t.code).emit('table:notice', { kind, text });
  const snapshot = (t: Table) => ({ version: t.version, state: wire(t.game!) });

  function makeTable(host: Member, title: string, target: number, visibility: 'private' | 'public', stake = 0): Table {
    const t: Table = {
      code: newCode(), title, hostId: host.id, members: [host], kicked: new Set(), target, visibility, stake, pot: 0, ref: '', games: 0, status: 'lobby', game: null, version: 0, players: [],
      timer: null, deadline: null, autoOf: null, startedAt: Date.now(), rewarded: false, lastActivity: Date.now(), spectators: new Map(),
    };
    tables.set(t.code, t);
    return t;
  }

  function botIdentity(t: Table) {
    const taken = t.members.map((m) => m.name);
    const free = BOTS.filter((b) => !taken.includes(b.name));
    return free.length ? free[randomInt(free.length)] : { name: `Ordi ${taken.length + 1}`, avatar: '🎲' };
  }
  function addBot(t: Table, level: DmLevel, filler = false) {
    const b = botIdentity(t);
    t.members.push({ id: randomUUID(), token: randomUUID(), name: b.name, avatar: b.avatar, ready: true, socketId: null, left: false, day: '', bot: level, ...(filler ? { filler: true } : {}) });
  }
  function fillWithBots(t: Table, upTo: number, level: DmLevel = 'habitue') {
    let n = 0;
    while (t.members.length < Math.min(upTo, DM_TABLE_MAX)) { addBot(t, level, true); n++; }
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
    const err = startGame(t);
    if (err) { notice(t, err, 'warning'); broadcast(t); }
  }

  // --- Déroulement -------------------------------------------------------------------------------
  /** Pourquoi ce joueur ne peut pas jouer à cette mise (ou null). */
  function stakeProblem(userId: string | undefined, stake: number): string | null {
    if (stake <= 0) return null;
    if (!userId) return 'Les parties avec mise demandent un compte (vos Groschen sont gardés sur le serveur).';
    const have = c.groschen.balance(userId);
    if (have < stake) return `Il faut ${stake} Groschen pour cette mise (vous en avez ${have}).`;
    return null;
  }

  /** Lancement : mises prélevées et bloquées ; renvoie une erreur si un joueur ne peut plus payer. */
  function startGame(t: Table): string | null {
    const players = t.members.filter((m) => !m.left);
    for (const m of t.members) m.quit = false;
    if (t.stake > 0) {
      for (const m of players.filter((x) => !x.bot)) {
        const problem = stakeProblem(m.userId, t.stake);
        if (problem) return `${m.name} : ${problem}`;
      }
    }
    t.games++;
    t.ref = `DM:${t.code}:${t.games}`;
    t.pot = 0;
    if (t.stake > 0) {
      for (const m of players) {
        if (!m.bot && !c.groschen.stake(m.userId!, t.stake, t.ref)) { c.groschen.refund(t.ref); t.pot = 0; return `${m.name} : solde insuffisant.`; }
        t.pot += t.stake; // les ordinateurs misent la même somme
      }
    }
    if (t.quick) { if (t.quick.timer) clearTimeout(t.quick.timer); t.quick.timer = null; t.quick.fillAt = null; t.quick.startAt = null; }
    // Ordre tiré au sort : personne n'a toujours l'avantage de commencer.
    for (let i = players.length - 1; i > 0; i--) { const j = randomInt(i + 1); [players[i], players[j]] = [players[j], players[i]]; }
    t.players = players.map((m) => m.id);
    t.game = newGame(players.map((m) => ({ id: m.id, name: m.name, ...(m.bot ? { bot: m.bot } : {}) })), t.target, randomInt(2 ** 31));
    t.status = 'playing';
    t.version = 1;
    t.autoOf = null;
    t.rewarded = false;
    t.startedAt = Date.now();
    t.lastActivity = Date.now();
    ns.to(t.code).emit('game:state', snapshot(t));
    if (t.pot > 0) notice(t, `Partie lancée : ${t.pot} Groschen dans le pot. Le gagnant emporte tout.`);
    schedule(t, 0);
    broadcast(t);
    return null;
  }

  const memberOf = (t: Table, id: string) => t.members.find((m) => m.id === id);

  /**
   * Programme ce qui suit : ordinateur qui joue, joueur parti ou absent pour qui le serveur joue,
   * ou chrono de la décision du joueur présent. `grace` : temps d'animation de l'action précédente.
   */
  function schedule(t: Table, grace: number) {
    if (t.timer) clearTimeout(t.timer);
    t.timer = null;
    t.deadline = null;
    const g = t.game;
    if (t.status !== 'playing' || !g || g.phase === 'fini') return;
    // Plus aucun vrai joueur à la table : la partie attend (reprise possible tant qu'elle n'est pas rangée).
    if (!t.members.some((m) => humanHere(m) && t.players.includes(m.id))) return;
    const pid = currentPlayer(g).id;
    if (t.autoOf && t.autoOf !== pid) t.autoOf = null;
    const m = memberOf(t, pid)!;
    if (m.bot) {
      const think = AUTOPLAY * (0.45 + Math.random() * 0.5) + (g.phase === 'choisir' && Math.random() < 0.25 ? AUTOPLAY * 0.4 : 0);
      t.timer = setTimeout(() => autoPlay(t, pid, 'bot'), grace + Math.round(think));
      return;
    }
    let delay: number, mode: 'temps' | 'absent';
    if (m.left) { delay = grace + AUTOPLAY; mode = 'absent'; }
    else if (m.socketId == null) { delay = grace + (t.autoOf === pid ? AUTOPLAY : AWAY); mode = 'absent'; }
    else if (t.autoOf === pid) { delay = grace + AUTOPLAY; mode = 'temps'; }
    // Contre l'ordinateur (avec mise) : plus de temps pour réfléchir, personne n'attend.
    else { delay = grace + (t.solo ? DECISION * 4 : DECISION); mode = 'temps'; }
    t.deadline = Date.now() + delay;
    t.timer = setTimeout(() => autoPlay(t, pid, mode), delay);
  }

  function autoPlay(t: Table, pid: string, mode: 'bot' | 'temps' | 'absent') {
    const g = t.game;
    if (!g || g.phase === 'fini' || currentPlayer(g).id !== pid) return;
    const m = memberOf(t, pid)!;
    if (mode !== 'bot' && t.autoOf !== pid) {
      t.autoOf = pid;
      if (mode === 'temps') notice(t, `Temps écoulé pour ${m.name} : le serveur finit son tour.`, 'warning');
      else if (!m.left) notice(t, `${m.name} ne répond pas : le serveur joue à sa place.`, 'warning');
    }
    apply(t, m, decide(g, m.bot ?? 'habitue'), undefined, mode === 'bot' ? 'bot' : mode);
  }

  /** Applique une action (déjà vérifiée : bon joueur, bonne version). */
  function apply(t: Table, m: Member, a: DmAction, gesture: ThrowGesture | undefined, auto?: DmUpdate['auto']): string | null {
    const g = t.game!;
    // Hasard officiel : nouvelle graine secrète avant chaque action.
    const r = act({ ...g, seed: randomInt(2 ** 31), draws: 0 }, a);
    if ('error' in r) return r.error;
    t.game = r.state;
    t.version++;
    t.lastActivity = Date.now();
    const up: DmUpdate = { version: t.version, state: wire(r.state), events: r.state.events, by: m.id, action: a, animSeed: randomInt(2 ** 31), ...(gesture ? { gesture } : {}), ...(auto ? { auto } : {}) };
    // Le tour a changé : le serveur ne joue plus pour ce joueur.
    if (currentPlayer(r.state).id !== m.id || r.state.phase === 'fini') { if (t.autoOf === m.id) t.autoOf = null; }
    ns.to(t.code).emit('game:update', up);
    const pick = a.type === 'lancer' ? 0 : 0.6; // les autres voient d'abord les dés mis de côté
    schedule(t, Math.round(ANIM * (animUnits(r.state.events) + pick)));
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
    const minutes = (Date.now() - t.startedAt) / 60000;
    // Le pot : au gagnant s'il est encore là. S'il a quitté (le serveur jouait pour lui), il ne touche
    // rien : les joueurs restés récupèrent leur mise, les mises des partants sont perdues.
    let potTo: string | null = null;
    if (t.pot > 0) {
      const w = memberOf(t, g.winner!)!;
      if (!w.bot && !w.quit && w.userId) {
        potTo = w.userId;
        c.groschen.payWinner(t.ref, w.userId, t.pot);
        notice(t, `${w.name} emporte le pot : ${t.pot} Groschen !`);
      } else if (!w.bot) {
        c.groschen.refund(t.ref, inGame.filter((m) => !m.bot && !m.quit && m.userId).map((m) => m.userId!));
        notice(t, `${w.name} a quitté la table avant la fin : les joueurs restés récupèrent leur mise.`);
      } else {
        c.groschen.payWinner(t.ref, null, 0);
        notice(t, `${w.name} (ordinateur) gagne : les mises sont perdues.`);
      }
      for (const m of inGame) if (m.userId && m.socketId) sock(m.socketId)?.emit('groschen:balance', { balance: c.groschen.balance(m.userId) });
    }
    for (const m of inGame) {
      if (!m.userId) continue;
      const out = c.reward(m.userId, {
        won: g.winner === m.id, place: placeOf(g, m.id), players: g.players.length, humans, botLevels, minutes, day: c.groschen.today(), abandoned: !!m.quit,
        bestTurn: g.players.find((p) => p.id === m.id)?.best ?? 0, potWon: potTo === m.userId ? t.pot : 0,
      });
      if (out && m.socketId) sock(m.socketId)?.emit('profile:reward', { reward: out.reward, levelBefore: out.applied.levelBefore, levelAfter: out.applied.levelAfter, profile: out.applied.profile,
        bags: out.applied.bagsFound ?? 0, quests: (out.applied.questsDone ?? []).map((q) => q.text) } satisfies DmRewardMsg);
    }
  }

  // --- Présence (amis), invitations ---------------------------------------------------------------
  function presence(userId: string) {
    for (const t of tables.values()) {
      const m = t.members.find((x) => x.userId === userId && !x.left && x.socketId != null);
      if (!m) continue;
      const lobby = t.status === 'lobby';
      return {
        code: t.code, status: lobby ? 'salon' as const : 'partie' as const, joinable: lobby && seatsTaken(t) < DM_TABLE_MAX,
        watchable: !lobby && !t.solo && !!t.game && t.game.phase !== 'fini', game: 'courtisan' as const,
      };
    }
    return null;
  }

  function watchProblem(t: Table, userId: string | undefined): string | null {
    if (t.status !== 'playing' || !t.game) return 'Aucune partie en cours à cette table pour l’instant.';
    if (t.solo) return 'Partie contre l’ordinateur : elle ne se regarde pas.';
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
    // En partie, les joueurs partis peuvent revenir : la table reste (rangée par le ménage).
    if (t.status === 'playing' && t.game && t.game.phase !== 'fini') return;
    close(t);
  }
  function close(t: Table) {
    // Table rangée avant la fin de sa partie : les joueurs qui n'ont pas quitté récupèrent leur mise
    // (les partants l'ont perdue). Jamais de mise laissée bloquée.
    if (t.ref && t.game && t.game.phase !== 'fini' && !t.rewarded) {
      c.groschen.refund(t.ref, t.members.filter((m) => !m.bot && !m.quit && m.userId && t.players.includes(m.id)).map((m) => m.userId!));
      t.rewarded = true;
    }
    if (t.timer) clearTimeout(t.timer);
    if (t.quick?.timer) clearTimeout(t.quick.timer);
    for (const id of t.spectators.keys()) { const s = sock(id); s?.emit('spectate:closed', { text: 'La table a été fermée.' }); s?.leave(t.code); if (s) s.data.watch = null; }
    tables.delete(t.code);
  }

  // Ménage : tables sans personne depuis 10 minutes.
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
    const userOf = (p: any) => {
      const u = c.userFromToken(p?.auth);
      return u && !c.banOf(u.id) ? u : undefined;
    };
    const banned = (p: any) => { const u = c.userFromToken(p?.auth); return !!u && !!c.banOf(u.id); };
    const newMember = (p: any, name: string): Member => ({
      id: randomUUID(), token: randomUUID(), name, avatar: cleanAvatar(p?.avatar), ready: false, socketId: null, left: false,
      userId: userOf(p)?.id, day: '', dice: cleanDice(p?.dice),
    });
    const joined = (t: Table, m: Member) => ({ ok: true as const, code: t.code, playerId: m.id, token: m.token });

    socket.on('table:create', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      if (banned(p)) return reply({ ok: false, error: 'Votre compte est suspendu.' });
      const name = cleanName(p?.name);
      if (!name) return reply({ ok: false, error: 'Choisissez un nom' });
      const m = { ...newMember(p, name), ready: true };
      const stake = cleanStake(p?.stake);
      const problem = stakeProblem(m.userId, stake);
      if (problem) return reply({ ok: false, error: problem });
      const t = makeTable(m, `Table de ${name}`, cleanTarget(p?.target), p?.visibility === 'public' ? 'public' : 'private', stake);
      attach(t, m);
      reply(joined(t, m));
      broadcast(t);
    });

    function seatNew(t: Table, p: any): Ack<{ code: string; playerId: string; token: string }> {
      const name = cleanName(p?.name);
      if (!name) return { ok: false, error: 'Choisissez un nom' };
      const userId = userOf(p)?.id;
      if (t.status !== 'lobby') return { ok: false, error: 'La partie a déjà commencé.' };
      if (userId && t.kicked.has(userId)) return { ok: false, error: 'L’hôte vous a retiré de cette table.' };
      if (blockedAt(userId, t.members)) return { ok: false, error: 'Impossible de rejoindre cette table.' };
      if (t.solo) return { ok: false, error: 'Table introuvable. Vérifiez le code.' };
      const problem = stakeProblem(userId, t.stake);
      if (problem) return { ok: false, error: problem };
      const same = userId ? t.members.find((x) => x.userId === userId && !x.bot) : undefined;
      if (same) { attach(t, same); broadcast(t); return joined(t, same); }
      if (seatsTaken(t) >= DM_TABLE_MAX) return { ok: false, error: `La table est complète (${DM_TABLE_MAX} joueurs).` };
      let finalName = name;
      for (let k = 2; t.members.some((m) => m.name === finalName); k++) finalName = `${name} ${k}`;
      const m = { ...newMember(p, finalName), ready: !!t.quick };
      const filler = [...t.members].reverse().find((x) => x.filler);
      if (filler) t.members = t.members.filter((x) => x !== filler);
      else if (t.members.length >= DM_TABLE_MAX) { const bot = [...t.members].reverse().find((x) => x.bot); if (bot) t.members = t.members.filter((x) => x !== bot); }
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
      const code = cleanDmCode(p?.code);
      const t = code ? tables.get(code) : undefined;
      if (!t) return reply({ ok: false, error: 'Table introuvable. Vérifiez le code.' });
      // Reprise avec le jeton secret (rechargement, coupure, ou retour après avoir quitté).
      const existing = typeof p?.token === 'string' ? t.members.find((m) => m.token === p.token && !m.bot) : undefined;
      if (existing) {
        const running = t.status === 'playing' && !!t.game && t.game.phase !== 'fini' && t.players.includes(existing.id);
        if (existing.left) {
          if (!running) return reply({ ok: false, error: 'Cette partie est terminée.' });
          existing.left = false;
          notice(t, `${existing.name} revient à la table.`);
        } else if (existing.socketId == null) notice(t, `${existing.name} est de retour.`);
        existing.userId ??= userOf(p)?.id;
        attach(t, existing);
        reply(joined(t, existing));
        broadcast(t);
        if (t.game) socket.emit('game:state', snapshot(t));
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
      const name = cleanName(p?.name);
      if (!name) return reply({ ok: false, error: 'Choisissez un nom' });
      const userId = userOf(p)?.id;
      const humansAt = (t: Table) => t.members.filter((m) => !m.bot).length;
      const candidates = [...tables.values()].filter((t) => t.status === 'lobby' && t.visibility === 'public' && t.stake === 0 && !t.solo && seatsTaken(t) < DM_TABLE_MAX
        && t.members.some(humanHere) && !blockedAt(userId, t.members) && !(userId && t.kicked.has(userId)))
        .sort((a, b) => humansAt(b) - humansAt(a) || Number(!!b.quick) - Number(!!a.quick) || a.startedAt - b.startedAt);
      if (candidates.length) return reply(seatNew(candidates[0], p));
      const m = { ...newMember(p, name), ready: true };
      const t = makeTable(m, `Partie rapide de ${name}`, 4000, 'public');
      t.quick = { waitSince: Date.now(), fillAt: null, startAt: null, timer: null };
      attach(t, m);
      quickPlan(t);
      reply({ ...joined(t, m), created: true } as any);
      broadcast(t);
    });

    // Partie contre l'ordinateur AVEC mise : jouée par le serveur (dés tirés et coups vérifiés ici),
    // pour que personne ne puisse annoncer un faux résultat. Les ordinateurs misent la même somme.
    socket.on('table:solo', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const u = userOf(p);
      if (!u) return reply({ ok: false, error: 'Les parties avec mise demandent un compte.' });
      const stake = cleanStake(p?.stake);
      if (stake <= 0) return reply({ ok: false, error: 'Choisissez une mise.' });
      const problem = stakeProblem(u.id, stake);
      if (problem) return reply({ ok: false, error: problem });
      const m = { ...newMember(p, cleanName(p?.name) ?? u.username), ready: true };
      const t = makeTable(m, 'Contre l’ordinateur', cleanTarget(p?.target), 'private', stake);
      t.solo = true;
      const n = Math.min(3, Math.max(1, Math.floor(Number(p?.opponents) || 1)));
      const level = cleanLevel(p?.level);
      const names: { name: string; avatar: string }[] = Array.isArray(p?.bots) ? p.bots.slice(0, n).map((b: any) => ({ name: cleanName(b?.name) ?? '', avatar: typeof b?.avatar === 'string' ? b.avatar.slice(0, 8) : '🎲' })) : [];
      for (let i = 0; i < n; i++) {
        addBot(t, level);
        const b = t.members[t.members.length - 1];
        if (names[i]?.name) { b.name = names[i].name; b.avatar = names[i].avatar; }
      }
      attach(t, m);
      const err = startGame(t);
      if (err) { close(t); socket.data.code = null; return reply({ ok: false, error: err }); }
      reply(joined(t, m));
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
      if (x.t.members.length >= DM_TABLE_MAX) return reply({ ok: false, error: 'La table est complète.' });
      addBot(x.t, cleanLevel(p?.level));
      reply({ ok: true });
      quickPlan(x.t);
      broadcast(x.t);
    });
    socket.on('table:fill', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const x = hostOnly(reply);
      if (!x) return;
      const n = x.t.members.length;
      const added = fillWithBots(x.t, n < QUICK_TARGET ? QUICK_TARGET : n + 1, cleanLevel(p?.level));
      if (!added) return reply({ ok: false, error: 'La table est complète.' });
      reply({ ok: true });
      notice(x.t, `${added > 1 ? `${added} ordinateurs complètent` : 'Un ordinateur complète'} la table : un joueur qui arrive avant le départ prend la place d’un ordinateur.`);
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
      if (p?.ready && x.m.id !== x.t.hostId) { const problem = stakeProblem(x.m.userId, x.t.stake); if (problem) return reply({ ok: false, error: problem }); }
      x.m.ready = x.m.id === x.t.hostId ? true : !!p?.ready;
      reply({ ok: true });
      broadcast(x.t);
    });
    socket.on('table:config', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const x = hostOnly(reply);
      if (!x) return;
      if (p?.target !== undefined) x.t.target = cleanTarget(p.target);
      if (p?.visibility === 'public' || p?.visibility === 'private') x.t.visibility = p.visibility;
      if (p?.stake !== undefined) {
        const stake = cleanStake(p.stake);
        const problem = stakeProblem(x.m.userId, stake);
        if (problem) return reply({ ok: false, error: problem });
        if (x.t.quick && stake > 0) return reply({ ok: false, error: 'Pas de mise en partie rapide.' });
        x.t.stake = stake;
      }
      // Changer les réglages annule les « prêt » : chacun doit relire.
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
      const err = startGame(x.t);
      reply(err ? { ok: false, error: err } : { ok: true });
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
      t.pot = 0;
      t.ref = '';
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
      const a = cleanAction(p?.action);
      if (!a) return reply({ ok: false, error: 'Action invalide' });
      const prevAuto = t.autoOf;
      if (t.autoOf === m.id) t.autoOf = null; // le joueur reprend la main
      const err = apply(t, m, a, a.type !== 'encaisser' ? sanitizeGesture(p?.gesture) : undefined);
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
      const id = `dm${++chatSeq}-${randomInt(1e6)}`;
      c.recordChat({
        id, code: t.code, where: `Le Courtisan, table ${t.code}`, userId: uid ?? null, name: x ? x.m.name : spec!.name, text, at: now,
        audience: [...t.members.map((m) => m.userId), ...[...t.spectators.values()].map((s) => s.userId)].filter((v): v is string => !!v),
      });
      const account = uid ? c.publicInfo(uid)?.account ?? null : null;
      ns.to(t.code).emit('table:chat', x
        ? { id, playerId: x.m.id, name: x.m.name, account, text, at: now }
        : { id, playerId: `spectateur:${socket.id}`, name: spec!.name, account, text, at: now, spectator: true });
    });

    socket.on('spectate:join', (p: any, ack: unknown) => {
      const reply = safeAck(ack);
      const code = cleanDmCode(p?.code);
      const t = code ? tables.get(code) : undefined;
      if (!t) return reply({ ok: false, error: 'Partie introuvable. Elle est peut-être déjà terminée.' });
      if (ctx()) return reply({ ok: false, error: 'Quittez d’abord votre table pour regarder une partie.' });
      const u = userOf(p);
      if (socket.data.watch !== t.code || !t.spectators.has(socket.id)) {
        const problem = watchProblem(t, u?.id);
        if (problem) return reply({ ok: false, error: problem });
        unwatch();
        t.spectators.set(socket.id, { name: u?.username ?? cleanName(p?.name) ?? 'Spectateur', userId: u?.id });
        socket.data.watch = t.code;
        socket.join(t.code);
      }
      reply({ ok: true, code: t.code });
      broadcast(t);
      socket.emit('table:state', publicTable(t));
      if (t.game) socket.emit('game:state', snapshot(t));
    });
    socket.on('spectate:leave', (_p: unknown, ack: unknown) => { unwatch(); safeAck(ack)({ ok: true }); });

    /** Quitter : au salon, on libère la place ; en partie, le serveur joue pour vous (retour possible). */
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
      else if (running) {
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
        // Au salon : la place reste un moment (rechargement), l'hôte passe la main s'il ne revient pas.
        quickPlan(t);
        if (m.id === t.hostId) setTimeout(() => { if (m.socketId == null && t.hostId === m.id) { transferHost(t, `L’hôte ${m.name} est parti.`); broadcast(t); } }, 15_000);
      } else if (t.game && t.game.phase !== 'fini') {
        notice(t, `${m.name} s'est déconnecté.`, 'warning');
        if (currentPlayer(t.game).id === m.id || !t.members.some((y) => humanHere(y) && t.players.includes(y.id))) schedule(t, 0);
      }
      broadcast(t);
    });
  });

  return {
    presence,
    has: (code: string) => tables.has(code),
    /** Range une table tout de suite (ménage ; tests). */
    closeTable: (code: string) => { const t = tables.get(code); if (t) close(t); },
    status: (code: string) => tables.get(code)?.status ?? null,
    tables,
    close: () => { clearInterval(sweeper); for (const t of tables.values()) { if (t.timer) clearTimeout(t.timer); if (t.quick?.timer) clearTimeout(t.quick.timer); } },
  };
}

