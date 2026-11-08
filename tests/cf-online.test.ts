/**
 * Coups Fourrés en ligne : deck automatique, parties contre l'ordinateur vérifiées par le serveur,
 * et parties en ligne par de vrais sockets (clients de test pilotés par l'IA) : duel entre amis,
 * information cachée, fenêtres de réponse, temps écoulé, classée, abandon, reconnexion, table à 3,
 * spectateur, tchat et modération, présence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { cfAdminAdjust, cfCollection } from '../server/cards';
import { CF_BOT_NAMES } from '../server/cards-online';
import { mulberry32 } from '../shared/rng';
import { cfDecide } from '../shared/cards/ai';
import { advanceBots, playMine, startBotMatch, type BotMatchSetup } from '../shared/cards/botmatch';
import { apply, legalActions, newGame, viewFor, waitingFor, type CfAction } from '../shared/cards/engine';
import { CAPSULES, CARDS, deckProblems } from '../shared/cards/catalog';
const CARD_TYPE: Record<string, string> = Object.fromEntries(CARDS.map((c) => [c.id, c.type]));
import type { CfChallengeMsg, CfHelloMsg, CfQueueMsg, CfStateMsg, CfTableMsg } from '../shared/cards/protocol';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 8000, what = 'condition') {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error(`délai dépassé : ${what}`); await wait(10); }
}
type Acc = { token: string; id: string; name: string };
function apiOf(base: string) {
  return async (path: string, body?: object, token?: string, method?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: method ?? (body ? 'POST' : 'GET'), body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { code: r.status, ...(await r.json()) };
  };
}

// --- Moteur : fenêtres de réponse à l'aveugle -------------------------------------------------------
describe('fenêtres de réponse (moteur, option windows)', () => {
  const deck = (id: string) => Array<string>(20).fill(id);
  /** A joue « Tournée du patron » à son premier lancer ; B est-il interrogé ? */
  function askedAfterCard(bDeck: string[], windows: boolean) {
    let s = newGame({ windows }, [{ id: 'A', deck: deck('tournee-patron') }, { id: 'B', deck: bDeck }], 7);
    for (const id of ['A', 'B']) s = apply(s, id, { type: 'mulligan', cards: [] }).state;
    // 0.41 : 1 Tournée par manche ; réserve pleine pour que la carte et la Riposte soient payables.
    for (const p of s.players) p.tournees = s.rules.tourneesMax;
    const first = waitingFor(s)[0];
    if (first !== 'A') {
      // B mène : il lance puis s'arrête.
      s = apply(s, 'B', { type: 'roll', keep: [false, false, false] }).state;
      if (waitingFor(s)[0] === 'B') s = apply(s, 'B', { type: 'stop' }).state;
    }
    const play = legalActions(s, 'A').find((a) => a.type === 'play')!;
    const r = apply(s, 'A', play);
    return { waiting: waitingFor(r.state), legalB: legalActions(r.state, 'B') };
  }
  it('sans la carte, l’adversaire est interrogé quand même (il ne peut que passer)', () => {
    // On prend la famille des Habitués (Ticket de caisse).
    const noRiposte = askedAfterCard(deck('pilier'), true); // famille Habitués, aucune Riposte en main
    expect(noRiposte.waiting).toEqual(['B']);
    expect(noRiposte.legalB).toEqual([{ type: 'pass' }]);
    const withRiposte = askedAfterCard(deck('ticket-caisse'), true);
    expect(withRiposte.waiting).toEqual(['B']);
    expect(withRiposte.legalB.some((a) => a.type === 'play')).toBe(true);
  });
  it('information publique : un deck sans Riposte possible contre cette carte n’est jamais interrogé ; sans l’option, rien ne change', () => {
    // 0.41 : la Tournée du patron coûte 2, le Pot aux roses (Pièges) pourrait l'annuler ; l'Ivresse, elle,
    // n'a que « Les yeux qui piquent », qui n'annule qu'un Coup qui change des dés.
    expect(askedAfterCard(deck('verre-de-trop'), true).waiting).not.toContain('B');
    expect(askedAfterCard(deck('coup-coude'), false).waiting).not.toContain('B');
  });
  it('une partie complète avec fenêtres se termine (IA des deux côtés)', () => {
    const rng = mulberry32(9);
    let s = newGame({ windows: true }, [{ id: 'A', deck: deck('coup-coude') }, { id: 'B', deck: deck('note-salee') }], 3);
    for (let i = 0; i < 20000 && s.phase !== 'over'; i++) {
      const id = waitingFor(s)[0];
      s = apply(s, id, cfDecide(viewFor(s, id), legalActions(s, id), 'habitue', rng)).state;
    }
    expect(s.phase).toBe('over');
  });
});

// --- Contre l'ordinateur et deck automatique (horloge simulée) -------------------------------------
describe('Coups Fourrés : contre l’ordinateur et deck automatique', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let api: ReturnType<typeof apiOf>;
  let clock = Date.parse('2026-11-10T12:00:00Z');
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, now: () => clock }, cf: { minBotMs: 30_000 } });
    api = apiOf(`http://localhost:${srv.port}`);
  });
  afterAll(async () => { await srv.close(); });
  const reg = async (u: string, discover = true): Promise<Acc> => {
    const r = await api('/register', { username: u, password: 'motdepasse1' });
    if (discover) await api('/cf/discover', {}, r.token);
    return { token: r.token, id: r.user.id, name: u };
  };

  it('deck automatique : créé, valide, limite de 5 decks, refus clair sans 20 cartes', async () => {
    const nobody = await reg('Novice', false);
    expect((await api('/cf/decks/auto', {}, nobody.token)).code).toBe(409);
    expect((await api('/cf/decks/auto', {})).code).toBe(401);
    const a = await reg('Autodeck');
    const r = await api('/cf/decks/auto', {}, a.token);
    expect(r.ok).toBe(true);
    const d = r.state.decks.find((x: { id: string }) => x.id === r.id);
    expect(d.name).toBe('Deck automatique');
    expect(d.valid).toBe(true);
    const r2 = await api('/cf/decks/auto', { name: 'Mon zinc' }, a.token);
    expect(r2.state.decks.find((x: { id: string }) => x.id === r2.id).name).toBe('Mon zinc');
    expect((await api('/cf/decks/auto', {}, a.token)).state.decks.map((x: { name: string }) => x.name)).toContain('Deck automatique 2');
    const full = await api('/cf/decks/auto', {}, a.token);
    expect(full.code).toBe(400);
    expect(full.error).toMatch(/5 decks/);
    // Collection trop petite : refus avec le nombre de cartes utilisables.
    const p = await reg('Pauvre');
    for (const deck of (await api('/cf/me', undefined, p.token)).state.decks) await api(`/cf/decks/${deck.id}`, undefined, p.token, 'DELETE');
    for (const [id, c] of Object.entries(cfCollection(srv.store, p.id))) cfAdminAdjust(srv.store, p.id, 'card', -c.count, id);
    cfAdminAdjust(srv.store, p.id, 'card', 2, 'leurre');
    const poor = await api('/cf/decks/auto', {}, p.token);
    expect(poor.code).toBe(400);
    expect(poor.error).toMatch(/au moins 20 cartes utilisables.*vous en avez 2/);
  });

  /** Joue toute la partie localement, comme le client (mêmes fonctions partagées). */
  function playLocal(setup: BotMatchSetup, seed = 1) {
    const { match } = startBotMatch(setup);
    const rng = mulberry32(seed);
    for (let i = 0; i < 5000 && match.state.phase !== 'over'; i++) {
      const a = cfDecide(viewFor(match.state, setup.me.id), legalActions(match.state, setup.me.id), 'habitue', rng);
      expect(playMine(match, a).ok).toBe(true);
      advanceBots(match);
    }
    expect(match.state.phase).toBe('over');
    return match;
  }

  it('partie jouée puis vérifiée ; triche refusée (actions trafiquées, deux « end », trop rapide, pas finie)', async () => {
    const a = await reg('Joueuse');
    expect((await api('/cf/bot/start', { level: 'expert' }, a.token)).code).toBe(400);
    expect((await api('/cf/bot/start', { level: 'habitue' })).code).toBe(401);
    const s = await api('/cf/bot/start', { level: 'habitue' }, a.token);
    expect(s.ok).toBe(true);
    expect(s.me.deck).toHaveLength(20);
    expect(s.bots).toHaveLength(1);
    expect(CF_BOT_NAMES).toContain(s.bots[0].name);
    expect(s.bots[0].level).toBe('habitue');
    expect(deckProblems(s.bots[0].deck.reduce((m: Record<string, number>, id: string) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {}))).toEqual([]);
    const setup: BotMatchSetup = { seed: s.seed, me: s.me, bots: s.bots };
    const match = playLocal(setup);
    // Trop rapide : refusé, et la partie est consommée.
    const fast = await api('/cf/bot/end', { gameId: s.gameId, actions: match.mine }, a.token);
    expect(fast.code).toBe(400);
    expect(fast.error).toMatch(/trop rapide/);
    expect((await api('/cf/bot/end', { gameId: s.gameId, actions: match.mine }, a.token)).code).toBe(404);

    // Partie honnête.
    const before = (await api('/cf/me', undefined, a.token)).state;
    const s2 = await api('/cf/bot/start', { level: 'debutant' }, a.token);
    const m2 = playLocal({ seed: s2.seed, me: s2.me, bots: s2.bots }, 2);
    clock += 20 * 60_000;
    const other = await reg('Voleur');
    expect((await api('/cf/bot/end', { gameId: s2.gameId, actions: m2.mine }, other.token)).code).toBe(404); // pas sa partie
    const end = await api('/cf/bot/end', { gameId: s2.gameId, actions: m2.mine }, a.token);
    expect(end.ok).toBe(true);
    expect(end.won).toBe(m2.state.winner === 'joueur');
    expect(end.reward.capsules).toBe(CAPSULES.vsBot);
    expect(end.state.history[0]).toMatchObject({ vsBot: true, ranked: false, opponent: 'Ordinateur', result: end.won ? 'victoire' : 'defaite' });
    // 0.39 : partie à 4 contre 3 ordinateurs (noms différents), vérifiée de la même façon.
    const q4 = await api('/cf/bot/start', { level: 'debutant', opponents: 3 }, a.token);
    expect(q4.bots).toHaveLength(3);
    expect(new Set(q4.bots.map((b: { name: string }) => b.name)).size).toBe(3);
    expect((await api('/cf/bot/start', { level: 'debutant', opponents: 9 }, a.token)).bots).toHaveLength(3);
    const m4 = playLocal({ seed: q4.seed, me: q4.me, bots: q4.bots }, 5);
    clock += 20 * 60_000;
    const end4 = await api('/cf/bot/end', { gameId: q4.gameId, actions: m4.mine }, a.token);
    expect(end4.ok).toBe(true);
    expect(end4.won).toBe(m4.state.winner === 'joueur');
    // Parcours débutant : deck d'entraînement (non possédé) accepté contre l'ordinateur, le même pour l'ordinateur.
    const pc = await api('/cf/bot/start', { level: 'debutant', deckId: 'parcours:1' }, a.token);
    expect(pc.ok).toBe(true);
    expect([...pc.me.deck].sort()).toEqual([...pc.bots[0].deck].sort());
    expect(pc.me.deck.every((id: string) => ['coup'].includes(CARD_TYPE[id]))).toBe(true);
    expect(end.state.capsules).toBeGreaterThanOrEqual(before.capsules + CAPSULES.vsBot);
    expect(end.state.botCapsulesToday).toBe(CAPSULES.vsBot);
    expect((await api('/cf/bot/end', { gameId: s2.gameId, actions: m2.mine }, a.token)).code).toBe(404); // une seule fois

    // Actions trafiquées : une action de plus au début.
    const s3 = await api('/cf/bot/start', { level: 'fine-fouine' }, a.token);
    const m3 = playLocal({ seed: s3.seed, me: s3.me, bots: s3.bots }, 3);
    clock += 20 * 60_000;
    const bad = await api('/cf/bot/end', { gameId: s3.gameId, actions: [{ type: 'stop' } as CfAction, ...m3.mine] }, a.token);
    expect(bad.code).toBe(400);
    expect(bad.error).toMatch(/invalide/);
    // Une autre graine ne permet pas de réutiliser les actions d'une partie gagnée.
    const s4 = await api('/cf/bot/start', { level: 'debutant' }, a.token);
    clock += 20 * 60_000;
    expect((await api('/cf/bot/end', { gameId: s4.gameId, actions: m2.mine }, a.token)).code).toBe(400);
    // Partie pas finie : rien.
    const s5 = await api('/cf/bot/start', { level: 'debutant' }, a.token);
    const m5 = playLocal({ seed: s5.seed, me: s5.me, bots: s5.bots }, 5);
    clock += 20 * 60_000;
    const half = await api('/cf/bot/end', { gameId: s5.gameId, actions: m5.mine.slice(0, 5) }, a.token);
    expect(half.code).toBe(400);
    expect(half.error).toMatch(/pas terminée/);
    // Abandon : rien, et la partie n'existe plus.
    const s6 = await api('/cf/bot/start', { level: 'debutant' }, a.token);
    expect((await api('/cf/bot/abandon', { gameId: s6.gameId }, a.token)).ok).toBe(true);
    expect((await api('/cf/bot/end', { gameId: s6.gameId, actions: [] }, a.token)).code).toBe(404);
  }, 60_000);
});

// --- En ligne (sockets) -----------------------------------------------------------------------------
interface Cl {
  s: Socket; acc: Acc; auto: boolean; level: 'debutant' | 'habitue';
  last: CfStateMsg | null; states: CfStateMsg[]; leaks: string[]; errors: string[]; acted: Set<string>; busy: boolean;
  hello: CfHelloMsg | null; table: CfTableMsg | null; queue: CfQueueMsg | null; challenges: CfChallengeMsg[]; closed: { id: string; reason: string }[];
  chat: { id: string; text: string; name: string }[]; emotes: string[]; notices: string[]; kicked: string | null;
  fouine: Set<string>; windowsSeen: number; heldTooShort: number; openWindow: { key: string; until: number } | null;
}

describe('Coups Fourrés en ligne', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let url = '';
  let api: ReturnType<typeof apiOf>;
  const clients: Cl[] = [];
  beforeAll(async () => {
    srv = await startServer({
      port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000 }, stats: { adminUsers: ['Patron'] },
      cf: { windowMs: 40, keepWindowMs: 25, decisionMs: 1500, reserveMs: 500, disconnectMs: 700, botOfferMs: 300, matchTickMs: 40, autoplayMs: 10, presenceMs: 400 },
    });
    url = `http://localhost:${srv.port}`;
    api = apiOf(url);
  });
  afterAll(async () => { for (const c of clients) c.s.disconnect(); await srv.close(); });

  const reg = async (u: string): Promise<Acc> => {
    const r = await api('/register', { username: u, password: 'motdepasse1' });
    await api('/cf/discover', {}, r.token);
    return { token: r.token, id: r.user.id, name: u };
  };
  const befriend = async (a: Acc, b: Acc) => {
    await api('/friends', { username: b.name }, a.token);
    expect((await api('/friends/accept', { username: a.name }, b.token)).ok).toBe(true);
  };
  const emit = (c: Cl, ev: string, payload: object = {}) => new Promise<any>((res) => c.s.emit(ev, payload, res));

  function check(c: Cl, m: CfStateMsg) {
    const v = m.snap.view;
    const me = m.you;
    const leak = (x: string) => c.leaks.push(`${c.acc.name} : ${x}`);
    for (const e of m.events) if (e.kind === 'fouine' && e.card) c.fouine.add(e.card);
    for (const p of v.players) if (p.id !== me && p.hand !== undefined) leak('main adverse visible');
    for (const t of v.traps) if (t.owner !== me && t.id !== null && !c.fouine.has(t.id)) leak(`piège caché visible (${t.id})`);
    for (const st of v.stack) if (st.kind === 'card' && st.type === 'piege' && st.owner !== me && st.cardId !== null) leak('piège posé visible dans la pile');
    if (v.choice && v.choice.player !== me && 'cards' in v.choice) leak('choix adverse visible');
    for (const e of m.events) {
      if (e.to && (!me || !e.to.includes(me))) leak(`événement privé d'un autre (${e.kind})`);
      if ('textYou' in e) leak('texte privé transmis');
    }
    const json = JSON.stringify(m);
    if (json.includes('"rng"') || json.includes('"deck":[')) leak('état interne transmis');
    if (!me && m.snap.legal.length) leak('actions pour un spectateur');
    if (me && !m.snap.waitingFor.includes(me) && m.snap.legal.length) leak('actions hors de son tour');
    // Fenêtre de réponse d'un autre : rien ne doit arriver avant la fin, sauf si le joueur interrogé joue une carte.
    const w = m.snap.responseWindow;
    if (c.openWindow && (!w || `${w.player}:${w.until}` !== c.openWindow.key)) {
      const answered = m.events.some((e) => (e.kind === 'carte' || e.kind === 'pose') && c.openWindow!.key.startsWith(`${e.player}:`));
      if (!answered && Date.now() < c.openWindow.until - 5) c.heldTooShort++;
      c.openWindow = null;
    }
    if (w && w.player !== me) { c.windowsSeen++; c.openWindow = { key: `${w.player}:${w.until}`, until: w.until }; }
  }
  function pump(c: Cl) {
    const m = c.last;
    if (!c.auto || c.busy || !m || !m.you || m.snap.finished || !m.snap.legal.length) return;
    const key = `${m.id}:${m.snap.view.version}:${m.snap.legal.length}`;
    if (c.acted.has(key)) return;
    c.acted.add(key);
    c.busy = true;
    const action = cfDecide(m.snap.view, m.snap.legal, c.level, mulberry32(m.snap.view.version + c.acted.size));
    // Un peu de délai, comme un vrai joueur (le serveur limite à 25 messages par seconde).
    setTimeout(() => c.s.emit('cf:act', { id: m.id, action }, (r: { ok: boolean; error?: string }) => {
      c.busy = false;
      if (!r.ok && !/impossible maintenant|pas à vous|déjà répondu|partie est terminée/.test(r.error ?? '')) c.errors.push(r.error ?? '?');
      pump(c);
    }), 45);
  }
  function client(acc: Acc, auto = true): Promise<Cl> {
    return new Promise((resolve, reject) => {
      const c: Cl = {
        s: connect(`${url}/cf`, { transports: ['websocket'], forceNew: true, auth: { token: acc.token } }), acc, auto, level: 'habitue',
        last: null, states: [], leaks: [], errors: [], acted: new Set(), busy: false, hello: null, table: null, queue: null, challenges: [], closed: [],
        chat: [], emotes: [], notices: [], kicked: null, fouine: new Set(), windowsSeen: 0, heldTooShort: 0, openWindow: null,
      };
      clients.push(c);
      c.s.on('cf:state', (m: CfStateMsg) => { check(c, m); c.last = m; c.states.push(m); pump(c); });
      c.s.on('cf:hello', (h: CfHelloMsg) => { c.hello = h; resolve(c); });
      c.s.on('cf:table', (t: CfTableMsg) => (c.table = t));
      c.s.on('cf:table:kicked', ({ text }: { text: string }) => { c.kicked = text; c.table = null; });
      c.s.on('cf:queue', (q: CfQueueMsg) => (c.queue = q));
      c.s.on('cf:challenge:incoming', (ch: CfChallengeMsg) => c.challenges.push(ch));
      c.s.on('cf:challenge:closed', (x: { id: string; reason: string }) => c.closed.push(x));
      c.s.on('cf:chat', (m: { id: string; text: string; name: string }) => c.chat.push(m));
      c.s.on('cf:emote', (m: { emote: string }) => c.emotes.push(m.emote));
      c.s.on('cf:notice', (n: { text: string }) => c.notices.push(n.text));
      c.s.on('connect_error', (e: Error) => reject(e));
    });
  }
  const finished = (c: Cl) => !!c.last?.snap.finished;
  const me = async (a: Acc) => (await api('/cf/me', undefined, a.token)).state;

  it('compte obligatoire pour l’espace « /cf »', async () => {
    const s = connect(`${url}/cf`, { transports: ['websocket'], forceNew: true, auth: { token: 'faux' } });
    const err = await new Promise<Error>((r) => s.on('connect_error', r));
    expect(err.message).toMatch(/compte/);
    s.disconnect();
  });

  it('duel entre amis : présence, défi, partie complète sans fuite, spectateur, tchat, signalement, muet', async () => {
    const ana = await reg('Ana'), bob = await reg('Bob'), cleo = await reg('Cleo'), dan = await reg('Dan');
    await befriend(ana, bob);
    await befriend(cleo, ana);
    const A = await client(ana), B = await client(bob);
    expect(A.hello).toEqual({ game: null, table: null, queue: false, challenges: [] });
    // Présence dans le menu du mode.
    await emit(A, 'cf:presence', { in: true });
    await emit(B, 'cf:presence', { in: true });
    const fb = await api('/cf/friends', undefined, bob.token);
    expect(fb.friends).toEqual([{ username: 'Ana', status: 'menu' }]);
    expect((await api('/friends', undefined, bob.token)).friends.find((f: { username: string }) => f.username === 'Ana').cf).toEqual({ status: 'menu' });
    expect((await api('/cf/friends', undefined, dan.token)).friends).toEqual([]);
    // Défi : seulement entre amis.
    expect((await emit(A, 'cf:challenge', { username: 'Dan' })).ok).toBe(false);
    const ch = await emit(A, 'cf:challenge', { username: 'Bob' });
    expect(ch.ok).toBe(true);
    await until(() => B.challenges.length === 1, 3000, 'défi reçu');
    expect(B.challenges[0].from).toBe('Ana');
    expect(srv.accounts.social.sent.some((x) => x.userId === bob.id && /défie/.test(x.title))).toBe(true);
    expect((await api('/cf/challenges', undefined, bob.token)).challenges).toHaveLength(1);
    // Refus, puis nouveau défi accepté.
    expect((await emit(B, 'cf:challenge:answer', { id: ch.id, accept: false })).ok).toBe(true);
    await until(() => A.closed.some((x) => x.id === ch.id && /refusé/.test(x.reason)), 3000, 'refus');
    const ch2 = await emit(A, 'cf:challenge', { username: 'Bob' });
    expect((await emit(B, 'cf:challenge:answer', { id: ch2.id, accept: true })).ok).toBe(true);
    await until(() => !!A.last && !!B.last, 3000, 'début de partie');
    const gameId = A.last!.id;
    expect(A.last!.mode).toBe('ami');
    expect(A.last!.ranked).toBe(false);
    expect(A.last!.snap.seats.map((s) => s.name).sort()).toEqual(['Ana', 'Bob']);
    expect(A.last!.snap.deadline).toBeGreaterThan(Date.now() - 2000);
    expect(Object.values(A.last!.snap.reserve)).toEqual([0.5, 0.5].map(Math.ceil));
    // Présence « en partie » et regardable ; un ami de joueur peut regarder, pas un inconnu.
    const fc = await api('/cf/friends', undefined, cleo.token);
    expect(fc.friends).toEqual([{ username: 'Ana', status: 'partie', code: gameId, watchable: true }]);
    const C = await client(cleo, false), D = await client(dan, false);
    expect((await emit(D, 'cf:watch', { code: gameId })).error).toMatch(/amis/);
    expect((await emit(C, 'cf:watch', { code: gameId })).ok).toBe(true);
    expect((await emit(C, 'cf:act', { id: gameId, action: { type: 'pass' } })).ok).toBe(false);
    // Déjà en partie : pas de deuxième partie.
    expect((await emit(A, 'cf:queue:join')).error).toMatch(/déjà une partie/);
    // Tchat, réactions, signalement, muet.
    expect((await emit(A, 'cf:chat', { text: 'Santé ! https://pub.example' })).ok).toBe(true);
    await until(() => B.chat.length === 1 && C.chat.length === 1, 3000, 'tchat');
    expect(B.chat[0].text).toBe('Santé ! [lien]');
    const rep = await api('/moderation/report', { reason: 'insultes', message: { place: 'table', id: B.chat[0].id } }, bob.token);
    expect(rep.ok).toBe(true);
    expect((await api('/moderation/report', { reason: 'insultes', message: { place: 'table', id: B.chat[0].id } }, dan.token)).code).toBe(400); // pas à la table
    srv.store.modAddSanction({ userId: bob.id, kind: 'muet', reason: 'test', until: Date.now() + 3600_000, by: 'Patron', at: Date.now(), note: '' });
    expect((await emit(B, 'cf:chat', { text: 'chut' })).error).toMatch(/ne pouvez plus écrire/);
    expect((await emit(B, 'cf:emote', { emote: 'pas une réaction' })).ok).toBe(false);
    await wait(1300);
    const okEmote = await emit(A, 'cf:emote', { emote: '👏' });
    if (okEmote.ok) await until(() => B.emotes.length === 1, 2000, 'réaction');
    // La partie se joue jusqu'au bout.
    await until(() => finished(A) && finished(B) && finished(C), 60_000, 'fin du duel');
    expect(A.last!.snap.finished!.standings).toEqual(B.last!.snap.finished!.standings);
    const winnerSeat = A.last!.snap.finished!.standings[0];
    const winnerName = A.last!.snap.seats.find((s) => s.id === winnerSeat)!.name;
    expect(A.last!.snap.finished!.reward).toMatchObject({ userId: ana.id, won: winnerName === 'Ana' });
    expect(C.last!.snap.finished!.reward).toBeNull();
    // Aucune fuite d'information, ni pour les joueurs ni pour le spectateur.
    for (const c of [A, B, C]) { expect(c.leaks).toEqual([]); expect(c.errors).toEqual([]); }
    expect(C.states.every((m) => m.you === null && m.snap.view.players.every((p) => p.hand === undefined))).toBe(true);
    expect(C.states.every((m) => m.snap.view.traps.every((t) => t.id === null))).toBe(true);
    // Fenêtres de réponse : vues par l'autre joueur, jamais raccourcies par un « je passe ».
    expect(A.windowsSeen + B.windowsSeen).toBeGreaterThan(0);
    expect(A.heldTooShort + B.heldTooShort).toBe(0);
    // Historique et missions.
    const sa = await me(ana);
    expect(sa.history[0]).toMatchObject({ opponent: 'Bob', ranked: false, vsBot: false, result: winnerName === 'Ana' ? 'victoire' : 'defaite', points: 0, capsules: 0 });
    const counted = sa.missions.filter((m: { kind: string }) => m.kind === 'cartes' || m.kind === 'partie');
    for (const m of counted) expect(m.progress).toBeGreaterThan(0);
  }, 90_000);

  it('temps écoulé : action par défaut, puis réserve épuisée ; table à 2 par code', async () => {
    const eve = await reg('Eve'), fred = await reg('Fred');
    const E = await client(eve, false), F = await client(fred);
    const t = await emit(E, 'cf:table:create');
    expect(t.ok).toBe(true);
    expect((await emit(F, 'cf:table:join', { code: t.code.toLowerCase() })).ok).toBe(true);
    await until(() => E.table?.players.length === 2, 3000, 'table');
    expect((await emit(F, 'cf:table:start')).error).toMatch(/hôte/);
    const start = Date.now();
    expect((await emit(E, 'cf:table:start')).ok).toBe(true);
    await until(() => !!E.last, 3000, 'partie');
    const eSeat = E.last!.you!;
    expect(E.last!.snap.legal[0].type).toBe('mulligan');
    // Eve ne joue pas : 1,5 s + 0,5 s de réserve, puis le serveur garde sa main.
    await until(() => !!E.last && E.last.snap.view.players.find((p) => p.id === eSeat)!.r !== undefined && E.states.some((m) => m.events.some((e) => e.kind === 'mulligan' && e.player === eSeat)), 5000, 'mulligan automatique');
    expect(Date.now() - start).toBeGreaterThanOrEqual(1900);
    expect(E.notices.some((n) => /pas joué à temps/.test(n))).toBe(true);
    expect(E.last!.snap.reserve[eSeat]).toBe(0);
    E.auto = true;
    pump(E);
    await until(() => finished(E) && finished(F), 60_000, 'fin');
    expect(E.leaks).toEqual([]);
    expect(F.leaks).toEqual([]);
  }, 90_000);

  it('table entre amis : chacun choisit SON deck avant le lancement ; un deck injouable bloque le départ', async () => {
    const gil = await reg('Gaspard'), hana = await reg('Hana');
    const decksOf = async (a: Acc) => (await me(a)).decks as { id: string; name: string; valid: boolean; cards: Record<string, number> }[];
    const [gZinc, gBringue] = await decksOf(gil);
    const [hZinc, hBringue] = await decksOf(hana);
    expect([gZinc.name, gBringue.name]).toEqual(['Le Zinc', 'La Bringue']);
    const G = await client(gil), H = await client(hana);
    // Gil ouvre avec « Le Zinc », Hana rejoint avec « La Bringue » (pas son deck actif).
    const t = await emit(G, 'cf:table:create', { deckId: gZinc.id });
    expect(t.ok).toBe(true);
    expect((await emit(H, 'cf:table:join', { code: t.code, deckId: hBringue.id })).ok).toBe(true);
    await until(() => G.table?.players.length === 2, 3000, 'table');
    expect(G.table!.players.map((p) => [p.name, p.deck, p.ready])).toEqual([['Gaspard', 'Le Zinc', true], ['Hana', 'La Bringue', true]]);
    expect(G.table!.players.find((p) => p.name === 'Hana')!.deckId).toBe(hBringue.id);
    // Gil change d'avis au salon : « La Bringue ».
    expect((await emit(G, 'cf:table:deck', { deckId: gBringue.id })).ok).toBe(true);
    await until(() => H.table?.players.find((p) => p.name === 'Gaspard')?.deck === 'La Bringue', 3000, 'deck de Gaspard');
    // Un deck qui n'est pas à soi, ou inconnu, est refusé.
    expect((await emit(H, 'cf:table:deck', { deckId: gZinc.id })).error).toMatch(/Choisissez/);
    // Le deck choisi par Hana devient injouable (ici : une carte en moins, comme après un changement des
    // règles de construction) : la partie ne part pas.
    const broken = { ...hBringue.cards }; delete broken.fouine;
    srv.store.cfDeckSave({ id: hBringue.id, user_id: hana.id, name: hBringue.name, cards: JSON.stringify(broken), created_at: 1, updated_at: 2 });
    const refused = await emit(G, 'cf:table:start');
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/Hana n’est pas prêt/);
    await until(() => G.table?.players.find((p) => p.name === 'Hana')?.ready === false, 3000, 'Hana pas prête');
    expect(G.table!.players.find((p) => p.name === 'Hana')!.why).toMatch(/pas jouable/);
    expect((await emit(H, 'cf:table:deck', { deckId: hBringue.id })).ok).toBe(false);
    // Hana prend « Le Zinc » : tout le monde est prêt, la partie se lance avec le deck de CHACUN.
    expect((await emit(H, 'cf:table:deck', { deckId: hZinc.id })).ok).toBe(true);
    await until(() => G.table?.players.every((p) => p.ready) ?? false, 3000, 'prêts');
    expect((await emit(G, 'cf:table:start')).ok).toBe(true);
    await until(() => !!G.last && !!H.last, 3000, 'partie');
    const fams = (c: Record<string, number>) => [...new Set(Object.keys(c).map((id) => CARDS.find((x) => x.id === id)!.family))].sort();
    const v = G.last!.snap.view;
    const gSeat = v.players.find((p) => p.name === 'Gaspard')!, hSeat = v.players.find((p) => p.name === 'Hana')!;
    expect([...gSeat.families].sort()).toEqual(fams(gBringue.cards));
    expect([...hSeat.families].sort()).toEqual(fams(hZinc.cards));
    // Main de départ de Gil : uniquement des cartes de « La Bringue ».
    for (const k of gSeat.hand ?? []) expect(gBringue.cards[k.id]).toBeGreaterThan(0);
    const hHand = H.last!.snap.view.players.find((p) => p.name === 'Hana')!.hand ?? [];
    for (const k of hHand) expect(hZinc.cards[k.id]).toBeGreaterThan(0);
    // On laisse jouer la partie jusqu'au bout pour libérer les joueurs.
    await until(() => finished(G) && finished(H), 60_000, 'fin');
  }, 90_000);

  it('classée : appariement, points de ligue et capsules ; proposition de l’ordinateur après 60 s', async () => {
    const gil = await reg('Gil'), hugo = await reg('Hugo'), ines = await reg('Ines');
    const I = await client(ines, false);
    expect((await emit(I, 'cf:queue:join')).ok).toBe(true);
    await until(() => !!I.queue?.offer, 3000, 'proposition ordinateur');
    expect(I.queue!.text).toMatch(/ordinateur/);
    await emit(I, 'cf:queue:leave');
    await until(() => I.queue?.waiting === false, 2000, 'sortie de file');
    const G = await client(gil), H = await client(hugo);
    expect((await emit(G, 'cf:queue:join')).ok).toBe(true);
    expect((await emit(H, 'cf:queue:join')).ok).toBe(true);
    await until(() => !!G.last && !!H.last, 3000, 'appariement');
    expect(G.last!.mode).toBe('classee');
    expect(G.last!.ranked).toBe(true);
    expect(G.last!.snap.seats.every((s) => s.label === 'Comptoir')).toBe(true);
    await until(() => finished(G) && finished(H), 60_000, 'fin classée');
    const st = G.last!.snap.finished!.standings;
    const winName = G.last!.snap.seats.find((s) => s.id === st[0])!.name;
    const [w, l] = winName === 'Gil' ? [gil, hugo] : [hugo, gil];
    const sw = await me(w), sl = await me(l);
    expect(sw.league.points).toBe(25);
    expect(sl.league.points).toBe(0);
    expect(sw.history[0]).toMatchObject({ ranked: true, result: 'victoire', points: 25, capsules: CAPSULES.rankedWin });
    expect(sl.history[0]).toMatchObject({ ranked: true, result: 'defaite', capsules: CAPSULES.rankedLoss });
    expect(sw.boosters).toBe(CAPSULES.welcomeBoosters + 1); // première victoire du jour
    const rw = (winName === 'Gil' ? G : H).last!.snap.finished!.reward as { capsules: number; leaguePoints: number };
    expect(rw).toMatchObject({ capsules: CAPSULES.rankedWin, leaguePoints: 25 });
    expect(G.leaks).toEqual([]);
    expect(H.leaks).toEqual([]);
  }, 90_000);

  it('classée : abandon = défaite, déconnexion avec reprise, puis sans retour', async () => {
    const jo = await reg('Joel'), kim = await reg('Kim');
    let J = await client(jo), K = await client(kim);
    // Abandon.
    await emit(J, 'cf:queue:join'); await emit(K, 'cf:queue:join');
    await until(() => !!J.last && !!K.last, 3000, 'appariement 1');
    const g1 = J.last!.id;
    expect((await emit(J, 'cf:leave', { id: g1 })).ok).toBe(true);
    await until(() => K.last?.id === g1 && finished(K), 3000, 'abandon');
    expect(K.last!.snap.finished!.standings[0]).toBe(K.last!.you);
    expect(K.last!.snap.finished!.abandon).toBe(J.last!.you);
    expect((await me(jo)).history[0]).toMatchObject({ ranked: true, result: 'abandon', capsules: 0 });
    expect((await me(kim)).history[0]).toMatchObject({ ranked: true, result: 'victoire' });
    // Déconnexion puis reprise après « rechargement de la page ».
    J.last = null; K.last = null;
    await emit(J, 'cf:queue:join'); await emit(K, 'cf:queue:join');
    await until(() => !!J.last && !!K.last && J.last.id !== g1, 3000, 'appariement 2');
    const g2 = J.last!.id;
    J.auto = false;
    J.s.disconnect();
    await until(() => K.notices.some((n) => /déconnecté/.test(n)), 3000, 'avis de déconnexion');
    J = await client(jo);
    expect(J.hello!.game).toMatchObject({ id: g2, mode: 'classee', ranked: true });
    expect((await emit(J, 'cf:resume', {})).ok).toBe(true);
    await until(() => finished(J) && finished(K), 60_000, 'fin après reprise');
    expect(J.last!.snap.finished!.abandon).toBeNull();
    // Déconnexion sans retour : abandon au bout du délai.
    K.last = null;
    const L = J; L.last = null;
    await emit(L, 'cf:queue:join'); await emit(K, 'cf:queue:join');
    await until(() => !!L.last && !!K.last, 3000, 'appariement 3');
    K.auto = false;
    K.s.disconnect();
    await until(() => finished(L), 5000, 'abandon par absence');
    expect(L.last!.snap.finished!.standings[0]).toBe(L.last!.you);
    expect(L.notices.some((n) => /pas revenu à temps/.test(n))).toBe(true);
    expect((await me(kim)).history[0].result).toBe('abandon');
    K = await client(kim, false);
    expect(K.hello!.game).toBeNull();
  }, 120_000);

  it('table à 3 : hôte, retrait d’un joueur, départ, partie jusqu’au bout', async () => {
    const [lea, max, noe, oscar] = await Promise.all(['Lea', 'Max', 'Noe', 'Oscar'].map(reg));
    const Lc = await client(lea), Mc = await client(max), Nc = await client(noe), Oc = await client(oscar);
    const t = await emit(Lc, 'cf:table:create');
    for (const c of [Mc, Nc, Oc]) expect((await emit(c, 'cf:table:join', { code: t.code })).ok).toBe(true);
    await until(() => Lc.table?.players.length === 4, 3000, 'table pleine');
    expect(Lc.table!.host).toBe('Lea');
    expect((await emit(Mc, 'cf:table:kick', { account: 'Oscar' })).ok).toBe(false);
    expect((await emit(Lc, 'cf:table:kick', { account: 'Oscar' })).ok).toBe(true);
    await until(() => !!Oc.kicked && Lc.table?.players.length === 3, 3000, 'retrait');
    expect((await emit(Oc, 'cf:table:join', { code: t.code })).error).toMatch(/retiré/);
    // Tchat du salon.
    expect((await emit(Mc, 'cf:chat', { text: 'On y va ?' })).ok).toBe(true);
    await until(() => Lc.chat.some((m) => m.text === 'On y va ?'), 3000, 'tchat du salon');
    expect((await emit(Lc, 'cf:table:start')).ok).toBe(true);
    await until(() => [Lc, Mc, Nc].every((c) => !!c.last), 3000, 'départ à 3');
    expect(Lc.last!.mode).toBe('table');
    expect(Lc.last!.snap.seats).toHaveLength(3);
    expect(Lc.last!.snap.view.players[0].tokens).toBe(9);
    // Oscar (pas ami) ne peut pas regarder.
    expect((await emit(Oc, 'cf:watch', { code: Lc.last!.id })).ok).toBe(false);
    // 0.43 : Noé quitte la table à 3 (le serveur joue pour lui), puis revient depuis le menu.
    const gid = Lc.last!.id;
    Nc.auto = false;
    expect((await emit(Nc, 'cf:leave', { id: gid })).ok).toBe(true);
    await until(() => Lc.notices.some((n) => /Noe abandonne/.test(n)), 3000, 'départ de Noé');
    expect((await emit(Nc, 'cf:queue:join')).ok).toBe(true); // il n'est plus bloqué par la partie quittée
    await emit(Nc, 'cf:queue:leave');
    const Nb = await client(noe);
    expect(Nb.hello?.game?.id).toBe(gid);
    expect((await emit(Nb, 'cf:resume', {})).ok).toBe(true);
    await until(() => Lc.notices.some((n) => /Noe revient/.test(n)), 3000, 'retour de Noé');
    Nc.s.disconnect();
    await until(() => [Lc, Mc, Nb].every(finished), 90_000, 'fin à 3');
    const standings = Lc.last!.snap.finished!.standings;
    expect(standings).toHaveLength(3);
    for (const c of [Lc, Mc, Nc, Nb]) { expect(c.leaks).toEqual([]); expect(c.errors).toEqual([]); }
    for (const a of [lea, max, noe]) expect((await me(a)).history).toHaveLength(1);
    const first = Lc.last!.snap.seats.find((s) => s.id === standings[0])!.name;
    expect((await me([lea, max, noe].find((a) => a.name === first)!)).history[0].result).toBe('victoire');
  }, 120_000);

  it('présence : signal par route, expiration sans signal, sortie du menu', async () => {
    const pia = await reg('Pia'), quentin = await reg('Quentin');
    await befriend(pia, quentin);
    expect((await api('/cf/presence', { in: true }, pia.token)).ok).toBe(true);
    expect((await api('/cf/friends', undefined, quentin.token)).friends).toEqual([{ username: 'Pia', status: 'menu' }]);
    await wait(500);
    expect((await api('/cf/friends', undefined, quentin.token)).friends).toEqual([]);
    const P = await client(pia, false);
    await emit(P, 'cf:presence', { in: true });
    expect((await api('/cf/friends', undefined, quentin.token)).friends).toHaveLength(1);
    await emit(P, 'cf:presence', { in: false });
    expect((await api('/cf/friends', undefined, quentin.token)).friends).toEqual([]);
    await emit(P, 'cf:presence', { in: true });
    P.s.disconnect();
    await wait(100);
    expect((await api('/cf/friends', undefined, quentin.token)).friends).toEqual([]);
  });
});
