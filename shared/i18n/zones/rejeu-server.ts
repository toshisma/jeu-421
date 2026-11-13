/**
 * Parties solo rejouées par le serveur : textes français envoyés par le serveur (ligne de gains d'une
 * partie non vérifiée, refus du rejeu), traduits chez le joueur. Branché par une ligne dans server-texts.ts.
 */
import type { Foreign } from '../courtisan';
import { REJEU_ERRORS } from '../../rejeu/common';

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const R = (fr: string, t: Record<Foreign, string>): [RegExp, Record<Foreign, string>] => [new RegExp(`^${esc(fr)}$`), t];

export const REJEU_RULES: [RegExp, Record<Foreign, string>][] = [
  R('Mettez à jour la page pour que cette partie compte entièrement', { en: 'Refresh the page so this game fully counts', de: 'Lade die Seite neu, damit dieses Spiel voll zählt', nl: 'Vernieuw de pagina zodat dit potje volledig meetelt' }),
  R(REJEU_ERRORS.format, { en: 'Unreadable list of moves.', de: 'Unlesbare Liste von Zügen.', nl: 'Onleesbare lijst met zetten.' }),
  R(REJEU_ERRORS.tooLong, { en: 'Game too long to be checked.', de: 'Spiel zu lang zum Prüfen.', nl: 'Potje te lang om te controleren.' }),
  R(REJEU_ERRORS.illegal, { en: 'Impossible move in this game.', de: 'Unmöglicher Zug in diesem Spiel.', nl: 'Onmogelijke zet in dit potje.' }),
  R(REJEU_ERRORS.incomplete, { en: 'Unfinished game.', de: 'Unbeendetes Spiel.', nl: 'Onvoltooid potje.' }),
  R(REJEU_ERRORS.extra, { en: 'Extra moves after the end of your game.', de: 'Zusätzliche Züge nach dem Ende deines Spiels.', nl: 'Extra zetten na het einde van je potje.' }),
  R(REJEU_ERRORS.setup, { en: 'Unknown table.', de: 'Unbekannter Tisch.', nl: 'Onbekende tafel.' }),
];
