/**
 * Poker menteur : les mains de poker aux dés (5 dés de poker : 9, 10, Valet, Dame, Roi, As).
 * Module pur, partagé (moteur, ordinateurs, serveur, écrans).
 *
 * Faces codées 0 à 5 : 0 = 9, 1 = 10, 2 = Valet, 3 = Dame, 4 = Roi, 5 = As.
 * Combinaisons, de la plus faible à la plus forte : Rien, Paire, Double paire, Brelan, Petite suite
 * (9 à Roi), Grande suite (10 à As), Full, Carré, Poker (5 dés identiques). Variante « sans suites » :
 * les deux suites n'existent pas (ce sont alors des « Rien »).
 *
 * Chaque main (multiensemble de 5 faces) a un rang unique dans un ordre total : il y a exactement
 * 252 mains différentes (C(10,5)) et deux mains de même rang sont la même main. Une annonce est
 * une main complète ; une annonce « partielle » (catégorie et valeurs qui comptent) vaut la plus
 * faible main de sa catégorie qui a ces valeurs (`lowestOf`).
 */

export const PM_FACES = 6;
export const PM_DICE = 5;
/** Faces : 9, 10, Valet, Dame, Roi, As. */
export const FACE_IDS = ['9', '10', 'V', 'D', 'R', 'A'] as const;

export const Cat = { Rien: 0, Paire: 1, DoublePaire: 2, Brelan: 3, PetiteSuite: 4, GrandeSuite: 5, Full: 6, Carre: 7, Poker: 8 } as const;
export type Cat = (typeof Cat)[keyof typeof Cat];
export const CATS: readonly Cat[] = [Cat.Rien, Cat.Paire, Cat.DoublePaire, Cat.Brelan, Cat.PetiteSuite, Cat.GrandeSuite, Cat.Full, Cat.Carre, Cat.Poker];
/** Identifiants des catégories (textes : `pm.cat.<id>`). */
export const CAT_IDS = ['rien', 'paire', 'doublepaire', 'brelan', 'petitesuite', 'grandesuite', 'full', 'carre', 'poker'] as const;
export type CatId = (typeof CAT_IDS)[number];

/** Nombre de valeurs « qui comptent » à choisir pour annoncer une main de cette catégorie (le reste est au plus bas). */
export const CAT_PICKS: Record<Cat, number> = { 0: 1, 1: 1, 2: 2, 3: 1, 4: 0, 5: 0, 6: 2, 7: 1, 8: 1 };

export interface Hand {
  cat: Cat;
  /** Valeurs de départage, de la plus importante à la moins importante. */
  key: number[];
  /** Les 5 faces, de la plus haute à la plus basse (forme canonique). */
  dice: number[];
}

const isFace = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < PM_FACES;
export const isDice = (v: unknown): v is number[] => Array.isArray(v) && v.length === PM_DICE && v.every(isFace);

export function countsOf(dice: readonly number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}
/** Clé d'un multiensemble (compte de chaque face en base 6) : identique pour deux mains égales. */
export const countsKey = (c: readonly number[]) => c.reduce((k, n, i) => k + n * 6 ** i, 0);
export const canon = (dice: readonly number[]) => [...dice].sort((a, b) => b - a);

/** Lit une main de 5 dés. */
export function evaluate(dice: readonly number[], noStraights = false): Hand {
  const c = countsOf(dice);
  const sorted = canon(dice);
  // Groupes : par nombre d'exemplaires décroissant, puis valeur décroissante.
  const groups = [...new Set(sorted)].sort((a, b) => c[b] - c[a] || b - a);
  const top = c[groups[0]];
  const second = groups.length > 1 ? c[groups[1]] : 0;
  if (top === 5) return { cat: Cat.Poker, key: [groups[0]], dice: sorted };
  if (top === 4) return { cat: Cat.Carre, key: [groups[0], groups[1]], dice: sorted };
  if (top === 3 && second === 2) return { cat: Cat.Full, key: [groups[0], groups[1]], dice: sorted };
  if (top === 1 && !noStraights) {
    if (c[5] === 0) return { cat: Cat.PetiteSuite, key: [], dice: sorted };
    if (c[0] === 0) return { cat: Cat.GrandeSuite, key: [], dice: sorted };
  }
  if (top === 3) return { cat: Cat.Brelan, key: groups, dice: sorted };
  if (top === 2 && second === 2) return { cat: Cat.DoublePaire, key: groups, dice: sorted };
  if (top === 2) return { cat: Cat.Paire, key: groups, dice: sorted };
  return { cat: Cat.Rien, key: sorted, dice: sorted };
}

/** Score comparable d'une main (plus grand = plus fort). */
export function handScore(h: Hand): number {
  let s: number = h.cat;
  for (let i = 0; i < 5; i++) s = s * 6 + (h.key[i] ?? 0);
  return s;
}
/** Compare deux mains de dés : négatif si a < b, 0 si égales, positif si a > b. */
export function compareDice(a: readonly number[], b: readonly number[], noStraights = false): number {
  return handScore(evaluate(a, noStraights)) - handScore(evaluate(b, noStraights));
}

// ---------------------------------------------------------------------------------------------
// Ordre total des 252 mains (une table par variante)

export interface HandTable {
  /** Les mains, de la plus faible (rang 0) à la plus forte. */
  hands: Hand[];
  /** Rang d'un multiensemble (par `countsKey`). */
  rankByKey: Map<number, number>;
}
const tables: (HandTable | null)[] = [null, null];

function allMultisets(): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === PM_DICE) { out.push([...acc]); return; }
    for (let v = start; v < PM_FACES; v++) { acc.push(v); rec(v, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

export function handTable(noStraights = false): HandTable {
  const i = noStraights ? 1 : 0;
  const cached = tables[i];
  if (cached) return cached;
  const hands = allMultisets().map((m) => evaluate(m, noStraights)).sort((a, b) => handScore(a) - handScore(b));
  const rankByKey = new Map<number, number>();
  hands.forEach((h, r) => rankByKey.set(countsKey(countsOf(h.dice)), r));
  const t = { hands, rankByKey };
  tables[i] = t;
  return t;
}
export const HAND_COUNT = 252;
export const TOP_RANK = HAND_COUNT - 1;

/** Rang (0 à 251) d'une main de 5 dés dans l'ordre total. */
export function rankOf(dice: readonly number[], noStraights = false): number {
  return handTable(noStraights).rankByKey.get(countsKey(countsOf(dice)))!;
}
/** La main d'un rang donné (5 faces, de la plus haute à la plus basse). */
export const handAt = (rank: number, noStraights = false): Hand => handTable(noStraights).hands[rank];
/** Main la plus haute du jeu : Poker d'As. */
export const TOP_HAND = [5, 5, 5, 5, 5];
export const isTop = (dice: readonly number[]) => dice.length === 5 && dice.every((d) => d === 5);

/** La main immédiatement supérieure (null après le Poker d'As). Sans annonce : la plus faible du jeu. */
export function nextHigher(dice: readonly number[] | null, noStraights = false): number[] | null {
  const r = dice ? rankOf(dice, noStraights) + 1 : 0;
  return r > TOP_RANK ? null : [...handAt(r, noStraights).dice];
}

/** Catégories qui existent dans la variante. */
export const catsOf = (noStraights = false): Cat[] => CATS.filter((c) => !noStraights || (c !== Cat.PetiteSuite && c !== Cat.GrandeSuite));

/**
 * Annonce « partielle » : la plus faible main d'une catégorie qui a ces valeurs principales
 * (`values` : dans l'ordre de `key`, par exemple [Roi, 10] pour « Full aux Rois par les 10 »).
 * Les dés d'accompagnement valent le minimum possible. null si cette main n'existe pas.
 */
export function lowestOf(cat: Cat, values: readonly number[], noStraights = false): number[] | null {
  const t = handTable(noStraights);
  const h = t.hands.find((x) => x.cat === cat && values.every((v, i) => x.key[i] === v));
  return h ? [...h.dice] : null;
}
/** Plus faible main de la catégorie STRICTEMENT au-dessus de `above` qui a ces valeurs (ou null). */
export function lowestAbove(cat: Cat, values: readonly number[], above: readonly number[] | null, noStraights = false): number[] | null {
  const t = handTable(noStraights);
  const min = above ? rankOf(above, noStraights) + 1 : 0;
  for (let r = min; r < HAND_COUNT; r++) {
    const x = t.hands[r];
    if (x.cat === cat && values.every((v, i) => x.key[i] === v)) return [...x.dice];
  }
  return null;
}

/**
 * Valeurs principales possibles d'une catégorie (pour le sélecteur d'annonce), chacune avec la plus
 * faible main au-dessus de l'annonce précédente (null : impossible, trop bas).
 */
export function claimOptions(cat: Cat, above: readonly number[] | null, noStraights = false): { values: number[]; dice: number[] }[] {
  const t = handTable(noStraights);
  const min = above ? rankOf(above, noStraights) + 1 : 0;
  const n = CAT_PICKS[cat];
  const seen = new Map<string, number[]>();
  for (let r = min; r < HAND_COUNT; r++) {
    const x = t.hands[r];
    if (x.cat !== cat) continue;
    const values = x.key.slice(0, n);
    const k = values.join(',');
    if (!seen.has(k)) seen.set(k, [...x.dice]);
  }
  return [...seen.entries()].map(([k, dice]) => ({ values: k ? k.split(',').map(Number) : [], dice }));
}

/** La main réelle est-elle au moins égale à l'annonce ? (« Menteur ! » perdu par celui qui crie si oui) */
export const meets = (actual: readonly number[], claim: readonly number[], noStraights = false) => rankOf(actual, noStraights) >= rankOf(claim, noStraights);

/** Dés « qui comptent » d'une main (ceux de ses groupes ; tous pour une suite) : les dés qui la font. */
export function coreDice(dice: readonly number[], noStraights = false): number[] {
  const h = evaluate(dice, noStraights);
  const c = countsOf(dice);
  if (h.cat === Cat.PetiteSuite || h.cat === Cat.GrandeSuite) return [...h.dice];
  if (h.cat === Cat.Rien) return [h.dice[0]];
  return h.dice.filter((d) => c[d] >= 2);
}
