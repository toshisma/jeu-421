/** Coups Fourrés : pièces et XP d'une partie (module léger, sans le catalogue des cartes). */
import { rewardFor, type Reward } from '../progress/profile';
import type { Difficulty } from '../ai';

/**
 * Pièces et XP d'une partie de Coups Fourrés (comptes, calculés par le serveur) : exactement le barème
 * du 421 (place, nombre de joueurs, durée réelle mesurée par le serveur), contre l'ordinateur au
 * barème du solo selon le niveau, en ligne au barème du 421 en ligne. Pas de bonus propre (ni 4-2-1).
 * Rien pour un abandon (le serveur n'appelle pas cette fonction dans ce cas).
 */
export const CF_LEVEL_DIFFICULTY: Record<CfLevelName, Difficulty> = { debutant: 'facile', habitue: 'normal', 'fine-fouine': 'difficile' };
type CfLevelName = 'debutant' | 'habitue' | 'fine-fouine';
export function cfCoinReward(o: { won: boolean; place: number; players: number; minutes: number; botLevel?: CfLevelName | null; day: string; now: number }): Reward {
  const players = Math.min(4, Math.max(2, Math.floor(o.players) || 2));
  const place = o.won ? 1 : Math.min(players, Math.max(2, Math.floor(o.place) || players));
  return rewardFor(o.won, 1, {
    ...(o.botLevel ? { mode: 'solo' as const, difficulty: CF_LEVEL_DIFFICULTY[o.botLevel] ?? 'normal' } : { mode: 'online' as const }),
    opponents: players - 1, count421: 0, place, minutes: Math.max(0, o.minutes || 0), day: o.day, now: o.now,
  });
}
