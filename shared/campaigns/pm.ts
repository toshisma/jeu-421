// PROVISOIRE : remplacé par la vraie campagne à la fusion (campagne solo de « Poker menteur », écrite dans un autre chantier).
// maxStars = 0 : l'accueil et l'écran « Campagnes » la tiennent pour « bientôt » et la masquent.
import type { Profile } from '../progress/profile';

export const CAMPAIGN = { id: 'pm', game: 'pm' as const, nameKey: 'chm.soon', maxStars: 0 };

export function campaignSummary(_profile: Profile): { stars: number; maxStars: number; next: { id: string; nameKey: string } | null; done: boolean } {
  return { stars: 0, maxStars: 0, next: null, done: false };
}
