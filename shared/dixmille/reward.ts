/**
 * Récompense d'une partie du Courtisan (Dix mille) : le barème du 421 (pièces et XP selon la place,
 * le nombre d'adversaires, leur niveau et la durée réelle), sans bonus propre. Pas de statistiques
 * du 421 (succès, album) : pièces, XP, pass, défis du jour « généraux » (jouer, gagner, en ligne…),
 * statistiques propres au Courtisan et, avec une chance basse, un sac de dés (mêmes sacs que le 421).
 */
import type { Difficulty } from '../ai';
import { BAGS_MAX, BAG_PITY, REWARDS, addSeasonPoints, bagChance, botTableRules, levelInfo, rewardFor, type Profile, type Reward } from '../progress/profile';
import { applySummary } from '../progress/quests';
import { randomFloat } from '../random';
import type { DmLevel } from './engine';
import { DM_TURN_MAX, EMPTY_DM_STATS, type DmStats } from './stats';
export { EMPTY_DM_STATS, type DmStats } from './stats';

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

// ---------------------------------------------------------------------------------------------
// Sacs de dés, défis du jour et statistiques du Courtisan

/** Partie trop courte (mesurée par le serveur) : jamais de sac, et elle ne compte pas pour le sac garanti. */
export const DM_BAG_MIN_MINUTES = 1.5;

/** Ce que le serveur (ou le jeu, pour un invité) sait d'une partie du Courtisan terminée. */
export interface DmGameFacts {
  won: boolean;
  /** Joueurs à la table (soi compris). */
  players: number;
  /** Durée réelle, mesurée par le serveur pour les comptes. */
  minutes: number;
  /** « solo » : contre l'ordinateur ; « online » : au moins deux humains. */
  mode: 'solo' | 'online';
  level?: DmLevel;
  /** Meilleur tour du joueur (statistique seulement). */
  bestTurn?: number;
  /** Pot emporté (Groschen). */
  potWon?: number;
  /**
   * Résultat annoncé par le téléphone (partie gratuite contre l'ordinateur) : il ne change PAS la
   * chance de sac, qui est alors celle d'une défaite (seule la durée, mesurée par le serveur, compte).
   */
  declared?: boolean;
}

/**
 * Sac de dés en fin de partie : la règle du 421 (même chance, même sac garanti au bout de 10
 * parties, compteur commun aux deux jeux), avec deux prudences en plus : une partie de moins de
 * 1 min 30 ne donne rien et ne compte pas ; un résultat annoncé par le téléphone compte comme une défaite.
 */
export function dixMilleBagRoll(p: Profile, f: DmGameFacts, rng: () => number = randomFloat): { profile: Profile; found: number } {
  if (f.minutes < DM_BAG_MIN_MINUTES) return { profile: p, found: 0 };
  const won = f.won && !f.declared;
  const players = Math.min(6, Math.max(2, Math.floor(f.players)));
  const chance = bagChance({ won } as Reward, { mode: f.mode, opponents: players - 1, count421: 0, minutes: f.minutes });
  const pity = (p.pity ?? 0) + 1;
  const found = pity >= BAG_PITY || rng() < chance ? 1 : 0;
  return { profile: { ...p, pity: found ? 0 : pity, bags: Math.min(BAGS_MAX, (p.bags ?? 0) + found) }, found };
}

/**
 * Fin d'une partie du Courtisan : récompense (pièces, XP, pass), défis du jour généraux, statistiques
 * du mode et sac de dés éventuel. Utilisé par le serveur (comptes) et par le jeu (invités).
 */
export function applyDixMilleGame(p: Profile, r: Reward, day: string, f: DmGameFacts, rng: () => number = randomFloat) {
  const a = applyDixMille(p, r, day);
  const { quests, completed } = applySummary(a.profile.quests, {
    won: r.won, mode: f.mode, difficulty: f.level ? DM_DIFFICULTY[f.level] : undefined, opponents: Math.max(1, Math.floor(f.players) - 1), combos: {}, gestureThrows: 0,
  }, day);
  const st = p.dm ?? EMPTY_DM_STATS;
  const dm: DmStats = {
    games: st.games + 1, wins: st.wins + (r.won ? 1 : 0),
    bestTurn: Math.max(st.bestTurn, Math.min(DM_TURN_MAX, Math.max(0, Math.floor(f.bestTurn ?? 0)))),
    bestPot: Math.max(st.bestPot, Math.max(0, Math.floor(f.potWon ?? 0))),
  };
  const bag = dixMilleBagRoll({ ...a.profile, quests, dm }, f, rng);
  return { ...a, profile: bag.profile, bagsFound: bag.found, questsDone: completed.map((q) => ({ id: q.id, text: q.text })) };
}
