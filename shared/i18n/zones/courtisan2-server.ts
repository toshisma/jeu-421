/**
 * Le Courtisan (0.53 : mises contre les ordinateurs) : messages de server/dixmille-online.ts, traduits chez le joueur.
 * Branché par une ligne dans shared/i18n/server-texts.ts.
 */
import type { Foreign } from '../courtisan';

export const DM2_RULES: [RegExp, Record<Foreign, string>][] = [
  [/^Pas de mise contre un ordinateur Débutant : choisissez Habitué ou Fine fouine, ou jouez gratuitement\.$/, {
    en: 'No stakes against a Beginner computer: pick Regular or Sharp, or play for free.',
    de: 'Kein Einsatz gegen einen Anfänger-Computer: Wähle Stammgast oder Fuchs, oder spiel ohne Einsatz.',
    nl: 'Geen inzet tegen een Beginner-computer: kies Vaste klant of Sluwe vos, of speel gratis.',
  }],
  [/^Plafond du jour atteint : la part des ordinateurs n’est versée que jusqu’à (\S+) Groschen par jour\.$/, {
    en: 'Daily limit reached: the computers’ share is only paid up to $1 Groschen a day.',
    de: 'Tageslimit erreicht: Der Anteil der Computer wird nur bis $1 Groschen pro Tag ausgezahlt.',
    nl: 'Daglimiet bereikt: het deel van de computers wordt maar tot $1 Groschen per dag uitbetaald.',
  }],
];
