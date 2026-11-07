/**
 * Le Courtisan : le jeu de dés traditionnel du Dix mille (aussi appelé Farkle). Moteur de règles pur, partagé,
 * déterministe (graine). Aucune dépendance au rendu ni au réseau.
 *
 * Règles retenues :
 * - 6 dés. À chaque lancer, le joueur DOIT mettre de côté au moins un dé ou une combinaison qui
 *   rapporte (tous les dés mis de côté doivent rapporter), puis il relance les dés restants ou
 *   encaisse (les points du tour s'ajoutent à son score).
 * - Lancer sans aucun dé qui rapporte : « Raté ! », les points du tour sont perdus.
 * - Les 6 dés mis de côté en rapportant (« main pleine ») : on peut relancer les 6.
 * - Valeurs : 1 = 100, 5 = 50 ; trois dés identiques = valeur × 100 (trois 1 = 1 000) ; chaque dé
 *   identique en plus double (4 = ×2, 5 = ×4, 6 = ×8) ; suites 1-2-3-4-5 = 500, 2-3-4-5-6 = 750,
 *   1-2-3-4-5-6 = 1 500. Une combinaison doit être prise dans un seul lancer.
 * - Le premier qui atteint le score cible en encaissant gagne aussitôt.
 */
import { mulberry32 } from '../rng';

export const DM_DICE = 6;
/** Nombre de joueurs à une table (solo : 2 à 4 ; en ligne : 2 à 6). */
export const DM_MIN_PLAYERS = 2;
export const DM_MAX_PLAYERS = 6;
export const DM_TARGETS = [2000, 4000, 10000] as const;
export type DmTarget = (typeof DM_TARGETS)[number];
export type DmLevel = 'debutant' | 'habitue' | 'fouine';
export const DM_LEVELS: { v: DmLevel; label: string; hint: string }[] = [
  { v: 'debutant', label: 'Débutant', hint: 'Tente trop sa chance' },
  { v: 'habitue', label: 'Habitué', hint: 'Joue raisonnablement' },
  { v: 'fouine', label: 'Fine fouine', hint: 'Calcule ses risques' },
];

// ---------------------------------------------------------------------------------------------
// Valeurs

/** Valeur de N dés identiques (N ≥ 3) : valeur × 100 (1 000 pour les 1), doublée par dé en plus. */
export function kindValue(face: number, n: number): number {
  if (n < 3) return 0;
  return (face === 1 ? 1000 : face * 100) * 2 ** (n - 3);
}

export interface Part { kind: 'un' | 'cinq' | 'identiques' | 'suite'; dice: number[]; points: number; label: string }

const counts = (vals: number[]) => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const v of vals) c[v]++; return c; };

/**
 * Meilleure lecture d'un groupe de dés pris ensemble dans un même lancer : chaque dé doit
 * rapporter. Renvoie null si un dé ne rapporte rien (sélection refusée) ou si le groupe est vide.
 */
export function scoreParts(vals: number[]): { points: number; parts: Part[] } | null {
  if (!vals.length || vals.some((v) => !Number.isInteger(v) || v < 1 || v > 6)) return null;
  const best = solve(counts(vals));
  return best && best.points > 0 ? best : null;
}
export function scoreSelection(vals: number[]): number | null { return scoreParts(vals)?.points ?? null; }

function solve(c: number[]): { points: number; parts: Part[] } | null {
  const left = c.reduce((a, b) => a + b, 0);
  if (left === 0) return { points: 0, parts: [] };
  let best: { points: number; parts: Part[] } | null = null;
  const consider = (part: Part, next: number[]) => {
    const r = solve(next);
    if (r && (!best || r.points + part.points > best.points)) best = { points: r.points + part.points, parts: [part, ...r.parts] };
  };
  // Suites (dés distincts).
  const straights: [number[], number, string][] = [[[1, 2, 3, 4, 5, 6], 1500, 'Grande suite'], [[2, 3, 4, 5, 6], 750, 'Suite 2 à 6'], [[1, 2, 3, 4, 5], 500, 'Suite 1 à 5']];
  for (const [faces, pts, label] of straights) {
    if (faces.every((f) => c[f] > 0)) { const n = [...c]; for (const f of faces) n[f]--; consider({ kind: 'suite', dice: faces, points: pts, label }, n); }
  }
  // Dés identiques (3 ou plus : on prend tous les exemplaires, ou trois seulement).
  for (let f = 1; f <= 6; f++) {
    for (let k = c[f]; k >= 3; k--) {
      const n = [...c]; n[f] -= k;
      consider({ kind: 'identiques', dice: Array(k).fill(f), points: kindValue(f, k), label: `${k} × ${f}` }, n);
    }
  }
  // Dés seuls : 1 et 5.
  if (c[1] > 0) { const n = [...c]; n[1]--; consider({ kind: 'un', dice: [1], points: 100, label: '1' }, n); }
  if (c[5] > 0) { const n = [...c]; n[5]--; consider({ kind: 'cinq', dice: [5], points: 50, label: '5' }, n); }
  return best;
}

/** Le lancer contient-il au moins un dé ou une combinaison qui rapporte ? */
export function hasScoring(vals: number[]): boolean {
  const c = counts(vals);
  return c[1] > 0 || c[5] > 0 || c.some((n, f) => f > 0 && n >= 3);
}

/** Libellé lisible d'une combinaison (pour l'aide et le journal). */
export function partLabel(p: Part): string {
  if (p.kind === 'suite') return p.label;
  if (p.kind === 'identiques') return `${p.dice.length} × ${p.dice[0]}`;
  return p.kind === 'un' ? 'Un 1' : 'Un 5';
}

/**
 * Toutes les sélections valables d'un lancer (indices dans `vals`), une par groupe de valeurs
 * distinct, avec leurs points. Triées du plus de points au moins.
 */
export function validSelections(vals: number[]): { idx: number[]; points: number }[] {
  const seen = new Map<string, { idx: number[]; points: number }>();
  const n = vals.length;
  for (let m = 1; m < 1 << n; m++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) idx.push(i);
    const pick = idx.map((i) => vals[i]);
    const key = [...pick].sort().join('');
    if (seen.has(key)) continue;
    const pts = scoreSelection(pick);
    if (pts !== null) seen.set(key, { idx, points: pts });
  }
  return [...seen.values()].sort((a, b) => b.points - a.points || a.idx.length - b.idx.length);
}

/** Points maximum qu'on peut tirer d'un lancer (0 = raté). */
export function bestScore(vals: number[]): number {
  return validSelections(vals)[0]?.points ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Partie

export interface DmPlayer { id: string; name: string; score: number; bot?: DmLevel; misses: number; best: number }

export type DmEvent =
  | { kind: 'lancer'; playerId: string; dice: number[]; rolled: boolean[] }
  | { kind: 'rate'; playerId: string; lost: number }
  | { kind: 'main-pleine'; playerId: string; turn: number }
  | { kind: 'encaisse'; playerId: string; points: number; score: number }
  | { kind: 'gagne'; playerId: string; score: number };

export interface DmState {
  target: number;
  players: DmPlayer[];
  /** Joueur dont c'est le tour (indice). */
  current: number;
  /**
   * debut : le joueur doit lancer les 6 dés ; choisir : il met de côté puis relance ou encaisse ;
   * fini : partie terminée.
   */
  phase: 'debut' | 'choisir' | 'fini';
  /** Valeur des 6 dés (les dés mis de côté gardent la leur). */
  dice: number[];
  /** Dés mis de côté plus tôt dans ce tour (ils ne sont plus en jeu). */
  out: boolean[];
  /** Dés lancés au dernier lancer (en jeu). */
  rolled: boolean[];
  /** Points du tour déjà mis de côté (lancers précédents). */
  turnPoints: number;
  /** Groupes mis de côté pendant ce tour (pour l'affichage). */
  setAside: { dice: number[]; points: number }[];
  /** Tours joués (tous joueurs confondus) et lancers du tour. */
  turns: number;
  throws: number;
  winner: string | null;
  /** Graine et compteur : chaque lancer est reproductible. */
  seed: number;
  draws: number;
  /** Derniers événements (le contrôleur les lit pour animer). */
  events: DmEvent[];
}

export function newGame(players: { id: string; name: string; bot?: DmLevel }[], target: number, seed: number): DmState {
  if (players.length < DM_MIN_PLAYERS || players.length > DM_MAX_PLAYERS) throw new Error(`${DM_MIN_PLAYERS} à ${DM_MAX_PLAYERS} joueurs`);
  return {
    target, players: players.map((p) => ({ ...p, score: 0, misses: 0, best: 0 })), current: 0, phase: 'debut',
    dice: [1, 2, 3, 4, 5, 6], out: Array(DM_DICE).fill(false), rolled: Array(DM_DICE).fill(false),
    turnPoints: 0, setAside: [], turns: 0, throws: 0, winner: null, seed: seed >>> 0, draws: 0, events: [],
  };
}

export type DmAction = { type: 'lancer' } | { type: 'relancer'; pick: number[] } | { type: 'encaisser'; pick: number[] };

export function currentPlayer(s: DmState): DmPlayer { return s.players[s.current]; }
/** Indices des dés en jeu (lancés au dernier lancer, pas encore mis de côté). */
export function inPlay(s: DmState): number[] { return s.dice.map((_, i) => i).filter((i) => s.rolled[i] && !s.out[i]); }

/** Points d'une sélection d'indices (null si invalide : dé hors jeu, doublon, dé qui ne rapporte pas). */
export function pickPoints(s: DmState, pick: number[]): number | null {
  if (s.phase !== 'choisir' || !pick.length) return null;
  const live = new Set(inPlay(s));
  if (new Set(pick).size !== pick.length || pick.some((i) => !live.has(i))) return null;
  return scoreSelection(pick.map((i) => s.dice[i]));
}

/** Nombre de dés qu'on relancerait après cette sélection (6 en cas de main pleine). */
export function diceAfter(s: DmState, pick: number[]): number {
  const left = DM_DICE - s.out.filter(Boolean).length - pick.length;
  return left === 0 ? DM_DICE : left;
}

function draw(s: DmState): number {
  const r = mulberry32((s.seed ^ Math.imul(s.draws + 1, 0x9e3779b1)) >>> 0)();
  s.draws++;
  return 1 + Math.floor(r * 6);
}

/** Lance les dés qui ne sont pas mis de côté. Raté : le tour passe. */
function throwDice(s: DmState) {
  const p = currentPlayer(s);
  s.rolled = s.out.map((o) => !o);
  s.dice = s.dice.map((v, i) => (s.out[i] ? v : draw(s)));
  s.throws++;
  const live = inPlay(s).map((i) => s.dice[i]);
  s.events.push({ kind: 'lancer', playerId: p.id, dice: [...s.dice], rolled: [...s.rolled] });
  if (!hasScoring(live)) {
    s.events.push({ kind: 'rate', playerId: p.id, lost: s.turnPoints });
    p.misses++;
    nextTurn(s);
  } else s.phase = 'choisir';
}

function nextTurn(s: DmState) {
  s.current = (s.current + 1) % s.players.length;
  s.turnPoints = 0;
  s.setAside = [];
  s.throws = 0;
  s.turns++;
  s.phase = 'debut';
}

/**
 * Applique une action du joueur en cours. Renvoie le nouvel état (copie) ou une erreur.
 * Les événements produits par cette action sont dans `events` (remis à zéro à chaque action).
 */
export function act(prev: DmState, a: DmAction): { state: DmState } | { error: string } {
  if (prev.phase === 'fini') return { error: 'La partie est terminée.' };
  const s: DmState = structuredClone(prev);
  s.events = [];
  const p = currentPlayer(s);
  if (a.type === 'lancer') {
    if (s.phase !== 'debut') return { error: 'Mettez d’abord des dés de côté.' };
    s.out = Array(DM_DICE).fill(false);
    throwDice(s);
    return { state: s };
  }
  if (s.phase !== 'choisir') return { error: 'Lancez d’abord les dés.' };
  const pts = pickPoints(s, a.pick);
  if (pts === null) return { error: 'Chaque dé mis de côté doit rapporter des points.' };
  s.turnPoints += pts;
  s.setAside.push({ dice: a.pick.map((i) => s.dice[i]), points: pts });
  for (const i of a.pick) s.out[i] = true;
  if (a.type === 'encaisser') {
    p.score += s.turnPoints;
    p.best = Math.max(p.best, s.turnPoints);
    s.events.push({ kind: 'encaisse', playerId: p.id, points: s.turnPoints, score: p.score });
    if (p.score >= s.target) {
      s.winner = p.id;
      s.phase = 'fini';
      s.events.push({ kind: 'gagne', playerId: p.id, score: p.score });
      return { state: s };
    }
    nextTurn(s);
    return { state: s };
  }
  // Relancer : main pleine si les 6 dés sont de côté.
  if (s.out.every(Boolean)) {
    s.events.push({ kind: 'main-pleine', playerId: p.id, turn: s.turnPoints });
    s.out = Array(DM_DICE).fill(false);
  }
  throwDice(s);
  return { state: s };
}

/** Place d'un joueur en fin de partie (1 = le gagnant, puis selon le score). */
export function placeOf(s: DmState, id: string): number {
  return ranking(s).findIndex((p) => p.id === id) + 1 || s.players.length;
}

/** Classement final (score décroissant ; le gagnant d'abord). */
export function ranking(s: DmState): DmPlayer[] {
  return [...s.players].sort((a, b) => (b.id === s.winner ? 1 : 0) - (a.id === s.winner ? 1 : 0) || b.score - a.score);
}

/** Tableau d'aide : combinaisons et valeurs. */
export const DM_VALUES: { dice: number[]; label: string; points: number }[] = [
  { dice: [1], label: 'Un 1', points: 100 },
  { dice: [5], label: 'Un 5', points: 50 },
  { dice: [1, 1, 1], label: 'Trois 1', points: 1000 },
  { dice: [2, 2, 2], label: 'Trois 2', points: 200 },
  { dice: [3, 3, 3], label: 'Trois 3', points: 300 },
  { dice: [4, 4, 4], label: 'Trois 4', points: 400 },
  { dice: [5, 5, 5], label: 'Trois 5', points: 500 },
  { dice: [6, 6, 6], label: 'Trois 6', points: 600 },
  { dice: [1, 2, 3, 4, 5], label: 'Suite 1 à 5', points: 500 },
  { dice: [2, 3, 4, 5, 6], label: 'Suite 2 à 6', points: 750 },
  { dice: [1, 2, 3, 4, 5, 6], label: 'Grande suite', points: 1500 },
];
