import type { rejeuFr } from './rejeu.fr';

/** Solo games replayed by the server: English texts, `rej.` keys. */
export const rejeuEn: Record<keyof typeof rejeuFr, string> = {
  "rej.update": "Refresh the page so this game fully counts (basic reward only).",
  "rej.preparing": "Setting up the table…",
};
