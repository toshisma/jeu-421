/**
 * Pages d'aide lisibles par les moteurs de recherche (HTML statique, sans attendre le JavaScript du jeu),
 * plus robots.txt et sitemap.xml. Usage : node scripts/build-seo.mjs  (écrit dans client/public, publié tel quel par Vite)
 *
 * Règles de rédaction (cahier des charges SEO de Sam) :
 *  - une page = une intention de recherche précise ; pas de pages qui se ressemblent ;
 *  - ne décrire que ce que le jeu fait vraiment (vérifié dans le code) ; aucun faux avis, aucune note inventée ;
 *  - les probabilités et durées citées sont calculées avec le moteur du jeu (shared/combos.ts, shared/engine.ts) ;
 *  - date « updated » à changer à la main quand le contenu d'une page change (elle alimente le sitemap).
 *
 * Pages « Coups Fourrés » (mode cartes) : scripts/seo-cf-pages.mjs ; leurs boutons « Jouer » ouvrent
 * directement le mode (/?mode=cartes). Images : scripts/shots-cf-seo.mjs.
 * Le catalogue des cartes (.ts) est lu directement : Node 22.18 ou plus récent (sinon : node --import tsx).
 *
 * Mesure : chaque page note la visite (même suivi anonyme que le jeu, /api/visit, avec la vraie provenance,
 * ex. google.com) et le clic sur « Jouer » (/api/visit/event, étape guide_play). Les liens vers le jeu n'ont
 * donc pas besoin de paramètres utm (qui écraseraient la provenance réelle dans le tableau de bord).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cfPages, CF_PLAY } from './seo-cf-pages.mjs';

const SITE = 'https://421online.com';
const OUT = join(process.cwd(), 'client', 'public');
/** Date de la dernière modification de l'accueil (index.html). */
const HOME_UPDATED = '2026-11-05';

// Petits éléments réutilisables -------------------------------------------------------------------
const dice = (s) => `<span class="dice" aria-label="${s.split('').join('-')}">${s.split('').map((d) => `<i class="d d${d}"></i>`).join('')}</span>`;
const play = (label, sub) => `<p class="play-box"><a class="cta" href="/" data-play>${label}</a>${sub ? `<small>${sub}</small>` : ''}</p>`;
const toc = (items) => `<nav class="toc" aria-label="Sommaire"><b>Sommaire</b><ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;

const pages = [
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'jouer-au-421-en-ligne', nav: 'Jouer en ligne', short: 'Jouer au 421 en ligne',
    blurb: 'Tous les modes de jeu : contre l’ordinateur, partie rapide, tables privées, tournois.',
    published: '2026-11-03', updated: '2026-11-05',
    title: 'Jouer au 421 en ligne gratuitement : solo, multijoueur, tournois',
    description: 'Jouez au 421 en ligne, gratuit et sans téléchargement : contre l’ordinateur, en partie rapide, en table privée avec vos amis ou en tournoi. Sur mobile et PC.',
    h1: 'Jouer au 421 en ligne, gratuitement',
    lead: `<a href="/" data-play>421online.com</a> est un vrai jeu de 421 multijoueur, pas une simple page de règles : vous lancez les dés dans un bac en 3D, contre l’ordinateur ou contre d’autres personnes, directement dans le navigateur de votre téléphone ou de votre ordinateur. C’est gratuit, sans publicité, sans téléchargement, et un compte n’est pas nécessaire pour jouer.`,
    image: { src: '/img/partie-421.webp', w: 390, h: 844, alt: 'Partie de 421 en cours sur téléphone : trois dés dans le bac en 3D, les adversaires en haut de l’écran', caption: 'Une partie contre l’ordinateur, sur téléphone.' },
    body: `
${toc([['commencer', 'Commencer en trente secondes'], ['modes', 'Les façons de jouer'], ['compte', 'Avec ou sans compte'], ['appareils', 'Sur quel appareil ?'], ['regles-maison', 'Vos règles, pas les nôtres'], ['equitable', 'Des dés équitables']])}

<h2 id="commencer">Commencer en trente secondes</h2>
<ol class="steps">
<li><b>Ouvrez <a href="/" data-play>421online.com</a></b> : le jeu se charge dans le navigateur, rien à installer.</li>
<li><b>Choisissez « Jouer contre l’ordinateur »</b> pour une partie tout de suite, ou <b>« En ligne »</b> pour affronter d’autres joueurs.</li>
<li><b>Lancez</b> d’un glissement de doigt sur le bac (ou d’un clic), gardez les dés qui vous arrangent, relancez les autres. Le jeu compte les jetons et applique les règles pour vous.</li>
</ol>
<p>Vous ne connaissez pas encore le 421 ? Une <b>partie guidée</b> de quelques minutes vous l’apprend en jouant, et les <a href="/regles-du-421">règles du 421</a> sont expliquées pas à pas sur ce site.</p>

<h2 id="modes">Les façons de jouer</h2>
<div class="cards">
<section class="card"><h3>Contre l’ordinateur</h3><p>De 1 à 5 adversaires, chacun avec son nom, son caractère et ses répliques de comptoir. Trois niveaux : <b>facile</b> pour apprendre, <b>normal</b>, et <b>difficile</b>, qui calcule exactement ses chances avant chaque décision. Le solo fonctionne même sans connexion, une fois le jeu ouvert une première fois.</p></section>
<section class="card"><h3>Partie rapide en ligne</h3><p>Un bouton, et vous êtes placé à une table publique qui attend des joueurs (ou une nouvelle table est créée). De 2 à 6 joueurs par table ; l’hôte peut compléter avec des joueurs ordinateur.</p></section>
<section class="card"><h3>Table privée entre amis</h3><p>Créez une table, envoyez le lien ou le code à 5 lettres : vos amis arrivent directement à votre table, depuis leur téléphone ou leur ordinateur. <a href="/421-entre-amis">Tout sur le jeu entre amis</a>.</p></section>
<section class="card"><h3>Tournois</h3><p>Deux rendez-vous chaque jour, à <b>11 h et 21 h</b> (heure de Bruxelles), de 4 à 16 joueurs, avec des sacs de dés à gagner. Vous pouvez aussi créer votre propre tournoi, public ou privé.</p></section>
<section class="card"><h3>Défi du jour</h3><p>Les mêmes dés pour tout le monde, cinq coups, un seul essai qui compte, et un classement chaque jour.</p></section>
<section class="card"><h3>Regarder une partie</h3><p>Le mode spectateur permet de suivre une table publique en cours (ou celle d’un ami), sans jouer, et de partir quand vous voulez.</p></section>
<section class="card"><h3>Coups Fourrés, le 421 aux cartes</h3><p>Le même jeu de dés, en duel, avec un deck de 20 cartes à collectionner : pièges, relances, bluff. Contre l’ordinateur, entre amis, en ligue ou au tournoi du samedi. <a href="/coups-fourres">Découvrir Coups Fourrés</a>.</p></section>
</div>

<h2 id="compte">Avec ou sans compte</h2>
<p>On peut jouer sans rien créer : vous choisissez juste un nom. Un compte gratuit (un pseudo et un mot de passe, <b>sans adresse e-mail</b>) ajoute ce qui a besoin d’être gardé sur le serveur.</p>
<div class="table-wrap"><table>
<thead><tr><th>Ce que vous voulez faire</th><th>Sans compte</th><th>Avec un compte gratuit</th></tr></thead>
<tbody>
<tr><td>Jouer contre l’ordinateur</td><td>Oui</td><td>Oui</td></tr>
<tr><td>Partie rapide, table privée, tournoi que vous créez</td><td>Oui</td><td>Oui</td></tr>
<tr><td>Regarder une table publique</td><td>Oui</td><td>Oui</td></tr>
<tr><td>Tournois de 11 h et 21 h (inscription en pièces du jeu)</td><td>Non</td><td>Oui</td></tr>
<tr><td>Tables avec mise de pièces</td><td>Non</td><td>Oui</td></tr>
<tr><td>Amis, messages privés, défis entre amis</td><td>Non</td><td>Oui</td></tr>
<tr><td>Progression gardée sur plusieurs appareils, classements</td><td>Non (gardée sur l’appareil)</td><td>Oui</td></tr>
</tbody></table></div>
<p>Les pièces du jeu se gagnent uniquement en jouant : <b>elles ne s’achètent pas</b>, et il n’y a aucun achat dans le jeu. Elles servent à personnaliser la table (tapis, rebords, décors, dés) et à s’inscrire aux tournois.</p>

<h2 id="appareils">Sur quel appareil ?</h2>
<p>Le jeu fonctionne dans un navigateur récent (Chrome, Safari, Firefox, Edge, Samsung Internet), sur <b>Android, iPhone, iPad, Windows, Mac ou Linux</b>. Les joueurs d’une même table peuvent mélanger les appareils : l’un sur son téléphone, l’autre sur son ordinateur. Sur téléphone, vous pouvez l’<b>ajouter à l’écran d’accueil</b> pour l’ouvrir comme une application (il n’y a pas d’application à télécharger dans les stores). Si votre appareil est ancien, les réglages permettent de baisser la qualité de la 3D.</p>

<h2 id="regles-maison">Vos règles, pas les nôtres</h2>
<p>Le 421 change d’un bistrot à l’autre. Le jeu applique par défaut la règle la plus courante (charge puis décharge, 21 jetons, 4-2-1 à 8 jetons, nénette), et vous pouvez tout régler avant une partie : nombre de jetons, de lancers, valeur des combinaisons, règle d’égalité, temps pour jouer, variante « décharge seule » ou « aux points ». Trois formats sont prêts : <b>Classique</b>, <b>Blitz</b> (11 jetons, 10 secondes par décision) et <b>Mort subite</b> (une seule manche).</p>

<h2 id="equitable">Des dés équitables</h2>
<p>En ligne, chaque dé est tiré au sort par le serveur avec une source de hasard cryptographique : aucun joueur ne peut influencer le résultat, et le jeu ne « favorise » personne. Le bac en 3D rejoue ensuite ce tirage avec de vrais rebonds, pour que tout le monde voie les mêmes dés rouler.</p>
${play('Jouer au 421 maintenant', 'Gratuit, sans téléchargement')}
`,
    faq: [
      ['Le 421 en ligne est-il gratuit ?', 'Oui, entièrement : pas d’abonnement, pas de publicité, pas d’achat. Les pièces du jeu se gagnent en jouant.'],
      ['Faut-il télécharger quelque chose ?', 'Non. Le jeu s’ouvre dans le navigateur, sur téléphone comme sur ordinateur. Vous pouvez l’ajouter à l’écran d’accueil si vous voulez.'],
      ['Faut-il créer un compte pour jouer ?', 'Non. Un compte gratuit, sans adresse e-mail, sert à garder sa progression, à avoir des amis et à participer aux tournois de 11 h et 21 h.'],
      ['Peut-on jouer au 421 contre l’ordinateur ?', 'Oui, contre 1 à 5 adversaires, en niveau facile, normal ou difficile. Le solo marche même sans connexion une fois le jeu ouvert.'],
      ['Combien de joueurs par partie en ligne ?', 'De 2 à 6 joueurs par table. L’hôte peut ajouter des joueurs ordinateur pour compléter.'],
    ],
    related: ['421-entre-amis', 'regles-du-421', 'coups-fourres'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'regles-du-421', nav: 'Règles', short: 'Règles du 421',
    blurb: 'Comment jouer : charge, décharge, valeur des combinaisons, nénette, égalités.',
    published: '2026-11-03', updated: '2026-11-05',
    title: 'Règles du 421 : comment jouer, charge, décharge et nénette',
    description: 'Les règles du 421 expliquées simplement : déroulé d’une manche, charge et décharge, valeur des combinaisons, nénette, égalités et variantes, avec un exemple.',
    h1: 'Les règles du 421',
    lead: 'Le 421 se joue avec trois dés et un pot de jetons. Le but : <b>se débarrasser de tous ses jetons</b>. Le dernier qui en garde a perdu… et, au comptoir, paie traditionnellement la tournée. Voici la règle la plus répandue, puis les variantes.',
    body: `
${toc([['resume', 'Le 421 en 6 points'], ['materiel', 'Le matériel'], ['manche', 'Une manche, pas à pas'], ['combinaisons', 'La valeur des combinaisons'], ['charge', 'La charge'], ['decharge', 'La décharge'], ['exemple', 'Exemple commenté'], ['egalites', 'Égalités et barrages'], ['cas', 'Cas particuliers'], ['variantes', 'Variantes courantes']])}

<h2 id="resume">Le 421 en 6 points</h2>
<ol class="steps">
<li>On joue à partir de 2, idéalement de 3 à 6 joueurs, avec 3 dés et 21 jetons.</li>
<li>Chacun lance les trois dés à son tour, et peut relancer tout ou partie des dés, jusqu’à 3 lancers.</li>
<li>Le premier joueur de la manche fixe le nombre de lancers des suivants.</li>
<li>La plus <b>faible</b> combinaison perd la manche ; la <b>meilleure</b> fixe le nombre de jetons en jeu.</li>
<li><b>Charge</b> : le perdant prend des jetons au pot jusqu’à ce qu’il soit vide.</li>
<li><b>Décharge</b> : le meilleur donne ses jetons au perdant ; on sort dès qu’on n’en a plus. Le dernier à en avoir a perdu.</li>
</ol>

<h2 id="materiel">Le matériel</h2>
<p>Trois dés à six faces, une piste (le plateau feutré des bistrots) ou un simple plateau, et 21 jetons, allumettes ou pièces au milieu de la table : c’est le <b>pot</b>. Un gobelet pour secouer les dés est traditionnel mais pas obligatoire.</p>

<h2 id="manche">Une manche, pas à pas</h2>
<p>Chaque joueur, à son tour, lance les trois dés. Il peut s’arrêter, ou <b>garder les dés qui l’arrangent et relancer les autres</b>, jusqu’à trois lancers au total. Un dé gardé peut être relancé au lancer suivant : rien n’est définitif avant l’arrêt.</p>
<p>Le <b>premier joueur de la manche</b> a un pouvoir particulier : s’il s’arrête après un seul lancer, les suivants n’ont droit qu’à un seul lancer ; s’il en utilise deux, deux lancers au plus pour tout le monde.</p>
<p>Quand tout le monde a joué, on compare : <b>le joueur qui a la plus faible combinaison perd la manche</b>, et la <b>meilleure</b> combinaison de la manche fixe le nombre de jetons qui changent de main. Le perdant commence la manche suivante.</p>

<h2 id="combinaisons">La valeur des combinaisons</h2>
<p>De la meilleure à la plus faible :</p>
<div class="table-wrap"><table>
<thead><tr><th>Combinaison</th><th>Exemple</th><th>Valeur</th></tr></thead>
<tbody>
<tr><td>4-2-1 (le « 421 »)</td><td>${dice('421')}</td><td>8 jetons (10 dans certaines régions)</td></tr>
<tr><td>Trois as</td><td>${dice('111')}</td><td>7 jetons</td></tr>
<tr><td>Deux as + x, puis brelan de x</td><td>${dice('611')} ${dice('666')} … ${dice('211')} ${dice('222')}</td><td>x jetons (de 6 à 2)</td></tr>
<tr><td>Suite</td><td>${dice('654')} ${dice('321')}</td><td>2 jetons</td></tr>
<tr><td>Autre combinaison</td><td>${dice('652')} ${dice('533')}</td><td>1 jeton</td></tr>
<tr><td>Nénette (la plus faible)</td><td>${dice('221')}</td><td>le perdant qui la fait prend au moins 2 jetons</td></tr>
</tbody></table></div>
<p>Entre deux « autres combinaisons », on range les dés du plus fort au plus faible et on compare dé par dé : 6-5-2 bat 6-4-3. Le classement complet, avec les probabilités, est sur la page <a href="/combinaisons-du-421">combinaisons du 421</a>.</p>

<h2 id="charge">La charge</h2>
<p>Au début, les 21 jetons sont au pot. À chaque manche, <b>le perdant prend au pot autant de jetons que vaut la meilleure combinaison</b>. Pendant la charge, on ne joue souvent qu’un seul lancer par tour pour aller vite (c’est le réglage par défaut sur 421online). Quand le pot est vide, la charge est finie : les joueurs qui n’ont <b>aucun jeton</b> ont déjà gagné et sortent de la partie.</p>

<h2 id="decharge">La décharge</h2>
<p>Les joueurs qui ont des jetons continuent, avec trois lancers cette fois. <b>Le joueur qui a fait la meilleure combinaison donne au perdant</b> autant de jetons que vaut sa combinaison. Celui qui n’a plus de jetons sort, gagnant. Le dernier à garder des jetons a perdu la partie.</p>

<h2 id="exemple">Exemple commenté</h2>
<p>Alice, Bruno et Chloé jouent ; il reste 9 jetons au pot. Alice ouvre la manche et fait ${dice('641')} au premier lancer ; elle tente sa chance et relance le 6 et le 1 : ${dice('421')} ! Elle s’arrête après <b>deux lancers</b>, donc Bruno et Chloé n’auront que deux lancers.</p>
<p>Bruno obtient ${dice('553')}, puis ${dice('555')} en relançant le 3 : un brelan de 5. Chloé fait ${dice('632')}, relance le 6 et le 3, et termine sur ${dice('221')}, la nénette.</p>
<p>Chloé a la plus faible combinaison : elle perd la manche. La meilleure est le 421 d’Alice, qui vaut 8 jetons : Chloé prend 8 jetons au pot (il en reste 1). Comme c’est elle qui a perdu, elle commencera la manche suivante.</p>

<h2 id="egalites">Égalités et barrages</h2>
<ul>
<li><b>Égalité pour la dernière place</b> : les joueurs concernés font un <b>barrage</b>, un seul lancer chacun ; le plus faible perd. Si l’égalité persiste, on recommence.</li>
<li><b>Égalité pour la meilleure combinaison pendant la décharge</b> : un barrage entre eux désigne celui qui donne ses jetons.</li>
<li>Selon les tables, le barrage se joue « à la figure » (on compare les combinaisons) ou « à l’addition » (le total des trois dés). D’autres font simplement perdre le premier, ou le dernier, à avoir joué.</li>
</ul>

<h2 id="cas">Cas particuliers</h2>
<ul>
<li><b>Pot presque vide</b> : pendant la charge, le perdant ne prend que ce qui reste au pot.</li>
<li><b>Pas assez de jetons pour payer</b> : pendant la décharge, le gagnant donne au plus les jetons qu’il possède, puis il sort.</li>
<li><b>Nénette perdante</b> : même si la meilleure combinaison ne vaut qu’un jeton, le perdant à la nénette en prend 2.</li>
<li><b>Joueurs sans jeton à la fin de la charge</b> : ils ne jouent pas la décharge, ils ont gagné.</li>
</ul>

<h2 id="variantes">Variantes courantes</h2>
<ul>
<li><b>Décharge seule</b> : pas de charge, chacun commence avec le même nombre de jetons (7, par exemple).</li>
<li><b>Aux points</b> : on joue un nombre fixe de manches et on additionne la valeur de ses combinaisons ; le plus haut total gagne.</li>
<li><b>Valeurs régionales</b> : 421 à 10 jetons, suites à 3 ou 4, nénette à 4… Toutes ces valeurs se règlent avant une partie sur <a href="/" data-play>421online</a>.</li>
<li><b>Moins de lancers</b> : certaines tables jouent toute la partie en un ou deux lancers.</li>
</ul>
<p>Prêt à vous lancer ? Les <a href="/strategie-421">astuces de stratégie</a> vous diront quels dés garder.</p>
${play('Essayer une partie', 'Le jeu applique les règles et compte les jetons pour vous')}
`,
    faq: [
      ['Combien de jetons au 421 ?', 'Traditionnellement 21 jetons au pot, distribués pendant la charge.'],
      ['Combien vaut un 421 ?', 'Le 4-2-1 est la meilleure combinaison : 8 jetons dans la règle la plus courante, 10 dans certaines régions.'],
      ['Qu’est-ce que la nénette au 421 ?', 'C’est le 2-2-1, la combinaison la plus faible. Le joueur qui perd avec une nénette prend au moins 2 jetons.'],
      ['Combien de lancers a-t-on au 421 ?', 'Jusqu’à trois lancers par tour, mais le premier joueur de la manche fixe le nombre de lancers des suivants. Pendant la charge, on joue souvent en un seul lancer.'],
      ['Qui gagne au 421 ?', 'Tous ceux qui se débarrassent de leurs jetons. Le perdant est le dernier joueur à en garder.'],
    ],
    related: ['combinaisons-du-421', 'strategie-421', 'jouer-au-421-en-ligne'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'combinaisons-du-421', nav: 'Combinaisons', short: 'Combinaisons et probabilités',
    blurb: 'Le classement complet, la valeur en jetons et les chances de chaque combinaison.',
    published: '2026-11-03', updated: '2026-11-05',
    title: 'Combinaisons du 421 : classement, valeurs et probabilités',
    description: 'Les combinaisons du 421 classées de la meilleure à la plus faible, avec leur valeur en jetons et leurs chances exactes en un et en trois lancers.',
    h1: 'Les combinaisons du 421',
    lead: 'Au 421, chaque tirage de trois dés donne une combinaison. Voici leur ordre exact, leur valeur en jetons et la probabilité de les obtenir, calculée sur les 216 tirages possibles de trois dés.',
    body: `
<h2 id="classement">Le classement complet</h2>
<div class="table-wrap"><table>
<thead><tr><th>Rang</th><th>Combinaison</th><th>Valeur</th><th>Chance en un lancer</th></tr></thead>
<tbody>
<tr><td>1</td><td>${dice('421')}<br>4-2-1</td><td>8</td><td>2,8 % (6 tirages sur 216)</td></tr>
<tr><td>2</td><td>${dice('111')}<br>trois as</td><td>7</td><td>0,5 % (1 sur 216)</td></tr>
<tr><td>3</td><td>${dice('611')}<br>6-1-1</td><td>6</td><td>1,4 % (3 sur 216)</td></tr>
<tr><td>4</td><td>${dice('666')}<br>brelan de 6</td><td>6</td><td>0,5 %</td></tr>
<tr><td>5</td><td>${dice('511')}<br>5-1-1</td><td>5</td><td>1,4 %</td></tr>
<tr><td>6</td><td>${dice('555')}<br>brelan de 5</td><td>5</td><td>0,5 %</td></tr>
<tr><td>7</td><td>${dice('411')}<br>4-1-1</td><td>4</td><td>1,4 %</td></tr>
<tr><td>8</td><td>${dice('444')}<br>brelan de 4</td><td>4</td><td>0,5 %</td></tr>
<tr><td>9</td><td>${dice('311')}<br>3-1-1</td><td>3</td><td>1,4 %</td></tr>
<tr><td>10</td><td>${dice('333')}<br>brelan de 3</td><td>3</td><td>0,5 %</td></tr>
<tr><td>11</td><td>${dice('211')}<br>2-1-1</td><td>2</td><td>1,4 %</td></tr>
<tr><td>12</td><td>${dice('222')}<br>brelan de 2</td><td>2</td><td>0,5 %</td></tr>
<tr><td>13</td><td>Suites : 6-5-4, 5-4-3, 4-3-2, 3-2-1</td><td>2</td><td>2,8 % chacune (11,1 % pour une suite quelconque)</td></tr>
<tr><td>14</td><td>Autres combinaisons</td><td>1</td><td>75 % (162 sur 216)</td></tr>
<tr><td>15</td><td>${dice('221')}<br>nénette</td><td>la plus faible</td><td>1,4 %</td></tr>
</tbody></table></div>
<p class="note">Valeurs de la règle la plus courante. Dans certaines régions, le 421 vaut 10 jetons : l’ordre ne change pas.</p>

<h2 id="comparer">Comment comparer deux combinaisons</h2>
<ul>
<li>« Deux as + x » et le brelan de x valent tous les deux x jetons ; à valeur égale, <b>les deux as passent devant</b> : 6-1-1 bat 6-6-6, qui bat 5-1-1.</li>
<li>Entre deux suites, la plus haute gagne : 6-5-4 bat 3-2-1.</li>
<li>Entre deux « autres combinaisons », on range les dés du plus fort au plus faible et on compare dé par dé : 6-5-5 bat 6-5-2, qui bat 6-4-3.</li>
<li>La nénette (2-2-1) est la pire combinaison du jeu, en dessous même de 3-2-2 ou de 4-3-1.</li>
</ul>

<h2 id="trois-lancers">Et en trois lancers ?</h2>
<p>Avec le droit de relancer, les chances changent beaucoup. Si l’on ne cherche que le 421 (on garde un 4, un 2 et un 1 dès qu’ils sortent, et on relance le reste) :</p>
<div class="table-wrap"><table>
<thead><tr><th>Objectif</th><th>En 1 lancer</th><th>En 2 lancers</th><th>En 3 lancers</th></tr></thead>
<tbody>
<tr><td>Faire 4-2-1</td><td>2,8 %</td><td>11,5 %</td><td>22,8 %</td></tr>
<tr><td>Faire trois as (en gardant les as)</td><td>0,5 %</td><td>–</td><td>7,5 %</td></tr>
<tr><td>Avoir au moins deux as (en gardant les as)</td><td>7,4 %</td><td>–</td><td>38,3 %</td></tr>
</tbody></table></div>
<p>Autrement dit, un joueur qui ne vise que le 421 avec trois lancers le réussit à peu près <b>une fois sur quatre ou cinq</b>. Pour savoir quand ça vaut le coup, voyez les <a href="/strategie-421">astuces de stratégie</a>.</p>

<h2 id="entrainement">S’entraîner</h2>
<p>Le <b>bac d’essai</b> de <a href="/" data-play>421online</a> permet de lancer et relancer autant que vous voulez, sans partie en cours, et l’<b>album</b> garde la trace des combinaisons que vous avez déjà réussies. Les règles complètes sont sur la page <a href="/regles-du-421">règles du 421</a>.</p>
${play('Lancer les dés', 'Dans le navigateur, sans rien installer')}
`,
    faq: [
      ['Quelle est la meilleure combinaison au 421 ?', 'Le 4-2-1, qui vaut 8 jetons, devant les trois as (7 jetons).'],
      ['Est-ce que 2-1-1 bat un brelan de 4 ?', 'Non : 2-1-1 vaut 2 jetons et le brelan de 4 en vaut 4. L’ordre suit la valeur : 4-1-1, 4-4-4, 3-1-1, 3-3-3, 2-1-1, 2-2-2.'],
      ['Quelle est la probabilité de faire 421 ?', '6 tirages sur 216 en un lancer, soit environ 2,8 %. En trois lancers en ne visant que le 421, environ 22,8 %.'],
      ['Une suite bat-elle un brelan ?', 'Non : une suite vaut 2 jetons, et elle passe après tous les brelans et tous les « deux as + x ».'],
    ],
    related: ['strategie-421', 'regles-du-421', 'jeux-de-des'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'strategie-421', nav: 'Stratégie', short: 'Stratégie et astuces',
    blurb: 'Quels dés garder, quand s’arrêter, comment jouer en premier ou en dernier.',
    published: '2026-11-05', updated: '2026-11-05',
    title: 'Stratégie au 421 : quels dés garder et comment gagner plus souvent',
    description: 'Astuces chiffrées pour gagner au 421 : quels dés garder, quand s’arrêter, l’avantage du premier et du dernier joueur. Probabilités exactes, sans formule.',
    h1: 'Stratégie au 421 : quels dés garder ?',
    lead: 'Le 421 reste un jeu de hasard, mais vos choix comptent : garder le bon dé, s’arrêter au bon moment, profiter de sa place dans la manche. Les chiffres de cette page sont calculés exactement sur les 216 tirages possibles de trois dés, avec le moteur de règles de 421online.',
    body: `
${toc([['objectif', 'Le vrai objectif : ne pas être dernier'], ['valeur', 'Que vaut votre tirage ?'], ['garder', 'Quels dés garder'], ['place', 'Jouer en premier, jouer en dernier'], ['phases', 'Charge et décharge : deux façons de jouer'], ['erreurs', 'Les erreurs classiques']])}

<h2 id="objectif">Le vrai objectif : ne pas être dernier</h2>
<p>Au 421, on ne gagne pas une manche en faisant la plus belle combinaison : on la <b>perd</b> en faisant la plus faible. La question à se poser avant chaque relance n’est donc pas « puis-je faire mieux ? », mais « <b>est-ce que quelqu’un fera moins bien que moi ?</b> ». Un modeste 6-5-3 suffit souvent ; un 4-3-1 est presque toujours en danger.</p>

<h2 id="valeur">Que vaut votre tirage ?</h2>
<p>Ce tableau indique, pour quelques tirages, quelle part des lancers uniques fait <b>moins bien</b> : c’est la chance qu’un adversaire qui n’a qu’un lancer finisse sous vous.</p>
<div class="table-wrap"><table>
<thead><tr><th>Votre tirage</th><th>Un lancer fait moins bien</th><th>Un lancer fait mieux</th></tr></thead>
<tbody>
<tr><td>${dice('611')}<br>6-1-1</td><td>95,4 %</td><td>3,2 %</td></tr>
<tr><td>${dice('211')}<br>2-1-1</td><td>88,0 %</td><td>10,6 %</td></tr>
<tr><td>${dice('654')}<br>suite 6-5-4</td><td>84,7 %</td><td>12,5 %</td></tr>
<tr><td>${dice('321')}<br>suite 3-2-1</td><td>76,4 %</td><td>20,8 %</td></tr>
<tr><td>${dice('665')}<br>6-6-5</td><td>75,0 %</td><td>23,6 %</td></tr>
<tr><td>${dice('653')}<br>6-5-3</td><td>65,3 %</td><td>31,9 %</td></tr>
<tr><td>${dice('642')}<br>6-4-2</td><td>52,8 %</td><td>44,4 %</td></tr>
<tr><td>${dice('542')}<br>5-4-2</td><td>29,2 %</td><td>68,1 %</td></tr>
<tr><td>${dice('431')}<br>4-3-1</td><td>6,9 %</td><td>90,3 %</td></tr>
<tr><td>${dice('221')}<br>nénette</td><td>0 %</td><td>98,6 %</td></tr>
</tbody></table></div>
<p>Repère utile : le tirage « médian » d’un lancer se situe autour de <b>6-3-3</b>. Tout ce qui commence par un 6 avec un deuxième dé fort est au-dessus de la moitié ; tout ce qui commence par un 4 ou un 5 sans as ni suite est fragile.</p>

<h2 id="garder">Quels dés garder</h2>
<ul>
<li><b>Vous avez 4 et 2</b> : relancez le troisième dé. Avec un lancer, une chance sur six de faire 421 ; avec deux lancers, <b>30,6 %</b>. Mais si vous ratez, vous finissez souvent avec un tirage faible (4-2-3, 6-4-2…) : à éviter si vous êtes déjà à l’abri.</li>
<li><b>Vous avez deux as</b> : gardez-les. Le troisième dé donne au pire un 2-1-1 (2 jetons, devant toutes les suites et les « autres combinaisons »), et une fois sur six les trois as.</li>
<li><b>Vous avez 4-1-1</b> : c’est déjà 4 jetons et un rang élevé. Relancer un as pour viser le 421 réussit 30,6 % du temps en deux lancers, mais vous fait retomber plus d’une fois sur deux sur un simple « 4-x-1 » à un jeton : ne le faites que si vous avez besoin d’un gros coup.</li>
<li><b>Vous n’avez rien</b> (par exemple 5-3-2) : gardez le 4, le 2 ou le 1 si vous en avez, sinon relancez tout. Garder un 6 seul aide à monter dans les « autres combinaisons », mais n’ouvre aucune grosse combinaison.</li>
<li><b>Un seul as</b> : il vaut la peine d’être gardé, il ouvre à la fois le 421, le « deux as » et les trois as.</li>
</ul>

<h2 id="place">Jouer en premier, jouer en dernier</h2>
<p><b>Le premier joueur</b> fixe le nombre de lancers de tout le monde. S’il obtient un bon tirage dès le premier lancer, il a intérêt à <b>s’arrêter tout de suite</b> : ses adversaires n’auront qu’un lancer pour le battre. À l’inverse, s’il gaspille trois lancers pour un résultat moyen, il offre trois lancers à chacun.</p>
<p><b>Le dernier joueur</b> a l’avantage de l’information : il connaît le score à battre. Si quelqu’un a déjà fait pire que lui, il peut s’arrêter immédiatement, même avec un tirage modeste. Dans <a href="/" data-play>421online</a>, les joueurs ordinateur de niveau difficile raisonnent exactement ainsi : ils ne voient que les résultats déjà joués et calculent leur risque de finir dernier.</p>

<h2 id="phases">Charge et décharge : deux façons de jouer</h2>
<p>Pendant la <b>charge</b>, les jetons viennent du pot : une grosse combinaison n’apporte rien à celui qui la fait, elle punit seulement le perdant. Cherchez juste à <b>éviter la dernière place</b>, et ne prenez pas de risque inutile.</p>
<p>Pendant la <b>décharge</b>, faire la meilleure combinaison permet de <b>donner</b> ses jetons. Si vous en avez beaucoup, un 421 (8 jetons) ou des trois as (7) peuvent vous sortir d’affaire d’un coup : c’est le moment de tenter. Si vous n’en avez qu’un ou deux, n’importe quelle meilleure combinaison suffit à sortir.</p>

<h2 id="erreurs">Les erreurs classiques</h2>
<ul>
<li>Relancer un 6-5-4 « pour faire mieux » alors qu’il bat 85 % des lancers.</li>
<li>Utiliser ses trois lancers en premier joueur, et donner ainsi trois lancers aux autres.</li>
<li>Viser le 421 pendant la charge alors qu’on est déjà à l’abri.</li>
<li>Oublier la nénette : avec 2-2 et un dé à relancer, un 1 fait la pire combinaison du jeu.</li>
</ul>
<p>Pour revoir l’ordre des combinaisons et leurs probabilités, voyez <a href="/combinaisons-du-421">combinaisons du 421</a>. Le meilleur entraînement reste de jouer contre les trois niveaux de l’ordinateur.</p>
${play('S’entraîner contre l’ordinateur', 'Facile, normal ou difficile')}
`,
    faq: [
      ['Faut-il toujours viser le 421 ?', 'Non. Le but est d’éviter la plus faible combinaison de la manche. Viser le 421 n’est intéressant que pendant la décharge, quand on a beaucoup de jetons à donner.'],
      ['Quelles sont les chances de faire 421 en gardant 4 et 2 ?', 'Une chance sur six avec un lancer restant, et 30,6 % avec deux lancers restants.'],
      ['Faut-il garder deux as ?', 'Oui, presque toujours : le troisième dé donne au moins un 2-1-1, qui bat les suites et toutes les autres combinaisons, et parfois les trois as.'],
      ['Le premier joueur a-t-il un avantage ?', 'Il choisit le nombre de lancers de la manche : avec un bon premier lancer, s’arrêter tout de suite limite les autres à un seul lancer.'],
    ],
    related: ['combinaisons-du-421', 'regles-du-421', 'jouer-au-421-en-ligne'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: '421-entre-amis', nav: 'Entre amis', short: 'Jouer au 421 entre amis',
    blurb: 'Table privée avec un lien, soirée sur un téléphone, arbitre pour vos vrais dés.',
    published: '2026-11-03', updated: '2026-11-05',
    title: 'Jouer au 421 entre amis, à distance ou autour de la table',
    description: 'Jouer au 421 avec vos amis : table privée en ligne avec un lien, soirée sur un seul téléphone, arbitre pour vos vrais dés, défis à distance. Gratuit.',
    h1: 'Jouer au 421 entre amis',
    lead: 'Le 421 est d’abord un jeu de bande. Sur <a href="/" data-play>421online</a>, il y a quatre façons d’y jouer à plusieurs : chacun sur son téléphone à distance, sur un seul téléphone qu’on se passe, avec vos vrais dés, ou en différé quand chacun a le temps.',
    image: { src: '/img/salon-421.webp', w: 390, h: 844, alt: 'Salon d’une table privée de 421 sur téléphone : six places autour de la table, le code de la table et les boutons pour partager le code ou le lien', caption: 'Le salon d’une table privée : partagez le code ou le lien, vos amis s’assoient aux places libres.' },
    body: `
${toc([['table-privee', 'Une table privée en ligne'], ['un-telephone', 'Une soirée sur un seul téléphone'], ['vrais-des', 'Avec vos vrais dés'], ['differe', 'À distance, quand chacun a le temps'], ['ambiance', 'L’ambiance du comptoir'], ['conseils', 'Nos conseils pour une bonne partie']])}

<h2 id="table-privee">1. Une table privée en ligne</h2>
<ol class="steps">
<li>Ouvrez <a href="/" data-play>421online.com</a>, touchez <b>« En ligne »</b>, puis <b>« Créer une table »</b>.</li>
<li>Touchez <b>« Inviter »</b> : le menu de partage s’ouvre (WhatsApp, SMS, Messenger…) ou, selon l’appareil, le lien est copié. Vous pouvez aussi dicter le <b>code à 5 lettres</b>.</li>
<li>Vos amis ouvrent le lien : ils arrivent directement à votre table, <b>sans compte et sans téléchargement</b>, il leur suffit de choisir un nom.</li>
<li>Quand tout le monde est prêt, l’hôte lance la partie. Il manque quelqu’un ? Ajoutez un joueur ordinateur.</li>
</ol>
<p>L’hôte choisit les règles (jetons, lancers, valeurs, égalités), le <b>temps pour jouer</b> (de 10 secondes à illimité) et la visibilité : table <b>sur invitation</b> ou <b>publique</b>. De 2 à 6 joueurs par table. Après la partie, une revanche se lance d’un geste.</p>

<h2 id="un-telephone">2. Une soirée sur un seul téléphone</h2>
<p>Autour d’une table, sans réseau ou pour jouer « comme au comptoir » : le mode <b>Soirée</b> se joue sur un seul téléphone que l’on passe de main en main, de 2 à 6 joueurs. L’écran indique à qui c’est le tour, et le jeu tient les comptes.</p>

<h2 id="vrais-des">3. Avec vos vrais dés : l’application arbitre</h2>
<p>Vous avez des dés et une piste ? Jouez avec, et laissez l’application arbitrer : après chaque tour, on indique les trois dés et le nombre de lancers, et elle s’occupe des jetons, des manches, de la charge, de la décharge et des barrages. Fini les disputes sur qui doit combien.</p>

<h2 id="differe">4. À distance, quand chacun a le temps</h2>
<p>Pas moyen de se retrouver à la même heure ? Les <b>défis entre amis</b> donnent exactement les mêmes dés aux deux joueurs : chacun joue quand il veut, dans les 72 heures, et le meilleur score gagne. Une notification prévient quand votre ami a joué. (Les défis, la liste d’amis et les messages privés demandent un compte gratuit, sans adresse e-mail.)</p>
<p>Et si un ami est déjà en pleine partie, vous pouvez la <b>regarder</b> en spectateur, puis le rejoindre à la table suivante.</p>

<h2 id="ambiance">L’ambiance du comptoir</h2>
<p>Pendant la partie, des <b>réactions</b> et des <b>phrases rapides</b> permettent de chambrer sans taper au clavier, et un tchat est ouvert à la table. Les 421 et les trois as ont droit à leur ralenti. Chacun lance avec ses propres dés : ceux de la boutique, ou des dés de collection trouvés dans les sacs, que toute la table voit rouler.</p>

<h2 id="conseils">Nos conseils pour une bonne partie</h2>
<ul>
<li><b>Mettez-vous d’accord sur les règles maison</b> avant de lancer (valeur du 421, nombre de lancers) : le jeu les applique ensuite sans discussion.</li>
<li><b>Pour une partie courte</b>, choisissez le format Blitz (11 jetons, 10 secondes par décision) : environ deux fois moins de manches qu’une partie classique.</li>
<li><b>En visio</b>, lancez l’appel d’un côté et le jeu de l’autre : les dés et les jetons se voient dans le jeu, les rires dans l’appel.</li>
<li><b>Nouveaux joueurs ?</b> Envoyez-leur les <a href="/regles-du-421">règles du 421</a>, ou laissez-les faire la partie guidée avant.</li>
</ul>
<p>Vous cherchez d’autres idées pour une soirée à distance ? Voyez notre guide des <a href="/jeux-entre-amis-a-distance">jeux entre amis à distance</a>.</p>
${play('Créer une table entre amis', 'Gratuit, vos amis n’ont rien à installer')}
`,
    faq: [
      ['Combien de joueurs au 421 ?', 'À partir de deux joueurs. Une table en ligne accepte de 2 à 6 joueurs, et le mode Soirée sur un téléphone aussi.'],
      ['Mes amis doivent-ils créer un compte ?', 'Non : le lien d’invitation suffit, ils choisissent juste un nom. Un compte gratuit sert pour la liste d’amis, les messages et les défis.'],
      ['Peut-on jouer au 421 à distance avec des amis ?', 'Oui : une table privée en ligne avec un lien ou un code, ou des défis en différé avec les mêmes dés pour chacun.'],
      ['Peut-on jouer entre amis sur téléphone et ordinateur en même temps ?', 'Oui, chacun utilise l’appareil qu’il veut : le jeu fonctionne dans le navigateur.'],
    ],
    related: ['jeux-entre-amis-a-distance', 'jouer-au-421-en-ligne', 'regles-du-421'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'jeu-multijoueur-navigateur', nav: 'Multijoueur', short: 'Jeu multijoueur sur navigateur',
    blurb: 'Un jeu à plusieurs à lancer en un lien, sans téléchargement, sur mobile et PC.',
    published: '2026-11-05', updated: '2026-11-05',
    title: 'Jeu multijoueur gratuit sur navigateur, sans téléchargement',
    description: 'Un jeu multijoueur gratuit à lancer en un lien, sans installation ni inscription : de 2 à 6 joueurs, sur téléphone et ordinateur, en parties courtes.',
    h1: 'Un jeu multijoueur sur navigateur, à lancer en un lien',
    lead: 'Vous cherchez un jeu à plusieurs qui démarre tout de suite, sans faire installer quoi que ce soit à vos amis ? <a href="/" data-play>421online</a> est un jeu de dés multijoueur qui tourne entièrement dans le navigateur : on envoie un lien, chacun l’ouvre sur son téléphone ou son ordinateur, et la partie commence.',
    image: { src: '/img/partie-421.webp', w: 390, h: 844, alt: 'Le jeu 421online sur téléphone : le bac de dés en 3D et les joueurs de la table', caption: 'Le bac en 3D, dans le navigateur d’un téléphone.' },
    body: `
${toc([['criteres', 'Ce qu’on attend d’un jeu multijoueur instantané'], ['principe', 'Le principe en trente secondes'], ['seul', 'Si vos amis ne sont pas là'], ['technique', 'Ce qu’il faut pour jouer'], ['pour-qui', 'Pour qui ?']])}

<h2 id="criteres">Ce qu’on attend d’un jeu multijoueur instantané</h2>
<div class="table-wrap"><table>
<thead><tr><th>Critère</th><th>Sur 421online</th></tr></thead>
<tbody>
<tr><td>Rien à installer</td><td>Le jeu s’ouvre dans le navigateur. Une version « écran d’accueil » est possible, jamais obligatoire.</td></tr>
<tr><td>Pas d’inscription obligatoire</td><td>On choisit un nom et on joue. Le compte (gratuit, sans e-mail) ne sert qu’à garder sa progression et à avoir des amis.</td></tr>
<tr><td>Inviter en un geste</td><td>Un lien ou un code à 5 lettres, partagé par WhatsApp, SMS ou n’importe quelle messagerie.</td></tr>
<tr><td>Mélanger les appareils</td><td>Téléphone, tablette et ordinateur à la même table (Android, iPhone, Windows, Mac).</td></tr>
<tr><td>Nombre de joueurs</td><td>De 2 à 6 par table, complétés par l’ordinateur si besoin.</td></tr>
<tr><td>Parties courtes</td><td>Format Blitz : 11 jetons et 10 secondes par décision, environ deux fois moins de manches qu’une partie classique.</td></tr>
<tr><td>Gratuit pour de vrai</td><td>Aucun achat dans le jeu, aucune publicité. Les pièces se gagnent en jouant.</td></tr>
</tbody></table></div>

<h2 id="principe">Le principe en trente secondes</h2>
<p>Le 421 est un jeu de dés de comptoir que tout le monde comprend en une manche : chacun lance <b>trois dés</b>, peut relancer ceux qui ne lui plaisent pas (trois lancers au plus), et <b>la plus faible combinaison perd</b> des jetons. Le but est de se débarrasser de ses jetons ; le dernier qui en a perd la partie. Le meilleur coup est le <b>4-2-1</b>, qui a donné son nom au jeu.</p>
<p>C’est un bon jeu à plusieurs parce que <b>tout le monde est concerné à chaque manche</b> : on regarde les lancers des autres, on espère qu’ils ratent, et le suspense dure jusqu’au dernier joueur. Les <a href="/regles-du-421">règles complètes</a> tiennent en une page, et le jeu les applique pour vous.</p>

<h2 id="seul">Si vos amis ne sont pas là</h2>
<ul>
<li><b>Partie rapide</b> : vous rejoignez une table publique d’inconnus qui attend des joueurs.</li>
<li><b>Contre l’ordinateur</b> : 1 à 5 adversaires, trois niveaux, même sans connexion une fois le jeu ouvert.</li>
<li><b>Tournois</b> : tous les jours à 11 h et 21 h (heure de Bruxelles), avec un compte.</li>
<li><b>Mode spectateur</b> : regardez une partie publique en cours, le temps que vos amis arrivent.</li>
</ul>
<p>Vous aimez aussi les jeux de cartes ? <a href="/coups-fourres">Coups Fourrés</a> mélange les dés du 421 et un deck de cartes à collectionner, en duel ou de 2 à 4 entre amis, toujours dans le navigateur.</p>

<h2 id="technique">Ce qu’il faut pour jouer</h2>
<p>Un navigateur à jour (Chrome, Safari, Firefox, Edge ou Samsung Internet) et une connexion internet pour le multijoueur ; une connexion mobile suffit. Les dés sont affichés en 3D : sur un appareil ancien, baissez la qualité graphique dans les réglages. Le son se coupe d’un geste, pour jouer discrètement.</p>

<h2 id="pour-qui">Pour qui ?</h2>
<p>Pour une pause entre collègues, un apéro à distance, une soirée en famille avec des générations qui ne jouent pas aux mêmes jeux vidéo, ou les nostalgiques du bistrot. Le hasard laisse sa chance à tout le monde, et la stratégie (quels dés garder, quand s’arrêter) récompense ceux qui s’y intéressent : voyez nos <a href="/strategie-421">astuces de stratégie</a>.</p>
${play('Lancer une partie maintenant', 'Le lien à envoyer à vos amis apparaît à la création de la table')}
`,
    faq: [
      ['Ce jeu multijoueur est-il vraiment gratuit ?', 'Oui : pas d’achat, pas d’abonnement, pas de publicité.'],
      ['Faut-il installer une application ?', 'Non, tout se passe dans le navigateur. Sur téléphone, on peut l’ajouter à l’écran d’accueil pour l’ouvrir plus vite, mais ce n’est pas obligatoire.'],
      ['À combien peut-on jouer ?', 'De 2 à 6 joueurs par table en ligne. On peut aussi jouer seul contre 1 à 5 adversaires ordinateur.'],
      ['Peut-on jouer sur téléphone avec des amis sur ordinateur ?', 'Oui, les joueurs d’une même table peuvent utiliser des appareils différents.'],
    ],
    related: ['jouer-au-421-en-ligne', 'jeux-entre-amis-a-distance', 'coups-fourres'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'jeux-entre-amis-a-distance', nav: 'À distance', short: 'Jeux entre amis à distance',
    blurb: 'Organiser une partie rapide à distance : selon le nombre de joueurs et le temps.',
    published: '2026-11-05', updated: '2026-11-05',
    title: 'Jeux entre amis à distance : organiser une partie rapide en ligne',
    description: 'Jouer entre amis à distance : quel format selon le nombre de joueurs et le temps disponible, avec ou sans appel vidéo, et en différé si besoin.',
    h1: 'Jouer entre amis à distance : le guide pratique',
    lead: 'Un ami a déménagé, la bande est dispersée, ou il est simplement trop tard pour sortir : jouer ensemble à distance reste un des meilleurs moyens de passer un moment. Ce guide vous aide à choisir le bon format selon le nombre de joueurs, le temps dont vous disposez et les appareils de chacun.',
    body: `
${toc([['bon-jeu', 'Ce qui fait un bon jeu à distance'], ['nombre', 'Selon le nombre de joueurs'], ['temps', 'Selon le temps disponible'], ['visio', 'Avec ou sans appel vidéo'], ['differe', 'Quand les horaires ne collent pas'], ['rituels', 'Petits rituels qui changent tout']])}

<h2 id="bon-jeu">Ce qui fait un bon jeu à distance</h2>
<ul>
<li><b>Zéro installation</b> : si un seul ami doit télécharger une application ou créer un compte, vous perdez dix minutes (et parfois l’ami).</li>
<li><b>Des règles qui s’expliquent en une phrase</b> : à distance, on ne peut pas montrer du doigt.</li>
<li><b>Tout le monde joue souvent</b> : les longues attentes entre deux tours tuent l’ambiance en ligne.</li>
<li><b>Une part de hasard</b> : elle permet aux débutants de battre les habitués, et c’est ce qui fait rire.</li>
<li><b>Des parties courtes et enchaînables</b> : mieux vaut trois revanches qu’une partie interminable.</li>
</ul>
<p>Les jeux de dés cochent naturellement ces cases, ce qui explique leur succès dans les bars depuis des générations. C’est ce qui nous a fait choisir le <a href="/jouer-au-421-en-ligne">421 en ligne</a>.</p>

<h2 id="nombre">Selon le nombre de joueurs</h2>
<div class="table-wrap"><table>
<thead><tr><th>Joueurs</th><th>Ce qui marche</th><th>Sur 421online</th></tr></thead>
<tbody>
<tr><td>2</td><td>Les duels courts, avec revanche immédiate.</td><td>Table privée à deux, défi entre amis (mêmes dés pour les deux), ou un duel de <a href="/coups-fourres">Coups Fourrés</a>, le 421 aux cartes.</td></tr>
<tr><td>3 ou 4</td><td>Le format idéal : tout le monde joue souvent et les alliances changent.</td><td>Table privée ; complétez avec un joueur ordinateur si quelqu’un manque.</td></tr>
<tr><td>5 ou 6</td><td>Des tours rapides, sinon l’attente devient longue.</td><td>Table de 6 avec un temps de jeu court (10 à 20 secondes).</td></tr>
<tr><td>Plus de 6</td><td>Plusieurs tables, puis une finale.</td><td>Créez un tournoi : tables de 3 à 6, les meilleurs passent au tour suivant.</td></tr>
</tbody></table></div>

<h2 id="temps">Selon le temps disponible</h2>
<ul>
<li><b>Une pause de quelques minutes</b> : le format <b>Mort subite</b> (une seule manche aux points) ou une partie Blitz.</li>
<li><b>Une soirée</b> : la partie classique (charge puis décharge), puis des revanches. D’après nos simulations avec le moteur du jeu, une partie classique compte en moyenne une vingtaine de manches, et une partie Blitz environ neuf.</li>
<li><b>Un rendez-vous régulier</b> : les tournois de <b>11 h et 21 h</b> sont une bonne excuse pour se retrouver chaque jour, même entre inconnus.</li>
</ul>

<h2 id="visio">Avec ou sans appel vidéo</h2>
<p>La formule la plus conviviale : un <b>appel vidéo ou vocal</b> sur un appareil (WhatsApp, Messenger, Discord, Teams…) et le jeu sur un autre, ou dans un autre onglet. Sur un seul téléphone, l’appel vocal suffit : le jeu prend l’écran, les voix font l’ambiance.</p>
<p>Sans appel, le tchat de la table, les réactions et les phrases rapides prennent le relais. Pensez à couper la musique du jeu si vous êtes en appel.</p>

<h2 id="differe">Quand les horaires ne collent pas</h2>
<p>Fuseaux horaires, enfants, horaires décalés : il n’est pas toujours possible de jouer en même temps. Le <b>jeu en différé</b> est alors la meilleure option. Dans 421online, un <b>défi entre amis</b> donne exactement les mêmes dés aux deux joueurs : chacun joue quand il peut, dans les 72 heures, et une notification annonce le résultat. Les <b>messages privés</b> attendent votre ami jusqu’à sa prochaine connexion.</p>

<h2 id="rituels">Petits rituels qui changent tout</h2>
<ul>
<li><b>L’enjeu symbolique</b> : le perdant choisit le prochain film, ou offre le café à la prochaine rencontre (la version moderne de « qui perd paie la tournée »).</li>
<li><b>Les règles maison</b> : chaque bande a les siennes. Réglez-les une fois (valeur du 421, nombre de lancers) et gardez-les.</li>
<li><b>Le classement de la bande</b> : notez qui gagne chaque semaine, ou fondez un club (jusqu’à 30 membres, avec un coffre commun chaque semaine).</li>
<li><b>Le spectateur</b> : un ami arrive en retard ? Il regarde la partie en cours et rejoint la suivante.</li>
</ul>
<p>Toutes les étapes pour créer une table et inviter vos amis sont sur la page <a href="/421-entre-amis">jouer au 421 entre amis</a>.</p>
${play('Inviter mes amis à une partie', 'Un lien suffit, sans compte et sans téléchargement')}
`,
    faq: [
      ['Quel jeu faire entre amis à distance sans rien installer ?', 'Un jeu qui tourne dans le navigateur et s’invite par un lien, comme 421online : chacun ouvre le lien sur son téléphone ou son ordinateur.'],
      ['Comment jouer à distance si on n’est pas disponibles en même temps ?', 'Avec un jeu en différé : dans 421online, les défis entre amis donnent les mêmes dés à chacun, qui joue quand il veut dans les 72 heures.'],
      ['Quel jeu en ligne pour 4 joueurs ?', 'Une table de 421 à 4 est le format idéal : tout le monde joue à chaque manche et les parties s’enchaînent vite.'],
    ],
    related: ['421-entre-amis', 'jeu-multijoueur-navigateur', 'coups-fourres'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'jeux-de-des', nav: 'Jeux de dés', short: 'Les jeux de dés classiques',
    blurb: '421, Zanzibar, Yams, Perudo, 5000 : les grands jeux de dés et leurs différences.',
    published: '2026-11-05', updated: '2026-11-05',
    title: 'Jeux de dés classiques : 421, Zanzibar, Yams, Perudo, 5000',
    description: 'Les grands jeux de dés à jouer entre amis, comparés : 421, Zanzibar, Yams, Perudo et 5000. Nombre de dés et de joueurs, but du jeu, ambiance.',
    h1: 'Les jeux de dés classiques, comparés',
    lead: 'Quelques dés, un gobelet, et la soirée est lancée. Les jeux de dés sont parmi les plus anciens jeux de société, et ils se jouent toujours aussi bien entre amis. Voici les grands classiques francophones, ce qui les distingue, et lequel choisir.',
    body: `
${toc([['comparatif', 'Le comparatif'], ['421', 'Le 421'], ['zanzibar', 'Le Zanzibar'], ['yams', 'Le Yams'], ['perudo', 'Le Perudo'], ['5000', 'Le 5000'], ['cartes', 'Dés et cartes : Coups Fourrés'], ['choisir', 'Lequel choisir ?']])}

<h2 id="comparatif">Le comparatif</h2>
<div class="table-wrap"><table>
<thead><tr><th>Jeu</th><th>Dés</th><th>Joueurs</th><th>Le principe</th><th>Ambiance</th></tr></thead>
<tbody>
<tr><td>421</td><td>3</td><td>2 et plus</td><td>Éviter la plus faible combinaison, se débarrasser de ses jetons</td><td>Comptoir, rapide, chambreur</td></tr>
<tr><td>Zanzibar</td><td>3</td><td>2 et plus</td><td>Proche du 421, avec ses propres combinaisons</td><td>Comptoir</td></tr>
<tr><td>Yams</td><td>5</td><td>1 et plus</td><td>Remplir une grille de combinaisons pour le meilleur total</td><td>Familial, calme</td></tr>
<tr><td>Perudo</td><td>5 par joueur</td><td>3 et plus</td><td>Enchères et bluff sur des dés cachés</td><td>Bluff, éclats de rire</td></tr>
<tr><td>5000</td><td>5 (ou 6)</td><td>2 et plus</td><td>Accumuler des points en prenant des risques</td><td>Stop ou encore</td></tr>
</tbody></table></div>

<h2 id="421">Le 421</h2>
<p>L’un des jeux de bistrot les plus connus en France et en Belgique. Trois dés, jusqu’à trois lancers, et une règle simple : la plus faible combinaison de la manche perd. La partie se joue en deux temps, la <b>charge</b> (on prend des jetons au pot) et la <b>décharge</b> (on s’en débarrasse). Sa force : tout le monde joue à chaque manche, et une partie se règle en quelques minutes. C’est le jeu que vous pouvez lancer tout de suite sur <a href="/" data-play>421online</a>, seul ou à plusieurs. Voir les <a href="/regles-du-421">règles du 421</a>.</p>

<h2 id="zanzibar">Le Zanzibar</h2>
<p>Cousin du 421, joué lui aussi avec trois dés et des jetons. Il a son propre classement de combinaisons, où le 4-5-6, appelé « zanzibar », fait partie des plus fortes. Les règles varient beaucoup selon les régions : mettez-vous d’accord avant de commencer.</p>

<h2 id="yams">Le Yams</h2>
<p>Cinq dés, trois lancers par tour, et une feuille de marque : à chaque tour, on inscrit son résultat dans une case (brelan, full, petite et grande suite, carré, yams…), et chaque case ne sert qu’une fois. Le Yams demande plus de réflexion et de temps, et se joue très bien en famille ; c’est l’ancêtre français du Yahtzee.</p>

<h2 id="perudo">Le Perudo</h2>
<p>Jeu de bluff d’origine sud-américaine : chacun cache ses cinq dés sous un gobelet, puis on fait des enchères sur le nombre total de dés d’une valeur sur toute la table (« huit 4 ! »). Le joueur suivant surenchérit ou conteste ; celui qui a tort perd un dé. Idéal à partir de quatre ou cinq joueurs autour d’une vraie table.</p>

<h2 id="5000">Le 5000</h2>
<p>Un jeu de « stop ou encore » : on lance les dés, on met de côté ceux qui rapportent des points (les 1, les 5, les brelans), puis on décide de s’arrêter pour encaisser ou de relancer le reste, au risque de tout perdre si plus rien ne rapporte. Le premier à 5 000 points gagne. On le connaît aussi sous les noms de 10 000 ou Farkle, avec des variantes de comptage.</p>

<h2 id="cartes">Dés et cartes : Coups Fourrés</h2>
<p>Et si on ajoutait des cartes au 421 ? C’est le principe de <a href="/coups-fourres">Coups Fourrés</a> : les dés et les combinaisons du 421, plus un deck de 20 cartes par joueur pour relancer un dé, poser un piège ou bluffer. Un jeu de stratégie qui garde la tension des dés, à essayer gratuitement contre l’ordinateur.</p>

<h2 id="choisir">Lequel choisir ?</h2>
<ul>
<li><b>Pour une partie rapide à plusieurs</b>, à table ou à distance : le 421.</li>
<li><b>Pour une soirée en famille, sans pression</b> : le Yams.</li>
<li><b>Pour une grande tablée qui aime bluffer</b> : le Perudo.</li>
<li><b>Pour ceux qui aiment prendre des risques</b> : le 5000.</li>
<li><b>Pour un duel de stratégie et de bluff</b> : Coups Fourrés, le 421 aux cartes.</li>
</ul>
<p>Tous ces jeux se jouent avec de vrais dés. Pour le 421 sans matériel, à distance ou contre l’ordinateur, <a href="/" data-play>421online</a> fait le travail : bac en 3D, jetons comptés, règles appliquées. Et si vous jouez avec vos propres dés, le mode « arbitre » tient les comptes à votre place (voir <a href="/421-entre-amis">jouer au 421 entre amis</a>).</p>
${play('Jouer au 421 en ligne', 'Le jeu de dés du comptoir, gratuit')}
`,
    faq: [
      ['Quel est le jeu de dés de comptoir le plus connu ?', 'Le 421 est sans doute le plus célèbre en France et en Belgique, avec le Zanzibar et le 5000.'],
      ['Quelle différence entre le 421 et le Yams ?', 'Le 421 se joue avec 3 dés et des jetons, en manches rapides où la plus faible combinaison perd ; le Yams se joue avec 5 dés et une feuille de marque à remplir.'],
      ['Peut-on jouer à un jeu de dés en ligne avec des amis ?', 'Oui : sur 421online, une table privée de 421 s’ouvre avec un lien, de 2 à 6 joueurs, sans téléchargement.'],
    ],
    related: ['regles-du-421', 'coups-fourres', 'jeux-entre-amis-a-distance'],
  },
  ...cfPages,
];

// Gabarit -----------------------------------------------------------------------------------------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const bySlug = Object.fromEntries(pages.map((p) => [p.slug, p]));
const HEADER_NAV = ['jouer-au-421-en-ligne', 'regles-du-421', 'strategie-421', '421-entre-amis', 'jeux-de-des', 'coups-fourres'];
const ORG = { '@type': 'Organization', '@id': `${SITE}/#organisation`, name: '421online', url: `${SITE}/`, logo: `${SITE}/icons/icon-512.png` };

// Mesure (même suivi anonyme que le jeu : identifiant d'appareil aléatoire, haché par le serveur, sans cookie).
const TRACK = `<script>(function(){try{var K='421.appareil',d=localStorage.getItem(K);if(!d||!/^[A-Za-z0-9_-]{8,64}$/.test(d)){d=Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(12)),function(b){return(b<16?'0':'')+b.toString(16)}).join('');localStorage.setItem(K,d)}var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}var q=new URLSearchParams(location.search),u={};['utm_source','utm_medium','utm_campaign'].forEach(function(k){var v=q.get(k);if(v)u[k]=v.slice(0,60)});var send=function(p,o,b){var s=JSON.stringify(o);if(b&&navigator.sendBeacon&&navigator.sendBeacon(p,new Blob([s],{type:'application/json'})))return;fetch(p,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:s}).catch(function(){})};send('/api/visit',{device:d,ref:document.referrer||'',utm:u,lang:navigator.language||'',tz:tz,landing:location.pathname});document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[data-play]');if(a)send('/api/visit/event',{device:d,kind:'guide_play',page:location.pathname},true)})}catch(e){}})();</script>`;

/** Coups Fourrés, le mode cartes : décrit une fois (page principale du mode), référencé par les autres pages. */
const CF_ID = `${SITE}/coups-fourres#jeu`;
const CF_GAME = {
  '@type': 'VideoGame', '@id': CF_ID, name: 'Coups Fourrés', alternateName: 'Le 421 aux cartes', url: `${SITE}/coups-fourres`,
  description: 'Jeu de cartes et de dés gratuit dans le navigateur : les combinaisons du 421, un deck de 20 cartes par joueur, des pièges et du bluff. Contre l’ordinateur, entre amis (2 à 4), en ligue classée ou en tournoi.',
  inLanguage: 'fr', genre: ['Jeu de cartes', 'Jeu de dés', 'Jeu de cartes à collectionner', 'Jeu de stratégie'],
  gamePlatform: ['Navigateur web'], applicationCategory: 'GameApplication', operatingSystem: 'Tout appareil avec un navigateur récent (Android, iOS, Windows, macOS, Linux)',
  playMode: ['SinglePlayer', 'MultiPlayer'], numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 4 },
  isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  image: `${SITE}/og-coups-fourres.jpg`, screenshot: `${SITE}/img/partie-coups-fourres.webp`,
  publisher: { '@id': `${SITE}/#organisation` }, isPartOf: { '@id': `${SITE}/#jeu` },
};

for (const p of pages) {
  const url = `${SITE}/${p.slug}`;
  const playHref = p.play ?? '/';
  const og = p.og ?? '/og-421.png';
  const parent = p.parent ? bySlug[p.parent] : null;
  const crumbs = [['421online', `${SITE}/`], ...(parent ? [[parent.short, `${SITE}/${parent.slug}`]] : []), [p.short, url]];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', '@id': `${url}#article`, headline: p.h1, description: p.description, inLanguage: 'fr', mainEntityOfPage: url,
        datePublished: p.published, dateModified: p.updated, author: ORG, publisher: ORG, image: `${SITE}${p.image?.src ?? og}`,
        about: { '@id': p.about === 'cf' ? CF_ID : `${SITE}/#jeu` },
      },
      ...(p.slug === 'coups-fourres' ? [CF_GAME] : []),
      { '@type': 'FAQPage', '@id': `${url}#faq`, mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) },
    ],
  };
  const fig = p.image ? `<figure class="shot"><img src="${p.image.src}" width="${p.image.w}" height="${p.image.h}" alt="${esc(p.image.alt)}" loading="lazy" decoding="async"><figcaption>${p.image.caption}</figcaption></figure>` : '';
  // L'illustration se place après le premier bloc (sommaire ou premier titre), jamais avant le contenu.
  let body = p.body.trim();
  if (fig) { const i = body.indexOf('<h2', body.indexOf('<h2') + 1); body = i > 0 ? `${body.slice(0, i)}${fig}\n${body.slice(i)}` : body + fig; }
  const related = p.related.map((s) => bySlug[s]).map((r) => `<a class="rel" href="/${r.slug}"><b>${r.short}</b><span>${r.blurb}</span></a>`).join('');
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#161b1e">
<meta name="color-scheme" content="dark only">
<meta property="og:type" content="article">
<meta property="og:site_name" content="421online">
<meta property="og:locale" content="fr_BE">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="article:modified_time" content="${p.updated}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="stylesheet" href="/seo.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
<header class="top">
  <a class="logo" href="/" aria-label="421online : ouvrir le jeu"><span>421</span></a>
  <nav aria-label="Pages d’aide">${HEADER_NAV.map((s) => `<a href="/${s}"${s === p.slug ? ' aria-current="page"' : ''}>${bySlug[s].nav}</a>`).join('')}</nav>
  <a class="cta small" href="${playHref}" data-play>Jouer</a>
</header>
<main>
<article>
<nav class="crumbs" aria-label="Fil d’Ariane"><a href="/">421online</a> <span aria-hidden="true">›</span> ${parent ? `<a href="/${parent.slug}">${parent.short}</a> <span aria-hidden="true">›</span> ` : ''}<span>${p.short}</span></nav>
<h1>${p.h1}</h1>
<p class="lead">${p.lead}</p>
<p class="meta">Mis à jour le <time datetime="${p.updated}">${new Date(`${p.updated}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</time></p>
${body}
<section class="faq">
<h2 id="questions">Questions fréquentes</h2>
${p.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n')}
</section>
</article>
<aside class="related" aria-label="À lire aussi"><h2>À lire aussi</h2><div>${related}</div></aside>
</main>
<footer>
<p><a href="/" data-play>421online.com</a> : le 421, jeu de dés de comptoir, gratuit en ligne, seul ou entre amis, et <a href="/coups-fourres">Coups Fourrés</a>, le 421 aux cartes. Les pièces et les capsules du jeu se gagnent en jouant et ne s’achètent pas.</p>
<nav class="links" aria-label="Toutes les pages d’aide">${pages.map((x) => `<a href="/${x.slug}">${x.short}</a>`).join('')}<a href="/confidentialite">Confidentialité et mentions légales</a></nav>
</footer>
${TRACK}
</body>
</html>
`;
  // Garde-fous : description et titre de longueur raisonnable, pas de lien interne vers une page inconnue.
  if (strip(p.description).length > 170) console.warn(`⚠ description longue (${p.description.length}) : ${p.slug}`);
  for (const m of html.matchAll(/href="\/([a-z0-9-]+)(?:#[^"]*)?"/g)) if (!bySlug[m[1]] && m[1] !== 'confidentialite') throw new Error(`Lien inconnu /${m[1]} dans ${p.slug}`);
  for (const m of html.matchAll(/(?:src|content)="(?:https:\/\/421online\.com)?\/((?:img|og-|icons)[^"]*\.(?:webp|png|jpg))"/g)) if (!existsSync(join(OUT, m[1]))) throw new Error(`Image absente /${m[1]} dans ${p.slug}`);
  for (const m of html.matchAll(/href="#([^"]+)"/g)) if (!html.includes(`id="${m[1]}"`)) throw new Error(`Ancre absente #${m[1]} dans ${p.slug}`);
  if (p.play && !html.includes(`href="${CF_PLAY}" data-play`)) throw new Error(`Bouton Jouer absent dans ${p.slug}`);
  writeFileSync(join(OUT, `${p.slug}.html`), html);
}

writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${HOME_UPDATED}</lastmod></url>
${pages.map((p) => `  <url><loc>${SITE}/${p.slug}</loc><lastmod>${p.updated}</lastmod></url>`).join('\n')}
</urlset>
`);
console.log(`${pages.length} pages, robots.txt et sitemap.xml écrits dans client/public`);
