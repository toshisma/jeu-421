/**
 * Parties contre l'ordinateur rejouées par le serveur (421, Le Courtisan, Poker menteur) — même principe
 * que Coups Fourrés (shared/cards/botmatch.ts) :
 *  1. au début, le serveur note la table (règles, adversaires, niveau) et donne une GRAINE ;
 *  2. tout le hasard de la partie (dés, décisions des ordinateurs) dérive de cette graine, avec les
 *     fonctions de ce dossier, identiques sur le téléphone et sur le serveur ;
 *  3. à la fin, le téléphone envoie seulement SES décisions (liste compacte) ;
 *  4. le serveur rejoue la partie avec le moteur partagé et calcule lui-même victoire, place et faits.
 * Le résultat annoncé par le téléphone n'est plus cru. Une partie que le serveur ne peut pas rejouer
 * (ancienne version du jeu en cache, liste refusée) ne donne que la récompense de base plafonnée.
 *
 * Délais de jeu (10 / 15 s dans certains bistrots) : le rejeu n'a pas d'horloge. Temps écoulé = le
 * téléphone joue le coup automatique (tout lancer, puis garder) et l'inscrit dans la liste comme une
 * décision ordinaire : c'est un coup permis, qui n'avantage jamais le joueur.
 */
import { mulberry32, type Rng } from '../rng';

/** Version du format des listes de décisions (changer en cas d'évolution incompatible). */
export const REJEU_VERSION = 1;

/** Mélange (graine, compteur, sel) en un entier 32 bits (murmur3, finaliseur). */
export function mix(seed: number, n: number, salt: number): number {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
/** Tirage pseudo-aléatoire rejouable, propre à un moment de la partie. */
export const streamAt = (seed: number, n: number, salt: number): Rng => mulberry32(mix(seed, n, salt));

/** Graine valable (entier 32 bits non signé). */
export const isSeed = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;

/** Identifiant d'adversaire raisonnable (personnage) : lettres, chiffres, tirets. */
export const isPersonaId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v);

/** Comparaison stable de deux objets simples (clés triées). */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** Résultat d'un rejeu : faits calculés par le moteur, ou raison du refus. */
export type ReplayResult<F> = { ok: true; facts: F } | { ok: false; error: string };

/** Messages de refus (français : le serveur les envoie tels quels, traduits chez le joueur). */
export const REJEU_ERRORS = {
  format: 'Liste de décisions illisible.',
  tooLong: 'Partie trop longue pour être vérifiée.',
  illegal: 'Décision impossible dans cette partie.',
  incomplete: 'Partie inachevée.',
  extra: 'Décisions en trop après la fin de votre partie.',
  setup: 'Table inconnue.',
} as const;
