// PROVISOIRE : remplacé par la vraie campagne à la fusion (campagne solo de « Le Courtisan », écrite dans un autre chantier).
// maxStars = 0 : l'accueil et l'écran « Campagnes » la tiennent pour « bientôt » et la masquent.
import type { Profile } from '../progress/profile';

export const CAMPAIGN = { id: 'dm', game: 'dm' as const, nameKey: 'chm.soon', maxStars: 0 };

export function campaignSummary(_profile: Profile): { stars: number; maxStars: number; next: { id: string; nameKey: string } | null; done: boolean } {
  return { stars: 0, maxStars: 0, next: null, done: false };
}
