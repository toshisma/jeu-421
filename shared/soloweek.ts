/**
 * Classement solo de la semaine : les victoires contre l'ordinateur des quatre jeux (comptes seulement).
 * Barème et réglages communs au serveur (server/solo-week.ts) et à l'écran (client/src/ui/SoloWeek.tsx).
 *
 * Seules comptent les parties que le serveur a lui-même rejouées ou arbitrées (421, Courtisan, Poker
 * menteur, Coups Fourrés contre l'ordinateur) : jamais un résultat annoncé par le téléphone.
 */

export type SoloWeekGame = '421' | 'courtisan' | 'poker' | 'cf';
export const SOLO_WEEK_GAMES: readonly SoloWeekGame[] = ['421', 'courtisan', 'poker', 'cf'];

/** Points d'une victoire selon la difficulté (facile / moyen / difficile, quel que soit le jeu). */
export const SW_LEVEL_POINTS = [1, 2, 4] as const;
/** Au plus tant de points par jour : la régularité compte plus que l'acharnement. */
export const SW_DAILY_CAP = 30;
/** Récompenses du lundi (pièces) pour le podium… */
export const SW_PRIZES = [20, 10, 5] as const;
/** … seulement si au moins tant de joueurs ont marqué des points dans la semaine. */
export const SW_MIN_PLAYERS = 3;
/** Taille du classement affiché. */
export const SW_TOP = 20;

/** Rang de difficulté (0, 1, 2) d'un niveau d'ordinateur, quel que soit le jeu. */
export function swTier(level: string | null | undefined): 0 | 1 | 2 {
  switch (level) {
    case 'difficile': case 'fouine': case 'fine-fouine': return 2;
    case 'normal': case 'habitue': return 1;
    default: return 0;
  }
}

/** Points d'une victoire : difficulté, plus 1 par adversaire au-delà du premier (5 adversaires au plus). */
export function swPoints(level: string | null | undefined, opponents: number): number {
  const extra = Math.min(4, Math.max(0, Math.floor(opponents) - 1));
  return SW_LEVEL_POINTS[swTier(level)] + extra;
}

/** Ordre du classement : points, puis victoires, puis le premier arrivé à ce total. */
export function swSort<T extends { points: number; wins: number; lastAt: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.points - a.points || b.wins - a.wins || a.lastAt - b.lastAt);
}

export interface SoloWeekRow { rank: number; username: string; points: number; wins: number; me?: boolean; friend?: boolean }
export interface SoloWeekBoard {
  week: string;
  /** Fin de la semaine (lundi 0 h, heure de Bruxelles), en millisecondes. */
  endsAt: number;
  top: SoloWeekRow[];
  /** Mes amis et moi (classés entre nous, rang général affiché). */
  friends: SoloWeekRow[];
  me: { rank: number | null; points: number; wins: number; today: number } | null;
  players: number;
  /** Podium de la semaine passée. */
  last: { rank: number; username: string; points: number; coins: number }[];
}
