/**
 * Journal des nouveautés affiché aux joueurs (écran « Nouveautés »).
 * À CHAQUE MISE À JOUR : ajouter une entrée EN TÊTE avec la version, la date et l'heure de publication
 * (heure de Bruxelles) et les changements visibles par les joueurs. Ne jamais y mettre les outils
 * réservés aux administrateurs.
 */
export interface ChangelogEntry { version: string; date: string; title: string; items: string[] }

export const CHANGELOG: ChangelogEntry[] = [
  { version: '0.43', date: '2026-11-07T00:50:00+01:00', title: 'Revenir à sa table', items: [
    'Vous avez quitté une partie en ligne en cours ? Elle vous attend : « Reprendre la partie » sur l’accueil vous ramène à votre place, tant que la partie n’est pas finie. Seul contre l’ordinateur, la table reste en pause 10 minutes.',
    'Coups Fourrés à 3 ou 4 : quitter ne vous élimine plus pour de bon. Le serveur joue pour vous et « Reprendre » dans le menu vous ramène à la table. En duel, quitter compte toujours comme une défaite (c’est maintenant écrit avant de confirmer).',
    'Coups Fourrés : le bandeau « Partie en cours · Reprendre » ne s’affiche plus après une partie terminée.',
  ] },
  { version: '0.42', date: '2026-11-06T18:55:00+01:00', title: 'Correction : Le dé sous la table', items: [
    'Coups Fourrés : en duel, « Le dé sous la table » montrait vos propres dés au moment de choisir lequel relancer, alors que c’est bien un dé de l’adversaire qui est relancé. Ce sont maintenant ses dés qui s’affichent, avec la question « Quel dé de … relancer ? ».',
  ] },
  { version: '0.41', date: '2026-11-06T17:15:00+01:00', title: 'Coups Fourrés : chaque Tournée compte', items: [
    'Les Tournées deviennent précieuses : 1 par manche (2 pour le perdant de la manche d’avant), 6 au plus en réserve. Jouer une carte est un vrai choix ; pour en jouer plusieurs, économisez.',
    'Les coûts des cartes sont refaits : beaucoup moins de cartes gratuites, la plupart coûtent maintenant 1 à 3 Tournées.',
    'Place aux combos : Tournée du patron (coûte 2, rend 3), Mise en bouche, Tant qu’on y est, Le Beau-frère… bien préparés, ils permettent d’enchaîner 3 ou 4 cartes dans la même manche.',
    'Le Leurre, Le Mouchard, Le Vide-poches et Fermeture ! font maintenant gagner (ou voler) des Tournées.',
    'Deux nouveaux conseils dans « Bien débuter » (économiser, enchaîner), et la partie guidée est mise à jour.',
  ] },
  { version: '0.40', date: '2026-11-06T12:50:00+01:00', title: 'Coups Fourrés : 50 cartes équilibrées', items: [
    'Coups Fourrés passe à 50 cartes : 8 nouvelles (Le Pourboire, Le Coup de l’étrier, Le Fanfaron, Le Verre de trop, Le Courant d’air, Le Pot aux roses, Le Complice, L’Engrenage), et un grand rééquilibrage testé sur des dizaines de milliers de parties : les quatre familles et les deux decks de départ gagnent maintenant autant les uns que les autres.',
    'Nouvelle règle de deck : 2 familles au plus et une seule légendaire. Si l’un de vos decks ne la respecte plus, il vous dit quelles cartes retirer.',
    'Cadeau : un booster offert à ceux qui avaient déjà ouvert leurs 3 boosters de bienvenue. Les boosters pas encore ouverts peuvent contenir les nouvelles cartes.',
    'Les mots techniques des cartes (Tournée, Habitué, Riposte, nénette…) sont en couleur : touchez-les pour une explication.',
    'Le coût des cartes s’affiche dans un petit verre, pour ne plus le confondre avec les jetons.',
    'Croche-patte : on voit maintenant le dé relancé dans le bac. L’énigme du jour change.',
  ] },
  { version: '0.39', date: '2026-11-06T03:05:00+01:00', title: 'Coups Fourrés repensé', items: [
    'Coups Fourrés repart à zéro : les cartes ont été revues et rééquilibrées, 8 nouvelles cartes arrivent (42 en tout). Les collections sont remises à zéro : à votre prochaine visite du mode, 2 nouveaux decks de départ et 3 boosters vous attendent. Vos capsules, votre ligue et vos titres sont conservés.',
    'Un écran de partie sobre, jusqu’à 4 joueurs : une case par adversaire (jetons, Tournées, cartes, pièges, Habitués), et toutes ses informations en clair en touchant sa case. Sous chaque carte de votre main, ce qu’elle fait.',
    'Les Habitués restent 3 manches puis rentrent chez eux. Plus d’ardoise ni de limite de cartes en main. Riposte et Dernier mot : 15 secondes pour réfléchir quand vous avez une carte à jouer, aucune attente sinon.',
    'Nouveau : la commande du comptoir, une règle bonus à chaque manche (brelans +2, un lancer de plus…), la même pour tous.',
    'Nouveau : l’énigme du jour, une situation à résoudre sans hasard, avec son classement et un partage sans dévoiler la solution.',
    'Pour apprendre : un parcours débutant (un type de carte en plus à chaque partie), une partie guidée à 4 joueurs et une visite guidée de l’écran. Parties à 3 ou 4 contre l’ordinateur, vitesse ×2, et la manche résumée en 3 lignes aux comptes.',
    'À 3 ou 4 joueurs : 9 jetons chacun, et la partie s’arrête dès que quelqu’un s’est déchargé.',
    '421 classique : une fois sorti ou gagnant, empochez votre récompense et quittez la table, ou restez regarder la fin.',
    'Corrections : l’écran vide du spectateur en Coups Fourrés, le tchat aux tables de tournoi, et un bouton bien visible pour créer ou rejoindre un tournoi perso.',
  ] },
  { version: '0.38', date: '2026-11-05T19:20:00+01:00', title: 'Coups Fourrés plus fluide', items: [
    'Un sélecteur « 421 / Coups Fourrés » en haut de l’accueil, au même endroit dans les deux modes, pour passer de l’un à l’autre d’un geste.',
    'Coups Fourrés : plateau épuré (moins de textes en même temps) et enchaînements sans temps mort après chaque décision.',
    'Coups Fourrés : les dés choisis pour la relance restent sélectionnés, comme dans le 421 classique.',
    'Coups Fourrés : les jetons changent de pile dès qu’ils arrivent, pendant les comptes de la manche.',
    'Coups Fourrés : 3 Habitués au plus devant soi, et jamais deux fois le même.',
    'Coups Fourrés a maintenant ses pages de présentation, de règles et de cartes, pour le faire découvrir.',
  ] },
  { version: '0.37', date: '2026-11-05T16:15:00+01:00', title: 'Coups Fourrés : un plateau bien plus clair', items: [
    'Nouvel écran de partie : une frise montre où en est la manche, un bandeau dit quoi faire, et les cartes jouables brillent avec la raison (« 6 → 1 : 4-2-1 ! »).',
    'Chaque coup de l’adversaire est annoncé en grand et lisible : carte jouée, piège posé face cachée (avec les pièges possibles), piège déclenché et ce qu’il a fait.',
    'Touchez une carte pour la voir en grand et savoir ce qu’elle ferait maintenant. Les 5 types (Coup, Piège, Riposte, Dernier mot, Habitué) ont chacun leur icône et leur couleur.',
    'Partie guidée de 3 minutes pour apprendre à jouer (20 capsules la première fois avec un compte), journal de la manche, aide « ? » et partage de vos plus beaux coups.',
  ] },
  { version: '0.36', date: '2026-11-05T15:35:00+01:00', title: 'Partie rapide et tournoi du samedi', items: [
    'Partie rapide : un bouton sur l’accueil vous place tout de suite à une table. Si personne n’arrive, l’ordinateur complète la table (sans mise ni classement), et un vrai joueur qui arrive prend sa place.',
    'Défi du jour à partager : une petite grille de votre résultat à envoyer à vos amis, sans dévoiler la solution.',
    'Coups Fourrés : tournoi gratuit chaque samedi (salon à 20 h 30), à élimination directe, avec des boosters à gagner.',
    'Coups Fourrés : section « Bien débuter » (règles illustrées, les 34 cartes, conseils de stratégie, lexique), tchat dans le salon des tables, réglages accessibles depuis le mode. Le mode passe en « Bêta » : un écran de partie plus clair arrive bientôt.',
    'La musique d’ambiance est retirée ; les bruitages restent.',
  ] },
  { version: '0.35', date: '2026-11-05T15:05:00+01:00', title: 'Nouveau mode : Coups Fourrés', items: [
    'Coups Fourrés, le 421 aux cartes : un vrai jeu de stratégie et de fouine, avec 34 cartes illustrées en quatre familles (Habitués, Ivresse, Pièges, Chaînes). Touchez la tuile « Coups Fourrés » sur l’accueil.',
    'Construisez vos decks de 20 cartes, ouvrez des boosters et complétez votre collection. À la découverte du mode : 2 decks de départ et 3 boosters offerts.',
    'Une monnaie propre au mode, les capsules, gagnée en jouant : victoires, missions du jour, première victoire du jour.',
    'Contre l’ordinateur (3 niveaux), entre amis (défis, tables de 2 à 4 joueurs) et en parties classées, avec sa propre ligue mensuelle du Comptoir au Grand Café.',
    'Vos amis voient quand vous êtes dans Coups Fourrés, et vous pouvez regarder leurs parties.',
  ] },
  { version: '0.34', date: '2026-11-05T11:00:00+01:00', title: 'Un comptoir bien tenu', items: [
    'Signaler un joueur depuis son profil, ou un message avec le bouton « ⋯ » (messages privés, tchat de table, de salon et de club) : choisissez la raison, ajoutez un commentaire si vous le souhaitez.',
    'Une équipe de modération traite les signalements. Si une sanction est prise, vous en êtes remercié par une notification.',
    'Discord : une pastille vous rappelle le sac de dés à récupérer en rejoignant le serveur.',
    'Les nouveautés et les tournois de 11 h et 21 h sont annoncés sur le Discord du jeu.',
  ] },
  { version: '0.33', date: '2026-11-05T09:40:00+01:00', title: 'Le comptoir sur Discord', items: [
    'Le jeu a son serveur Discord : menu « Plus » → « Discord du jeu ». Discutez, trouvez des partenaires, suivez les tournois et proposez vos idées.',
    'Un sac de dés offert aux joueurs avec un compte qui rejoignent le Discord, une fois la vérification faite (une fois par compte).',
  ] },
  { version: '0.32', date: '2026-11-05T08:50:00+01:00', title: 'Dés de collection et 4-2-1 en fête', items: [
    'Tous les dés de collection refaits, communs compris : chaque dé a sa matière en relief (écailles, métal gravé, nébuleuse, lave, résine…). Plus le dé est rare, plus il brille et scintille.',
    'Les versions brillantes ont un reflet irisé et des étincelles.',
    'Traînées plus belles : un ruban derrière chaque dé, avec flammes, étoiles, bulles ou confettis selon l’effet.',
    'Les 6 célébrations du 4-2-1 se jouent dans le bac : onde dorée, confettis, ballons, éclair, pluie de pièces et feu d’artifice.',
    'Collection : un bouton « Essayer dans le bac » pour tester vos effets.',
    'Accueil plus clair : le jeu en ligne mis en avant, une rangée « Événements » et vos récompenses sur une étagère.',
    'En partie : des cartes de joueurs plus aérées et un panneau en bas qui montre qui joue, les lancers restants et ce qu’il faut faire.',
    'Nouveaux guides : stratégie du 421, jeux de dés, jeux entre amis à distance, jeu multijoueur sur navigateur.',
  ] },
  { version: '0.31', date: '2026-11-04T23:25:00+01:00', title: 'Plus rapide, plus clair', items: [
    'Le jeu s’ouvre beaucoup plus vite, surtout sur téléphone.',
    'Tous les écrans refaits dans le style du nouvel accueil : jouer en ligne, partie solo, profil, réglages, classement, amis, messages, club, défis, pass…',
    'Profil en onglets (Stats, Succès, Parties), et un bouton « Tout récupérer » dans le pass.',
    'Alerte « À vous de jouer » : l’onglet clignote avec un petit son quand c’est votre tour et que le jeu est en arrière-plan (réglable).',
    'Les sacs de dés ont enfin l’air de sacs de dés.',
    'Le réglage du volume et de la musique ne se coupe plus dans le menu ni en partie.',
    'En partie, le bac ne passe plus d’horizontal à vertical en cours de jeu.',
  ] },
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
