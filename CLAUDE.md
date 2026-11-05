# Mémo du projet — 421 en ligne

Jeu de dés 421 (le jeu de bistrot), en ligne sur https://421online.com. Auteur : Sam (pseudo admin dans `ADMIN_USERS`).
Tout le texte du jeu est **en français** (vouvoiement côté joueurs). Réponds à Sam en français, simplement : il n'est pas développeur.

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
| Accueil (vitrine 3D, tuiles « Aujourd'hui », barre du bas, menu « Plus ») | `client/src/ui/Home.tsx` (l'ancien `Home` de `Screens.tsx` n'est plus utilisé) |
| Réglages, bac d'essai, config solo | `client/src/ui/Screens.tsx` |
| Messages privés entre amis | `server/messages.ts`, `client/src/messages.ts`, `client/src/ui/Messages.tsx` |
| Mode spectateur | `client/src/ui/SpectateFlow.tsx`, `server/app.ts` (`spectate:*`) |
| Admin : commandes (suspension, pièces, objets) et tableau de bord (visiteurs, pays, temps passé, rétention) | `server/admin.ts`, `client/src/ui/AdminDashboard.tsx`, `client/src/visit.ts`, `shared/geo.ts` |
| Vignettes 3D de la boutique | `client/src/three/shopThumbs.ts` |
| Écran de partie | `client/src/ui/GameScreen.tsx`, `PlayerCard.tsx`, `EndOverlay.tsx` |
| Bac 3D | `client/src/three/TrayScene.ts`, `client/src/ui/DiceTray.tsx` |
| Salon et partie en ligne | `client/src/ui/OnlineFlow.tsx`, `client/src/game/online.ts` |
| Amis, salons ouverts, historiques, fil d'actualité | `client/src/ui/Friends.tsx` |
| Collection et ouverture de sacs | `client/src/ui/DiceCollection.tsx` |
| Sons (synthétisés) — plus de musique d'ambiance (retirée à la demande de Sam) | `client/src/audio/sound.ts` |
| Styles (un seul fichier) | `client/src/styles.css` |
| Coups Fourrés (mode cartes) | `shared/cards/` (catalog = cartes et réglages, engine = règles, ai, botmatch = parties contre l'ordinateur rejouables, autodeck, progress, protocol), `server/cards.ts` (collection, decks, capsules, boosters, ligue, missions), `server/cards-online.ts` (en ligne, classé, présence), `client/src/cards/` (écrans, cartes, art.tsx = illustrations, local.ts / online.ts = contrôleurs) ; simulations : `npx tsx scripts/cf-simulate.ts --games 20000` ; tournoi du samedi `server/cf-tournament.ts`, stats admin `server/cf-stats.ts` |
| Pages SEO statiques | `scripts/build-seo.mjs` → `client/public/*.html` |

## Principes à respecter
- **Le serveur fait foi** pour les comptes : récompenses, sacs, mises et défis sont recalculés côté serveur. Les invités ont un profil local (`localStorage` `421.profil`).
- **Gains volontairement bas** (Sam les a réduits trois fois : succès divisés par 4 en 0.30, pass à paliers croissants ≈ 10 700 points). Ne pas les gonfler sans qu'il le demande.
- **Mises en scène** : seuls le 4-2-1 et les trois as ont le ralenti / gros plan. Sam a refusé l'extension aux brelans.
- **Sacs de dés et boosters = pur hasard** (Sam ne veut pas de rare garantie).
- **Coups Fourrés** : mode à part (sa monnaie « capsules », sa ligue, ses decks) mais mêmes fonctions communes (messages, amis, notifications, réglages). On dit « deck », jamais « paquet ». Duel à 11 jetons (choix de Sam). Tout changement de carte doit rester logique et équilibré : relancer les simulations.
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
