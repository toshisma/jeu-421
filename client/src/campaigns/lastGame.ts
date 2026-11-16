/**
 * Dernier jeu ouvert (421, Coups Fourrés, Courtisan, Poker menteur), retenu sur l'appareil : l'accueil montre
 * la campagne de ce jeu en premier. Simple confort d'affichage (aucune valeur de jeu) : localStorage suffit.
 */
import { isCampaignGame, type CampaignGame } from '../../../shared/campaigns';

const KEY = '421.lastGame';

export function lastGame(): CampaignGame | null {
  try { const v = localStorage.getItem(KEY); return isCampaignGame(v) ? v : null; } catch { return null; }
}
export function noteLastGame(g: CampaignGame) {
  try { localStorage.setItem(KEY, g); } catch { /* navigation privée : on montre la Tournée */ }
}

/** Jeu d'un écran de l'application (null : écran commun). `classic` : l'écran appartient au 421. */
export function gameOfScreen(name: string, classic: boolean): CampaignGame | null {
  if (name === 'cf') return 'cf';
  if (name === 'dixmille') return 'dm';
  if (name === 'poker') return 'pm';
  const m = /^camp-(cf|dm|pm)$/.exec(name);
  if (m) return m[1] as CampaignGame;
  return classic ? '421' : null;
}
