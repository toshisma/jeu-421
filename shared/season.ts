/**
 * Saisons classées : un mois = une saison. Seules les parties en ligne entre joueurs humains
 * (au moins deux, pas de mort subite) comptent. Les points dépendent de la place parmi les humains.
 */
export interface Division { id: string; name: string; min: number; bags: number }
export const DIVISIONS: Division[] = [
  { id: 'comptoir', name: 'Comptoir', min: 0, bags: 0 },
  { id: 'terrasse', name: 'Terrasse', min: 100, bags: 1 },
  { id: 'salle', name: 'Salle', min: 250, bags: 2 },
  { id: 'arriere', name: 'Arrière-salle', min: 450, bags: 3 },
  { id: 'patron', name: 'Patron', min: 700, bags: 5 },
];
/** À partir de quelle division on reçoit le dé de saison, et un titre. */
export const SEASON_DIE_FROM = 'terrasse';
export const SEASON_TITLE_FROM = 'salle';
export const divisionOf = (points: number): Division => [...DIVISIONS].reverse().find((d) => points >= d.min)!;
export const divisionIndex = (id: string) => DIVISIONS.findIndex((d) => d.id === id);

/** Points gagnés ou perdus selon la place parmi les humains (1 = premier). */
export function seasonDelta(place: number, humans: number): number {
  if (humans < 2) return 0;
  const f = (humans - place) / (humans - 1); // 1 pour le premier, 0 pour le dernier
  return Math.round(-12 + f * (25 + 12 + 3 * (humans - 2)));
}
export const seasonOf = (day: string) => day.slice(0, 7);
/** Premier jour de la saison suivante (AAAA-MM-01). */
export function nextSeasonStart(season: string): string {
  const [y, m] = season.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
