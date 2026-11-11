/**
 * Poker menteur : messages du serveur (server/pokermenteur-online.ts, moteur, comptes), traduits chez
 * le joueur. Branché par une ligne dans shared/i18n/server-texts.ts ; couverture vérifiée par tests/i18n-poker.test.ts.
 */
import type { Foreign } from '../courtisan';

export const PM_RULES: [RegExp, Record<Foreign, string>][] = [
  [/^Annonce invalide\.$/, { en: 'Invalid call.', de: 'Ungültige Ansage.', nl: 'Ongeldige hand.' }],
  [/^Annoncez une main plus forte que la précédente\.$/, { en: 'Call a hand better than the previous one.', de: 'Sag eine bessere Hand als die vorige an.', nl: 'Roep een betere hand dan de vorige.' }],
  [/^Après un Poker d’As, il faut crier « Menteur ! »\.$/, { en: 'After Five Aces, you have to shout “Liar!”.', de: 'Nach fünf Assen musst du „Lügner!“ rufen.', nl: 'Na vijf azen moet je ‘Leugenaar!’ roepen.' }],
  [/^(.+) vous invite au Poker menteur$/, { en: '$1 invites you to Liar’s Dice', de: '$1 lädt dich zum Lügenpoker ein', nl: '$1 nodigt je uit voor Blufpoker' }],
  [/^Un gobelet vous attend : touchez pour rejoindre la table\.$/, { en: 'A cup is waiting: tap to join the table.', de: 'Ein Becher wartet: Tippe, um dich an den Tisch zu setzen.', nl: 'Er wacht een beker: tik om aan tafel te gaan.' }],
  [/^🃏 (.+) a remporté une partie de Poker menteur$/, { en: '🃏 $1 won a game of Liar’s Dice', de: '🃏 $1 hat ein Spiel Lügenpoker gewonnen', nl: '🃏 $1 won een potje Blufpoker' }],
];
