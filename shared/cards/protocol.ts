/**
 * Coups Fourrés en ligne : messages échangés entre le serveur (server/cards-online.ts) et le
 * client (client/src/cards/online.ts). Espace Socket.IO « /cf », comptes seulement
 * (handshake `auth: { token }`). Toutes les commandes répondent par un accusé `CfAck`.
 */
import type { CfAction, CfEvent, CfView } from './engine';

/** Gains d'une partie (même forme que CfGameReward côté serveur). */
export interface CfGameReward { userId: string; won: boolean; capsules: number; booster: boolean; points: number; leaguePoints: number | null; missions: string[] }

export type CfAck<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Joueur assis (vue publique). `id` = identifiant de siège dans la partie (pas l'identifiant du compte). */
export interface CfWireSeat {
  id: string;
  name: string;
  /** Pseudo du compte (profil, signalement). */
  account?: string;
  photo?: string;
  /** Division de ligue (parties classées). */
  label?: string;
  /** Déconnecté (il a 60 s pour revenir) ou parti. */
  away?: boolean;
  left?: boolean;
}

/** Fenêtre de réponse en cours : même durée pour tout le monde, qu'on ait une carte ou non. */
export interface CfResponseWindow { player: string; until: number; kind: 'respond' | 'lastword' }

export interface CfWireSnapshot {
  view: CfView;
  legal: CfAction[];
  waitingFor: string[];
  seats: CfWireSeat[];
  /** Fin de la décision en cours (ms epoch) ; au-delà, la réserve du joueur s'écoule. */
  deadline: number | null;
  /** Réserve restante de chaque joueur (secondes). */
  reserve: Record<string, number>;
  finished: { standings: string[]; reward?: CfGameReward | null; abandon?: string | null } | null;
  responseWindow: CfResponseWindow | null;
}

export type CfGameMode = 'classee' | 'ami' | 'table' | 'tournoi';

/** `cf:state` : nouvel état de la partie, pour ce destinataire (joueur ou spectateur). */
export interface CfStateMsg {
  id: string;
  mode: CfGameMode;
  ranked: boolean;
  /** Mon siège ; null pour un spectateur. */
  you: string | null;
  snap: CfWireSnapshot;
  /** Événements depuis le dernier message, déjà filtrés pour ce destinataire. */
  events: CfEvent[];
}

/** `cf:table` : table privée à code (avant le départ). */
export interface CfTableMsg {
  code: string;
  host: string; // pseudo de l'hôte
  max: number;
  players: { account: string; name: string; photo?: string; host: boolean; deck: string | null }[];
}

/** `cf:hello` à la connexion : ce que le serveur sait déjà de vous (reprise après rechargement). */
export interface CfHelloMsg {
  game: { id: string; mode: CfGameMode; ranked: boolean } | null;
  table: string | null;
  queue: boolean;
  challenges: CfChallengeMsg[];
}

/** `cf:challenge:incoming` : un ami vous défie. */
export interface CfChallengeMsg { id: string; from: string; photo?: string; at: number }

/** `cf:queue` : état de la file classée. `offer` : proposition d'une partie contre l'ordinateur (après 60 s). */
export interface CfQueueMsg { waiting: boolean; since: number | null; offer: boolean; text?: string }

export interface CfChatMsg { id: string; playerId: string; name: string; account: string | null; text: string; at: number; spectator?: boolean }

/** Présence d'un ami dans le mode (GET /api/cf/friends, et champ `cf` de GET /api/friends). */
export interface CfFriendPresence { username: string; photo?: string; status: 'menu' | 'partie'; code?: string; watchable?: boolean }

export const CF_SPECTATOR_ID = 'spectateur';
