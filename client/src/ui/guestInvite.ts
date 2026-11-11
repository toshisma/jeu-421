/**
 * « Créez un compte » après une partie (invités seulement).
 * Les écrans de fin de partie des trois jeux appellent useGuestInviteAtEnd ; la fenêtre elle-même
 * (GuestInvite.tsx) est affichée par App, qui sait si le joueur a un compte.
 *
 * Fréquence : après chaque partie terminée, mais pas deux fois en moins de 2 minutes (compté depuis la
 * dernière fermeture), pour ne pas gêner un joueur qui enchaîne des parties très courtes.
 * Jamais pendant une partie : la demande n'arrive qu'à l'écran de fin.
 */
import { useEffect } from 'react';

export type InviteGame = '421' | 'cf' | 'courtisan' | 'poker';

/** Délai minimal entre deux fenêtres (depuis la dernière fermeture). */
export const INVITE_COOLDOWN_MS = 2 * 60_000;
/** La fenêtre arrive un peu après l'écran de fin, le temps de voir le résultat. */
export const INVITE_DELAY_MS = 1300;

/** Faut-il proposer la fenêtre maintenant ? */
export function inviteDue(o: { isAccount: boolean; server: boolean; lastClosed: number; now: number }): boolean {
  if (o.isAccount || !o.server) return false;
  return o.now - o.lastClosed >= INVITE_COOLDOWN_MS;
}

const KEY = '421.invite.ferme';
let memClosed = 0;
export function lastInviteClosed(): number {
  try { const v = Number(localStorage.getItem(KEY)); if (Number.isFinite(v) && v > memClosed) return v; } catch { /* stockage indisponible */ }
  return memClosed;
}
export function markInviteClosed(at = Date.now()) {
  memClosed = at;
  try { localStorage.setItem(KEY, String(at)); } catch { /* */ }
}

type Listener = (game: InviteGame) => void;
const listeners = new Set<Listener>();
/** Une partie vient de se terminer (écran de fin affiché). */
export function requestGuestInvite(game: InviteGame) { listeners.forEach((l) => l(game)); }
export function onGuestInvite(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

/** À appeler dans un écran de partie : `ended` passe à vrai quand l'écran de fin s'affiche. */
export function useGuestInviteAtEnd(game: InviteGame, ended: boolean) {
  useEffect(() => { if (ended) requestGuestInvite(game); }, [ended, game]);
}

// --- Cadeau de bienvenue (après la création du compte) ---------------------------------------------
const GIFT = '421.cadeau';
export interface WelcomeGift { user: string; bags: boolean; boosters: boolean }
export function loadWelcomeGift(): WelcomeGift | null {
  try { const r = localStorage.getItem(GIFT); const g = r ? JSON.parse(r) as WelcomeGift : null; return g && (g.bags || g.boosters) ? g : null; } catch { return null; }
}
export function saveWelcomeGift(g: WelcomeGift | null) {
  try { if (g && (g.bags || g.boosters)) localStorage.setItem(GIFT, JSON.stringify(g)); else localStorage.removeItem(GIFT); } catch { /* */ }
  window.dispatchEvent(new Event('421:cadeau'));
}
