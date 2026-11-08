/**
 * Coups Fourrés : les pièces (monnaie générale du jeu) gagnées en fin de partie.
 * Barème du 421 (solo contre l'ordinateur, en ligne), calculé par le serveur, une seule fois,
 * jamais pour un abandon, plafond quotidien commun avec le solo du 421.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { cfCoinReward } from '../shared/cards/progress';
import { rewardFor } from '../shared/progress/profile';
import { mulberry32 } from '../shared/rng';
import { cfDecide } from '../shared/cards/ai';
import { advanceBots, playMine, startBotMatch, type BotMatchSetup } from '../shared/cards/botmatch';
import { legalActions, viewFor } from '../shared/cards/engine';

const DAY = '2026-11-10'; // un mardi ordinaire (pas de bonus de pièces)
const NOON = Date.parse('2026-11-10T08:00:00Z'); // 9 h à Bruxelles : jamais de happy hour

describe('Coups Fourrés : barème des pièces (aligné sur le 421)', () => {
  it('contre l’ordinateur : exactement le solo du 421 selon le niveau', () => {
    for (const [lvl, diff] of [['debutant', 'facile'], ['habitue', 'normal'], ['fine-fouine', 'difficile']] as const) {
      const cf = cfCoinReward({ won: true, place: 1, players: 2, minutes: 20, botLevel: lvl, day: DAY, now: NOON });
      const solo = rewardFor(true, 1, { mode: 'solo', difficulty: diff, opponents: 1, count421: 0, place: 1, minutes: 20, day: DAY, now: NOON });
      expect(cf.coins).toBe(solo.coins);
      expect(cf.xp).toBe(solo.xp);
    }
    // Duel gagné, niveau Habitué, partie complète : 6 pièces ; perdu : 0 pièce (un peu d'XP).
    expect(cfCoinReward({ won: true, place: 1, players: 2, minutes: 20, botLevel: 'habitue', day: DAY, now: NOON }).coins).toBe(6);
    const lost = cfCoinReward({ won: false, place: 2, players: 2, minutes: 20, botLevel: 'habitue', day: DAY, now: NOON });
    expect(lost.coins).toBe(0);
    expect(lost.xp).toBeGreaterThan(0);
  });
  it('en ligne : le barème du 421 en ligne ; partie courte réduite', () => {
    const cf = cfCoinReward({ won: true, place: 1, players: 4, minutes: 15, day: DAY, now: NOON });
    const online = rewardFor(true, 1, { mode: 'online', opponents: 3, count421: 0, place: 1, minutes: 15, day: DAY, now: NOON });
    expect(cf.coins).toBe(online.coins);
    expect(cf.coins).toBe(15); // 12 × 1,25
    expect(cfCoinReward({ won: true, place: 1, players: 2, minutes: 3, day: DAY, now: NOON }).coins)
      .toBeLessThan(cfCoinReward({ won: true, place: 1, players: 2, minutes: 15, day: DAY, now: NOON }).coins);
    // 2e sur 4 : une part ; dernier : rien.
    expect(cfCoinReward({ won: false, place: 2, players: 4, minutes: 15, day: DAY, now: NOON }).coins).toBeGreaterThan(0);
    expect(cfCoinReward({ won: false, place: 4, players: 4, minutes: 15, day: DAY, now: NOON }).coins).toBe(0);
    // Valeurs absurdes bornées : 4 joueurs au plus.
    expect(cfCoinReward({ won: true, place: 1, players: 99, minutes: 999, day: DAY, now: NOON }).coins).toBe(15);
  });
});

describe('Coups Fourrés : pièces versées par le serveur', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let clock = Date.parse('2026-11-10T10:00:00Z');
  let base = '';
  const api = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { code: r.status, ...(await r.json()) };
  };
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, now: () => clock }, cf: { minBotMs: 30_000 } });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  const reg = async (u: string) => {
    const r = await api('/register', { username: u, password: 'motdepasse1' });
    await api('/cf/discover', {}, r.token);
    return { token: r.token as string, id: r.user.id as string };
  };
  const coins = async (token: string) => (await api('/me', undefined, token)).profile.coins as number;
  function playLocal(setup: BotMatchSetup, seed: number) {
    const { match } = startBotMatch(setup);
    const rng = mulberry32(seed);
    for (let i = 0; i < 5000 && match.state.phase !== 'over'; i++) {
      playMine(match, cfDecide(viewFor(match.state, setup.me.id), legalActions(match.state, setup.me.id), 'fine-fouine', rng));
      advanceBots(match);
    }
    return match;
  }

  it('contre l’ordinateur : pièces du barème, versées une seule fois, résultat recalculé par le serveur', async () => {
    const a = await reg('Piecette');
    // Plusieurs parties : au moins une gagnée (Débutant), pour voir des pièces.
    let won = false;
    for (let seed = 1; seed < 12 && !won; seed++) {
      const s = await api('/cf/bot/start', { level: 'debutant' }, a.token);
      const m = playLocal({ seed: s.seed, me: s.me, bots: s.bots }, seed);
      clock += 20 * 60_000;
      const before = await coins(a.token);
      // Le client ne peut rien déclarer : « won » et « coins » envoyés sont ignorés.
      const end = await api('/cf/bot/end', { gameId: s.gameId, actions: m.mine, won: true, coins: 999 }, a.token);
      expect(end.ok).toBe(true);
      const after = await coins(a.token);
      const expected = cfCoinReward({ won: end.won, place: end.won ? 1 : 2, players: 2, minutes: 20, botLevel: 'debutant', day: DAY, now: clock });
      // (+ bonus de niveau éventuel, versé comme au 421)
      expect(end.reward.coins).toBeGreaterThanOrEqual(expected.coins);
      expect(end.reward.xp).toBe(expected.xp);
      expect(after - before).toBe(end.reward.coins);
      if (end.won) { won = true; expect(end.reward.coins).toBeGreaterThan(0); }
      else expect(end.reward.coins).toBe(0);
      // Une seule fois.
      expect((await api('/cf/bot/end', { gameId: s.gameId, actions: m.mine }, a.token)).code).toBe(404);
      expect(await coins(a.token)).toBe(after);
    }
    expect(won).toBe(true);
  }, 60_000);

  it('abandon (en ligne) : ni pièces ni XP pour celui qui part ; le gagnant reçoit le barème en ligne', async () => {
    const w = await reg('Gagnante'), l = await reg('Fuyard');
    const w0 = await coins(w.token), l0 = await coins(l.token);
    const r = srv.accounts.cards.recordCfGame({ winnerId: w.id, loserId: l.id, ranked: false, vsBot: false, abandoned: true, players: 2, loserPlace: 2, minutes: 15 });
    expect(r.find((x) => x.userId === l.id)?.coins).toBeUndefined();
    expect(await coins(l.token)).toBe(l0);
    const gain = r.find((x) => x.userId === w.id)!.coins!;
    expect(gain).toBe(cfCoinReward({ won: true, place: 1, players: 2, minutes: 15, day: DAY, now: clock }).coins);
    expect(await coins(w.token)).toBe(w0 + gain);
  });

  it('plafond quotidien commun avec le solo : au-delà, plus de pièces contre l’ordinateur', async () => {
    const a = await reg('Acharne');
    for (let i = 0; i < 40; i++) srv.store.bumpSolo(a.id, DAY);
    const before = await coins(a.token);
    const r = srv.accounts.cards.recordCfGame({ winnerId: a.id, loserId: null, ranked: false, vsBot: true, players: 2, minutes: 20, botLevel: 'fine-fouine' });
    expect(r[0].coins).toBeUndefined();
    expect(await coins(a.token)).toBe(before);
  });

  it('sacs de dés : règle du 421 (compteur commun, sac garanti à la 10e partie), rien pour un abandon ni une partie trop courte', async () => {
    const a = await reg('Sacoche'), b = await reg('Partant');
    const prof = (id: string) => srv.store.profileOf(srv.store.userById(id)!);
    // Compteur commun avec le 421 et le Courtisan : 9 parties sans sac → la 10e en donne un, à coup sûr.
    srv.store.saveProfile(a.id, { ...prof(a.id), pity: 9, bags: 0 });
    const r = srv.accounts.cards.recordCfGame({ winnerId: null, loserId: a.id, ranked: false, vsBot: true, players: 2, loserPlace: 2, minutes: 12, botLevel: 'habitue' });
    expect(r[0].bags).toBe(1);
    expect(prof(a.id).bags).toBe(1);
    expect(prof(a.id).pity ?? 0).toBe(0);
    // Partie de moins de 1 min 30 : jamais de sac, et le compteur n'avance pas.
    srv.store.saveProfile(a.id, { ...prof(a.id), pity: 9 });
    const short = srv.accounts.cards.recordCfGame({ winnerId: a.id, loserId: null, ranked: false, vsBot: true, players: 2, minutes: 1, botLevel: 'habitue' });
    expect(short[0].bags).toBe(0);
    expect(prof(a.id).pity).toBe(9);
    // Abandon en ligne : rien pour celui qui part (ni sac ni compteur).
    srv.store.saveProfile(b.id, { ...prof(b.id), pity: 9, bags: 0 });
    const ab = srv.accounts.cards.recordCfGame({ winnerId: a.id, loserId: b.id, ranked: false, vsBot: false, abandoned: true, players: 2, loserPlace: 2, minutes: 20 });
    expect(ab.find((x) => x.userId === b.id)?.bags).toBeUndefined();
    expect(prof(b.id).bags ?? 0).toBe(0);
    expect(prof(b.id).pity).toBe(9);
    // Rythme : jamais plus d'un sac par partie, au moins le sac garanti toutes les 10, et rien au-delà
    // du plafond quotidien des parties contre l'ordinateur (commun avec le solo du 421).
    srv.store.saveProfile(a.id, { ...prof(a.id), pity: 0, bags: 0 });
    let found = 0, paid = 0;
    for (let i = 0; i < 300; i++) {
      const x = srv.accounts.cards.recordCfGame({ winnerId: a.id, loserId: null, ranked: false, vsBot: true, players: 2, minutes: 12, botLevel: 'debutant' });
      if (x[0].coins === undefined) { expect(x[0].bags).toBeUndefined(); continue; }
      paid++;
      expect(x[0].bags ?? 0).toBeLessThanOrEqual(1);
      found += x[0].bags ?? 0;
    }
    expect(paid).toBeLessThanOrEqual(40);
    expect(found).toBeGreaterThanOrEqual(Math.floor(paid / 10));
    expect(found).toBeLessThanOrEqual(paid * 0.6);
    expect(prof(a.id).bags ?? 0).toBe(found);
  });
});
