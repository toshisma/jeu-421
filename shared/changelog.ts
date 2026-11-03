/**
 * Journal des nouveautés affiché aux joueurs (écran « Nouveautés »).
 * À CHAQUE MISE À JOUR : ajouter une entrée EN TÊTE avec la version, la date et l'heure de publication
 * (heure de Bruxelles) et les changements visibles par les joueurs. Ne jamais y mettre les outils
 * réservés aux administrateurs.
 */
export interface ChangelogEntry { version: string; date: string; title: string; items: string[] }

export const CHANGELOG: ChangelogEntry[] = [
  { version: '0.22', date: '2026-11-03T21:04:00+01:00', title: 'Les nouvelles du comptoir', items: [
    'Une petite ligne sur l’accueil raconte les beaux moments des joueurs : 4-2-1, dés légendaires, victoires contre le Patron.',
  ] },
  { version: '0.21', date: '2026-11-03T20:58:00+01:00', title: 'Coffre du soir', items: [
    'Chaque soir à partir de 19 h, un coffre gratuit à ouvrir sur l’accueil : des pièces, et parfois un sac de dés.',
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
