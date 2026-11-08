/** Coups Fourrés : données des joueurs côté serveur (vrais échanges HTTP, base en mémoire). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { mulberry32 } from '../shared/rng';
import { BOOSTER, CARDS, CAPSULES, SHARDS, STARTER_DECKS, cardDef } from '../shared/cards/catalog';
import { CF_MISSIONS, cfApplyDelta, cfDailyMissions, cfDivisionOf, cfLeagueDelta, cfNextSeasonPoints, cfRollBooster } from '../shared/cards/progress';
import { CF_BOT_DAILY_CAPSULES, cryptoRng } from '../server/cards';

// --- Fonctions pures ------------------------------------------------------------------------------
describe('Coups Fourrés : tirage des boosters', () => {
  it('5 cartes au pur hasard, raretés et brillantes conformes aux chances annoncées', () => {
    const rng = mulberry32(421);
    const n = 4000;
    const count = { commune: 0, rare: 0, epique: 0, legendaire: 0 };
    let shiny = 0;
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const b = cfRollBooster(rng);
      expect(b).toHaveLength(BOOSTER.size);
      for (const c of b) { count[cardDef(c.id)!.rarity]++; if (c.shiny) shiny++; seen.add(c.id); }
    }
    const total = n * BOOSTER.size;
    expect(count.commune / total).toBeGreaterThan(0.68); expect(count.commune / total).toBeLessThan(0.72);
    expect(count.rare / total).toBeGreaterThan(0.20); expect(count.rare / total).toBeLessThan(0.24);
    expect(count.epique / total).toBeGreaterThan(0.055); expect(count.epique / total).toBeLessThan(0.075);
    expect(count.legendaire / total).toBeGreaterThan(0.01); expect(count.legendaire / total).toBeLessThan(0.02);
    expect(shiny / total).toBeGreaterThan(0.04); expect(shiny / total).toBeLessThan(0.06);
    expect(seen.size).toBe(CARDS.length); // toutes les cartes peuvent sortir
  });
  it('le serveur tire avec un générateur cryptographique dans [0, 1[', () => {
    const xs = Array.from({ length: 2000 }, cryptoRng);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs).size).toBe(xs.length);
    expect(cfRollBooster(cryptoRng)).toHaveLength(BOOSTER.size);
  });
  it('aucune garantie : un booster peut ne contenir que des communes', () => {
    expect(cfRollBooster(() => 0).every((c) => cardDef(c.id)!.rarity === 'commune')).toBe(true);
    expect(cfRollBooster(() => 0.999).every((c) => cardDef(c.id)!.rarity === 'legendaire' && !c.shiny)).toBe(true);
  });
});

describe('Coups Fourrés : ligue et missions (fonctions pures)', () => {
  it('points type Elo : +25 / −20 à niveau égal, plus contre plus fort', () => {
    expect(cfLeagueDelta(500, 500, true)).toBe(25);
    expect(cfLeagueDelta(500, 500, false)).toBe(-20);
    expect(cfLeagueDelta(500, 900, true)).toBeGreaterThan(25);
    expect(cfLeagueDelta(900, 500, true)).toBeLessThan(25);
    expect(cfLeagueDelta(900, 500, false)).toBeLessThan(-20);
    expect(cfLeagueDelta(0, 5000, true)).toBeLessThanOrEqual(42);
  });
  it('plancher de division et descente de deux divisions', () => {
    expect(cfApplyDelta(310, 310, -20)).toEqual({ points: 300, best: 310 });
    expect(cfApplyDelta(10, 10, -20)).toEqual({ points: 0, best: 10 });
    expect(cfApplyDelta(720, 720, -20).points).toBe(700);
    expect(cfNextSeasonPoints(1900)).toBe(700);
    expect(cfNextSeasonPoints(1300)).toBe(300);
    expect(cfNextSeasonPoints(800)).toBe(0);
    expect(cfDivisionOf(1799).id).toBe('cabaret');
  });
  it('3 missions du jour, les mêmes pour tous, dont une simple, 20 à 40 capsules', () => {
    for (const day of ['2026-11-05', '2026-11-06', '2027-01-01']) {
      const m = cfDailyMissions(day);
      expect(m).toHaveLength(3);
      expect(new Set(m.map((x) => x.id)).size).toBe(3);
      expect(['partie', 'victoire']).toContain(m[0].kind);
      expect(cfDailyMissions(day)).toEqual(m);
    }
    for (const m of CF_MISSIONS) { expect(m.capsules).toBeGreaterThanOrEqual(20); expect(m.capsules).toBeLessThanOrEqual(40); }
  });
});

// --- Serveur ------------------------------------------------------------------------------------
let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
let clock = Date.parse('2026-11-10T12:00:00Z');
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, now: () => clock }, stats: { adminUsers: ['Patron'] } });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });
const api = async (path: string, body?: object, token?: string, method?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: method ?? (body ? 'POST' : 'GET'), body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { code: r.status, ...(await r.json()) };
};
const reg = async (u: string) => { const r = await api('/register', { username: u, password: 'motdepasse1' }); return { token: r.token as string, id: r.user.id as string }; };
const me = async (t: string) => (await api('/cf/me', undefined, t)).state;
const cards = () => srv.accounts.cards;

describe('Coups Fourrés : serveur', () => {
  let admin = '', ana = { token: '', id: '' }, bob = { token: '', id: '' };
  it('prépare les comptes', async () => {
    admin = (await reg('Patron')).token;
    ana = await reg('Ana');
    bob = await reg('Bob');
  });

  it('invité refusé (401) sur toutes les routes', async () => {
    for (const [p, b, m] of [['/cf/me'], ['/cf/discover', {}], ['/cf/booster/buy', {}], ['/cf/booster/open', {}], ['/cf/craft', { cardId: 'leurre' }],
      ['/cf/recycle', { cardId: 'leurre' }], ['/cf/decks', { name: 'x', cards: {} }], ['/cf/decks/x', undefined, 'DELETE'], ['/cf/league']] as [string, object?, string?][])
      expect((await api(p, b, undefined, m)).code).toBe(401);
  });

  it('découverte : 2 decks de départ + 3 boosters, une seule fois', async () => {
    const s0 = await me(ana.token);
    expect(s0).toMatchObject({ discovered: false, capsules: 0, boosters: 0, decks: [] });
    expect((await api('/cf/booster/open', {}, ana.token)).code).toBe(409); // pas encore découvert
    const r = await api('/cf/discover', {}, ana.token);
    expect(r.ok).toBe(true);
    expect(r.state.discovered).toBe(true);
    expect(r.state.boosters).toBe(CAPSULES.welcomeBoosters);
    expect(r.state.decks.map((d: { name: string }) => d.name)).toEqual(STARTER_DECKS.map((d) => d.name));
    expect(r.state.decks.every((d: { valid: boolean }) => d.valid)).toBe(true);
    expect(r.state.activeDeck).toBe(r.state.decks[0].id);
    const total = Object.values(r.state.collection as Record<string, { count: number }>).reduce((a, c) => a + c.count, 0);
    expect(total).toBe(40);
    const again = await api('/cf/discover', {}, ana.token);
    expect(again.code).toBe(409);
    expect(again.error).toMatch(/déjà/);
    expect((await me(ana.token)).boosters).toBe(3);
  });

  it('achat refusé sans capsules ; ouverture : 5 cartes, nouvelles signalées', async () => {
    const buy = await api('/cf/booster/buy', {}, ana.token);
    expect(buy.code).toBe(400);
    expect(buy.error).toMatch(/100 capsules/);
    const before = await me(ana.token);
    const o = await api('/cf/booster/open', {}, ana.token);
    expect(o.cards).toHaveLength(5);
    for (const c of o.cards) {
      expect(cardDef(c.id)?.rarity).toBe(c.rarity);
      expect(typeof c.shiny).toBe('boolean');
      if (c.isNew) expect(before.collection[c.id]).toBeUndefined();
      else expect(before.collection[c.id] || o.cards.slice(0, o.cards.indexOf(c)).some((x: { id: string }) => x.id === c.id)).toBeTruthy();
    }
    expect(o.state.boosters).toBe(2);
    const count = (s: { collection: Record<string, { count: number }> }) => Object.values(s.collection).reduce((a, c) => a + c.count, 0);
    expect(count(o.state)).toBe(count(before) + 5);
    await api('/cf/booster/open', {}, ana.token);
    await api('/cf/booster/open', {}, ana.token);
    const none = await api('/cf/booster/open', {}, ana.token);
    expect(none.code).toBe(400);
    expect(none.error).toMatch(/aucun booster/);
  });

  it('achat avec capsules (100)', async () => {
    await api(`/admin/players/${ana.id}/cf`, { what: 'capsules', delta: 130 }, admin);
    const b = await api('/cf/booster/buy', {}, ana.token);
    expect(b.state).toMatchObject({ capsules: 30, boosters: 1 });
  });

  it('éclats : recyclage des doublons en trop, confirmation, deck protégé, fabrication', async () => {
    // Ana a 2 « Tête qui tourne » (La Bringue) : on lui en donne 3 de plus.
    const have = (await me(ana.token)).collection['tete-tourne'].count;
    await api(`/admin/players/${ana.id}/cf`, { what: 'card', cardId: 'tete-tourne', delta: 3 }, admin);
    const extra = have + 3 - 2;
    const shards0 = (await me(ana.token)).shards;
    const r = await api('/cf/recycle', { cardId: 'tete-tourne', count: extra }, ana.token);
    expect(r.gained).toBe(extra * SHARDS.commune.recycle);
    expect(r.state.shards).toBe(shards0 + extra * SHARDS.commune.recycle);
    expect(r.state.collection['tete-tourne'].count).toBe(2);
    const ask = await api('/cf/recycle', { cardId: 'tete-tourne', count: 1 }, ana.token);
    expect(ask.code).toBe(409);
    expect(ask.error).toMatch(/Confirmez/);
    const used = await api('/cf/recycle', { cardId: 'tete-tourne', count: 1, confirm: true }, ana.token);
    expect(used.code).toBe(409);
    expect(used.error).toMatch(/La Bringue/);
    expect((await api('/cf/recycle', { cardId: 'inconnue' }, ana.token)).code).toBe(404);
    // Fabrication : pas assez d'éclats pour une légendaire, puis assez.
    // (Les boosters ouverts plus haut ont pu donner un Patron : on repart de zéro.)
    const patrons = (await me(ana.token)).collection.patron?.count ?? 0;
    if (patrons) await api(`/admin/players/${ana.id}/cf`, { what: 'card', cardId: 'patron', delta: -patrons }, admin);
    const f = await api('/cf/craft', { cardId: 'patron' }, ana.token);
    expect(f.code).toBe(400);
    expect(f.error).toMatch(/1600 éclats/);
    await api(`/admin/players/${ana.id}/cf`, { what: 'shards', delta: 1600 }, admin);
    const before = (await me(ana.token)).shards;
    const ok = await api('/cf/craft', { cardId: 'patron' }, ana.token);
    expect(ok.state.collection.patron.count).toBe(1);
    expect(ok.state.shards).toBe(before - SHARDS.legendaire.craft);
    const max = await api('/cf/craft', { cardId: 'patron' }, ana.token);
    expect(max.code).toBe(400);
    expect(max.error).toMatch(/maximum utile/);
    // Tout recycler d'un coup : il ne reste que le maximum utile.
    await api(`/admin/players/${ana.id}/cf`, { what: 'card', cardId: 'cul-sec', delta: 4 }, admin);
    const all = await api('/cf/recycle-extras', {}, ana.token);
    expect(all.state.collection['cul-sec'].count).toBe(2);
    expect(all.cards).toBeGreaterThanOrEqual(4);
  });

  it('decks : validations, cartes non possédées refusées, 5 au plus, actif, suppression', async () => {
    const s = await me(ana.token);
    const zinc = s.decks.find((d: { name: string }) => d.name === 'Le Zinc');
    // Cartes non possédées (Bob n'a rien) et deck incomplet.
    await api('/cf/discover', {}, bob.token);
    const sb = await me(bob.token);
    const withPatron = { ...STARTER_DECKS[0].cards, josiane: 0, patron: 1 };
    const no = await api('/cf/decks', { name: 'Royal', cards: withPatron }, bob.token);
    expect(no.code).toBe(400);
    expect(no.error).toMatch(/Le Patron : vous n’en avez que 0/);
    const short = await api('/cf/decks', { name: 'Court', cards: { ...STARTER_DECKS[0].cards, josiane: 0 } }, bob.token);
    expect(short.error).toMatch(/exactement 20/);
    expect((await api('/cf/decks', { name: 'Trop', cards: { ...STARTER_DECKS[0].cards, josiane: 0, pilier: 3 } }, bob.token)).error).toMatch(/2 exemplaires au plus/);
    expect((await api('/cf/decks', { name: '   ', cards: STARTER_DECKS[0].cards }, bob.token)).error).toMatch(/nom/);
    expect((await api('/cf/decks', { name: 'Bizarre', cards: { leurre: 'deux' } }, bob.token)).error).toMatch(/invalide/);
    expect(sb.decks).toHaveLength(2);
    // Ana : deck avec Le Patron (possédé).
    const royal = await api('/cf/decks', { name: 'Royal <b>', cards: withPatron }, ana.token);
    expect(royal.ok).toBe(true);
    const d = royal.state.decks.find((x: { id: string }) => x.id === royal.id);
    expect(d).toMatchObject({ name: 'Royal b', valid: true });
    await api('/cf/decks', { name: 'Quatre', cards: STARTER_DECKS[1].cards }, ana.token);
    await api('/cf/decks', { name: 'Cinq', cards: STARTER_DECKS[1].cards }, ana.token);
    const six = await api('/cf/decks', { name: 'Six', cards: STARTER_DECKS[1].cards }, ana.token);
    expect(six.code).toBe(400);
    expect(six.error).toMatch(/5 decks au plus/);
    // Renommer, modifier, choisir l'actif.
    const ren = await api(`/cf/decks/${royal.id}`, { name: 'Le Royal' }, ana.token);
    expect(ren.state.decks.find((x: { id: string }) => x.id === royal.id).name).toBe('Le Royal');
    const bad = await api(`/cf/decks/${royal.id}`, { cards: { patron: 1 } }, ana.token);
    expect(bad.code).toBe(400);
    const act = await api(`/cf/decks/${royal.id}/active`, {}, ana.token);
    expect(act.state.activeDeck).toBe(royal.id);
    // Une carte d'un deck ne peut pas être recyclée.
    const rec = await api('/cf/recycle', { cardId: 'patron', count: 1, confirm: true }, ana.token);
    expect(rec.code).toBe(409);
    expect(rec.error).toMatch(/Le Royal/);
    // Suppression du deck actif : un autre devient actif.
    const del = await api(`/cf/decks/${royal.id}`, undefined, ana.token, 'DELETE');
    expect(del.state.decks).toHaveLength(4);
    expect(del.state.activeDeck).toBe(zinc.id);
    expect((await api(`/cf/decks/${royal.id}`, undefined, ana.token, 'DELETE')).code).toBe(404);
    expect((await api(`/cf/decks/${zinc.id}`, { name: 'Volé' }, bob.token)).code).toBe(404); // deck d'un autre
  });

  it('capsules : contre l’ordinateur, plafond quotidien ; booster de première victoire', async () => {
    const c = await reg('Cleo');
    await api('/cf/discover', {}, c.token);
    const b0 = (await me(c.token)).boosters;
    const first = cards().recordCfGame({ winnerId: c.id, loserId: null, ranked: false, vsBot: true });
    expect(first[0]).toMatchObject({ won: true, capsules: CAPSULES.vsBot, booster: true });
    for (let i = 0; i < 12; i++) cards().recordCfGame({ winnerId: i % 2 ? c.id : null, loserId: i % 2 ? null : c.id, ranked: false, vsBot: true });
    const s = await me(c.token);
    expect(s.botCapsulesToday).toBe(CF_BOT_DAILY_CAPSULES);
    expect(s.boosters).toBe(b0 + 1); // une seule première victoire
    expect(s.firstWinToday).toBe(true);
    // Les capsules des missions du jour s'ajoutent (victoire / partie) : au-delà du plafond, rien de plus.
    const missionCaps = s.missions.filter((m: { done: boolean; kind: string }) => m.done && ['partie', 'victoire'].includes(m.kind)).reduce((a: number, m: { capsules: number }) => a + m.capsules, 0);
    expect(s.capsules).toBe(CF_BOT_DAILY_CAPSULES + missionCaps);
    expect(cards().recordCfGame({ winnerId: c.id, loserId: null, ranked: false, vsBot: true })[0].capsules).toBe(0);
    // Abandon : rien.
    const ab = cards().recordCfGame({ winnerId: null, loserId: c.id, ranked: false, vsBot: true, abandoned: true });
    expect(ab[0]).toMatchObject({ capsules: 0, booster: false, missions: [] });
    expect((await me(c.token)).history[0]).toMatchObject({ result: 'abandon', opponent: 'Ordinateur', vsBot: true });
    // Le lendemain : nouveau plafond et nouvelle première victoire.
    clock += 86400_000;
    const next = cards().recordCfGame({ winnerId: c.id, loserId: null, ranked: false, vsBot: true });
    expect(next[0]).toMatchObject({ capsules: CAPSULES.vsBot, booster: true });
  });

  it('partie classée : 15 / 5 capsules, points de ligue, plancher de division, historique', async () => {
    const d = await reg('Dede'), e = await reg('Emma');
    const r = cards().recordCfGame({ winnerId: d.id, loserId: e.id, ranked: true, vsBot: false });
    const w = r.find((x) => x.userId === d.id)!, l = r.find((x) => x.userId === e.id)!;
    expect(w).toMatchObject({ capsules: CAPSULES.rankedWin, booster: true, points: 25, leaguePoints: 25 });
    expect(l).toMatchObject({ capsules: CAPSULES.rankedLoss, booster: false, points: 0, leaguePoints: 0 }); // plancher 0
    const lg = await api('/cf/league', undefined, d.token);
    expect(lg.me).toMatchObject({ points: 25, division: 'comptoir', games: 1, wins: 1, rank: 1 });
    expect(lg.top[0]).toMatchObject({ username: 'Dede', points: 25 });
    expect(lg.divisions).toHaveLength(5);
    expect(lg.me.endsOn).toMatch(/^\d{4}-\d{2}-01$/);
    const hist = (await me(e.token)).history[0];
    expect(hist).toMatchObject({ opponent: 'Dede', ranked: true, result: 'defaite', points: 0, capsules: CAPSULES.rankedLoss });
    // Plancher : à 310 (Bistrot), une défaite ne fait pas redescendre sous 300.
    const season = lg.me.season;
    srv.store.cfLeagueSet({ season, user_id: d.id, points: 310, best: 310, games: 5, wins: 5, updated_at: clock });
    srv.store.cfLeagueSet({ season, user_id: e.id, points: 310, best: 310, games: 5, wins: 0, updated_at: clock });
    cards().recordCfGame({ winnerId: e.id, loserId: d.id, ranked: true, vsBot: false });
    expect((await api('/cf/league', undefined, d.token)).me).toMatchObject({ points: 300, floor: 300, division: 'bistrot' });
    expect((await api('/cf/league', undefined, e.token)).me.points).toBe(335);
    // Abandon en classée : défaite pour les points, aucune capsule.
    const ab = cards().recordCfGame({ winnerId: e.id, loserId: d.id, ranked: true, vsBot: false, abandoned: true });
    expect(ab.find((x) => x.userId === d.id)).toMatchObject({ capsules: 0, points: 0 });
    expect(ab.find((x) => x.userId === e.id)!.capsules).toBe(CAPSULES.rankedWin);
  });

  it('missions du jour : progression et capsules à la fin', async () => {
    const f = await reg('Fanny');
    const ms = cards().missions(f.id);
    const m = ms.find((x) => x.target > 1) ?? ms[0];
    const before = (await me(f.token)).capsules;
    expect(cards().progressCfMission(f.id, m.kind, m.target - 1)).toEqual(m.target > 1 ? [] : [expect.objectContaining({ id: m.id })]);
    if (m.target > 1) expect(cards().progressCfMission(f.id, m.kind, 5).map((x) => x.id)).toEqual([m.id]);
    const s = await me(f.token);
    expect(s.missions.find((x: { id: string }) => x.id === m.id)).toMatchObject({ done: true, progress: m.target });
    expect(s.capsules).toBe(before + m.capsules);
    expect(cards().progressCfMission(f.id, m.kind, 1)).toEqual([]); // déjà finie
  });

  it('fin de saison : récompenses par division, notification, Légende du zinc, −2 divisions', async () => {
    const g = await reg('Gaston');
    const season = (await api('/cf/league', undefined, g.token)).me.season;
    srv.store.cfLeagueSet({ season, user_id: g.id, points: 1900, best: 1900, games: 30, wins: 25, updated_at: clock });
    const b0 = (await me(g.token)).boosters;
    // Mois suivant.
    const [y, m] = season.split('-').map(Number);
    clock = Date.parse(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-02T12:00:00Z`);
    const done = cards().rollCfSeason();
    expect(done).toContain(g.id);
    expect(cards().rollCfSeason()).toEqual([]); // une seule fois
    const s = await me(g.token);
    expect(s.boosters).toBe(b0 + 5);
    expect(s.legendPicks).toBe(1);
    expect(s.cosmetics).toContain(`dos-anime:${season}`);
    expect(s.titles).toEqual(expect.arrayContaining([`cf:${season}:grand-cafe`, `cf:${season}:legende`]));
    expect(s.league).toMatchObject({ points: 700, division: 'brasserie', games: 0, floor: 700 });
    const n = await api('/notifications', undefined, g.token);
    expect(n.notices.some((x: { kind: string; text: string }) => x.kind === 'cf-saison' && /Légende du zinc/.test(x.text))).toBe(true);
    // Légendaire au choix.
    expect((await api('/cf/legend-pick', { cardId: 'leurre' }, g.token)).code).toBe(400);
    const pick = await api('/cf/legend-pick', { cardId: 'retournement-veste' }, g.token);
    expect(pick.state.collection['retournement-veste'].count).toBe(1);
    expect(pick.state.legendPicks).toBe(0);
    // Les joueurs de Comptoir : 1 booster ; Dede (Bistrot) : 2 boosters, repart à 0.
    const dede = srv.store.userByName('Dede')!;
    expect(srv.store.cfLeagueRow(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`, dede.id)).toBeUndefined();
  });

  it('administration : voir et modifier capsules, boosters, cartes (journalisé)', async () => {
    expect((await api(`/admin/players/${ana.id}/cf`, undefined, ana.token)).code).toBe(403);
    expect((await api(`/admin/players/${ana.id}/cf`, { what: 'capsules', delta: 10 }, ana.token)).code).toBe(403);
    const v = await api('/admin/players/Ana/cf', undefined, admin);
    expect(v.cf.discovered).toBe(true);
    expect(v.cf.decks.length).toBeGreaterThan(0);
    expect(v.cards).toHaveLength(CARDS.length);
    const b = await api('/admin/players/Ana/cf', { what: 'boosters', delta: 2 }, admin);
    expect(b.cf.boosters).toBeGreaterThanOrEqual(2);
    expect((await api('/admin/players/Ana/cf', { what: 'capsules', delta: -100000 }, admin)).error).toMatch(/n’a que/);
    expect((await api('/admin/players/Ana/cf', { what: 'card', cardId: 'zzz', delta: 1 }, admin)).error).toMatch(/inconnue/);
    const sh = await api('/admin/players/Ana/cf', { what: 'card', cardId: 'videur', delta: 1, shiny: true }, admin);
    expect(sh.cf.cards.find((x: { id: string }) => x.id === 'videur')).toMatchObject({ shiny: 1 });
    // Retirer toutes ses Josiane (les boosters ont pu en donner d'autres) casse « Le Zinc » : refusé.
    const jo = (await api('/admin/players/Ana/cf', undefined, admin)).cf.cards.find((x: { id: string; count: number }) => x.id === 'josiane')?.count ?? 1;
    const broken = await api('/admin/players/Ana/cf', { what: 'card', cardId: 'josiane', delta: -jo }, admin);
    expect(broken.error).toMatch(/utilisée dans/);
    const sheet = await api('/admin/players/Ana', undefined, admin);
    expect(sheet.player.cf).toMatchObject({ discovered: true });
    const log = await api('/admin/log', undefined, admin);
    expect(log.log.some((x: { action: string; details: string }) => x.action === 'cf-boosters+' && /Coups Fourrés/.test(x.details))).toBe(true);
  });

  it('suppression du compte : données du mode effacées', async () => {
    const h = await reg('Hugo');
    await api('/cf/discover', {}, h.token);
    srv.store.deleteUser(h.id);
    expect(srv.store.cfPlayerFind(h.id)).toBeUndefined();
    expect(srv.store.cfCards(h.id)).toEqual([]);
    expect(srv.store.cfDecks(h.id)).toEqual([]);
  });
});
