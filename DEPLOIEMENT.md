# Mise en ligne

## Solution retenue : Render (environ 7,25 $ par mois)

Coût : instance « Starter » 7 $ par mois + disque de 1 Go 0,25 $ par mois (l'espace de travail
« Hobby » est gratuit). Bande passante comprise : 5 Go par mois, puis 0,15 $ par Go. Selon votre
situation, la TVA belge peut s'ajouter à la facture.

1. Mettre le projet sur GitHub (dépôt privé `jeu-421`).
2. Sur [render.com](https://render.com) : se connecter avec GitHub → **New** → **Blueprint** →
   choisir `jeu-421`. Render lit `render.yaml` : service web Node, offre Starter, région
   **Francfort** (Union européenne), disque de 1 Go monté sur `/var/data` pour les comptes.
3. Valider (**Apply**) et ajouter une carte bancaire. Le premier déploiement prend quelques minutes.
4. L'adresse du jeu s'affiche en haut du service (`https://jeu-421.onrender.com` ou proche).
5. Sauvegardes : Render fait des instantanés quotidiens du disque (onglet **Disks**) ; vérifiez
   qu'ils sont bien listés après le premier jour.

Mises à jour : chaque envoi sur GitHub redéploie le jeu automatiquement. Les mises engagées dans
une partie en cours à ce moment-là sont remboursées au redémarrage.

Nom de domaine personnalisé (facultatif, environ 10 € par an chez un registraire) :
**Settings → Custom Domains**, puis suivre les indications DNS affichées.

---

# Mettre le 421 en ligne : web, Play Store, App Store

Tout repose sur **un seul serveur** : il fait tourner les parties en ligne, les comptes, le
classement, et il sert aussi la version web. Le site web, l'application installable et les
applications des stores se connectent tous à ce même serveur.

```
            ┌─────────────── serveur Node (ce projet) ───────────────┐
navigateur ─┤  version web + parties en ligne + API des comptes       │
appli iOS  ─┤  base de données SQLite (fichier sur un disque persistant)│
appli Android┘─────────────────────────────────────────────────────────┘
```

Ordre conseillé : **1. serveur en ligne → 2. version web → 3. Android → 4. iPhone.**

---

## 1. Mettre le serveur en ligne

### Ce qu'il faut à l'hébergeur
- un processus **Node 22.13 ou plus récent** allumé en permanence (pas de « serverless ») ;
- les **WebSockets** (parties en ligne) ;
- un **disque persistant** pour la base de données des comptes : sans lui, comptes et progression
  seraient effacés à chaque redémarrage ;
- HTTPS (fourni automatiquement par les hébergeurs ci-dessous).

### Option A — Render (le plus simple)
1. Créez un compte GitHub et déposez-y le contenu du projet (dépôt privé possible).
2. Sur [render.com](https://render.com) : *New → Blueprint* → choisissez le dépôt. Le fichier
   `render.yaml` crée le service, avec un **disque persistant** monté sur `/var/data` et la variable
   `DATABASE_PATH=/var/data/421.sqlite`.
3. Les disques ne sont pas disponibles sur l'offre gratuite : il faut une offre payante
   (consultez la page tarifs de Render, les prix ont changé en 2026).
4. Une fois déployé, le jeu est à l'adresse `https://<nom>.onrender.com`. Ajoutez votre propre nom
   de domaine dans *Settings → Custom Domains* si vous en avez un.

### Option B — Un petit serveur loué (VPS)
Moins cher sur la durée, un peu plus technique :
```bash
# sur le serveur (Ubuntu), une fois Node 22 installé
git clone <votre dépôt> && cd jeu-421
npm ci --include=dev && npm run build
DATABASE_PATH=/var/lib/jeu421/421.sqlite PORT=3001 npm start
```
Placez-le derrière Caddy ou Nginx pour le HTTPS (Caddy le configure tout seul), et lancez-le
comme service (systemd) pour qu'il redémarre automatiquement. Le `Dockerfile` fourni fonctionne
aussi (montez un volume sur le dossier de la base).

### Variables d'environnement
| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | port d'écoute | 3001 |
| `DATABASE_PATH` | fichier de la base de données | `data/421.sqlite` |
| `MIN_SOLO_MS` | durée minimale d'une partie solo récompensée (ms) | 20000 |
| `ADMIN_USERS` | pseudo(s) ayant accès au tableau de bord d'administration, séparés par des virgules | aucun |

**Administration.** Le tableau de bord (Statistiques → « Tableau de bord ») n'apparaît que pour les
comptes listés dans `ADMIN_USERS`, et le serveur vérifie ce droit à chaque appel. Créez votre compte
avec ce pseudo dès la mise en ligne, avant que quelqu'un d'autre ne le prenne, et ne le supprimez
pas (un nouveau compte du même pseudo hériterait de l'accès).

### Sauvegardes
La base tient dans un seul fichier. Copiez-le régulièrement (une fois par jour suffit), par exemple
avec `sqlite3 421.sqlite ".backup sauvegarde.sqlite"` depuis une tâche planifiée.

---

## 2. Version web (PC, Mac, tablettes)

Rien de plus à faire : dès que le serveur est en ligne, le jeu est jouable à son adresse dans
Chrome, Edge, Firefox ou Safari. Sur téléphone, il s'installe comme une application depuis le
navigateur (bouton « Installer l'application » sur Android, *Partager → Sur l'écran d'accueil* sur
iPhone). Partagez simplement l'adresse.

---

## 3. Google Play (Android)

**Ce qu'il faut :** un ordinateur avec [Android Studio](https://developer.android.com/studio), un
compte Google Play Console (frais d'inscription uniques, montant sur le site de Google).

1. **Identifiant de l'application** : dans `capacitor.config.ts`, remplacez `com.exemple.jeu421` par
   un identifiant à vous (ex. `be.votrenom.jeu421`). Il est définitif une fois publié.
2. **Build relié à votre serveur** :
   ```bash
   VITE_SERVER_URL=https://votre-serveur.example npm run app:android
   ```
   Android Studio s'ouvre sur le projet.
3. **Fichier à publier** : *Build → Generate Signed App Bundle* → créez une clé de signature
   (**gardez-la précieusement**, sans elle vous ne pourrez plus mettre à jour l'application) →
   vous obtenez un fichier `.aab`.
4. **Play Console** : créez l'application, puis remplissez :
   - la fiche (description, captures d'écran, icône 512 × 512, bannière 1024 × 500) ;
   - le **questionnaire de classification** : répondez honnêtement aux questions sur les jeux de
     hasard simulés (dés et jetons virtuels, **aucun argent réel**) ;
   - la **sécurité des données** : pseudo, photo de profil facultative, statistiques de jeu,
     stockés sur votre serveur ; suppression du compte possible dans l'application ;
   - l'adresse d'une **politique de confidentialité** (une page web, obligatoire).
5. **Test fermé obligatoire** pour les comptes personnels créés après le 13 novembre 2023 :
   **au moins 12 testeurs inscrits pendant 14 jours consécutifs** avant de pouvoir publier
   publiquement ([aide Google](https://support.google.com/googleplay/android-developer/answer/14151465)).
   Invitez vos amis comme testeurs.
6. Passez ensuite en **production** ; l'examen par Google prend en général quelques jours.

---

## 4. App Store (iPhone, iPad)

**Ce qu'il faut :** un **Mac** avec Xcode, un compte **Apple Developer Program** (abonnement
annuel, montant sur le site d'Apple).

1. Même identifiant que pour Android (ou un autre) dans `capacitor.config.ts`.
2. ```bash
   VITE_SERVER_URL=https://votre-serveur.example npm run app:ios
   ```
   Xcode s'ouvre : choisissez votre équipe (*Signing & Capabilities*), puis *Product → Archive* et
   *Distribute App* pour envoyer le build.
3. **App Store Connect** : fiche, captures d'écran (iPhone et iPad), « étiquettes de
   confidentialité » (mêmes données que pour Google), classification par âge (jeux de hasard
   simulés : répondez honnêtement), adresse de la politique de confidentialité.
4. Dans les notes pour l'équipe d'examen, donnez un **compte de démonstration** (pseudo + mot de
   passe) pour qu'ils puissent tester le classement et le profil.
5. **Points d'attention chez Apple :**
   - **Suppression de compte depuis l'application** : obligatoire, c'est fait (Mon compte →
     Supprimer mon compte, immédiat et complet).
   - **Contenus publiés par les joueurs** (photos de profil) : Apple demande un moyen de signaler,
     un moyen de **bloquer** un joueur et un contact pour les plaintes. Le signalement est fait
     (une photo signalée par 3 joueurs est masquée) ; **le blocage d'un joueur reste à ajouter**
     avant la soumission, ainsi qu'une adresse de contact.
   - **Fonctionnalité minimale** : Apple refuse les applications qui ne seraient qu'un site web
     emballé. Le 421 a un mode hors connexion, des vibrations, un jeu complet en 3D : c'est un
     argument, mais l'examen reste au cas par cas.
   - Pas besoin de « Se connecter avec Apple » : le jeu n'utilise pas Google ou Facebook pour se
     connecter.

---

## 5. Liste de contrôle avant publication

- [ ] Serveur en ligne en HTTPS, avec disque persistant et sauvegardes
- [ ] `appId` définitif dans `capacitor.config.ts`
- [ ] Builds mobiles faits avec `VITE_SERVER_URL` pointant vers ce serveur
- [ ] Page de **politique de confidentialité** et adresse de **contact**
- [ ] **Blocage d'un joueur** (exigence Apple pour les photos de profil)
- [ ] Essais sur de vrais téléphones Android et iPhone (son, vibrations, geste, secousse, performances)
- [ ] Compte de démonstration pour les examinateurs
- [ ] Questionnaires de classification et de données remplis honnêtement
