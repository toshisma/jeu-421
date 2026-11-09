/** Coups Fourrés : l'énigme du jour (générateur, solveur, serveur). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { apply, legalActions, type CfAction } from '../shared/cards/engine';
import {
  ENIGME_CAPSULES, ENIGME_ME, analyse, dailyPuzzle, describeLine, enigmeDay, enigmeShareText, enigmeStreak, generatePuzzle, interesting, naivePlay,
  puzzleState, replayPuzzle,
} from '../shared/cards/puzzles';

const DICE_FREE = new Set(['miroir', 'calva', 'addition', 'tete-tourne', 'coup-pouce', 'bon-numero', 'recompter', 'mise-bouche', 'double-tournee', 'note-salee', 'tant-qu-on-y-est',
  'pari-comptoir', 'petite-soeur', 'fouine', 'fermeture']);
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

describe('Énigme du jour : générateur et solveur', () => {
  it('même date, même énigme ; dates différentes, énigmes différentes', () => {
    const a = generatePuzzle('2026-11-06');
    expect(generatePuzzle('2026-11-06')).toEqual(a);
    expect(dailyPuzzle('2026-11-06')).toEqual(a);
    expect(generatePuzzle('2026-11-07')).not.toEqual(a);
  });

  it('jour de Bruxelles', () => {
    expect(enigmeDay(Date.parse('2026-11-06T22:59:00Z'))).toBe('2026-11-06');
    expect(enigmeDay(Date.parse('2026-11-06T23:01:00Z'))).toBe('2026-11-07'); // minuit passé à Bruxelles (UTC+1)
  });

  it('60 jours : résolubles, meilleur score > 0, cartes à effet fixe, naïf moins bon au moins une fois sur deux', () => {
    let naiveWorse = 0, interestingN = 0;
    for (const day of days('2026-11-06', 60)) {
      const p = dailyPuzzle(day);
      expect(p.best).toBeGreaterThan(0);
      expect(p.hand.length).toBeGreaterThanOrEqual(3);
      expect(p.hand.length).toBeLessThanOrEqual(6);
      for (const id of p.hand) expect(DICE_FREE.has(id)).toBe(true);
      // La solution annoncée se rejoue dans le vrai moteur et donne le meilleur score.
      const r = replayPuzzle(p, p.solution);
      expect(r.ok).toBe(true);
      expect(r.score).toBe(p.best);
      expect(r.cards).toBe(p.bestCards);
      expect(p.bestCards).toBeGreaterThanOrEqual(2);
      // Le joueur naïf, rejoué, fait le score annoncé.
      const n = naivePlay(puzzleState(p));
      expect(n.score).toBe(p.naive);
      expect(replayPuzzle(p, n.actions).score).toBe(p.naive);
      if (p.naive < p.best) naiveWorse++;
      const c = analyse(p)!;
      if (interesting(c)) interestingN++;
      expect(describeLine(p, p.solution).length).toBeGreaterThanOrEqual(2);
    }
    expect(naiveWorse).toBeGreaterThanOrEqual(30);
    expect(interestingN).toBeGreaterThanOrEqual(55);
  }, 120_000);

  it('aucune suite de coups ne dépasse le meilleur score (exploration au hasard)', () => {
    const p = dailyPuzzle('2026-11-06');
    let seed = 7;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let k = 0; k < 300; k++) {
      let s = puzzleState(p);
      const acts: CfAction[] = [];
      while (!s.lastRound && acts.length < 30) {
        const l = legalActions(s, ENIGME_ME);
        const a = l[Math.floor(rnd() * l.length)];
        s = apply(s, ENIGME_ME, a).state;
        acts.push(a);
      }
      expect(replayPuzzle(p, acts).score).toBeLessThanOrEqual(p.best);
    }
  });

  it('partage sans la solution ; série de jours réussis', () => {
    const t = enigmeShareText('2026-11-06', 6, 8, 3, 4);
    expect(t).toContain('6/8');
    expect(t).toContain('https://421online.com/?mode=cartes');
    expect(t).toContain('🔥 4 jours');
    expect(t).not.toMatch(/Tête|Coup de pouce|Recompter|\d-\d-\d/);
    const d = (day: string, score: number, best: number) => ({ day, score, best });
    expect(enigmeStreak([d('2026-11-06', 8, 8), d('2026-11-05', 5, 5), d('2026-11-04', 3, 5), d('2026-11-03', 5, 5)], '2026-11-06')).toBe(2);
    expect(enigmeStreak([d('2026-11-05', 5, 5), d('2026-11-04', 5, 5)], '2026-11-06')).toBe(2); // pas encore jouée aujourd'hui
    expect(enigmeStreak([d('2026-11-06', 2, 5), d('2026-11-05', 5, 5)], '2026-11-06')).toBe(0);
  });
});

// --- Serveur ------------------------------------------------------------------------------------
let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
const clock = Date.parse('2026-11-10T12:00:00Z');
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, now: () => clock } });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });
const api = async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { code: r.status, ...(await r.json()) };
};
const reg = async (u: string) => (await api('/register', { username: u, password: 'motdepasse1' })).token as string;
const capsules = async (t: string) => (await api('/cf/me', undefined, t)).state.capsules as number;

describe('Énigme du jour : serveur', () => {
  const day = '2026-11-10';
  const p = () => dailyPuzzle(day);
  let ana = '', bob = '', cid = '';

  it('comptes seulement', async () => {
    ana = await reg('Ana'); bob = await reg('Bob'); cid = await reg('Cid');
    expect((await api('/cf/enigme')).code).toBe(401);
    expect((await api('/cf/enigme', { actions: [] })).code).toBe(401);
    const b = await api('/cf/enigme', undefined, ana);
    expect(b).toMatchObject({ ok: true, day, mine: null, total: 0, best: p().best, streak: 0 });
  });

  it('refuse une suite d’actions illégale ou inachevée, sans rien enregistrer', async () => {
    const r1 = await api('/cf/enigme', { day, actions: [{ type: 'play', card: 'e999', die: 0 }] }, ana);
    expect(r1.code).toBe(400);
    const r2 = await api('/cf/enigme', { day, actions: [{ type: 'roll', keep: [false, false, false] }] }, ana);
    expect(r2.code).toBe(400);
    const r3 = await api('/cf/enigme', { day, actions: [] }, ana); // tour pas fini
    expect(r3.code).toBe(400);
    const r4 = await api('/cf/enigme', { day, actions: 'tout' }, ana);
    expect(r4.code).toBe(400);
    expect((await api('/cf/enigme', undefined, ana)).mine).toBeNull();
  });

  it('score recalculé par le serveur (le score envoyé est ignoré), meilleur score : 10 capsules', async () => {
    const before = await capsules(ana);
    const r = await api('/cf/enigme', { day, actions: p().solution, score: 999 }, ana);
    expect(r.code).toBe(200);
    expect(r.score).toBe(p().best);
    expect(r.capsules).toBe(ENIGME_CAPSULES.best);
    expect(r.mine).toMatchObject({ score: p().best, rank: 1, total: 1 });
    expect(r.streak).toBe(1);
    expect(await capsules(ana)).toBe(before + ENIGME_CAPSULES.best);
  });

  it('une seule validation par jour et par compte', async () => {
    const again = await api('/cf/enigme', { day, actions: p().solution }, ana);
    expect(again.code).toBe(409);
    expect(again.error).toMatch(/déjà/);
  });

  it('score moindre : 5 capsules ; classement : meilleurs scores puis le plus tôt', async () => {
    const naive = naivePlay(puzzleState(p()));
    expect(naive.score).toBeLessThan(p().best);
    const r = await api('/cf/enigme', { day, actions: naive.actions, score: 999 }, bob);
    expect(r.code).toBe(200);
    expect(r.score).toBe(naive.score);
    expect(r.capsules).toBe(ENIGME_CAPSULES.played);
    expect(r.mine.rank).toBe(2);
    const c = await api('/cf/enigme', { day, actions: p().solution }, cid);
    expect(c.mine.rank).toBe(2); // même score qu'Ana, validé plus tard (même horloge : ordre d'arrivée)
    const b = await api('/cf/enigme', undefined, bob);
    expect(b.top.map((x: { username: string }) => x.username)).toEqual(['Ana', 'Cid', 'Bob']);
    expect(b.mine.rank).toBe(3);
  });

  it('refuse l’énigme d’un autre jour', async () => {
    const d = await reg('Didier');
    const r = await api('/cf/enigme', { day: '2026-11-09', actions: dailyPuzzle('2026-11-09').solution }, d);
    expect(r.code).toBe(409);
  });
});
