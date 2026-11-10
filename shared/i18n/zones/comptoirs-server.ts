/**
 * Tournée des comptoirs : textes partis en français du code partagé ou du serveur (titres de quartier),
 * traduits côté navigateur par translateServerText (shared/i18n/server-texts.ts).
 */
import type { Lang } from '../index';
import { TDC_TITLES_FR } from '../../progress/comptoirs';

type Foreign = Exclude<Lang, 'fr'>;
const TITLES: Record<string, Record<Foreign, string>> = {
  marche: { en: 'Market Square regular', de: 'Stammgast am Marktplatz', nl: 'Vaste klant van het Marktplein' },
  gare: { en: 'Bar-hopping traveller', de: 'Kneipenreisender', nl: 'Kroegreiziger' },
  boulevards: { en: 'King of the bars', de: 'König der Kneipen', nl: 'Koning van de kroegen' },
};
export const TDC_SERVER_TITLES = TITLES;

/** Traduction d'un texte de la Tournée, ou null s'il n'en est pas un. */
export function translateTdc(lang: Foreign, text: string): string | null {
  for (const [id, fr] of Object.entries(TDC_TITLES_FR)) if (text === fr) return TITLES[id]?.[lang] ?? null;
  return null;
}
