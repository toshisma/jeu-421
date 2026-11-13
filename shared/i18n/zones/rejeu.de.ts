import type { rejeuFr } from './rejeu.fr';

/** Vom Server nachgespielte Solopartien: deutsche Texte, Schlüssel `rej.`. */
export const rejeuDe: Record<keyof typeof rejeuFr, string> = {
  "rej.update": "Lade die Seite neu, damit dieses Spiel voll zählt (nur Grundbelohnung).",
  "rej.preparing": "Der Tisch wird vorbereitet …",
};
