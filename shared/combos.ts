import type { ComboValues, GameConfig } from './config';

export type ComboKind = '421' | '111' | '11x' | 'brelan' | 'suite' | 'nenette' | 'autre';

export interface Combo {
  kind: ComboKind;
  /** Dés triés par ordre décroissant. */
  dice: number[];
  /** Force comparable : plus c'est grand, meilleure est la combinaison. */
  rank: number;
  /** Nombre de jetons (ou points) que vaut la combinaison. */
  value: number;
  label: string;
}

/**
 * Ordre (du meilleur au moins bon) :
 * 421 > 111 > 611 > 511 > 411 > 311 > 211 > brelans 666…222 > suites 654…321
 * > autres combinaisons (comparées dé par dé, du plus fort au plus faible) > nénette 221.
 */
export function evaluate(dice: number[], v: ComboValues): Combo {
  const s = [...dice].sort((x, y) => y - x);
  const [a, b, c] = s;
  if (a === 4 && b === 2 && c === 1) return { kind: '421', dice: s, rank: 1000, value: v.v421, label: '421' };
  if (a === 1 && b === 1 && c === 1) return { kind: '111', dice: s, rank: 900, value: v.v111, label: 'Trois as' };
  if (b === 1 && c === 1) return { kind: '11x', dice: s, rank: 800 + a, value: a, label: `${a}-1-1 (deux as)` };
  if (a === b && b === c) return { kind: 'brelan', dice: s, rank: 700 + a, value: a, label: `Brelan de ${a}` };
  if (a - b === 1 && b - c === 1) return { kind: 'suite', dice: s, rank: 600 + a, value: v.suite, label: `Suite ${a}-${b}-${c}` };
  if (a === 2 && b === 2 && c === 1) return { kind: 'nenette', dice: s, rank: 0, value: v.autre, label: 'Nénette' };
  return { kind: 'autre', dice: s, rank: 100 + a * 36 + b * 6 + c, value: v.autre, label: `${a}-${b}-${c}` };
}

export interface Scored {
  combo: Combo;
  throws: number;
}

/** > 0 si a bat b, < 0 si b bat a, 0 en cas d'égalité parfaite. */
export function compareTurn(a: Scored, b: Scored, cfg: GameConfig): number {
  if (a.combo.rank !== b.combo.rank) return a.combo.rank - b.combo.rank;
  if (cfg.fewerThrowsWins && a.throws !== b.throws) return b.throws - a.throws;
  return 0;
}

// Distribution des rangs sur les 216 tirages possibles (utilisée par l'IA).
let ranks216: number[] | null = null;
function allRanks(): number[] {
  if (!ranks216) {
    ranks216 = [];
    const dv: ComboValues = { v421: 8, v111: 7, suite: 2, autre: 1, nenetteMin: 2 };
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) ranks216.push(evaluate([a, b, c], dv).rank);
    ranks216.sort((x, y) => x - y);
  }
  return ranks216;
}
/** Probabilité qu'un lancer unique de 3 dés donne un rang strictement inférieur à `rank`. */
export function singleThrowCdf(rank: number): number {
  const r = allRanks();
  let n = 0;
  while (n < r.length && r[n] < rank) n++;
  return n / r.length;
}

/** Tableau des combinaisons pour l'écran des règles. */
export function comboTable(v: ComboValues): { name: string; example: number[]; value: string }[] {
  return [
    { name: '4-2-1', example: [4, 2, 1], value: `${v.v421}` },
    { name: 'Trois as', example: [1, 1, 1], value: `${v.v111}` },
    { name: 'Deux as + x (611 … 211)', example: [6, 1, 1], value: 'valeur du 3e dé (6 à 2)' },
    { name: 'Brelan (666 … 222)', example: [5, 5, 5], value: 'valeur du dé (6 à 2)' },
    { name: 'Suite (654 … 321)', example: [5, 4, 3], value: `${v.suite}` },
    { name: 'Autre combinaison', example: [6, 5, 2], value: `${v.autre}` },
    { name: 'Nénette 2-2-1 (la plus faible)', example: [2, 2, 1], value: `${v.autre} (perdant : au moins ${v.nenetteMin})` },
  ];
}
