/**
 * Patron de la semaine : un adversaire spécial, une particularité. La première victoire de la
 * semaine rapporte des pièces, un trophée et un titre. Le patron change chaque lundi.
 */
import { DEFAULT_CONFIG, type GameConfig } from '../config';

export interface BossDef {
  id: string;
  /** Personnage de l'ordinateur (voir client/src/game/personas.ts). */
  persona: string;
  name: string;
  twist: string;
  /** Règles de la partie contre ce patron (le reste : règles par défaut). */
  config: Partial<GameConfig>;
  /** Adversaires supplémentaires (même personnage tiré au hasard). */
  sidekicks: number;
}

export const BOSSES: BossDef[] = [
  { id: 'baron', persona: 'baron', name: 'Le Baron', twist: 'Il joue gros : un 421 coûte 10 jetons au perdant.', config: { values: { ...DEFAULT_CONFIG.values, v421: 10 } }, sidekicks: 0 },
  { id: 'josiane', persona: 'josiane', name: 'Josiane', twist: 'Elle joue depuis 1962 et n’attend personne : 10 secondes par décision.', config: { turnSeconds: 10 }, sidekicks: 0 },
  { id: 'dede', persona: 'dede', name: 'Dédé', twist: 'Il n’aime pas traîner : deux lancers par tour seulement.', config: { maxThrows: 2 }, sidekicks: 0 },
  { id: 'simone', persona: 'simone', name: 'Simone', twist: 'Elle est pointilleuse : à égalité, celui qui a fait le moins de lancers gagne.', config: { fewerThrowsWins: true }, sidekicks: 0 },
  { id: 'gege', persona: 'gege', name: 'Gégé', twist: 'Il vient avec ses deux copains du PMU : trois contre un.', config: {}, sidekicks: 2 },
  { id: 'lulu', persona: 'lulu', name: 'Lulu', twist: 'Partie éclair : 11 jetons, et la charge se joue en trois lancers.', config: { totalTokens: 11, chargeThrows: 3 }, sidekicks: 0 },
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
export const BOSS_COINS = 100;

