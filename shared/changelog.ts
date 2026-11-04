/**
 * Journal des nouveautés affiché aux joueurs (écran « Nouveautés »).
 * À CHAQUE MISE À JOUR : ajouter une entrée EN TÊTE avec la version, la date et l'heure de publication
 * (heure de Bruxelles) et les changements visibles par les joueurs. Ne jamais y mettre les outils
 * réservés aux administrateurs.
 */
export interface ChangelogEntry { version: string; date: string; title: string; items: string[] }

export const CHANGELOG: ChangelogEntry[] = [
  { version: '0.30', date: '2026-11-04T21:15:00+01:00', title: 'Grand rafraîchissement du comptoir', items: [
    'Nouvel accueil : votre bac en 3D en vitrine (touchez-le pour lancer), et tout ce qui compte visible d’un coup d’œil, sans faire défiler.',
    'Coffre, cadeau du jour, tournoi, patron, défi, missions et pass rassemblés dans « Aujourd’hui » ; ce qui est prêt brille en doré.',
    'Barre de navigation en bas (Accueil, Collection, Boutique, Classement) et menu « Plus » rangé par thème, avec une recherche.',
    'Dés gravés : les points sont de vrais creux, les arêtes sont arrondies, les ombres et la lampe du bar plus réalistes, et chaque matière brille à sa façon.',
    'Boutique : chaque décor, tapis et rebord se voit en vrai avant l’achat.',
    'Tournois tous les jours à 11 h et 21 h : inscription 10 pièces, à l’avance ou pendant les 5 minutes d’ouverture du salon. De 4 à 16 joueurs, jusqu’à 5 sacs de dés pour le vainqueur. Remboursé si moins de 4 joueurs.',
    'Messages privés entre amis : la bulle à côté des amis, en direct ou à votre prochaine connexion.',
    'Mode spectateur : regardez une partie en cours (salons, amis en partie, lien direct) et quittez quand vous voulez.',
    'Salon : la table vue du dessus, avec les joueurs assis autour.',
    'Contre l’ordinateur : une fois sorti, un bouton affiche directement le résultat de la partie.',
    'En partie, les dés gardent les couleurs du dernier joueur qui a lancé jusqu’au lancer suivant.',
    'Équilibrage : les succès rapportent moins de pièces, et le pass du mois demande plus de points (paliers de plus en plus longs).',
  ] },
  { version: '0.29', date: '2026-11-03T22:38:00+01:00', title: 'Correction', items: [
    'Le réglage du son et de la musique sur l’accueil ne sort plus de l’écran sur téléphone.',
  ] },
  { version: '0.28', date: '2026-11-03T22:25:00+01:00', title: 'Salons et cagnottes', items: [
    'Inviter ses amis directement depuis le salon.',
    'L’hôte peut exclure un joueur du salon.',
    'Un même compte ne peut plus apparaître deux fois dans un salon.',
    'Tables avec mise : la cagnotte est partagée entre tous les joueurs sauf le dernier, selon la place.',
    'Les dés du joueur précédent gardent leur apparence tant qu’ils sont sur le tapis.',
    'Les mains des tours précédents ne s’affichent plus sur les cartes des joueurs.',
  ] },
  { version: '0.27', date: '2026-11-03T21:21:00+01:00', title: 'Retour aux grands coups classiques', items: [
    'Seuls le 4-2-1 et les trois as ont leur mise en scène, comme avant.',
  ] },
  { version: '0.26', date: '2026-11-03T21:17:00+01:00', title: 'Son et musique à portée de main', items: [
    'Boutons son et musique sur l’accueil et pendant les parties.',
  ] },
  { version: '0.24', date: '2026-11-03T21:10:00+01:00', title: 'Musique d’ambiance', items: [
    'Trois morceaux lofi originaux en boucle, réglables de 0 à 100 % dans les réglages.',
  ] },
  { version: '0.23', date: '2026-11-03T21:07:00+01:00', title: 'Tchat de table et coffre du comptoir', items: [
    'Tchat dans les tables en ligne, avec un bouton pour le couper.',
    'Le coffre reste sur l’accueil avec un décompte : il se recharge 24 h après chaque ouverture.',
    'Une petite mélodie de trésor quand on ouvre le coffre.',
  ] },
  { version: '0.22', date: '2026-11-03T21:04:00+01:00', title: 'Les nouvelles du comptoir', items: [
    'Une petite ligne sur l’accueil raconte les beaux moments des joueurs : 4-2-1, dés légendaires, victoires contre le Patron.',
  ] },
  { version: '0.21', date: '2026-11-03T20:58:00+01:00', title: 'Coffre du soir', items: [
    'Un coffre gratuit à ouvrir sur l’accueil : des pièces, et parfois un sac de dés.',
  ] },
  { version: '0.19', date: '2026-11-03T20:03:00+01:00', title: 'Mon historique', items: [
    'Votre historique des dernières parties s’affiche sur votre propre profil.',
  ] },
  { version: '0.18', date: '2026-11-03T19:59:00+01:00', title: 'Nouveautés', items: [
    'Un écran « Nouveautés » pour suivre toutes les mises à jour du jeu.',
  ] },
  { version: '0.17', date: '2026-11-03T19:57:00+01:00', title: 'Parties en attente et historique', items: [
    'Les parties qui attendent des joueurs s’affichent tout en haut de l’accueil.',
    'Historique des dernières parties jouées sur le site, dans « Jouer en ligne ».',
  ] },
  { version: '0.16', date: '2026-11-03T19:19:00+01:00', title: 'Inviter ses amis à sa table', items: [
    'Historique des dernières parties sur chaque profil.',
    'Bouton « Inviter à jouer » sur le profil d’un ami : il reçoit un bandeau pour accepter ou refuser.',
    'Une petite bulle discrète quand un ami se connecte.',
  ] },
  { version: '0.15', date: '2026-11-03T18:52:00+01:00', title: 'Set légendaire « Feu et Glace »', items: [
    'Trois dés légendaires (Dragon de braise, Dragon de givre, Loup du Grand Nord) offerts quand 5 amis invités ont joué 3 parties.',
  ] },
  { version: '0.14', date: '2026-11-03T18:34:00+01:00', title: 'Amis en ligne', items: [
    'Bouton Amis à côté de la cloche, avec le nombre d’amis en ligne.',
    'Activation des notifications sur téléphone plus visible.',
  ] },
  { version: '0.12', date: '2026-11-03T18:25:00+01:00', title: 'Écran Amis', items: [
    'Écran Amis : qui est en ligne, en partie, ou vu il y a combien de temps.',
    'Rejoindre la table d’un ami en un clic.',
    'Bouton « Ajouter en ami » bien visible sur les profils.',
  ] },
  { version: '0.11', date: '2026-11-03T16:21:00+01:00', title: 'Ouverture de sac épique', items: [
    'Roulement de tambour, montée de tension, flash, étincelles et fanfare selon la rareté du dé.',
  ] },
  { version: '0.10', date: '2026-11-03T09:07:00+01:00', title: 'Bon retour !', items: [
    'Un sac de dés offert quand on revient après 3 jours d’absence.',
    'Partage du lien de parrainage après une victoire.',
  ] },
  { version: '0.9', date: '2026-11-03T08:56:00+01:00', title: 'Parrainage', items: [
    'Invitez un ami : un sac de dés quand il a joué 10 parties (jusqu’à 3 sacs).',
  ] },
  { version: '0.8', date: '2026-11-03T08:44:00+01:00', title: 'Pages de règles', items: [
    'Pages « Règles du 421 » et « Combinaisons » consultables hors du jeu.',
  ] },
  { version: '0.7', date: '2026-11-03T08:00:00+01:00', title: 'Corrections', items: [
    'Barrage entre les meilleurs joueurs à égalité pour savoir qui donne.',
    'Petits dés de nouveau visibles sur les téléphones en mode sombre forcé.',
  ] },
  { version: '0.6', date: '2026-11-03T00:54:00+01:00', title: 'La grosse mise à jour', items: [
    'Effets de lancer, séries de dés, saisons classées.',
    'Demandes d’amis, défis entre amis, notifications.',
    'Happy hour et succès secrets.',
  ] },
  { version: '0.5', date: '2026-11-02T23:56:00+01:00', title: 'Mobile', items: [
    'Affichage amélioré sur téléphone et défilement au doigt.',
  ] },
  { version: '0.4', date: '2026-11-02T23:34:00+01:00', title: 'Collection de dés', items: [
    'Collection de dés à raretés, sacs à ouvrir et vitrine.',
    'Correction du changement de photo de profil et de la récompense du patron.',
  ] },
  { version: '0.3', date: '2026-11-02T21:43:00+01:00', title: 'Statistiques et boutons de connexion', items: [
    'Statistiques des joueurs, boutons de connexion et de création de compte plus visibles.',
  ] },
];
export const CURRENT_VERSION = CHANGELOG[0].version;
