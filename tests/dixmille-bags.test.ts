/**
 * Le Courtisan : sacs de dés (mêmes sacs que le 421), statistiques du mode et défis du jour.
 * Le tirage est fait par le serveur pour les comptes ; jamais plus généreux que le 421.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { DM_BAG_MIN_MINUTES, applyDixMilleGame, dixMilleBagRoll, dixMilleReward } from '../shared/dixmille/reward';
import { BAG_PITY, WELCOME_BAGS, applyGameEnd, newProfile, rewardFor, sanitizeProfile } from '../shared/progress/profile';
import { playDm } from './rejeu-helpers';
import { mulberry32 } from '../shared/rng';

const day = '2026-03-10';
const now = new Date('2026-03-10T10:00:00Z').getTime();

describe('Sacs de dés du Courtisan : règle partagée', () => {
  it('partie trop courte : pas de sac, et elle ne compte pas pour le sac garanti', () => {
    const p = { ...newProfile(), pity: BAG_PITY - 1 };
    const r = dixMilleBagRoll(p, { won: true, players: 2, minutes: DM_BAG_MIN_MINUTES - 0.1, mode: 'online' }, () => 0);
    expect(r.found).toBe(0);
    expect(r.profile.pity).toBe(BAG_PITY - 1);
  });

  it('sac garanti au bout de 10 parties, compteur commun avec le 421', () => {
    let p = newProfile();
    let got = 0;
    for (let i = 0; i < BAG_PITY; i++) { const r = dixMilleBagRoll(p, { won: false, players: 2, minutes: 5, mode: 'solo' }, () => 0.99); p = r.profile; got += r.found; }
    expect(got).toBe(1);
    expect(p.pity).toBe(0);
    // Le compteur avance aussi avec les parties du 421.
    const after421 = applyGameEnd({ ...newProfile(), pity: 4 }, rewardFor(false, 10, { mode: 'solo', opponents: 1, count421: 0, minutes: 5 }), { mode: 'solo', opponents: 1, count421: 0, minutes: 5 }, day, () => 0.99).profile;
    expect(after421.pity).toBe(5);
  });

  it('résultat annoncé par le téléphone : compte comme une défaite pour le sac', () => {
    // Avec 2 joueurs et 10 minutes : 22 % en gagnant, 10 % en perdant. Tirage à 0,15.
    const f = { won: true, players: 2, minutes: 10, mode: 'solo' as const };
    expect(dixMilleBagRoll(newProfile(), f, () => 0.15).found).toBe(1);
    expect(dixMilleBagRoll(newProfile(), { ...f, declared: true }, () => 0.15).found).toBe(0);
    expect(dixMilleBagRoll(newProfile(), { ...f, declared: true }, () => 0.05).found).toBe(1);
  });

  it('rythme : jamais plus de sacs par partie qu’au 421 (même chance, mêmes durées)', () => {
    for (const won of [true, false]) for (const players of [2, 4, 6]) for (const minutes of [2, 5, 10, 20]) {
      const n = 4000;
      const rngA = mulberry32(players * 100 + minutes), rngB = mulberry32(players * 100 + minutes);
      let dm = newProfile(), p421 = newProfile(), bagsDm = 0, bags421 = 0;
      for (let i = 0; i < n; i++) {
        const a = dixMilleBagRoll(dm, { won, players, minutes, mode: 'online' }, rngA); dm = a.profile; bagsDm += a.found;
        const ctx = { mode: 'online' as const, opponents: players - 1, count421: 0, minutes, rounds: 10 };
        const b = applyGameEnd(p421, rewardFor(won, 10, ctx), ctx, day, rngB); p421 = { ...b.profile, quests: undefined }; bags421 += b.bagsFound ?? 0;
      }
      expect(bagsDm).toBeLessThanOrEqual(bags421);
      expect(bagsDm / n).toBeLessThan(0.5);
    }
  });

  it('statistiques du mode, défis du jour généraux, garde-fous', () => {
    const reward = dixMilleReward({ won: true, place: 1, opponents: 1, level: 'fouine', minutes: 6, day, now });
    const a = applyDixMilleGame(newProfile(), reward, day, { won: true, players: 2, minutes: 6, mode: 'solo', level: 'fouine', bestTurn: 999_999, potWon: 40 }, () => 0.99);
    expect(a.profile.dm).toMatchObject({ games: 1, wins: 1, bestTurn: 30_000, bestPot: 40, vGames: 0, vBestTurn: 0 });
    expect(a.profile.quests?.day).toBe(day);
    expect(Object.values(a.profile.quests!.progress).some((v) => v > 0)).toBe(true);
    // Pas de statistiques du 421.
    expect(a.profile.stats.played).toBe(0);
    // Un profil trafiqué est nettoyé.
    expect(sanitizeProfile({ dm: { games: 2, wins: 9, bestTurn: -5, bestPot: 'x', vWins: 50 } }).dm).toMatchObject({ games: 2, wins: 2, bestTurn: 0, bestPot: 0, vWins: 0 });
    expect(sanitizeProfile({ dm: 'n’importe quoi' }).dm).toBeUndefined();
  });
});

describe('Sacs de dés du Courtisan : serveur (partie contre l’ordinateur sur le téléphone)', () => {
  let clock = Date.parse('2026-11-07T10:00:00Z');
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 20_000, soloDailyCap: 40, authAttempts: 1000, now: () => clock }, turnTimeoutMs: 60_000 });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  async function api(path: string, body?: object, token?: string) {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, ...(await r.json()) };
  }
  let seq = 0;
  const user = async (pity = 9) => (await api('/register', { username: `Sacs${++seq}${Math.floor(Math.random() * 1e4)}`, password: 'motdepasse1', guestProfile: { pity } })).token as string;

  it('durée mesurée par le serveur : sac au bout du compteur, sacs ou durée annoncés ignorés', async () => {
    const token = await user();
    const g = await api('/dixmille/start', { setup: { level: 'habitue', target: 2000, bots: ['gege'] } }, token);
    const played = playDm(g.setup, g.seed);
    clock += 3 * 60_000;
    const end = await api('/dixmille/end', { gameToken: g.gameToken, moves: played.moves, won: true, place: 1, opponents: 1, level: 'habitue', bestTurn: 9850, bags: 50, bagsFound: 50, minutes: 999 }, token);
    expect(end.ok).toBe(true);
    expect(end.verified).toBe(true);
    expect(end.applied.bagsFound).toBe(1);
    expect(end.applied.profile.bags).toBe(1 + WELCOME_BAGS);
    // Partie rejouée : victoire et meilleur tour calculés par le serveur (les annonces sont ignorées).
    const won = played.state.winner === 'moi';
    expect(end.applied.profile.dm).toMatchObject({ games: 1, wins: won ? 1 : 0, bestTurn: played.state.players.find((x) => x.id === 'moi')!.best });
  });

  it('partie courte (mesurée par le serveur), jeton inconnu ou réutilisé : pas de sac', async () => {
    const token = await user();
    const g = await api('/dixmille/start', {}, token);
    clock += 30_000; // assez pour les pièces, trop court pour un sac
    const end = await api('/dixmille/end', { gameToken: g.gameToken, won: true, place: 1, opponents: 3, level: 'fouine' }, token);
    expect(end.ok).toBe(true);
    expect(end.applied.bagsFound).toBe(0);
    expect(end.applied.profile.bags ?? 0).toBe(WELCOME_BAGS);
    expect(end.applied.profile.pity).toBe(9);
    // Déclarer une fin sans partie commencée, ou deux fois la même : refusé.
    expect((await api('/dixmille/end', { gameToken: 'faux', won: true }, token)).status).toBe(400);
    expect((await api('/dixmille/end', { gameToken: g.gameToken, won: true }, token)).status).toBe(400);
    expect((await api('/me', undefined, token)).profile.bags ?? 0).toBe(WELCOME_BAGS);
  });
});
