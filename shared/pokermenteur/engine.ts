/**
 * Poker menteur : moteur de règles pur, partagé, déterministe (graine). Aucune dépendance au rendu
 * ni au réseau. Règles de référence : version de comptoir à un seul gobelet qui passe de main en main.
 *
 * - Le joueur qui commence la manche secoue le gobelet (5 dés tirés), voit seul ses dés et annonce
 *   une main (vraie ou fausse) au joueur suivant. Au premier coup d'une manche, toute annonce est permise.
 * - Le suivant crie « Menteur ! » (on soulève : si la main réelle vaut au moins l'annonce, le crieur
 *   perd une vie, sinon l'annonceur) ou « Je crois » : il prend le gobelet, voit les dés, en relance
 *   UNE fois de 0 à 5 (positions de son choix), puis annonce une main STRICTEMENT supérieure.
 * - Après un « Poker d'As » (main la plus haute), le suivant ne peut que crier « Menteur ! ».
 * - Sans vie : éliminé. Le perdant (ou le suivant s'il est éliminé) commence la manche suivante.
 *   Le dernier en jeu gagne.
 *
 * Secret : `dice` n'est connu que du détenteur du gobelet. `viewFor` donne l'état vu par un joueur
 * (le serveur n'envoie que ça) ; les événements ne contiennent les valeurs des dés qu'à la révélation.
 */
import { mulberry32 } from '../rng';
import { PM_DICE, PM_FACES, canon, isDice, isTop, nextHigher, rankOf } from './hands';

export type PmLevel = 'debutant' | 'habitue' | 'fouine';
export const PM_LEVELS: PmLevel[] = ['debutant', 'habitue', 'fouine'];
export const PM_LIVES = [3, 5] as const;
export const PM_MIN_PLAYERS = 2;
export const PM_MAX_PLAYERS = 6;

export interface PmOptions { lives: number; noStraights: boolean }
export const DEFAULT_PM_OPTIONS: PmOptions = { lives: 3, noStraights: false };
export const cleanPmOptions = (v: any): PmOptions => ({
  lives: (PM_LIVES as readonly number[]).includes(Number(v?.lives)) ? Number(v.lives) : 3,
  noStraights: !!v?.noStraights,
});

export interface PmPlayer {
  id: string; name: string; bot?: PmLevel;
  lives: number;
  /** 0 : encore en jeu ; sinon ordre d'élimination (1 = premier éliminé). */
  out: number;
}
export interface PmClaim {
  /** La main annoncée (5 faces, de la plus haute à la plus basse). */
  hand: number[];
  by: string;
  /** Dés relancés juste avant cette annonce (-1 : premier coup de la manche, gobelet secoué). */
  rerolled: number;
  /** Annonce faite par le serveur pour ce joueur (temps écoulé, absent) : ne compte pas pour ses exploits. */
  auto?: true;
}
export interface PmReveal {
  round: number;
  dice: number[];
  claim: number[];
  /** Annonceur, crieur, perdant de la vie. */
  by: string; caller: string; loser: string;
  /** La main réelle valait au moins l'annonce. */
  truth: boolean;
}
export type PmEvent =
  | { kind: 'manche'; round: number; playerId: string }
  | { kind: 'secoue'; playerId: string }
  | { kind: 'annonce'; playerId: string; hand: number[] }
  | { kind: 'croit'; playerId: string }
  | { kind: 'relance'; playerId: string; positions: number[] }
  | { kind: 'menteur'; playerId: string }
  | { kind: 'revelation'; reveal: PmReveal }
  | { kind: 'vie'; playerId: string; lives: number }
  | { kind: 'elimine'; playerId: string }
  | { kind: 'fin'; winner: string };

export type PmPhase = 'annonce' | 'decision' | 'relance' | 'fini';
export interface PmState {
  players: PmPlayer[];
  options: PmOptions;
  round: number;
  phase: PmPhase;
  /** Joueur qui doit agir. */
  current: number;
  /** Détenteur du gobelet (celui qui a vu les dés en dernier). */
  holder: number;
  /** Les dés sous le gobelet (null dans la vue d'un joueur qui ne les voit pas). */
  dice: number[] | null;
  /** Dés relancés par le détenteur avant son annonce (-1 : gobelet secoué au début de la manche). */
  rerolled: number;
  /** Positions relancées par le détenteur (animation chez lui). */
  moved: number[];
  /** Annonces de la manche en cours (la dernière est celle à croire ou non). */
  claims: PmClaim[];
  lastReveal: PmReveal | null;
  winner: string | null;
  /** Décisions jouées (durée de la partie). */
  turns: number;
  outCount: number;
  seed: number;
  draws: number;
  /** Ce que la dernière action a produit (à animer). */
  events: PmEvent[];
}
export type PmAction =
  | { type: 'annoncer'; hand: number[]; /** Posé par le serveur seulement (coup automatique). */ auto?: true }
  | { type: 'menteur' }
  | { type: 'croire' }
  | { type: 'relancer'; pick: number[] };

const rollDie = (s: PmState) => {
  const r = mulberry32((s.seed ^ Math.imul(s.draws + 1, 0x9e3779b1)) >>> 0)();
  s.draws++;
  return Math.floor(r * PM_FACES);
};

export const alive = (s: PmState) => s.players.filter((p) => p.out === 0);
function nextAlive(s: PmState, from: number): number {
  for (let k = 1; k <= s.players.length; k++) {
    const i = (from + k) % s.players.length;
    if (s.players[i].out === 0) return i;
  }
  return from;
}
export const currentPlayer = (s: PmState) => s.players[s.current];
export const holderPlayer = (s: PmState) => s.players[s.holder];
export const lastClaim = (s: PmState): PmClaim | null => s.claims[s.claims.length - 1] ?? null;

function startRound(s: PmState, starter: number) {
  s.round++;
  s.current = starter;
  s.holder = starter;
  s.claims = [];
  s.phase = 'annonce';
  s.rerolled = -1;
  s.moved = [0, 1, 2, 3, 4];
  s.dice = Array.from({ length: PM_DICE }, () => rollDie(s));
  s.events.push({ kind: 'manche', round: s.round, playerId: s.players[starter].id }, { kind: 'secoue', playerId: s.players[starter].id });
}

export function newGame(players: { id: string; name: string; bot?: PmLevel }[], options: Partial<PmOptions>, seed: number): PmState {
  const opts = cleanPmOptions({ ...DEFAULT_PM_OPTIONS, ...options });
  const s: PmState = {
    players: players.map((p) => ({ id: p.id, name: p.name, ...(p.bot ? { bot: p.bot } : {}), lives: opts.lives, out: 0 })),
    options: opts, round: 0, phase: 'annonce', current: 0, holder: 0, dice: null, rerolled: -1, moved: [], claims: [], lastReveal: null,
    winner: null, turns: 0, outCount: 0, seed: seed >>> 0, draws: 0, events: [],
  };
  startRound(s, 0);
  return s;
}

const clone = (s: PmState): PmState => ({
  ...s, players: s.players.map((p) => ({ ...p })), claims: [...s.claims], dice: s.dice ? [...s.dice] : null, moved: [...s.moved], events: [],
});

/** Le joueur peut-il encore croire ? (non après un Poker d'As) */
export const canBelieve = (s: PmState) => s.phase === 'decision' && !!lastClaim(s) && !isTop(lastClaim(s)!.hand);

/** Applique une action du joueur dont c'est le tour. */
export function act(prev: PmState, a: PmAction): { state: PmState } | { error: string } {
  if (prev.phase === 'fini') return { error: 'La partie est terminée.' };
  const s = clone(prev);
  const me = s.players[s.current];
  const ns = s.options.noStraights;
  switch (a.type) {
    case 'annoncer': {
      if (s.phase !== 'annonce') return { error: 'Action invalide' };
      if (!isDice(a.hand)) return { error: 'Annonce invalide.' };
      const hand = canon(a.hand);
      const last = lastClaim(s);
      if (last && rankOf(hand, ns) <= rankOf(last.hand, ns)) return { error: 'Annoncez une main plus forte que la précédente.' };
      s.claims.push({ hand, by: me.id, rerolled: s.rerolled, ...(a.auto ? { auto: true as const } : {}) });
      s.events.push({ kind: 'annonce', playerId: me.id, hand });
      s.phase = 'decision';
      s.current = nextAlive(s, s.current);
      s.turns++;
      return { state: s };
    }
    case 'croire': {
      if (s.phase !== 'decision') return { error: 'Action invalide' };
      if (!canBelieve(s)) return { error: 'Après un Poker d’As, il faut crier « Menteur ! ».' };
      s.holder = s.current;
      s.phase = 'relance';
      s.moved = [];
      s.events.push({ kind: 'croit', playerId: me.id });
      return { state: s };
    }
    case 'relancer': {
      if (s.phase !== 'relance') return { error: 'Action invalide' };
      const pick = Array.isArray(a.pick) ? a.pick : null;
      if (!pick || pick.length > PM_DICE || new Set(pick).size !== pick.length || !pick.every((i) => Number.isInteger(i) && i >= 0 && i < PM_DICE)) return { error: 'Action invalide' };
      const positions = [...pick].sort((x, y) => x - y);
      for (const i of positions) s.dice![i] = rollDie(s);
      s.rerolled = positions.length;
      s.moved = positions;
      s.phase = 'annonce';
      s.events.push({ kind: 'relance', playerId: me.id, positions });
      return { state: s };
    }
    case 'menteur': {
      if (s.phase !== 'decision') return { error: 'Action invalide' };
      const claim = lastClaim(s)!;
      const announcer = s.players[s.holder];
      const truth = rankOf(s.dice!, ns) >= rankOf(claim.hand, ns);
      const loser = truth ? me : announcer;
      const reveal: PmReveal = { round: s.round, dice: [...s.dice!], claim: claim.hand, by: announcer.id, caller: me.id, loser: loser.id, truth };
      s.lastReveal = reveal;
      s.turns++;
      s.events.push({ kind: 'menteur', playerId: me.id }, { kind: 'revelation', reveal });
      loser.lives--;
      s.events.push({ kind: 'vie', playerId: loser.id, lives: loser.lives });
      if (loser.lives <= 0) {
        loser.lives = 0;
        loser.out = ++s.outCount;
        s.events.push({ kind: 'elimine', playerId: loser.id });
      }
      const left = alive(s);
      if (left.length <= 1) {
        s.phase = 'fini';
        s.winner = left[0]?.id ?? me.id;
        s.dice = null;
        s.claims = [];
        s.events.push({ kind: 'fin', winner: s.winner });
        return { state: s };
      }
      const li = s.players.indexOf(loser);
      startRound(s, loser.out === 0 ? li : nextAlive(s, li));
      return { state: s };
    }
  }
  return { error: 'Action invalide' };
}

/**
 * Coup joué par le serveur pour un joueur trop lent ou absent : il croit (sinon il crie menteur
 * après un Poker d'As), ne relance rien et annonce la main immédiatement supérieure (au premier
 * coup d'une manche : la main la plus faible du jeu, jamais sa main réelle, que l'annonce
 * automatique trahirait aux autres joueurs).
 */
export function timeoutAction(s: PmState): PmAction {
  if (s.phase === 'decision') return canBelieve(s) ? { type: 'croire' } : { type: 'menteur' };
  if (s.phase === 'relance') return { type: 'relancer', pick: [] };
  const last = lastClaim(s);
  const hand = nextHigher(last ? last.hand : null, s.options.noStraights);
  return { type: 'annoncer', hand: hand ?? [5, 5, 5, 5, 5] };
}

/** Le joueur voit-il les dés en ce moment ? (détenteur du gobelet) */
export const seesDice = (s: PmState, playerId: string | null) =>
  !!playerId && s.phase !== 'fini' && s.players[s.holder]?.id === playerId;

/** L'état tel qu'un joueur (ou un spectateur : null) a le droit de le voir : sans la graine, dés cachés sauf au détenteur. */
export function viewFor(s: PmState, playerId: string | null): PmState {
  const see = seesDice(s, playerId);
  return { ...s, seed: 0, draws: 0, dice: see && s.dice ? [...s.dice] : null, moved: see ? s.moved : [] };
}

/** Place finale (1 = gagnant ; ensuite les derniers éliminés d'abord). */
export function placeOf(s: PmState, id: string): number {
  const me = s.players.find((p) => p.id === id);
  if (!me) return s.players.length;
  if (s.winner === id || me.out === 0) return 1 + s.players.filter((p) => p.out === 0 && p.id !== id && s.winner === p.id).length;
  return 1 + s.players.filter((p) => p.out === 0 || p.out > me.out).length;
}
export function ranking(s: PmState): PmPlayer[] {
  return [...s.players].sort((a, b) => placeOf(s, a.id) - placeOf(s, b.id));
}
