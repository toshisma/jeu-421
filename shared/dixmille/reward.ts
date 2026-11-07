/**
 * Récompense d'une partie du Courtisan (Dix mille) contre l'ordinateur : le barème du solo du 421 (pièces et XP
 * selon la place, le nombre d'adversaires, leur niveau et la durée réelle), sans bonus propre.
 * Pas de sac de dés, pas de statistiques du 421 (succès, défis) : seulement pièces, XP et pass.
 */
import type { Difficulty } from '../ai';
import { REWARDS, addSeasonPoints, botTableRules, levelInfo, rewardFor, type Profile, type Reward } from '../progress/profile';
import type { DmLevel } from './engine';

export const DM_DIFFICULTY: Record<DmLevel, Difficulty> = { debutant: 'facile', habitue: 'normal', fouine: 'difficile' };

export function dixMilleReward(o: { won: boolean; place: number; opponents: number; level: DmLevel; minutes: number; day: string; now: number }): Reward {
  const opponents = Math.min(3, Math.max(1, Math.floor(o.opponents)));
  return rewardFor(o.won, 1, {
    mode: 'solo', opponents, difficulty: DM_DIFFICULTY[o.level] ?? 'normal', count421: 0,
    place: o.won ? 1 : Math.min(opponents + 1, Math.max(2, Math.floor(o.place))), minutes: Math.max(0, o.minutes), day: o.day, now: o.now,
  });
}

/** Ajoute la récompense au profil : pièces, XP (et bonus de niveau), points du pass. */
export function applyDixMille(p: Profile, r: Reward, day: string): { profile: Profile; levelBefore: number; levelAfter: number; levelBonusCoins: number } {
  const levelBefore = levelInfo(p.xp).level;
  const xp = p.xp + r.xp;
  const levelAfter = levelInfo(xp).level;
  let levelBonusCoins = 0;
  for (let l = levelBefore + 1; l <= levelAfter; l++) levelBonusCoins += REWARDS.levelBonus(l);
  const profile = addSeasonPoints({ ...p, xp, coins: p.coins + r.coins + levelBonusCoins }, r.xp, day);
  return { profile, levelBefore, levelAfter, levelBonusCoins };
}

/**
 * Récompense d'une partie du Courtisan EN LIGNE (calculée par le serveur pour les comptes) : le
 * barème du 421 en ligne, selon la place et le nombre de joueurs. Avec des ordinateurs à la table,
 * comme au 421 : barème du niveau des ordinateurs (et plafond quotidien des parties contre
 * l'ordinateur, appliqué par le serveur). Égalité : chaque ex æquo compte comme gagnant.
 */
export function dixMilleOnlineReward(o: { won: boolean; place: number; players: number; humans: number; botLevels: DmLevel[]; minutes: number; day: string; now: number }): Reward {
  const players = Math.min(6, Math.max(2, Math.floor(o.players)));
  const rules = botTableRules(Math.max(1, o.humans), o.botLevels.map((l) => DM_DIFFICULTY[l] ?? 'normal'));
  return rewardFor(o.won, 1, {
    ...rules, opponents: players - 1, count421: 0,
    place: o.won ? 1 : Math.min(players, Math.max(2, Math.floor(o.place))), minutes: Math.max(0, o.minutes), day: o.day, now: o.now,
  });
}
