/** Les Groschen, monnaie du Courtisan (monnaie de jeu, sans argent réel). */
export const GROSCHEN_DAILY = 20;
/** Mise la plus haute qu'on puisse taper (garde-fou). */
export const GROSCHEN_MAX_STAKE = 1_000_000;
/** Mise propre : entier de 0 (gratuit) à la limite ; tout le reste vaut 0. */
export function cleanStake(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= GROSCHEN_MAX_STAKE ? n : 0;
}
export const fmtGroschen = (n: number) => `${n.toLocaleString('fr-BE')} Groschen`;
