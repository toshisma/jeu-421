/**
 * Registre des campagnes solo (une par jeu) : ce que l'accueil, les cartes de jeu et l'écran « Campagnes »
 * affichent. Chaque campagne vit dans son fichier `shared/campaigns/<mode>.ts`, avec la même interface :
 *    export const CAMPAIGN = { id, game: '421' | 'dm' | 'pm' | 'cf', nameKey, maxStars };
 *    export function campaignSummary(profile): { stars, maxStars, next: { id, nameKey } | null, done };
 * et son écran d'entrée `{ name: 'camp-<id>' }` dans App.tsx (la Tournée des comptoirs, plus ancienne, garde
 * son écran `tdc`). Une campagne dont `maxStars` vaut 0 n'existe pas encore (« bientôt ») : elle est masquée.
 * Ordre : celui des cartes de jeu de l'accueil (421, Coups Fourrés, Courtisan, Poker menteur).
 */
import type { Profile } from '../progress/profile';
import * as r421 from './r421';
import * as cf from './cf';
import * as dm from './dm';
import * as pm from './pm';

export type CampaignGame = '421' | 'dm' | 'pm' | 'cf';
export const CAMPAIGN_GAMES: readonly CampaignGame[] = ['421', 'cf', 'dm', 'pm'];

export interface CampaignDef { id: string; game: CampaignGame; nameKey: string; maxStars: number }
export interface CampaignSummary { stars: number; maxStars: number; next: { id: string; nameKey: string } | null; done: boolean }
export interface Campaign extends CampaignDef { summary: (p: Profile) => CampaignSummary }

/** Ce que chaque fichier de campagne exporte (types larges : un fichier sans `as const` passe aussi). */
interface CampaignModule {
  CAMPAIGN: { id: string; game: string; nameKey: string; maxStars: number };
  campaignSummary: (p: Profile) => CampaignSummary;
}
const entry = (m: CampaignModule): Campaign => ({ ...m.CAMPAIGN, game: m.CAMPAIGN.game as CampaignGame, summary: m.campaignSummary });

/** Toutes les campagnes, prêtes ou non, dans l'ordre des jeux de l'accueil. */
export const ALL_CAMPAIGNS: Campaign[] = [entry(r421), entry(cf), entry(dm), entry(pm)];

/** Campagne jouable (pas « bientôt »). */
export const campaignReady = (c: CampaignDef) => c.maxStars > 0;
/** Campagnes jouables, dans l'ordre de l'accueil. */
export const readyCampaigns = (): Campaign[] => ALL_CAMPAIGNS.filter(campaignReady);
/** Campagne d'un jeu (jouable seulement). */
export const campaignOfGame = (g: CampaignGame | null | undefined): Campaign | undefined => readyCampaigns().find((c) => c.game === g);
export const isCampaignGame = (v: unknown): v is CampaignGame => typeof v === 'string' && (CAMPAIGN_GAMES as readonly string[]).includes(v);

/** Nom de l'écran d'entrée d'une campagne (App.tsx). */
export const campaignScreen = (id: string): string => (id === r421.CAMPAIGN.id ? 'tdc' : `camp-${id}`);

/** Résumé borné (un fichier de campagne fautif ne casse pas l'accueil). */
export function summarize(c: Campaign, p: Profile): CampaignSummary {
  let s: CampaignSummary;
  try { s = c.summary(p); } catch { s = { stars: 0, maxStars: c.maxStars, next: null, done: false }; }
  const maxStars = Math.max(0, Math.floor(s.maxStars || c.maxStars));
  return { stars: Math.max(0, Math.min(maxStars, Math.floor(s.stars || 0))), maxStars, next: s.next ?? null, done: !!s.done };
}

/**
 * Campagne à montrer sur l'accueil : celle du dernier jeu joué si elle existe, sinon la Tournée.
 * (La Tournée est toujours prête : c'est la première du registre.)
 */
export function homeCampaign(last: CampaignGame | null | undefined): Campaign {
  return campaignOfGame(last) ?? readyCampaigns()[0] ?? ALL_CAMPAIGNS[0];
}
