/**
 * Zone « serie » : messages du serveur (server/notifs.ts) traduits chez le joueur. Les rappels push,
 * eux, sont écrits directement dans la langue de l'appareil (clés `ser.n.*`). Branché par une ligne
 * dans shared/i18n/server-texts.ts ; couverture vérifiée par tests/serie.test.ts.
 */
import type { Foreign } from '../courtisan';

export const SER_RULES: [RegExp, Record<Foreign, string>][] = [
  [/^Réglage inconnu\.$/, { en: 'Unknown setting.', de: 'Unbekannte Einstellung.', nl: 'Onbekende instelling.' }],
];
