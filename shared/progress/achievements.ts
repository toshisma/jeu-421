import { ITEMS } from './catalog';

/**
 * Succès : objectifs permanents, débloqués automatiquement, chacun avec une récompense en pièces.
 * Logique pure, appliquée par le jeu (invités) et par le serveur (comptes).
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
export interface AchievementInput { stats: Stats; level: number; purchases: number; owned?: string[] }

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
  value: (a: AchievementInput) => number;
}

const st = (k: keyof Stats) => (a: AchievementInput) => a.stats[k];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'premiere-victoire', icon: '🥇', name: 'Première victoire', description: 'Gagner une partie', target: 1, coins: 10, value: st('won') },
  { id: 'habitue', icon: '🍺', name: 'Habitué du comptoir', description: 'Terminer 10 parties', target: 10, coins: 10, value: st('played') },
  { id: 'pilier', icon: '🏛️', name: 'Pilier de bar', description: 'Terminer 100 parties', target: 100, coins: 60, value: st('played') },
  { id: 'gagnant-10', icon: '🏆', name: 'Gagneur', description: 'Gagner 10 parties', target: 10, coins: 30, value: st('won') },
  { id: 'gagnant-50', icon: '👑', name: 'Roi du 421', description: 'Gagner 50 parties', target: 50, coins: 100, value: st('won') },
  { id: 'premier-421', icon: '🎯', name: 'Le coup parfait', description: 'Faire un 4-2-1', target: 1, coins: 15, value: st('total421') },
  { id: 'dix-421', icon: '💫', name: 'Collectionneur de 421', description: 'Faire 10 fois 4-2-1', target: 10, coins: 50, value: st('total421') },
  { id: 'brelans', icon: '🎲', name: 'Brelan après brelan', description: 'Faire 20 brelans', target: 20, coins: 30, value: st('brelans') },
  { id: 'as', icon: '🂡', name: 'As des as', description: 'Faire 50 fois deux as ou plus', target: 50, coins: 40, value: st('aces') },
  { id: 'serie-3', icon: '🔥', name: 'En feu', description: 'Gagner 3 parties d’affilée', target: 3, coins: 25, value: st('bestStreak') },
  { id: 'serie-5', icon: '☄️', name: 'Inarrêtable', description: 'Gagner 5 parties d’affilée', target: 5, coins: 60, value: st('bestStreak') },
  { id: 'difficile', icon: '🧠', name: 'Plus fort que la machine', description: 'Battre l’IA difficile', target: 1, coins: 30, value: st('hardWins') },
  { id: 'grande-table', icon: '🪑', name: 'Grande tablée', description: 'Gagner contre 3 adversaires ou plus', target: 1, coins: 25, value: st('bigTableWins') },
  { id: 'en-ligne', icon: '🌐', name: 'Entre amis', description: 'Gagner une partie en ligne', target: 1, coins: 30, value: st('onlineWins') },
  { id: 'en-ligne-10', icon: '🌟', name: 'Terreur du salon', description: 'Gagner 10 parties en ligne', target: 10, coins: 80, value: st('onlineWins') },
  { id: 'gestes', icon: '👋', name: 'Coup de poignet', description: 'Lancer 50 fois d’un geste', target: 50, coins: 20, value: st('gestures') },
  { id: 'collection', icon: '🎨', name: 'Décorateur', description: 'Acheter 5 objets à la boutique', target: 5, coins: 30, value: (a) => a.purchases },
  { id: 'niveau-10', icon: '⭐', name: 'Vétéran', description: 'Atteindre le niveau 10', target: 10, coins: 60, value: (a) => a.level },
  { id: 'defis', icon: '📅', name: 'Assidu', description: 'Récupérer 10 défis du jour', target: 10, coins: 40, value: st('questsClaimed') },
  { id: 'tournoi', icon: '🎪', name: 'Premier tournoi', description: 'Terminer un tournoi', target: 1, coins: 15, value: st('tournaments') },
  { id: 'tournoi-gagne', icon: '🏆', name: 'Champion', description: 'Gagner un tournoi', target: 1, coins: 60, value: st('tournamentWins') },
  { id: 'cagnotte', icon: '💰', name: 'Rafler la mise', description: 'Remporter une cagnotte à une table avec mise', target: 1, coins: 20, value: st('potsWon') },
  { id: 'patron', icon: '🎩', name: 'Tombeur de patron', description: 'Battre le patron de la semaine', target: 1, coins: 20, value: st('bossWins') },
  // --- Succès difficiles : des semaines ou des mois de jeu ---
  { id: 'trois-as-10', icon: '🃏', name: 'Pluie d’as', description: 'Faire 10 fois trois as', target: 10, coins: 120, rare: true, value: st('triAces') },
  { id: 'dix-421-50', icon: '🌠', name: 'Maître du 421', description: 'Faire 50 fois 4-2-1', target: 50, coins: 240, rare: true, value: st('total421') },
  { id: 'parfait', icon: '💎', name: 'Sans une égratignure', description: 'Gagner sans perdre une seule manche (5 manches ou plus)', target: 1, coins: 100, rare: true, value: st('perfectWins') },
  { id: 'parfait-10', icon: '🛡️', name: 'Intouchable', description: '10 victoires sans perdre une seule manche', target: 10, coins: 500, rare: true, value: st('perfectWins') },
  { id: 'remontada', icon: '🧗', name: 'Remontada', description: 'Gagner après avoir eu 10 jetons ou plus', target: 1, coins: 120, rare: true, value: st('comebacks') },
  { id: 'remontada-10', icon: '🦅', name: 'Phénix', description: 'Réussir 10 remontadas', target: 10, coins: 500, rare: true, value: st('comebacks') },
  { id: 'serie-10', icon: '🌋', name: 'Légende vivante', description: 'Gagner 10 parties d’affilée', target: 10, coins: 600, rare: true, value: st('bestStreak') },
  { id: 'difficile-25', icon: '🤖', name: 'Briseur de machines', description: 'Battre 25 fois l’IA difficile', target: 25, coins: 300, rare: true, value: st('hardWins') },
  { id: 'grande-table-25', icon: '🍻', name: 'Roi de la tablée', description: 'Gagner 25 fois contre 3 adversaires ou plus', target: 25, coins: 240, rare: true, value: st('bigTableWins') },
  { id: 'en-ligne-50', icon: '🏟️', name: 'Champion du salon', description: 'Gagner 50 parties en ligne', target: 50, coins: 600, rare: true, value: st('onlineWins') },
  { id: 'gagnant-200', icon: '🏅', name: 'Monument', description: 'Gagner 200 parties', target: 200, coins: 600, rare: true, value: st('won') },
  { id: 'pilier-500', icon: '🗿', name: 'Fait partie des meubles', description: 'Terminer 500 parties', target: 500, coins: 500, rare: true, value: st('played') },
  { id: 'gestes-500', icon: '🤹', name: 'Jongleur', description: 'Lancer 500 fois d’un geste', target: 500, coins: 160, rare: true, value: st('gestures') },
  { id: 'defis-100', icon: '🗓️', name: 'Fidèle au poste', description: 'Récupérer 100 défis du jour', target: 100, coins: 400, rare: true, value: st('questsClaimed') },
  { id: 'niveau-25', icon: '🌟', name: 'Grand maître', description: 'Atteindre le niveau 25', target: 25, coins: 800, rare: true, value: (a) => a.level },
  { id: 'collection-20', icon: '🖼️', name: 'Collectionneur', description: 'Acheter 20 objets à la boutique', target: 20, coins: 300, rare: true, value: (a) => a.purchases },
  { id: 'collection-tout', icon: '🏰', name: 'Tout le catalogue', description: 'Posséder tous les objets de la boutique', target: PAID_ITEMS, coins: 2000, rare: true, value: (a) => a.purchases },
  { id: 'tournoi-10', icon: '🎖️', name: 'Abonné aux podiums', description: 'Gagner 10 tournois', target: 10, coins: 600, rare: true, value: st('tournamentWins') },
  { id: 'tournoi-50', icon: '🎡', name: 'Tournée des grands ducs', description: 'Terminer 50 tournois', target: 50, coins: 300, rare: true, value: st('tournaments') },
  { id: 'cagnotte-25', icon: '🏦', name: 'La banque, c’est moi', description: 'Remporter 25 cagnottes', target: 25, coins: 300, rare: true, value: st('potsWon') },
  // --- Secrets ---
  { id: 'secret-triple', icon: '🎰', name: 'Jackpot', description: 'Faire trois 4-2-1 dans la même partie', target: 1, coins: 60, secret: true, value: st('triple421') },
  { id: 'secret-nenette', icon: '🙈', name: 'Abonné à la nénette', description: 'Faire trois nénettes dans la même partie', target: 1, coins: 30, secret: true, value: st('nenettes3') },
  { id: 'secret-minuit', icon: '🌙', name: 'Dernière tournée', description: 'Finir une partie entre minuit et une heure du matin', target: 1, coins: 20, secret: true, value: st('midnight') },
  { id: 'secret-phenix', icon: '🔥', name: 'Revenu de l’enfer', description: 'Gagner après avoir eu 15 jetons ou plus', target: 1, coins: 80, secret: true, value: st('bigComebacks') },
  { id: 'secret-brillant', icon: '✨', name: 'Ça brille !', description: 'Trouver un dé brillant dans un sac', target: 1, coins: 50, secret: true, value: (a) => (a.owned ?? []).filter((id) => id.endsWith('-brillant')).length },
  { id: 'secret-legende', icon: '🐉', name: 'Ça, c’est une légende', description: 'Posséder un dé légendaire', target: 1, coins: 40, secret: true, value: (a) => (a.owned ?? []).filter((id) => ['dc-perron', 'dc-dragon', 'dc-aurore'].includes(id.replace('-brillant', ''))).length },
  { id: 'patron-10', icon: '🥊', name: 'Terreur des patrons', description: 'Battre 10 patrons de la semaine', target: 10, coins: 400, rare: true, value: st('bossWins') },
];

/** Succès débloqués par la situation actuelle et pas encore enregistrés. */
export function newlyUnlocked(input: AchievementInput, unlocked: Record<string, number>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.value(input) >= a.target);
}
