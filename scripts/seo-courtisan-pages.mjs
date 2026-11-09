/**
 * Pages d'aide du mode « Le Courtisan » (le jeu de dés traditionnel du Dix mille, ou Farkle),
 * utilisées par scripts/build-seo.mjs.
 *
 * Sources des chiffres (rien n'est inventé) :
 *  - règles et valeurs : le moteur du mode, shared/dixmille/engine.ts (lu directement ci-dessous) ;
 *  - probabilités, espérances et seuils « encaisser à partir de » : `npx tsx scripts/courtisan-probas.ts`
 *    (calcul exact à partir du moteur), à relancer si les règles changent ;
 *  - durée d'une partie : `npx tsx scripts/dixmille-simulate.ts --games 2000` (deux ordinateurs Habitué :
 *    environ 3 tours chacun en 2 000, 6 à 7 en 4 000, 17 à 18 en 10 000 ; mesuré AVANT la règle du dernier
 *    tour : comme dans le jeu, le premier qui atteint l'objectif gagne aussitôt).
 *  - Groschen (monnaie virtuelle du mode, sans argent réel) : 20 offerts chaque jour, mise au choix ou partie
 *    gratuite, le gagnant emporte le pot (décision de Sam, code en cours dans un autre dossier).
 *  - page Kingdom Come: Deliverance 2 : uniquement des règles de base vérifiées dans plusieurs guides de presse
 *    (GamesRadar, Shacknews) et sur le wiki du premier jeu ; aucun nom de dé spécial, d'objet ni de personnage
 *    du jeu vidéo, aucune image, aucun texte recopié. Mention d'indépendance bien visible.
 *
 * Bouton « Jouer » : CT_PLAY ouvre directement le mode (paramètre à brancher dans client/src/App.tsx,
 * comme /?mode=cartes pour Coups Fourrés). Images : scripts/shots-courtisan-seo.mjs.
 */
// Le moteur (shared/dixmille/engine.ts) importe d'autres modules sans extension : Node ne peut pas le lire
// directement. Ses deux réglages utiles ici sont recopiés, et tests/seo.test.ts vérifie qu'ils sont identiques.
export const DM_TARGETS = [2000, 4000, 10000];
/** Valeur de N dés identiques (N ≥ 3) : valeur × 100 (1 000 pour les 1), doublée par dé en plus. */
export const kindValue = (face, n) => (n < 3 ? 0 : (face === 1 ? 1000 : face * 100) * 2 ** (n - 3));

/** Lien qui ouvre directement le mode dans le jeu. */
export const CT_PLAY = '/?mode=courtisan';
export const CT_OG = '/og-courtisan.jpg';

const UPDATED = '2026-11-07';
const fmt = (n) => n.toLocaleString('fr-FR').replace(/ | /g, ' ');
const nb = (n) => fmt(n).replace(/ /g, '&nbsp;');
const targets = DM_TARGETS.map((t) => nb(t));
const dice = (s) => `<span class="dice" role="img" aria-label="${s.split('').join('-')}">${s.split('').map((d) => `<i class="d d${d}"></i>`).join('')}</span>`;
const play = (label, sub) => `<p class="play-box"><a class="cta" href="${CT_PLAY}" data-play>${label}</a>${sub ? `<small>${sub}</small>` : ''}</p>`;
const toc = (items) => `<nav class="toc" aria-label="Sommaire"><b>Sommaire</b><ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;
const image = { src: '/img/partie-courtisan.webp', w: 390, h: 844, alt: 'Partie du Courtisan sur téléphone : six dés dans le bac en 3D, les scores des joueurs en haut et les boutons Relancer et Encaisser en bas', caption: 'Une partie contre l’ordinateur, sur téléphone : objectif 4 000 points.' };
const common = { published: UPDATED, updated: UPDATED, play: CT_PLAY, og: CT_OG, about: 'courtisan' };

// Valeurs (calculées avec le moteur).
const kinds = [1, 2, 3, 4, 5, 6].map((f) => [f, [3, 4, 5, 6].map((n) => kindValue(f, n))]);
const row = (label, d, pts) => `<tr><td>${label}<br>${dice(d)}</td><td>${pts}</td></tr>`;
const valuesTable = `<div class="table-wrap"><table>
<thead><tr><th>Combinaison</th><th>Points</th></tr></thead>
<tbody>
${row('Un 1', '1', '100')}
${row('Un 5', '5', '50')}
${row('Trois 1', '111', nb(kindValue(1, 3)))}
${row('Trois 2, 3, 4, 5 ou 6', '444', 'valeur × 100 (trois 4 = 400)')}
${row('Quatre, cinq ou six dés identiques', '2222', 'double à chaque dé de plus (quatre 2 = 400)')}
${row('Suite 1 à 5', '12345', '500')}
${row('Suite 2 à 6', '23456', '750')}
${row('Grande suite 1 à 6', '123456', nb(1500))}
</tbody></table></div>`;
const kindsTable = `<div class="table-wrap"><table>
<thead><tr><th>Dés identiques</th><th>Trois</th><th>Quatre</th><th>Cinq</th><th>Six</th></tr></thead>
<tbody>
${kinds.map(([f, v]) => `<tr><td>${dice(String(f))} ${f === 1 ? 'des 1' : `des ${f}`}</td>${v.map((x) => `<td>${nb(x)}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
const indep = `<p class="disclaimer" role="note"><b>421online.com est un site indépendant, sans lien avec Warhorse Studios, Deep Silver ou Plaion ; Kingdom Come: Deliverance est une marque de ses propriétaires.</b> Cette page décrit le jeu de dés traditionnel dont s’inspire le jeu vidéo ; elle ne contient aucune image ni aucun texte du jeu vidéo.</p>`;

export const courtisanPages = [
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'dix-mille-en-ligne', nav: 'Le Courtisan', short: 'Le Courtisan (Dix mille)',
    blurb: 'Le jeu de dés du Dix mille (Farkle) gratuit en ligne : 6 dés, seul ou à plusieurs.',
    ...common, image, updated: '2026-11-09',
    title: 'Le Courtisan : Dix mille (Farkle) en ligne entre amis, gratuit',
    description: 'Jouez au Dix mille, le jeu à 6 dés aussi appelé Farkle : contre l’ordinateur ou en ligne de 2 à 6 avec vos amis. Gratuit, sans téléchargement.',
    h1: 'Le Courtisan : le Dix mille en ligne, gratuit',
    lead: `<b>Le Courtisan</b> est notre version du <b>Dix mille</b>, le jeu de dés « stop ou encore » que les anglophones appellent <b>Farkle</b> : six dés, des points à mettre de côté, et une question à chaque lancer… relancer pour gagner plus, ou encaisser avant de tout perdre ? Il se joue gratuitement sur <a href="${CT_PLAY}" data-play>421online.com</a>, dans le navigateur, contre l’ordinateur ou contre d’autres joueurs.`,
    body: `
${play('Jouer au Courtisan', 'Gratuit, sans téléchargement, sur téléphone et ordinateur')}
${toc([['principe', 'Le principe en trente secondes'], ['modes', 'Les façons de jouer'], ['objectif', 'Une partie de 2 000, 4 000 ou 10 000 points'], ['groschen', 'Avec ou sans mise'], ['regles-maison', 'Les règles appliquées sur 421online'], ['noms', 'Dix mille, Farkle, 5000 : un même jeu'], ['autres', 'Les autres jeux du site']])}

<h2 id="principe">Le principe en trente secondes</h2>
<ol class="steps">
<li>À votre tour, vous lancez <b>les six dés</b>.</li>
<li>Vous mettez de côté <b>au moins un dé qui rapporte</b> : un ${dice('1')} (100 points), un ${dice('5')} (50 points) ou une combinaison comme ${dice('444')} (400 points).</li>
<li>Puis vous choisissez : <b>relancer</b> les dés restants pour ajouter des points, ou <b>encaisser</b> les points du tour.</li>
<li>Un lancer où <b>aucun dé ne rapporte</b>, c’est <b>« Raté ! »</b> : les points du tour sont perdus et la main passe.</li>
<li>Les six dés ont tous rapporté ? <b>Main pleine</b> : vous pouvez relancer les six et continuer.</li>
</ol>
<p>Le jeu compte les points pour vous, refuse les dés qui ne rapportent rien et propose en un geste « tout ce qui rapporte ». Toutes les valeurs, avec des exemples de lancers, sont sur la page <a href="/regles-du-dix-mille">règles du Dix mille</a>.</p>

<h2 id="modes">Les façons de jouer</h2>
<div class="cards">
<section class="card"><h3>Contre l’ordinateur</h3><p>De <b>1 à 3 adversaires</b>, avec trois niveaux : <b>Débutant</b>, qui tente trop sa chance ; <b>Habitué</b>, qui joue raisonnablement ; et <b>Fine fouine</b>, qui calcule ses risques selon les dés qui restent et l’écart au score. Les adversaires sont les personnages du comptoir du 421, avec leurs répliques.</p></section>
<section class="card"><h3>En ligne, entre amis</h3><p>Une table de <b>2 à 6 joueurs</b>, à rejoindre avec un code : invitez vos amis, et complétez avec des joueurs ordinateur s’il manque du monde.</p></section>
<section class="card"><h3>Partie rapide</h3><p>Un bouton pour rejoindre une table qui attend des joueurs, sans rien organiser.</p></section>
<section class="card"><h3>Dans le bac en 3D</h3><p>Les six dés roulent dans le même bac en 3D que le 421 : vous les lancez d’un glissement de doigt, et vous touchez ceux que vous voulez mettre de côté.</p></section>
</div>

<h2 id="objectif">Une partie de 2 000, 4 000 ou 10 000 points</h2>
<p>Avant la partie, vous choisissez le <b>score à atteindre</b> :</p>
<div class="table-wrap"><table>
<thead><tr><th>Objectif</th><th>Pour qui ?</th><th>Durée à deux joueurs (environ)</th></tr></thead>
<tbody>
<tr><td>${targets[0]} points</td><td>Une partie rapide, pour découvrir</td><td>3 tours chacun</td></tr>
<tr><td>${targets[1]} points</td><td>Le format normal</td><td>6 à 7 tours chacun</td></tr>
<tr><td>${targets[2]} points</td><td>Le vrai « Dix mille », pour les patients</td><td>17 à 18 tours chacun</td></tr>
</tbody></table></div>
<p class="note">Durées mesurées sur des milliers de parties simulées entre deux ordinateurs de niveau Habitué, avec le moteur du jeu.</p>
<p>Le premier joueur qui atteint l’objectif en encaissant <b>gagne aussitôt</b> : la partie s’arrête là, sans tour de rattrapage pour les autres.</p>

<h2 id="groschen">Avec ou sans mise</h2>
<p>Le Courtisan a sa propre monnaie, les <b>Groschen</b> : une <b>monnaie virtuelle du jeu, sans argent réel</b>. Elle ne s’achète pas et ne se retire pas. Vous en recevez 20 chaque jour en vous connectant. Avant une partie, contre l’ordinateur comme en ligne, vous choisissez de jouer <b>gratuitement</b> ou de miser le nombre de Groschen que vous voulez ; le gagnant emporte le pot. C’est juste un peu de piment : on peut très bien ne jamais miser.</p>

<h2 id="regles-maison">Les règles appliquées sur 421online</h2>
<p>Le Dix mille se joue avec beaucoup de variantes. Voici les choix du Courtisan :</p>
<ul>
<li><b>Pas de minimum pour entrer</b> : dès votre premier tour, vous pouvez encaisser 50 points si vous le voulez.</li>
<li><b>Une combinaison se fait dans un seul lancer</b> : un 5 mis de côté, puis deux 5 au lancer suivant, ne font pas « trois 5 ».</li>
<li><b>Pas de bonus pour trois paires</b> : seuls les 1 et les 5 d’un lancer comme ${dice('112233')} rapportent.</li>
<li><b>Un raté coûte les points du tour</b>, sans autre pénalité.</li>
<li><b>Pas de dernier tour</b> : le premier qui atteint l’objectif en encaissant gagne, même si les autres n’ont pas joué autant de tours.</li>
</ul>
<p>Les détails et les cas particuliers sont sur la page <a href="/regles-du-dix-mille">règles du Dix mille</a>, et les bons réflexes (quand s’arrêter, quels dés garder) sur la page <a href="/strategie-dix-mille">stratégie du Dix mille</a>.</p>

<h2 id="noms">Dix mille, Farkle, 5000 : un même jeu</h2>
<p>Ce jeu de dés porte des noms différents selon les pays et les familles : <b>Dix mille</b> ou <b>10 000</b> en France, <b>5000</b> quand on joue en 5 000 points (parfois avec cinq dés), <b>Farkle</b> ou <b>Zilch</b> en anglais. Le principe ne change pas : mettre de côté des dés qui rapportent et savoir s’arrêter. Seuls les détails varient, comme la valeur des suites ou un minimum de points pour « ouvrir ».</p>
<p>Vous l’avez découvert dans un jeu vidéo ? Le Courtisan est né de l’envie de rejouer entre amis au jeu de dés des tavernes de <a href="/jeu-de-des-kingdom-come-deliverance-2">Kingdom Come: Deliverance 2</a>, qui repose sur le même jeu traditionnel : voyez ce qui est commun et ce qui change. Vous cherchez ce jeu sous son nom anglais ? Voici comment <a href="/jouer-au-farkle-en-ligne">jouer au Farkle en ligne</a>. 421online.com est un site indépendant de ce jeu vidéo.</p>

<h2 id="autres">Les autres jeux du site</h2>
<p>421online, c’est d’abord le <a href="/jouer-au-421-en-ligne">421 en ligne</a>, le jeu de dés de comptoir à trois dés, et <a href="/coups-fourres">Coups Fourrés</a>, le 421 aux cartes. Le même compte gratuit (sans adresse e-mail) sert pour les trois modes, avec les mêmes amis et les mêmes réglages, et les parties du Courtisan contre l’ordinateur rapportent des pièces et de l’expérience, comme le 421.</p>
${play('Lancer les six dés', 'Contre l’ordinateur ou entre amis, gratuitement')}
`,
    faq: [
      ['Le Courtisan est-il gratuit ?', 'Oui : pas d’abonnement, pas de publicité, pas d’achat. Il se joue dans le navigateur, sur téléphone comme sur ordinateur.'],
      ['Quelle différence entre le Courtisan et le Dix mille ?', 'Aucune sur le fond : le Courtisan est le nom du mode Dix mille sur 421online. Il applique les règles les plus courantes, détaillées sur la page des règles.'],
      ['Le Dix mille et le Farkle, c’est le même jeu ?', 'Oui, c’est le même jeu de dés traditionnel sous deux noms. Les variantes portent surtout sur la valeur de certaines combinaisons et sur le score à atteindre.'],
      ['Faut-il miser pour jouer ?', 'Non. Les mises se font en Groschen, une monnaie virtuelle du jeu, sans argent réel, et chaque partie peut se jouer gratuitement, sans mise.'],
      ['À combien peut-on jouer ?', 'Contre 1 à 3 adversaires ordinateur, ou de 2 à 6 joueurs à une table en ligne.'],
      ['Combien de temps dure une partie ?', 'À deux joueurs, environ 3 tours chacun en 2 000 points, 6 à 7 en 4 000 et 17 à 18 en 10 000, d’après des parties simulées avec le moteur du jeu.'],
    ],
    related: ['jouer-au-farkle-en-ligne', 'regles-du-dix-mille', 'strategie-dix-mille', 'jeu-de-des-kingdom-come-deliverance-2'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'regles-du-dix-mille', nav: 'Règles 10 000', short: 'Règles du Dix mille', parent: 'dix-mille-en-ligne',
    blurb: 'Valeurs des dés, combinaisons, raté, main pleine, fin de partie, avec des exemples.',
    ...common,
    title: 'Règles du Dix mille (Farkle) : valeur des dés et combinaisons',
    description: 'Les règles du Dix mille (Farkle) à 6 dés : valeur des 1, des 5, des brelans et des suites, raté, main pleine et fin de partie, avec des lancers commentés.',
    h1: 'Les règles du Dix mille (Farkle)',
    lead: 'Le Dix mille se joue avec six dés, de quoi noter les scores, et à partir de deux joueurs. Le but : <b>atteindre le premier le score fixé</b> (10 000 points dans la version d’origine). Voici les règles, telles qu’elles sont appliquées dans le Courtisan, le mode Dix mille de 421online.',
    body: `
${toc([['tour', 'Un tour de jeu'], ['valeurs', 'La valeur des dés'], ['identiques', 'Trois, quatre, cinq ou six dés identiques'], ['exemples', 'Des lancers commentés'], ['rate', 'Le raté'], ['main-pleine', 'La main pleine'], ['fin', 'La fin de la partie'], ['variantes', 'Les variantes courantes']])}

<h2 id="tour">Un tour de jeu</h2>
<ol class="steps">
<li>Lancez les <b>six dés</b>.</li>
<li>Mettez de côté <b>au moins un dé qui rapporte</b>. Vous pouvez en mettre plusieurs, mais <b>chaque dé mis de côté doit rapporter</b> : un 1, un 5, ou un dé qui fait partie d’une combinaison sortie dans ce lancer.</li>
<li>Choisissez : <b>relancer</b> les dés qui restent, ou <b>encaisser</b>. Encaisser ajoute à votre score tous les points mis de côté pendant le tour, et passe la main.</li>
<li>Si vous relancez, recommencez à l’étape 2 avec moins de dés… jusqu’à encaisser ou rater.</li>
</ol>
<p>Rien ne vous oblige à garder tous les dés qui rapportent : on garde parfois un seul 1 pour relancer plus de dés (la page <a href="/strategie-dix-mille">stratégie du Dix mille</a> explique quand c’est rentable).</p>

<h2 id="valeurs">La valeur des dés</h2>
${valuesTable}
<p>Les 2, 3, 4 et 6 ne rapportent rien seuls : ils comptent seulement dans un groupe de trois dés identiques ou plus, ou dans une suite.</p>

<h2 id="identiques">Trois, quatre, cinq ou six dés identiques</h2>
<p>Trois dés identiques valent leur valeur × 100, sauf trois 1 qui valent ${nb(1000)}. <b>Chaque dé identique en plus double la valeur</b> :</p>
${kindsTable}
<p>Le plus gros lancer possible est donc ${dice('111111')} : six 1, ${nb(kindValue(1, 6))} points d’un coup.</p>

<h2 id="exemples">Des lancers commentés</h2>
<div class="table-wrap"><table>
<thead><tr><th>Lancer et ce qui rapporte</th><th>Points</th></tr></thead>
<tbody>
<tr><td>${dice('133356')}<br>Trois 3 (300), le 1 (100) et le 5 (50). Le 6 reste à relancer.</td><td>450</td></tr>
<tr><td>${dice('123455')}<br>La suite 1 à 5 (500) et le second 5 (50) : les six dés rapportent, c’est une main pleine.</td><td>550</td></tr>
<tr><td>${dice('222333')}<br>Deux groupes de trois dans le même lancer : trois 2 (200) et trois 3 (300).</td><td>500</td></tr>
<tr><td>${dice('111555')}<br>Trois 1 (${nb(1000)}) et trois 5 (500).</td><td>${nb(1500)}</td></tr>
<tr><td>${dice('112233')}<br>Trois paires ne font pas de combinaison : seuls les deux 1 rapportent.</td><td>200</td></tr>
<tr><td>${dice('223346')}<br>Aucun 1, aucun 5, aucun groupe de trois, aucune suite : c’est un raté.</td><td>0</td></tr>
</tbody></table></div>

<h2 id="rate">Le raté</h2>
<p>Quand un lancer ne contient <b>aucun dé qui rapporte</b>, c’est « Raté ! » (le « farkle » des anglophones) : <b>tous les points mis de côté pendant ce tour sont perdus</b>, et c’est au joueur suivant. Les points déjà encaissés lors des tours précédents, eux, sont acquis. Plus on relance avec peu de dés, plus le risque monte : avec un seul dé, on rate deux fois sur trois.</p>

<h2 id="main-pleine">La main pleine</h2>
<p>Si vous avez mis de côté <b>les six dés</b> pendant le tour, tous en rapportant, vous avez une <b>main pleine</b> : vous pouvez reprendre les six dés et relancer, en gardant les points déjà accumulés. Vous pouvez aussi encaisser. Il n’y a pas de limite : un tour peut enchaîner plusieurs mains pleines… ou tout perdre au lancer suivant.</p>

<h2 id="fin">La fin de la partie</h2>
<p>Le score à atteindre se choisit avant la partie : ${targets.join(', ').replace(/, ([^,]+)$/, ' ou $1')} points sur 421online. <b>Le premier joueur qui l’atteint en encaissant gagne aussitôt</b>, et la partie s’arrête. Comme on ne gagne qu’en encaissant, des points mis de côté ne suffisent pas : il faut s’arrêter au bon moment.</p>

<h2 id="variantes">Les variantes courantes</h2>
<p>Autour d’une vraie table, on rencontre souvent ces règles maison. Elles ne sont <b>pas</b> utilisées dans le Courtisan, mais il vaut mieux se mettre d’accord avant de jouer :</p>
<ul>
<li><b>Minimum d’entrée</b> : il faut encaisser un premier tour d’au moins 500 ou 1 000 points pour commencer à marquer.</li>
<li><b>Trois paires</b> comptées comme une combinaison (souvent 750 ou ${nb(1500)} points).</li>
<li><b>Pénalité de raté</b> : trois ratés de suite font perdre des points.</li>
<li><b>Dernier tour</b> : quand un joueur atteint l’objectif, les autres jouent encore un tour pour tenter de le dépasser.</li>
<li><b>Le 5000</b> : la même chose en 5 000 points, parfois avec cinq dés seulement.</li>
<li><b>Valeurs différentes</b> pour quatre dés identiques ou pour les suites.</li>
</ul>
${play('Essayer une partie', 'Le jeu compte les points et refuse les dés qui ne rapportent rien')}
`,
    faq: [
      ['Combien vaut un 1 au Dix mille ?', 'Un 1 seul vaut 100 points, trois 1 valent 1 000 points, et chaque 1 de plus double : quatre 1 = 2 000, cinq 1 = 4 000, six 1 = 8 000.'],
      ['Combien vaut une suite ?', 'La suite 1 à 5 vaut 500 points, la suite 2 à 6 vaut 750 points et la grande suite 1 à 6 vaut 1 500 points, si elle sort dans un même lancer.'],
      ['Que se passe-t-il si aucun dé ne rapporte ?', 'C’est un raté : on perd tous les points du tour en cours, et la main passe. Les points déjà encaissés restent acquis.'],
      ['Peut-on relancer les six dés ?', 'Oui, quand les six dés ont été mis de côté en rapportant pendant le tour : c’est la main pleine, on relance les six et on continue à accumuler.'],
      ['Trois paires rapportent-elles des points ?', 'Pas dans le Courtisan : seuls les 1 et les 5 d’un tel lancer comptent. Certaines tables jouent cette variante.'],
    ],
    related: ['strategie-dix-mille', 'dix-mille-en-ligne', 'jeux-de-des'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'strategie-dix-mille', nav: 'Stratégie 10 000', short: 'Stratégie du Dix mille', parent: 'dix-mille-en-ligne',
    blurb: 'Quand encaisser, quand relancer, quels dés garder : les chances exactes.',
    ...common,
    title: 'Stratégie du Dix mille : quand encaisser, quand relancer',
    description: 'Quand s’arrêter au Dix mille (Farkle) ? Les chances exactes de rater selon le nombre de dés, les seuils pour encaisser et quels dés garder.',
    h1: 'Stratégie du Dix mille : quand encaisser, quand relancer ?',
    lead: 'Tout le Dix mille tient dans une décision, répétée à chaque lancer : <b>relancer ou encaisser</b>. Les chiffres de cette page sont calculés exactement, sur tous les lancers possibles, avec le moteur de règles du Courtisan (le mode Dix mille de 421online). Ils supposent ses règles : pas de minimum d’entrée, pas de combinaison pour trois paires.',
    body: `
${toc([['rater', 'Le risque de rater, selon les dés qui restent'], ['un-lancer', 'Ce que rapporte un lancer'], ['seuils', 'Quand encaisser : les seuils'], ['garder', 'Quels dés garder'], ['partie', 'Adapter à la partie'], ['erreurs', 'Les erreurs classiques']])}

<h2 id="rater">Le risque de rater, selon les dés qui restent</h2>
<p>On rate quand le lancer ne contient ni 1, ni 5, ni trois dés identiques, ni suite. Ce risque dépend uniquement du nombre de dés que vous lancez :</p>
<div class="table-wrap"><table>
<thead><tr><th>Dés lancés</th><th>Chance de rater</th><th>Soit environ</th></tr></thead>
<tbody>
<tr><td>6</td><td>3,1 %</td><td>1 fois sur 32</td></tr>
<tr><td>5</td><td>7,7 %</td><td>1 fois sur 13</td></tr>
<tr><td>4</td><td>15,7 %</td><td>1 fois sur 6</td></tr>
<tr><td>3</td><td>27,8 %</td><td>plus d’1 fois sur 4</td></tr>
<tr><td>2</td><td>44,4 %</td><td>presque 1 fois sur 2</td></tr>
<tr><td>1</td><td>66,7 %</td><td>2 fois sur 3</td></tr>
</tbody></table></div>
<p>Avec cinq ou six dés, rater est rare. À partir de trois dés, chaque relance devient un vrai pari.</p>

<h2 id="un-lancer">Ce que rapporte un lancer</h2>
<p>En prenant à chaque fois le maximum de points, un lancer rapporte en moyenne :</p>
<div class="table-wrap"><table>
<thead><tr><th>Dés lancés</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr></thead>
<tbody><tr><td>Points en moyenne (ratés compris)</td><td>25</td><td>50</td><td>87</td><td>144</td><td>242</td><td>399</td></tr></tbody>
</table></div>
<p>Sur un premier lancer de six dés : <b>36,7 %</b> de chances d’avoir au moins trois dés identiques, <b>9,3 %</b> d’avoir une suite, <b>9,8 %</b> de faire ${nb(1000)} points ou plus d’un coup, <b>6,3 %</b> que les six dés rapportent d’emblée (main pleine), et <b>1,54 %</b> pour la grande suite ${dice('123456')}.</p>

<h2 id="seuils">Quand encaisser : les seuils</h2>
<p>Pour gagner le plus de points possible en moyenne, il existe un seuil simple : <b>encaissez dès que les points du tour atteignent ce seuil</b>, selon le nombre de dés que vous auriez à relancer.</p>
<div class="table-wrap"><table>
<thead><tr><th>Dés à relancer</th><th>Encaissez à partir de</th></tr></thead>
<tbody>
<tr><td>6 (main pleine)</td><td>relancez toujours, en pratique</td></tr>
<tr><td>5</td><td>relancez toujours, en pratique (seuil : ${nb(3400)} points)</td></tr>
<tr><td>4</td><td>${nb(1050)} points</td></tr>
<tr><td>3</td><td>450 points</td></tr>
<tr><td>2</td><td>250 points</td></tr>
<tr><td>1</td><td>300 points</td></tr>
</tbody></table></div>
<p>Pourquoi un seuil plus haut avec un dé qu’avec deux ? Parce que si ce dernier dé rapporte, les six dés ont été mis de côté : c’est une <b>main pleine</b>, et vous repartez avec six dés. Le pari est risqué (deux chances sur trois de rater), mais il rapporte gros quand il passe.</p>
<p>En jouant ainsi, un tour rapporte en moyenne <b>564 points</b>, et se termine sur un raté environ <b>une fois sur cinq</b> (19,2 %).</p>

<h2 id="garder">Quels dés garder</h2>
<p>Garder tous les dés qui rapportent n’est pas toujours le meilleur choix : chaque dé gardé est un dé de moins pour la suite.</p>
<ul>
<li><b>Premier lancer ${dice('152236')}</b> : ne gardez que le 1 et relancez cinq dés. En jouant au mieux ensuite, ce choix vaut en moyenne <b>428 points</b>, contre <b>309</b> si vous gardez aussi le 5 et relancez quatre dés.</li>
<li><b>300 points de côté, trois dés lancés : ${dice('523')}</b>. Gardez le 5 et <b>encaissez</b> vos 350 points : relancer deux dés ne vaudrait que 299 points en moyenne.</li>
<li><b>Deux derniers dés : ${dice('15')}</b>. Gardez les deux : c’est une main pleine, et relancer les six dés avec 400 points en jeu vaut 906 points en moyenne.</li>
<li><b>Premier lancer ${dice('222534')}</b> : gardez les trois 2 seuls et relancez trois dés (258 points en moyenne). Avec le 5 en plus, il ne resterait que deux dés : le mieux serait alors d’encaisser 250 points.</li>
<li><b>Premier lancer ${dice('333526')}</b> : cette fois, c’est l’inverse. Gardez les trois 3 et le 5, et <b>encaissez</b> 350 points : relancer trois dés avec les trois 3 seuls ne vaudrait que 330 points. À quelques dizaines de points près, tout dépend des valeurs : d’où l’intérêt des seuils ci-dessus.</li>
</ul>

<h2 id="partie">Adapter à la partie</h2>
<p>Ces seuils maximisent les points <b>en moyenne</b>, sans regarder le score des autres. En fin de partie, le contexte compte :</p>
<ul>
<li><b>Un adversaire est tout près de l’objectif</b> et vous êtes loin derrière : prenez plus de risques, un petit tour ne vous sauvera pas.</li>
<li><b>Vous êtes en tête et l’objectif est proche</b> : encaissez plus tôt, chaque point acquis met la pression sur les autres.</li>
<li><b>Les points qui font gagner</b> : le premier qui atteint l’objectif en encaissant gagne aussitôt. Dès que les points du tour suffisent, encaissez, quel que soit le seuil.</li>
</ul>
<p>Le niveau <b>Fine fouine</b> de l’ordinateur raisonne exactement ainsi : il calcule la valeur de chaque choix selon les dés qui restent, puis prend plus de risques quand un adversaire approche du but.</p>

<h2 id="erreurs">Les erreurs classiques</h2>
<ul>
<li>Relancer deux dés avec 400 points de côté « pour voir » : presque une chance sur deux de tout perdre.</li>
<li>Garder tous les 5 par réflexe, au lieu de relancer plus de dés.</li>
<li>S’arrêter à 150 points avec cinq dés en main : le risque de rater n’est que de 7,7 %.</li>
<li>Oublier qu’une combinaison doit sortir dans un même lancer : garder deux 4 en espérant un troisième ne sert à rien.</li>
</ul>
<p class="note">Méthode : tous les lancers possibles de 1 à 6 dés sont énumérés (46 656 pour six dés), puis la meilleure décision est calculée pour chaque situation (points du tour, dés restants). Les seuils et les moyennes visent le plus de points par tour ; ce n’est pas la même chose que la meilleure chance de gagner une partie précise.</p>
${play('Mettre ces conseils en pratique', 'Contre l’ordinateur, du niveau Débutant à la Fine fouine')}
`,
    faq: [
      ['Quelle est la probabilité de rater avec 6 dés ?', 'Environ 3,1 %, soit 1 fois sur 32, quand trois paires ne comptent pas. Avec 1 dé, on rate 2 fois sur 3.'],
      ['Quand faut-il s’arrêter au Dix mille ?', 'Pour faire le plus de points en moyenne : à partir de 250 points avec 2 dés à relancer, 450 avec 3 dés et environ 1 050 avec 4 dés. Avec 5 ou 6 dés, on relance presque toujours.'],
      ['Faut-il garder tous les dés qui rapportent ?', 'Pas toujours. Au premier lancer, garder un seul 1 et relancer cinq dés vaut mieux, en moyenne, que garder un 1 et un 5 et relancer quatre dés.'],
      ['Combien rapporte un tour en moyenne ?', 'Environ 564 points en jouant au mieux, avec un raté environ une fois sur cinq.'],
    ],
    related: ['regles-du-dix-mille', 'dix-mille-en-ligne', 'strategie-421'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'jeu-de-des-kingdom-come-deliverance-2', nav: 'Dés de KCD2', short: 'Le jeu de dés de Kingdom Come: Deliverance 2', parent: 'dix-mille-en-ligne',
    blurb: 'Le jeu de dés du jeu vidéo et le Dix mille traditionnel : règles communes, où y jouer.',
    ...common, updated: '2026-11-09',
    title: 'Jeu de dés de Kingdom Come: Deliverance 2 en ligne entre amis',
    description: 'Le jeu de dés de Kingdom Come: Deliverance 2 repose sur le Farkle (Dix mille). Ses règles, et où jouer en ligne avec vos amis à la version traditionnelle, gratuite.',
    h1: 'Le jeu de dés de Kingdom Come: Deliverance 2 : les règles de base et où y jouer',
    lead: 'Dans les tavernes de <i>Kingdom Come: Deliverance 2</i>, comme dans le premier épisode, on joue aux dés contre les habitants. Ce jeu n’a pas été inventé pour le jeu vidéo : il repose sur un jeu de dés traditionnel, le <b>Farkle</b> des anglophones, que l’on appelle <b>Dix mille</b> en France. Voici ce qui est commun, ce qui change, et où jouer à la version traditionnelle sans console.',
    body: `
${indep}
${toc([['origine', 'Un jeu de dés traditionnel'], ['commun', 'Les règles de base communes'], ['different', 'Ce que le jeu vidéo ajoute'], ['jouer', 'Jouer à la version traditionnelle en ligne'], ['entrainer', 'S’entraîner : les chiffres qui ne changent pas'], ['english', 'In English']])}

<h2 id="origine">Un jeu de dés traditionnel</h2>
<p>Lancer six dés, mettre de côté ceux qui rapportent, puis décider de relancer ou de s’arrêter : c’est le principe d’une famille de jeux de dés joués bien avant les jeux vidéo, sous les noms de <b>Farkle</b>, <b>Zilch</b>, <b>Dix mille</b>, <b>10 000</b> ou <b>5000</b>. Chaque région, chaque famille a ses petites différences, mais la base est la même. Le jeu de dés de <i>Kingdom Come: Deliverance</i> en est une version, avec ses propres ajouts.</p>

<h2 id="commun">Les règles de base communes</h2>
<p>D’après les guides de joueurs publiés par la presse spécialisée, le jeu de dés de <i>Kingdom Come: Deliverance 2</i>, dans sa version de base (sans les éléments propres au jeu vidéo), compte les points comme le Dix mille traditionnel joué sur 421online :</p>
<div class="table-wrap"><table>
<thead><tr><th>Règle de base</th><th>Dans le Dix mille de 421online</th></tr></thead>
<tbody>
<tr><td>Nombre de dés</td><td>Six dés, lancés ensemble au début du tour</td></tr>
<tr><td>Mise de côté</td><td>Au moins un dé qui rapporte à chaque lancer, puis relancer le reste ou encaisser</td></tr>
<tr><td>Dés seuls</td><td>${dice('1')} = 100 points, ${dice('5')} = 50 points</td></tr>
<tr><td>Trois dés identiques</td><td>Valeur × 100, et ${nb(1000)} pour trois 1</td></tr>
<tr><td>Dés identiques en plus</td><td>Chaque dé de plus double la valeur (six 1 = ${nb(kindValue(1, 6))})</td></tr>
<tr><td>Suites</td><td>1 à 5 = 500, 2 à 6 = 750, 1 à 6 = ${nb(1500)}</td></tr>
<tr><td>Aucun dé ne rapporte</td><td>Les points du tour sont perdus</td></tr>
<tr><td>Les six dés ont rapporté</td><td>On peut relancer les six et continuer</td></tr>
<tr><td>Fin de la partie</td><td>Un score à atteindre, fixé avant la partie</td></tr>
</tbody></table></div>
<p>Les valeurs détaillées et des lancers commentés sont sur la page <a href="/regles-du-dix-mille">règles du Dix mille</a>. Certains détails peuvent différer d’une version à l’autre (score à atteindre, fin de partie, cas particuliers ; sur 421online, le premier qui atteint l’objectif en encaissant gagne aussitôt) : en cas de doute, c’est la règle du jeu auquel vous jouez qui s’applique.</p>

<h2 id="different">Ce que le jeu vidéo ajoute</h2>
<p>Dans <i>Kingdom Come: Deliverance 2</i>, le jeu de dés fait partie d’un monde de jeu de rôle. Il y ajoute des éléments qui n’existent pas dans la version traditionnelle : des <b>mises</b> dans la monnaie du jeu, des <b>dés particuliers</b> qui ne roulent pas comme des dés ordinaires, et des <b>objets à collectionner</b> qui modifient la partie. Le Courtisan n’a ni dés particuliers ni objets à effets : il se joue avec six dés ordinaires et équitables. On peut y miser, si on le veut, une monnaie virtuelle du jeu, jamais d’argent réel.</p>
<p>Ce n’est donc <b>pas</b> le même jeu que celui du jeu vidéo, ni une version officielle : c’est le jeu de dés traditionnel dont il s’inspire.</p>

<h2 id="jouer">Jouer à la version traditionnelle en ligne</h2>
<p>Envie d’une partie de dés sans lancer le jeu vidéo, ou de faire découvrir le jeu à des amis qui n’y jouent pas ? Sur <a href="${CT_PLAY}" data-play>421online.com</a>, le mode <a href="/dix-mille-en-ligne">Le Courtisan</a> permet de jouer au Dix mille :</p>
<ul>
<li><b>gratuitement</b>, sans publicité ni achat, dans le navigateur d’un téléphone ou d’un ordinateur ;</li>
<li><b>contre l’ordinateur</b>, de 1 à 3 adversaires, du niveau Débutant à la Fine fouine ;</li>
<li><b>en ligne</b>, de 2 à 6 joueurs, avec vos amis à une table à code ;</li>
<li>en <b>${targets.join(', ').replace(/, ([^,]+)$/, ' ou $1')} points</b>, selon le temps dont vous disposez.</li>
</ul>
<p>C’est même de là qu’est venue l’idée du Courtisan : pouvoir rejouer à ces parties de dés avec de vrais amis, à distance, sans lancer le jeu vidéo. Pour <a href="/jouer-au-farkle-en-ligne">jouer au Farkle en ligne</a>, il suffit de créer une table et d’envoyer son code à vos amis.</p>
<p>Le site et le jeu sont <b>en français</b>.</p>

<h2 id="entrainer">S’entraîner : les chiffres qui ne changent pas</h2>
<p>Tant que l’on joue avec des dés ordinaires, les probabilités sont les mêmes partout : avec six dés, on ne rate qu’environ une fois sur 32 ; avec deux dés, presque une fois sur deux ; avec un seul, deux fois sur trois. Ces chiffres, les seuils pour savoir quand s’arrêter et les bons réflexes sont détaillés sur la page <a href="/strategie-dix-mille">stratégie du Dix mille</a>. Ils ne tiennent évidemment pas compte des dés particuliers ni des effets propres au jeu vidéo.</p>

<h2 id="english">In English</h2>
<div lang="en">
<p>The dice game in <i>Kingdom Come: Deliverance 2</i> is based on the traditional six-dice game known as Farkle (called “Dix mille” in France). 421online.com is an independent French website, not affiliated with Warhorse Studios, Deep Silver or Plaion. You can play the traditional game for free in your browser, against the computer or with friends online, but <b>the website and the game are in French only</b>. Scoring: a 1 is 100, a 5 is 50, three of a kind is the face × 100 (three 1s: 1,000), each extra matching die doubles it, straights 1–5 = 500, 2–6 = 750, 1–6 = 1,500.</p>
</div>
${play('Jouer au Dix mille gratuitement', 'La version traditionnelle, en français, dans le navigateur')}
`,
    faq: [
      ['Le jeu de dés de Kingdom Come: Deliverance 2 est-il le Farkle ?', 'Il repose sur ce jeu traditionnel, appelé Dix mille en France, et en reprend les règles de base, avec des éléments propres au jeu vidéo en plus. Ce n’est pas exactement le même jeu.'],
      ['Combien vaut une suite au jeu de dés de KCD2 ?', 'Dans sa version de base, d’après les guides de joueurs, les mêmes valeurs que le Dix mille traditionnel : 500 pour 1 à 5, 750 pour 2 à 6 et 1 500 pour 1 à 6.'],
      ['Peut-on jouer au jeu de dés de Kingdom Come avec des amis ?', 'À sa version traditionnelle, oui : sur 421online.com, créez une table du Courtisan et donnez le code à vos amis, de 2 à 6 joueurs. Le jeu vidéo lui-même, lui, se joue seul.'],
      ['Où jouer au jeu de dés de Kingdom Come en ligne ?', 'La version traditionnelle, le Dix mille, se joue gratuitement sur 421online.com, contre l’ordinateur ou entre amis. Ce n’est pas le jeu de Kingdom Come: Deliverance, mais le jeu de dés dont il s’inspire.'],
      ['421online est-il lié à Kingdom Come: Deliverance ?', 'Non. 421online.com est un site indépendant, sans lien avec Warhorse Studios, Deep Silver ou Plaion.'],
    ],
    related: ['jouer-au-farkle-en-ligne', 'dix-mille-en-ligne', 'regles-du-dix-mille'],
  },
];
