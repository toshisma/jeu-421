/**
 * Campagne du 421 = la Tournée des comptoirs (shared/progress/comptoirs.ts), vue par le registre des campagnes
 * (shared/campaigns/index.ts) : même interface que les campagnes des autres jeux.
 * Étape suivante : le premier bistrot ouvert pas encore gagné ; s'il n'y en a pas (quartier suivant fermé faute
 * de réputation, ou Tournée finie), le premier bistrot ouvert où il manque des étoiles.
 */
import { TDC_BISTROS, TDC_MAX_STARS, bistroUnlocked, reputation, starCount } from '../progress/comptoirs';
import type { Profile } from '../progress/profile';

export const CAMPAIGN = { id: 'r421', game: '421' as const, nameKey: 'tdc.title', maxStars: TDC_MAX_STARS };

export function campaignSummary(profile: Profile): { stars: number; maxStars: number; next: { id: string; nameKey: string } | null; done: boolean } {
  const p = profile.tdc ?? {};
  const stars = Math.min(TDC_MAX_STARS, reputation(p));
  const open = TDC_BISTROS.filter((b) => bistroUnlocked(p, b.id));
  const done = TDC_BISTROS.every((b) => ((p[b.id] ?? 0) & 1) === 1);
  const pick = open.find((b) => ((p[b.id] ?? 0) & 1) === 0) ?? open.find((b) => starCount(p[b.id] ?? 0) < 3);
  return { stars, maxStars: TDC_MAX_STARS, next: pick ? { id: pick.id, nameKey: `tdc.b.${pick.id}` } : null, done };
}
