/**
 * Patron de la semaine : un adversaire spécial, une particularité. La première victoire de la
 * semaine rapporte des pièces, un trophée et un titre. Le patron change chaque lundi.
 */
import type { GameConfig } from '../config';

export type BossLuck = 'baron' | 'dede' | 'simone' | null;
export interface BossDef {
  id: string;
  /** Personnage de l'ordinateur (voir client/src/game/personas.ts). */
  persona: string;
  name: string;
  twist: string;
  /** Règles de la partie contre ce patron (le reste : règles par défaut). */
  config: Partial<GameConfig>;
  /** Coup de pouce du patron sur ses propres dés. */
  luck: BossLuck;
  /** Adversaires supplémentaires (même personnage tiré au hasard). */
  sidekicks: number;
}

export const BOSSES: BossDef[] = [
  { id: 'baron', persona: 'baron', name: 'Le Baron', twist: 'Il a la main heureuse : ses dés tombent un peu plus souvent sur 4, 2 et 1.', config: {}, luck: 'baron', sidekicks: 0 },
  { id: 'josiane', persona: 'josiane', name: 'Josiane', twist: 'Elle joue depuis 1962 et n’attend personne : 10 secondes par décision.', config: { turnSeconds: 10 }, luck: null, sidekicks: 0 },
  { id: 'dede', persona: 'dede', name: 'Dédé', twist: 'Il a toujours un as dans la manche : son premier dé tombe souvent sur 1.', config: {}, luck: 'dede', sidekicks: 0 },
  { id: 'simone', persona: 'simone', name: 'Simone', twist: 'Ses dés aiment se ressembler : elle sort des brelans bien plus souvent.', config: {}, luck: 'simone', sidekicks: 0 },
  { id: 'gege', persona: 'gege', name: 'Gégé', twist: 'Il vient avec ses deux copains du PMU : trois contre un.', config: {}, luck: null, sidekicks: 2 },
  { id: 'lulu', persona: 'lulu', name: 'Lulu', twist: 'Partie éclair : 11 jetons, et la charge se joue en trois lancers.', config: { totalTokens: 11, chargeThrows: 3 }, luck: null, sidekicks: 0 },
];

/** Lundi de la semaine d'un jour (AAAA-MM-JJ) : identifiant de semaine. */
export function weekKey(day: string): string {
  const t = Date.parse(`${day}T12:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * 86400_000).toISOString().slice(0, 10);
}
export function bossOfWeek(day: string): BossDef {
  const weeks = Math.floor(Date.parse(`${weekKey(day)}T12:00:00Z`) / (7 * 86400_000));
  return BOSSES[((weeks % BOSSES.length) + BOSSES.length) % BOSSES.length];
}
export const BOSS_COINS = 300;

/** Dé « aidé » du patron : relance une fois un dé qui ne l'arrange pas. */
export function bossDie(luck: BossLuck, index: number, roll: () => number, rnd: () => number, others: number[]): number {
  const v = roll();
  if (luck === 'baron' && ![4, 2, 1].includes(v) && rnd() < 0.3) return roll();
  if (luck === 'dede' && index === 0 && v !== 1 && rnd() < 0.35) return 1;
  if (luck === 'simone' && others.length && !others.includes(v) && rnd() < 0.3) return others[Math.floor(rnd() * others.length)];
  return v;
}
