/**
 * Poker menteur en ligne, côté navigateur : connexion à l'espace « /poker » du serveur. Ce code
 * n'envoie que des intentions (croire, menteur, positions à relancer, annonce) ; le serveur tire les
 * dés, vérifie tout et renvoie à chacun SA vue de l'état (les dés seulement au détenteur du gobelet).
 */
import { io, type Socket } from 'socket.io-client';
import type { Ack, ChatMessage, Notice } from '../../../shared/protocol';
import type { PmAction, PmLevel, PmOptions, PmState } from '../../../shared/pokermenteur/engine';
import type { PmPublicTable, PmRewardMsg, PmUpdate } from '../../../shared/pokermenteur/protocol';
import { SERVER_URL } from '../platform';
import { trackEvent } from '../visit';

const SKEY = '421.poker.session';
export interface PmSaved { code: string; token: string }
export function loadPmSession(): PmSaved | null {
  try { const r = localStorage.getItem(SKEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function savePmSession(s: PmSaved | null) {
  try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch { /* */ }
}

export type PmUp = PmUpdate | { snapshot: true; version: number; state: PmState };

export class PmSession {
  socket: Socket;
  code = '';
  playerId = '';
  private token = '';
  table: PmPublicTable | null = null;
  state: PmState | null = null;
  version = 0;
  connected = false;
  notices: (Notice & { id: number; at: number })[] = [];
  chat: ChatMessage[] = [];
  spectating = false;
  watchClosed: string | null = null;
  kicked: string | null = null;
  reward: PmRewardMsg | null = null;
  closed = false;
  private noticeId = 0;
  private metaL = new Set<() => void>();
  private upL = new Set<(u: PmUp) => void>();
  emoteL = new Set<(playerId: string, emote: string) => void>();
  private watchName = '';

  constructor(public auth: string | null, private me: { name: string; avatar: string; dice?: string }) {
    const opts = { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 };
    this.socket = SERVER_URL ? io(`${SERVER_URL.replace(/\/$/, '')}/poker`, opts) : io('/poker', opts);
    this.socket.on('connect', () => {
      this.connected = true;
      if (this.spectating && this.code) void this.call('spectate:join', { code: this.code, name: this.watchName, auth: this.auth });
      else if (this.code && this.token) void this.call('table:join', { code: this.code, token: this.token, auth: this.auth });
      this.emit();
    });
    this.socket.on('disconnect', () => { this.connected = false; this.emit(); });
    this.socket.on('connect_error', () => { this.connected = false; this.emit(); });
    this.socket.on('table:state', (t: PmPublicTable) => {
      if (this.table?.status === 'playing' && t.status === 'lobby') { this.state = null; this.reward = null; }
      this.table = t;
      this.emit();
    });
    this.socket.on('game:state', (m: { version: number; state: PmState } | null) => {
      if (!m) { this.state = null; this.version = 0; this.emit(); return; }
      this.state = m.state; this.version = m.version;
      for (const cb of this.upL) cb({ snapshot: true, version: m.version, state: m.state });
      this.emit();
    });
    this.socket.on('game:update', (u: PmUpdate) => {
      this.state = u.state; this.version = u.version;
      for (const cb of this.upL) cb(u);
      this.emit();
    });
    this.socket.on('profile:reward', (r: PmRewardMsg) => { this.reward = r; this.emit(); });
    this.socket.on('game:emote', (m: { playerId: string; emote: string }) => { for (const cb of this.emoteL) cb(m.playerId, m.emote); });
    this.socket.on('table:chat', (m: ChatMessage) => { this.chat = [...this.chat.slice(-49), m]; this.emit(); });
    this.socket.on('table:notice', (n: Notice) => { this.notices = [...this.notices.slice(-4), { ...n, id: ++this.noticeId, at: Date.now() }]; this.emit(); });
    this.socket.on('table:kicked', ({ text }: { text: string }) => { this.kicked = text; this.code = ''; savePmSession(null); this.emit(); });
    this.socket.on('spectate:closed', ({ text }: { text: string }) => { this.watchClosed = text; this.emit(); });
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
    return new Promise((resolve) => { const t = setTimeout(() => resolve(false), ms); this.socket.once('connect', () => { clearTimeout(t); resolve(true); }); });
  }
  private base() { return { name: this.me.name, avatar: this.me.avatar, dice: this.me.dice, auth: this.auth }; }
  private async enter(ev: string, payload: object) {
    if (!(await this.waitConnected())) throw new Error('Impossible de joindre le serveur de jeu');
    const a = await this.call<{ code: string; playerId: string; token: string }>(ev, { ...this.base(), ...payload });
    if (!a.ok) throw new Error(a.error);
    trackEvent('online');
    this.code = a.code; this.playerId = a.playerId; this.token = a.token;
    savePmSession({ code: a.code, token: a.token });
    this.emit();
  }
  create(o: { options: PmOptions; visibility: 'private' | 'public' }) { return this.enter('table:create', o); }
  join(code: string) { return this.enter('table:join', { code }); }
  quick() { return this.enter('table:quick', {}); }
  async resume(saved: PmSaved) {
    try { await this.enter('table:join', { code: saved.code, token: saved.token }); } catch (e) { savePmSession(null); throw e; }
  }
  async watch(code: string, name: string) {
    if (!(await this.waitConnected())) throw new Error('Impossible de joindre le serveur de jeu');
    const a = await this.call<{ code: string }>('spectate:join', { code, name, auth: this.auth });
    if (!a.ok) throw new Error(a.error);
    this.spectating = true; this.watchName = name; this.code = a.code; this.playerId = '';
    this.emit();
  }
  addBot(level: PmLevel) { return this.call('table:addBot', { level }); }
  removeBot(id: string) { return this.call('table:removeBot', { id }); }
  kick(playerId: string) { return this.call('table:kick', { playerId }); }
  setReady(ready: boolean) { return this.call('table:ready', { ready }); }
  config(c: { options?: Partial<PmOptions>; visibility?: 'private' | 'public' }) { return this.call('table:config', c); }
  start() { return this.call('table:start'); }
  rematch() { return this.call('table:rematch'); }
  async act(action: PmAction): Promise<string | null> {
    const a = await this.call('game:act', { action, version: this.version });
    return a.ok ? null : a.error;
  }
  sendEmote(emote: string) { void this.call('game:emote', { emote }); }
  sendChat(text: string): Promise<string | null> { return this.call('table:chat', { text }).then((a) => (a.ok ? null : a.error)); }
  get chatId() { return this.spectating ? `spectateur:${this.socket.id}` : this.playerId; }
  get isHost() { return this.table?.hostId === this.playerId; }

  /** Quitter : en partie, la place est gardée (le serveur joue pour vous) et l'on peut revenir. */
  leave() {
    if (this.closed) return;
    this.closed = true;
    if (this.spectating) {
      if (this.socket.connected) this.socket.emit('spectate:leave', {}, () => this.socket.disconnect()); else this.socket.disconnect();
    } else {
      const running = this.table?.status === 'playing' && !!this.state && this.state.phase !== 'fini' && this.state.players.some((p) => p.id === this.playerId);
      savePmSession(running && this.code && this.token ? { code: this.code, token: this.token } : null);
      if (this.socket.connected) this.socket.emit('table:leave', {}, () => this.socket.disconnect()); else this.socket.disconnect();
    }
    setTimeout(() => this.socket.disconnect(), 800);
  }
  subscribe(cb: () => void) { this.metaL.add(cb); return () => { this.metaL.delete(cb); }; }
  subscribeUpdates(cb: (u: PmUp) => void) { this.upL.add(cb); return () => { this.upL.delete(cb); }; }
  tick = 0;
  private emit() { this.tick++; for (const cb of this.metaL) cb(); }
}
