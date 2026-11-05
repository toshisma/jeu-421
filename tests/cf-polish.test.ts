/**
 * Coups Fourrés, finitions : partie guidée scénarisée (déroulé complet), récompense unique, tchat du
 * salon d'attente des tables à code (signalement, muet), pause de réponse réglable, image de partage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { startServer } from '../server/app';
import { CF_KEEP_WINDOW_MS, CF_RESPONSE_WINDOW_MS } from '../server/cards-online';
import { CF_TUTORIAL_CAPSULES, CfTutorial, TUTO_BOT, TUTO_ME, TUTO_STEPS, TUTO_VISIBLE } from '../shared/cards/tutorial';
import { legalActions, pl, type CfEvent, type CfView } from '../shared/cards/engine';
import { CARDS } from '../shared/cards/catalog';
import { MomentTracker, SHARE_H, SHARE_W, cardArtSvg, drawShareImage, wrapText, type ShareMoment } from '../client/src/cards/share';
import { CardsCatalogScreen, LexiconScreen, TipsScreen } from '../client/src/cards/CfLearn';
import { RulesContent } from '../client/src/cards/CfInfo';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 5000, what = 'condition') {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error(`délai dépassé : ${what}`); await wait(10); }
}

// --- Partie guidée --------------------------------------------------------------------------------
describe('partie guidée (scénario)', () => {
  /** Joue la partie guidée de bout en bout comme un joueur qui suit les bulles. */
  function playAll() {
    const t = new CfTutorial('Testeur');
    const seen: string[] = [];
    let guard = 0;
    while (!t.over && t.current && guard++ < 200) {
      const st = t.current;
      if (st.kind === 'info') { t.next(); continue; }
      if (st.kind === 'bot') { t.bot(); continue; }
      const legal = t.legal();
      expect(legal.length, `étape « ${st.title} » sans action possible`).toBeGreaterThan(0);
      // Une seule action attendue à la fois : le reste du jeu est désactivé.
      expect(legal.length).toBeLessThan(legalActions(t.state, TUTO_ME).length + 1);
      seen.push(st.title ?? '');
      const r = t.play(legal[0]);
      expect(r.ok).toBe(true);
    }
    return { t, seen };
  }

  it('déroulé complet : chaque étape est jouable, et le joueur gagne au Dernier mot', () => {
    const { t, seen } = playAll();
    expect(t.over).toBe(true);
    expect(t.state.winner).toBe(TUTO_ME);
    expect(t.step).toBe(TUTO_STEPS.length);
    expect(pl(t.state, TUTO_ME).tokens).toBe(0);
    for (const k of ['Lancer', 'Garder des dés', 'Jouer un Coup', 'Poser un piège', 'La limite de lancers', 'Riposter', 'Parer un piège', 'L’ardoise', 'Le Dernier mot'])
      expect(seen).toContain(k);
    expect(TUTO_VISIBLE).toBeLessThanOrEqual(20); // ≈ 3 minutes
  });

  it('toujours identique, et une action hors scénario est refusée', () => {
    const a = new CfTutorial('A');
    const b = new CfTutorial('B');
    expect(a.state.leader).toBe(TUTO_ME);
    expect(pl(a.state, TUTO_ME).hand.map((k) => k.id)).toEqual(pl(b.state, TUTO_ME).hand.map((k) => k.id));
    a.next(); a.next();
    expect(a.play({ type: 'ardoise' }).ok).toBe(false);
    expect(a.play({ type: 'roll', keep: [false, false, false] }).ok).toBe(true);
    // Garder les mauvais dés : refusé.
    expect(a.play({ type: 'roll', keep: [true, false, false] }).ok).toBe(false);
    expect(a.legal()).toEqual([{ type: 'roll', keep: [true, true, false] }]);
    expect(pl(a.state, TUTO_BOT).name).toBe('Dédé');
  });
});

// --- Serveur : récompense, tchat de salon, pause de réponse --------------------------------------
describe('Coups Fourrés en ligne : finitions', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  const sockets: Socket[] = [];
  const api = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { code: r.status, ...(await r.json()) };
  };
  const reg = async (u: string) => {
    const r = await api('/register', { username: u, password: 'motdepasse1' });
    await api('/cf/discover', {}, r.token);
    return { token: r.token as string, id: r.user.id as string, name: u };
  };
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000 }, stats: { adminUsers: ['Patron'] } });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { for (const s of sockets) s.disconnect(); await srv.close(); });

  it('partie guidée : +20 capsules une seule fois', async () => {
    const a = await reg('Guide');
    const before = (await api('/cf/me', undefined, a.token)).state;
    expect(before.tutorialDone).toBe(false);
    const r = await api('/cf/tutorial/done', {}, a.token);
    expect(r.ok).toBe(true);
    expect(r.capsules).toBe(CF_TUTORIAL_CAPSULES);
    expect(r.state.capsules).toBe(before.capsules + CF_TUTORIAL_CAPSULES);
    expect(r.state.tutorialDone).toBe(true);
    const again = await api('/cf/tutorial/done', {}, a.token);
    expect(again.code).toBe(409);
    expect((await api('/cf/me', undefined, a.token)).state.capsules).toBe(before.capsules + CF_TUTORIAL_CAPSULES);
    expect((await api('/cf/tutorial/done', {})).code).toBe(401);
  });

  it('tchat du salon d’attente d’une table à code : messages, signalement, muet', async () => {
    const [h, g, x] = [await reg('Hote'), await reg('Gina'), await reg('Xavier')];
    const chats = new Map<string, { id: string; text: string; name: string }[]>();
    const sock = (acc: { token: string; name: string }) => new Promise<Socket>((resolve) => {
      const s = connect(`${base}/cf`, { transports: ['websocket'], forceNew: true, auth: { token: acc.token } });
      sockets.push(s);
      chats.set(acc.name, []);
      s.on('cf:chat', (m) => chats.get(acc.name)!.push(m));
      s.on('cf:hello', () => resolve(s));
    });
    const emit = (s: Socket, ev: string, p: object = {}) => new Promise<any>((r) => s.emit(ev, p, r));
    const [H, G, X] = [await sock(h), await sock(g), await sock(x)];
    expect((await emit(H, 'cf:chat', { text: 'personne ?' })).ok).toBe(false); // pas encore de table
    const t = await emit(H, 'cf:table:create');
    expect((await emit(G, 'cf:table:join', { code: t.code })).ok).toBe(true);
    expect((await emit(H, 'cf:chat', { text: 'On attend Dédé ?' })).ok).toBe(true);
    await until(() => chats.get('Gina')!.length === 1 && chats.get('Hote')!.length === 1, 3000, 'tchat du salon');
    expect(chats.get('Xavier')!.length).toBe(0); // pas à la table : rien
    const msg = chats.get('Gina')![0];
    expect(msg.name).toBe('Hote');
    // Signalement d'un message du salon (même circuit que le tchat de partie).
    expect((await api('/moderation/report', { reason: 'insultes', message: { place: 'table', id: msg.id } }, g.token)).ok).toBe(true);
    expect((await api('/moderation/report', { reason: 'insultes', message: { place: 'table', id: msg.id } }, x.token)).code).toBe(400);
    // Muet : plus de tchat dans le salon non plus.
    srv.store.modAddSanction({ userId: g.id, kind: 'muet', reason: 'test', until: Date.now() + 3600_000, by: 'Patron', at: Date.now(), note: '' });
    expect((await emit(G, 'cf:chat', { text: 'chut' })).error).toMatch(/ne pouvez plus écrire/);
    void X;
  });

  it('pause de réponse : réglée en un seul endroit, 4 s et 2,5 s', () => {
    expect(CF_RESPONSE_WINDOW_MS).toBe(4000);
    expect(CF_KEEP_WINDOW_MS).toBe(2500);
  });
});

// --- Image de partage ----------------------------------------------------------------------------
/** Faux contexte 2D : enregistre les appels (le dessin doit aller au bout sans erreur). */
function fakeCtx() {
  const calls: string[] = [];
  const grad = { addColorStop: () => {} };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, k) {
      if (k in target) return target[k as string];
      if (k === 'measureText') return (t: string) => ({ width: t.length * 22 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      return (...a: unknown[]) => { calls.push(`${String(k)}(${a.length})`); };
    },
    set(target, k, v) { target[k as string] = v; return true; },
  };
  const texts: string[] = [];
  const ctx = new Proxy({ fillText: (t: string) => { texts.push(t); } } as Record<string, unknown>, handler);
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}

describe('image de partage', () => {
  const view = (over: Partial<CfView>): CfView => ({
    you: 'moi', phase: 'turn', round: 3, leader: 'moi', order: ['moi', 'dede'], turn: 0, waiting: [], decision: null,
    rules: {} as CfView['rules'], values: {} as CfView['values'], traps: [], stack: [], choice: null, lastword: null, ranking: [], winner: null, version: 1,
    players: [{ id: 'moi', name: 'Sam' }, { id: 'dede', name: 'Dédé' }] as CfView['players'], lastRound: null, ...over,
  });
  const lr = (o: Partial<NonNullable<CfView['lastRound']>>) => ({ round: 3, winner: 'dede', loser: 'moi', amount: 8, reversed: false, combos: {}, text: '', ...o });

  it('moments forts repérés : retournement de veste, 4-2-1, riposte, nénette, victoire', () => {
    const t = new MomentTracker('moi');
    const ev = (e: Partial<CfEvent>) => ({ text: '', ...e }) as CfEvent;
    expect(t.feed(ev({ kind: 'comptes' }), view({ lastRound: lr({ reversed: true }) }))?.text).toBe('J’ai retourné la veste de Dédé : +8 jetons pour lui !');
    t.feed(ev({ kind: 'manche' }), view({}));
    t.feed(ev({ kind: 'carte', player: 'moi', card: 'tete-tourne' }), view({}));
    const m421 = t.feed(ev({ kind: 'comptes' }), view({ lastRound: lr({ winner: 'moi', loser: 'dede', combos: { moi: { dice: [4, 2, 1], label: '421', value: 8 } } }) }));
    expect(m421).toMatchObject({ kind: '421', cardId: 'tete-tourne' });
    t.feed(ev({ kind: 'manche' }), view({}));
    t.feed(ev({ kind: 'carte', player: 'moi', card: 'reaction-chaine' }), view({}));
    t.feed(ev({ kind: 'annule', player: 'dede', card: 'bon-numero' }), view({}));
    expect(t.feed(ev({ kind: 'comptes' }), view({ lastRound: lr({ winner: 'moi', loser: 'dede', amount: 2, combos: { moi: { dice: [3, 4, 5], label: 'suite', value: 2 } } }) }))?.kind).toBe('riposte');
    t.feed(ev({ kind: 'manche' }), view({}));
    t.feed(ev({ kind: 'piege-revele', player: 'moi', card: 'coup-nenette' }), view({}));
    t.feed(ev({ kind: 'coup-nenette', player: 'dede' }), view({}));
    expect(t.feed(ev({ kind: 'comptes' }), view({ lastRound: lr({ winner: 'moi', loser: 'dede', amount: 2 }) }))?.kind).toBe('nenette');
    const win = t.feed(ev({ kind: 'fin', player: 'moi' }), view({ round: 6 }));
    expect(win?.text).toBe('J’ai gagné à Coups Fourrés contre Dédé en 6 manches !');
    expect(win?.cardId).toBe('reaction-chaine'); // la carte la plus chère jouée (la plus récente à coût égal)
    expect(t.best()?.kind).toBe('veste');
    // Défaite : pas de moment « victoire ».
    expect(new MomentTracker('moi').feed(ev({ kind: 'fin', player: 'dede' }), view({}))).toBeNull();
  });

  it('dessin 1200×630 sans erreur, pour chaque carte et sans carte ; illustration SVG autonome', async () => {
    expect([SHARE_W, SHARE_H]).toEqual([1200, 630]);
    for (const c of CARDS) {
      const { ctx, texts } = fakeCtx();
      const m: ShareMoment = { kind: 'veste', cardId: c.id, text: 'J’ai retourné la veste de Dédé : +8 jetons pour lui !', weight: 5 };
      drawShareImage(ctx, m, null);
      expect(texts).toContain('421');
      expect(texts).toContain('421online.com');
      expect(texts).toContain(c.name);
    }
    const { ctx, calls } = fakeCtx();
    drawShareImage(ctx, { kind: 'victoire', cardId: null, dice: [4, 2, 1], text: 'Victoire', weight: 1 }, null);
    expect(calls.filter((x) => x.startsWith('arc(')).length).toBeGreaterThan(7); // points des dés
    expect(wrapText({ measureText: (t: string) => ({ width: t.length * 10 }) as TextMetrics }, 'un deux trois quatre', 100)).toEqual(['un deux', 'trois', 'quatre']);
    const svg = await cardArtSvg('retournement-veste');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('viewBox="0 0 214 122"');
  });
});

// --- Écrans « Apprendre » ------------------------------------------------------------------------
describe('écrans « Apprendre »', () => {
  it('les 34 cartes, conseils, lexique et règles enrichies s’affichent', () => {
    const cards = renderToStaticMarkup(createElement(CardsCatalogScreen, { onBack: () => {} }));
    expect(cards).toContain('Les 34 cartes');
    expect(cards).toContain('Le Patron');
    const tips = renderToStaticMarkup(createElement(TipsScreen, { onBack: () => {} }));
    expect((tips.match(/<li>/g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(tips).toContain('Retournement de veste');
    const lex = renderToStaticMarkup(createElement(LexiconScreen, { onBack: () => {} }));
    for (const w of ['Tournée', 'Meneur', 'Ardoise', 'Habitué', 'Piège', 'Riposte', 'Dernier mot', 'Deck', 'Booster', 'Capsules', 'Éclats de verre']) expect(lex).toContain(w);
    expect(lex).not.toMatch(/paquet/i);
    const rules = renderToStaticMarkup(createElement(RulesContent, {}));
    expect(rules).toContain('Les combinaisons');
    expect(rules).toContain('Fin de partie');
  });
});
