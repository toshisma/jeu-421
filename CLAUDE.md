# Mémo du projet — 421 en ligne

Jeu de dés 421 (le jeu de bistrot), en ligne sur https://421online.com. Auteur : Sam (pseudo admin dans `ADMIN_USERS`).
Le jeu existe en **français (référence, vouvoiement), anglais, allemand, néerlandais** (0.52 : mode d’emploi en tête de `shared/i18n/index.ts`, textes dans `shared/i18n/zones/` ; tout nouveau texte visible doit être ajouté dans les 4 langues). Réponds à Sam en français, simplement : il n'est pas développeur.

## Pile technique
- Client : Vite + React + TypeScript, rendu 3D Three.js, physique des dés cannon-es (simulée puis rejouée).
- Serveur : Express + Socket.IO, base `node:sqlite` (fichier `DATABASE_PATH`, sinon `data/421.sqlite`).
- Code partagé client/serveur dans `shared/` (moteur de règles, progression, catalogue).
- Applis mobiles Capacitor (`android/`, `ios/`) : pas utilisées pour l'instant.

## Où se trouve quoi
| Sujet | Fichiers |
|---|---|
| Règles, déroulé d'une partie, barrages | `shared/engine.ts`, `shared/config.ts`, `shared/combos.ts` |
| IA des ordinateurs | `shared/ai.ts` |
| Profil, XP, pièces, récompenses, sacs, parrainage, coffre | `shared/progress/profile.ts` |
| Catalogue boutique (dés, tapis, accessoires) | `shared/progress/catalog.ts` |
| Collection de dés, raretés, effets, séries, dés de saison, set « Feu et Glace » | `shared/progress/dice-collection.ts` |
| Événements annuels, happy hour | `shared/progress/events.ts` |
| Quêtes du jour, succès, Patron de la semaine | `quests.ts`, `achievements.ts`, `boss.ts` |
| Saisons classées / divisions | `shared/season.ts` |
| Journal « Nouveautés » | `shared/changelog.ts` |
| Serveur de jeu (salons, parties en ligne, tournois, tchat, exclusion, cagnottes) | `server/app.ts` |
| Comptes, profils, solo, amis, parrainage, invitations, présence, fil d'actualité | `server/accounts.ts` |
| Demandes d'amis, défis entre amis, notifications push | `server/social.ts` |
| Tournois programmés 11h / 21h (inscription 10 pièces, sacs de dés, remboursements) | `shared/scheduled.ts`, `server/scheduled.ts`, `client/src/ui/Scheduled.tsx` ; essais : `SCHED_TEST_NOW=<date ISO>` et `SCHED_TEST_QUICK=1` (ignorés en production) |
| Statistiques publiques et admin, alertes admin | `server/stats.ts` |
| Base de données (tables, requêtes) | `server/db.ts` |
| Navigation entre écrans | `client/src/App.tsx` |
| Menu principal (0.47 : profil + pièces, vitrine 3D, 3 jeux, sacs de dés et collection en vue, étagère Cadeau/Coffre/Défis/Pass, barre du bas Accueil · Amis · Collection · Boutique · Plus) | `client/src/ui/Home.tsx` ; menu du 421 : `client/src/ui/ClassicMenu.tsx` ; menus de mode réduits à ce qui les concerne, bouton « ← Menu » ; 0.48 : barre du bas commune à TOUS les écrans (compacte pendant les parties, quitter = même confirmation que Quitter, `client/src/ui/navGuard.ts`) |
| Réglages, bac d'essai, config solo | `client/src/ui/Screens.tsx` |
| Messages privés entre amis | `server/messages.ts`, `client/src/messages.ts`, `client/src/ui/Messages.tsx` |
| Mode spectateur | `client/src/ui/SpectateFlow.tsx`, `server/app.ts` (`spectate:*`) |
| Admin : commandes (suspension, pièces, objets) et tableau de bord (visiteurs, pays, temps passé, rétention ; onglet « En ligne » en direct, admins seulement : `server/live.ts`, `client/src/ui/AdminLive.tsx`, présence détaillée `client/src/presence.ts`) | `server/admin.ts`, `client/src/ui/AdminDashboard.tsx`, `client/src/visit.ts`, `shared/geo.ts` |
| Vignettes 3D de la boutique | `client/src/three/shopThumbs.ts` |
| Écran de partie | `client/src/ui/GameScreen.tsx`, `PlayerCard.tsx`, `EndOverlay.tsx` |
| Bac 3D | `client/src/three/TrayScene.ts`, `client/src/ui/DiceTray.tsx` |
| Salon et partie en ligne | `client/src/ui/OnlineFlow.tsx`, `client/src/game/online.ts` |
| Amis, salons ouverts, historiques, fil d'actualité | `client/src/ui/Friends.tsx` |
| Collection et ouverture de sacs | `client/src/ui/DiceCollection.tsx` |
| Sons (synthétisés) — plus de musique d'ambiance (retirée à la demande de Sam) | `client/src/audio/sound.ts` |
| Styles (un seul fichier) | `client/src/styles.css` |
| Coups Fourrés (mode cartes) | `shared/cards/` (catalog = cartes et réglages, engine = règles, ai, botmatch = parties contre l'ordinateur rejouables, autodeck, progress, protocol), `server/cards.ts` (collection, decks, capsules, boosters, ligue, missions), `server/cards-online.ts` (en ligne, classé, présence), `client/src/cards/` (écrans, cartes, art.tsx = illustrations, local.ts / online.ts = contrôleurs, CfGame + BoardParts = écran de partie sobre, effects.ts = effets en cours et texte court de chaque carte, tour.ts = visite guidée de l'écran) ; parcours débutant `shared/cards/parcours.ts` ; énigme du jour `shared/cards/puzzles.ts` + `server/cf-enigme.ts` ; commandes du comptoir dans `engine.ts` (COMMANDES) ; simulations : `npx tsx scripts/cf-simulate.ts --games 20000` ; tournoi du samedi `server/cf-tournament.ts`, stats admin `server/cf-stats.ts` |
| Le Courtisan (Dix mille / Farkle, 6 dés) | `shared/dixmille/` (moteur, IA, récompenses, protocole), `client/src/dixmille/` (écrans), `server/dixmille-online.ts` (en ligne 2 à 6, Groschen : cadeau 20/jour serveur, mises, pot, remboursements), lien direct `/?mode=courtisan` ; simulation `npx tsx scripts/dixmille-simulate.ts` ; pages d'aide `scripts/seo-courtisan-pages.mjs` (dont page KCD2 descriptive avec mention d'indépendance : pas d'image, de texte ni de noms du jeu vidéo) |
| Pages SEO statiques | `scripts/build-seo.mjs` → `client/public/*.html` ; pages « une intention = une page » (amis, jeux de dés, bistrot, Farkle, apéro) : `scripts/seo-growth-pages.mjs` |

## Principes à respecter
- **Le serveur fait foi** pour les comptes : récompenses, sacs, mises et défis sont recalculés côté serveur. Les invités ont un profil local (`localStorage` `421.profil`).
- **Pièces = monnaie générale** (cosmétiques) et **sacs de dés** gagnables dans les 3 jeux, calculés par le serveur, barème et rythme du 421 (compteur de sac garanti commun).
- **Comptes** (0.49) : fenêtre « Créez un compte » après chaque partie pour les invités (`client/src/ui/GuestInvite.tsx`, pas deux fois en moins de 2 min, fermée par le joueur : croix / Plus tard / Échap) ; nouveau compte = 3 sacs de dés + 3 boosters CF ; la reprise du profil invité à l'inscription est plafonnée (300 pièces, niveau 10, pas de titres/prestige/pass).
- **Gains volontairement bas** (Sam les a réduits trois fois : succès divisés par 4 en 0.30, pass à paliers croissants ≈ 10 700 points). Ne pas les gonfler sans qu'il le demande.
- **Mises en scène** : seuls le 4-2-1 et les trois as ont le ralenti / gros plan. Sam a refusé l'extension aux brelans.
- **Sacs de dés et boosters = pur hasard** (Sam ne veut pas de rare garantie).
- **Coups Fourrés** : mode à part (sa monnaie « capsules », sa ligue, ses decks) mais mêmes fonctions communes (messages, amis, notifications, réglages). On dit « deck », jamais « paquet ». Duel à 11 jetons, 9 à 3-4 joueurs et la partie s'arrête au premier déchargé (choix de Sam). Habitués : 3 manches puis défaussés. Pas d'ardoise ni de limite de main. Riposte / Dernier mot : 15 s seulement si on a une carte jouable. Les 5 types de cartes sont gardés (Sam). Écran de partie sobre, détails au toucher. Tout changement de carte doit rester logique et équilibré : relancer les simulations. Refonte 0.39 : collections remises à zéro une fois (sauvegarde dans les tables `cf_*_backup_v2`). 0.40 : 50 cartes, règle de deck « 2 familles au plus, une seule légendaire » (`DECK_RULES` dans catalog.ts, simulation `--maxFamilies 2`), booster offert une fois (meta `cf:gift:v40`), mots techniques touchables (`client/src/cards/Gloss.tsx`), coût affiché dans un petit verre (Tournées ≠ jetons). 0.41 : économie serrée, 1 Tournée par manche (+1 au perdant, 6 max), coûts surtout 1–3, combos possibles (simulation : cartes payantes par manche, manches à 2+/3+/4+). 0.46 : 90 cartes (10 de plus par famille), 3 pièges au plus DEVANT un joueur (et 3 posés par joueur), choix du deck avant toute partie (`client/src/cards/DeckPicker.tsx`), loupe sur toutes les cartes (`zoom.tsx`) ; cibles d'équilibre de Sam : 47–53 % (decks de départ, familles, paires avec les Pièges).
- **Le Courtisan** : premier à l'objectif en encaissant = victoire immédiate (pas de dernier tour, choix de Sam). Groschen = monnaie du mode, comptes seulement, jamais de solde/résultat venant du client ; quitter une partie avec mise = mise perdue. Le Courtisan a son menu (sacs de dés gagnés côté serveur, rythme ≤ 421, statistiques) et ses parties comptent pour les défis du jour.
- **Pas de licence protégée** (Game of Thrones, etc.) : noms et visuels originaux uniquement.
- **Lisibilité des dés** : un test vérifie le contraste points/dé (≥ 4). Tout nouveau dé doit le passer.
- **Mobile d'abord** : vérifier à 360 px de large, sans débordement horizontal. L'accueil doit tenir sans défiler (360×640 compris).
- **Ne jamais retirer une fonctionnalité** en refaisant un écran (Sam y tient) : la ranger ailleurs et le dire.
- **La 3D est l'identité du jeu** : la garder et l'améliorer, ne pas la remplacer par du plat.
- **Nouveautés** : à chaque mise à jour publiée, ajouter une entrée EN TÊTE de `shared/changelog.ts` (version suivante, date et heure de Bruxelles, changements visibles des joueurs). Jamais les outils admin.
- Ne jamais créer de compte, saisir de mot de passe ou de paiement à la place de Sam.

## Vérifier et publier
```bash
npx tsc --noEmit -p .        # types
npx vitest run               # tests (environ 120, ~80 s)
npm run build && npm run build:standalone
```
Publication : commit sur `main` du dépôt GitHub `toshisma/jeu-421` → Render redéploie tout seul (5 à 10 min).
Messages de commit : `421-0.X : description`, auteur `Claude <noreply@anthropic.com>`.
Si des joueurs sont en ligne, demander à Sam avant de publier.

Serveur local de test : `PORT=3001 DATABASE_PATH=/tmp/x.sqlite MIN_SOLO_MS=0 npm start`.
Captures mobiles : scripts `puppeteer-core` dans `scripts/` (Chrome : `/usr/bin/google-chrome`).

## Hébergement
- Render (service web, déploiement auto depuis `main`). Variables : `ADMIN_USERS`, `DATABASE_PATH` (disque persistant), clés VAPID (sinon générées et gardées en base).
- Domaine 421online.com chez OVH (pas d'enregistrement AAAA : il cassait le site). Search Console validé, sitemap à `/sitemap.xml`.
- Le site est classé à tort « Pornography » par certains filtres (écoles) : reclassification demandée via FortiGuard & co.

## Idées validées pour la suite
- **Tournée des comptoirs** : carrière de bistrots (solo + réputation en multi), étoiles, règles maison.
- Charge rapide, mode spectateur, alerte d'onglet « À toi de jouer » (faits). Pas de musique : Sam l'a fait retirer.

## État au 9 novembre 2026 (reprise dans une nouvelle conversation)
Dernière version publiée : **0.52** (tout le jeu et les pages d’aide en 4 langues, choix dans les Réglages, sinon langue du navigateur en/de/nl, sinon français) ; 0.51 (référencement renforcé ; 0.50 : corrections des triches, parties en ligne, petits défauts). Rapport d'inspection du 6/11 : https://claude.ai/artifact/FYnn23Wm4AkVZRDc1m3tyd (maquettes : https://claude.ai/artifact/2XXM8TngZ4mazyeyTBpUZt).

### Limites connues après la 0.52
- Restent en français : tableau de bord admin, mots dessinés dans les illustrations CF, page Confidentialité, quelques liens vers des guides. Traductions de/nl à relire par un locuteur natif (noms de cartes surtout).
- Test « éclats » (cf-server) instable au hasard.
- Solo 421 et Courtisan contre l'ordinateur : victoire, place et jetons restent annoncés par le téléphone (combinaisons plafonnées, patron vérifié au départ, plus rien dans le fil d'actualité). Seul un rejeu serveur réglerait le fond.
- Jour officiel = Bruxelles pour tout le monde (`today()`), le serveur ignore X-Day.
- Exclusion d'un invité contournable en vidant les données du navigateur ; transfert de pièces possible par comptes en série et mises perdues exprès ; chrono CF en ligne : jusqu'à 20 s gagnables par un client trafiqué (`cf:ready`).
- À 360×640 et 4 joueurs, dés ≈ 20 px (revoir la caméra du bac) ; le bouton couvre encore une partie du bac du menu 421.

### Coups Fourrés : points en suspens
- Decks d'une seule famille (mono Chaînes / mono Pièges) ≈ 57 % en simulation ; duel ≈ 6,4 min (sous 7–9, seul levier = plus de jetons, refusé par Sam).
- Choix à faire par Sam (non tranchés) : Le dé sous la table / Tournée générale relancent votre propre dé si personne n'a fini (garder ou « en second » seulement ?) ; Le grand enchaînement peut rejouer un Coup annulé ; Leurre annulé à la pose ne rapporte rien ; « Tant qu'on y est » ne compte que vos cartes ; tutoiement des ordinateurs du 421 et de « Tu paies ta tournée ! ».
- Les anciens joueurs gardent l'ancienne version des decks de départ (pas de bouton « mettre à jour »).

### Le Courtisan : points en suspens
- 20 Groschen au départ seulement (bonus de bienvenue 100 proposé, pas validé) ; les ordinateurs « Débutant » permettent de gagner des Groschen facilement ; succès propres au Courtisan proposés, pas faits.

### Idées proposées à Sam, pas faites
Statistiques admin par carte (taux de jeu / de victoire réels), bouton « mettre à jour mes decks de départ », mode draft « Tirage au comptoir », défis de combo, partage de deck par code, Tournée des comptoirs. Sam a refusé les idées « tech » (secouer le téléphone, vidéo du 4-2-1, réalité augmentée…).

### Méthode de travail qui a bien marché
- Gros chantiers : un agent par chantier dans un worktree `/home/claude/wt-<nom>` (branche dédiée, `node_modules` copié), puis fusion dans `main`, `npx tsc`, `npx vitest run`, les deux builds, entrée Nouveautés, push. Vérifier régulièrement que l'agent avance (un agent est déjà resté bloqué 1 h 20 sans prévenir) et relancer.
- Le hook d'arrêt demande de pousser : pousser `main` = publier. Sans accord de Sam, sauvegarder seulement sur une branche `wip-…`.
- Tests parfois instables sous charge (cf-online, cf-tournament, collection, éclats CF) : les relancer seuls. Attention aux pseudos en double entre tests d'un même fichier (409).
- Scripts navigateur : dans `scripts/tmp-*.mjs` (supprimés à la fin), serveur local sur un port libre, jamais `pkill -f` (tuer par PID).
