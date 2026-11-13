import type { rejeuFr } from './rejeu.fr';

/** Solopotjes die de server naspeelt: Nederlandse teksten, sleutels `rej.`. */
export const rejeuNl: Record<keyof typeof rejeuFr, string> = {
  "rej.update": "Vernieuw de pagina zodat dit potje volledig meetelt (alleen basisbeloning).",
  "rej.preparing": "De tafel wordt klaargezet…",
};
