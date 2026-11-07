/**
 * Le Courtisan en ligne : forme des messages échangés entre le serveur (server/dixmille-online.ts,
 * espace Socket.IO « /dixmille ») et les navigateurs (client/src/dixmille/online.ts).
 */
import type { DmAction, DmEvent, DmLevel, DmState } from './engine';
import type { ThrowGesture } from '../gesture';
import type { Reward } from '../progress/profile';

export const DM_TABLE_MAX = 6;
/** Temps par décision (lancer, mettre de côté, relancer ou encaisser). */
export const DM_DECISION_SECONDS = 30;

export interface DmPublicMember {
  id: string; name: string; avatar: string; ready: boolean; connected: boolean; left: boolean; isHost: boolean;
  bot?: DmLevel; filler?: boolean; account?: string; photo?: string | null; accessory?: string; dice?: string; trail?: string;
}
export interface DmPublicTable {
  code: string; title: string; hostId: string; status: 'lobby' | 'playing';
  target: number; visibility: 'private' | 'public'; max: number;
  /** Mise par joueur (0 : gratuit), pot de la partie en cours, partie contre l'ordinateur avec mise. */
  stake: number; pot: number; solo?: boolean;
  /** Fin de la décision en cours (chrono affiché), null sans limite (ordinateur, partie finie). */
  deadline: number | null;
  spectators: number;
  quick?: { fillAt: number | null; startAt: number | null };
  members: DmPublicMember[];
}
/** Une action jouée : l'état après, ce qui s'est passé (à animer), la graine du lancer 3D. */
export interface DmUpdate {
  version: number; state: DmState; events: DmEvent[]; by: string; action: DmAction | null;
  /** Graine d'animation partagée : tout le monde voit le même lancer. */
  animSeed: number; gesture?: ThrowGesture;
  /** Joué par le serveur (ordinateur, temps écoulé, joueur parti). */
  auto?: 'bot' | 'temps' | 'absent';
}
export interface DmSnapshot { version: number; state: DmState }
export interface DmRewardMsg { reward: Reward; levelBefore: number; levelAfter: number; profile: unknown }
