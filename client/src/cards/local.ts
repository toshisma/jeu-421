/**
 * Coups Fourrés : partie contre l'ordinateur, sur l'appareil (implémente CfController).
 *
 * - Compte : le serveur donne la graine et les decks (POST /api/cf/bot/start), le client joue avec
 *   shared/cards/botmatch.ts, puis renvoie SES actions (POST /api/cf/bot/end) : le serveur rejoue la
 *   partie à l'identique avant de donner des capsules. Pour que ce rejeu soit identique, les ordinateurs
 *   jouent TOUT ce qu'ils ont à jouer avant que la main revienne au joueur (même ordre qu'advanceBots).
 * - Invité, ou serveur indisponible : graine locale, decks de départ, aucune récompense.
 *
 * Les ordinateurs jouent un pas à la fois : l'écran finit d'animer le pas précédent, puis une courte pause
 * « humaine » (selon le coup : presque rien pour un « je laisse faire », un peu plus pour une carte).
 * Pauses désactivables pour les tests (pace 0).
 */
import { ApiError } from '../account/api';
import { cfBotAbandon, cfBotEnd, cfBotStart } from './api';
import type { TourStep } from './tour';
import { CARDS, STARTER_DECKS } from '../../../shared/cards/catalog';
import { buildAutoDeck } from '../../../shared/cards/autodeck';
import { CF_LEVEL_LABEL, type CfLevel } from '../../../shared/cards/ai';
import { botToPlay, playMine, startBotMatch, stepBotAction, type BotMatch, type BotMatchSetup } from '../../../shared/cards/botmatch';
import { actionKey, decisionKind, defaultAction, eventsFor, legalActions, viewFor, waitingFor, type CfAction, type CfEvent } from '../../../shared/cards/engine';
import { ScreenGate, type CfController, type CfSeat, type CfSnapshot } from './controller';

export const deckList = (d: Record<string, number>) => Object.entries(d).flatMap(([id, n]) => Array<string>(n).fill(id));

/** Les ordinateurs du comptoir (noms originaux). */
export const CF_BOTS: Record<CfLevel, { name: string; avatar: string; blurb: string }> = {
  debutant: { name: 'P’tit Louis', avatar: '🧢', blurb: 'Garde ses as et joue ses cartes un peu au hasard.' },
  habitue: { name: 'Dédé du comptoir', avatar: '🍺', blurb: 'Compte ses coups et garde de quoi répondre.' },
  'fine-fouine': { name: 'Mado la Fouine', avatar: '🦊', blurb: 'Calcule tout, lit vos Tournées et bluffe.' },
};

export interface LocalCfOptions {
  level: CfLevel;
  me: { name: string; avatar?: string; photo?: string | null; account?: string };
  /** Deck du joueur (20 identifiants) et son identifiant enregistré (comptes). */
  deck: string[];
  deckId?: string | null;
  /** Jeton de session : partie récompensée via le serveur si possible. */
  token?: string | null;
  /** Minuteur de décision (30 s + réserve de 60 s). */
  timed?: boolean;
  /** Pauses des ordinateurs (ms) ; 0 pour les tests. */
  pace?: number;
  /** Graine imposée (tests). */
  seed?: number;
  /** Nombre d'ordinateurs (1 à 3). */
  opponents?: number;
  /** Partie guidée à plusieurs : visite de l'écran au début, sans minuteur. */
  tour?: boolean;
  /** Bulles d'accueil propres à cette partie (parcours débutant), à la place de la visite standard. */
  tourSteps?: TourStep[];
}

/** Autres habitués du comptoir pour les parties à plusieurs (noms originaux). */
const MORE_BOTS = [{ name: 'Bébert la Tournée', avatar: '🎩' }, { name: 'Josette du coin', avatar: '💄' }, { name: 'Le Grand Roger', avatar: '🧔' }];

/** Deck de l'ordinateur hors serveur : un deck de départ, ou un deck complet pour la Fine fouine. */
function localBotDeck(level: CfLevel, mine: string[], rnd: () => number): string[] {
  if (level === 'fine-fouine') {
    const all = Object.fromEntries(CARDS.map((c) => [c.id, 2]));
    const d = buildAutoDeck(all);
    if (d) return deckList(d);
  }
  const key = [...mine].sort().join(',');
  const others = STARTER_DECKS.filter((s) => deckList(s.cards).sort().join(',') !== key);
  const pick = others.length ? others[Math.floor(rnd() * others.length)] : STARTER_DECKS[0];
  return deckList(pick.cards);
}

export class LocalCfController implements CfController {
  readonly kind = 'bot' as const;
  readonly ranked = false;
  readonly me: string;
  /** Partie enregistrée sur le serveur (récompenses possibles). */
  readonly rewarded: boolean;
  /** Message à montrer au début (ex. « partie d'entraînement, non récompensée »). */
  readonly notice: string | null;
  readonly level: CfLevel;
  /** Visite guidée de l'écran au début (partie guidée à plusieurs). */
  readonly tour: boolean;
  readonly tourSteps: TourStep[] | null;
  private match: BotMatch;
  private gameId: string | null;
  private token: string | null;
  private seats: CfSeat[];
  private subs = new Set<(snap: CfSnapshot, events: CfEvent[]) => void>();
  private snap: CfSnapshot | null = null;
  private pace: number;
  private timed: boolean;
  private running = false;
  private closed = false;
  private finished: CfSnapshot['finished'] = null;
  private deadline: number | null = null;
  private reserve: number;
  private turnStart = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingStart: CfEvent[];
  /** Actions envoyées au serveur à la fin (= match.mine). */
  get actions(): CfAction[] { return this.match.mine; }
  get setup(): BotMatchSetup { return this.match.setup; }

  private constructor(o: LocalCfOptions, setup: BotMatchSetup, gameId: string | null, notice: string | null) {
    this.level = o.level;
    this.gameId = gameId;
    this.rewarded = !!gameId;
    this.notice = notice;
    this.token = o.token ?? null;
    this.pace = o.pace ?? 1;
    this.tour = !!o.tour || !!o.tourSteps?.length;
    this.tourSteps = o.tourSteps ?? null;
    this.timed = o.timed ?? true;
    this.reserve = 60;
    this.me = setup.me.id;
    // Partie déterministe : les ordinateurs ont déjà fait leur main de départ (advanceBots au départ).
    const { match, events } = startBotMatch(setup);
    this.match = match;
    this.pendingStart = events;
    this.seats = [
      { id: setup.me.id, name: o.me.name || setup.me.name, avatar: o.me.avatar, photo: o.me.photo ?? undefined, account: o.me.account },
      ...setup.bots.map((b) => ({ id: b.id, name: b.name, bot: true, avatar: CF_BOTS[b.level]?.avatar ?? '🤖', label: CF_LEVEL_LABEL[b.level] })),
    ];
  }

  /**
   * Prépare une partie : avec un compte, demande la graine et les decks au serveur ; sinon (ou si le
   * serveur ne connaît pas encore la route), partie locale non récompensée.
   */
  static async create(o: LocalCfOptions): Promise<LocalCfController> {
    if (o.token) {
      try {
        const r = await cfBotStart(o.token, o.level, o.deckId ?? undefined, o.opponents ?? 1);
        if (r && typeof r.seed === 'number' && r.me && Array.isArray(r.bots) && r.bots.length) {
          return new LocalCfController(o, { seed: r.seed, me: r.me, bots: r.bots }, r.gameId, null);
        }
      } catch (e) {
        // Refus explicite du serveur (deck invalide…) : on le dit. Route absente (404) : partie locale.
        if (e instanceof ApiError && e.status !== 404 && e.status !== 0) throw e;
      }
    }
    const seed = o.seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0 || 1);
    let s = seed;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const bot = CF_BOTS[o.level];
    const setup: BotMatchSetup = {
      seed,
      me: { id: 'moi', name: o.me.name || 'Vous', deck: o.deck },
      bots: [{ id: 'ordi', name: bot.name, deck: o.deckId?.startsWith('parcours:') ? [...o.deck] : localBotDeck(o.level, o.deck, rnd), level: o.level },
        ...MORE_BOTS.slice(0, Math.min(3, Math.max(1, o.opponents ?? 1)) - 1).map((b, i) => ({ id: `ordi${i + 2}`, name: b.name, deck: localBotDeck(o.level, o.deck, rnd), level: o.level }))],
    };
    const notice = o.tour ? null : o.token ? 'Partie d’entraînement : elle ne rapporte pas de capsules cette fois.' : 'Partie d’essai : créez un compte gratuit pour gagner des capsules et ouvrir des boosters.';
    return new LocalCfController(o, setup, null, notice);
  }

  current(): CfSnapshot | null { return this.snap; }

  subscribe(cb: (snap: CfSnapshot, events: CfEvent[]) => void): () => void {
    this.subs.add(cb);
    if (!this.snap) {
      // Premier abonné : l'état de départ, puis les ordinateurs s'il leur revient d'agir.
      this.publish(this.pendingStart);
      this.pendingStart = [];
      void this.runBots();
    } else cb(this.snap, []);
    return () => { this.subs.delete(cb); };
  }

  async act(action: CfAction): Promise<string | null> {
    if (this.closed) return 'La partie est terminée.';
    if (this.running) return 'Patientez : l’ordinateur joue.';
    this.consumeReserve();
    const r = playMine(this.match, action);
    if (!r.ok) return r.error ?? 'Action impossible.';
    this.clearTimer();
    this.publish(r.events);
    await this.runBots();
    return null;
  }

  /** L'écran a fini ses annonces : le minuteur de la décision part de maintenant (une fois par décision). */
  private readyFor = -1;
  ready(): void {
    const st = this.match.state;
    if (!this.timed || this.closed || this.running || this.readyFor === st.decisions || !waitingFor(st).includes(this.me)) return;
    this.readyFor = st.decisions;
    this.armTimer();
    this.publish([]);
  }

  leave(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearTimer();
    this.gate.release();
    if (this.gameId && this.token && this.match.state.phase !== 'over') {
      void cfBotAbandon(this.token, this.gameId).catch(() => {});
    }
  }

  // ----------------------------------------------------------------------------------------------

  /** Fait jouer les ordinateurs jusqu'à ce que ce soit au joueur (ou fin de partie). */
  private async runBots() {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.closed && botToPlay(this.match)) {
        const kind = decisionKind(this.match.state);
        // Le coup est décidé tout de suite (même ordre que le rejeu serveur), puis montré après la pause.
        const step = stepBotAction(this.match)!;
        await this.pause(kind, step.action);
        if (this.closed) return;
        this.publish(step.events);
      }
    } finally {
      this.running = false;
    }
    if (this.closed) return;
    if (this.match.state.phase === 'over') { await this.finish(); return; }
    this.armTimer();
    this.publish([]);
  }

  /** L'écran du joueur anime (true) ou est au repos (false). */
  private gate = new ScreenGate();
  screen(busy: boolean) { this.gate.set(busy); }

  /**
   * Pause « humaine » avant de montrer le coup de l'ordinateur. Elle part quand l'écran a fini
   * d'animer le coup précédent : enchaînements réguliers (≈ 0,5 à 0,9 s), jamais de rafale ni de
   * longue attente. Un simple « je laisse faire » ne fait presque pas attendre.
   */
  /** Vitesse ×2 de l'écran : pauses des ordinateurs plus courtes (1 = normal, 0,5 = deux fois plus vite). */
  setPace(p: number) { if (this.pace > 0) this.pace = p; }

  private async pause(kind: ReturnType<typeof decisionKind>, action: CfAction): Promise<void> {
    if (this.pace <= 0) return;
    await this.gate.idle();
    let ms: number;
    if (action.type === 'pass') ms = 150;
    else if (kind === 'respond' || kind === 'lastword') ms = 700;
    else if (kind === 'mulligan') ms = 250;
    else if (kind === 'discard') ms = 400;
    else if (action.type === 'play') ms = 650 + Math.random() * 250;
    else if (action.type === 'stop') ms = 450 + Math.random() * 200;
    else ms = 500 + Math.random() * 250;
    await new Promise((r) => setTimeout(r, ms * this.pace));
  }

  private async finish() {
    const st = this.match.state;
    const standings = [...st.ranking];
    this.finished = { standings };
    this.closed = true;
    this.clearTimer();
    this.publish([]);
    if (!this.gameId || !this.token) return;
    try {
      const r = await cfBotEnd(this.token, this.gameId, this.match.mine);
      this.finished = { standings, reward: r.reward ?? { note: 'Plafond du jour atteint : pas de capsules pour cette partie.' } };
    } catch (e) {
      this.finished = { standings, reward: { error: e instanceof Error ? e.message : 'Résultat non enregistré.' } };
    }
    this.publish([]);
  }

  // --- minuteur (30 s par décision + réserve de 60 s pour la partie) ----------------------------
  private static GRACE = 2500;
  private armTimer() {
    this.clearTimer();
    if (!this.timed || !waitingFor(this.match.state).includes(this.me)) { this.deadline = null; return; }
    this.turnStart = Date.now();
    // Comme en ligne : `deadline` = fin des 30 s ; ensuite la réserve s'écoule.
    this.deadline = this.turnStart + LocalCfController.GRACE + this.match.state.rules.decisionSeconds * 1000;
    this.timer = setTimeout(() => void this.onTimeout(), this.deadline + this.reserve * 1000 - Date.now());
  }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private consumeReserve() {
    if (!this.timed || !this.turnStart) return;
    const used = (Date.now() - this.turnStart - LocalCfController.GRACE) / 1000 - this.match.state.rules.decisionSeconds;
    if (used > 0) this.reserve = Math.max(0, this.reserve - used);
    this.turnStart = 0;
  }
  private async onTimeout() {
    this.timer = null;
    if (this.closed || this.running) return;
    const a = defaultAction(this.match.state, this.me);
    if (!a) return;
    this.reserve = 0;
    this.turnStart = 0;
    await this.act(a);
  }

  private publish(events: CfEvent[]) {
    const st = this.match.state;
    const mine = waitingFor(st).includes(this.me) && !this.running;
    const snap: CfSnapshot = {
      view: viewFor(st, this.me),
      legal: mine && !this.closed ? legalActions(st, this.me) : [],
      waitingFor: waitingFor(st),
      seats: this.seats,
      deadline: mine && this.timed ? this.deadline : null,
      reserve: { [this.me]: Math.round(this.reserve) },
      finished: this.finished,
    };
    this.snap = snap;
    const ev = eventsFor(events, this.me);
    for (const cb of [...this.subs]) cb(snap, ev);
  }
}

/** Vérifie qu'une action fait bien partie des actions légales (comparaison canonique). */
export const isLegal = (legal: CfAction[], a: CfAction) => legal.some((x) => actionKey(x) === actionKey(a));
