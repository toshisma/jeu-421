/**
 * Récompense d'une partie du Poker menteur : le barème du 421 (pièces et XP selon la place, le nombre
 * d'adversaires, leur niveau et la durée réelle), comme Le Courtisan. Pas de monnaie propre ni de mise
 * (choix de départ : pas de nouvelle faille économique). Défis du jour « généraux », défis de fête,
 * statistiques du mode, succès, et avec une chance basse un sac de dés (même sac garanti que le 421).
 */
import type { Difficulty } from '../ai';
import { BAGS_MAX, BAG_PITY, applyPlainReward, bagChance, botTableRules, checkAchievements, rewardFor, type Profile, type Reward } from '../progress/profile';
import { applySummary } from '../progress/quests';
import { applyFetesGame } from '../progress/fetes';
import { randomFloat } from '../random';
import type { PmLevel } from './engine';
import { EMPTY_PM_STATS, type PmStats } from './stats';
export { EMPTY_PM_STATS, type PmStats } from './stats';

export const PM_DIFFICULTY: Record<PmLevel, Difficulty> = { debutant: 'facile', habitue: 'normal', fouine: 'difficile' };
/** Partie trop courte (mesurée par le serveur) : jamais de sac, elle ne compte pas pour le sac garanti. */
export const PM_BAG_MIN_MINUTES = 1.5;

/** Contre l'ordinateur (partie sur le téléphone, résultat annoncé) : barème du solo du 421. */
export function pokerReward(o: { won: boolean; place: number; opponents: number; level: PmLevel; minutes: number; day: string; now: number }): Reward {
  const opponents = Math.min(5, Math.max(1, Math.floor(o.opponents)));
  return rewardFor(o.won, 1, {
    mode: 'solo', opponents: Math.min(3, opponents), difficulty: PM_DIFFICULTY[o.level] ?? 'normal', count421: 0,
    place: o.won ? 1 : Math.min(opponents + 1, Math.max(2, Math.floor(o.place))), minutes: Math.max(0, o.minutes), day: o.day, now: o.now,
  });
}

/** En ligne (calculée par le serveur) : barème du 421 en ligne ; avec des ordinateurs, celui de leur niveau. */
export function pokerOnlineReward(o: { won: boolean; place: number; players: number; humans: number; botLevels: PmLevel[]; minutes: number; day: string; now: number }): Reward {
  const players = Math.min(6, Math.max(2, Math.floor(o.players)));
  const rules = botTableRules(Math.max(1, o.humans), o.botLevels.map((l) => PM_DIFFICULTY[l] ?? 'normal'));
  return rewardFor(o.won, 1, {
    ...rules, opponents: players - 1, count421: 0,
    place: o.won ? 1 : Math.min(players, Math.max(2, Math.floor(o.place))), minutes: Math.max(0, o.minutes), day: o.day, now: o.now,
  });
}

/** Ce que le serveur (ou le jeu, pour un invité) sait d'une partie terminée. */
export interface PmGameFacts {
  won: boolean;
  players: number;
  minutes: number;
  mode: 'solo' | 'online';
  level?: PmLevel;
  now?: number;
  /** Résultat annoncé par le téléphone : ne change pas la chance de sac (celle d'une défaite). */
  declared?: boolean;
  /** Faits relevés par le SERVEUR (seuls ceux-ci font avancer les succès « vérifiés »). */
  verified?: { online: boolean; botLevels: PmLevel[]; callsRight: number; bluffsPassed: number; pokerAs: number; livesLost: number };
}

const LEVEL_BIT: Record<PmLevel, number> = { debutant: 1, habitue: 2, fouine: 4 };

export function nextPmStats(prev: PmStats | undefined, won: boolean, f: PmGameFacts): PmStats {
  const st: PmStats = { ...EMPTY_PM_STATS, ...prev };
  const pm: PmStats = { ...st, games: st.games + 1, wins: st.wins + (won ? 1 : 0) };
  const v = f.declared ? undefined : f.verified;
  if (!v) return pm;
  const n = (x: number, max = 200) => Math.min(max, Math.max(0, Math.floor(x || 0)));
  pm.vGames++;
  pm.callsRight += n(v.callsRight);
  pm.bluffsPassed += n(v.bluffsPassed);
  pm.pokerAs += n(v.pokerAs, 10);
  if (won) {
    pm.vWins++;
    if (v.online) pm.onlineWins++;
    if (n(v.livesLost) === 0 && f.players >= 3) pm.flawless++;
    for (const l of v.botLevels) pm.beaten |= LEVEL_BIT[l] ?? 0;
    pm.streak = st.streak + 1;
    pm.bestStreak = Math.max(st.bestStreak, pm.streak);
  } else pm.streak = 0;
  return pm;
}

/** Sac de dés : règle du 421 (compteur commun), rien sous 1 min 30, résultat annoncé = défaite. */
export function pokerBagRoll(p: Profile, f: PmGameFacts, rng: () => number = randomFloat): { profile: Profile; found: number } {
  if (f.minutes < PM_BAG_MIN_MINUTES) return { profile: p, found: 0 };
  const won = f.won && !f.declared;
  const players = Math.min(6, Math.max(2, Math.floor(f.players)));
  const chance = bagChance({ won } as Reward, { mode: f.mode, opponents: players - 1, count421: 0, minutes: f.minutes });
  const pity = (p.pity ?? 0) + 1;
  const found = pity >= BAG_PITY || rng() < chance ? 1 : 0;
  return { profile: { ...p, pity: found ? 0 : pity, bags: Math.min(BAGS_MAX, (p.bags ?? 0) + found) }, found };
}

/** Fin d'une partie : récompense, défis du jour, statistiques, sac, défis de fête, succès. Serveur (comptes) et jeu (invités). */
export function applyPokerGame(p: Profile, r: Reward, day: string, f: PmGameFacts, rng: () => number = randomFloat) {
  const a = applyPlainReward(p, r, day);
  const { quests, completed } = applySummary(a.profile.quests, {
    won: r.won, mode: f.mode, difficulty: f.level ? PM_DIFFICULTY[f.level] : undefined, opponents: Math.max(1, Math.floor(f.players) - 1), combos: {}, gestureThrows: 0,
  }, day);
  const pm = nextPmStats(p.pm, r.won, f);
  const bag = pokerBagRoll({ ...a.profile, quests, pm }, f, rng);
  const fe = applyFetesGame(bag.profile, { game: 'pm', won: r.won }, day);
  const ach = checkAchievements(fe.profile, f.now);
  return {
    ...a, profile: ach.profile, bagsFound: bag.found, questsDone: completed.map((q) => ({ id: q.id, text: q.text })),
    achievementsDone: [...fe.done, ...ach.unlocked.map((x) => ({ id: x.id, icon: x.icon, name: x.name, coins: x.coins }))],
  };
}
