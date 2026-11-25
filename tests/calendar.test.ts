/** Calendrier de l'année : dates, moments légers, fève de la galette, Tournoi du Réveillon, ligne d'annonce, traductions. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Router } from 'express';
import { startServer } from '../server/app';
import { Store } from '../server/db';
import { createScheduled } from '../server/scheduled';
import {
  FEVE_CHANCE, FEVE_DIE, LIGHT_MOMENTS, drawFeve, easterSunday, feveTitle, galetteOf, lightOf,
} from '../shared/progress/calendar';
import {
  EGG_CHANCE, FETE_BOSSES, FETE_CHALLENGES, applyFetesGame, calendarHeadline, calendarPush, feteBoss, feteMoment, feteOf, fetePush, seasonDecor,
} from '../shared/progress/fetes';
import { activeEvent, coinBoost } from '../shared/progress/events';
import { newProfile, openBag, sanitizeProfile, titleLabel } from '../shared/progress/profile';
import { getItem } from '../shared/progress/catalog';
import { contrast } from '../shared/progress/dice-collection';
import { REVEILLON_DIE, REVEILLON_TITLE, applyReveillon, brusselsTime, isReveillonSlot, nextSlots } from '../shared/scheduled';
import { DICTS, LANGS, translate, type MessageKey } from '../shared/i18n';
import { calendarFr } from '../shared/i18n/zones/calendar.fr';
import { translateServerText } from '../shared/i18n/server-texts';
import { fetePersonas } from '../client/src/fetes/personas';
import { PERSONA_CAUTION } from '../shared/rejeu/r421';

/** Petit hasard à graine (mulberry32). */
const seeded = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe('calendrier : dates 2026–2028', () => {
  it('Pâques (algorithme) et sa période du vendredi au lundi', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2028)).toBe('2028-04-16');
    expect(easterSunday(2029)).toBe('2029-04-01');
    expect(lightOf('2027-03-26')?.id).toBe('paques');
    expect(lightOf('2027-03-29')?.id).toBe('paques');
    expect(lightOf('2027-03-30')).toBeNull();
    expect(lightOf('2028-04-14')?.id).toBe('paques');
    expect(lightOf('2028-04-13')).toBeNull();
  });
  it('chaque moment léger, chaque année', () => {
    for (const y of [2026, 2027, 2028]) {
      expect(lightOf(`${y}-02-02`)?.id).toBe('chandeleur');
      expect(lightOf(`${y}-02-03`)).toBeNull();
      expect(lightOf(`${y}-04-01`)?.id).toBe('poisson');
      expect(lightOf(`${y}-04-02`)).toBeNull();
      expect(lightOf(`${y}-06-21`)?.id).toBe('musique');
      expect(lightOf(`${y}-10-31`)?.id).toBe('halloween');
      expect(lightOf(`${y}-10-30`)).toBeNull();
      expect(galetteOf(`${y}-01-02`)).toBeNull();
      expect(galetteOf(`${y}-01-03`)?.year).toBe(y);
      expect(galetteOf(`${y}-01-15`)?.end).toBe(`${y}-01-15`);
      expect(galetteOf(`${y}-01-16`)).toBeNull();
      expect(isReveillonSlot(`${y}-12-31-21h`)).toBe(true);
    }
    // 2029 : Pâques tombe le 1er avril, Pâques passe avant le poisson.
    expect(lightOf('2029-04-01')?.id).toBe('paques');
  });
  it('éditions gérées comme des fêtes, sans toucher Saint-Nicolas, les fêtes, Halloween en boutique ni les pièces', () => {
    expect(feteOf('2027-02-02')).toEqual({ id: 'chandeleur', key: 'chandeleur:2027', start: '2027-02-02', end: '2027-02-02' });
    expect(feteOf('2027-03-28')?.key).toBe('paques:2027');
    expect(feteOf('2026-12-06')?.id).toBe('saint-nicolas');
    expect(feteOf('2027-01-02')?.id).toBe('fetes');
    expect(feteOf('2027-01-05')).toBeNull();
    expect(activeEvent('2026-10-31')?.id).toBe('halloween'); // boutique d'Halloween intacte
    expect(feteOf('2026-10-31')?.id).toBe('halloween');
    expect(feteOf('2026-11-01')).toBeNull();
    // Pas de pièces boostées par les moments légers (gains bas) : mercredi 2 février 2028, hors carnaval.
    expect(coinBoost('2028-02-02')).toBeNull();
    expect(coinBoost('2027-02-02')?.label).toMatch(/Carnaval/); // 2027 : le carnaval (déjà là) garde son bonus
    expect(feteMoment('2027-02-02')).toEqual({ kind: 'cal', id: 'chandeleur' });
    expect(feteMoment('2027-01-31')).toBeNull(); // pas d'annonce dans le bandeau : seulement le jour même
    expect(seasonDecor('2027-04-01')).toBe('poisson');
    expect(seasonDecor('2027-01-06')).toBe('galette');
    expect(seasonDecor('2027-03-01')).toBeNull();
    expect(feteBoss('2027-03-28')?.def.id).toBe('ev-paques');
    expect(feteBoss('2026-10-31')?.def.id).toBe('ev-halloween');
    expect(feteBoss('2027-02-02')).toBeNull();
  });
});

describe('calendrier : défis, adversaires et œufs (gains bas)', () => {
  it('un défi par moment léger, quelques pièces, une fois par édition', () => {
    for (const m of LIGHT_MOMENTS) {
      expect(FETE_CHALLENGES[m.id]).toHaveLength(1);
      expect(FETE_CHALLENGES[m.id][0].coins).toBeLessThanOrEqual(15);
    }
    let p = newProfile();
    const c0 = p.coins;
    for (let i = 0; i < 2; i++) p = applyFetesGame(p, { game: 'dm', won: true }, '2027-02-02').profile;
    expect(p.coins - c0).toBe(10);
    expect(p.fete?.k).toBe('chandeleur:2027');
    p = applyFetesGame(p, { game: 'dm', won: true }, '2027-02-02').profile;
    expect(p.coins - c0).toBe(10);
    // Fête de la musique : deux jeux différents.
    let q = newProfile();
    q = applyFetesGame(q, { game: '421', won: false }, '2027-06-21').profile;
    const r = applyFetesGame(q, { game: 'pm', won: false }, '2027-06-21');
    expect(r.done.map((d) => d.id)).toEqual(['fet-mu-jeux']);
    // Le profil nettoyé garde l'édition.
    expect(sanitizeProfile(r.profile).fete?.k).toBe('musique:2027');
  });
  it('adversaire spécial de Pâques : 15 pièces, titre et accessoire, une fois', () => {
    const b = FETE_BOSSES.paques!;
    const p = newProfile();
    const r = applyFetesGame(p, { game: '421', won: true, boss: b.def.id }, '2027-03-28', () => 0.99);
    expect(r.profile.coins - p.coins).toBe(15);
    expect(r.profile.titles).toContain('fete:paques');
    expect(r.profile.owned).toContain('acc-oeuf');
    expect(titleLabel('fete:paques')).toBe('Dénicheur d’œufs');
    const again = applyFetesGame(r.profile, { game: '421', won: true, boss: b.def.id }, '2027-03-28', () => 0.99);
    expect(again.profile.coins - r.profile.coins).toBe(0);
  });
  it('œufs de Pâques : sur une victoire seulement, un seul sac par Pâques', () => {
    let p: ReturnType<typeof newProfile> = { ...newProfile(), bags: 0 };
    expect(applyFetesGame(p, { game: 'cf', won: false }, '2027-03-27', () => 0).profile.bags).toBe(0);
    expect(applyFetesGame(p, { game: 'cf', won: true }, '2027-03-27', () => EGG_CHANCE + 0.01).profile.bags).toBe(0);
    const r = applyFetesGame(p, { game: 'cf', won: true }, '2027-03-27', () => 0);
    expect(r.profile.bags).toBe(1);
    expect(r.done.map((d) => d.id)).toContain('fet-egg-paques');
    p = r.profile;
    expect(applyFetesGame(p, { game: 'cf', won: true }, '2027-03-28', () => 0).profile.bags).toBe(1);
    expect(sanitizeProfile(p).fete?.egg).toBe(1);
    // Hors Pâques : rien.
    expect(applyFetesGame({ ...newProfile(), bags: 0 }, { game: 'cf', won: true }, '2027-04-10', () => 0).profile.bags).toBe(0);
  });
  it('personnages : prudence identique côté rejeu, traduits', () => {
    for (const per of fetePersonas(['lapin', 'fantome'])) {
      expect(PERSONA_CAUTION[per.id]).toBe(per.style.caution);
      expect(per.name).toBeTruthy();
    }
  });
});

describe('galette des rois : la fève', () => {
  it('pur hasard, environ 1 sac sur 12, une fois par an, seulement pendant la période', () => {
    const rng = seeded(7);
    let hits = 0;
    const N = 24000;
    for (let i = 0; i < N; i++) if (drawFeve(newProfile(), '2027-01-06', rng)) hits++;
    expect(hits / N).toBeGreaterThan(FEVE_CHANCE * 0.85);
    expect(hits / N).toBeLessThan(FEVE_CHANCE * 1.15);
    expect(drawFeve(newProfile(), '2027-01-20', () => 0)).toBeNull();
    expect(drawFeve(newProfile(), '2027-01-02', () => 0)).toBeNull();
    const f = drawFeve(newProfile(), '2027-01-06', () => 0)!;
    expect(f.year).toBe(2027);
    expect(f.profile.feve).toBe(2027);
    expect(f.profile.owned).toContain(FEVE_DIE);
    expect(f.profile.titles).toContain(feveTitle(2027));
    expect(drawFeve(f.profile, '2027-01-10', () => 0)).toBeNull(); // une seule par an
    const next = drawFeve(f.profile, '2028-01-04', () => 0)!; // l'an suivant : nouveau titre
    expect(next.profile.titles).toEqual(expect.arrayContaining([feveTitle(2027), feveTitle(2028)]));
    expect(titleLabel(feveTitle(2028))).toBe('Roi ou reine du 421 2028');
    expect(translateServerText('en', 'Roi ou reine du 421 2028')).toBe('King or queen of 421 2028');
    // Profil nettoyé : champ et titre gardés.
    const s = sanitizeProfile(next.profile);
    expect(s.feve).toBe(2028);
    expect(s.titles).toContain(feveTitle(2028));
  });
  it('à l’ouverture d’un sac : contenu inchangé, fève en plus', () => {
    const p = { ...newProfile(), bags: 2 };
    const a = openBag(p, seeded(3))!;
    const b = openBag(p, seeded(3), '2027-01-06');
    expect(b!.result.id).toBe(a.result.id);
    const lucky = openBag(p, (() => { let i = 0; return () => (++i > 4 ? 0 : seeded(3)()); })(), '2027-01-06')!;
    expect(lucky.profile.bags).toBe(1);
    // Hors période : jamais.
    expect(openBag(p, () => 0, '2027-02-06')!.result.feve).toBeUndefined();
  });
  it('dé Fève lisible (contraste ≥ 4), jamais en vente', () => {
    const d = getItem(FEVE_DIE);
    expect(d?.category).toBe('dice');
    if (d?.category !== 'dice') return;
    expect(contrast(d.pip, d.body)).toBeGreaterThanOrEqual(4);
    expect(contrast(d.pip, d.body2)).toBeGreaterThanOrEqual(4);
    expect(d.pass).toBe(1);
    for (const id of ['acc-oeuf', 'acc-fantome']) expect(getItem(id)?.pass).toBe(1);
  });
});

describe('galette des rois : serveur', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, authAttempts: 1000 }, turnTimeoutMs: 60_000 });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { vi.useRealTimers(); await srv.close(); });
  async function api(path: string, body?: object, token?: string) {
    const r = await fetch(`${base}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, ...(await r.json()) };
  }
  it('le serveur tire la fève (jour du serveur), une seule par an', async () => {
    const reg = await api('/register', { username: 'Galette1', password: 'motdepasse1' });
    const u = srv.store.userByName('Galette1')!;
    srv.store.saveProfile(u.id, { ...srv.store.profileOf(u), bags: 99 });
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2027-01-06T12:00:00Z'));
    let found = 0;
    let last: any = null;
    for (let i = 0; i < 99; i++) {
      const r = await api('/bags/open', {}, reg.token);
      expect(r.status).toBe(200);
      if (r.result.feve) { found++; expect(r.result.feve).toBe(2027); }
      last = r.profile;
    }
    // (11/12)^99 ≈ 0,02 % : la fève sort presque sûrement, et jamais deux fois.
    expect(found).toBe(1);
    expect(last.feve).toBe(2027);
    expect(last.owned).toContain(FEVE_DIE);
    expect(last.titles).toContain(feveTitle(2027));
    vi.useRealTimers();
  });
});

describe('Tournoi du Réveillon', () => {
  it('identification : seulement le 21 h du 31 décembre', () => {
    expect(isReveillonSlot('2026-12-31-21h')).toBe(true);
    expect(isReveillonSlot('2026-12-31-11h')).toBe(false);
    expect(isReveillonSlot('2026-12-30-21h')).toBe(false);
    const slots = nextSlots(brusselsTime(2026, 12, 31, 15));
    expect(slots.map((s) => s.id)).toEqual(['2026-12-31-21h', '2027-01-01-11h']);
    expect(slots.filter((s) => isReveillonSlot(s.id))).toHaveLength(1);
  });
  it('podium : titre ; vainqueur : dé Champagne s’il manque ; rien d’autre', () => {
    const p = newProfile();
    expect(applyReveillon(p, '2026-12-31-11h', 0)).toBeNull();
    expect(applyReveillon(p, '2026-12-31-21h', 3)).toBeNull();
    const w = applyReveillon(p, '2026-12-31-21h', 0)!;
    expect(w).toMatchObject({ title: true, die: true });
    expect(w.profile.owned).toContain(REVEILLON_DIE);
    expect(w.profile.coins).toBe(p.coins);
    const second = applyReveillon(p, '2026-12-31-21h', 1)!;
    expect(second).toMatchObject({ title: true, die: false });
    expect(applyReveillon(w.profile, '2027-12-31-21h', 0)).toBeNull(); // déjà tout
    expect(titleLabel(REVEILLON_TITLE)).toBe('Podium du Réveillon');
    expect(translateServerText('de', 'Podium du Réveillon')).toBe('Silvester-Podest');
  });
  it('serveur : inscription et remboursement inchangés, sacs + titre + dé à la fin', () => {
    const store = new Store(':memory:');
    let now = brusselsTime(2026, 12, 31, 20);
    const sched = createScheduled({
      store, router: Router(), now: () => now, userFromToken: () => undefined, push: () => {}, onProfile: () => {},
      live: () => null, mine: () => null,
    });
    const ids = ['a', 'b', 'c', 'd', 'e'];
    for (const id of ids) store.createUser({ id, username: `Rev${id}`, passHash: 'x', recoveryHash: 'y', profile: { ...newProfile(), coins: 50 } });
    for (const id of ids) expect(sched.register(id, '2026-12-31-21h')).toBeNull();
    expect(store.profileOf(store.userById('a')!).coins).toBe(40); // même inscription : 10 pièces
    now = brusselsTime(2026, 12, 31, 21, 6);
    const b = sched.begin('2026-12-31-21h', ['a', 'b', 'c', 'd']);
    expect(b.ok).toBe(true);
    expect(store.profileOf(store.userById('e')!).coins).toBe(50); // absent remboursé
    sched.finish('2026-12-31-21h', ['b', 'a', 'c', 'd']);
    const pb = store.profileOf(store.userById('b')!);
    expect(pb.titles).toContain(REVEILLON_TITLE);
    expect(pb.owned).toContain(REVEILLON_DIE);
    expect(pb.bags).toBe((newProfile().bags ?? 0) + 1); // barème habituel (4 joueurs : 1 sac au premier)
    expect(store.profileOf(store.userById('c')!).titles).toContain(REVEILLON_TITLE);
    expect(store.profileOf(store.userById('a')!).owned).not.toContain(REVEILLON_DIE);
    expect(store.profileOf(store.userById('d')!).titles ?? []).not.toContain(REVEILLON_TITLE);
    expect(store.profileOf(store.userById('d')!).coins).toBe(40);
  });
});

describe('ligne d’annonce (accueil) et notifications', () => {
  it('par jour : fêtes existantes, Réveillon, galette, moments légers et leurs annonces', () => {
    expect(calendarHeadline('2026-11-25')).toEqual({ id: 'sn-soon', icon: '🍊', key: 'fet.m.sn-soon.many', params: { n: 3 } });
    expect(calendarHeadline('2026-12-06')?.key).toBe('fet.m.sn-day');
    expect(calendarHeadline('2026-12-10')?.key).toBe('fet.m.advent');
    expect(calendarHeadline('2026-12-25')?.key).toBe('fet.m.xmas');
    expect(calendarHeadline('2026-12-31')).toEqual({ id: 'reveillon', icon: '🥂', key: 'cal.reveillon.on' });
    expect(calendarHeadline('2027-01-01')?.key).toBe('fet.m.ny');
    expect(calendarHeadline('2027-01-06')).toEqual({ id: 'galette', icon: '👑', key: 'cal.galette.on' });
    expect(calendarHeadline('2027-01-20')).toBeNull();
    expect(calendarHeadline('2027-01-28')).toEqual({ id: 'chandeleur', icon: '🥞', key: 'cal.chandeleur.soon.many', params: { n: 5 } });
    expect(calendarHeadline('2027-02-01')?.key).toBe('cal.chandeleur.soon.one');
    expect(calendarHeadline('2027-02-02')?.key).toBe('cal.chandeleur.on');
    expect(calendarHeadline('2027-03-24')?.key).toBe('cal.paques.soon.many');
    expect(calendarHeadline('2027-03-28')?.key).toBe('cal.paques.on');
    expect(calendarHeadline('2027-03-30')?.key).toBe('cal.poisson.soon.many');
    expect(calendarHeadline('2028-06-21')?.key).toBe('cal.musique.on');
    expect(calendarHeadline('2028-10-31')?.key).toBe('cal.halloween.on');
    expect(calendarHeadline('2028-07-10')).toBeNull();
    // Toutes les clés renvoyées existent dans les 4 langues, sur toute l'année.
    for (let t = Date.parse('2026-01-01T12:00:00Z'); t < Date.parse('2029-01-01T12:00:00Z'); t += 86400_000) {
      const h = calendarHeadline(new Date(t).toISOString().slice(0, 10));
      if (!h) continue;
      for (const l of LANGS) {
        expect(DICTS[l][h.key as MessageKey], `${l}:${h.key}`).toBeTruthy();
        expect(translate(l, h.key as MessageKey, h.params)).not.toMatch(/\{\w+\}/);
      }
    }
  });
  it('notifications du jour : traduites, une par moment', () => {
    const days = ['2027-01-06', '2027-02-02', '2027-03-28', '2027-04-01', '2027-06-21', '2027-10-31', '2027-12-31'];
    for (const d of days) {
      const p = calendarPush(d)!;
      expect(p, d).not.toBeNull();
      for (const l of LANGS) for (const k of [p.key, p.bodyKey]) expect(DICTS[l][k as MessageKey], `${l}:${k}`).toBeTruthy();
      expect(fetePush(d)).toBeNull(); // jamais deux notifications d'événement le même jour
    }
    expect(calendarPush('2027-03-27')).toBeNull(); // Pâques : le dimanche seulement
    expect(calendarPush('2029-04-01')?.id).toBe('paques'); // 2029 : dimanche de Pâques = 1er avril
    expect(calendarPush('2027-05-10')).toBeNull();
  });
  it('zone calendar : toutes les clés en en/de/nl, mêmes {variables}', () => {
    const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
    for (const l of ['en', 'de', 'nl'] as const) for (const [k, fr] of Object.entries(calendarFr)) {
      const t = DICTS[l][k as MessageKey];
      expect(t, `${l}:${k}`).toBeTruthy();
      expect(holes(t as string), `${l}:${k}`).toEqual(holes(fr));
    }
  });
});
