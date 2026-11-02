# 🎲 421 — jeu de dés en ligne, bac 3D physique

Jeu de 421 jouable dans le navigateur : bac à dés rendu en 3D (Three.js), dés réellement simulés
(cannon-es), mode solo contre 1 à 5 adversaires IA, multijoueur en ligne de 2 à 6 joueurs avec
serveur faisant autorité (Node.js + Socket.IO).

---

## 1. Démarrage rapide

Prérequis : **Node.js 20 ou plus récent** (testé avec Node 22) et npm.

```bash
npm install
npm run dev
```

- Client (Vite) : http://localhost:5173 — c'est l'adresse à ouvrir.
- Serveur de jeu : http://localhost:3001 (le client de développement y est relié automatiquement).

Pour jouer à plusieurs sur le même réseau local, ouvrez `http://<IP-de-votre-machine>:5173`
depuis les autres appareils (Vite écoute sur localhost par défaut : lancez `npm run dev:client -- --host`).

### Version de production (un seul processus)

```bash
npm run build      # compile le client dans dist/client
npm start          # serveur + client sur http://localhost:3001 (variable PORT pour changer)
```

### Version autonome (un seul fichier HTML, sans serveur)

```bash
npm run build:standalone   # → dist/standalone/index.html
```

Ce fichier contient le **mode solo et le bac d'essai**. Le multijoueur n'y figure pas (il exige le
serveur) : la page l'indique clairement au lieu d'afficher un bouton inactif.

## 2. Application mobile

Il y a deux façons d'avoir le jeu sur téléphone, avec le multijoueur dans les deux cas. Le
**serveur doit être en ligne** (section 3), car c'est lui qui relie les joueurs.

### a) Application installable depuis le navigateur (immédiat, gratuit)
Une fois le jeu en ligne, ouvrez son adresse sur le téléphone :
- **Android (Chrome)** : bouton « 📲 Installer l'application » sur l'accueil ;
- **iPhone (Safari)** : *Partager → Sur l'écran d'accueil* (expliqué dans le jeu).

Le jeu obtient alors une icône, s'ouvre en plein écran et reste jouable **en solo hors connexion**.
Les invitations passent par le menu de partage du téléphone (SMS, WhatsApp…). Pendant une partie,
l'écran ne se met pas en veille.

### b) Applications Play Store / App Store (Capacitor)
Les projets natifs sont dans `android/` et `ios/`. Ils embarquent la même interface et se connectent
au serveur dont l'adresse est fixée au build :

```bash
VITE_SERVER_URL=https://votre-serveur.example npm run app:android   # ouvre Android Studio
VITE_SERVER_URL=https://votre-serveur.example npm run app:ios       # ouvre Xcode (Mac uniquement)
```

Ensuite, depuis Android Studio : *Build → Generate Signed App Bundle* ; depuis Xcode : *Product → Archive*.
Avant de publier :
- changez `appId` dans `capacitor.config.ts` : c'est l'identifiant définitif sur les stores ;
- il faut un compte **Google Play Console** (paiement unique) et un compte **Apple Developer**
  (abonnement annuel), plus une politique de confidentialité en ligne ;
- après `npm run app:build`, relancez `npm run build` avant de déployer le serveur web : le build
  « application » pointe vers l'adresse du serveur distant.

⚠️ Ces projets natifs ont été générés et synchronisés, mais **pas compilés** dans l'environnement de
développement (le SDK Android n'y était pas disponible). La compilation se fait sur votre machine.

## 2 quater. Son et vibrations

Les bruits de dés sont synthétisés à chaque collision simulée (`client/src/audio/synth.ts`) :
un coup sourd grave (le poids du dé), le corps de la matière touchée et un petit claquement
d'arête, puis une courte réverbération, un compresseur et un limiteur (pas de saturation).
Le son des chocs contre la paroi dépend du rebord choisi (bois, cuir, laque, acier). Avant le
lancer, on entend les dés secoués dans la main. Sur Android, le téléphone vibre brièvement aux
impacts forts (désactivable dans les Paramètres ; iOS ne permet pas la vibration depuis le web).

## 2 bis. Personnalisation et progression

- Chaque partie terminée rapporte de l'**XP** et des **pièces**. Les pièces dépendent du **nombre
  de joueurs** (le premier gagne au plus 6 pièces à 2 joueurs, 12 à 4, 18 à 6), de la **place finale**
  (le premier prend tout, le dernier rien, les autres entre les deux) et de la **durée réelle** de la
  partie (complète à partir de 15 minutes, proportionnelle en dessous), puis de la difficulté de
  l'IA ou du bonus en ligne (× 1,25). Chaque 4-2-1 rapporte 1 pièce (3 au plus). En solo avec un
  compte, la durée est mesurée par le serveur. Défis du jour, série de connexions, passe, ligues,
  clubs et parrainage rapportent environ trois fois moins qu'avant.
- La boutique propose 55 objets : 12 décors, 13 tapis (dont motifs), 11 rebords (dont marbre et or),
  6 **formes de plateau** (rectangle, octogone, hexagone, rond, ovale, stade) et 14 styles de dés.
- **42 succès**, dont 20 difficiles (des semaines ou des mois de jeu) ; défis du jour.
- Les pièces **ne s'achètent pas** avec de l'argent réel. Elles peuvent servir de **mise** aux tables
  et tournois qui en demandent (comptes uniquement, solde gardé sur le serveur).
- Réglages des gains : `shared/progress/profile.ts` (`REWARDS`). Catalogue : `shared/progress/catalog.ts`.

**Attention, si un jour les pièces deviennent payantes** : des mises en pièces achetables avec de
l'argent réel relèvent des jeux de hasard (en Belgique, licence de la Commission des jeux de hasard ;
règles des stores sur le « real-money gaming »). Tant que les pièces ne s'achètent pas, ce sont des
points de jeu.

## 2 quater bis. Pour donner envie de revenir

- **Partie guidée** (premier lancement) : une vraie partie contre Marcel, dés préparés, un guide
  explique la charge, le 4-2-1, la décharge et l'art de garder les bons dés. 50 pièces à la clé.
- **Série de connexions** : une récompense par jour, coffre au 7e jour.
- **Défi du jour** : 5 coups avec les mêmes dés pour tout le monde (suite tirée de la date) ; le
  serveur rejoue les décisions et calcule le score officiel ; un seul essai classé par jour,
  classement du jour.
- **Pass de saison** gratuit, mensuel : 20 paliers gagnés avec l'XP du mois (pièces, accessoire,
  tapis, dés et titre exclusifs).
- **Ligues hebdomadaires** (comptes) : groupes de 20 joueurs ; les 3 premiers montent et gagnent
  60 / 40 / 25 pièces, les 3 derniers descendent. Bronze → Argent → Or → Saphir → Rubis → Diamant.
- **Parrainage** : lien `?parrain=Pseudo` ; 75 pièces pour chacun quand le filleul a joué 3 parties.
- **Rivalités** : bilan contre chaque compte croisé en ligne, affiché sur son profil.
- **Titres** sous le pseudo (succès, pass, ligues) et **accessoires d'avatar**.
- **Événements liégeois** : Carnaval, 15 août en Outremeuse, Fêtes de Wallonie, Halloween,
  Saint-Nicolas, fêtes de fin d'année. Objets exclusifs en boutique pendant l'événement, pièces ×1,5
  (×2 le week-end). Premier week-end de chaque mois : pièces doublées.
- **Formats** : Classique, Blitz (10 s par décision), Mort subite (une manche).
- **À table** : lancer au gobelet (secoué puis versé), jetons qui volent vers le perdant, enseigne
  au néon sur les grands coups.
- **Signaler un problème** : lien en bas de l'accueil et dans les réglages (e-mail prérempli).

## 2 quater ter. Soirées, collection, clubs

- **Soirée entre amis** : sur un seul téléphone (chacun lance à son tour, écran « passez le
  téléphone »), ou **avec de vrais dés** : l'application arbitre (on indique ses trois dés et son
  nombre de lancers ; jetons, manches et barrages sont gérés comme en partie virtuelle ; annulation
  du dernier coup). Pas de récompense dans ce mode.
- **Phrases rapides** en partie (« Belle main ! », « Tu paies ta tournée ! »…) : liste fermée,
  vérifiée par le serveur, rien à modérer. Les ordinateurs répondent parfois.
- **Album des combinaisons** : 17 combinaisons sur 5 pages, chaque page complétée rapporte des
  pièces, l'album complet donne les dés « Collectionneur », un titre et 100 pièces (pages : 10 à 40 pièces).
- **Patron de la semaine** : un adversaire difficile avec sa particularité (gros enjeu sur le 4-2-1,
  deux lancers par tour, le moins de lancers gagne, 10 secondes par décision, trois contre un, partie éclair), qui change chaque
  lundi. Première victoire de la semaine : 25 pièces, un trophée, le titre « Tombeur de … ». Les patrons ne touchent jamais aux dés : seulement aux règles.
- **Clubs** (comptes) : 30 membres, fondation pour 100 pièces, coffre commun de la semaine
  (15 / 40 / 80 victoires du club : 15 / 40 / 80 pièces pour chaque membre qui a gagné au moins
  une partie), classement des clubs, discussion en phrases rapides.
- **Récap du mois** : parties, victoires, 4-2-1, meilleur coup, adversaire préféré, heure de jeu
  préférée (mois en cours et précédent). Pour soi, rien n'est partagé.
- **Prestige** au niveau 30 : le niveau repart à 1, on garde tout, étoile ★ visible des autres,
  60 pièces, et la boutique n'a plus de niveau requis.

## 2 ter. Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur (rechargement auto) + client Vite |
| `npm run build` | Build de production du client |
| `npm start` | Serveur de production (sert aussi le client buildé) |
| `npm run build:standalone` | Fichier HTML autonome (solo) |
| `npm run app:android` / `app:ios` | Build de l'application mobile et ouverture d'Android Studio / Xcode (`VITE_SERVER_URL` requis) |
| `npm test` | Tests automatiques (règles, IA, physique, multijoueur réseau réel) |
| `npm run typecheck` | Vérification TypeScript de tout le projet |
| `node scripts/check-app.mjs http://localhost:3001 captures` | Vérifie l'application installable (hors ligne), la boutique et les récompenses dans Chrome |
| `node scripts/browser-check.mjs http://localhost:3001 captures` | Parcours complet dans un vrai Chrome (nécessite `npm start`, et `CHROME_PATH` si Chrome n'est pas dans `/usr/bin/google-chrome`) |

## 3. Déploiement

Voir **[DEPLOIEMENT.md](DEPLOIEMENT.md)** : serveur en ligne (Render ou petit serveur loué, avec
disque persistant pour la base des comptes), version web, publication sur Google Play et sur
l'App Store, liste de contrôle avant publication.

## 4. Architecture

```
shared/                 Code commun client + serveur, sans dépendance graphique
  config.ts             Configuration des règles + validation (sanitizeConfig)
  combos.ts             Combinaisons, ordre de priorité, comparaison
  engine.ts             Moteur de règles pur (tours, relances, charge/décharge, barrages, fin)
  ai.ts                 Intelligence artificielle (facile / normal / difficile)
  protocol.ts           Types échangés sur le réseau
  rng.ts                Générateur déterministe (trajectoires d'animation)
server/
  app.ts                Salons, autorité serveur, validation, reconnexion, temporisations
  index.ts              Point d'entrée
client/src/
  physics/diceSim.ts    Simulation physique des dés (cannon-es), indépendante du rendu
  three/TrayScene.ts    Rendu Three.js du bac, lecture des trajectoires, sélection des dés
  three/textures.ts     Textures procédurales (faces, feutrine, bois, cuir)
  three/themes.ts       Thèmes : bistrot, bois sombre, casino, table de bar
  audio/sound.ts        Sons synthétisés (WebAudio), pilotés par les vraies collisions
  game/controller.ts    Interface commune solo / en ligne
  game/localController.ts  Partie solo (moteur dans le navigateur + IA)
  game/online.ts        Client Socket.IO (le serveur fait foi)
  game/personas.ts      Adversaires IA (nom, avatar, couleur, tempo, style, répliques)
  ui/                   Écrans React
tests/                  Tests Vitest
scripts/browser-check.mjs  Parcours de bout en bout dans Chrome
```

Choix techniques :
- **Three.js + cannon-es** : cannon-es est en JavaScript pur (pas de WASM à initialiser), stable
  pour trois cubes, et fonctionne aussi sous Node pour les tests. Rapier aurait aussi convenu ;
  la simulation est isolée dans `diceSim.ts`, la changer ne toucherait rien d'autre.
- **React + TypeScript** côté interface, **Node + Socket.IO** côté serveur, comme proposé.
- **Pas de base de données** : inutile pour des parties courtes ; la reconnexion repose sur un
  jeton secret par joueur conservé dans le navigateur.

### Comment les dés physiques tombent exactement sur le résultat officiel

1. Le résultat officiel est tiré par le moteur (le **serveur** en multijoueur, avec
   `crypto.randomInt`) ; le navigateur ne décide jamais d'un résultat en ligne. En solo, le navigateur
   tire ses dés avec `crypto.getRandomValues` sans biais (`shared/random.ts`), vérifié par des tests
   statistiques (`tests/dice-random.test.ts`). Aucun ordinateur ni patron ne touche aux dés.
2. Le navigateur simule tout le lancer à l'avance : gravité, collisions avec le fond, les parois
   et les autres dés, friction, restitution, amortissement, jusqu'à l'immobilité complète.
3. Il lit quelle face de chaque cube physique finit en haut, puis applique au **maillage** une
   rotation constante choisie parmi les 24 symétries du cube, pour que la face portant la valeur
   officielle soit celle-là. Un cube étant symétrique, la trajectoire est rigoureusement la même :
   aucun mouvement n'est ajouté, aucune « aimantation » de fin de course.
4. La trajectoire enregistrée est rejouée à 60 i/s, avec les sons déclenchés aux vrais impacts.
   Le geste de ramassage (0,45 s) raccorde position, vitesse, accélération et rotation du premier
   instant physique : aucun arrêt ni à-coup au lâcher (vérifié par un test).
   Le rendu est fait à la demande (rien n'est redessiné quand les dés sont immobiles), les shaders
   sont compilés au chargement et la résolution baisse d'elle-même si l'appareil tient moins de 45 i/s.
5. Un lancer où un dé finit penché, posé sur un autre ou collé à une paroi (face cachée par le
   rebord) est rejeté et re-simulé. Une correction
   douce sur les dernières images n'existe qu'en dernier recours (0 cas sur 150 dans les tests).
6. En ligne, le serveur envoie aussi une **graine** : tous les joueurs voient la même trajectoire.

Les dés conservés sont des corps statiques pendant la relance : ils ne bougent pas, et les dés
relancés rebondissent contre eux.

## 5. Règles par défaut (modifiables avant chaque partie)

| Réglage | Par défaut | Options |
|---|---|---|
| Variante | Classique : charge puis décharge | Décharge seule · Aux points (N manches) |
| Pot | 21 jetons | 5 à 99 |
| Lancers pendant la charge | 1 | 1 à max |
| Lancers par tour | 3 (1 lancer + 2 relances) | 1 à 5 |
| Le premier joueur fixe le nombre de lancers | Oui | Oui / Non |
| Temps pour jouer (à chaque décision) | 30 s | 15, 20, 30, 45, 60, 90 s ou illimité |
| Sens | Horaire | Horaire / Antihoraire |
| Égalité pour la dernière place | Barrage | Le premier ayant joué perd · Le dernier ayant joué perd |
| Barrage départagé | À la figure | À la figure · À l'addition (total des trois dés) |
| À égalité, le moins de lancers gagne | Non | Oui / Non |
| Le perdant commence la manche suivante | Oui | Oui / Non (rotation) |

Valeurs des combinaisons, de la meilleure à la plus faible :
**421** = 8 · **111** = 7 · puis, par valeur : **611 > 666 > 511 > 555 > 411 > 444 > 311 > 333 > 211 > 222**
(deux as + x et brelan de x valent x ; à valeur égale, les deux as passent devant) · **suites** 654…321 = 2 · **autres** = 1 (comparées dé par dé)
· **nénette** 221 = la plus faible, et le perdant qui la fait prend au moins 2 jetons.
Les valeurs du 421, des trois as, des suites, des autres et de la nénette sont modifiables.

Temps écoulé : si le joueur n'a pas lancé, le jeu lance pour lui, puis valide son tour.

## 5 bis. Statistiques du jeu

Accueil → bandeau « joueurs en ligne » ou tuile **Statistiques**. Tout est calculé par le serveur
(`server/stats.ts`, `GET /api/stats`), à partir de l'activité réelle, sans aucune donnée personnelle :

- **En direct** (rafraîchi toutes les 12 s) : appareils avec le jeu ouvert et reliés au serveur
  (connexion de présence, un appareil compte une fois même avec plusieurs onglets, retiré dès la
  déconnexion), parties en cours (tables en ligne en jeu + parties solo en cours), joueurs aux tables.
- **Aujourd'hui** (fuseau Europe/Brussels) : parties terminées, joueurs différents, nouveaux inscrits,
  victoires de joueurs. **Depuis le début** : inscrits, parties, à plusieurs / contre l'ordinateur,
  temps de jeu cumulé, record de joueurs en ligne. Graphiques sur 7 et 30 jours.
- Une partie compte une seule fois (identifiant unique) et seulement terminée : en ligne, quand elle
  arrive au bout ; en solo, quand l'appareil la déclare finie avec le jeton reçu au début et après une
  durée minimale. Les soirées sur un seul téléphone et le mode arbitre ne passent pas par le serveur.
- **Administration** (`GET /api/admin/stats`, comptes listés dans `ADMIN_USERS`) : inscriptions,
  comptes actifs, joueurs les plus actifs, parties les plus longues.

## 6. Multijoueur

Accueil → **Jouer en ligne** (tables) ou **Tournois**.

**Partie rapide** : un bouton qui vous assoit à une table publique sans mise qui attend des joueurs,
ou vous en ouvre une. L'hôte peut **ajouter des ordinateurs** (facile, normal, difficile) pour jouer
tout de suite ; ils jouent côté serveur, comme en solo.

**Tables**
- Créer une table : **sur invitation** (code à 5 caractères + lien `?rejoindre=CODE`) ou **publique**
  (visible dans la liste des tables publiques, rafraîchie toutes les 4 s) ; **2 à 6 places** ;
  **mise facultative** (10 à 1000 pièces, compte requis). L'hôte peut tout changer dans le salon.
- Mise : prélevée sur chaque compte au lancement ; la cagnotte va au gagnant (partagée en cas
  d'égalité aux points). Celui qui quitte en cours de partie perd sa mise.
- Le serveur valide tout : tour du joueur, nombre de lancers, sélection, **version d'état** jointe à
  chaque action (un double clic est ignoré), débit limité, noms nettoyés.
- Déconnexion : le serveur joue à la place du joueur après 20 s ; retour possible (« Reprendre »).
- Temps par tour réglable (30 s par défaut) ; l'hôte qui part est remplacé.

**Tournois**
- L'organisateur choisit : nom, **public ou sur invitation** (code + lien `?tournoi=CODE`),
  **4 à 32 joueurs**, **3 à 6 joueurs par table**, **droit d'entrée** facultatif, répartition de la
  cagnotte (**podium** 60/30/10 % ou **tout au vainqueur**) et toutes les règles des parties.
- Départ par l'organisateur dès 4 inscrits, ou automatiquement quand le tournoi est complet.
- Les joueurs sont tirés au sort et répartis en tables équilibrées qui jouent en même temps ; la
  meilleure moitié de chaque table se qualifie, jusqu'à la finale. Tableau en direct, retour
  automatique à sa table au tour suivant, classement final et gains versés par le serveur.
- Abandon ou déconnexion : le serveur joue les parties du joueur, le tournoi ne bloque jamais.
- L'organisateur peut **compléter le tournoi avec des ordinateurs** (tournois sans mise).

**Mises protégées** : chaque mise prélevée est inscrite en base (séquestre) jusqu'à la fin de la
partie ou du tournoi. Si le serveur redémarre entre-temps, les mises sont remboursées au démarrage.

**Blocages** : depuis le profil d'un joueur (compte requis). Sa photo et ses réactions sont masquées,
il ne peut plus s'asseoir à vos tables ni s'inscrire à vos tournois, et l'amitié est retirée. Liste
et déblocage dans « Mon compte ».

## 6 bis. Confidentialité (RGPD)

- Page « Confidentialité et mentions légales » : lien en bas de l'accueil, et adresse directe
  `/confidentialite`. Coordonnées de l'éditeur (nom, e-mail, adresse postale, hébergeur) :
  `client/src/legal.ts`.
- « Mon compte » → **Télécharger mes données** (fichier JSON : droit d'accès et portabilité) et
  **Supprimer mon compte** (effacement immédiat).
- Aucun service tiers : les polices sont servies par le jeu (plus de Google Fonts), pas de mesure
  d'audience, pas de cookie. Hébergement prévu dans l'Union européenne (`region: frankfurt` dans
  `render.yaml`).


## 7. État du projet

### Terminé et vérifié
- Bac 3D, 4 formes de plateau, 6 décors, tapis, rebords, 6 styles de dés ; dés physiques avec
  résultat exact garanti ; lancer fluide (raccord sans à-coup) ; ralenti et gros plan sur 4-2-1 et
  trois as ; **dés gardés posés au bord du bac** (même position chez tous les joueurs).
- Lancer d'un **geste** (glisser sur le bac : direction et force) ou en **secouant** le téléphone.
- Règles configurables (variantes, temps de jeu, barrage à la figure ou à l'addition) ; **suivi de
  manche** (« 5-2-1 pour 6 jetons ») ; règles consultables pendant la partie.
- Solo contre 1 à 5 IA ; multijoueur 2 à 6 avec salon, reconnexion, temps limité, **réactions**.
- **Tables publiques** et privées, **partie rapide**, **ordinateurs en ligne**, **mises** en pièces
  (remboursées si le serveur redémarre), **tournois** à plusieurs tables, **blocage** de joueurs.
- Page de **confidentialité** et mentions légales, export des données du compte.
- **Comptes facultatifs** (pseudo + mot de passe, code de récupération, suppression complète),
  progression sur le serveur, **classement** (victoires en ligne vérifiées), **amis**.
- **Profil** : photo, XP et argent affichés séparément, statistiques, **42 succès** ; profil des
  autres joueurs (classement, amis, cartes en partie) ; signalement des photos.
- Interface « plaque émaillée de bistrot » : feutre vert, émail bleu, icônes dessinées, textes clairs.
- XP, niveaux, pièces, boutique cosmétique, **défis du jour**.
- Son « gras » synthétisé selon la matière du rebord, volume 0–100 % en jeu, vibrations.
- Application installable (hors connexion en solo) et projets Android / iOS (Capacitor).

Tests : `npm test` (78 tests : clubs, album, patron, récap, prestige, arbitre, soirée, partie guidée, défi du jour, ligues, parrainage, rivalités, pass, série, événements, ordinateurs en ligne, partie rapide, blocages, séquestre des mises, tournois, mises, tables publiques, règles, IA, physique, formes, gestes, dés au bord, progression,
défis, succès, serveur multijoueur réel, temps limité, réactions, comptes, photos) et parcours
complets dans Chrome (`scripts/check-*.mjs`).

### Non vérifié
- Vrais téléphones (Android, iPhone), Firefox, Safari ; performances sur matériel réel.
- Compilation des applications natives (SDK Android et Xcode indisponibles ici).
- Le son : niveaux mesurés, mais pas écouté.

### Pas encore fait
- Animation de lancer au gobelet.
- Récupération de compte par e-mail (aujourd'hui : code de récupération).
- Les parties et tournois en cours sont perdus si le serveur redémarre (les mises, elles, sont remboursées).
