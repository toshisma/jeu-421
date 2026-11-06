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
  c('patron', 'Le Patron', 'habitues', 'habitue', 2, 'legendaire', 'Au début de chaque manche, +1 Tournée et 1 carte. Vos Habitués ne peuvent être ni chassés ni annulés par une carte qui coûte 2 ou moins.', '« Ici, c’est moi qui sers. »'),
  c('josiane', 'Josiane, la serveuse', 'habitues', 'habitue', 1, 'rare', 'Une fois par manche, relancez un de vos dés sans utiliser de lancer.', '« Je vous remets la même ? »'),
  c('vieux-marcel', 'Le Vieux Marcel', 'habitues', 'habitue', 1, 'commune', 'En arrivant, piochez 1 carte. Vos suites valent 4 au lieu de 2.', '« De mon temps, on comptait jusqu’à trois. »'),
  c('pilier', 'Le Pilier de comptoir', 'habitues', 'habitue', 0, 'commune', 'Quand vous perdez une manche, vous recevez 1 jeton de moins (au moins 1).', '« Trente ans au même tabouret. Rien ne le bouge. »'),
  c('videur', 'Le Videur', 'habitues', 'habitue', 0, 'epique', 'Le premier piège adverse qui se déclenche dans chaque manche est annulé et défaussé.', '« Pas de ça chez nous. »'),
  c('tournee-patron', 'Tournée du patron', 'habitues', 'coup', 1, 'commune', 'Gagnez 2 Tournées et piochez 1 carte.', '« C’est la maison qui offre ! »'),
  c('ticket-caisse', 'Ticket de caisse', 'habitues', 'riposte', 1, 'commune', 'Annulez un Coup adverse qui coûte 3 ou moins.', '« Ça, ce n’est pas sur l’addition. »'),
  c('fermeture', 'Fermeture !', 'habitues', 'coup', 1, 'rare', 'Un Habitué adverse rentre chez lui (défaussé). S’il n’y en a aucun, piochez 2 cartes.', '« On ferme, messieurs-dames ! »'),
  c('note-salee', 'La note est salée', 'habitues', 'dernier-mot', 1, 'rare', 'Si vous gagnez la manche, le perdant reçoit 2 jetons de plus.', '« Et le service n’est pas compris. »'),
  c('beau-frere', 'Le Beau-frère', 'habitues', 'habitue', 0, 'rare', 'Vos cartes coûtent 1 Tournée de moins.', '« Pour toi, c’est prix de famille. »'),
  c('efface-tout', 'On efface tout', 'habitues', 'dernier-mot', 5, 'epique', 'Si vous perdez la manche, personne ne donne de jetons.', '« Allez, on n’en parle plus. »'),
  c('pourboire', 'Le Pourboire', 'habitues', 'coup', 2, 'rare', 'Donnez 1 de vos jetons à l’adversaire.', '« Gardez la monnaie. »'),
  // --- L'Ivresse ---
  c('cul-sec', 'Cul sec', 'ivresse', 'coup', 0, 'commune', 'Faites un lancer de plus ce tour, au-delà de la limite, et piochez 1 carte.', '« Allez, la dernière ! »'),
  c('tete-tourne', 'Tête qui tourne', 'ivresse', 'coup', 2, 'commune', 'Retournez un de vos dés sur sa face opposée (1 devient 6, 2 devient 5, 3 devient 4).', '« Le comptoir bouge, ou c’est moi ? »'),
  c('pari-comptoir', 'Pari de comptoir', 'ivresse', 'coup', 0, 'rare', 'Si vous gagnez la manche, le perdant reçoit 2 jetons de plus ; si vous la perdez, vous en recevez 2 de plus.', '« Tope là, et que le meilleur gagne. »'),
  c('double-tournee', 'Double tournée', 'ivresse', 'coup', 1, 'epique', 'Si vous gagnez la manche, votre combinaison vaut le double.', '« Et une deuxième pour la table ! »'),
  c('de-sous-table', 'Le dé sous la table', 'ivresse', 'coup', 2, 'rare', 'Relancez un dé d’un adversaire qui a fini son tour, ou sinon un de vos dés sans utiliser de lancer.', '« Oups, il a roulé. Je relance ? »'),
  c('yeux-piquent', 'Les yeux qui piquent', 'ivresse', 'riposte', 1, 'rare', 'Annulez un Coup adverse qui change des dés.', '« Tu es sûr de ce que tu vois ? »'),
  c('gueule-bois', 'Gueule de bois', 'ivresse', 'piege', 0, 'commune', 'Quand l’adversaire perd une manche, il n’aura qu’un seul lancer à la suivante.', '« Ça se paie le lendemain. »'),
  c('tournee-generale', 'Tournée générale', 'ivresse', 'coup', 3, 'legendaire', 'Si un adversaire a fini son tour : vous relancez tous les deux tous vos dés, puis vous pouvez relancer un des vôtres. Sinon, relancez tous vos dés sans utiliser de lancer.', '« Tout le monde reboit, c’est ma tournée ! »'),
  c('verre-offert', 'Le verre offert', 'ivresse', 'coup', 0, 'commune', 'L’adversaire n’aura qu’un seul lancer à son prochain tour.', '« Celui-là, il est pour moi. »'),
  c('trinquer', 'Trinquer', 'ivresse', 'dernier-mot', 3, 'rare', 'Échangez un de vos dés avec un dé de l’adversaire, tous deux pris au hasard.', '« À la vôtre ! Oups, mauvais verre. »'),
  c('coup-etrier', 'Le Coup de l’étrier', 'ivresse', 'dernier-mot', 2, 'commune', 'Relancez un de vos dés.', '« Allez, un dernier pour la route ! »'),
  c('fanfaron', 'Le Fanfaron', 'ivresse', 'habitue', 1, 'rare', 'Quand vous gagnez une manche, le perdant reçoit 1 jeton de plus.', '« Je vous l’avais bien dit ! »'),
  c('verre-de-trop', 'Le Verre de trop', 'ivresse', 'piege', 0, 'commune', 'Quand l’adversaire fait un 3e lancer dans son tour, il reçoit 1 jeton.', '« Celui-là, il ne fallait pas. »'),
  // --- Les Pièges ---
  c('leurre', 'Leurre', 'pieges', 'piege', 0, 'commune', 'Ne fait rien. Quand il est révélé ou qu’il revient en main, piochez 1 carte.', '« Rien dans les mains, rien dans les poches. »'),
  c('croche-patte', 'Croche-patte', 'pieges', 'piege', 0, 'commune', 'Quand l’adversaire finit son tour, un de ses dés est relancé au hasard.', '« Attention à la marche. »'),
  c('main-sac', 'Main dans le sac', 'pieges', 'piege', 1, 'rare', 'Quand l’adversaire joue un Coup qui coûte 2 ou plus, ce Coup est annulé.', '« Pas si vite, mon gaillard. »'),
  c('fouine', 'Fouine', 'pieges', 'coup', 0, 'commune', 'Défaussez un piège adverse de votre choix, s’il y en a un, et piochez 1 carte.', '« Ça sent le coup fourré. »'),
  c('ardoise-piegee', 'Ardoise piégée', 'pieges', 'piege', 0, 'commune', 'Quand l’adversaire joue un Coup, il paie 2 Tournées de plus, sinon le Coup est annulé.', '« Tout se paie, un jour ou l’autre. »'),
  c('faux-421', 'Faux 4-2-1', 'pieges', 'piege', 1, 'rare', 'Quand l’adversaire termine avec un 4-2-1, il ne vaut que 2 cette manche.', '« Regarde mieux : c’est un 4 ou un 3 ? »'),
  c('coup-nenette', 'Le coup de la nénette', 'pieges', 'piege', 0, 'epique', 'Quand l’adversaire devrait gagner la manche avec une combinaison qui vaut 1 ou 2, elle devient une nénette.', '« Deux, deux, un. Et bonne nuit. »'),
  c('retournement-veste', 'Retournement de veste', 'pieges', 'piege', 5, 'legendaire', 'Quand l’adversaire devrait vous donner 6 jetons ou plus, c’est lui qui les reçoit à votre place.', '« Je n’ai jamais dit que j’étais de ton côté. »'),
  c('vide-poches', 'Le Vide-poches', 'pieges', 'coup', 0, 'commune', 'L’adversaire défausse une carte de sa main au hasard.', '« Tiens, c’est à qui, ça ? »'),
  c('mouchard', 'Le Mouchard', 'pieges', 'piege', 0, 'commune', 'Quand l’adversaire joue un Coup, vous piochez 2 cartes.', '« Il n’a rien dit… à part à vous. »'),
  c('courant-air', 'Le Courant d’air', 'pieges', 'piege', 0, 'rare', 'Quand l’adversaire installe un Habitué, il rentre aussitôt chez lui (défaussé).', '« Fermez la porte, on gèle ! »'),
  c('pot-aux-roses', 'Le Pot aux roses', 'pieges', 'riposte', 2, 'rare', 'Annulez un Coup ou un Dernier mot adverse qui coûte 2 ou plus.', '« Ah, on a découvert le pot aux roses ! »'),
  c('complice', 'Le Complice', 'pieges', 'habitue', 0, 'epique', 'Quand un de vos pièges se déclenche, gagnez 1 Tournée et piochez 1 carte.', '« Moi ? J’étais au comptoir, comme d’habitude. »'),
  // --- Les Chaînes ---
  c('coup-coude', 'Coup de coude', 'chaines', 'coup', 0, 'commune', 'Piochez 1 carte.', '« Psst, regarde un peu ça. »'),
  c('mise-bouche', 'Mise en bouche', 'chaines', 'coup', 0, 'commune', 'Piochez 1 carte. Votre prochaine carte de la manche est gratuite.', '« Juste de quoi ouvrir l’appétit. »'),
  c('coup-pouce', 'Coup de pouce', 'chaines', 'coup', 3, 'commune', 'Ajoutez ou retirez 1 à un de vos dés (un 6 ne monte pas, un 1 ne descend pas).', '« Un tout petit coup de pouce, personne n’a rien vu. »'),
  c('calcul-mental', 'Calcul mental', 'chaines', 'coup', 0, 'commune', 'Regardez les 3 cartes du dessus de votre deck, gardez-en une, remettez les autres dessous.', '« Je retiens deux, et je pose quatre. »'),
  c('recompter', 'Recompter', 'chaines', 'dernier-mot', 3, 'commune', 'Si vous avez joué une autre carte dans la manche : ajoutez ou retirez 1 à un de vos dés.', '« Attendez, je recompte. »'),
  c('domino', 'Domino', 'chaines', 'coup', 1, 'rare', 'L’adversaire perd toutes ses Tournées.', '« Et un, et deux, et trois… »'),
  c('reaction-chaine', 'Réaction en chaîne', 'chaines', 'riposte', 3, 'rare', 'Annulez une carte adverse. Si c’est au moins votre 3e carte de la manche, elle revient dans votre main.', '« Un qui tombe, et tout le zinc suit. »'),
  c('bon-numero', 'Le bon numéro', 'chaines', 'coup', 4, 'epique', 'Mettez un de vos dés sur la face de votre choix.', '« Celui-là, je l’ai vu venir. »'),
  c('grand-enchainement', 'Le grand enchaînement', 'chaines', 'coup', 1, 'legendaire', 'Rejouez gratuitement le dernier Coup que vous avez joué dans cette manche. Si vous n’en avez joué aucun, piochez 2 cartes.', '« Et on remet ça, dans le même ordre. »'),
  c('tant-qu-on-y-est', 'Tant qu’on y est', 'chaines', 'coup', 0, 'commune', 'Gagnez 2 Tournées, plus 1 par autre carte jouée dans cette manche.', '« Une de plus, une de moins… »'),
  c('petite-soeur', 'La petite sœur', 'chaines', 'coup', 0, 'rare', 'Reprenez en main le dernier Coup de votre défausse (sauf une petite sœur).', '« Remettez-moi la petite sœur, patron. »'),
  c('engrenage', 'L’Engrenage', 'chaines', 'piege', 1, 'rare', 'Quand l’adversaire joue sa 2e carte de la manche, elle est annulée.', '« Une fois qu’on a mis le doigt dedans… »'),
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((x) => [x.id, x]));
export const cardDef = (id: string): CardDef | undefined => CARD_BY_ID[id];

/** Réglages de départ (livre de règles). */
export const CF_RULES = {
  /** Duel : jetons de départ de chaque joueur ; le premier à 0 gagne (décharge). */
  startTokens: 11,
  /** Partie libre à 3 ou 4 joueurs. */
  startTokensMulti: 9,
  deckSize: 20,
  maxCopies: 2,
  /** Un Habitué reste ce nombre de manches (celle où il arrive comprise), puis rentre chez lui (défaussé). */
  habitueRounds: 3,
  maxLegendaryCopies: 1,
  startHand: 5,
  mulligan: 2,
  /** Plus de limite de main (0.39, décision de Sam) : valeur haute, la défausse ne se déclenche jamais. */
  handMax: 99,
  tourneesPerRound: 2,
  tourneesLoserBonus: 1,
  tourneesMax: 6,
  maxTraps: 3,
  /** Habitués en jeu en même temps (chacun en un seul exemplaire devant soi). */
  maxHabitues: 3,
  /** Un piège non déclenché depuis ce nombre de manches revient en main. */
  trapReturnRounds: 3,
  /** L'ardoise a été retirée (0.39, décision de Sam) ; réglage gardé pour les anciens états de partie. */
  ardoiseLoan: 3,
  /** Lancers par tour (le meneur fixe le maximum des autres). */
  maxThrows: 3,
  /** Deck vide : on mélange sa défausse pour refaire un deck et on reçoit ces jetons (0 = ancienne règle : 1 jeton par pioche manquante). */
  reshufflePenalty: 1,
  /** Garde-fou : après cette manche, la partie s'arrête et le joueur qui a le moins de jetons gagne. */
  maxRounds: 20,
  /** Temps par décision et réserve pour toute la partie (secondes). */
  decisionSeconds: 30,
  reserveSeconds: 60,
} as const;

/** Decks de départ offerts à la découverte du mode (20 cartes chacun, sans légendaire) ; aussi utilisés par les invités et les ordinateurs. */
export const STARTER_DECKS: { id: string; name: string; cards: Record<string, number> }[] = [
  { id: 'le-zinc', name: 'Le Zinc', cards: {
    josiane: 1, 'vieux-marcel': 1, pilier: 1, videur: 1, 'tournee-patron': 2, 'ticket-caisse': 2, fermeture: 1, 'note-salee': 2,
    'coup-coude': 2, 'coup-pouce': 1, 'calcul-mental': 2, recompter: 1, 'reaction-chaine': 1, domino: 2,
  } },
  { id: 'la-bringue', name: 'La Bringue', cards: {
    'tete-tourne': 2, 'pari-comptoir': 2, 'de-sous-table': 2, 'yeux-piquent': 1, 'gueule-bois': 1, 'double-tournee': 2, 'verre-offert': 1,
    leurre: 2, mouchard: 1, fouine: 1, 'ardoise-piegee': 1, 'faux-421': 2, 'coup-nenette': 2,
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

/**
 * Règle de construction (0.40, contre les decks « tout en cartes fortes ») : au plus 2 familles par deck
 * et une seule carte légendaire. Objet modifiable par les scripts d'équilibrage (essais de variantes) ;
 * 99 = pas de limite.
 */
export const DECK_RULES = { maxFamilies: 2, maxLegendaries: 1, maxEpics: 99 };

/** Une phrase qui résume la règle de construction (éditeur, aide, pages d'aide). */
export function deckRuleText(): string {
  const parts = [`${CF_RULES.deckSize} cartes`, `${CF_RULES.maxCopies} exemplaires au plus de chaque carte`];
  if (DECK_RULES.maxFamilies < 4) parts.push(`${DECK_RULES.maxFamilies} familles au plus`);
  if (DECK_RULES.maxLegendaries < 99) parts.push(DECK_RULES.maxLegendaries === 1 ? 'une seule légendaire' : `${DECK_RULES.maxLegendaries} légendaires au plus`);
  if (DECK_RULES.maxEpics < 99) parts.push(`${DECK_RULES.maxEpics} épiques au plus`);
  return parts.join(', ');
}

const listFr = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ou ${xs[xs.length - 1]}`);

/** Vérifie un deck : renvoie la liste des problèmes (vide si le deck est valide), avec ce qu'il faut retirer. */
export function deckProblems(cards: Record<string, number>, owned?: Record<string, number>): string[] {
  const out: string[] = [];
  let total = 0;
  const fam: Partial<Record<CardFamily, number>> = {};
  const legend: string[] = [];
  const epics: string[] = [];
  let epicCount = 0;
  for (const [id, n] of Object.entries(cards)) {
    const d = cardDef(id);
    if (!d) { out.push(`Carte inconnue : ${id}.`); continue; }
    if (!Number.isInteger(n) || n < 1) { out.push(`Nombre invalide pour ${d.name}.`); continue; }
    total += n;
    fam[d.family] = (fam[d.family] ?? 0) + n;
    if (d.rarity === 'legendaire') legend.push(d.name);
    if (d.rarity === 'epique') { epics.push(d.name); epicCount += n; }
    const max = d.rarity === 'legendaire' ? CF_RULES.maxLegendaryCopies : CF_RULES.maxCopies;
    if (n > max) out.push(`${d.name} : ${max} exemplaire${max > 1 ? 's' : ''} au plus.`);
    if (owned && (owned[id] ?? 0) < n) out.push(`${d.name} : vous n’en avez que ${owned[id] ?? 0}.`);
  }
  if (total !== CF_RULES.deckSize) out.push(`Un deck compte exactement ${CF_RULES.deckSize} cartes (ici ${total}).`);
  const fams = (Object.entries(fam) as [CardFamily, number][]).sort((a, b) => b[1] - a[1]);
  if (fams.length > DECK_RULES.maxFamilies) {
    const extra = fams.slice(DECK_RULES.maxFamilies).map(([f, n]) => `${FAMILY_LABEL[f]} (${n} carte${n > 1 ? 's' : ''})`);
    out.push(`${DECK_RULES.maxFamilies} familles au plus par deck (ici ${fams.length}) : retirez ${extra.length > 1 ? 'les cartes de ' : 'les cartes de '}${extra.join(' et ')}.`);
  }
  if (legend.length > DECK_RULES.maxLegendaries) {
    out.push(DECK_RULES.maxLegendaries === 1
      ? `Une seule légendaire par deck (ici ${legend.length}) : gardez-en une et retirez ${listFr(legend.length === 2 ? [legend[1]] : legend.slice(1))}${legend.length === 2 ? ` (ou ${legend[0]})` : ''}.`
      : `${DECK_RULES.maxLegendaries} légendaires au plus par deck (ici ${legend.length}) : retirez-en ${legend.length - DECK_RULES.maxLegendaries} (${listFr(legend)}).`);
  }
  if (epicCount > DECK_RULES.maxEpics) {
    out.push(`${DECK_RULES.maxEpics} épiques au plus par deck (ici ${epicCount}) : retirez-en ${epicCount - DECK_RULES.maxEpics} parmi ${listFr(epics)}.`);
  }
  return out;
}
