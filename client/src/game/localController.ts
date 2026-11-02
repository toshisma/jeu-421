import type { GameConfig } from '../../../shared/config';
import { createGame, currentPlayerId, rollAction, stopAction, type GameState } from '../../../shared/engine';
import { decide, type Difficulty } from '../../../shared/ai';
import type { GameController, GameEvent, MetaPlayer } from './controller';
import { sanitizeGesture, type ThrowGesture } from '../../../shared/gesture';
import type { Persona } from './personas';

export interface Opponent { persona: Persona; difficulty: Difficulty }

const rollDie = () => {
  // Hasard cryptographique du navigateur pour les résultats en solo.
  const a = new Uint32Array(1);
  let v: number;
  do { crypto.getRandomValues(a); v = a[0]; } while (v >= 4294967292); // rejet : distribution uniforme
  return 1 + (v % 6);
};
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;

/** Partie solo : le moteur tourne dans le navigateur, les IA jouent à leur tour. */
export class LocalController implements GameController {
  readonly mode = 'solo' as const;
  readonly meId = 'moi';
  protected state!: GameState;
  private meta: MetaPlayer[];
  /** Premier joueur imposé (partie guidée) ; sinon tiré au sort. */
  protected firstIdx: number | null = null;
  private evL = new Set<(e: GameEvent) => void>();
  private metaL = new Set<() => void>();
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private thinking: string | null = null;
  private idle = true;
  private disposed = false;
  /** Minuteur du joueur humain (temps pour jouer). */
  private humanTimer: ReturnType<typeof setTimeout> | null = null;
  private deadline: number | null = null;
  private timedOut = false;
  private emoteL = new Set<(playerId: string, emote: string) => void>();

  constructor(private config: GameConfig, private opponents: Opponent[], me: { name: string; avatar: string; photo?: string | null; account?: string; title?: string; accessory?: string }) {
    this.meta = [
      { id: this.meId, name: me.name || 'Vous', avatar: me.avatar, color: '#d9a441', isBot: false, connected: true, isMe: true, photo: me.photo, account: me.account, title: me.title, accessory: me.accessory },
      ...opponents.map((o, i) => ({
        id: `ia-${i}`, name: o.persona.name, avatar: o.persona.avatar, color: o.persona.color, isBot: true,
        difficulty: o.difficulty, tagline: o.persona.tagline, connected: true, isMe: false,
      })),
    ];
    this.newGame();
  }

  protected newGame() {
    const players = this.meta.map((m) => ({ id: m.id, name: m.name }));
    this.state = createGame(this.config, players, this.firstIdx ?? Math.floor(Math.random() * players.length));
  }

  private emit(e: GameEvent) {
    this.idle = false;
    for (const cb of this.evL) cb(e);
  }
  private snapshot(): GameState { return structuredClone(this.state); }
  /** Source des dés d'un lancer (la partie guidée la remplace par des dés préparés). */
  protected dieSource(_playerId: string, _keep: boolean[]): () => number { return rollDie; }

  getMeta() { return this.meta; }
  subscribeEvents(cb: (e: GameEvent) => void) {
    this.evL.add(cb);
    cb({ type: 'state', state: this.snapshot() });
    return () => this.evL.delete(cb);
  }
  subscribeMeta(cb: () => void) { this.metaL.add(cb); return () => this.metaL.delete(cb); }
  private emitMeta() { for (const cb of this.metaL) cb(); }

  async roll(keep: boolean[], version: number, gesture?: ThrowGesture) {
    if (version !== this.state.version) return 'Action déjà prise en compte';
    if (this.timedOut) return 'Temps écoulé';
    this.clearHumanTimer();
    const r = rollAction(this.state, this.meId, keep, this.dieSource(this.meId, keep));
    if (!r.ok) return r.error;
    this.emit({ type: 'roll', roll: r.roll!, seed: randomSeed(), gesture: sanitizeGesture(gesture), state: this.snapshot() });
    return null;
  }
  async stop(version: number) {
    if (version !== this.state.version) return 'Action déjà prise en compte';
    if (this.timedOut) return 'Temps écoulé';
    this.clearHumanTimer();
    const r = stopAction(this.state, this.meId);
    if (!r.ok) return r.error;
    this.emit({ type: 'state', state: this.snapshot() });
    return null;
  }

  /** Appelé quand l'écran a fini ses animations : on peut faire jouer l'IA suivante. */
  notifyIdle() {
    this.idle = true;
    this.scheduleBot();
    this.scheduleHuman();
  }

  private clearHumanTimer() {
    if (this.humanTimer) clearTimeout(this.humanTimer);
    this.humanTimer = null;
    if (this.deadline !== null) { this.deadline = null; this.emitMeta(); }
  }

  /**
   * Temps pour jouer : le minuteur démarre quand les animations sont finies. Temps écoulé :
   * si le joueur n'a pas lancé, un lancer est fait pour lui, puis son tour est validé.
   */
  private scheduleHuman() {
    if (this.disposed || this.humanTimer || currentPlayerId(this.state) !== this.meId) return;
    if (this.timedOut) {
      // Fin d'un tour en temps écoulé : on valide juste après l'animation du lancer automatique.
      this.humanTimer = setTimeout(() => {
        this.humanTimer = null;
        this.timedOut = false;
        if (currentPlayerId(this.state) !== this.meId) return;
        stopAction(this.state, this.meId);
        this.emit({ type: 'state', state: this.snapshot() });
      }, 500);
      return;
    }
    const secs = this.config.turnSeconds;
    if (!secs) return;
    this.deadline = Date.now() + secs * 1000;
    this.emitMeta();
    this.humanTimer = setTimeout(() => {
      this.humanTimer = null;
      this.deadline = null;
      if (this.disposed || currentPlayerId(this.state) !== this.meId) return;
      if (this.state.throwsUsed === 0) {
        const r = rollAction(this.state, this.meId, [false, false, false], this.dieSource(this.meId, [false, false, false]));
        if (!r.ok) return;
        // S'il reste des lancers, le tour sera validé après l'animation (voir plus haut).
        if (currentPlayerId(this.state) === this.meId) this.timedOut = true;
        this.emit({ type: 'roll', roll: r.roll!, seed: randomSeed(), state: this.snapshot() });
      } else {
        stopAction(this.state, this.meId);
        this.emit({ type: 'state', state: this.snapshot() });
      }
      this.emitMeta();
    }, secs * 1000);
  }

  private scheduleBot() {
    if (this.disposed || this.botTimer || !this.idle) return;
    const pid = currentPlayerId(this.state);
    const idx = this.meta.findIndex((m) => m.id === pid);
    if (!pid || !this.meta[idx]?.isBot) return;
    const opp = this.opponents[idx - 1];
    this.thinking = pid;
    this.emitMeta();
    const first = this.state.throwsUsed === 0;
    const delay = opp.persona.tempo * (first ? 0.8 : 1) * (0.7 + Math.random() * 0.6);
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (this.disposed || currentPlayerId(this.state) !== pid) return;
      const d = decide(this.state, pid, opp.difficulty, Math.random, opp.persona.style);
      this.thinking = null;
      this.emitMeta();
      if (d.kind === 'roll') {
        const r = rollAction(this.state, pid, d.keep, this.dieSource(pid, d.keep));
        if (r.ok) this.emit({ type: 'roll', roll: r.roll!, seed: randomSeed(), state: this.snapshot() });
      } else {
        stopAction(this.state, pid);
        this.emit({ type: 'state', state: this.snapshot() });
      }
    }, delay);
  }

  thinkingId() { return this.thinking; }
  turnDeadline() { return this.deadline; }
  turnSeconds() { return this.config.turnSeconds; }
  /** En solo, un adversaire répond parfois à votre réaction. */
  sendEmote(emote: string) {
    for (const cb of this.emoteL) cb(this.meId, emote);
    const bots = this.meta.filter((m) => m.isBot);
    if (bots.length && Math.random() < 0.55) {
      const bot = bots[Math.floor(Math.random() * bots.length)];
      const phraseAnswers: Record<string, string[]> = {
        'Belle main !': ['Merci pour la partie !', '👏'], 'Bien joué !': ['Merci pour la partie !', '😎'], 'Tu paies ta tournée !': ['😂', 'Santé !'],
        'Revanche ?': ['Revanche ?', '😎'], 'Pas de chance…': ['😤', 'Pas de chance…'], 'Allez, un 4-2-1 !': ['Je le sens bien.', '🔥'],
        'Je le sens bien.': ['😂', 'Allez, un 4-2-1 !'], 'Trop fort !': ['😎', 'Merci pour la partie !'], 'Santé !': ['Santé !', '🍺'], 'Merci pour la partie !': ['Merci pour la partie !', '🙏'],
      };
      const answers: Record<string, string[]> = { ...phraseAnswers, '😤': ['😂', '😎'], '👏': ['🙏', '😎'], '😂': ['😤', '😂'], '🍺': ['🍺'], '🔥': ['😱', '😎'], '😱': ['😂'], '🙏': ['😂', '👏'], '😎': ['😤', '😂'] };
      const pool = answers[emote] ?? ['😂'];
      setTimeout(() => { if (!this.disposed) for (const cb of this.emoteL) cb(bot.id, pool[Math.floor(Math.random() * pool.length)]); }, 700 + Math.random() * 900);
    }
  }
  subscribeEmotes(cb: (playerId: string, emote: string) => void) { this.emoteL.add(cb); return () => { this.emoteL.delete(cb); }; }
  canRematch() { return true; }
  rematch() {
    this.clearHumanTimer();
    this.timedOut = false;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    this.thinking = null;
    this.newGame();
    this.emit({ type: 'state', state: this.snapshot() });
  }
  leave() {
    this.disposed = true;
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.humanTimer) clearTimeout(this.humanTimer);
    this.evL.clear();
    this.metaL.clear();
  }
}
