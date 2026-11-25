/**
 * Le thème de la semaine : une rotation automatique et sans fin de 8 thèmes, un par semaine
 * (semaine du lundi, jour de Bruxelles : `weekKey` de shared/progress/boss.ts). Aucun travail d'admin.
 *
 * Un thème ne donne QUE des points en plus au classement solo de la semaine (shared/soloweek.ts,
 * server/solo-week.ts) : ni pièces, ni XP. Le plafond du jour (SW_DAILY_CAP) s'applique APRÈS le bonus,
 * donc la semaine reste bornée. Le serveur calcule tout, d'après des faits qu'il a lui-même établis
 * (parties rejouées ou arbitrées par lui) ; l'écran affiche seulement.
 *
 * Textes : zone i18n `thm.` (shared/i18n/zones/theme.*.ts) : `thm.t.<id>` (nom), `thm.r.<id>` (règle),
 * `thm.head.<id>` (ligne du fil d'actualité de l'accueil).
 */
import { weekKey } from './progress/boss';
import { swPoints, swTier, type SoloWeekGame } from './soloweek';

export type WeeklyThemeId = 'courtisan' | 'as' | 'poker' | 'tablees' | 'cf' | 'coriaces' | '421' | 'habitues';

/** Ce que le serveur sait d'une victoire (rien qui vienne du téléphone). */
export interface ThemeWin {
  game: SoloWeekGame;
  level: string | null | undefined;
  opponents: number;
  /** 421 rejoué par le serveur : le joueur a sorti un 4-2-1 ou trois as pendant la partie. */
  big?: boolean;
}

export interface WeeklyTheme {
  id: WeeklyThemeId;
  icon: string;
  /** Points EN PLUS des points normaux de la victoire (0 si le thème ne la concerne pas). */
  bonus: (w: ThemeWin) => number;
}

const doubled = (game: SoloWeekGame) => (w: ThemeWin) => (w.game === game ? swPoints(w.level, w.opponents) : 0);

/** Dans l'ordre de la rotation (la première semaine est celle du 30 novembre 2026). */
export const WEEKLY_THEMES: readonly WeeklyTheme[] = [
  // Victoire du Courtisan : points ×2.
  { id: 'courtisan', icon: '🎩', bonus: doubled('courtisan') },
  // Victoire au 421 (rejouée par le serveur) avec au moins un 4-2-1 ou trois as : +2.
  { id: 'as', icon: '🎯', bonus: (w) => (w.game === '421' && w.big ? 2 : 0) },
  // Victoire au Poker menteur : points ×2.
  { id: 'poker', icon: '🃏', bonus: doubled('poker') },
  // Tous les jeux : +1 par adversaire au-delà du premier (le bonus de table compte double).
  { id: 'tablees', icon: '👥', bonus: (w) => Math.min(4, Math.max(0, Math.floor(w.opponents) - 1)) },
  // Victoire aux Coups Fourrés : points ×2.
  { id: 'cf', icon: '🎴', bonus: doubled('cf') },
  // Tous les jeux : victoire contre l'ordinateur le plus fort : +2.
  { id: 'coriaces', icon: '💪', bonus: (w) => (swTier(w.level) === 2 ? 2 : 0) },
  // Victoire au 421 : points ×2.
  { id: '421', icon: '🎲', bonus: doubled('421') },
  // Tous les jeux : victoire contre l'ordinateur moyen : +1.
  { id: 'habitues', icon: '🍺', bonus: (w) => (swTier(w.level) === 1 ? 1 : 0) },
];

/** Première semaine à thème (lundi). Avant : pas de thème. */
export const THEMES_START = '2026-11-30';

/** Thème de la semaine qui contient `day` (AAAA-MM-JJ, jour de Bruxelles), ou null avant le lancement. */
export function weeklyTheme(day: string): WeeklyTheme | null {
  const week = weekKey(day);
  if (week < THEMES_START) return null;
  const n = Math.round((Date.parse(`${week}T12:00:00Z`) - Date.parse(`${THEMES_START}T12:00:00Z`)) / (7 * 86400_000));
  return WEEKLY_THEMES[n % WEEKLY_THEMES.length];
}

export const themeById = (id: string | null | undefined): WeeklyTheme | null => WEEKLY_THEMES.find((t) => t.id === id) ?? null;

/** Bonus du thème de la semaine de `day` pour cette victoire (0 sans thème ou hors thème). */
export function themeBonus(day: string, w: ThemeWin): { id: WeeklyThemeId; bonus: number } | null {
  const t = weeklyTheme(day);
  if (!t) return null;
  const bonus = Math.max(0, Math.floor(t.bonus(w)));
  return bonus > 0 ? { id: t.id, bonus } : null;
}

/** Ligne courte pour le fil d'actualité de l'accueil (clé i18n `thm.head.<id>`). */
export function weeklyThemeHeadline(day: string): { id: string; icon: string; key: string; params?: Record<string, string | number> } | null {
  const t = weeklyTheme(day);
  return t ? { id: `theme-${weekKey(day)}`, icon: t.icon, key: `thm.head.${t.id}` } : null;
}
