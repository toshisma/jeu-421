import type { Lang } from '../index';

/** Nouveautés traduites (la dernière version au moins) ; sans traduction : le texte français de shared/changelog.ts. */
export const CHANGELOG_I18N: Partial<Record<Lang, Record<string, { title: string; items: string[] }>>> = {
  en: { '0.51': { title: 'New help pages', items: ['New pages to discover the site and invite your friends: dice game with friends, online dice games, bistro game, Farkle, remote aperitif.'] } },
  de: { '0.51': { title: 'Neue Hilfeseiten', items: ['Neue Seiten, um die Website zu entdecken und Freunde einzuladen: Würfelspiel mit Freunden, Online-Würfelspiele, Kneipenspiel, Farkle, Aperitif aus der Ferne.'] } },
  nl: { '0.51': { title: 'Nieuwe hulppagina’s', items: ['Nieuwe pagina’s om de site te ontdekken en vrienden uit te nodigen: dobbelspel met vrienden, online dobbelspellen, cafégame, Farkle, aperitief op afstand.'] } },
};
