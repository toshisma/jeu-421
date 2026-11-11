import { ITEMS } from './catalog';
import type { DmStats } from '../dixmille/stats';
import type { PmStats } from '../pokermenteur/stats';

/**
 * Succès : objectifs permanents, débloqués automatiquement, chacun avec une récompense en pièces.
 * Logique pure, appliquée par le jeu (invités) et par le serveur (comptes).
 * Récompenses divisées par 4 en v0.30 : les succès donnaient trop de pièces.
 */
export interface Stats {
  played: number;
  won: number;
  total421: number;
  onlineGames: number;
  onlineWins: number;
  hardWins: number;
  brelans: number;
  aces: number; // deux as ou plus (x-1-1, trois as)
  gestures: number;
  streak: number;
  bestStreak: number;
  bigTableWins: number; // victoires contre 3 adversaires ou plus
  questsClaimed: number;
  triAces: number; // trois as
  perfectWins: number; // victoires sans perdre une seule manche (5 manches ou plus)
  comebacks: number; // victoires après avoir eu 10 jetons ou plus
  tournaments: number; // tournois terminés
  tournamentWins: number; // tournois gagnés
  potsWon: number; // cagnottes remportées (tables avec mise)
  bossWins: number; // patrons de la semaine battus
  triple421: number; // parties avec trois 4-2-1 ou plus
  nenettes3: number; // parties avec trois nénettes ou plus
  midnight: number; // parties terminées entre minuit et 1 h
  bigComebacks: number; // victoires après avoir eu 15 jetons ou plus
}

export const EMPTY_STATS: Stats = {
  played: 0, won: 0, total421: 0, onlineGames: 0, onlineWins: 0, hardWins: 0, brelans: 0, aces: 0,
  gestures: 0, streak: 0, bestStreak: 0, bigTableWins: 0, questsClaimed: 0, triAces: 0, perfectWins: 0, comebacks: 0,
  tournaments: 0, tournamentWins: 0, potsWon: 0, bossWins: 0, triple421: 0, nenettes3: 0, midnight: 0, bigComebacks: 0,
};

/** Ce dont un succès a besoin pour mesurer sa progression. */
export interface AchievementInput { stats: Stats; level: number; purchases: number; owned?: string[]; /** Statistiques du Courtisan. */ dm?: DmStats; /** Statistiques du Poker menteur. */ pm?: PmStats }

/** Nombre d'objets payants du catalogue (pour « tout posséder »). */
export const PAID_ITEMS = ITEMS.filter((i) => i.price > 0).length;

export interface AchievementDef {
  id: string;
  icon: string;
  name: string;
  description: string;
  target: number;
  coins: number;
  /** Succès difficile (mis en valeur). */
  rare?: boolean;
  /** Succès secret : nom et description cachés tant qu'il n'est pas débloqué. */
  secret?: boolean;
  /** Succès propre à un mode (affiché à part, et dans le menu de ce mode). */
  game?: 'courtisan' | 'poker';
  value: (a: AchievementInput) => number;
}

const st = (k: keyof Stats) => (a: AchievementInput) => a.stats[k];
const dm = (k: keyof DmStats) => (a: AchievementInput) => a.dm?.[k] ?? 0;
const pm = (k: keyof PmStats) => (a: AchievementInput) => a.pm?.[k] ?? 0;
const bits = (n: number) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1);

/**
 * Succès du Courtisan (0.53). Récompenses basses, à l'échelle des autres (divisées par 4 en 0.30).
 * Tous reposent sur des faits que le serveur connaît (parties qu'il joue lui-même : en ligne, ou contre
 * l'ordinateur à une table du serveur), SAUF les deux premiers (victoires) : une partie gratuite contre
 * l'ordinateur jouée sur le téléphone compte aussi, avec ses bornes (20 s au moins, 40 parties par jour).
 */
function DM_ACHIEVEMENTS(): AchievementDef[] {
  const c = { game: 'courtisan' as const };
  return [
    { ...c, id: 'dm-premiere', icon: '🎲', name: 'Premier courtisan', description: 'Gagner une partie du Courtisan', target: 1, coins: 5, value: dm('wins') },
    { ...c, id: 'dm-gagnant-25', icon: '👑', name: 'Favori de la cour', description: 'Gagner 25 parties du Courtisan', target: 25, coins: 15, value: dm('wins') },
    { ...c, id: 'dm-en-ligne', icon: '🌐', name: 'Duel à la cour', description: 'Gagner une partie du Courtisan en ligne contre un autre joueur', target: 1, coins: 10, value: dm('onlineWins') },
    { ...c, id: 'dm-en-ligne-10', icon: '🏰', name: 'Maître de la cour', description: 'Gagner 10 parties du Courtisan en ligne contre d’autres joueurs', target: 10, coins: 20, value: dm('onlineWins') },
    { ...c, id: 'dm-gros-tour', icon: '💰', name: 'Bourse pleine', description: 'Encaisser 1 000 points en un seul tour (partie en ligne)', target: 1000, coins: 5, value: dm('vBestTurn') },
    { ...c, id: 'dm-tresor', icon: '💎', name: 'Le trésor du roi', description: 'Encaisser 2 500 points en un seul tour (partie en ligne)', target: 2500, coins: 25, rare: true, value: dm('vBestTurn') },
    { ...c, id: 'dm-main-pleine', icon: '🔥', name: 'Main brûlante', description: 'Faire deux mains pleines dans le même tour (partie en ligne)', target: 2, coins: 10, value: dm('hotMax') },
    { ...c, id: 'dm-six-des', icon: '✋', name: 'Six d’un coup', description: 'Mettre de côté les 6 dés d’un même lancer (partie en ligne)', target: 1, coins: 5, value: dm('six') },
    { ...c, id: 'dm-grande-suite', icon: '🌈', name: 'Grande suite', description: 'Faire une grande suite, de 1 à 6 (partie en ligne)', target: 1, coins: 5, value: dm('straight') },
    { ...c, id: 'dm-sans-rate', icon: '🛡️', name: 'Sans faux pas', description: 'Gagner une partie en 4 000 points ou plus sans un seul « Raté » (partie en ligne)', target: 1, coins: 5, value: dm('cleanWins') },
    { ...c, id: 'dm-niveaux', icon: '🧠', name: 'Tour de la cour', description: 'Battre un ordinateur de chaque niveau (Débutant, Habitué, Fine fouine) à une table en ligne', target: 3, coins: 10, value: (a) => bits(a.dm?.beaten ?? 0) },
    { ...c, id: 'dm-serie-3', icon: '☄️', name: 'Main heureuse', description: 'Gagner 3 parties en ligne du Courtisan d’affilée', target: 3, coins: 5, value: dm('bestStreak') },
    { ...c, id: 'dm-pot', icon: '🪙', name: 'Le pot est à moi', description: 'Emporter un pot de Groschen', target: 1, coins: 5, value: dm('pots') },
    { ...c, id: 'dm-six-identiques', icon: '🎰', name: 'Six fois la même', description: 'Six dés identiques en un seul lancer (partie en ligne)', target: 1, coins: 15, secret: true, value: dm('sixKind') },
  ];
}

/**
 * Succès du Poker menteur : récompenses basses (au niveau du bas des autres). Tous vérifiés par le
 * serveur (parties qu'il joue : en ligne, ordinateurs compris), SAUF les victoires (les deux premiers),
 * où une partie contre l'ordinateur jouée sur le téléphone compte aussi, avec les bornes du solo.
 */
function PM_ACHIEVEMENTS(): AchievementDef[] {
  const c = { game: 'poker' as const };
  return [
    { ...c, id: 'pm-premiere', icon: '🃏', name: 'Premier menteur', description: 'Gagner une partie de Poker menteur', target: 1, coins: 5, value: pm('wins') },
    { ...c, id: 'pm-gagnant-25', icon: '🎩', name: 'Pilier du gobelet', description: 'Gagner 25 parties de Poker menteur', target: 25, coins: 15, value: pm('wins') },
    { ...c, id: 'pm-en-ligne', icon: '🌐', name: 'Bluff en ligne', description: 'Gagner une partie de Poker menteur en ligne contre un autre joueur', target: 1, coins: 10, value: pm('onlineWins') },
    { ...c, id: 'pm-flair', icon: '👃', name: 'Flair de comptoir', description: 'Crier « Menteur ! » à raison 10 fois (parties en ligne)', target: 10, coins: 5, value: pm('callsRight') },
    { ...c, id: 'pm-bluff', icon: '😏', name: 'Bluff de maître', description: 'Faire croire 10 mensonges (parties en ligne)', target: 10, coins: 5, value: pm('bluffsPassed') },
    { ...c, id: 'pm-intact', icon: '🛡️', name: 'Sans une égratignure', description: 'Gagner sans perdre une vie, à 3 joueurs ou plus (partie en ligne)', target: 1, coins: 10, value: pm('flawless') },
    { ...c, id: 'pm-niveaux', icon: '🧠', name: 'Tous les comptoirs', description: 'Battre un ordinateur de chaque niveau (Débutant, Habitué, Fine fouine) à une table en ligne', target: 3, coins: 10, value: (a) => bits(a.pm?.beaten ?? 0) },
    { ...c, id: 'pm-poker-as', icon: '🂡', name: 'Le vrai Poker d’As', description: 'Avoir un vrai Poker d’As sous le gobelet quand on le soulève (partie en ligne)', target: 1, coins: 15, secret: true, value: pm('pokerAs') },
  ];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'premiere-victoire', icon: '🥇', name: 'Première victoire', description: 'Gagner une partie', target: 1, coins: 5, value: st('won') },
  { id: 'habitue', icon: '🍺', name: 'Habitué du comptoir', description: 'Terminer 10 parties', target: 10, coins: 5, value: st('played') },
  { id: 'pilier', icon: '🏛️', name: 'Pilier de bar', description: 'Terminer 100 parties', target: 100, coins: 15, value: st('played') },
  { id: 'gagnant-10', icon: '🏆', name: 'Gagneur', description: 'Gagner 10 parties', target: 10, coins: 10, value: st('won') },
  { id: 'gagnant-50', icon: '👑', name: 'Roi du 421', description: 'Gagner 50 parties', target: 50, coins: 25, value: st('won') },
  { id: 'premier-421', icon: '🎯', name: 'Le coup parfait', description: 'Faire un 4-2-1', target: 1, coins: 5, value: st('total421') },
  { id: 'dix-421', icon: '💫', name: 'Collectionneur de 421', description: 'Faire 10 fois 4-2-1', target: 10, coins: 10, value: st('total421') },
  { id: 'brelans', icon: '🎲', name: 'Brelan après brelan', description: 'Faire 20 brelans', target: 20, coins: 10, value: st('brelans') },
  { id: 'as', icon: '🂡', name: 'As des as', description: 'Faire 50 fois deux as ou plus', target: 50, coins: 10, value: st('aces') },
  { id: 'serie-3', icon: '🔥', name: 'En feu', description: 'Gagner 3 parties d’affilée', target: 3, coins: 5, value: st('bestStreak') },
  { id: 'serie-5', icon: '☄️', name: 'Inarrêtable', description: 'Gagner 5 parties d’affilée', target: 5, coins: 15, value: st('bestStreak') },
  { id: 'difficile', icon: '🧠', name: 'Plus fort que la machine', description: 'Battre l’IA difficile', target: 1, coins: 10, value: st('hardWins') },
  { id: 'grande-table', icon: '🪑', name: 'Grande tablée', description: 'Gagner contre 3 adversaires ou plus', target: 1, coins: 5, value: st('bigTableWins') },
  { id: 'en-ligne', icon: '🌐', name: 'Entre amis', description: 'Gagner une partie en ligne', target: 1, coins: 10, value: st('onlineWins') },
  { id: 'en-ligne-10', icon: '🌟', name: 'Terreur du salon', description: 'Gagner 10 parties en ligne', target: 10, coins: 20, value: st('onlineWins') },
  { id: 'gestes', icon: '👋', name: 'Coup de poignet', description: 'Lancer 50 fois d’un geste', target: 50, coins: 5, value: st('gestures') },
  { id: 'collection', icon: '🎨', name: 'Décorateur', description: 'Acheter 5 objets à la boutique', target: 5, coins: 10, value: (a) => a.purchases },
  { id: 'niveau-10', icon: '⭐', name: 'Vétéran', description: 'Atteindre le niveau 10', target: 10, coins: 15, value: (a) => a.level },
  { id: 'defis', icon: '📅', name: 'Assidu', description: 'Récupérer 10 défis du jour', target: 10, coins: 10, value: st('questsClaimed') },
  { id: 'tournoi', icon: '🎪', name: 'Premier tournoi', description: 'Terminer un tournoi', target: 1, coins: 5, value: st('tournaments') },
  { id: 'tournoi-gagne', icon: '🏆', name: 'Champion', description: 'Gagner un tournoi', target: 1, coins: 15, value: st('tournamentWins') },
  { id: 'cagnotte', icon: '💰', name: 'Rafler la mise', description: 'Remporter une cagnotte à une table avec mise', target: 1, coins: 5, value: st('potsWon') },
  { id: 'patron', icon: '🎩', name: 'Tombeur de patron', description: 'Battre le patron de la semaine', target: 1, coins: 5, value: st('bossWins') },
  // --- Succès difficiles : des semaines ou des mois de jeu ---
  { id: 'trois-as-10', icon: '🃏', name: 'Pluie d’as', description: 'Faire 10 fois trois as', target: 10, coins: 30, rare: true, value: st('triAces') },
  { id: 'dix-421-50', icon: '🌠', name: 'Maître du 421', description: 'Faire 50 fois 4-2-1', target: 50, coins: 60, rare: true, value: st('total421') },
  { id: 'parfait', icon: '💎', name: 'Sans une égratignure', description: 'Gagner sans perdre une seule manche (5 manches ou plus)', target: 1, coins: 25, rare: true, value: st('perfectWins') },
  { id: 'parfait-10', icon: '🛡️', name: 'Intouchable', description: '10 victoires sans perdre une seule manche', target: 10, coins: 125, rare: true, value: st('perfectWins') },
  { id: 'remontada', icon: '🧗', name: 'Remontada', description: 'Gagner après avoir eu 10 jetons ou plus', target: 1, coins: 30, rare: true, value: st('comebacks') },
  { id: 'remontada-10', icon: '🦅', name: 'Phénix', description: 'Réussir 10 remontadas', target: 10, coins: 125, rare: true, value: st('comebacks') },
  { id: 'serie-10', icon: '🌋', name: 'Légende vivante', description: 'Gagner 10 parties d’affilée', target: 10, coins: 150, rare: true, value: st('bestStreak') },
  { id: 'difficile-25', icon: '🤖', name: 'Briseur de machines', description: 'Battre 25 fois l’IA difficile', target: 25, coins: 75, rare: true, value: st('hardWins') },
  { id: 'grande-table-25', icon: '🍻', name: 'Roi de la tablée', description: 'Gagner 25 fois contre 3 adversaires ou plus', target: 25, coins: 60, rare: true, value: st('bigTableWins') },
  { id: 'en-ligne-50', icon: '🏟️', name: 'Champion du salon', description: 'Gagner 50 parties en ligne', target: 50, coins: 150, rare: true, value: st('onlineWins') },
  { id: 'gagnant-200', icon: '🏅', name: 'Monument', description: 'Gagner 200 parties', target: 200, coins: 150, rare: true, value: st('won') },
  { id: 'pilier-500', icon: '🗿', name: 'Fait partie des meubles', description: 'Terminer 500 parties', target: 500, coins: 125, rare: true, value: st('played') },
  { id: 'gestes-500', icon: '🤹', name: 'Jongleur', description: 'Lancer 500 fois d’un geste', target: 500, coins: 40, rare: true, value: st('gestures') },
  { id: 'defis-100', icon: '🗓️', name: 'Fidèle au poste', description: 'Récupérer 100 défis du jour', target: 100, coins: 100, rare: true, value: st('questsClaimed') },
  { id: 'niveau-25', icon: '🌟', name: 'Grand maître', description: 'Atteindre le niveau 25', target: 25, coins: 200, rare: true, value: (a) => a.level },
  { id: 'collection-20', icon: '🖼️', name: 'Collectionneur', description: 'Acheter 20 objets à la boutique', target: 20, coins: 75, rare: true, value: (a) => a.purchases },
  { id: 'collection-tout', icon: '🏰', name: 'Tout le catalogue', description: 'Posséder tous les objets de la boutique', target: PAID_ITEMS, coins: 500, rare: true, value: (a) => a.purchases },
  { id: 'tournoi-10', icon: '🎖️', name: 'Abonné aux podiums', description: 'Gagner 10 tournois', target: 10, coins: 150, rare: true, value: st('tournamentWins') },
  { id: 'tournoi-50', icon: '🎡', name: 'Tournée des grands ducs', description: 'Terminer 50 tournois', target: 50, coins: 75, rare: true, value: st('tournaments') },
  { id: 'cagnotte-25', icon: '🏦', name: 'La banque, c’est moi', description: 'Remporter 25 cagnottes', target: 25, coins: 75, rare: true, value: st('potsWon') },
  // --- Secrets ---
  { id: 'secret-triple', icon: '🎰', name: 'Jackpot', description: 'Faire trois 4-2-1 dans la même partie', target: 1, coins: 15, secret: true, value: st('triple421') },
  { id: 'secret-nenette', icon: '🙈', name: 'Abonné à la nénette', description: 'Faire trois nénettes dans la même partie', target: 1, coins: 10, secret: true, value: st('nenettes3') },
  { id: 'secret-minuit', icon: '🌙', name: 'Dernière tournée', description: 'Finir une partie entre minuit et une heure du matin', target: 1, coins: 5, secret: true, value: st('midnight') },
  { id: 'secret-phenix', icon: '🔥', name: 'Revenu de l’enfer', description: 'Gagner après avoir eu 15 jetons ou plus', target: 1, coins: 20, secret: true, value: st('bigComebacks') },
  { id: 'secret-brillant', icon: '✨', name: 'Ça brille !', description: 'Trouver un dé brillant dans un sac', target: 1, coins: 10, secret: true, value: (a) => (a.owned ?? []).filter((id) => id.endsWith('-brillant')).length },
  { id: 'secret-legende', icon: '🐉', name: 'Ça, c’est une légende', description: 'Posséder un dé légendaire', target: 1, coins: 10, secret: true, value: (a) => (a.owned ?? []).filter((id) => ['dc-perron', 'dc-dragon', 'dc-aurore'].includes(id.replace('-brillant', ''))).length },
  { id: 'patron-10', icon: '🥊', name: 'Terreur des patrons', description: 'Battre 10 patrons de la semaine', target: 10, coins: 100, rare: true, value: st('bossWins') },
  ...DM_ACHIEVEMENTS(),
  ...PM_ACHIEVEMENTS(),
];

/** Succès débloqués par la situation actuelle et pas encore enregistrés. */
export function newlyUnlocked(input: AchievementInput, unlocked: Record<string, number>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.value(input) >= a.target);
}
