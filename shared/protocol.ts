/** Types échangés entre le serveur et les navigateurs (Socket.IO). */
import type { GameConfig } from './config';
import type { GameState, RollRecord } from './engine';
import type { ThrowGesture } from './gesture';
import type { TableSettings } from './tournament';

export interface PublicMember {
  id: string;
  name: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  left: boolean;
  isHost: boolean;
  /** Compte du joueur (pour voir son profil) et sa photo, s'il en a. */
  account?: string;
  photo?: string | null;
  /** Titre et accessoire d'avatar choisis par le joueur (comptes). */
  title?: string;
  accessory?: string;
  /** Niveau de prestige (0 si aucun). */
  prestige?: number;
  /** Dés du joueur (identifiant du catalogue), affichés quand il lance. */
  dice?: string;
  /** Effets de lancer (comptes). */
  trail?: string;
  fete?: string;
  /** Joueur ordinateur : son niveau. */
  bot?: 'facile' | 'normal' | 'difficile';
}

export interface PublicRoom {
  code: string;
  hostId: string;
  status: 'lobby' | 'playing';
  config: GameConfig;
  members: PublicMember[];
  /** Nom de la table, visibilité, nombre de places, mise. */
  title: string;
  table: TableSettings;
  /** Cagnotte en jeu (mises engagées) pendant la partie. */
  pot: number;
  /** Code du tournoi si cette table en fait partie. */
  tournament: string | null;
  /** Horodatage (ms) auquel le serveur jouera automatiquement pour le joueur actif. */
  turnDeadline: number | null;
}

export interface RollMessage { roll: RollRecord; seed: number; gesture?: ThrowGesture; state: GameState }
export interface Notice { kind: 'info' | 'warning'; text: string }
export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const AVATARS = ['🎩', '🦊', '🐻', '🦉', '🐙', '🦁', '🐸', '🐼', '🦄', '🐯', '🐧', '🌵', '🍀', '⚓', '🎲', '🍷'];
export const MAX_PLAYERS = 6;

/** Réactions rapides autorisées (le serveur refuse tout le reste). */
export const EMOTES = ['👏', '😱', '😂', '🍺', '🔥', '😤', '🙏', '😎'];
/** Phrases rapides : liste fermée (pas de texte libre, donc rien à modérer). */
export const PHRASES = ['Belle main !', 'Bien joué !', 'Tu paies ta tournée !', 'Revanche ?', 'Pas de chance…', 'Allez, un 4-2-1 !', 'Je le sens bien.', 'Trop fort !', 'Santé !', 'Merci pour la partie !'];
export const isReaction = (v: unknown): v is string => typeof v === 'string' && (EMOTES.includes(v) || PHRASES.includes(v));
export interface EmoteMessage { playerId: string; emote: string }
