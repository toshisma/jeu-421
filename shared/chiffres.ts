/**
 * « Le 421 en chiffres » (page publique servie par le serveur, voir server/chiffres.ts) : ce qui est
 * calculé et non mesuré. Probabilité de chaque famille de combinaisons pour UN lancer des trois dés,
 * comptée sur les 216 tirages possibles avec le moteur du jeu (shared/combos.ts).
 */
import { evaluate, type ComboKind } from './combos';
import { DEFAULT_CONFIG } from './config';

/** Adresses de la page, par langue (pages générées par scripts/seo-chiffres-pages.mjs, remplies par le serveur). */
export const CHIFFRES_SLUGS = { fr: 'le-421-en-chiffres', en: '421-dice-game-statistics', de: '421-wuerfelspiel-statistik', nl: '421-dobbelspel-statistieken' } as const;
export type ChiffresLang = keyof typeof CHIFFRES_SLUGS;

/** Familles de combinaisons, de la meilleure à la plus faible (ordre d'affichage). */
export const ROLL_KINDS: readonly ComboKind[] = ['421', '111', '11x', 'brelan', 'suite', 'autre', 'nenette'];

/** Nombre de tirages (sur 216) donnant chaque famille, et la probabilité correspondante. */
export function theoreticalKinds(): Record<ComboKind, { ways: number; p: number }> {
  const ways = Object.fromEntries(ROLL_KINDS.map((k) => [k, 0])) as Record<ComboKind, number>;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) ways[evaluate([a, b, c], DEFAULT_CONFIG.values).kind]++;
  return Object.fromEntries(ROLL_KINDS.map((k) => [k, { ways: ways[k], p: ways[k] / 216 }])) as Record<ComboKind, { ways: number; p: number }>;
}

/**
 * Seuils d'affichage : en dessous, la page dit « pas encore assez de données » au lieu d'afficher
 * des pourcentages sans valeur (ou qui permettraient de reconnaître quelqu'un).
 */
export const CHIFFRES_MIN = {
  /** Parties d'un jeu : en dessous, « moins de N ». */
  games: 10,
  /** Lancers complets (trois dés lancés) avant de comparer fréquence réelle et théorie. */
  rolls: 1000,
  /** Joueurs d'un même pays pour qu'il apparaisse (les autres sont regroupés). */
  countryPlayers: 10,
  /** Joueurs dont le pays est connu, et nombre de pays affichables, pour montrer le bloc. */
  countryTotal: 50,
  countries: 3,
  /** Parties pour montrer les heures de pointe et les durées. */
  hours: 200,
  durations: 30,
} as const;
