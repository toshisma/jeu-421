import type { rejeuFr } from './rejeu.fr';

/** Vom Server nachgespielte Solopartien: deutsche Texte, Schlüssel `rej.`. */
export const rejeuDe: Record<keyof typeof rejeuFr, string> = {
  "rej.update": "Lade die Seite neu, damit dieses Spiel voll zählt (nur Grundbelohnung).",
  "rej.prepFailed": "Der Tisch konnte nicht vorbereitet werden (langsame Verbindung?). Diese Partie muss vom Server geprüft werden, um zu zählen.",
  "rej.retry": "Erneut versuchen",
  "rej.back": "Zurück",
  "rej.preparing": "Der Tisch wird vorbereitet …",
};
