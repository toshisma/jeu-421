/**
 * La Route des Auberges (campagne du Courtisan) : textes partis en français du code partagé ou du serveur
 * (titres de chapitre, refus au départ d'une partie), traduits côté navigateur par translateServerText.
 */
import type { Lang } from '../index';
import { CDM_TITLES_FR } from '../../campaigns/dm';

type Foreign = Exclude<Lang, 'fr'>;
export const CDM_SERVER_TITLES: Record<string, Record<Foreign, string>> = {
  val: { en: 'Inn pilgrim', de: 'Gasthauspilger', nl: 'Herbergpelgrim' },
  coteaux: { en: 'Friend of the winegrowers', de: 'Freund der Winzer', nl: 'Vriend van de wijnboeren' },
  route: { en: 'King of the fair', de: 'König des Jahrmarkts', nl: 'Koning van de jaarmarkt' },
  cite: { en: 'Courtier of Montclair', de: 'Höfling von Montclair', nl: 'Hoveling van Montclair' },
};
const MESSAGES: Record<string, Record<Foreign, string>> = {
  'Cette auberge n’est pas encore ouverte pour vous.': { en: 'This inn isn’t open to you yet.', de: 'Dieses Gasthaus ist für dich noch nicht geöffnet.', nl: 'Deze herberg is nog niet open voor je.' },
  'Cette table n’est pas celle de l’auberge.': { en: 'This table doesn’t match the inn.', de: 'Dieser Tisch passt nicht zum Gasthaus.', nl: 'Deze tafel hoort niet bij de herberg.' },
};

/** Traduction d'un texte de la campagne du Courtisan, ou null s'il n'en est pas un. */
export function translateCdm(lang: Foreign, text: string): string | null {
  for (const [id, fr] of Object.entries(CDM_TITLES_FR)) if (text === fr) return CDM_SERVER_TITLES[id]?.[lang] ?? null;
  return MESSAGES[text]?.[lang] ?? null;
}
