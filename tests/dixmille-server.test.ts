/** Dix mille : récompense côté serveur (comptes) et barème bas (celui du solo du 421). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { dixMilleReward } from '../shared/dixmille/reward';
import { rewardFor } from '../shared/progress/profile';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 150, soloDailyCap: 3, authAttempts: 1000 }, turnTimeoutMs: 60_000 });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });
async function api(path: string, body?: object, token?: string) {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Dix mille : récompenses', () => {
  it('barème : jamais plus que le solo du 421', () => {
    const day = '2026-03-10', now = new Date('2026-03-10T10:00:00Z').getTime();
    for (const level of ['debutant', 'habitue', 'fouine'] as const) for (const opponents of [1, 2, 3]) for (const minutes of [2, 8, 30]) {
      const r = dixMilleReward({ won: true, place: 1, opponents, level, minutes, day, now });
      const solo = rewardFor(true, 10, { mode: 'solo', opponents, difficulty: { debutant: 'facile', habitue: 'normal', fouine: 'difficile' }[level] as 'normal', count421: 0, minutes, day, now });
      expect(r.coins).toBeLessThanOrEqual(solo.coins);
      expect(r.xp).toBeLessThanOrEqual(solo.xp);
    }
    // Partie de 15 minutes gagnée contre un Habitué : 6 pièces.
    expect(dixMilleReward({ won: true, place: 1, opponents: 1, level: 'habitue', minutes: 15, day, now }).coins).toBe(6);
    expect(dixMilleReward({ won: false, place: 2, opponents: 1, level: 'habitue', minutes: 15, day, now }).coins).toBe(0);
  });

  it('serveur : jeton, durée minimale, usage unique, pièces ajoutées', async () => {
    const reg = await api('/register', { username: 'Dix', password: 'motdepasse1' });
    const token = reg.token as string;
    const before = (await api('/me', undefined, token)).profile;
    expect((await api('/dixmille/end', { gameToken: 'x', won: true }, token)).status).toBe(400);
    const g = await api('/dixmille/start', {}, token);
    expect((await api('/dixmille/end', { gameToken: g.gameToken, won: true, place: 1, opponents: 2, level: 'fouine' }, token)).status).toBe(400); // trop tôt
    const g2 = await api('/dixmille/start', {}, token);
    await wait(200);
    const end = await api('/dixmille/end', { gameToken: g2.gameToken, won: true, place: 1, opponents: 99, level: 'triche' }, token);
    expect(end.ok).toBe(true);
    expect(end.reward.coins).toBeGreaterThanOrEqual(1);
    expect(end.reward.coins).toBeLessThanOrEqual(15);
    // 0.53 : la première victoire débloque « Premier courtisan » (+5).
    expect(end.applied.achievementsDone.map((x: { id: string }) => x.id)).toEqual(['dm-premiere']);
    // (+ récompense de la série de jours joués : première partie du jour)
    expect(end.applied.profile.coins).toBe(before.coins + end.reward.coins + end.applied.levelBonusCoins + 5 + (end.applied.profile.serie?.got?.coins ?? 0));
    // Pas de partie comptée dans les statistiques du 421 (succès, défis).
    expect(end.applied.profile.stats.played).toBe(before.stats.played);
    expect((await api('/dixmille/end', { gameToken: g2.gameToken, won: true }, token)).status).toBe(400); // jeton à usage unique
  });
});
