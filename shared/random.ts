/**
 * Dé équitable : hasard cryptographique (crypto.getRandomValues, disponible dans les navigateurs
 * et dans Node), avec rejet des valeurs qui fausseraient la répartition. Chaque face a donc
 * exactement une chance sur six, et aucun lancer ne dépend du précédent.
 * (2^32 = 6 × 715 827 882 + 4 : on rejette les 4 dernières valeurs.)
 */
const LIMIT = 4294967292;
export function fairDie(): number {
  const a = new Uint32Array(1);
  let v: number;
  do { globalThis.crypto.getRandomValues(a); v = a[0]; } while (v >= LIMIT);
  return 1 + (v % 6);
}
/** Graine d'animation (n'influence pas les résultats, seulement la trajectoire affichée). */
export const animationSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
/** Nombre au hasard dans [0, 1), cryptographique (tirages de sacs, chances de trouver un sac). */
export function randomFloat(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}
