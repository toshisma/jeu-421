/** Défi du jour : mêmes dés pour tous, score rejoué par le serveur, un essai classé par jour. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { challengeDice, nextDice, playChallenge } from '../shared/challenge';
import { startServer } from '../server/app';

describe('défi du jour : logique', () => {
  it('mêmes dés pour une date, différents le lendemain', () => {
    expect(challengeDice('2026-11-02')).toEqual(challengeDice('2026-11-02'));
    expect(challengeDice('2026-11-02')).not.toEqual(challengeDice('2026-11-03'));
  });
  it('rejoue les décisions et refuse les tricheries', () => {
    const none = Array.from({ length: 5 }, () => []);
    const a = playChallenge('2026-11-02', none)!;
    expect(a.throws).toBe(5);
    expect(a.turns[0].dice).toEqual(nextDice('2026-11-02', 0, 0, [0, 0, 0], [false, false, false]));
    // Garder un dé : il ne change pas, les autres prennent les valeurs suivantes.
    const d0 = a.turns[0].dice;
    const b = playChallenge('2026-11-02', [[[true, false, false]], [], [], [], []])!;
    expect(b.turns[0].dice[0]).toBe(d0[0]);
    expect(b.throws).toBe(6);
    expect(playChallenge('2026-11-02', [[[true, true, true]], [], [], [], []])).toBeNull();
    expect(playChallenge('2026-11-02', [[[false, false, false], [false, false, false], [false, false, false]], [], [], [], []])).toBeNull();
    expect(playChallenge('2026-11-02', [[]])).toBeNull();
  });
});

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => { srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000 } }); base = `http://localhost:${srv.port}`; });
afterAll(async () => { await srv.close(); });
const call = async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, ...(await r.json()) };
};

describe('défi du jour : serveur', () => {
  it('score officiel, récompense une fois, classement du jour', async () => {
    const a = await call('/register', { username: 'Defi1', password: 'motdepasse1' });
    const b = await call('/register', { username: 'Defi2', password: 'motdepasse1' });
    const none = Array.from({ length: 5 }, () => []);
    const r1 = await call('/challenge/submit', { decisions: none }, a.token);
    expect(r1.ok).toBe(true);
    expect(r1.rank).toBe(1);
    expect(r1.profile.coins).toBe(10 + r1.result.points);
    expect((await call('/challenge/submit', { decisions: none }, a.token)).status).toBe(409);
    expect((await call('/challenge/submit', { decisions: [[]] }, b.token)).status).toBe(400);
    await call('/challenge/submit', { decisions: [[[true, false, false]], [], [], [], []] }, b.token);
    const board = await call('/challenge/board', undefined, a.token);
    expect(board.total).toBe(2);
    expect(board.top.map((x: { username: string }) => x.username).sort()).toEqual(['Defi1', 'Defi2']);
    expect(board.mine.points).toBe(r1.result.points);
  });
});

describe('défi du jour : texte à partager', () => {
  it('grille d’émojis sans dévoiler les dés, total et lien du défi', async () => {
    const { challengeShareText, shortDay, turnSquare } = await import('../shared/challenge');
    expect(shortDay('2026-11-05')).toBe('5 nov.');
    expect(shortDay('2026-02-01')).toBe('1 févr.');
    expect([8, 7, 6, 4, 3, 2, 1].map(turnSquare).join('')).toBe('🟩🟩🟨🟨🟧🟧⬜');
    const text = challengeShareText('2026-11-05', [
      { throws: 3, points: 8 }, { throws: 1, points: 1 }, { throws: 2, points: 4 }, { throws: 1, points: 2 }, { throws: 2, points: 6 },
    ]);
    expect(text).toBe([
      '421 du jour · 5 nov. · 21 pts',
      '🎲🎲🎲🟩',
      '🎲▫️▫️⬜',
      '🎲🎲▫️🟨',
      '🎲▫️▫️🟧',
      '🎲🎲▫️🟨',
      '9 lancers · 421online.com/?defi',
    ].join('\n'));
    // Rien ne trahit les dés ni les combinaisons.
    expect(text).not.toMatch(/4-2-1|brelan|as|[1-6]-[1-6]/i);
    // Partie rejouée par le moteur : le texte se construit à partir du résultat officiel.
    const res = playChallenge('2026-11-05', Array.from({ length: 5 }, () => []))!;
    const t2 = challengeShareText('2026-11-05', res.turns.map((x) => ({ throws: x.throws, points: x.combo.value })));
    expect(t2.split('\n')).toHaveLength(7);
    expect(t2).toContain(`${res.points} pt`);
    expect(t2.endsWith('5 lancers · 421online.com/?defi')).toBe(true);
  });
});
