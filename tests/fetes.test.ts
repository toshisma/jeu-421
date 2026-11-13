/** Saint-Nicolas et fêtes : calendrier, défis d'événement, adversaires spéciaux, calendrier de l'avent (pur et serveur), traductions. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer } from '../server/app';
import {
  ADVENT_LAST, FETE_BOSSES, FETE_BOSS_COINS, FETE_CHALLENGES, FETE_DIE, adventCell, adventReward, applyFetesGame, claimAdvent,
  feteBoss, feteMoment, feteOf, fetePush, feteState, seasonDecor,
} from '../shared/progress/fetes';
import { applyGameEnd, newProfile, rewardFor, sanitizeProfile, titleLabel, capGuestImport, type RewardContext } from '../shared/progress/profile';
import { applyDixMilleGame } from '../shared/dixmille/reward';
import { getItem, ITEMS } from '../shared/progress/catalog';
import { contrast } from '../shared/progress/dice-collection';
import { activeEvent } from '../shared/progress/events';
import { fetesFr } from '../shared/i18n/zones/fetes.fr';
import { fetesEn } from '../shared/i18n/zones/fetes.en';
import { fetesDe } from '../shared/i18n/zones/fetes.de';
import { fetesNl } from '../shared/i18n/zones/fetes.nl';
import { translate } from '../shared/i18n';
import { solo421 } from './rejeu-helpers';
import { translateServerText } from '../shared/i18n/server-texts';

describe('fêtes : calendrier des annonces', () => {
  it('annonce, compte à rebours, jour J (5, 6, 7 décembre, 24, 1er janvier)', () => {
    expect(feteMoment('2026-11-20')).toBeNull();
    expect(feteMoment('2026-11-25')).toEqual({ kind: 'sn-soon', n: 3 });
    expect(feteMoment('2026-11-27')).toEqual({ kind: 'sn-soon', n: 1 });
    expect(feteMoment('2026-11-28')).toEqual({ kind: 'sn-countdown', n: 8 });
    expect(feteMoment('2026-12-05')).toEqual({ kind: 'sn-countdown', n: 1 });
    expect(feteMoment('2026-12-06')).toEqual({ kind: 'sn-day' });
    expect(feteMoment('2026-12-07')).toEqual({ kind: 'advent' });
    expect(feteMoment('2026-12-15')).toEqual({ kind: 'fe-soon', n: 5 });
    expect(feteMoment('2026-12-20')).toEqual({ kind: 'xmas-countdown', n: 5 });
    expect(feteMoment('2026-12-24')).toEqual({ kind: 'xmas-eve' });
    expect(feteMoment('2026-12-25')).toEqual({ kind: 'xmas' });
    expect(feteMoment('2026-12-28')).toEqual({ kind: 'ny-countdown', n: 4 });
    expect(feteMoment('2026-12-31')).toEqual({ kind: 'ny-eve' });
    expect(feteMoment('2027-01-01')).toEqual({ kind: 'ny' });
    expect(feteMoment('2027-01-03')).toBeNull();
  });
  it('éditions et décor : une édition par an, les fêtes débordent sur janvier, les autres événements intacts', () => {
    expect(feteOf('2026-12-06')?.key).toBe('saint-nicolas:2026');
    expect(feteOf('2026-12-07')).toBeNull();
    expect(feteOf('2026-12-31')?.key).toBe('fetes:2026');
    expect(feteOf('2027-01-02')?.key).toBe('fetes:2026');
    expect(feteOf('2027-01-02')?.end).toBe('2027-01-02');
    expect(seasonDecor('2026-12-05')).toBe('saint-nicolas');
    expect(seasonDecor('2026-12-24')).toBe('fetes');
    expect(seasonDecor('2026-12-10')).toBeNull();
    expect(feteOf('2026-11-01')).toBeNull(); // Halloween reste Halloween
    expect(activeEvent('2026-11-01')?.id).toBe('halloween');
    expect(feteBoss('2026-12-05')?.def.id).toBe('ev-saint-nicolas');
    expect(feteBoss('2027-01-01')?.def.id).toBe('ev-noel');
    expect(feteBoss('2026-12-10')).toBeNull();
  });
  it('notification du jour J', () => {
    expect(fetePush('2026-12-06')?.title).toBe('Joyeuse Saint-Nicolas !');
    expect(fetePush('2026-12-24')).not.toBeNull();
    expect(fetePush('2027-01-01')).not.toBeNull();
    expect(fetePush('2026-12-05')).toBeNull();
  });
});

describe('fêtes : défis d’événement et adversaire spécial (logique commune)', () => {
  const day = '2026-12-02';
  it('les trois jeux comptent, pièces versées une fois, dé gagné quand tout est réussi', () => {
    let p = newProfile();
    const coins0 = p.coins;
    const play = (g: Parameters<typeof applyFetesGame>[1]) => { const r = applyFetesGame(p, g, day); p = r.profile; return r.done; };
    expect(play({ game: '421', won: true, combos: { '421': 1 } }).map((d) => d.id)).toEqual(['fet-sn-421']);
    play({ game: 'dm', won: false });
    expect(play({ game: 'cf', won: true }).map((d) => d.id)).toContain('fet-sn-jeux');
    for (let i = 0; i < 2; i++) play({ game: '421', won: true });
    const last = play({ game: '421', won: false });
    expect(last.map((d) => d.id)).toEqual([]);
    expect(p.owned).not.toContain('dice-mandarine');
    let done: string[] = [];
    for (let i = 0; i < 3; i++) done = done.concat(play({ game: 'dm', won: false }).map((d) => d.id));
    expect(done).toContain('fet-sn-jouer');
    expect(done).toContain('fet-die-saint-nicolas');
    expect(p.owned).toContain(FETE_DIE['saint-nicolas']);
    const all = FETE_CHALLENGES['saint-nicolas'].reduce((s, c) => s + c.coins, 0);
    expect(p.coins - coins0).toBe(all);
    // Plus rien ensuite : rien n'est payé deux fois.
    expect(play({ game: '421', won: true, combos: { '421': 3 } })).toEqual([]);
    expect(p.coins - coins0).toBe(all);
  });
  it('hors événement : rien ne bouge ; nouvelle édition : tout repart à zéro', () => {
    const p = newProfile();
    expect(applyFetesGame(p, { game: '421', won: true }, '2026-12-10').profile).toBe(p);
    const a = applyFetesGame(p, { game: '421', won: true }, '2026-12-02').profile;
    expect(feteState(a, '2026-12-02')?.p['sn-gagner']).toBe(1);
    expect(feteState(a, '2027-12-02')?.p['sn-gagner']).toBeUndefined();
    expect(feteState(a, '2026-12-22')?.k).toBe('fetes:2026');
  });
  it('adversaire spécial : battu une fois par édition (pièces, titre, accessoire), seulement au 421', () => {
    const b = FETE_BOSSES['saint-nicolas'];
    let p = newProfile();
    p = applyFetesGame(p, { game: '421', won: false, boss: b.def.id }, day).profile;
    expect(p.fete?.boss).toBeUndefined();
    const r = applyFetesGame(p, { game: '421', won: true, boss: b.def.id }, day);
    expect(r.done.map((d) => d.id)).toContain('fet-boss-saint-nicolas');
    expect(r.profile.coins - p.coins).toBe(FETE_BOSS_COINS);
    expect(r.profile.titles).toContain('fete:saint-nicolas');
    expect(r.profile.owned).toContain('acc-speculoos');
    const again = applyFetesGame(r.profile, { game: '421', won: true, boss: b.def.id }, day);
    expect(again.profile.coins - r.profile.coins).toBe(0);
    // Le Père Noël n'est pas Saint-Nicolas : pas de récompense hors de son événement.
    expect(applyFetesGame(newProfile(), { game: '421', won: true, boss: 'ev-noel' }, day).profile.fete?.boss).toBeUndefined();
    expect(titleLabel('fete:saint-nicolas')).toBe('Enfant sage');
    expect(titleLabel('fete:noel')).toBe('Lutin des fêtes');
  });
  it('branché dans les fins de partie du 421 (applyGameEnd) et du Courtisan (applyDixMilleGame)', () => {
    const ctx: RewardContext = { mode: 'solo', opponents: 1, difficulty: 'normal', count421: 0, combos: { brelan: 2 }, rounds: 8, day: '2026-12-22', boss: 'ev-noel', minutes: 10, now: Date.parse('2026-12-22T15:00:00Z') };
    const reward = rewardFor(true, 8, ctx);
    const a = applyGameEnd(newProfile(), reward, ctx, '2026-12-22', () => 0.99);
    expect(a.profile.fete?.p['fe-brelans']).toBe(2);
    expect(a.profile.fete?.boss).toBe(1);
    expect(a.achievementsDone?.map((x) => x.id)).toContain('fet-boss-fetes');
    const dm = applyDixMilleGame(a.profile, { won: false, xp: 5, coins: 1, lines: [] }, '2026-12-22', { won: false, players: 2, minutes: 5, mode: 'solo' }, () => 0.99);
    expect(dm.profile.fete?.g).toEqual(['421', 'dm']);
    // Mort subite : ne compte pas (comme les défis du jour).
    const sd = applyGameEnd(newProfile(), reward, { ...ctx, suddenDeath: true }, '2026-12-22', () => 0.99);
    expect(sd.profile.fete).toBeUndefined();
  });
  it('profil : champs nettoyés au chargement, titre gardé, avent repris à l’inscription', () => {
    const p = applyFetesGame(applyFetesGame(newProfile(), { game: '421', won: true, boss: 'ev-saint-nicolas' }, '2026-12-02').profile, { game: 'dm', won: true }, '2026-12-02').profile;
    const withAdvent = claimAdvent({ ...p, title: 'fete:saint-nicolas' }, '2026-12-02')!.profile;
    const back = sanitizeProfile(JSON.parse(JSON.stringify(withAdvent)));
    expect(back.fete).toEqual(withAdvent.fete);
    expect(back.advent).toEqual({ y: 2026, d: [2] });
    expect(back.title).toBe('fete:saint-nicolas');
    expect(sanitizeProfile({ fete: { k: 'bidon:2026', p: { x: 5 }, done: [], g: [] }, advent: { y: 2026, d: [0, 25, 3, 'x'] } }).fete).toBeUndefined();
    expect(sanitizeProfile({ advent: { y: 2026, d: [0, 25, 3, 'x'] } }).advent).toEqual({ y: 2026, d: [3] });
    expect(capGuestImport(withAdvent).advent).toEqual({ y: 2026, d: [2] });
  });
});

describe('calendrier de l’avent (logique)', () => {
  it('une case par jour, seulement le jour même, du 1er au 24 décembre', () => {
    const p = newProfile();
    expect(claimAdvent(p, '2026-11-30')).toBeNull();
    expect(claimAdvent(p, '2026-12-25')).toBeNull();
    const a = claimAdvent(p, '2026-12-06')!;
    expect(a.d).toBe(6);
    expect(a.bag).toBe(1);
    expect(a.profile.bags).toBe(1);
    expect(claimAdvent(a.profile, '2026-12-06')).toBeNull();
    expect(adventCell(a.profile, '2026-12-06', 6)).toBe('open');
    expect(adventCell(a.profile, '2026-12-06', 5)).toBe('missed');
    expect(adventCell(a.profile, '2026-12-06', 7)).toBe('later');
    expect(adventCell(p, '2026-12-06', 6)).toBe('today');
    // L'année suivante, le calendrier repart de zéro.
    expect(claimAdvent(a.profile, '2027-12-06')).not.toBeNull();
    const total = Array.from({ length: ADVENT_LAST }, (_, i) => adventReward(i + 1)).reduce((s, r) => ({ coins: s.coins + r.coins, bag: s.bag + r.bag }), { coins: 0, bag: 0 });
    expect(total).toEqual({ coins: 160, bag: 2 }); // gains modestes
  });
});

describe('objets de saison', () => {
  it('dés lisibles (contraste ≥ 4), jamais en vente, accessoires présents', () => {
    for (const id of ['dice-mandarine', 'dice-champagne']) {
      const it = getItem(id);
      expect(it?.category).toBe('dice');
      if (it?.category !== 'dice') continue;
      expect(contrast(it.pip, it.body), id).toBeGreaterThanOrEqual(4);
      expect(contrast(it.pip, it.body2), id).toBeGreaterThanOrEqual(4);
      expect(it.pass).toBe(1);
    }
    for (const id of ['acc-speculoos', 'acc-cloche']) expect(getItem(id)?.category).toBe('accessoire');
    for (const b of Object.values(FETE_BOSSES)) expect(ITEMS.some((i) => i.id === b.accessory)).toBe(true);
  });
});

describe('fêtes : traductions', () => {
  it('toutes les clés en en/de/nl, non vides, avec les mêmes {variables}', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const [lang, d] of [['en', fetesEn], ['de', fetesDe], ['nl', fetesNl]] as const) {
      for (const key of Object.keys(fetesFr) as (keyof typeof fetesFr)[]) {
        expect(d[key], `${lang} ${key}`).toBeDefined();
        expect(d[key].trim(), `${lang} ${key}`).not.toBe('');
        expect(vars(d[key]), `${lang} ${key}`).toBe(vars(fetesFr[key]));
      }
      expect(Object.keys(d).length).toBe(Object.keys(fetesFr).length);
    }
    expect(translate('nl', 'fet.title.sn')).toBe('Sinterklaas');
    expect(translate('de', 'fet.title.sn')).toBe('Nikolaus');
    expect(translate('en', 'fet.title.sn')).toBe('St Nicholas');
    for (const c of Object.values(FETE_CHALLENGES).flat()) expect(translate('fr', `fet.c.${c.id}` as never)).toBe(c.text);
  });
  it('textes du serveur traduits (titres, notifications, erreurs)', () => {
    for (const lang of ['en', 'de', 'nl'] as const) {
      for (const t of ['Enfant sage', 'Lutin des fêtes', 'Case du jour déjà ouverte.', 'Pas de case à ouvrir aujourd’hui.', fetePush('2026-12-06')!.title, fetePush('2026-12-24')!.body, fetePush('2027-01-01')!.body]) {
        expect(translateServerText(lang, t), `${lang} ${t}`).not.toBe(t);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Serveur : la date vient du serveur, jamais du client.

describe('fêtes côté serveur', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  let clock = Date.parse('2026-12-05T10:00:00Z');
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, soloDailyCap: 50, authAttempts: 1000, now: () => clock }, turnTimeoutMs: 60_000 });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  afterEach(() => { vi.useRealTimers(); });
  async function api(path: string, body?: object, token?: string) {
    const r = await fetch(`${base}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, ...(await r.json()) };
  }
  const register = async (username: string) => (await api('/register', { username, password: 'motdepasse1' })).token as string;

  it('avent : une case par jour (jour du serveur), pas deux, pas demain, pas hors décembre', async () => {
    const token = await register('Avent1');
    clock = Date.parse('2026-12-05T10:00:00Z');
    const a = await api('/fetes/advent', {}, token);
    expect(a.status).toBe(200);
    expect(a.d).toBe(5);
    expect(a.profile.advent).toEqual({ y: 2026, d: [5] });
    const coins = a.profile.coins;
    // Deuxième ouverture le même jour : refusée, même en annonçant une autre date.
    expect((await api('/fetes/advent', {}, token)).status).toBe(409);
    expect((await api('/fetes/advent', { day: '2026-12-06', d: 6 }, token)).status).toBe(409);
    // Le lendemain (horloge du serveur), le 6 : sac de dés.
    clock = Date.parse('2026-12-06T08:00:00Z');
    const b = await api('/fetes/advent', {}, token);
    expect(b.d).toBe(6);
    expect(b.profile.coins - coins).toBe(adventReward(6).coins);
    expect(b.profile.advent.d).toEqual([5, 6]);
    // 23 h 30 UTC le 24 décembre = déjà 0 h 30 le 25 à Bruxelles : plus de case.
    clock = Date.parse('2026-12-24T23:30:00Z');
    expect((await api('/fetes/advent', {}, token)).status).toBe(400);
    clock = Date.parse('2026-11-30T12:00:00Z');
    expect((await api('/fetes/advent', {}, token)).status).toBe(400);
    clock = Date.parse('2026-12-24T12:00:00Z');
    const c = await api('/fetes/advent', {}, token);
    expect(c.d).toBe(24);
    const me = await api('/me', undefined, token);
    expect(me.profile.advent.d).toEqual([5, 6, 24]);
    expect((await api('/fetes/advent', {})).status).toBe(401);
  });

  it('défis et Saint-Nicolas : comptés par le serveur, adversaire refusé hors événement', async () => {
    const token = await register('Sinter1');
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
    // Hors événement : l'adversaire spécial n'est pas accepté au départ, la victoire ne rapporte rien de plus.
    let s = await api('/solo/start', { boss: 'ev-saint-nicolas' }, token);
    let e = await api('/solo/end', { gameToken: s.gameToken, won: true, rounds: 3, opponents: 2, difficulty: 'difficile', boss: 'ev-saint-nicolas' }, token);
    expect(e.status).toBe(200);
    expect(e.applied.profile.fete).toBeUndefined();
    vi.setSystemTime(new Date('2026-12-05T15:00:00Z'));
    // Vraie victoire (rejouée par le serveur) contre Saint-Nicolas, avec un 4-2-1.
    const f = FETE_BOSSES['saint-nicolas'];
    const table = { config: {}, firstIdx: 0, opponents: f.cast.slice(0, 1 + f.def.sidekicks).map((id, i) => ({ persona: `fete-${id}`, difficulty: i ? 'normal' : 'difficile' })) };
    const w = await solo421(api as any, token, { boss: 'ev-saint-nicolas', setup: table, want: 'win', accept: (x) => x.count421 > 0, tries: 2000 });
    e = w.end;
    expect(e.status).toBe(200);
    expect(e.verified).toBe(true);
    const p = e.applied.profile;
    expect(p.fete.k).toBe('saint-nicolas:2026');
    expect(p.fete.boss).toBe(1);
    expect(p.titles).toContain('fete:saint-nicolas');
    expect(p.owned).toContain('acc-speculoos');
    expect(p.fete.done).toContain('sn-421');
    expect(e.applied.achievementsDone.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(['fet-boss-saint-nicolas', 'fet-sn-421']));
    // Le « boss » annoncé à la fin n'est pas cru : seule la partie commencée contre lui compte.
    const token2 = await register('Sinter2');
    const w2 = await solo421(api as any, token2, { want: 'win', extra: { boss: 'ev-saint-nicolas' } });
    expect(w2.end.applied.profile.fete.boss).toBeUndefined();
    expect(w2.end.applied.profile.fete.p['sn-gagner']).toBe(1);
    // Victoire annoncée par une ancienne version : ni défi ni adversaire.
    const token3 = await register('Sinter3');
    s = await api('/solo/start', { boss: 'ev-saint-nicolas' }, token3);
    e = await api('/solo/end', { gameToken: s.gameToken, won: true, rounds: 3, opponents: 2, difficulty: 'difficile', combos: { '421': 1 }, count421: 1 }, token3);
    expect(e.verified).toBe(false);
    expect(e.applied.profile.fete).toBeUndefined();
  });
});
