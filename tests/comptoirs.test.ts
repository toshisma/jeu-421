/** Tournée des comptoirs : déblocages, étoiles calculées par le serveur, refus, pas de double récompense, configs jouables, traductions. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import {
  TDC_BISTROS, TDC_QUARTERS, TDC_STAR_COINS, TDC_PATRONS, applyTdc, bistroUnlocked, bistrosOf, capTdcImport, cleanTdc, minRounds, quarterUnlocked,
  reputation, starsOf, tdcConfig, tdcPlausible, type TdcFacts, type TdcProgress,
} from '../shared/progress/comptoirs';
import { capGuestImport, newProfile, sanitizeProfile, titleLabel } from '../shared/progress/profile';
import { getItem } from '../shared/progress/catalog';
import { PERSONAS } from '../client/src/game/personas';
import { createGame, currentPlayerId, rollAction, stopAction } from '../shared/engine';
import { decide, type Difficulty } from '../shared/ai';
import { DICTS, type Lang } from '../shared/i18n';
import { tdcFr } from '../shared/i18n/zones/comptoirs.fr';
import { translateServerText } from '../shared/i18n/server-texts';
import { TDC_TITLES_FR, tdcBistro } from '../shared/progress/comptoirs';
import { solo421 } from './rejeu-helpers';

const ids = (q: string) => bistrosOf(q).map((b) => b.id);
const all = (q: string, mask = 1): TdcProgress => Object.fromEntries(ids(q).map((id) => [id, mask]));
const facts = (o: Partial<TdcFacts> = {}): TdcFacts => ({ won: true, place: 1, rounds: 20, roundsLost: 2, count421: 1, c111: 0, brelan: 1, elapsedMs: 2 * 60_000, ...o });

describe('données', () => {
  it('12 bistrots, 4 quartiers de 3, adversaires connus, ambiance du catalogue', () => {
    expect(TDC_BISTROS).toHaveLength(12);
    for (const q of TDC_QUARTERS) expect(bistrosOf(q.id)).toHaveLength(3);
    const known = new Set([...PERSONAS.map((p) => p.id), ...TDC_PATRONS.map((p) => p.id)]);
    for (const b of TDC_BISTROS) {
      expect(b.opponents[0].persona).toBe(b.patron);
      for (const o of b.opponents) expect(known.has(o.persona), o.persona).toBe(true);
      expect(getItem(b.look.decor)?.category).toBe('decor');
      expect(getItem(b.look.felt)?.category).toBe('felt');
      expect(getItem(b.look.rim)?.category).toBe('rim');
      const c = tdcConfig(b);
      expect(c.variant === 'manches' ? c.rounds : 2).toBeGreaterThan(1); // jamais de mort subite (elle ne compterait pas)
      // Pas de condition « manches perdues » en variante aux points (non suivie).
      if (c.variant === 'manches') expect(b.stars.some((s) => s.k === 'lost')).toBe(false);
    }
    for (const q of TDC_QUARTERS) {
      if (q.felt) expect(getItem(q.felt)?.category).toBe('felt');
      if (q.title) expect(titleLabel(q.title)).toBeTruthy();
    }
  });
});

describe('déblocages', () => {
  it('quartier 1 seulement au départ, bistrots dans l’ordre', () => {
    const [a, b, c] = ids('marche');
    expect(bistroUnlocked({}, a)).toBe(true);
    expect(bistroUnlocked({}, b)).toBe(false);
    expect(bistroUnlocked({ [a]: 1 }, b)).toBe(true);
    expect(bistroUnlocked({ [a]: 1 }, c)).toBe(false);
    expect(quarterUnlocked({}, 'port')).toBe(false);
  });
  it('quartier suivant : quartier précédent terminé ET réputation suffisante', () => {
    expect(reputation(all('marche'))).toBe(3);
    expect(quarterUnlocked(all('marche'), 'port')).toBe(true); // 3 étoiles = besoin du port
    expect(bistroUnlocked(all('marche'), ids('port')[0])).toBe(true);
    // Gare : 8 étoiles. Port terminé avec 1 étoile partout (6 au total) : pas assez.
    const six = { ...all('marche'), ...all('port') };
    expect(quarterUnlocked(six, 'gare')).toBe(false);
    expect(quarterUnlocked({ ...six, [ids('marche')[0]]: 7 }, 'gare')).toBe(true);
    // Beaucoup d'étoiles mais quartier précédent pas terminé : fermé.
    expect(quarterUnlocked({ ...all('marche', 7), [ids('port')[0]]: 7, [ids('port')[1]]: 7 }, 'gare')).toBe(false);
    const fin = { ...all('marche', 7), ...all('port', 7), ...all('gare', 1) };
    expect(quarterUnlocked(fin, 'boulevards')).toBe(true);
  });
  it('nettoyage et reprise d’invité plafonnée au premier quartier', () => {
    expect(cleanTdc({ 'petit-zinc': 7, inconnu: 3, phare: 6, 'cafe-sports': 99 })).toEqual({ 'petit-zinc': 7 }); // 6 sans victoire : refusé
    expect(capTdcImport({ ...all('marche', 7), ...all('port', 7) })).toEqual(all('marche', 7));
    const guest = sanitizeProfile({ ...newProfile(), tdc: { ...all('marche', 7), ...all('port', 7) }, titles: ['tdc:marche'] });
    expect(guest.tdc).toEqual({ ...all('marche', 7), ...all('port', 7) });
    const imported = capGuestImport(guest);
    expect(imported.tdc).toEqual(all('marche', 7));
    expect(imported.titles ?? []).not.toContain('tdc:marche');
  });
});

describe('étoiles', () => {
  const zinc = TDC_BISTROS[0]; // perdre ≤ 3 manches ; moins de 3 minutes
  it('rien sans victoire ; conditions lisibles', () => {
    expect(starsOf(zinc, facts({ won: false, place: 2 }))).toBe(0);
    expect(starsOf(zinc, facts({ roundsLost: 9, elapsedMs: 9 * 60_000 }))).toBe(1);
    expect(starsOf(zinc, facts({ roundsLost: 3, elapsedMs: 9 * 60_000 }))).toBe(3);
    expect(starsOf(zinc, facts({ roundsLost: 9, elapsedMs: 2.5 * 60_000 }))).toBe(5);
    expect(starsOf(zinc, facts())).toBe(7);
  });
  it('déclarations invraisemblables refusées', () => {
    expect(tdcPlausible(zinc, facts())).toBe(true);
    expect(tdcPlausible(zinc, facts({ elapsedMs: 1000 }))).toBe(false); // trop court
    expect(tdcPlausible(zinc, facts({ rounds: minRounds(zinc) - 1 }))).toBe(false);
    expect(tdcPlausible(zinc, facts({ rounds: 900 }))).toBe(false); // plus d'une manche par seconde
    expect(tdcPlausible(zinc, facts({ roundsLost: 21 }))).toBe(false);
    expect(tdcPlausible(zinc, facts({ count421: 30 }))).toBe(false);
    expect(applyTdc(newProfile(), zinc.id, facts({ count421: 30 })).result.refused).toBe(true);
  });
  it('une seule récompense par étoile, récompense de quartier une fois', () => {
    let p = newProfile();
    const r1 = applyTdc(p, zinc.id, facts({ roundsLost: 9, elapsedMs: 9 * 60_000 }));
    expect(r1.result.newStars).toEqual([1]);
    expect(r1.profile.coins).toBe(TDC_STAR_COINS);
    const r2 = applyTdc(r1.profile, zinc.id, facts({ roundsLost: 9, elapsedMs: 9 * 60_000 }));
    expect(r2.result.newStars).toEqual([]);
    expect(r2.profile.coins).toBe(TDC_STAR_COINS);
    const r3 = applyTdc(r2.profile, zinc.id, facts());
    expect(r3.result.newStars).toEqual([2, 3]);
    expect(r3.profile.coins).toBe(3 * TDC_STAR_COINS);
    p = r3.profile;
    for (const id of ids('marche').slice(1)) p = applyTdc(p, id, facts({ roundsLost: 99, rounds: 200, elapsedMs: 9 * 60_000, count421: 0, brelan: 0 })).profile;
    expect(p.titles).toContain('tdc:marche');
    const again = applyTdc(p, ids('marche')[2], facts({ roundsLost: 99, rounds: 200, elapsedMs: 9 * 60_000, count421: 0, brelan: 0 }));
    expect(again.result.title).toBeUndefined();
    expect(again.profile.titles?.filter((t) => t === 'tdc:marche')).toHaveLength(1);
  });
});

describe('serveur', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, soloDailyCap: 1000, authAttempts: 100000, tdcRoundMs: 10 } });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  const call = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { status: r.status, ...(await r.json()) } as any;
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let n = 0;
  const account = async (guestProfile?: object) => (await call('/register', { username: `Tournee${++n}`, password: 'motdepasse1', ...(guestProfile ? { guestProfile } : {}) })).token as string;
  const play = async (token: string, tdc: string, body: object, ms = 150) => {
    const s = await call('/solo/start', { tdc }, token);
    await wait(ms);
    return { start: s, end: await call('/solo/end', { gameToken: s.gameToken, ...body }, token) };
  };
  const win = { won: true, place: 1, rounds: 12, roundsLost: 2, opponents: 1, difficulty: 'facile', count421: 1, combos: { '421': 1, brelan: 1 } };
  /** Vraie partie de la Tournée (rejouée par le serveur), gagnée ou perdue. */
  const real = (t: string, tdc: string, want: 'win' | 'lose' = 'win', extra: Record<string, unknown> = {}) =>
    solo421(call as any, t, { tdc, setup: { config: {}, opponents: tdcBistro(tdc)!.opponents, firstIdx: 0 }, want, extra, before: async () => { await wait(150); }, tries: 300 });

  it('étoiles attribuées par le serveur, d’après la partie rejouée ; partie comptée comme un solo de 421', async () => {
    const t = await account();
    const { start, end, facts } = await real(t, 'petit-zinc');
    expect(start.tdc).toBe(true);
    expect(end.ok).toBe(true);
    expect(end.verified).toBe(true);
    expect(end.tdc.newStars).toContain(1);
    // 2e / 3e étoiles : d'après les faits rejoués (manches perdues, durée), jamais d'après l'annonce.
    expect(tdcBistro('petit-zinc')!.stars[0]).toEqual({ k: 'lost', n: 3 });
    expect((end.tdc.after >> 1) & 1).toBe((facts.roundsLost ?? 99) <= 3 ? 1 : 0);
    expect((end.tdc.after >> 2) & 1).toBe(1); // gagné en moins de 3 minutes (horloge du serveur)
    expect(end.applied.profile.tdc['petit-zinc'] & 1).toBe(1);
    expect(end.applied.profile.stats.played).toBe(1); // compté comme une partie solo
    expect(end.applied.profile.coins).toBeGreaterThanOrEqual(end.tdc.newStars.length * TDC_STAR_COINS);
  });
  it('bistrot fermé : la partie n’est pas une partie de la Tournée', async () => {
    const t = await account();
    const { start, end } = await play(t, 'palace', win);
    expect(start.tdc).toBeUndefined();
    expect(end.tdc).toBeUndefined();
    expect(end.applied.profile.tdc).toBeUndefined();
  });
  it('pas de double récompense : jeton à usage unique, étoile déjà gagnée', async () => {
    const t = await account();
    const a = await real(t, 'petit-zinc');
    expect((await call('/solo/end', { gameToken: a.start.gameToken, ...win }, t)).status).toBe(400);
    const b = await real(t, 'petit-zinc');
    expect(b.end.tdc.newStars).not.toContain(1);
    expect(b.end.tdc.coins).toBe(b.end.tdc.newStars.length * TDC_STAR_COINS);
  });
  it('victoire annoncée (ancienne version) ou faits ajoutés : aucune étoile', async () => {
    const t = await account();
    const declared = await play(t, 'petit-zinc', win);
    expect(declared.end.verified).toBe(false);
    expect(declared.end.tdc).toBeUndefined();
    const lost = await real(t, 'petit-zinc', 'lose', win);
    expect(lost.end.tdc.newStars).toEqual([]);
    const me = await call('/me', undefined, t);
    expect(me.profile.tdc).toBeUndefined();
    // Le bistrot annoncé à la fin est ignoré : seul celui du départ compte.
    const s = await call('/solo/start', {}, t);
    await wait(150);
    const e = await call('/solo/end', { gameToken: s.gameToken, ...win, tdc: 'petit-zinc', boss: 'tdc:petit-zinc' }, t);
    expect(e.tdc).toBeUndefined();
  });
  it('enchaînement des déblocages côté serveur', async () => {
    const t = await account();
    expect((await play(t, 'cafe-sports', win)).start.tdc).toBeUndefined();
    await real(t, 'petit-zinc');
    await real(t, 'cafe-sports');
    expect((await play(t, 'phare', win)).start.tdc).toBeUndefined();
    await real(t, 'chope-or');
    const me = await call('/me', undefined, t);
    expect(reputation(me.profile.tdc)).toBeGreaterThanOrEqual(3);
    expect(me.profile.titles).toContain('tdc:marche');
    expect((await play(t, 'phare', win)).start.tdc).toBe(true);
  });
  it('profil invité repris à l’inscription : premier quartier seulement', async () => {
    const t = await account({ ...newProfile(), tdc: { ...all('marche', 7), ...all('port', 7) } });
    const me = await call('/me', undefined, t);
    expect(me.profile.tdc).toEqual(all('marche', 7));
    const pub = await call(`/players/Tournee${n}`);
    expect(pub.player.reputation).toBe(9);
  });
});

describe('chaque bistrot se joue jusqu’au bout (ordinateurs entre eux)', () => {
  for (const b of TDC_BISTROS) {
    it(b.id, () => {
      const cfg = tdcConfig(b);
      const players = [{ id: 'moi', name: 'Moi' }, ...b.opponents.map((_, i) => ({ id: `ia-${i}`, name: `IA ${i}` }))];
      const levels: Difficulty[] = ['normal', ...b.opponents.map((o) => o.difficulty)];
      const rounds: number[] = [];
      for (let g = 0; g < 15; g++) {
        const s = createGame(cfg, players, g % players.length);
        let guard = 0;
        while (s.phase !== 'fini' && guard++ < 50_000) {
          const pid = currentPlayerId(s)!;
          const d = decide(s, pid, levels[players.findIndex((p) => p.id === pid)], Math.random);
          if (!(d.kind === 'roll' && rollAction(s, pid, d.keep, () => 1 + Math.floor(Math.random() * 6)).ok)) stopAction(s, pid);
        }
        expect(s.phase).toBe('fini');
        rounds.push(s.round);
      }
      const avg = rounds.reduce((a, x) => a + x, 0) / rounds.length;
      expect(Math.max(...rounds)).toBeLessThan(200); // jamais le garde-fou de 1000 manches
      expect(avg).toBeLessThan(80);
      expect(Math.min(...rounds)).toBeGreaterThanOrEqual(minRounds(b));
    });
  }
});

describe('traductions', () => {
  it('toutes les clés tdc. en en, de, nl', () => {
    for (const l of ['en', 'de', 'nl'] as Lang[]) for (const k of Object.keys(tdcFr)) expect(DICTS[l][k as keyof typeof tdcFr], `${l}:${k}`).toBeTruthy();
  });
  it('titres de quartier traduits', () => {
    for (const l of ['en', 'de', 'nl'] as Lang[]) for (const fr of Object.values(TDC_TITLES_FR)) expect(translateServerText(l, fr)).not.toBe(fr);
  });
});

describe('relecture 0.53', () => {
  it('un quartier terminé ailleurs reçoit son titre à la partie suivante, même dans un autre quartier', async () => {
    const { applyTdc, TDC_QUARTERS, TDC_BISTROS } = await import('../shared/progress/comptoirs');
    const { newProfile } = await import('../shared/progress/profile');
    const marche = TDC_BISTROS.filter((b) => b.quarter === 'marche');
    const autre = TDC_BISTROS.find((b) => b.quarter !== 'marche')!;
    const p = { ...newProfile(), tdc: Object.fromEntries(marche.map((b) => [b.id, 1])) };
    const facts = { won: false, place: 2, rounds: 40, count421: 0, c111: 0, brelan: 0, elapsedMs: 10 * 60_000 };
    const { profile } = applyTdc(p, autre.id, facts);
    const titre = TDC_QUARTERS.find((q) => q.id === 'marche')!.title!;
    expect(profile.titles ?? []).toContain(titre);
  });
});
