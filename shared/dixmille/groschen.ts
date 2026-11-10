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
/**
 * Bonus de bienvenue (0.53, validé par Sam) : 100 Groschen au départ. Versé une seule fois par compte,
 * à la première visite du Courtisan, en plus du cadeau du jour : 80 + 20 = 100. Les comptes qui
 * avaient déjà reçu le départ de 20 reçoivent ces 80 une fois, à leur prochaine visite.
 */
export const GROSCHEN_WELCOME = 100;
export const GROSCHEN_WELCOME_EXTRA = GROSCHEN_WELCOME - GROSCHEN_DAILY;
/**
 * Contre les ordinateurs : un bon joueur bat souvent les niveaux faibles, et les ordinateurs misent des
 * Groschen qui n'appartiennent à personne. D'où deux garde-fous (0.53) :
 * - pas de mise à une table où un ordinateur Débutant est assis ;
 * - la part des ordinateurs dans un pot emporté est plafonnée à DM_BOT_GAIN_DAILY Groschen par jour et
 *   par compte (au-delà, le gagnant ne récupère que les mises des joueurs humains, dont la sienne).
 */
export const DM_BOT_GAIN_DAILY = 100;
export const DM_NO_STAKE_LEVEL = 'debutant';
