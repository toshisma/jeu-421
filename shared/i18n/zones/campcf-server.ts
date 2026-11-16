/**
 * Coups Fourrés, campagne « Les Comptoirs rivaux » : textes partis en français du serveur ou du code partagé
 * (refus au départ d'un comptoir, titres de quartier), traduits côté navigateur par translateServerText.
 */
import type { Lang } from '../index';
import { CCF_TITLES_FR } from '../../campaigns/cf';

type Foreign = Exclude<Lang, 'fr'>;
const TITLES: Record<string, Record<Foreign, string>> = {
  lilas: { en: 'Lilac Street figure', de: 'Original der Fliederstraße', nl: 'Bekend gezicht in de Seringenstraat' },
  halles: { en: 'Market Halls sharpshooter', de: 'Ass der Markthallen', nl: 'Scherpschutter van de Markthallen' },
  docks: { en: 'Terror of the Docks', de: 'Schrecken der Docks', nl: 'Schrik van de Dokken' },
  haute: { en: 'Master of Dirty Tricks', de: 'Meister der fiesen Tricks', nl: 'Meester van de Vuile Streken' },
};
export const CCF_SERVER_TITLES = TITLES;

export const CCF_RULES: [RegExp, Record<Foreign, string>][] = [
  [/^Comptoir inconnu\.$/, { en: 'Unknown bar.', de: 'Unbekannte Kneipe.', nl: 'Onbekende kroeg.' }],
  [/^Ce comptoir n’est pas encore ouvert\.$/, { en: 'This bar isn’t open yet.', de: 'Diese Kneipe ist noch nicht offen.', nl: 'Deze kroeg is nog niet open.' }],
];

/** Traduction d'un texte de la campagne, ou null s'il n'en est pas un. */
export function translateCcf(lang: Foreign, text: string): string | null {
  for (const [id, fr] of Object.entries(CCF_TITLES_FR)) if (text === fr) return TITLES[id]?.[lang] ?? null;
  for (const [re, t] of CCF_RULES) if (re.test(text)) return text.replace(re, t[lang]);
  return null;
}
