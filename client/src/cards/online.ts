/**
 * Coups Fourrés en ligne : connexion au serveur (espace Socket.IO « /cf », comptes seulement) et
 * contrôleur de partie `CfController` (même contrat que la partie contre l'ordinateur).
 *
 * Utilisation type :
 *   const cf = new CfOnline(token);
 *   cf.onGame((ctrl) => afficherPartie(ctrl));       // partie trouvée / défi accepté / table lancée / reprise
 *   cf.onChange(() => rafraichir(cf));                // file, table, défis reçus, tchat…
 *   cf.presence(true);                                // « Dans Coups Fourrés » pour les amis
 *   await cf.queueJoin();                             // file classée ; cf.queue.offer → proposer l'ordinateur
 *
 * Aucune interface ici. Le serveur fait foi : ce code n'envoie que des intentions.
 */
import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from '../platform';
import type { CfAction, CfEvent } from '../../../shared/cards/engine';
import {
  CF_SPECTATOR_ID, type CfAck, type CfChallengeMsg, type CfChatMsg, type CfGameMode, type CfHelloMsg, type CfQueueMsg,
  type CfStateMsg, type CfTableMsg,
} from '../../../shared/cards/protocol';
import type { CfController, CfSnapshot } from './controller';

export type { CfChallengeMsg, CfChatMsg, CfTableMsg, CfQueueMsg, CfGameMode };

/** Contrôleur d'une partie en ligne (joueur ou spectateur). */
export class CfOnlineController implements CfController {
  readonly kind = 'online' as const;
  readonly id: string;
  readonly mode: CfGameMode;
  readonly ranked: boolean;
  /** Mon siège ; « spectateur » quand on regarde. */
  readonly me: string;
  readonly spectator: boolean;
  /** Avis du serveur (déconnexion d'un joueur, action automatique…), du plus ancien au plus récent. */
  notices: string[] = [];
  /** Tchat de la table (50 derniers messages) et réactions. */
  chat: CfChatMsg[] = [];
  private snap: CfSnapshot | null = null;
  private subs = new Set<(snap: CfSnapshot, events: CfEvent[]) => void>();
  private emoteSubs = new Set<(playerId: string, emote: string) => void>();
  private closed = false;

  constructor(private session: CfOnline, msg: CfStateMsg) {
    this.id = msg.id;
    this.mode = msg.mode;
    this.ranked = msg.ranked;
    this.me = msg.you ?? CF_SPECTATOR_ID;
    this.spectator = msg.you == null;
  }

  /** Appelé par la session à chaque `cf:state`. */
  receive(msg: CfStateMsg) {
    const w = msg.snap;
    this.snap = {
      view: w.view, legal: w.legal, waitingFor: w.waitingFor, seats: w.seats, deadline: w.deadline, reserve: w.reserve,
      finished: w.finished, responseWindow: w.responseWindow,
    };
    for (const cb of this.subs) cb(this.snap, msg.events);
  }
  notice(text: string) { this.notices = [...this.notices.slice(-9), text]; }
  addChat(m: CfChatMsg) { this.chat = [...this.chat.slice(-49), m]; }
  emote(playerId: string, emote: string) { for (const cb of this.emoteSubs) cb(playerId, emote); }

  current() { return this.snap; }
  /** L'écran a fini d'animer : les 30 s de la décision partent (le serveur ne compte pas avant). */
  private readySent = -1;
  ready() {
    const v = this.snap?.view;
    if (this.spectator || this.closed || !v || this.readySent === v.version) return;
    this.readySent = v.version;
    void this.session.call('cf:ready', { id: this.id });
  }
  subscribe(cb: (snap: CfSnapshot, events: CfEvent[]) => void) {
    this.subs.add(cb);
    if (this.snap) cb(this.snap, []);
    return () => { this.subs.delete(cb); };
  }
  /** Réactions des joueurs (même liste fermée que le jeu de base). */
  onEmote(cb: (playerId: string, emote: string) => void) { this.emoteSubs.add(cb); return () => { this.emoteSubs.delete(cb); }; }

  async act(action: CfAction): Promise<string | null> {
    if (this.spectator) return 'Vous regardez la partie : les spectateurs ne jouent pas.';
    const a = await this.session.call('cf:act', { id: this.id, action });
    return a.ok ? null : a.error;
  }
  sendChat(text: string) { return this.session.call('cf:chat', { text }); }
  sendEmote(emote: string) { return this.session.call('cf:emote', { emote }); }
  /** Abandonner (joueur : défaite ; en classée, abandon = défaite) ou arrêter de regarder. */
  leave() {
    if (this.closed) return;
    this.closed = true;
    if (this.spectator) void this.session.call('cf:unwatch');
    else if (!this.snap?.finished) void this.session.call('cf:leave', { id: this.id });
    // 0.43 : à 3 ou 4, la partie continue sans vous (le serveur joue) et vous pouvez y revenir depuis le menu.
    const multi = !this.spectator && !this.snap?.finished && (this.snap?.view.players.length ?? 0) > 2;
    this.session.forget(this, multi ? { id: this.id, mode: this.mode, ranked: this.ranked } : null);
  }
  /** Fermer l'écran d'une partie terminée (sans abandon). */
  close() { this.closed = true; this.session.forget(this, null); }
}

/** Session « Coups Fourrés en ligne » : file classée, défis entre amis, tables à code, reprise, spectateur. */
export class CfOnline {
  readonly socket: Socket;
  connected = false;
  /** Partie en cours (joueur ou spectateur). */
  game: CfOnlineController | null = null;
  /** Ce que le serveur sait de moi à la connexion (partie à reprendre…). */
  hello: CfHelloMsg | null = null;
  queue: CfQueueMsg = { waiting: false, since: null, offer: false };
  table: CfTableMsg | null = null;
  /** Tchat du salon d'attente de la table à code (avant le lancement). */
  tableChat: CfChatMsg[] = [];
  /** Défis reçus en attente. */
  challenges: CfChallengeMsg[] = [];
  /** Dernier défi envoyé : sa réponse (« accepte », ou la raison du refus / de l'expiration). */
  sentChallenge: { id: string; closed: string | null } | null = null;
  /** Message à afficher (retiré d'une table, compte suspendu…). */
  alert: string | null = null;
  private inMenu = false;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private changeSubs = new Set<() => void>();
  private gameSubs = new Set<(c: CfOnlineController) => void>();

  constructor(token: string) {
    const opts = { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000, auth: { token } };
    const base = (SERVER_URL ?? '').replace(/\/$/, '');
    this.socket = io(`${base}/cf`, opts);
    const s = this.socket;
    s.on('connect', () => {
      this.connected = true;
      if (this.inMenu) void this.call('cf:presence', { in: true });
      // Reconnexion : on reprend la partie ou on revient regarder.
      if (this.game && !this.game.spectator && !this.game.current()?.finished) void this.call('cf:resume', { id: this.game.id });
      else if (this.game?.spectator) void this.call('cf:watch', { code: this.game.id });
      this.changed();
    });
    s.on('disconnect', () => { this.connected = false; this.changed(); });
    s.on('connect_error', (e: Error) => { this.connected = false; if (/compte|suspendu/i.test(e.message)) this.alert = e.message; this.changed(); });
    s.on('cf:hello', (h: CfHelloMsg) => { this.hello = h; this.challenges = h.challenges; this.changed(); });
    s.on('cf:state', (m: CfStateMsg) => {
      let isNew = false;
      if (!this.game || this.game.id !== m.id) { this.game = new CfOnlineController(this, m); isNew = true; }
      this.game.receive(m);
      if (isNew) for (const cb of this.gameSubs) cb(this.game);
      this.changed();
    });
    s.on('cf:notice', ({ text }: { text: string }) => { this.game?.notice(text); this.changed(); });
    s.on('cf:chat', (m: CfChatMsg) => {
      if (this.game) this.game.addChat(m);
      else if (this.table) this.tableChat = [...this.tableChat.slice(-49), m];
      this.changed();
    });
    s.on('cf:emote', ({ playerId, emote }: { playerId: string; emote: string }) => this.game?.emote(playerId, emote));
    s.on('cf:queue', (q: CfQueueMsg) => { this.queue = q; this.changed(); });
    s.on('cf:table', (t: CfTableMsg) => { if (this.table?.code !== t.code) this.tableChat = []; this.table = t; this.changed(); });
    s.on('cf:table:kicked', ({ text }: { text: string }) => { this.table = null; this.alert = text; this.changed(); });
    s.on('cf:challenge:incoming', (ch: CfChallengeMsg) => { this.challenges = [...this.challenges.filter((x) => x.id !== ch.id), ch]; this.changed(); });
    s.on('cf:challenge:closed', ({ id, reason }: { id: string; reason: string }) => {
      this.challenges = this.challenges.filter((x) => x.id !== id);
      if (this.sentChallenge?.id === id) this.sentChallenge = { id, closed: reason };
      this.changed();
    });
    s.on('cf:replaced', ({ text }: { text: string }) => { this.alert = text; this.changed(); });
    s.on('account:banned', ({ text }: { text: string }) => { window.dispatchEvent(new CustomEvent('421:banned', { detail: text })); this.alert = text; this.changed(); });
  }

  /** Commande au serveur, avec accusé (erreur en français prête à afficher). */
  call<T extends object = object>(ev: string, payload: object = {}): Promise<CfAck<T>> {
    return new Promise((resolve) => {
      if (!this.socket.connected) return resolve({ ok: false, error: 'Connexion au serveur impossible.' });
      const t = setTimeout(() => resolve({ ok: false, error: 'Le serveur ne répond pas.' }), 8000);
      this.socket.emit(ev, payload, (a: CfAck<T>) => { clearTimeout(t); resolve(a); });
    });
  }
  waitConnected(ms = 6000): Promise<boolean> {
    if (this.socket.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), ms);
      this.socket.once('connect', () => { clearTimeout(t); resolve(true); });
    });
  }
  private async send<T extends object = object>(ev: string, payload: object = {}): Promise<T> {
    if (!(await this.waitConnected())) throw new Error('Impossible de joindre le serveur de jeu.');
    const a = await this.call<T>(ev, payload);
    if (!a.ok) throw new Error(a.error);
    return a;
  }

  /** Changements de la session (file, table, défis, tchat, connexion…). */
  onChange(cb: () => void) { this.changeSubs.add(cb); return () => { this.changeSubs.delete(cb); }; }
  /** Une partie commence (ou reprend) : afficher l'écran de partie avec ce contrôleur. */
  onGame(cb: (c: CfOnlineController) => void) { this.gameSubs.add(cb); return () => { this.gameSubs.delete(cb); }; }
  private changed() { for (const cb of this.changeSubs) cb(); }
  /** Appelé par le contrôleur quand on quitte l'écran de partie. */
  /** L'écran de partie se ferme : `resumable` = la partie qu'on peut encore reprendre depuis le menu (sinon plus rien). */
  forget(c: CfOnlineController, resumable: CfHelloMsg['game'] = null) {
    if (this.hello && !c.spectator) this.hello = { ...this.hello, game: resumable };
    if (this.game === c) { this.game = null; this.changed(); }
  }

  // --- Présence ---
  /** Entrée (true) / sortie (false) du menu du mode : les amis voient « Dans Coups Fourrés ». */
  presence(inMenu: boolean) {
    this.inMenu = inMenu;
    void this.call('cf:presence', { in: inMenu });
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    this.presenceTimer = inMenu ? setInterval(() => void this.call('cf:presence', { in: true }), 45_000) : null;
  }

  // --- Classée ---
  /** Rejoindre la file classée (deck actif, ou celui indiqué). Au bout de 60 s, `queue.offer` passe à true. */
  async queueJoin(deckId?: string) { await this.send('cf:queue:join', { deckId }); }
  async queueLeave() { await this.call('cf:queue:leave'); this.queue = { waiting: false, since: null, offer: false }; this.changed(); }

  // --- Défis entre amis ---
  async challenge(username: string, deckId?: string) {
    const a = await this.send<{ id: string }>('cf:challenge', { username, deckId });
    this.sentChallenge = { id: a.id, closed: null };
    this.changed();
    return a.id;
  }
  async cancelChallenge() { if (this.sentChallenge) await this.call('cf:challenge:cancel', { id: this.sentChallenge.id }); this.sentChallenge = null; this.changed(); }
  /** Accepter (la partie démarre : onGame) ou refuser un défi reçu. */
  async answerChallenge(id: string, accept: boolean, deckId?: string) {
    this.challenges = this.challenges.filter((x) => x.id !== id);
    this.changed();
    await this.send('cf:challenge:answer', { id, accept, deckId });
  }

  // --- Table privée à code (2 à 4 joueurs) ---
  async tableCreate(deckId?: string) { return (await this.send<{ code: string }>('cf:table:create', { deckId })).code; }
  async tableJoin(code: string, deckId?: string) { return (await this.send<{ code: string }>('cf:table:join', { code, deckId })).code; }
  async tableDeck(deckId: string) { await this.send('cf:table:deck', { deckId }); }
  /** L'hôte retire un joueur (par son pseudo) avant le départ. */
  async tableKick(account: string) { await this.send('cf:table:kick', { account }); }
  async tableStart() { await this.send('cf:table:start'); }
  async tableLeave() { await this.call('cf:table:leave'); this.table = null; this.tableChat = []; this.changed(); }
  /** Message dans le tchat du salon d'attente (même modération que le tchat de partie). */
  tableSay(text: string) { return this.call('cf:chat', { text }); }

  // --- Partie ---
  /** Reprendre la partie en cours (après rechargement : voir `hello.game`). */
  async resume(id?: string): Promise<CfOnlineController> {
    const a = await this.send<{ id: string }>('cf:resume', { id });
    return this.waitGame(a.id);
  }
  /** Regarder une partie (code de la partie, ou celui donné par la présence d'un ami). */
  async watch(code: string): Promise<CfOnlineController> {
    if (this.game && this.game.spectator && this.game.id !== code) this.game.leave();
    const a = await this.send<{ id: string }>('cf:watch', { code });
    return this.waitGame(a.id);
  }
  private waitGame(id: string): Promise<CfOnlineController> {
    if (this.game?.id === id) return Promise.resolve(this.game);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error('Le serveur ne répond pas.')); }, 8000);
      const off = this.onGame((c) => { if (c.id === id) { clearTimeout(t); off(); resolve(c); } });
    });
  }

  close() {
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    this.socket.disconnect();
    this.changeSubs.clear();
    this.gameSubs.clear();
  }
}
