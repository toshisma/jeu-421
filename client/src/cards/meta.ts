/**
 * Coups Fourrés : réglages visuels des cartes (couleurs des familles, raretés, mots mis en gras).
 * Aucune règle de jeu ici : les textes et les chiffres viennent de shared/cards/catalog.ts.
 */
import type { CardFamily, CardRarity } from '../../../shared/cards/catalog';

/** Couleurs de chaque famille (dégradé du cadre, liseré, encre des mots en gras). */
export const FAMILY_STYLE: Record<CardFamily, { c1: string; c2: string; edge: string; ink: string; cls: string }> = {
  habitues: { c1: '#2f7a55', c2: '#0f3523', edge: '#b9a56a', ink: '#0f3523', cls: 'cf-hab' },
  ivresse: { c1: '#a3263a', c2: '#4a0d18', edge: '#d9a07a', ink: '#4a0d18', cls: 'cf-ivr' },
  pieges: { c1: '#5a3b85', c2: '#1c1030', edge: '#a99ad0', ink: '#1c1030', cls: 'cf-pie' },
  chaines: { c1: '#2c54c2', c2: '#0f2160', edge: '#e3c060', ink: '#0f2160', cls: 'cf-cha' },
};

/** Couleur de la gemme de rareté. */
export const RARITY_COLOR: Record<CardRarity, string> = {
  commune: '#e8e2d4',
  rare: '#5aa9ff',
  epique: '#c07bff',
  legendaire: '#ffb347',
};

/** Papier crème du texte de règle (haut et bas du dégradé) et ses encres. */
export const PAPER = { top: '#fbf3df', bottom: '#efe2c4', text: '#2a1d12', flavor: '#6c543a' };

/** Nom de famille court (sans article), pour les petites étiquettes. */
export const FAMILY_SHORT: Record<CardFamily, string> = { habitues: 'Habitués', ivresse: 'Ivresse', pieges: 'Pièges', chaines: 'Chaînes' };

/**
 * Le passage du texte de règle mis en gras (comme sur le prototype). Il doit figurer tel quel
 * dans le texte du catalogue ; sinon, rien n'est mis en gras (aucune erreur).
 */
export const CARD_EMPHASIS: Record<string, string> = {
  patron: '+1 Tournée',
  josiane: 'relancez un de vos dés',
  'vieux-marcel': 'Vos suites valent 4',
  pilier: '1 jeton de moins',
  videur: 'annulé et défaussé',
  'tournee-patron': 'Gagnez 2 Tournées',
  'ticket-caisse': 'Annulez un Coup adverse',
  fermeture: 'rentre chez lui',
  'note-salee': '2 jetons de plus',
  'cul-sec': 'un lancer de plus',
  'tete-tourne': 'sa face opposée',
  'pari-comptoir': '2 jetons de plus',
  'double-tournee': 'vaut le double',
  'de-sous-table': 'Relancez un dé d’un adversaire',
  'yeux-piquent': 'qui change des dés',
  'gueule-bois': 'qu’un seul lancer',
  'tournee-generale': 'relancez tous les deux tous vos dés',
  leurre: 'Ne fait rien.',
  'croche-patte': 'relancé au hasard',
  'main-sac': 'ce Coup est annulé',
  fouine: 'Défaussez un piège adverse',
  'ardoise-piegee': '2 Tournées de plus',
  'faux-421': 'ne vaut que 2',
  'coup-nenette': 'devient une nénette',
  'retournement-veste': '6 jetons ou plus',
  'coup-coude': 'Piochez 1 carte.',
  'mise-bouche': 'est gratuite',
  'coup-pouce': 'Ajoutez ou retirez 1',
  'calcul-mental': 'gardez-en une',
  recompter: 'ajoutez ou retirez 1',
  domino: 'perd toutes ses Tournées',
  'reaction-chaine': 'Annulez une carte adverse.',
  'bon-numero': 'sur la face de votre choix',
  'grand-enchainement': 'Rejouez gratuitement',
  'beau-frere': '1 Tournée de moins',
  'efface-tout': 'personne ne donne de jetons',
  'verre-offert': 'qu’un seul lancer',
  trinquer: 'tous deux pris au hasard',
  'vide-poches': 'défausse une carte de sa main au hasard',
  mouchard: 'vous piochez 2 cartes',
  'tant-qu-on-y-est': '1 Tournée par carte jouée',
  'petite-soeur': 'Reprenez en main',
};

/** Coupe le texte en trois morceaux : avant, en gras, après. */
export function splitEmphasis(id: string, text: string): [string, string, string] {
  const em = CARD_EMPHASIS[id];
  const i = em ? text.indexOf(em) : -1;
  if (!em || i < 0) return [text, '', ''];
  return [text.slice(0, i), em, text.slice(i + em.length)];
}
