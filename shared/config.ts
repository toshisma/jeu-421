/**
 * Configuration des règles. Le 421 a de nombreuses variantes : rien n'est figé dans le
 * moteur, tout passe par cet objet. La configuration par défaut est documentée dans le README.
 */
export type Variant = 'classique' | 'decharge' | 'manches';
export type TieRule = 'barrage' | 'premierPerd' | 'dernierPerd';
export type Direction = 'horaire' | 'antihoraire';
export type RolloffMode = 'figure' | 'addition';

export interface ComboValues {
  v421: number; // valeur du 4-2-1
  v111: number; // trois as
  suite: number; // suites 321, 432, 543, 654
  autre: number; // toute autre combinaison
  /** Si le perdant fait une nénette (2-2-1), il prend au minimum ce nombre de jetons. */
  nenetteMin: number;
  // Fixes et documentés : « deux as + x » (611 … 211) valent x ; un brelan (222 … 666) vaut la valeur de son dé.
}

export interface GameConfig {
  variant: Variant;
  /** Variante classique : nombre de jetons dans le pot au début de la charge. */
  totalTokens: number;
  /** Variante décharge seule : jetons distribués à chaque joueur au départ. */
  startTokens: number;
  /** Variante manches : nombre de manches jouées. */
  rounds: number;
  /** Nombre maximal de lancers par tour (le 1er lancer compte : 3 = 1 lancer + 2 relances). */
  maxThrows: number;
  /** Lancers autorisés pendant la charge (variante classique). */
  chargeThrows: number;
  /** Le premier joueur d'une manche fixe le nombre de lancers des suivants. */
  leaderSetsThrows: boolean;
  direction: Direction;
  /** Que faire quand plusieurs joueurs sont à égalité pour la plus mauvaise combinaison. */
  tieRule: TieRule;
  /** Barrage : on départage à la figure (combinaisons) ou à l'addition (total des trois dés). */
  rolloffMode: RolloffMode;
  /** Décharge : égalité pour la meilleure combinaison → barrage pour savoir qui donne, ou le premier à l'avoir faite donne. */
  bestTieRule: 'barrage' | 'premier';
  /** À combinaison égale, celui qui a utilisé le moins de lancers l'emporte. */
  fewerThrowsWins: boolean;
  /** Le perdant d'une manche commence la suivante (sinon on tourne d'un siège). */
  loserStarts: boolean;
  /** Temps pour jouer à chaque fois que c'est son tour (secondes, 0 = illimité). */
  turnSeconds: number;
  values: ComboValues;
}

export const DEFAULT_CONFIG: GameConfig = {
  variant: 'classique',
  totalTokens: 21,
  startTokens: 7,
  rounds: 5,
  maxThrows: 3,
  chargeThrows: 1,
  leaderSetsThrows: true,
  direction: 'horaire',
  tieRule: 'barrage',
  bestTieRule: 'barrage',
  fewerThrowsWins: false,
  loserStarts: true,
  turnSeconds: 30,
  rolloffMode: 'figure',
  values: { v421: 8, v111: 7, suite: 2, autre: 1, nenetteMin: 2 },
};

export const VARIANT_LABELS: Record<Variant, string> = {
  classique: 'Classique (charge puis décharge)',
  decharge: 'Décharge seule (jetons distribués)',
  manches: 'Aux points (nombre de manches fixe)',
};

export const TIE_LABELS: Record<TieRule, string> = {
  barrage: 'Barrage : les ex æquo relancent une fois',
  premierPerd: 'Le premier à avoir joué perd',
  dernierPerd: 'Le dernier à avoir joué perd',
};

export const TURN_CHOICES = [0, 10, 15, 20, 30, 45, 60, 90];

/** Formats prêts à jouer (modifiables ensuite règle par règle). */
export const MODES: { id: string; name: string; hint: string; patch: Partial<GameConfig> }[] = [
  { id: 'classique', name: 'Classique', hint: 'Charge puis décharge, 21 jetons, 30 s par décision.', patch: { variant: 'classique', totalTokens: 21, turnSeconds: 30 } },
  { id: 'blitz', name: 'Blitz', hint: '10 secondes par décision, 11 jetons : ça va vite.', patch: { variant: 'classique', totalTokens: 11, turnSeconds: 10 } },
  { id: 'mort-subite', name: 'Mort subite', hint: 'Une seule manche aux points, pour le plaisir : récompenses divisées par dix, et la partie ne compte ni pour les succès, ni pour les défis, ni pour la ligue.', patch: { variant: 'manches', rounds: 1, turnSeconds: 20 } },
];
/** Mort subite (une seule manche aux points) : récompenses symboliques, rien ne compte pour la progression. */
export const isSuddenDeath = (c: Pick<GameConfig, 'variant' | 'rounds'>) => c.variant === 'manches' && c.rounds <= 1;

export function modeOf(c: GameConfig): string | null {
  const m = MODES.find((x) => Object.entries(x.patch).every(([k, v]) => (c as unknown as Record<string, unknown>)[k] === v));
  return m?.id ?? null;
}

function int(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def;
  return Math.min(max, Math.max(min, n));
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return allowed.includes(v as T) ? (v as T) : def;
}

/** Valide et borne une configuration venant d'un client (jamais de confiance aveugle). */
export function sanitizeConfig(input: unknown): GameConfig {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const v = (i.values && typeof i.values === 'object' ? i.values : {}) as Record<string, unknown>;
  const d = DEFAULT_CONFIG;
  const maxThrows = int(i.maxThrows, 1, 5, d.maxThrows);
  return {
    variant: oneOf(i.variant, ['classique', 'decharge', 'manches'] as const, d.variant),
    totalTokens: int(i.totalTokens, 5, 99, d.totalTokens),
    startTokens: int(i.startTokens, 1, 30, d.startTokens),
    rounds: int(i.rounds, 1, 30, d.rounds),
    maxThrows,
    chargeThrows: int(i.chargeThrows, 1, maxThrows, Math.min(d.chargeThrows, maxThrows)),
    leaderSetsThrows: bool(i.leaderSetsThrows, d.leaderSetsThrows),
    direction: oneOf(i.direction, ['horaire', 'antihoraire'] as const, d.direction),
    tieRule: oneOf(i.tieRule, ['barrage', 'premierPerd', 'dernierPerd'] as const, d.tieRule),
    bestTieRule: oneOf(i.bestTieRule, ['barrage', 'premier'] as const, d.bestTieRule),
    rolloffMode: oneOf(i.rolloffMode, ['figure', 'addition'] as const, d.rolloffMode),
    fewerThrowsWins: bool(i.fewerThrowsWins, d.fewerThrowsWins),
    loserStarts: bool(i.loserStarts, d.loserStarts),
    turnSeconds: TURN_CHOICES.includes(i.turnSeconds as number) ? (i.turnSeconds as number) : d.turnSeconds,
    values: {
      v421: int(v.v421, 1, 50, d.values.v421),
      v111: int(v.v111, 1, 50, d.values.v111),
      suite: int(v.suite, 1, 50, d.values.suite),
      autre: int(v.autre, 1, 50, d.values.autre),
      nenetteMin: int(v.nenetteMin, 1, 50, d.values.nenetteMin),
    },
  };
}

/** Résumé lisible d'une configuration (écran des règles, salon). */
export function describeConfig(c: GameConfig): string[] {
  const lines: string[] = [VARIANT_LABELS[c.variant]];
  if (c.variant === 'classique') lines.push(`Pot de ${c.totalTokens} jetons ; ${c.chargeThrows} lancer(s) pendant la charge`);
  if (c.variant === 'decharge') lines.push(`${c.startTokens} jetons par joueur au départ`);
  if (c.variant === 'manches') lines.push(`${c.rounds} manches, chaque combinaison rapporte ses points`);
  lines.push(`Jusqu'à ${c.maxThrows} lancer(s) par tour${c.leaderSetsThrows ? ', limité par le premier joueur de la manche' : ''}`);
  lines.push(`Sens ${c.direction}, ${c.loserStarts ? 'le perdant commence la manche suivante' : 'on tourne d’un siège à chaque manche'}`);
  lines.push(c.turnSeconds ? `${c.turnSeconds} secondes pour jouer, sinon le jeu joue à votre place` : 'Pas de limite de temps');
  if (c.variant !== 'manches') lines.push(`Égalité pour la meilleure combinaison (décharge) : ${c.bestTieRule === 'barrage' ? 'barrage pour savoir qui donne' : 'le premier à l’avoir faite donne'}`);
  lines.push(`Égalité pour la dernière place : ${TIE_LABELS[c.tieRule]}${c.tieRule === 'barrage' ? (c.rolloffMode === 'addition' ? ', à l’addition (total des dés)' : ', à la figure') : ''}${c.fewerThrowsWins ? ' (le moins de lancers départage d’abord)' : ''}`);
  return lines;
}
