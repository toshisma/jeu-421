/**
 * Campagne du Poker menteur « Les Arrière-salles » : titres de chapitre partis en français du code partagé
 * (profil, titres affichés), traduits côté navigateur par translateServerText (shared/i18n/server-texts.ts).
 */
import type { Lang } from '../index';
import { CPM_TITLES_FR } from '../../campaigns/pm';

type Foreign = Exclude<Lang, 'fr'>;
export const CPM_SERVER_TITLES: Record<string, Record<Foreign, string>> = {
  arriere: { en: 'Back-room regular', de: 'Stammgast der Hinterzimmer', nl: 'Vaste klant van de achterkamers' },
  cabaret: { en: 'Cabaret bluffer', de: 'Kabarett-Bluffer', nl: 'Cabaretblufferd' },
  docks: { en: 'Dockside wolf', de: 'Hafenwolf', nl: 'Havenwolf' },
  cercle: { en: 'Master of the cup', de: 'Meister des Bechers', nl: 'Meester van de beker' },
};

/** Traduction d'un texte de la campagne, ou null s'il n'en est pas un. */
export function translateCpm(lang: Foreign, text: string): string | null {
  for (const [id, fr] of Object.entries(CPM_TITLES_FR)) if (text === fr) return CPM_SERVER_TITLES[id]?.[lang] ?? null;
  return null;
}
