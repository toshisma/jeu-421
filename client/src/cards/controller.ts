/**
 * Coups Fourrés : contrat commun entre l'écran de partie et la source de la partie
 * (contre l'ordinateur en local, ou en ligne via le serveur). L'écran ne connaît que cette interface.
 */
import type { CfAction, CfEvent, CfView } from '../../../shared/cards/engine';

export interface CfSeat {
  id: string;
  name: string;
  /** Avatar / photo / accessoire comme dans le reste du jeu (facultatif). */
  avatar?: string;
  photo?: string;
  account?: string;
  bot?: boolean;
  /** Niveau de l'ordinateur ou division du joueur, pour l'affichage. */
  label?: string;
}

export interface CfSnapshot {
  /** Ce que CE joueur a le droit de voir (information partielle). */
  view: CfView;
  /** Actions possibles pour ce joueur maintenant (vide si ce n'est pas à lui). */
  legal: CfAction[];
  /** Joueurs attendus maintenant. */
  waitingFor: string[];
  seats: CfSeat[];
  /** Échéance de la décision en cours (ms epoch) et réserve restante de chaque joueur (s), si gérées. */
  deadline?: number | null;
  reserve?: Record<string, number>;
  /** Partie terminée : vainqueur(s) dans l'ordre et récompenses éventuelles (capsules, points…). */
  finished?: { standings: string[]; reward?: unknown } | null;
  /**
   * En ligne : fenêtre de réponse en cours (Riposte ou Dernier mot). Elle dure toujours le même
   * temps, qu'on ait une carte ou non : afficher « Réponse possible… » jusqu'à `until`.
   */
  responseWindow?: { player: string; until: number; kind: 'respond' | 'lastword' } | null;
  /** Partie guidée : bulle d'explication de l'étape en cours (affichée une fois les animations jouées). */
  guide?: CfGuide | null;
}

/** Bulle de la partie guidée. */
export interface CfGuide {
  title?: string;
  text: string;
  /** Étape d'explication : libellé du bouton « Continuer » (sinon on attend une action). */
  next?: string;
  /** Zone mise en avant (voir TutoFocus). */
  focus?: string;
  index: number;
  total: number;
}

export interface CfController {
  /** Identifiant du joueur local. */
  readonly me: string;
  readonly kind: 'bot' | 'online';
  /** Mode de la partie, pour l'affichage. */
  readonly ranked: boolean;
  /** État actuel (null tant que la partie n'a pas commencé). */
  current(): CfSnapshot | null;
  /** Nouvel état et événements (déjà filtrés pour ce joueur, texte à la 2e personne pour lui). */
  subscribe(cb: (snap: CfSnapshot, events: CfEvent[]) => void): () => void;
  /** Joue une action (doit être dans `legal`). Renvoie un message d'erreur, ou null. */
  act(action: CfAction): Promise<string | null>;
  /** Abandonner / quitter. */
  leave(): void;
}
