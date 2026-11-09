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
  if (r.discount > 0) out.push({ text: r.discount >= 5 ? s('Prochaine carte gratuite', 'Sa prochaine carte gratuite') : s(`Prochaine carte −${r.discount}`, `Sa prochaine carte −${r.discount}`), card: 'mise-bouche', type: 'coup', tone: 'good' });
  if ((r.efface ?? 0) > 0) out.push({ text: s('Si vous perdez : 1 seul jeton', 'S’il perd : 1 seul jeton'), card: 'efface-tout', type: 'dernier-mot', tone: 'good' });
  if ((r.addition ?? 0) > 0) out.push({ text: s('Au moins 3 si vous gagnez', 'Au moins 3 s’il gagne'), card: 'addition', type: 'dernier-mot', tone: 'good' });
  if ((r.sante ?? 0) > 0) out.push({ text: s('Si vous perdez : +1 jeton au gagnant', 'S’il perd : +1 jeton au gagnant'), card: 'sante', type: 'dernier-mot', tone: 'good' });
  if ((r.roundDiscount ?? 0) > 0) out.push({ text: s(`Vos cartes −${r.roundDiscount} cette manche`, `Ses cartes −${r.roundDiscount} cette manche`), card: 'effet-papillon', type: 'coup', tone: 'good' });
  if ((p.tourneesNext ?? 0) > 0) out.push({ text: `+${p.tourneesNext} Tournées à la prochaine manche`, card: 'plat-du-jour', type: 'coup', tone: 'good' });
  if (r.locked) out.push({ text: 'Plus de carte cette manche', card: r.locked, type: 'piege', tone: 'bad' });
  const penCard = (id: string | undefined) => (id === 'verre-offert' ? { card: id, type: 'coup' as const } : { card: 'gueule-bois', type: 'piege' as const });
  if (r.throwPenalty > 0) out.push({ text: `Un seul lancer`, ...penCard(r.penaltyCard), tone: 'bad' });
  if (r.faux421) out.push({ text: '4-2-1 ne vaut que 2', card: 'faux-421', type: 'piege', tone: 'bad' });
  if (r.forcedNenette) out.push({ text: 'Combinaison changée en nénette', card: 'coup-nenette', type: 'piege', tone: 'bad' });
  if (p.penaltyNext > 0 && (v.phase !== 'turn' || p.penaltyNextCard === 'verre-offert')) out.push({ text: 'Un seul lancer à la prochaine manche', ...penCard(p.penaltyNextCard), tone: 'bad' });
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
  pilier: '2 jetons de moins si vous perdez',
  videur: 'Annule le 1er piège adverse',
  'tournee-patron': '+3 Tournées',
  'ticket-caisse': 'Annule un Coup (4 ou moins)',
  fermeture: 'Chasse un Habitué, sinon +2 Tournées',
  'note-salee': '+2 jetons donnés si vous gagnez',
  'cul-sec': '+1 lancer ce tour et 1 carte',
  'tete-tourne': 'Retourne un dé (1↔6, 2↔5, 3↔4)',
  'pari-comptoir': 'Pari : 2 jetons de plus',
  'double-tournee': 'Combinaison ×2 si vous gagnez',
  'de-sous-table': 'Relance un dé (le sien si l’adversaire n’a pas fini)',
  'yeux-piquent': 'Annule un Coup sur les dés',
  'gueule-bois': 'S’il perd : un seul lancer ensuite',
  'tournee-generale': 'Relance tous les dés',
  leurre: 'Faux piège : +1 Tournée, 1 carte',
  'croche-patte': 'Relance un de ses dés à la fin',
  'main-sac': 'Annule son Coup à 1 ou plus',
  fouine: 'Défausse un piège, piochez 1',
  'ardoise-piegee': 'Ses Coups coûtent 3 de plus',
  'faux-421': 'Son 4-2-1 ne vaut que 2',
  'coup-nenette': 'Sa victoire à 1 ou 2 → nénette',
  'retournement-veste': 'Renvoie un gros don (8 et plus)',
  'coup-coude': 'Piochez 1 carte',
  'mise-bouche': '1 carte, la suivante −2',
  'coup-pouce': '+1 ou −1 sur un de vos dés',
  'calcul-mental': 'Choisissez 1 carte parmi 3',
  recompter: '+1 ou −1 sur un dé, à la fin',
  domino: 'L’adversaire perd ses Tournées',
  'reaction-chaine': 'Annule une carte adverse',
  'bon-numero': 'Un dé sur la face voulue',
  'grand-enchainement': 'Rejouez votre dernier Coup',
  'beau-frere': '+1 Tournée, cartes à 1 de moins',
  'efface-tout': 'Si vous perdez : 1 seul jeton reçu',
  'verre-offert': 'Un seul lancer pour l’adversaire',
  trinquer: 'Échange un dé avec l’adversaire',
  'vide-poches': 'Prenez-lui 1 Tournée et 1 carte',
  mouchard: 'S’il joue un Coup : +1 Tournée, 2 cartes',
  'tant-qu-on-y-est': '+2 Tournées, +1 par carte jouée',
  'petite-soeur': 'Reprend le dernier Coup défaussé',
  pourboire: 'Donnez 1 jeton, piochez 1 carte',
  'coup-etrier': 'Relance un de vos dés, à la fin',
  fanfaron: '+1 jeton donné si vous gagnez',
  'verre-de-trop': 'S’il relance : +1 jeton pour lui',
  'courant-air': 'Son Habitué ou sa Riposte s’envole',
  'pot-aux-roses': 'Annule une carte à 2 ou plus',
  complice: 'Vos pièges : +1 Tournée, 1 carte',
  engrenage: 'Annule sa 2e carte de la manche',
  // 0.46
  'joueur-belote': 'Brelans +3 · piochez 1 carte',
  'garde-champetre': '1 carte, personne ne touche à vos dés',
  doyen: '+1 Tournée, 1 carte, Habitués +1 manche',
  'cafe-serre': '1 carte, +1 Tournée si Habitué',
  'plat-du-jour': '+2 Tournées à la manche suivante',
  'table-reservee': 'Annule un piège posé sur vous',
  addition: 'Gagnant : au moins 3',
  'pique-assiette': 'Ses Tournées gagnées sont pour vous',
  debauchage: 'Prenez-lui un Habitué, sinon 2 cartes',
  retrouvailles: 'Un Habitué revient, 1 carte',
  'petit-dernier': 'Relance un de vos dés',
  hoquet: 'Un de ses dés gardés est relancé',
  'der-des-ders': 'S’il perd : +1 jeton pour lui',
  sante: 'Si vous perdez : +1 jeton au gagnant',
  calva: 'Retourne un dé, à la fin',
  miroir: 'Un dé copie un autre de vos dés',
  pochtron: '+1 lancer à chaque tour',
  'a-la-votre': 'Annule une Riposte',
  'verres-echanges': 'Échange vos 3 dés avec les siens',
  'fee-verte': 'Un dé visé, jusqu’à 3 essais',
  'mot-de-trop': 'Annule son Dernier mot',
  'peau-banane': 'Combinaison à 4+ : un dé relancé',
  guetteur: '+1 Tournée, 1 carte, voit les pièges',
  denonciation: 'Défausse un piège, +1 Tournée, 1 carte',
  'passe-passe': 'Reprend un piège, +1 Tournée, 1 carte',
  'attrape-nigaud': 'Défausse le piège qu’il pose',
  'lot-consolation': 'S’il gagne : +1 Tournée, 2 cartes',
  'flagrant-delit': 'Annule un Coup à 0 ou 1',
  souriciere: 'Après sa 1re carte : plus rien',
  embuscade: 'Pose tous vos pièges, gratis',
  'boule-de-neige': '1 carte par carte déjà jouée',
  ricochet: '±1 sur un dé, après une carte',
  'noeud-coulant': 'À sa 2e carte : 1 jeton, stop',
  'compte-rond': '+1 Tournée par carte jouée',
  'retour-envoyeur': 'Annule un Coup, il le reprend',
  comptable: '2e carte : +1 Tournée, 1 carte',
  'derniere-maille': 'Un dé sur la face voulue, à la fin',
  echo: 'Rejoue son dernier Coup',
  boucle: 'Reprend 2 cartes défaussées',
  'effet-papillon': '1 carte, les suivantes −1',
};
