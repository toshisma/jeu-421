/**
 * Partie express : un nouveau visiteur joue en quelques secondes.
 *  - bouton « Lancer les dés » de l'accueil : une partie de 421 contre UN ordinateur, réglages par défaut ;
 *  - liens directs des pages d'aide : `/?jouer=1` (421), `/?jouer=courtisan`, `/?jouer=cartes`
 *    (partie contre l'ordinateur du mode) et `/?jouer=amis` (création d'une table entre amis).
 *    `&lang=xx` est lu à part (langue), comme partout ailleurs.
 */
import type { Difficulty } from '../../shared/ai';

export type QuickGame = '421' | 'courtisan' | 'cartes' | 'amis';

/** Lien direct `?jouer=…` (null : aucun). Valeurs inconnues : le 421, le jeu du site. */
export function jouerParam(search: string): QuickGame | null {
  const q = new URLSearchParams(search);
  if (!q.has('jouer')) return null;
  const v = (q.get('jouer') ?? '').trim().toLowerCase();
  if (/^(courtisan|dix-?mille|farkle)$/.test(v)) return 'courtisan';
  if (/^(cartes|coups-fourres|cf)$/.test(v)) return 'cartes';
  if (/^(amis|table)$/.test(v)) return 'amis';
  return '421';
}

/** Niveau de l'ordinateur pour une partie express : facile pour les 3 premières parties, ensuite le réglage du joueur. */
export function quickDifficulty(played: number, chosen: Difficulty): Difficulty {
  return played < 3 ? 'facile' : chosen;
}

/** L'accueil met le bouton « Lancer les dés » en avant tant que le joueur débute (moins de 3 parties de 421). */
export const showQuickPlay = (played: number) => played < 3;
