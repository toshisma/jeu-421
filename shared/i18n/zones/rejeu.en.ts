import type { rejeuFr } from './rejeu.fr';

/** Solo games replayed by the server: English texts, `rej.` keys. */
export const rejeuEn: Record<keyof typeof rejeuFr, string> = {
  "rej.update": "Refresh the page so this game fully counts (basic reward only).",
  "rej.prepFailed": "The table couldn’t be set up (slow connection?). This game must be checked by the server to count.",
  "rej.retry": "Try again",
  "rej.back": "Back",
  "rej.preparing": "Setting up the table…",
};
