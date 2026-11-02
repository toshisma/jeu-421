/**
 * Mode soirée, sur un seul appareil : tous les joueurs sont humains et se passent le téléphone.
 * « Moi », c'est toujours le joueur dont c'est le tour.
 */
import type { GameConfig } from '../../../shared/config';
import { createGame, currentPlayerId, rollAction, stopAction, type GameState } from '../../../shared/engine';
import { sanitizeGesture, type ThrowGesture } from '../../../shared/gesture';
import { AVATARS } from '../../../shared/protocol';
import type { GameController, GameEvent, MetaPlayer } from './controller';

const COLORS = ['#d9a441', '#c0583a', '#3d8fb5', '#8e5bb5', '#3f8f5a', '#c2366b'];
const rollDie = () => {
  const a = new Uint32Array(1);
  let v: number;
  do { crypto.getRandomValues(a); v = a[0]; } while (v >= 4294967292);
  return 1 + (v % 6);
};
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;

export class PartyController implements GameController {
  readonly mode = 'solo' as const;
  private state!: GameState;
  private meta: MetaPlayer[];
  private evL = new Set<(e: GameEvent) => void>();
  private metaL = new Set<() => void>();
  private emoteL = new Set<(playerId: string, emote: string) => void>();

  constructor(private config: GameConfig, names: string[]) {
    this.meta = names.map((n, i) => ({
      id: `j${i}`, name: n, avatar: AVATARS[(i * 5) % AVATARS.length], color: COLORS[i % COLORS.length],
      isBot: false, connected: true, isMe: false,
    }));
    this.newGame();
  }
  private newGame() { this.state = createGame(this.config, this.meta.map((m) => ({ id: m.id, name: m.name })), Math.floor(Math.random() * this.meta.length)); }
  private snap() { return structuredClone(this.state); }
  private emit(e: GameEvent) { for (const cb of this.evL) cb(e); }

  /** Le joueur « local » est celui dont c'est le tour. */
  get meId() { return currentPlayerId(this.state) ?? ''; }
  getMeta() { return this.meta.map((m) => ({ ...m, isMe: m.id === this.meId })); }
  subscribeEvents(cb: (e: GameEvent) => void) { this.evL.add(cb); cb({ type: 'state', state: this.snap() }); return () => this.evL.delete(cb); }
  subscribeMeta(cb: () => void) { this.metaL.add(cb); return () => this.metaL.delete(cb); }
  async roll(keep: boolean[], version: number, gesture?: ThrowGesture) {
    if (version !== this.state.version) return 'Action déjà prise en compte';
    const pid = currentPlayerId(this.state)!;
    const r = rollAction(this.state, pid, keep, rollDie);
    if (!r.ok) return r.error;
    this.emit({ type: 'roll', roll: r.roll!, seed: seed(), gesture: sanitizeGesture(gesture), state: this.snap() });
    return null;
  }
  async stop(version: number) {
    if (version !== this.state.version) return 'Action déjà prise en compte';
    const r = stopAction(this.state, currentPlayerId(this.state)!);
    if (!r.ok) return r.error;
    this.emit({ type: 'state', state: this.snap() });
    return null;
  }
  notifyIdle() {}
  thinkingId() { return null; }
  turnDeadline() { return null; }
  turnSeconds() { return 0; }
  sendEmote(emote: string) { for (const cb of this.emoteL) cb(this.meId, emote); }
  subscribeEmotes(cb: (playerId: string, emote: string) => void) { this.emoteL.add(cb); return () => { this.emoteL.delete(cb); }; }
  canRematch() { return true; }
  rematch() { this.newGame(); this.emit({ type: 'state', state: this.snap() }); }
  leave() { this.evL.clear(); this.metaL.clear(); }
  /** État courant (écran de passage du téléphone). */
  current() { return this.state; }
  nameOf(id: string) { return this.meta.find((m) => m.id === id)?.name ?? '?'; }
}

/**
 * Mode arbitre : on joue avec de vrais dés, le joueur indique ses trois dés et son nombre de
 * lancers ; le moteur applique exactement les mêmes règles qu'en partie virtuelle.
 */
export function refereeTurn(s: GameState, dice: number[], throws: number): string | null {
  const pid = currentPlayerId(s);
  if (!pid) return 'La partie est terminée';
  if (dice.length !== 3 || dice.some((d) => !Number.isInteger(d) || d < 1 || d > 6)) return 'Indiquez les trois dés';
  const n = Math.max(1, Math.min(s.throwLimit, throws));
  for (let k = 0; k < n; k++) {
    let i = 0;
    const r = rollAction(s, pid, [false, false, false], () => dice[i++]);
    if (!r.ok) return r.error;
    if (s.throwsUsed === 0 || s.phase === 'fini') return null; // tour terminé (limite atteinte)
  }
  const st = stopAction(s, pid);
  return st.ok ? null : st.error;
}
