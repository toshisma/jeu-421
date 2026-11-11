/**
 * Pages de référencement « une intention de recherche = une page » (novembre 2026), utilisées par build-seo.mjs.
 * Mêmes règles que les autres pages : ne décrire que ce que le jeu fait vraiment, aucun faux avis, aucune note,
 * aucun nom de site concurrent. Kingdom Come: Deliverance 2 n'est cité que pour dire d'où vient l'envie du mode,
 * avec la mention d'indépendance, sans image, texte ou nom propre du jeu vidéo.
 */
import { CT_PLAY } from './seo-courtisan-pages.mjs';

const play = (label, sub, href = '/?jouer=1') => `<p class="play-box"><a class="cta" href="${href}" data-play>${label}</a>${sub ? `<small>${sub}</small>` : ''}</p>`;
const toc = (items) => `<nav class="toc" aria-label="Sommaire"><b>Sommaire</b><ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;
const dates = { published: '2026-11-09', updated: '2026-11-11' };
export const INDEP = '421online.com est un site indépendant, sans lien avec Warhorse Studios, Deep Silver ou Plaion ; Kingdom Come: Deliverance est une marque de ses propriétaires.';

export const growthPages = [
  {
    slug: 'jeu-de-des-entre-amis', nav: 'Dés entre amis', short: 'Jeu de dés en ligne entre amis', ...dates,
    blurb: 'Créer une table, envoyer un lien ou un code et jouer aux dés à plusieurs, à distance.',
    title: 'Jeu de dés en ligne entre amis : une table privée en 1 minute',
    description: 'Jouez aux dés en ligne avec vos amis : créez une table privée, envoyez le code ou le lien, et lancez le 421 ou le Dix mille. Gratuit, sans téléchargement.',
    h1: 'Un jeu de dés en ligne à faire entre amis',
    lead: 'Vos amis sont loin, et personne n’a de dés sous la main ? Sur <a href="/" data-play>421online.com</a>, une table privée se crée en une minute. Chacun la rejoint depuis son téléphone ou son ordinateur, sans rien installer, et les dés roulent en 3D pour tout le monde en même temps.',
    image: { src: '/img/salon-421.webp', w: 390, h: 844, alt: 'Salon d’une table privée de dés sur téléphone, avec le code de la table et les boutons de partage', caption: 'Le salon : partagez le code ou le lien, vos amis s’assoient aux places libres.' },
    body: `
${play('Créer une table entre amis', 'Gratuit, sans téléchargement', '/?jouer=amis')}
${toc([['etapes', 'Inviter ses amis, étape par étape'], ['quel-jeu', 'Quel jeu choisir à plusieurs ?'], ['sans-compte', 'Vos amis n’ont pas besoin d’installer quoi que ce soit'], ['soiree', 'Des idées pour une soirée'], ['equitable', 'Personne ne peut truquer les dés']])}

<h2 id="etapes">Inviter ses amis, étape par étape</h2>
<ol class="steps">
<li><b>Ouvrez le jeu</b> et choisissez le jeu à lancer : le 421, le Courtisan (Dix mille) ou le Poker menteur.</li>
<li><b>Créez une table privée</b> : elle reçoit un code de 5 lettres.</li>
<li><b>Envoyez le code</b> (ou, au 421, directement le lien) dans votre conversation de groupe.</li>
<li><b>Lancez la partie</b> quand tout le monde est assis. S’il manque quelqu’un, l’hôte peut compléter avec des joueurs ordinateur.</li>
</ol>

<h2 id="quel-jeu">Quel jeu choisir à plusieurs ?</h2>
<div class="table-wrap"><table>
<thead><tr><th>Jeu</th><th>Joueurs</th><th>L’ambiance</th></tr></thead>
<tbody>
<tr><td><a href="/421-entre-amis">Le 421</a></td><td>2 à 6</td><td>Trois dés, des jetons à refiler aux autres : le classique du comptoir, avec vos propres règles maison.</td></tr>
<tr><td><a href="/dix-mille-en-ligne">Le Courtisan (Dix mille)</a></td><td>2 à 6</td><td>Six dés et une question : relancer ou encaisser ? Parfait pour les amateurs de « stop ou encore ».</td></tr>
<tr><td><a href="/coups-fourres">Coups Fourrés</a></td><td>2 à 4</td><td>Le 421 avec un deck de cartes, des pièges et du bluff, pour ceux qui aiment la stratégie.</td></tr>
<tr><td><a href="/poker-menteur-en-ligne">Le Poker menteur</a></td><td>2 à 6</td><td>Cinq dés de poker sous un gobelet qui passe de main en main : on annonce, on bluffe, on crie « Menteur ! ».</td></tr>
</tbody></table></div>

<h2 id="sans-compte">Vos amis n’ont pas besoin d’installer quoi que ce soit</h2>
<p>Tout se passe dans le navigateur, sur Android, iPhone, iPad, Windows, Mac ou Linux, et les joueurs d’une même table peuvent mélanger les appareils. Pour une partie sans mise, on peut s’asseoir en choisissant simplement un nom. Un compte gratuit, sans adresse e-mail, ajoute la liste d’amis, les messages et la progression gardée d’un appareil à l’autre.</p>

<h2 id="soiree">Des idées pour une soirée</h2>
<ul>
<li><b>La revanche au 421</b> : le dernier à garder des jetons choisit le gage (sans alcool obligatoire).</li>
<li><b>Le tour de table au Dix mille</b> : une partie en 2 000 points pour se chauffer, puis la vraie en 10 000.</li>
<li><b>Sur un seul téléphone</b> : au 421, vous pouvez aussi vous passer l’appareil autour de la table.</li>
<li><b>Le bluff au Poker menteur</b> : en visio, on voit enfin la tête de celui qui annonce un full… (<a href="/regles-du-poker-menteur">règles du poker menteur</a>).</li>
<li><b>En visio</b> : gardez votre appel habituel ouvert à côté, le jeu s’occupe des dés et des comptes.</li>
</ul>

<h2 id="equitable">Personne ne peut truquer les dés</h2>
<p>En ligne, le serveur tire chaque dé au sort : aucun joueur ne peut influencer le résultat, et tout le monde voit les mêmes dés rouler. Le jeu compte les points et applique les règles, donc plus de discussion sur le score.</p>
${play('Lancer les dés avec vos amis', 'Sur téléphone et ordinateur', '/?jouer=amis')}
`,
    faq: [
      ['Comment jouer aux dés en ligne avec des amis ?', 'Créez une table privée sur 421online.com, envoyez le code à vos amis et lancez la partie quand tout le monde est assis. C’est gratuit et rien n’est à installer.'],
      ['À combien peut-on jouer ?', 'De 2 à 6 joueurs au 421, au Courtisan (Dix mille) et au Poker menteur, de 2 à 4 à Coups Fourrés.'],
      ['Mes amis doivent-ils créer un compte ?', 'Non pour une partie sans mise : il suffit de choisir un nom. Un compte gratuit, sans adresse e-mail, sert à garder sa progression et à avoir une liste d’amis.'],
      ['Peut-on jouer sur téléphone et ordinateur à la même table ?', 'Oui, les joueurs d’une même table peuvent utiliser des appareils différents.'],
    ],
    related: ['421-entre-amis', 'dix-mille-en-ligne', 'jeux-entre-amis-a-distance'],
  },
  {
    slug: 'jeux-de-des-en-ligne', nav: 'Dés en ligne', short: 'Jeux de dés en ligne gratuits', ...dates,
    blurb: 'Le 421, le Dix mille, Coups Fourrés et le Poker menteur : quatre jeux de dés dans le navigateur.',
    title: 'Jeux de dés en ligne gratuits, seul ou en multijoueur',
    description: 'Quatre jeux de dés en ligne gratuits : 421, Dix mille (Farkle), Coups Fourrés et Poker menteur. Seul contre l’ordinateur ou en multijoueur, sans téléchargement.',
    h1: 'Jeux de dés en ligne gratuits',
    lead: 'Pas de simulateur de lancer ici, mais de vraies parties. <a href="/" data-play>421online.com</a> réunit quatre jeux de dés jouables tout de suite dans un bac en 3D, contre l’ordinateur ou contre d’autres joueurs, sans téléchargement, sans publicité et sans achat.',
    image: { src: '/img/partie-421.webp', w: 390, h: 844, alt: 'Partie de dés en ligne sur téléphone : trois dés dans le bac en 3D et les adversaires en haut de l’écran', caption: 'Une partie de 421 sur téléphone.' },
    body: `
${toc([['jeux', 'Les quatre jeux'], ['choisir', 'Lequel choisir ?'], ['modes', 'Seul ou à plusieurs'], ['classiques', 'Et les autres jeux de dés ?']])}

<h2 id="jeux">Les quatre jeux</h2>
<div class="cards">
<section class="card"><h3>Le 421</h3><p>Le jeu de dés des bistrots français : trois dés, trois lancers, la charge puis la décharge. <a href="/jouer-au-421-en-ligne">Jouer au 421 en ligne</a> ou lire les <a href="/regles-du-421">règles</a>.</p></section>
<section class="card"><h3>Le Courtisan</h3><p>Le Dix mille à six dés, aussi appelé Farkle : mettre de côté ce qui rapporte, puis relancer ou encaisser. <a href="/dix-mille-en-ligne">Découvrir le Courtisan</a>.</p></section>
<section class="card"><h3>Coups Fourrés</h3><p>Le duel de dés du 421 avec un deck de 20 cartes : pièges, relances et bluff. <a href="/coups-fourres">Découvrir Coups Fourrés</a>.</p></section>
<section class="card"><h3>Le Poker menteur</h3><p>Cinq dés de poker sous un gobelet qui circule : annoncer, croire ou crier « Menteur ! ». <a href="/poker-menteur-en-ligne">Jouer au poker menteur</a> ou lire les <a href="/regles-du-poker-menteur">règles</a>.</p></section>
</div>

<h2 id="choisir">Lequel choisir ?</h2>
<ul>
<li><b>Vous voulez une partie simple, à plusieurs</b> : le 421.</li>
<li><b>Vous aimez prendre des risques</b> : le Courtisan, où un seul mauvais lancer peut effacer tout votre tour.</li>
<li><b>Vous aimez les jeux de cartes à collectionner</b> : Coups Fourrés.</li>
<li><b>Vous aimez bluffer et lire dans le jeu des autres</b> : le Poker menteur.</li>
<li><b>Vous avez aimé les parties de dés d’un jeu vidéo médiéval</b> : voyez notre page sur le <a href="/jeu-de-des-kingdom-come-deliverance-2">jeu de dés de Kingdom Come: Deliverance 2</a>.</li>
</ul>

<h2 id="modes">Seul ou à plusieurs</h2>
<p>Chaque jeu se joue contre des adversaires ordinateur de plusieurs niveaux, pour apprendre ou passer cinq minutes. En ligne, vous pouvez rejoindre une partie rapide, ou <a href="/jeu-de-des-entre-amis">créer une table privée pour vos amis</a>. Le 421 propose aussi deux tournois par jour, à 11 h et à 21 h, et un défi du jour.</p>

<h2 id="classiques">Et les autres jeux de dés ?</h2>
<p>Yams, Perudo, 5000, Zanzibar… Notre <a href="/jeux-de-des">tour d’horizon des jeux de dés classiques</a> explique leurs différences. Si vous cherchez le « jeu de comptoir » par excellence, lisez aussi notre page sur le <a href="/jeu-de-bistrot-en-ligne">jeu de bistrot en ligne</a>.</p>
${play('Choisir un jeu et lancer les dés', 'Gratuit, sans téléchargement')}
`,
    faq: [
      ['Quels jeux de dés peut-on jouer en ligne gratuitement ici ?', 'Le 421, le Dix mille (ou Farkle) sous le nom du Courtisan, Coups Fourrés, un jeu de cartes et de dés, et le Poker menteur, le jeu de bluff aux dés de poker.'],
      ['Faut-il télécharger une application ?', 'Non, les jeux s’ouvrent dans le navigateur d’un téléphone ou d’un ordinateur.'],
      ['Peut-on jouer sans adversaire humain ?', 'Oui, chaque jeu se joue contre l’ordinateur, avec plusieurs niveaux de difficulté.'],
      ['Y a-t-il de l’argent réel en jeu ?', 'Non. Les monnaies du jeu sont virtuelles, elles ne s’achètent pas et ne se retirent pas.'],
    ],
    related: ['jeu-de-des-entre-amis', 'jouer-au-421-en-ligne', 'poker-menteur-en-ligne', 'jeux-de-des'],
  },
  {
    slug: 'jeu-de-bistrot-en-ligne', nav: 'Jeu de bistrot', short: 'Jeu de bistrot en ligne', ...dates,
    blurb: 'L’ambiance du comptoir à distance : le 421, ses habitués, ses jetons et ses tournois.',
    title: 'Jeu de bistrot en ligne : le 421 du comptoir, gratuit',
    description: 'Retrouvez l’ambiance du comptoir en ligne : le 421, le jeu de bistrot par excellence, contre les habitués ou entre amis. Gratuit, sur téléphone et ordinateur.',
    h1: 'Le jeu de bistrot, en ligne',
    lead: 'Le bruit des dés sur la piste, les jetons qu’on refile au voisin, le perdant qui paie sa tournée : le 421 est le jeu de bistrot français par excellence. <a href="/" data-play>421online.com</a> le met dans votre poche, sans rien perdre de ce qui fait son charme.',
    body: `
${play('Entrer au comptoir', 'Gratuit, sans téléchargement')}
${toc([['tradition', 'Pourquoi le 421 au bistrot ?'], ['comptoir', 'Le comptoir, version en ligne'], ['maison', 'Les règles de la maison'], ['autres', 'Les autres jeux du comptoir']])}

<h2 id="tradition">Pourquoi le 421 au bistrot ?</h2>
<p>Trois dés, quelques jetons, pas besoin de table : le 421 tient sur un coin de zinc, se joue debout et s’interrompt sans drame. Sa combinaison reine, 4-2-1, lui a donné son nom. Le dernier à garder des jetons a perdu, et la tradition veut qu’il paie la tournée. Pour réviser, voici les <a href="/regles-du-421">règles du 421</a> et les <a href="/combinaisons-du-421">combinaisons</a>.</p>

<h2 id="comptoir">Le comptoir, version en ligne</h2>
<ul>
<li><b>Les habitués</b> : des adversaires ordinateur avec leur nom, leur caractère et leurs répliques de comptoir.</li>
<li><b>Le bac en 3D</b> : lancez d’un glissement de doigt, les dés rebondissent vraiment.</li>
<li><b>La table entre copains</b> : une <a href="/421-entre-amis">table privée</a> de 2 à 6 joueurs, avec un simple lien.</li>
<li><b>Le Patron de la semaine</b> : un adversaire spécial à battre, qui change chaque lundi.</li>
<li><b>Les tournois</b> : deux rendez-vous par jour, à 11 h et à 21 h.</li>
</ul>

<h2 id="maison">Les règles de la maison</h2>
<p>D’un bistrot à l’autre, le 421 change. Avant la partie, vous réglez le nombre de jetons, de lancers, la valeur des combinaisons et la règle d’égalité, pour jouer comme à votre comptoir habituel.</p>

<h2 id="autres">Les autres jeux du comptoir</h2>
<p>Quand le 421 ne suffit plus : <a href="/dix-mille-en-ligne">Le Courtisan</a> (le Dix mille à six dés), <a href="/coups-fourres">Coups Fourrés</a> (le 421 aux cartes) et le <a href="/poker-menteur-en-ligne">Poker menteur</a>, l’autre grand jeu de dés des cafés, où l’on se passe le gobelet en bluffant. À consommer sans modération, et sans alcool : ici, les seules tournées sont virtuelles.</p>
${play('Lancer les dés au comptoir', 'Contre les habitués ou entre amis')}
`,
    faq: [
      ['Quel est le jeu de bistrot le plus connu en France ?', 'Le 421 est l’un des jeux de dés les plus répandus dans les bistrots français, joué avec trois dés et des jetons.'],
      ['Peut-on jouer à un jeu de bistrot en ligne gratuitement ?', 'Oui, le 421 se joue gratuitement sur 421online.com, sans téléchargement, seul ou entre amis.'],
      ['Peut-on garder ses règles de bistrot ?', 'Oui, le nombre de jetons, de lancers, la valeur des combinaisons et la règle d’égalité se règlent avant la partie.'],
    ],
    related: ['jouer-au-421-en-ligne', 'regles-du-421', 'jeu-de-des-entre-amis'],
  },
  {
    slug: 'jouer-au-farkle-en-ligne', nav: 'Farkle', short: 'Jouer au Farkle en ligne', ...dates, updated: '2026-11-09', parent: 'dix-mille-en-ligne', about: 'courtisan', play: CT_PLAY,
    og: '/og-courtisan.jpg',
    blurb: 'Le Farkle à six dés, gratuit, en français : seul ou de 2 à 6 avec vos amis.',
    title: 'Jouer au Farkle en ligne gratuit, seul ou entre amis',
    description: 'Le Farkle en ligne, gratuit et en français : six dés, seul contre l’ordinateur ou de 2 à 6 avec vos amis. Le jeu de dés popularisé par Kingdom Come: Deliverance 2.',
    h1: 'Jouer au Farkle en ligne, seul ou entre amis',
    lead: `Vous avez découvert le <b>Farkle</b> dans une taverne de <i>Kingdom Come: Deliverance 2</i>, et vous aimeriez y jouer avec de vrais amis ? C’est de cette envie qu’est né <b>Le Courtisan</b> : le Farkle traditionnel, appelé <b>Dix mille</b> en France, gratuit dans le navigateur sur <a href="${CT_PLAY}" data-play>421online.com</a>.`,
    body: `
<p class="note">${INDEP} Le Courtisan est le jeu de dés traditionnel, pas une adaptation officielle : il n’a ni personnages, ni images, ni dés spéciaux du jeu vidéo.</p>
${play('Jouer au Farkle maintenant', 'Gratuit, sans téléchargement, en français', CT_PLAY)}
${toc([['amis', 'Jouer avec ses amis'], ['regle', 'La règle en bref'], ['noms', 'Farkle, Dix mille, Zilch'], ['niveau', 'S’entraîner contre l’ordinateur']])}

<h2 id="amis">Jouer avec ses amis</h2>
<ol class="steps">
<li>Ouvrez <a href="${CT_PLAY}" data-play>Le Courtisan</a> et créez une table en ligne.</li>
<li>Donnez le code de la table à vos amis : de 2 à 6 joueurs, sur téléphone ou ordinateur.</li>
<li>Choisissez 2 000, 4 000 ou 10 000 points, et lancez les six dés.</li>
</ol>
<p>Il manque du monde ? Complétez la table avec des joueurs ordinateur. Vous pouvez jouer sans mise, ou pimenter la partie avec les Groschen, une monnaie virtuelle du jeu réservée aux comptes (sans argent réel).</p>

<h2 id="regle">La règle en bref</h2>
<p>À chaque lancer, mettez de côté au moins un dé qui rapporte : un 1 vaut 100 points, un 5 vaut 50, trois dés identiques valent cent fois leur valeur (1 000 pour trois 1). Puis relancez le reste ou encaissez. Si aucun dé ne rapporte, vous perdez les points du tour. Tout le détail est sur la page <a href="/regles-du-dix-mille">règles du Dix mille</a>.</p>

<h2 id="noms">Farkle, Dix mille, Zilch</h2>
<p>Ce jeu traditionnel porte plusieurs noms selon les pays : Farkle ou Zilch en anglais, Dix mille, 10 000 ou 5000 en français. Les détails varient, comme la valeur de certaines suites. Notre page sur le <a href="/jeu-de-des-kingdom-come-deliverance-2">jeu de dés de Kingdom Come: Deliverance 2</a> compare les règles de base.</p>

<h2 id="niveau">S’entraîner contre l’ordinateur</h2>
<p>Trois niveaux d’adversaires, du Débutant à la Fine fouine qui calcule ses risques. Pour progresser, notre <a href="/strategie-dix-mille">guide de stratégie</a> indique à partir de combien de points il vaut mieux encaisser.</p>
${play('Lancer les six dés', 'Contre l’ordinateur ou entre amis', CT_PLAY)}
`,
    faq: [
      ['Où jouer au Farkle en ligne gratuitement ?', 'Sur 421online.com, dans le mode Le Courtisan : gratuit, dans le navigateur, seul ou de 2 à 6 joueurs en ligne.'],
      ['Peut-on jouer au Farkle en ligne avec des amis ?', 'Oui, créez une table en ligne et donnez le code à vos amis, de 2 à 6 joueurs.'],
      ['Le jeu de dés de Kingdom Come: Deliverance 2 est-il disponible ici ?', 'Non : le Courtisan est le jeu de dés traditionnel dont il s’inspire, sans dés spéciaux ni contenu du jeu vidéo. 421online.com est un site indépendant.'],
      ['Le site est-il en français ?', 'Oui, le jeu et ses règles sont en français.'],
    ],
    related: ['dix-mille-en-ligne', 'jeu-de-des-kingdom-come-deliverance-2', 'regles-du-dix-mille'],
  },
  {
    slug: 'jeu-apero-a-distance', nav: 'Apéro à distance', short: 'Jeu pour un apéro à distance', ...dates,
    blurb: 'Un jeu rapide à lancer pendant un appel vidéo, sans installation ni préparation.',
    title: 'Jeu pour un apéro à distance : les dés en ligne entre amis',
    description: 'Un jeu pour votre apéro à distance : ouvrez une table de dés en ligne pendant votre appel vidéo, envoyez le code et jouez. Gratuit, rien à installer.',
    h1: 'Quel jeu pour un apéro à distance ?',
    lead: 'L’appel vidéo a commencé, tout le monde a raconté sa semaine, et maintenant ? Une table de dés se lance en moins d’une minute sur <a href="/" data-play>421online.com</a> : les parties sont courtes, tout le monde comprend vite et personne n’a besoin de matériel.',
    body: `
${toc([['pourquoi', 'Pourquoi les dés marchent bien en visio'], ['comment', 'Organiser la partie'], ['formats', 'Quel format selon le temps ?'], ['grand', 'Pour une plus grande soirée']])}

<h2 id="pourquoi">Pourquoi les dés marchent bien en visio</h2>
<ul>
<li><b>Pas de préparation</b> : un navigateur suffit, le lien part dans la conversation du groupe.</li>
<li><b>Les règles s’apprennent en jouant</b> : le jeu compte les points pour vous.</li>
<li><b>On peut parler en même temps</b> : un tour de dés ne demande pas toute votre attention.</li>
<li><b>Tout le monde voit la même chose</b> : pas de « montre tes dés à la caméra ».</li>
</ul>

<h2 id="comment">Organiser la partie</h2>
<ol class="steps">
<li>Gardez votre appel vidéo ouvert (le jeu ne fournit pas la visio).</li>
<li>Une personne <a href="/jeu-de-des-entre-amis">crée une table privée</a> et envoie le code ou le lien.</li>
<li>Chacun rejoint depuis son téléphone ou son ordinateur, sans compte pour une partie sans mise.</li>
</ol>

<h2 id="formats">Quel format selon le temps ?</h2>
<div class="table-wrap"><table>
<thead><tr><th>Temps</th><th>Notre conseil</th></tr></thead>
<tbody>
<tr><td>Une partie vite fait</td><td><a href="/dix-mille-en-ligne">Le Courtisan</a> en 2 000 points</td></tr>
<tr><td>Le classique de l’apéro</td><td><a href="/421-entre-amis">Le 421</a>, avec vos règles maison</td></tr>
<tr><td>Pour les bluffeurs</td><td><a href="/poker-menteur-en-ligne">Le Poker menteur</a>, de 2 à 6, en 3 ou 5 vies</td></tr>
<tr><td>Une longue soirée</td><td>Un tournoi privé au 421, ou Le Courtisan en 10 000 points</td></tr>
</tbody></table></div>
<p>Le perdant choisit le gage, offre le prochain verre lors de vos retrouvailles, ou simplement sa revanche : avec ou sans alcool, le jeu ne change pas.</p>

<h2 id="grand">Pour une plus grande soirée</h2>
<p>Plus de six personnes ? Créez un tournoi au 421 : plusieurs tables, un vainqueur. Et d’autres idées sont sur notre page <a href="/jeux-entre-amis-a-distance">jeux entre amis à distance</a>.</p>
${play('Ouvrir une table pour l’apéro', 'Gratuit, rien à installer', '/?jouer=amis')}
`,
    faq: [
      ['Quel jeu faire pendant un apéro en visio ?', 'Un jeu de dés en ligne comme le 421 : une table se crée en une minute, les règles sont simples et on peut discuter en jouant.'],
      ['Le jeu inclut-il un appel vidéo ?', 'Non. Gardez votre application habituelle ouverte et jouez dans le navigateur à côté.'],
      ['Faut-il un compte pour participer ?', 'Non pour une partie sans mise : choisir un nom suffit.'],
    ],
    related: ['jeu-de-des-entre-amis', 'jeux-entre-amis-a-distance', '421-entre-amis'],
  },
];
