/**
 * La Route des Auberges (campagne solo du Courtisan) : règle maison « seuil d'ouverture » du moteur,
 * déblocages, étoiles calculées sur les faits du rejeu, pas de double récompense, reprise d'invité
 * plafonnée, serveur (table imposée, étoiles après rejeu seulement, Groschen de chapitre une seule fois),
 * chaque étape jouable jusqu'au bout par des ordinateurs, textes en/de/nl complets.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { act, canBank, newGame, type DmAction, type DmLevel, type DmState } from '../shared/dixmille/engine';
import { decide } from '../shared/dixmille/ai';
import { encodeDm, newGameDm, replayDm, setupDmFrom } from '../shared/rejeu/dixmille';
import {
  CAMPAIGN, CDM_CHAPTERS, CDM_CHAPTER_GROSCHEN, CDM_MAX_STARS, CDM_STAGES, CDM_STAR_COINS, applyCdm, campaignSummary, capCdmImport, cdmSetup, cdmStarsOf,
  chapterUnlocked, cleanCdm, stageUnlocked, stagesOf, type CdmFacts,
} from '../shared/campaigns/dm';
import { capGuestImport, newProfile, sanitizeProfile, titleLabel } from '../shared/progress/profile';
import { DICTS, type Lang } from '../shared/i18n';
import { cdmFr } from '../shared/i18n/zones/campdm.fr';
import { translateServerText } from '../shared/i18n/server-texts';
import { CDM_ERRORS } from '../server/camp-dm';
import { playDm } from './rejeu-helpers';

const facts = (o: Partial<CdmFacts> = {}): CdmFacts => ({ won: true, place: 1, bestTurn: 600, misses: 3, hotMax: 0, turns: 9, oppBest: 1500, ...o });
const all = (mask: number) => Object.fromEntries(CDM_STAGES.map((s) => [s.id, mask]));

describe('moteur : seuil d’ouverture', () => {
  it('pas d’encaissement sous le seuil tant que le compteur est à zéro ; l’IA ne bloque jamais', () => {
    let s: DmState = newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', bot: 'habitue' }], 4000, 5, { entry: 500 });
    expect(s.entry).toBe(500);
    expect(canBank(s, 450)).toBe(false);
    expect(canBank(s, 500)).toBe(true);
    // Cherche un premier lancer qui rapporte moins de 500 : encaisser est refusé, relancer permis.
    for (let seed = 1; seed < 400; seed++) {
      s = newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 4000, seed, { entry: 500 });
      const r = act(s, { type: 'lancer' });
      if ('error' in r || r.state.phase !== 'choisir') continue;
      const st = r.state;
      const one = st.dice.findIndex((v) => v === 1 || v === 5);
      if (one < 0) continue;
      expect('error' in act(st, { type: 'encaisser', pick: [one] })).toBe(true);
      expect('error' in act(st, { type: 'relancer', pick: [one] })).toBe(false);
      break;
    }
    // Seuil inconnu ignoré ; parties d'ordinateurs avec seuil : toujours finies, scores ouverts au seuil.
    expect(newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 2000, 1, { entry: 42 }).entry).toBeUndefined();
    for (let seed = 1; seed <= 150; seed++) {
      let g = newGame([{ id: 'a', name: 'A', bot: 'debutant' }, { id: 'b', name: 'B', bot: 'fouine' }, { id: 'c', name: 'C', bot: 'habitue' }], 4000, seed, { entry: [300, 500, 1000][seed % 3] });
      const firstBank: Record<string, number> = {};
      for (let i = 0; g.phase !== 'fini'; i++) {
        expect(i).toBeLessThan(20_000);
        const r = act(g, decide(g, g.players[g.current].bot!));
        if ('error' in r) throw new Error(r.error);
        for (const e of r.state.events) if (e.kind === 'encaisse' && firstBank[e.playerId] === undefined) firstBank[e.playerId] = e.points;
        g = r.state;
      }
      for (const v of Object.values(firstBank)) expect(v).toBeGreaterThanOrEqual(g.entry!);
    }
  });

  it('table du rejeu : niveaux par ordinateur et seuil vérifiés', () => {
    expect(setupDmFrom({ level: 'fouine', target: 4000, bots: ['a', 'b'], levels: ['fouine', 'habitue'], entry: 500 })).toEqual({ level: 'fouine', target: 4000, bots: ['a', 'b'], levels: ['fouine', 'habitue'], entry: 500 });
    expect(setupDmFrom({ level: 'fouine', target: 4000, bots: ['a', 'b'], levels: ['fouine'] })).toBeNull();
    expect(setupDmFrom({ level: 'fouine', target: 4000, bots: ['a'], levels: ['roi'] })).toBeNull();
    expect(setupDmFrom({ level: 'fouine', target: 4000, bots: ['a'], entry: 450 })).toBeNull();
    for (const st of CDM_STAGES) expect(setupDmFrom(JSON.parse(JSON.stringify(cdmSetup(st))))).toEqual(cdmSetup(st));
  });
});

describe('campagne : règles', () => {
  it('12 étapes en 4 chapitres, personnages connus, interface commune', () => {
    expect(CDM_STAGES).toHaveLength(12);
    expect(CDM_CHAPTERS.map((c) => stagesOf(c.id).length)).toEqual([3, 3, 3, 3]);
    expect(CAMPAIGN).toEqual({ id: 'dm', game: 'dm', nameKey: 'cdm.title', maxStars: 36 });
    for (const st of CDM_STAGES) expect(st.opponents[0].folk).toBe(st.host);
    const sum = campaignSummary(newProfile());
    expect(sum).toEqual({ stars: 0, maxStars: CDM_MAX_STARS, next: { id: 'moulin', nameKey: 'cdm.s.moulin' }, done: false });
    expect(campaignSummary({ ...newProfile(), campDm: all(7) })).toEqual({ stars: 36, maxStars: 36, next: null, done: true });
  });

  it('déblocages : étape précédente gagnée, chapitre précédent fini et étoiles suffisantes', () => {
    expect(stageUnlocked(undefined, 'moulin')).toBe(true);
    expect(stageUnlocked(undefined, 'gue')).toBe(false);
    expect(stageUnlocked({ moulin: 1 }, 'gue')).toBe(true);
    const ch1 = { moulin: 1, gue: 1, relais: 1 }; // 3 étoiles, il en faut 4
    expect(chapterUnlocked(ch1, 'coteaux')).toBe(false);
    expect(chapterUnlocked({ ...ch1, relais: 3 }, 'coteaux')).toBe(true);
    expect(stageUnlocked({ moulin: 7, gue: 7 }, 'pressoir')).toBe(false); // chapitre 1 pas fini
    expect(stageUnlocked({ moulin: 1, gue: 1, relais: 3, pressoir: 1 }, 'abbaye')).toBe(true);
    expect(stageUnlocked(all(1), 'banquet')).toBe(false); // 12 étoiles < 17
    expect(stageUnlocked({ ...all(1), moulin: 7, gue: 7, relais: 7 }, 'lion')).toBe(true);
  });

  it('étoiles : rien sans victoire, conditions sur les faits du rejeu', () => {
    const st = CDM_STAGES.find((s) => s.id === 'moulin')!; // tour ≥ 1 000, sans raté
    expect(cdmStarsOf(st, facts({ won: false, place: 2, bestTurn: 3000, misses: 0 }))).toBe(0);
    expect(cdmStarsOf(st, facts())).toBe(1);
    expect(cdmStarsOf(st, facts({ bestTurn: 1000 }))).toBe(3);
    expect(cdmStarsOf(st, facts({ bestTurn: 1000, misses: 0 }))).toBe(7);
    const gue = CDM_STAGES.find((s) => s.id === 'gue')!; // 6 tours au plus, main pleine
    expect(cdmStarsOf(gue, facts({ turns: 6, hotMax: 1 }))).toBe(7);
    const rel = CDM_STAGES.find((s) => s.id === 'relais')!; // aucun adversaire à 1 000
    expect(cdmStarsOf(rel, facts({ oppBest: 999 }))).toBe(3);
    expect(cdmStarsOf(rel, facts({ oppBest: 1000 }))).toBe(1);
  });

  it('pas de double récompense ; 5 pièces par nouvelle étoile ; titre de chapitre une fois', () => {
    let p = newProfile();
    const c0 = p.coins;
    let r = applyCdm(p, 'moulin', facts({ bestTurn: 1200 }));
    expect(r.result.newStars).toEqual([1, 2]);
    expect(r.profile.coins - c0).toBe(2 * CDM_STAR_COINS);
    p = r.profile;
    r = applyCdm(p, 'moulin', facts({ bestTurn: 1200 }));
    expect(r.result.newStars).toEqual([]);
    expect(r.profile.coins).toBe(p.coins);
    r = applyCdm(p, 'moulin', facts({ misses: 0 }));
    expect(r.result.newStars).toEqual([3]);
    p = applyCdm(r.profile, 'gue', facts()).profile;
    const done = applyCdm(p, 'relais', facts());
    expect(done.result.chapter).toBe('val');
    expect(done.profile.titles).toContain('cdm:val');
    expect(titleLabel('cdm:val')).toBe('Pèlerin des auberges');
    expect(applyCdm(done.profile, 'relais', facts()).result.title).toBeUndefined();
    // Le profil nettoyé garde progression et titre ; un titre inventé est retiré.
    const clean = sanitizeProfile(JSON.parse(JSON.stringify({ ...done.profile, title: 'cdm:val', titles: [...done.profile.titles!, 'cdm:pirate'] })));
    expect(clean.campDm).toEqual(done.profile.campDm);
    expect(clean.titles).toContain('cdm:val');
    expect(clean.titles).not.toContain('cdm:pirate');
    expect(clean.title).toBe('cdm:val');
    expect(cleanCdm({ moulin: 6, gue: 9, x: 7, relais: 5 })).toEqual({ relais: 5 });
  });

  it('reprise d’un invité : seulement le premier chapitre, sans titre', () => {
    expect(capCdmImport(all(7))).toEqual({ moulin: 7, gue: 7, relais: 7 });
    const guest = { ...newProfile(), campDm: all(7), titles: ['cdm:val', 'cdm:cite'] };
    const cap = capGuestImport(guest);
    expect(cap.campDm).toEqual({ moulin: 7, gue: 7, relais: 7 });
    expect(cap.titles ?? []).not.toContain('cdm:cite');
  });
});

describe('campagne : simulation (chaque étape jouée jusqu’au bout)', () => {
  it('toutes les étapes finissent, le rejeu suit, la difficulté monte', () => {
    const G = 150;
    const rate: number[] = [];
    for (const st of CDM_STAGES) {
      const setup = cdmSetup(st);
      let w = 0;
      for (let g = 0; g < G; g++) {
        const seed = (g * 7919 + 17) >>> 0;
        let s = newGameDm(setup, seed);
        const moves: string[] = [];
        for (let i = 0; s.phase !== 'fini'; i++) {
          expect(i).toBeLessThan(20_000);
          const mine = s.players[s.current].id === 'moi';
          const a: DmAction = decide(s, mine ? 'habitue' : s.players[s.current].bot as DmLevel);
          const r = act(s, a);
          if ('error' in r) throw new Error(r.error);
          if (mine) moves.push(encodeDm(a));
          s = r.state;
        }
        const rp = replayDm(setup, seed, moves.join('.'));
        expect(rp.ok).toBe(true);
        if (rp.ok && rp.facts.won) w++;
      }
      rate.push(w / G);
    }
    // Joueur moyen (niveau Habitué) : environ 60 % au premier lieu, environ 15-25 % au dernier.
    expect(rate[0]).toBeGreaterThan(0.45);
    expect(rate[11]).toBeLessThan(0.3);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    for (let c = 1; c < 4; c++) expect(avg(rate.slice(c * 3, c * 3 + 3))).toBeLessThan(avg(rate.slice((c - 1) * 3, c * 3)));
  });
});

describe('campagne : serveur', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, soloDailyCap: 1000, authAttempts: 100000 } });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  const call = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { status: r.status, ...(await r.json()) } as any;
  };
  let n = 0;
  const account = async (guestProfile?: object) => (await call('/register', { username: `Auberge${++n}`, password: 'motdepasse1', ...(guestProfile ? { guestProfile } : {}) })).token as string;
  /** Vraie partie d'une étape (rejouée par le serveur) jusqu'à une victoire (ou une défaite). */
  const real = async (t: string, stage: string, want: 'win' | 'lose' = 'win') => {
    const st = CDM_STAGES.find((s) => s.id === stage)!;
    for (let i = 0; i < 80; i++) {
      const s = await call('/dixmille/start', { setup: cdmSetup(st), camp: stage }, t);
      expect(s.seed).toBeTypeOf('number');
      const g = playDm(s.setup, s.seed, 'fouine');
      if ((g.state.winner === 'moi') !== (want === 'win')) continue; // partie abandonnée (jamais terminée auprès du serveur)
      return call('/dixmille/end', { gameToken: s.gameToken, moves: g.moves, won: want !== 'win' }, t);
    }
    throw new Error('pas de partie du résultat voulu');
  };

  it('table imposée : étape fermée ou table différente refusées', async () => {
    const t = await account();
    const gue = CDM_STAGES[1];
    const locked = await call('/dixmille/start', { setup: cdmSetup(gue), camp: gue.id }, t);
    expect(locked.status).toBe(400);
    expect(locked.error).toBe(CDM_ERRORS.locked);
    const moulin = CDM_STAGES[0];
    const other = await call('/dixmille/start', { setup: { ...cdmSetup(moulin), level: 'fouine', levels: ['fouine'] }, camp: moulin.id }, t);
    expect(other.status).toBe(400);
    expect(other.error).toBe(CDM_ERRORS.table);
    expect((await call('/dixmille/start', { camp: moulin.id }, t)).status).toBe(400); // ancien téléphone : pas de table, pas de campagne
    expect((await call('/dixmille/start', { camp: 'atlantide' }, t)).status).toBe(400);
    for (const l of ['en', 'de', 'nl'] as Lang[]) for (const m of Object.values(CDM_ERRORS)) expect(translateServerText(l, m)).not.toBe(m);
  });

  it('étoiles après rejeu seulement, une seule fois ; défaite ou décisions trafiquées : rien', async () => {
    const t = await account();
    const moulin = CDM_STAGES[0];
    const lost = await real(t, 'moulin', 'lose');
    expect(lost.verified).toBe(true);
    expect(lost.camp.newStars).toEqual([]);
    const s = await call('/dixmille/start', { setup: cdmSetup(moulin), camp: 'moulin' }, t);
    const bad = await call('/dixmille/end', { gameToken: s.gameToken, moves: 'E0', won: true, place: 1 }, t);
    expect(bad.verified).toBe(false);
    expect(bad.camp).toBeUndefined();
    expect((await call('/me', undefined, t)).profile.campDm).toBeUndefined();
    const w = await real(t, 'moulin');
    expect(w.verified).toBe(true);
    expect(w.camp.newStars).toContain(1);
    expect(w.camp.coins).toBe(w.camp.newStars.length * CDM_STAR_COINS);
    const me = (await call('/me', undefined, t)).profile;
    expect(me.campDm.moulin & 1).toBe(1);
    expect(me.dm.vGames).toBe(2); // défaite + victoire rejouées : parties du Courtisan contre l'ordinateur // compte comme une partie du Courtisan contre l'ordinateur
    const again = await real(t, 'moulin');
    expect(again.camp.newStars.filter((x: number) => w.camp.newStars.includes(x))).toEqual([]);
  });

  it('chapitre terminé : titre et Groschen une seule fois ; invité repris au premier chapitre', async () => {
    const t = await account();
    for (const id of ['moulin', 'gue']) expect((await real(t, id)).camp.after & 1).toBe(1);
    const last = await real(t, 'relais');
    expect(last.camp.chapter).toBe('val');
    expect(last.camp.title).toBe('cdm:val');
    expect(last.camp.groschen).toBe(CDM_CHAPTER_GROSCHEN);
    expect((await call('/dixmille/wallet?peek=1', undefined, t)).balance).toBe(CDM_CHAPTER_GROSCHEN);
    const again = await real(t, 'relais');
    expect(again.camp.groschen).toBeUndefined();
    expect(again.camp.title).toBeUndefined();
    expect((await call('/dixmille/wallet?peek=1', undefined, t)).balance).toBe(CDM_CHAPTER_GROSCHEN);
    // Invité qui s'inscrit avec toute la route faite : seul le premier chapitre est repris.
    const g = await account({ ...newProfile(), campDm: all(7) });
    const p = (await call('/me', undefined, g)).profile;
    expect(p.campDm).toEqual({ moulin: 7, gue: 7, relais: 7 });
    expect((await call('/dixmille/start', { setup: cdmSetup(CDM_STAGES[9]), camp: CDM_STAGES[9].id }, g)).status).toBe(400);
    expect((await call('/dixmille/start', { setup: cdmSetup(CDM_STAGES[3]), camp: CDM_STAGES[3].id }, g)).seed).toBeTypeOf('number');
  });
});

describe('campagne : textes', () => {
  it('clés en/de/nl complètes, titres traduits', () => {
    for (const l of ['en', 'de', 'nl'] as Lang[]) for (const key of Object.keys(cdmFr)) expect(DICTS[l][key as keyof typeof cdmFr], `${l}:${key}`).toBeTruthy();
    for (const st of CDM_STAGES) for (const key of [`cdm.s.${st.id}`, `cdm.s.${st.id}.d`]) expect(cdmFr[key as keyof typeof cdmFr], key).toBeTruthy();
    for (const st of CDM_STAGES) for (const o of st.opponents) for (const s of ['name', 'good', 'bad']) expect(cdmFr[`cdm.p.${o.folk}.${s}` as keyof typeof cdmFr]).toBeTruthy();
    for (const c of CDM_CHAPTERS) {
      const fr = titleLabel(c.title)!;
      expect(fr).toBeTruthy();
      for (const l of ['en', 'de', 'nl'] as Lang[]) expect(translateServerText(l, fr)).not.toBe(fr);
    }
  });
});
