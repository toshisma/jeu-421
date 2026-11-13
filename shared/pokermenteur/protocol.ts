/**
 * Poker menteur en ligne : messages entre le serveur (server/pokermenteur-online.ts, espace Socket.IO
 * « /poker ») et les navigateurs (client/src/pokermenteur/online.ts).
 * Les dés du gobelet ne sont envoyés qu'à son détenteur (`viewFor`), jamais aux autres ni aux spectateurs.
 */
import type { RepInfo } from '../progress/repu';
import type { PmAction, PmEvent, PmLevel, PmOptions, PmState } from './engine';
import type { Reward } from '../progress/profile';

export const PM_TABLE_MAX = 6;
/** Temps par décision (croire / menteur, relancer, annoncer). */
export const PM_DECISION_SECONDS = 30;

export interface PmPublicMember {
  id: string; name: string; avatar: string; ready: boolean; connected: boolean; left: boolean; isHost: boolean;
  bot?: PmLevel; filler?: boolean; quit?: boolean; account?: string; photo?: string | null; accessory?: string; dice?: string;
  /** Réputation de la Tournée des comptoirs (profil serveur). */ rep?: RepInfo;
}
export interface PmPublicTable {
  code: string; title: string; hostId: string; status: 'lobby' | 'playing';
  options: PmOptions; visibility: 'private' | 'public'; max: number;
  /** Fin de la décision en cours (chrono affiché), null sans limite. */
  deadline: number | null;
  spectators: number;
  quick?: { fillAt: number | null; startAt: number | null };
  members: PmPublicMember[];
}
/** Une action jouée : l'état VU PAR CE DESTINATAIRE après l'action, ce qui s'est passé. */
export interface PmUpdate {
  version: number; state: PmState; events: PmEvent[]; by: string;
  /** Type d'action seulement (jamais les positions ou valeurs privées au-delà de ce que l'état montre). */
  action: PmAction['type'] | null;
  auto?: 'bot' | 'temps' | 'absent';
}
export interface PmRewardMsg {
  reward: Reward; levelBefore: number; levelAfter: number; profile: unknown;
  bags?: number; quests?: string[]; achievements?: string[];
}
