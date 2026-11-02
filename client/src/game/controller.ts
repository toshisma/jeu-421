/**
 * Interface commune entre l'écran de jeu et la source de vérité de la partie :
 *  - LocalController : moteur exécuté dans le navigateur (mode solo contre l'IA) ;
 *  - OnlineController : serveur Socket.IO faisant autorité (multijoueur).
 * L'écran de jeu ne sait pas lequel il utilise.
 */
import type { GameState, RollRecord } from '../../../shared/engine';
import type { Difficulty } from '../../../shared/ai';
import type { ThrowGesture } from '../../../shared/gesture';

export interface MetaPlayer {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isBot: boolean;
  difficulty?: Difficulty;
  tagline?: string;
  connected: boolean;
  isMe: boolean;
  isHost?: boolean;
  /** Compte (pour voir le profil) et photo du joueur. */
  account?: string;
  photo?: string | null;
  /** Titre choisi et accessoire d'avatar. */
  title?: string;
  accessory?: string;
  /** Niveau de prestige (0 si aucun). */
  prestige?: number;
}

export type GameEvent =
  | { type: 'roll'; roll: RollRecord; seed: number; gesture?: ThrowGesture; state: GameState }
  | { type: 'state'; state: GameState };

export interface GameController {
  readonly mode: 'solo' | 'online';
  readonly meId: string;
  getMeta(): MetaPlayer[];
  /** Le dernier état connu est rejoué immédiatement à l'abonnement (aucun événement perdu). */
  subscribeEvents(cb: (e: GameEvent) => void): () => void;
  subscribeMeta(cb: () => void): () => void;
  roll(keep: boolean[], version: number, gesture?: ThrowGesture): Promise<string | null>;
  stop(version: number): Promise<string | null>;
  /** L'écran a fini d'animer tout ce qu'il a reçu. */
  notifyIdle(): void;
  /** Joueur IA en train de réfléchir (solo). */
  thinkingId(): string | null;
  /** Échéance du tour en cours (en ligne), en ms depuis l'epoch. */
  turnDeadline(): number | null;
  /** Temps pour jouer configuré (secondes, 0 = illimité). */
  turnSeconds(): number;
  /** Réactions rapides (emoji) affichées au-dessus des joueurs. */
  sendEmote(emote: string): void;
  subscribeEmotes(cb: (playerId: string, emote: string) => void): () => void;
  canRematch(): boolean;
  rematch(): void;
  leave(): void;
}
