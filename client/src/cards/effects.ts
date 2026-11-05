/**
 * Coups Fourrés : ce qui est « en jeu » pour un joueur pendant la manche, écrit en clair sous son nom
 * (0.39, « les informations se perdent ») : bonus et malus en attente que rien d'autre ne montre.
 */
import type { CfPlayerView, CfView } from '../../../shared/cards/engine';
import type { CardType } from '../../../shared/cards/catalog';

export interface ActiveEffect {
  /** Texte court (« ×2 s’il gagne »). */
  text: string;
  /** Carte d'où vient l'effet (pour ouvrir sa fiche). */
  card: string;
  type: CardType;
  /** good = à l'avantage de ce joueur, bad = à son désavantage. */
  tone: 'good' | 'bad';
}

/** Effets en attente pour ce joueur cette manche (vue publique : tout le monde les voit). */
export function activeEffects(v: CfView, p: CfPlayerView, me: boolean): ActiveEffect[] {
  const r = p.r;
  const out: ActiveEffect[] = [];
  const s = (a: string, b: string) => (me ? a : b);
  if (r.doubles > 0) out.push({ text: s('Combinaison ×2 si vous gagnez', 'Combinaison ×2 s’il gagne'), card: 'double-tournee', type: 'coup', tone: 'good' });
  if (r.noteSalee > 0) out.push({ text: s(`+${2 * r.noteSalee} jetons donnés si vous gagnez`, `+${2 * r.noteSalee} jetons donnés s’il gagne`), card: 'note-salee', type: 'dernier-mot', tone: 'good' });
  if (r.pari > 0) out.push({ text: `Pari : ±${2 * r.pari} jetons`, card: 'pari-comptoir', type: 'coup', tone: 'good' });
  if (r.bonusThrows > 0) out.push({ text: `+${r.bonusThrows} lancer${r.bonusThrows > 1 ? 's' : ''}`, card: 'cul-sec', type: 'coup', tone: 'good' });
  if (r.discount > 0) out.push({ text: s(`Prochaine carte −${r.discount}`, `Sa prochaine carte −${r.discount}`), card: 'mise-bouche', type: 'coup', tone: 'good' });
  if (r.throwPenalty > 0) out.push({ text: `Un seul lancer`, card: 'gueule-bois', type: 'piege', tone: 'bad' });
  if (r.faux421) out.push({ text: '4-2-1 ne vaut que 2', card: 'faux-421', type: 'piege', tone: 'bad' });
  if (r.forcedNenette) out.push({ text: 'Combinaison changée en nénette', card: 'coup-nenette', type: 'piege', tone: 'bad' });
  if (p.penaltyNext > 0 && v.phase !== 'turn') out.push({ text: 'Un seul lancer à la prochaine manche', card: 'gueule-bois', type: 'piege', tone: 'bad' });
  return out;
}

/**
 * Ce que fait chaque carte, en quelques mots (écrit sous son nom dans la main). Le texte complet reste
 * sur la carte en grand. Une carte absente d'ici affiche le passage en gras de son texte.
 */
export const CARD_GIST: Record<string, string> = {
  patron: '+1 Tournée et 1 carte par manche',
  josiane: '1 dé relancé gratis par manche',
  'vieux-marcel': 'Suites à 4 · piochez 1 carte',
  pilier: '1 jeton de moins si vous perdez',
  videur: 'Annule le 1er piège adverse',
  'tournee-patron': '+2 Tournées',
  'ticket-caisse': 'Annule un petit Coup (2 ou moins)',
  fermeture: 'Chasse un Habitué adverse',
  'note-salee': '+2 jetons donnés si vous gagnez',
  'cul-sec': '+1 lancer ce tour',
  'tete-tourne': 'Retourne un dé (1↔6, 2↔5, 3↔4)',
  'pari-comptoir': 'Pari : 2 jetons de plus',
  'double-tournee': 'Combinaison ×2 si vous gagnez',
  'de-sous-table': 'Relance un dé de l’adversaire',
  'yeux-piquent': 'Annule un Coup sur les dés',
  'gueule-bois': 'Le gagnant n’aura qu’un lancer',
  'tournee-generale': 'Tout le monde relance tout',
  leurre: 'Faux piège : piochez 1 carte',
  'croche-patte': 'Relance un de ses dés gardés',
  'main-sac': 'Copie ses pioches et Tournées',
  fouine: 'Regardez un piège adverse',
  'ardoise-piegee': 'Ses Coups coûtent 2 de plus',
  'faux-421': 'Son 4-2-1 ne vaut que 2',
  'coup-nenette': 'Sa victoire à 1 devient nénette',
  'retournement-veste': 'Renvoie un gros don (5 et plus)',
  'coup-coude': 'Piochez 1 carte',
  'mise-bouche': 'Prochaine carte 2 de moins',
  'coup-pouce': '+1 ou −1 sur un de vos dés',
  'calcul-mental': 'Choisissez 1 carte parmi 3',
  recompter: '+1 ou −1 sur un dé, à la fin',
  domino: 'L’adversaire perd 2 Tournées',
  'reaction-chaine': 'Annule une carte adverse',
  'bon-numero': 'Un dé sur la face voulue',
  'grand-enchainement': 'Rejouez votre dernier Coup',
};
