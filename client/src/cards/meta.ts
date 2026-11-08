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
  pilier: '2 jetons de moins',
  videur: 'annulé et défaussé',
  'tournee-patron': 'Gagnez 3 Tournées',
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
  leurre: 'gagnez 1 Tournée',
  'croche-patte': 'relancé au hasard',
  'main-sac': 'ce Coup est annulé',
  fouine: 'Défaussez un piège adverse',
  'ardoise-piegee': '3 Tournées de plus',
  'faux-421': 'ne vaut que 2',
  'coup-nenette': 'devient une nénette',
  'retournement-veste': '8 jetons ou plus',
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
  'efface-tout': 'qu’un seul jeton',
  'verre-offert': 'qu’un seul lancer',
  trinquer: 'tous deux pris au hasard',
  'vide-poches': 'Prenez 1 Tournée',
  mouchard: 'gagnez 1 Tournée',
  'tant-qu-on-y-est': 'Gagnez 2 Tournées',
  'petite-soeur': 'Reprenez en main',
  pourboire: 'Donnez 1 de vos jetons',
  'coup-etrier': 'Relancez un de vos dés.',
  fanfaron: '1 jeton de plus',
  'verre-de-trop': 'il reçoit 1 jeton',
  'courant-air': 'défaussée sans effet',
  'pot-aux-roses': 'qui coûte 2 ou plus',
  complice: 'gagnez 1 Tournée et piochez 1 carte',
  engrenage: 'elle est annulée',
  // 0.46
  'joueur-belote': 'valent 3 de plus',
  'garde-champetre': 'ne peuvent pas toucher à vos dés',
  doyen: 'restent 1 manche de plus',
  'cafe-serre': 'gagnez aussi 1 Tournée',
  'plat-du-jour': 'Gagnez 2 Tournées.',
  'table-reservee': 'Annulez un piège',
  addition: 'vaut au moins 3',
  'pique-assiette': 'c’est vous qui les gagnez',
  debauchage: 'passe de votre côté du comptoir',
  retrouvailles: 'revient s’installer devant vous',
  'petit-dernier': 'Relancez un de vos dés',
  hoquet: 'un des dés gardés est relancé aussi',
  'der-des-ders': 'il reçoit 1 jeton de plus',
  sante: 'reçoit aussi 1 jeton',
  calva: 'sa face opposée',
  miroir: 'sur la face d’un autre de vos dés',
  pochtron: 'un lancer de plus',
  'a-la-votre': 'Annulez une Riposte adverse.',
  'verres-echanges': 'Échangez vos trois dés',
  'fee-verte': 'jusqu’à 3 fois',
  'mot-de-trop': 'il est annulé',
  'peau-banane': 'un de ses dés est relancé au hasard',
  guetteur: 'Vous voyez les pièges posés devant vous.',
  denonciation: 'Défaussez un piège adverse',
  'passe-passe': 'Reprenez en main un de vos pièges posés',
  'attrape-nigaud': 'ce piège est défaussé',
  'lot-consolation': 'gagnez 1 Tournée et piochez 2 cartes',
  'flagrant-delit': 'qui coûte 1 ou moins',
  souriciere: 'il ne peut plus en jouer d’autre',
  embuscade: 'tous les pièges de votre main',
  'boule-de-neige': '1 carte par autre carte jouée',
  ricochet: 'ajoutez ou retirez 1',
  'noeud-coulant': 'ne peut plus en jouer d’autre',
  'compte-rond': '1 Tournée par autre carte',
  'retour-envoyeur': 'il retourne dans la main de son joueur',
  comptable: 'gagnez 1 Tournée et piochez 1 carte',
  'derniere-maille': 'sur la face de votre choix',
  echo: 'Rejouez gratuitement',
  boucle: 'les 2 derniers Coups',
  'effet-papillon': '1 Tournée de moins',
};

/** Coupe le texte en trois morceaux : avant, en gras, après. */
export function splitEmphasis(id: string, text: string): [string, string, string] {
  const em = CARD_EMPHASIS[id];
  const i = em ? text.indexOf(em) : -1;
  if (!em || i < 0) return [text, '', ''];
  return [text.slice(0, i), em, text.slice(i + em.length)];
}
