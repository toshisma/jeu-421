/** Campagnes solo sur l'accueil : registre (4 campagnes, interface commune), résumé de la Tournée, traductions `chm.`. */
import { describe, expect, it } from 'vitest';
import {
  ALL_CAMPAIGNS, CAMPAIGN_GAMES, campaignOfGame, campaignReady, campaignScreen, homeCampaign, readyCampaigns, summarize,
} from '../shared/campaigns';
import * as r421 from '../shared/campaigns/r421';
import { TDC_BISTROS, TDC_MAX_STARS, type TdcProgress } from '../shared/progress/comptoirs';
import { newProfile, type Profile } from '../shared/progress/profile';
import { DICTS, type Lang } from '../shared/i18n';
import { chmFr } from '../shared/i18n/zones/camphome.fr';
import { gameOfScreen } from '../client/src/campaigns/lastGame';

const withTdc = (tdc: TdcProgress): Profile => ({ ...newProfile(), tdc });
const all = (mask: number): TdcProgress => Object.fromEntries(TDC_BISTROS.map((b) => [b.id, mask]));

describe('registre des campagnes', () => {
  it('4 campagnes, une par jeu, interface respectée', () => {
    expect(ALL_CAMPAIGNS).toHaveLength(4);
    expect(ALL_CAMPAIGNS.map((c) => c.game).sort()).toEqual([...CAMPAIGN_GAMES].sort());
    expect(new Set(ALL_CAMPAIGNS.map((c) => c.id)).size).toBe(4);
    for (const c of ALL_CAMPAIGNS) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.nameKey).toBe('string');
      expect(c.nameKey in DICTS.fr, `${c.id} : clé ${c.nameKey}`).toBe(true);
      expect(Number.isInteger(c.maxStars) && c.maxStars >= 0).toBe(true);
      for (const p of [newProfile(), withTdc(all(7))]) {
        const s = c.summary(p);
        expect(Object.keys(s).sort()).toEqual(['done', 'maxStars', 'next', 'stars']);
        expect(s.maxStars).toBe(c.maxStars);
        expect(s.stars).toBeGreaterThanOrEqual(0);
        expect(s.stars).toBeLessThanOrEqual(s.maxStars);
        if (s.next) { expect(typeof s.next.id).toBe('string'); expect(s.next.nameKey in DICTS.fr, s.next.nameKey).toBe(true); }
      }
    }
  });
  it('écrans d\'entrée : la Tournée garde « tdc », les autres « camp-<id> »', () => {
    expect(campaignScreen('r421')).toBe('tdc');
    expect(campaignScreen('dm')).toBe('camp-dm');
    expect(campaignScreen('pm')).toBe('camp-pm');
    expect(campaignScreen('cf')).toBe('camp-cf');
  });
  it('une campagne « bientôt » (maxStars 0) est masquée ; la Tournée est toujours là', () => {
    expect(readyCampaigns().every(campaignReady)).toBe(true);
    expect(readyCampaigns()[0].id).toBe('r421');
    for (const c of ALL_CAMPAIGNS) expect(campaignOfGame(c.game)?.id ?? null).toBe(campaignReady(c) ? c.id : null);
    // Accueil : la campagne du dernier jeu si elle existe, sinon la Tournée.
    expect(homeCampaign(null).id).toBe('r421');
    expect(homeCampaign('421').id).toBe('r421');
    for (const g of ['dm', 'pm', 'cf'] as const) expect(homeCampaign(g).id).toBe(campaignOfGame(g)?.id ?? 'r421');
  });
  it('résumé borné même si un fichier de campagne se trompe', () => {
    const bad = { ...ALL_CAMPAIGNS[0], summary: () => ({ stars: 99, maxStars: 36, next: null, done: false }) };
    expect(summarize(bad, newProfile()).stars).toBe(36);
    const boom = { ...ALL_CAMPAIGNS[0], summary: () => { throw new Error('x'); } };
    expect(summarize(boom, newProfile())).toEqual({ stars: 0, maxStars: 36, next: null, done: false });
  });
  it('dernier jeu ouvert : écran → jeu', () => {
    expect(gameOfScreen('cf', false)).toBe('cf');
    expect(gameOfScreen('dixmille', false)).toBe('dm');
    expect(gameOfScreen('poker', false)).toBe('pm');
    expect(gameOfScreen('camp-pm', false)).toBe('pm');
    expect(gameOfScreen('tdc', true)).toBe('421');
    expect(gameOfScreen('home', false)).toBeNull();
    expect(gameOfScreen('campaigns', false)).toBeNull();
  });
});

describe('résumé de la Tournée des comptoirs', () => {
  it('nouveau joueur : 0 étoile, première étape = Le Petit Zinc', () => {
    expect(r421.CAMPAIGN).toEqual({ id: 'r421', game: '421', nameKey: 'tdc.title', maxStars: TDC_MAX_STARS });
    expect(r421.campaignSummary(newProfile())).toEqual({ stars: 0, maxStars: 36, next: { id: 'petit-zinc', nameKey: 'tdc.b.petit-zinc' }, done: false });
  });
  it('en cours : étoiles = réputation, étape = premier bistrot ouvert pas encore gagné', () => {
    expect(r421.campaignSummary(withTdc({ 'petit-zinc': 7 }))).toMatchObject({ stars: 3, next: { id: 'cafe-sports' }, done: false });
    // Marché terminé, 6 étoiles : le Port est ouvert (3 ★ nécessaires).
    expect(r421.campaignSummary(withTdc({ 'petit-zinc': 7, 'cafe-sports': 3, 'chope-or': 1 }))).toMatchObject({ stars: 6, next: { id: 'phare' } });
  });
  it('quartier suivant fermé faute de réputation : étape = bistrot où il manque des étoiles', () => {
    // Marché et Port gagnés avec 1 étoile chacun : 6 ★ < 8 (la Gare reste fermée).
    const p = withTdc({ 'petit-zinc': 1, 'cafe-sports': 1, 'chope-or': 1, phare: 1, ancre: 1, mimile: 1 });
    expect(r421.campaignSummary(p)).toMatchObject({ stars: 6, next: { id: 'petit-zinc' }, done: false });
  });
  it('tous les bistrots gagnés : terminée, il reste des étoiles ; tout à 3 ★ : plus d\'étape', () => {
    expect(r421.campaignSummary(withTdc(all(1)))).toMatchObject({ stars: 12, next: { id: 'petit-zinc' }, done: true });
    expect(r421.campaignSummary(withTdc(all(7)))).toEqual({ stars: 36, maxStars: 36, next: null, done: true });
  });
});

describe('traductions de la zone chm', () => {
  it('clés en / de / nl complètes, mêmes variables', () => {
    for (const l of ['en', 'de', 'nl'] as Lang[]) {
      for (const [k, fr] of Object.entries(chmFr)) {
        const v = DICTS[l][k as keyof typeof chmFr];
        expect(v, `${l}:${k}`).toBeTruthy();
        const vars = (t: string) => (t.match(/\{\w+\}/g) ?? []).sort().join();
        expect(vars(v!), `${l}:${k}`).toBe(vars(fr));
      }
    }
  });
});
