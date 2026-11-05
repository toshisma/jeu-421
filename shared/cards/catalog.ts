/**
 * « Coups Fourrés » : le mode cartes du 421 (livre de règles validé par Sam le 5 novembre 2026).
 * Catalogue officiel du premier set : identifiants, textes et réglages de départ.
 * Les identifiants ne changent JAMAIS (ils sont stockés dans les collections et les decks des joueurs).
 * Les chiffres (coûts, réglages) peuvent être ajustés par l'équilibrage.
 */

export type CardFamily = 'habitues' | 'ivresse' | 'pieges' | 'chaines';
export type CardType = 'coup' | 'piege' | 'riposte' | 'dernier-mot' | 'habitue';
export type CardRarity = 'commune' | 'rare' | 'epique' | 'legendaire';

export interface CardDef {
  id: string;
  name: string;
  family: CardFamily;
  type: CardType;
  /** Coût en Tournées. */
  cost: number;
  rarity: CardRarity;
  /** Texte de règle affiché sur la carte (vouvoiement). */
  text: string;
  /** Petite réplique en italique. */
  flavor: string;
}

export const FAMILY_LABEL: Record<CardFamily, string> = { habitues: 'Les Habitués', ivresse: 'L’Ivresse', pieges: 'Les Pièges', chaines: 'Les Chaînes' };
export const TYPE_LABEL: Record<CardType, string> = { coup: 'Coup', piege: 'Piège', riposte: 'Riposte', 'dernier-mot': 'Dernier mot', habitue: 'Habitué' };
export const RARITY_LABEL: Record<CardRarity, string> = { commune: 'Commune', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire' };

const c = (id: string, name: string, family: CardFamily, type: CardType, cost: number, rarity: CardRarity, text: string, flavor: string): CardDef =>
  ({ id, name, family, type, cost, rarity, text, flavor });

export const CARDS: CardDef[] = [
  // --- Les Habitués ---
  c('patron', 'Le Patron', 'habitues', 'habitue', 3, 'legendaire', 'Au début de chaque manche, +1 Tournée. Vos Habitués ne peuvent pas être chassés par une carte qui coûte 2 ou moins.', '« Ici, c’est moi qui sers. »'),
  c('josiane', 'Josiane, la serveuse', 'habitues', 'habitue', 2, 'rare', 'Une fois par manche, relancez un de vos dés sans utiliser de lancer.', '« Je vous remets la même ? »'),
  c('vieux-marcel', 'Le Vieux Marcel', 'habitues', 'habitue', 2, 'commune', 'Vos suites valent 3 au lieu de 2.', '« De mon temps, on comptait jusqu’à trois. »'),
  c('pilier', 'Le Pilier de comptoir', 'habitues', 'habitue', 1, 'commune', 'Quand vous perdez une manche, vous recevez 1 jeton de moins (au moins 1).', '« Trente ans au même tabouret. Rien ne le bouge. »'),
  c('videur', 'Le Videur', 'habitues', 'habitue', 3, 'epique', 'Le premier piège adverse qui se déclenche dans chaque manche est annulé et défaussé.', '« Pas de ça chez nous. »'),
  c('tournee-patron', 'Tournée du patron', 'habitues', 'coup', 1, 'commune', 'Gagnez 2 Tournées.', '« C’est la maison qui offre ! »'),
  c('ticket-caisse', 'Ticket de caisse', 'habitues', 'riposte', 1, 'commune', 'Annulez un Coup adverse qui coûte 1 ou moins.', '« Ça, ce n’est pas sur l’addition. »'),
  c('fermeture', 'Fermeture !', 'habitues', 'coup', 3, 'rare', 'Un Habitué adverse retourne dans la main de son propriétaire.', '« On ferme, messieurs-dames ! »'),
  c('note-salee', 'La note est salée', 'habitues', 'dernier-mot', 2, 'rare', 'Si vous gagnez la manche, le perdant reçoit 1 jeton de plus.', '« Et le service n’est pas compris. »'),
  // --- L'Ivresse ---
  c('cul-sec', 'Cul sec', 'ivresse', 'coup', 1, 'commune', 'Faites un lancer de plus ce tour, au-delà de la limite.', '« Allez, la dernière ! »'),
  c('tete-tourne', 'Tête qui tourne', 'ivresse', 'coup', 1, 'commune', 'Retournez un de vos dés sur sa face opposée (1 devient 6, 2 devient 5, 3 devient 4).', '« Le comptoir bouge, ou c’est moi ? »'),
  c('pari-comptoir', 'Pari de comptoir', 'ivresse', 'coup', 0, 'rare', 'Si vous gagnez la manche, le perdant reçoit 2 jetons de plus ; si vous la perdez, vous en recevez 2 de plus.', '« Tope là, et que le meilleur gagne. »'),
  c('double-tournee', 'Double tournée', 'ivresse', 'coup', 3, 'epique', 'Si vous gagnez la manche, votre combinaison vaut le double.', '« Et une deuxième pour la table ! »'),
  c('de-sous-table', 'Le dé sous la table', 'ivresse', 'coup', 3, 'rare', 'Seulement si vous jouez en second : relancez un dé de l’adversaire.', '« Oups, il a roulé. Je relance ? »'),
  c('yeux-piquent', 'Les yeux qui piquent', 'ivresse', 'riposte', 2, 'rare', 'Quand l’adversaire garde des dés, il doit en relâcher un de votre choix.', '« Tu es sûr de ce que tu vois ? »'),
  c('gueule-bois', 'Gueule de bois', 'ivresse', 'piege', 2, 'commune', 'Quand l’adversaire gagne une manche, il aura un lancer de moins à la suivante (au moins 1).', '« Ça se paie le lendemain. »'),
  c('tournee-generale', 'Tournée générale', 'ivresse', 'coup', 4, 'legendaire', 'Seulement si vous jouez en second : les deux joueurs relancent tous leurs dés, puis vous pouvez relancer un des vôtres.', '« Tout le monde reboit, c’est ma tournée ! »'),
  // --- Les Pièges ---
  c('leurre', 'Leurre', 'pieges', 'piege', 0, 'commune', 'Ne fait rien. Quand il est révélé ou qu’il revient en main, piochez 1 carte.', '« Rien dans les mains, rien dans les poches. »'),
  c('croche-patte', 'Croche-patte', 'pieges', 'piege', 1, 'commune', 'Quand l’adversaire garde 2 dés, l’un d’eux est relancé au hasard.', '« Attention à la marche. »'),
  c('main-sac', 'Main dans le sac', 'pieges', 'piege', 1, 'commune', 'Quand l’adversaire gagne des Tournées grâce à une carte, vous en gagnez autant.', '« On partage, entre amis. »'),
  c('fouine', 'Fouine', 'pieges', 'coup', 1, 'commune', 'Regardez un piège adverse. Payez 1 Tournée de plus pour le défausser.', '« Ça sent le coup fourré. »'),
  c('ardoise-piegee', 'Ardoise piégée', 'pieges', 'piege', 2, 'commune', 'Quand l’adversaire joue un Coup, il paie 1 Tournée de plus, sinon le Coup est annulé.', '« Tout se paie, un jour ou l’autre. »'),
  c('faux-421', 'Faux 4-2-1', 'pieges', 'piege', 2, 'rare', 'Quand l’adversaire termine avec un 4-2-1, il ne vaut que 2 cette manche.', '« Regarde mieux : c’est un 4 ou un 3 ? »'),
  c('coup-nenette', 'Le coup de la nénette', 'pieges', 'piege', 3, 'epique', 'Quand l’adversaire termine avec une combinaison qui vaut 1, elle devient une nénette.', '« Deux, deux, un. Et bonne nuit. »'),
  c('retournement-veste', 'Retournement de veste', 'pieges', 'piege', 4, 'legendaire', 'Quand l’adversaire devrait vous donner 4 jetons ou plus, c’est lui qui les reçoit.', '« Je n’ai jamais dit que j’étais de ton côté. »'),
  // --- Les Chaînes ---
  c('coup-coude', 'Coup de coude', 'chaines', 'coup', 0, 'commune', 'Piochez 1 carte.', '« Psst, regarde un peu ça. »'),
  c('mise-bouche', 'Mise en bouche', 'chaines', 'coup', 1, 'commune', 'Votre prochaine carte de la manche coûte 2 de moins.', '« Juste de quoi ouvrir l’appétit. »'),
  c('coup-pouce', 'Coup de pouce', 'chaines', 'coup', 1, 'commune', 'Ajoutez ou retirez 1 à un de vos dés (un 6 ne monte pas, un 1 ne descend pas).', '« Un tout petit coup de pouce, personne n’a rien vu. »'),
  c('calcul-mental', 'Calcul mental', 'chaines', 'coup', 1, 'commune', 'Regardez les 3 cartes du dessus de votre deck, gardez-en une, remettez les autres dessous.', '« Je retiens deux, et je pose quatre. »'),
  c('recompter', 'Recompter', 'chaines', 'dernier-mot', 1, 'commune', 'Si vous avez joué au moins 2 autres cartes dans la manche : ajoutez ou retirez 1 à un de vos dés.', '« Attendez, je recompte. »'),
  c('domino', 'Domino', 'chaines', 'coup', 2, 'rare', 'L’adversaire perd 1 Tournée par carte que vous avez déjà jouée dans la manche.', '« Et un, et deux, et trois… »'),
  c('reaction-chaine', 'Réaction en chaîne', 'chaines', 'riposte', 2, 'rare', 'Annulez une carte adverse. Si c’est au moins votre 3e carte de la manche, elle revient dans votre main.', '« Un qui tombe, et tout le zinc suit. »'),
  c('bon-numero', 'Le bon numéro', 'chaines', 'coup', 4, 'epique', 'Mettez un de vos dés sur la face de votre choix. Coûte 1 de moins par carte déjà jouée dans la manche.', '« Celui-là, je l’ai vu venir. »'),
  c('grand-enchainement', 'Le grand enchaînement', 'chaines', 'coup', 3, 'legendaire', 'Rejouez gratuitement le dernier Coup que vous avez joué dans cette manche.', '« Et on remet ça, dans le même ordre. »'),
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((x) => [x.id, x]));
export const cardDef = (id: string): CardDef | undefined => CARD_BY_ID[id];

/** Réglages de départ (livre de règles). */
export const CF_RULES = {
  /** Duel : jetons de départ de chaque joueur ; le premier à 0 gagne (décharge). */
  startTokens: 21,
  /** Partie libre à 3 ou 4 joueurs. */
  startTokensMulti: 10,
  deckSize: 20,
  maxCopies: 2,
  maxLegendaryCopies: 1,
  startHand: 4,
  mulligan: 2,
  handMax: 7,
  tourneesPerRound: 2,
  tourneesLoserBonus: 1,
  tourneesMax: 6,
  maxTraps: 2,
  maxHabitues: 3,
  /** Un piège non déclenché depuis ce nombre de manches revient en main. */
  trapReturnRounds: 3,
  /** L'ardoise, une fois par partie : emprunter ces Tournées tout de suite, rien à la manche suivante. */
  ardoiseLoan: 3,
  /** Temps par décision et réserve pour toute la partie (secondes). */
  decisionSeconds: 30,
  reserveSeconds: 60,
} as const;

/** Decks de départ offerts (20 cartes chacun, sans légendaire). */
export const STARTER_DECKS: { id: string; name: string; cards: Record<string, number> }[] = [
  { id: 'le-zinc', name: 'Le Zinc', cards: {
    josiane: 1, 'vieux-marcel': 2, pilier: 2, 'tournee-patron': 2, 'ticket-caisse': 2, fermeture: 1, 'note-salee': 1,
    'coup-coude': 2, 'mise-bouche': 1, 'coup-pouce': 2, 'calcul-mental': 1, recompter: 2, 'reaction-chaine': 1,
  } },
  { id: 'la-bringue', name: 'La Bringue', cards: {
    'cul-sec': 2, 'tete-tourne': 2, 'pari-comptoir': 2, 'de-sous-table': 1, 'yeux-piquent': 1, 'gueule-bois': 2,
    leurre: 2, 'croche-patte': 2, 'main-sac': 1, fouine: 2, 'ardoise-piegee': 2, 'faux-421': 1,
  } },
];

/** Boosters : 5 cartes au pur hasard (pas de rare garantie), prix en capsules. */
export const BOOSTER = {
  size: 5,
  price: 100,
  odds: { commune: 0.70, rare: 0.22, epique: 0.065, legendaire: 0.015 } as Record<CardRarity, number>,
  /** Chance qu'une carte sorte en version brillante (sans effet en partie). */
  shinyChance: 0.05,
};

/** Éclats de verre : rendus par un doublon en trop, et coût de fabrication d'une carte. */
export const SHARDS: Record<CardRarity, { recycle: number; craft: number }> = {
  commune: { recycle: 5, craft: 40 },
  rare: { recycle: 20, craft: 100 },
  epique: { recycle: 100, craft: 400 },
  legendaire: { recycle: 400, craft: 1600 },
};

/** Gains en capsules (volontairement bas). */
export const CAPSULES = {
  rankedWin: 15,
  rankedLoss: 5,
  vsBot: 3,
  vsBotDailyMax: 10,
  /** Découverte du mode : 3 boosters offerts en plus des 2 decks de départ. */
  welcomeBoosters: 3,
};

/** Vérifie un deck : renvoie la liste des problèmes (vide si le deck est valide). */
export function deckProblems(cards: Record<string, number>, owned?: Record<string, number>): string[] {
  const out: string[] = [];
  let total = 0;
  for (const [id, n] of Object.entries(cards)) {
    const d = cardDef(id);
    if (!d) { out.push(`Carte inconnue : ${id}.`); continue; }
    if (!Number.isInteger(n) || n < 1) { out.push(`Nombre invalide pour ${d.name}.`); continue; }
    total += n;
    const max = d.rarity === 'legendaire' ? CF_RULES.maxLegendaryCopies : CF_RULES.maxCopies;
    if (n > max) out.push(`${d.name} : ${max} exemplaire${max > 1 ? 's' : ''} au plus.`);
    if (owned && (owned[id] ?? 0) < n) out.push(`${d.name} : vous n’en avez que ${owned[id] ?? 0}.`);
  }
  if (total !== CF_RULES.deckSize) out.push(`Un deck compte exactement ${CF_RULES.deckSize} cartes (ici ${total}).`);
  return out;
}
