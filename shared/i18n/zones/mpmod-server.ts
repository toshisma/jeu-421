/**
 * Zone « mpmod » : messages du serveur (server/pm-mod.ts, server/messages.ts) traduits chez le joueur.
 * Branché par une ligne dans shared/i18n/server-texts.ts ; couverture vérifiée par tests/pm-mod.test.ts.
 */
import type { Foreign } from '../courtisan';

export const MPM_RULES: [RegExp, Record<Foreign, string>][] = [
  [/^La modération a fermé cette conversation\.$/, { en: 'The moderators have closed this conversation.', de: 'Die Moderation hat diese Unterhaltung geschlossen.', nl: 'De moderatie heeft dit gesprek gesloten.' }],
  [/^Vous avez déjà signalé cette conversation : l’équipe de modération va l’examiner\.$/, { en: 'You’ve already reported this conversation: the moderation team will review it.', de: 'Du hast diese Unterhaltung schon gemeldet: Das Moderationsteam prüft sie.', nl: 'Je hebt dit gesprek al gemeld: het moderatieteam bekijkt het.' }],
  [/^Aucun message dans cette conversation\.$/, { en: 'There are no messages in this conversation.', de: 'In dieser Unterhaltung gibt es keine Nachrichten.', nl: 'Er zijn geen berichten in dit gesprek.' }],
  [/^16 novembre 2026$/, { en: 'November 16, 2026', de: '16. November 2026', nl: '16 november 2026' }],
];
