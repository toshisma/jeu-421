import type { rejeuFr } from './rejeu.fr';

/** Solopotjes die de server naspeelt: Nederlandse teksten, sleutels `rej.`. */
export const rejeuNl: Record<keyof typeof rejeuFr, string> = {
  "rej.update": "Vernieuw de pagina zodat dit potje volledig meetelt (alleen basisbeloning).",
  "rej.prepFailed": "De tafel kon niet klaargezet worden (trage verbinding?). Dit potje moet door de server gecontroleerd worden om mee te tellen.",
  "rej.retry": "Opnieuw proberen",
  "rej.back": "Terug",
  "rej.preparing": "De tafel wordt klaargezet…",
};
