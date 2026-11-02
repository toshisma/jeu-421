/**
 * Client multijoueur. Le serveur est l'unique autorité : ce code n'envoie que des intentions
 * (« je lance en gardant tels dés ») et affiche les résultats officiels reçus.
 */
import { io, type Socket } from 'socket.io-client';
import type { GameConfig } from '../../../shared/config';
import { currentPlayerId, type GameState } from '../../../shared/engine';
import type { Ack, Notice, PublicRoom, RollMessage } from '../../../shared/protocol';
import { saveSession } from '../settings';
import { SERVER_URL } from '../platform';
import { today } from '../../../shared/progress/quests';
import type { EndReward } from '../account/useProfile';
import type { GameController, GameEvent, MetaPlayer } from './controller';
import type { ThrowGesture } from '../../../shared/gesture';
import type { Profile } from '../../../shared/progress/profile';
import type { PublicTournament, TableSettings, TournamentSettings } from '../../../shared/tournament';

const COLORS = ['#d9a441', '#c0583a', '#3d8fb5', '#8e5bb5', '#3f8f5a', '#c2366b'];

export class OnlineSession {
  socket: Socket;
  code = '';
  playerId = '';
  private token = '';
  room: PublicRoom | null = null;
  game: GameState | null = null;
  connected = false;
  notices: (Notice & { id: number })[] = [];
  private noticeId = 0;
  private metaL = new Set<() => void>();
  private evL = new Set<(e: GameEvent) => void>();
  emoteL = new Set<(playerId: string, emote: string) => void>();
  closed = false;
  /** Jeton du compte (facultatif) : le serveur attribue alors les récompenses de la partie. */
  auth: string | null = null;
  /** Dés équipés (les invités n'ont droit qu'aux dés de la boutique ; le serveur vérifie). */
  dice: string | undefined;
  onReward: ((r: EndReward) => void) | null = null;
  onProfile: ((p: Profile) => void) | null = null;
  /** Tournoi (facultatif) : code, état diffusé, et raison d'une désinscription forcée. */
  tcode = '';
  tournament: PublicTournament | null = null;
  removed: string | null = null;

  constructor(auth: string | null = null, onReward: ((r: EndReward) => void) | null = null, onProfile: ((p: Profile) => void) | null = null) {
    this.auth = auth;
    this.onReward = onReward;
    this.onProfile = onProfile;
    const opts = { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 };
    this.socket = SERVER_URL ? io(SERVER_URL, opts) : io(opts);
    this.socket.on('connect', () => {
      this.connected = true;
      // Reconnexion automatique au salon après une coupure réseau.
      if (this.tcode && this.token) void this.tJoin(this.tcode, '', '', this.token).catch(() => {});
      else if (this.code && this.token) void this.join(this.code, '', '', this.token).catch(() => {});
      this.emitMeta();
    });
    this.socket.on('disconnect', () => { this.connected = false; this.emitMeta(); });
    this.socket.on('connect_error', () => { this.connected = false; this.emitMeta(); });
    this.socket.on('room:state', (r: PublicRoom) => {
      const wasPlaying = this.room?.status === 'playing' && this.room.code === r.code;
      // Tournoi : le serveur nous installe à une nouvelle table.
      if (r.tournament && r.code !== this.code) { this.code = r.code; this.game = null; }
      this.room = r;
      if (r.status === 'lobby' && wasPlaying) this.game = null;
      this.emitMeta();
    });
    this.socket.on('game:state', ({ state }: { state: GameState }) => {
      this.game = state;
      this.emitEvent({ type: 'state', state });
      this.emitMeta();
    });
    this.socket.on('game:roll', (m: RollMessage) => {
      this.game = m.state;
      this.emitEvent({ type: 'roll', roll: m.roll, seed: m.seed, gesture: m.gesture, state: m.state });
    });
    this.socket.on('profile:reward', (r: EndReward) => this.onReward?.(r));
    this.socket.on('profile:update', ({ profile }: { profile: Profile }) => this.onProfile?.(profile));
    this.socket.on('tournament:state', (t: PublicTournament) => { this.tournament = t; this.emitMeta(); });
    this.socket.on('tournament:removed', ({ reason }: { reason: string }) => { this.removed = reason; this.tcode = ''; saveSession(null); this.emitMeta(); });
    this.socket.on('game:emote', (m: { playerId: string; emote: string }) => { for (const cb of this.emoteL) cb(m.playerId, m.emote); });
    this.socket.on('room:notice', (n: Notice) => {
      this.notices = [...this.notices.slice(-4), { ...n, id: ++this.noticeId }];
      this.emitMeta();
    });
  }

  private call<T extends object>(ev: string, payload: object = {}): Promise<Ack<T>> {
    return new Promise((resolve) => {
      if (!this.socket.connected) return resolve({ ok: false, error: 'Connexion au serveur impossible' });
      const t = setTimeout(() => resolve({ ok: false, error: 'Le serveur ne répond pas' }), 6000);
      this.socket.emit(ev, payload, (a: Ack<T>) => { clearTimeout(t); resolve(a); });
    });
  }

  waitConnected(ms = 6000): Promise<boolean> {
    if (this.socket.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), ms);
      this.socket.once('connect', () => { clearTimeout(t); resolve(true); });
    });
  }

  private remember(a: { code: string; playerId: string; token: string }) {
    this.code = a.code;
    this.playerId = a.playerId;
    this.token = a.token;
    saveSession({ code: a.code, token: a.token });
  }

  async create(name: string, avatar: string, config: GameConfig, table?: TableSettings) {
    if (!(await this.waitConnected())) throw new Error('Impossible de joindre le serveur de jeu');
    const a = await this.call<{ code: string; playerId: string; token: string }>('room:create', { name, avatar, config, table, auth: this.auth, dice: this.dice, day: today() });
    if (!a.ok) throw new Error(a.error);
    this.remember(a);
  }

  /** Partie rapide : une table publique qui attend des joueurs, ou une nouvelle. */
  async quick(name: string, avatar: string) {
    if (!(await this.waitConnected())) throw new Error('Impossible de joindre le serveur de jeu');
    const a = await this.call<{ code: string; playerId: string; token: string }>('room:quick', { name, avatar, auth: this.auth, dice: this.dice, day: today() });
    if (!a.ok) throw new Error(a.error);
    this.remember(a);
  }

  async join(code: string, name: string, avatar: string, token?: string) {
    if (!(await this.waitConnected())) throw new Error('Impossible de joindre le serveur de jeu');
    const a = await this.call<{ code: string; playerId: string; token: string }>('room:join', { code, name, avatar, token, auth: this.auth, dice: this.dice, day: today() });
    if (!a.ok) {
      if (token) saveSession(null);
      throw new Error(a.error);
    }
    this.remember(a);
  }

  // --- Tournoi ---
  private rememberT(a: { code: string; playerId: string; token: string }) {
    this.tcode = a.code;
    this.playerId = a.playerId;
    this.token = a.token;
    saveSession({ code: a.code, token: a.token, tournament: true });
  }
  async tCreate(name: string, avatar: string, settings: TournamentSettings) {
    if (!(await this.waitConnected())) throw new Error('Impossible de joindre le serveur de jeu');
    const a = await this.call<{ code: string; playerId: string; token: string }>('tournament:create', { name, avatar, settings, auth: this.auth, dice: this.dice, day: today() });
    if (!a.ok) throw new Error(a.error);
    this.rememberT(a);
  }
  async tJoin(code: string, name: string, avatar: string, token?: string) {
    if (!(await this.waitConnected())) throw new Error('Impossible de joindre le serveur de jeu');
    const a = await this.call<{ code: string; playerId: string; token: string }>('tournament:join', { code, name, avatar, token, auth: this.auth, dice: this.dice, day: today() });
    if (!a.ok) {
      if (token) saveSession(null);
      throw new Error(a.error);
    }
    this.rememberT(a);
  }
  tSettings(settings: TournamentSettings) { return this.call('tournament:settings', { settings }); }
  tStart() { return this.call('tournament:start'); }
  /** Quitte le tournoi (désinscription, ou abandon s'il a commencé). */
  tLeave() {
    if (this.closed) return;
    this.closed = true;
    saveSession(null);
    if (this.socket.connected) this.socket.emit('tournament:leave', {}, () => this.socket.disconnect());
    else this.socket.disconnect();
    setTimeout(() => this.socket.disconnect(), 800);
  }
  /** Ferme la connexion sans quitter (le tournoi reste reprenable depuis l'accueil). */
  detach() { this.closed = true; this.socket.disconnect(); }

  addBot(difficulty: string) { return this.call('room:addBot', { difficulty }); }
  removeBot(id: string) { return this.call('room:removeBot', { id }); }
  tFillBots(difficulty: string) { return this.call('tournament:fillBots', { difficulty }); }

  setReady(ready: boolean) { return this.call('room:ready', { ready }); }
  setConfig(config: GameConfig) { return this.call('room:config', { config }); }
  setTable(table: TableSettings) { return this.call('room:config', { table }); }
  start() { return this.call('room:start'); }
  rematch() { return this.call('room:rematch'); }
  async act(kind: 'roll' | 'stop' | 'emote', payload: object) {
    const a = await this.call(`game:${kind}`, payload);
    return a.ok ? null : a.error;
  }

  leave() {
    if (this.closed) return;
    this.closed = true;
    saveSession(null);
    if (this.socket.connected) this.socket.emit('room:leave', {}, () => this.socket.disconnect());
    else this.socket.disconnect();
    setTimeout(() => this.socket.disconnect(), 800);
  }

  get isHost() { return this.room?.hostId === this.playerId; }

  subscribe(cb: () => void) { this.metaL.add(cb); return () => this.metaL.delete(cb); }
  subscribeEvents(cb: (e: GameEvent) => void) {
    this.evL.add(cb);
    if (this.game) cb({ type: 'state', state: this.game });
    return () => this.evL.delete(cb);
  }
  private emitMeta() { for (const cb of this.metaL) cb(); }
  private emitEvent(e: GameEvent) { for (const cb of this.evL) cb(e); }

  metaPlayers(): MetaPlayer[] {
    const ids = this.game?.players.map((p) => p.id) ?? this.room?.members.map((m) => m.id) ?? [];
    return ids.map((id, i) => {
      const m = this.room?.members.find((x) => x.id === id);
      return {
        id,
        name: m?.name ?? this.game?.players.find((p) => p.id === id)?.name ?? '?',
        avatar: m?.avatar ?? '🎲',
        color: COLORS[i % COLORS.length],
        isBot: !!m?.bot,
        connected: !!m && m.connected && !m.left,
        isMe: id === this.playerId,
        isHost: m?.isHost && !this.room?.tournament,
        account: m?.account,
        photo: m?.photo,
        title: m?.title,
        accessory: m?.accessory,
        prestige: m?.prestige,
        dice: m?.dice ?? 'dice-ivoire',
      };
    });
  }
}

/** Adaptateur de la session en ligne vers l'interface commune de l'écran de jeu. */
export class OnlineController implements GameController {
  readonly mode = 'online' as const;
  constructor(private s: OnlineSession) {}
  get meId() { return this.s.playerId; }
  getMeta() { return this.s.metaPlayers(); }
  subscribeEvents(cb: (e: GameEvent) => void) { return this.s.subscribeEvents(cb); }
  subscribeMeta(cb: () => void) { return this.s.subscribe(cb); }
  roll(keep: boolean[], version: number, gesture?: ThrowGesture) { return this.s.act('roll', { keep, version, gesture }); }
  stop(version: number) { return this.s.act('stop', { version }); }
  notifyIdle() {}
  /** Un ordinateur est en train de jouer : on l'indique comme en solo. */
  thinkingId() {
    const g = this.s.game;
    if (!g || g.phase === 'fini') return null;
    const id = currentPlayerId(g);
    return this.s.room?.members.find((m) => m.id === id)?.bot ? id : null;
  }
  turnDeadline() { return this.s.room?.turnDeadline ?? null; }
  turnSeconds() { return this.s.room?.config.turnSeconds ?? 0; }
  sendEmote(emote: string) { void this.s.act('emote', { emote }); }
  subscribeEmotes(cb: (playerId: string, emote: string) => void) { this.s.emoteL.add(cb); return () => { this.s.emoteL.delete(cb); }; }
  canRematch() { return this.s.isHost && !this.s.room?.tournament; }
  rematch() { void this.s.rematch(); }
  /** En tournoi, quitter l'écran de la table ne quitte pas le tournoi (on revient au tableau). */
  leave() { if (!this.s.tcode) this.s.leave(); }
}
