/**
 * Récompense d'une partie du Courtisan (Dix mille) : le barème du 421 (pièces et XP selon la place,
 * le nombre d'adversaires, leur niveau et la durée réelle), sans bonus propre. Pas de statistiques
 * du 421 (succès, album) : pièces, XP, pass, défis du jour « généraux » (jouer, gagner, en ligne…),
 * statistiques propres au Courtisan et, avec une chance basse, un sac de dés (mêmes sacs que le 421).
 */
import type { Difficulty } from '../ai';
import { BAGS_MAX, BAG_PITY, applyPlainReward, bagChance, botTableRules, checkAchievements, rewardFor, type Profile, type Reward } from '../progress/profile';
import { applySummary } from '../progress/quests';
import { applyFetesGame } from '../progress/fetes';
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
  return applyPlainReward(p, r, day);
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
  /** Heure (date des succès débloqués). */
  now?: number;
  /**
   * Résultat annoncé par le téléphone (partie gratuite contre l'ordinateur) : il ne change PAS la
   * chance de sac, qui est alors celle d'une défaite (seule la durée, mesurée par le serveur, compte).
   */
  declared?: boolean;
  /**
   * Exploits relevés par le SERVEUR pendant une partie qu'il a jouée lui-même (en ligne, ou contre
   * l'ordinateur à une table du serveur). Seuls ces faits font avancer les succès du Courtisan
   * (hors « victoires », qui comptent aussi la partie gratuite sur le téléphone).
   */
  verified?: {
    /** Au moins un autre joueur humain à la table. */
    online: boolean;
    target: number;
    /** « Raté » du joueur pendant la partie. */
    misses: number;
    /** Niveaux des ordinateurs assis à la table. */
    botLevels: DmLevel[];
    hotMax: number; six: number; straight: number; sixKind: number;
  };
}

const LEVEL_BIT: Record<DmLevel, number> = { debutant: 1, habitue: 2, fouine: 4 };

/** Statistiques du Courtisan après une partie (faits vérifiés seulement s'ils viennent du serveur). */
export function nextDmStats(prev: DmStats | undefined, won: boolean, f: DmGameFacts): DmStats {
  const st: DmStats = { ...EMPTY_DM_STATS, ...prev };
  const turn = Math.min(DM_TURN_MAX, Math.max(0, Math.floor(f.bestTurn ?? 0)));
  const pot = Math.max(0, Math.floor(f.potWon ?? 0));
  const dm: DmStats = {
    ...st, games: st.games + 1, wins: st.wins + (won ? 1 : 0),
    bestTurn: Math.max(st.bestTurn, turn), bestPot: Math.max(st.bestPot, pot), pots: st.pots + (pot > 0 ? 1 : 0),
  };
  const v = f.declared ? undefined : f.verified;
  if (!v) return dm;
  const n = (x: number) => Math.max(0, Math.floor(x || 0));
  dm.vGames++;
  dm.vBestTurn = Math.max(st.vBestTurn, turn);
  dm.hotMax = Math.max(st.hotMax, Math.min(50, n(v.hotMax)));
  dm.six += n(v.six); dm.straight += n(v.straight); dm.sixKind += n(v.sixKind);
  if (won) {
    dm.vWins++;
    if (v.online) dm.onlineWins++;
    if (v.target >= 4000 && n(v.misses) === 0) dm.cleanWins++;
    for (const l of v.botLevels) dm.beaten |= LEVEL_BIT[l] ?? 0;
    dm.streak = st.streak + 1;
    dm.bestStreak = Math.max(st.bestStreak, dm.streak);
  } else dm.streak = 0;
  return dm;
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
  const dm = nextDmStats(p.dm, r.won, f);
  const bag = dixMilleBagRoll({ ...a.profile, quests, dm }, f, rng);
  // Saint-Nicolas / fêtes : la partie compte pour les défis d'événement.
  const fe = applyFetesGame(bag.profile, { game: 'dm', won: r.won }, day);
  // Succès (ceux du Courtisan, et ceux du niveau atteint) : pièces versées tout de suite.
  const ach = checkAchievements(fe.profile, f.now);
  return {
    ...a, profile: ach.profile, bagsFound: bag.found, questsDone: completed.map((q) => ({ id: q.id, text: q.text })),
    achievementsDone: [...fe.done, ...ach.unlocked.map((x) => ({ id: x.id, icon: x.icon, name: x.name, coins: x.coins }))],
  };
}
