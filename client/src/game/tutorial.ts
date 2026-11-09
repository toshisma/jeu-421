/**
 * Partie guidée : une vraie partie contre Marcel (facile), avec des dés préparés pour que chaque
 * manche montre une règle : la charge et la valeur d'un brelan, le 4-2-1, puis la décharge et
 * l'art de garder les bons dés.
 */
import { DEFAULT_CONFIG, type GameConfig } from '../../../shared/config';
import { currentPlayerId, type GameState } from '../../../shared/engine';
import { LocalController } from './localController';
import { PERSONAS } from './personas';
import { tr } from '../i18n/lang';

export const TUTORIAL_CONFIG: GameConfig = {
  ...DEFAULT_CONFIG,
  variant: 'classique',
  totalTokens: 6,
  chargeThrows: 1,
  maxThrows: 3,
  leaderSetsThrows: false,
  turnSeconds: 0,
  tieRule: 'barrage',
};

/** Valeurs à faire sortir pour compléter `target` à partir des dés gardés. */
function fill(kept: number[], rolled: number, target: number[], reveal: number): number[] {
  const missing = [...target];
  for (const v of kept) { const i = missing.indexOf(v); if (i >= 0) missing.splice(i, 1); }
  const out = missing.slice(0, Math.min(reveal, rolled));
  const fillers = [5, 6, 3, 5];
  while (out.length < rolled) out.push(fillers[out.length % fillers.length]);
  return out;
}

export class TutorialController extends LocalController {
  constructor(me: { name: string; avatar: string; photo?: string | null }) {
    const marcel = PERSONAS.find((p) => p.id === 'marcel')!;
    super(TUTORIAL_CONFIG, [{ persona: marcel, difficulty: 'facile' }], { ...me });
    // La première partie est créée par le constructeur parent : on la refait avec le bon premier joueur.
    this.firstIdx = 0;
    this.newGame();
  }

  protected dieSource(playerId: string, keep: boolean[]): () => number {
    const s: GameState = this.state;
    let values: number[];
    const kept = s.throwsUsed === 0 ? [] : s.dice.filter((_, i) => keep[i]);
    const rolled = 3 - kept.length;
    if (playerId === this.meId) {
      if (s.phase === 'charge' && s.round === 1) values = [5, 3, 2];
      else if (s.phase === 'charge') values = [4, 2, 1];
      else if (s.throwsUsed === 0) values = [4, 6, 3];
      else values = fill(kept, rolled, [4, 2, 1], s.throwsUsed === 1 ? 1 : 3);
    } else {
      if (s.phase === 'charge' && s.round === 1) values = [3, 3, 3];
      else if (s.phase === 'charge') values = [6, 4, 2];
      else values = fill(kept, rolled, [6, 5, 3], 3);
    }
    let i = 0;
    return () => values[i++] ?? 1 + Math.floor(Math.random() * 6);
  }

  canRematch() { return false; }
}

/** Message du guide selon l'état de la partie. */
export function coachMessage(s: GameState | null, meId: string): string | null {
  if (!s) return null;
  const myTurn = currentPlayerId(s) === meId;
  const dice = [...s.dice].sort((a, b) => b - a).join('');
  if (s.phase === 'fini') return s.ranking[0] === meId
    ? tr('g421.coach.win')
    : tr('g421.coach.end');
  if (s.phase === 'charge' && s.round === 1) {
    if (myTurn) return tr('g421.coach.welcome');
    return tr('g421.coach.simple');
  }
  if (s.phase === 'charge') {
    if (myTurn && s.throwsUsed === 0) return tr('g421.coach.brelan');
    return tr('g421.coach.421');
  }
  // Décharge
  if (!myTurn) return tr('g421.coach.dech');
  if (s.throwsUsed === 0) return tr('g421.coach.you');
  if (s.throwsUsed === 1) return dice.includes('4')
    ? tr('g421.coach.four')
    : tr('g421.coach.touch');
  if (dice.includes('4') && dice.includes('2') && !dice.includes('1')) return tr('g421.coach.two');
  if (dice === '421') return tr('g421.coach.valid');
  return tr('g421.coach.go');
}
