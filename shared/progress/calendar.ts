/**
 * Calendrier de l'année : les petits rendez-vous qui complètent Saint-Nicolas et les fêtes
 * (shared/progress/fetes.ts), avec les mêmes mécanismes et les mêmes endroits d'affichage.
 *
 *  - Moments légers (une « édition » par an, gérée comme une fête par fetes.ts : un défi du jour,
 *    parfois un adversaire spécial, un petit décor du bac, une notification) :
 *      Chandeleur (2 février), Poisson d'avril (1er avril), Pâques (du vendredi au lundi de Pâques),
 *      Fête de la musique (21 juin), Nuit d'Halloween (31 octobre).
 *  - Galette des rois (3 au 15 janvier) : une fève se cache parfois dans un sac de dés ouvert pendant
 *    la période (tirage du serveur, 1 sac sur 12, une fois par compte et par an) : titre de l'année
 *    « Roi ou reine du 421 » et le dé « Fève ».
 *  - Tournoi du Réveillon : le tournoi programmé de 21 h le 31 décembre (shared/scheduled.ts).
 *
 * Gains volontairement bas (choix de Sam) : quelques pièces, un titre, un objet cosmétique.
 * Logique pure, jour de Bruxelles « AAAA-MM-JJ » passé en paramètre (horloge injectable dans les tests).
 */
import { easter } from './events';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

/** Dimanche de Pâques de l'année (AAAA-MM-JJ). */
export const easterSunday = (y: number): string => iso(easter(y));

export type LightId = 'chandeleur' | 'poisson' | 'paques' | 'musique' | 'halloween';
export interface LightMoment {
  id: LightId;
  icon: string;
  /** Période de l'année (dates incluses). */
  range: (y: number) => [string, string];
}
/** Par ordre de priorité (Pâques passe avant le poisson d'avril les années où ils tombent ensemble). */
export const LIGHT_MOMENTS: LightMoment[] = [
  { id: 'chandeleur', icon: '🥞', range: (y) => [`${y}-02-02`, `${y}-02-02`] },
  { id: 'paques', icon: '🥚', range: (y) => { const e = easter(y); return [iso(addDays(e, -2)), iso(addDays(e, 1))]; } },
  { id: 'poisson', icon: '🐟', range: (y) => [`${y}-04-01`, `${y}-04-01`] },
  { id: 'musique', icon: '🎶', range: (y) => [`${y}-06-21`, `${y}-06-21`] },
  { id: 'halloween', icon: '🎃', range: (y) => [`${y}-10-31`, `${y}-10-31`] },
];
export const LIGHT_IDS: readonly LightId[] = LIGHT_MOMENTS.map((m) => m.id);

/** Moment léger en cours ce jour-là. */
export function lightOf(day: string): { id: LightId; start: string; end: string } | null {
  const y = Number(day.slice(0, 4));
  for (const m of LIGHT_MOMENTS) {
    const [start, end] = m.range(y);
    if (day >= start && day <= end) return { id: m.id, start, end };
  }
  return null;
}
export const lightIcon = (id: string): string => LIGHT_MOMENTS.find((m) => m.id === id)?.icon ?? '🎉';

// ---------------------------------------------------------------------------------------------
// Galette des rois : la fève dans les sacs de dés

export const GALETTE_START = '01-03';
export const GALETTE_END = '01-15';
/** Une chance sur 12 par sac ouvert pendant la période. */
export const FEVE_CHANCE = 1 / 12;
export const FEVE_DIE = 'dice-feve';
/** Titre de l'année : « fete:galette-2027 ». */
export const feveTitle = (year: number) => `fete:galette-${year}`;

/** Période de la galette en cours (null sinon). */
export function galetteOf(day: string): { year: number; start: string; end: string } | null {
  const md = day.slice(5);
  if (md < GALETTE_START || md > GALETTE_END) return null;
  const y = Number(day.slice(0, 4));
  return { year: y, start: `${y}-${GALETTE_START}`, end: `${y}-${GALETTE_END}` };
}

interface FeveProfile { owned: string[]; titles?: string[]; feve?: number }
/**
 * Tirage de la fève à l'ouverture d'un sac (serveur seulement : les sacs s'ouvrent sur le serveur).
 * Indépendant du contenu du sac (qui reste du pur hasard). Une fois par compte et par an.
 */
export function drawFeve<P extends FeveProfile>(p: P, day: string, rng: () => number): { profile: P; year: number } | null {
  const g = galetteOf(day);
  if (!g || p.feve === g.year) return null;
  if (rng() >= FEVE_CHANCE) return null;
  const owned = p.owned.includes(FEVE_DIE) ? p.owned : [...p.owned, FEVE_DIE];
  const titles = [...new Set([...(p.titles ?? []), feveTitle(g.year)])];
  return { profile: { ...p, owned, titles, feve: g.year }, year: g.year };
}
