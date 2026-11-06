/**
 * Pages d'aide du mode « Coups Fourrés » (le 421 aux cartes), utilisées par scripts/build-seo.mjs.
 * Tous les chiffres viennent du catalogue officiel (shared/cards/catalog.ts) ou du code du mode
 * (tournoi : shared/cards/tournament.ts ; ligue : shared/cards/progress.ts ; ordinateurs :
 * client/src/cards/local.ts). La durée moyenne d'un duel vient de `npx tsx scripts/cf-simulate.ts
 * --games 2000` (7,6 manches en moyenne, 20 au plus) : à refaire si l'équilibrage change.
 */
import { BOOSTER, CAPSULES, CARDS, CF_RULES, DECK_RULES, FAMILY_LABEL, RARITY_LABEL, SHARDS, STARTER_DECKS, TYPE_LABEL } from '../shared/cards/catalog.ts';

/** Lien qui ouvre directement le mode dans le jeu (client/src/cfLink.ts). */
export const CF_PLAY = '/?mode=cartes';

const R = CF_RULES;
const FAMS = ['habitues', 'ivresse', 'pieges', 'chaines'];
const FAM_TEXT = {
  habitues: 'Des alliés qui s’installent pour 3 manches (les Habitués), des Tournées en plus et de quoi annuler les petits coups adverses.',
  ivresse: 'Des dés qui tournent : relancer, retourner un dé, parier… et bousculer les dés de l’adversaire.',
  pieges: 'Des pièges posés face cachée, qui se déclenchent tout seuls chez l’adversaire. Et la Fouine pour les défausser.',
  chaines: 'Des cartes qui s’enchaînent : pioche, réductions, retouches de dés, ripostes de plus en plus fortes.',
};
const WHEN = {
  coup: 'Pendant votre tour, avant ou après un lancer, puis défaussé.',
  piege: 'Posé face cachée pendant votre tour (on paie à la pose) ; il se déclenche tout seul quand sa condition arrive chez l’adversaire.',
  riposte: 'À tout moment, en réponse à une carte adverse.',
  'dernier-mot': 'Seulement pendant l’étape « Dernier mot », juste avant les comptes.',
  habitue: 'Pendant votre tour ; il s’installe devant vous pour 3 manches.',
};
const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const cardAlt = (c) => `Carte « ${c.name} » de Coups Fourrés : ${TYPE_LABEL[c.type]}, ${RARITY_LABEL[c.rarity].toLowerCase()}, famille ${FAMILY_LABEL[c.family]}, coût ${plural(c.cost, 'Tournée')}`;
const cardImg = (c, eager) => `<img src="/img/cartes/${c.id}.webp" width="230" height="322" alt="${esc(cardAlt(c))}"${eager ? '' : ' loading="lazy"'} decoding="async">`;
/** Carte avec son texte complet (galerie) ou une légende courte (aperçu). */
const cardFig = (id, { eager = false, full = true, caption = '' } = {}) => {
  const c = byId[id];
  if (!c) throw new Error(`Carte inconnue : ${id}`);
  const meta = `${TYPE_LABEL[c.type]} · ${RARITY_LABEL[c.rarity]} · coût ${c.cost}`;
  return `<figure class="cfc cfc-${c.family}" id="${full ? c.id : `apercu-${c.id}`}">${cardImg(c, eager)}<figcaption>${full
    ? `<h3>${c.name}</h3><p class="cfc-meta">${meta}</p><p>${c.text}</p><p class="cfc-flavor">${c.flavor}</p>`
    : `<b>${FAMILY_LABEL[c.family]}</b><span>${caption}</span>`}</figcaption></figure>`;
};
const dice = (s) => `<span class="dice" aria-label="${s.split('').join('-')}">${s.split('').map((d) => `<i class="d d${d}"></i>`).join('')}</span>`;
const play = (label, sub) => `<p class="play-box"><a class="cta" href="${CF_PLAY}" data-play>${label}</a>${sub ? `<small>${sub}</small>` : ''}</p>`;
const toc = (items) => `<nav class="toc" aria-label="Sommaire"><b>Sommaire</b><ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;
const typesTable = () => `<div class="table-wrap"><table>
<thead><tr><th>Type</th><th>Quand le jouer</th><th>Exemple</th></tr></thead>
<tbody>
<tr><td><b>Coup</b></td><td>${WHEN.coup}</td><td>« Cul sec » : un lancer de plus ce tour.</td></tr>
<tr><td><b>Piège</b></td><td>${WHEN.piege}</td><td>« Faux 4-2-1 » : le 4-2-1 adverse ne vaut plus que 2.</td></tr>
<tr><td><b>Riposte</b></td><td>${WHEN.riposte} En chaîne, la dernière posée s’applique la première.</td><td>« Ticket de caisse » : annule un Coup qui coûte 4 ou moins.</td></tr>
<tr><td><b>Dernier mot</b></td><td>${WHEN['dernier-mot']}</td><td>« La note est salée » : le perdant reçoit 2 jetons de plus.</td></tr>
<tr><td><b>Habitué</b></td><td>${WHEN.habitue} ${R.maxHabitues} au plus.</td><td>« Le Vieux Marcel » : vos suites valent 4 au lieu de 2.</td></tr>
</tbody></table></div>`;

const count = (f) => CARDS.filter(f).length;
const rarities = ['commune', 'rare', 'epique', 'legendaire'];
const deckList = (d) => Object.entries(d.cards).map(([id, n]) => `${byId[id].name}${n > 1 ? ` ×${n}` : ''}`).join(', ');
const pct = (x) => `${String(Math.round(x * 1000) / 10).replace('.', ',')} %`;

export const cfPages = [
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'coups-fourres', nav: 'Coups Fourrés', short: 'Coups Fourrés, le 421 aux cartes',
    blurb: 'Le mode cartes du 421 : dés, deck de 20 cartes, pièges et bluff. Gratuit.',
    published: '2026-11-05', updated: '2026-11-06', play: CF_PLAY, og: '/og-coups-fourres.jpg', about: 'cf',
    title: 'Coups Fourrés : jeu de cartes et de dés gratuit en ligne',
    description: `Coups Fourrés, le 421 aux cartes : un duel de dés, de stratégie et de bluff avec ${CARDS.length} cartes à collectionner. Gratuit, dans le navigateur, sans téléchargement.`,
    h1: 'Coups Fourrés, le 421 aux cartes',
    lead: `Le 421 en duel, avec des cartes dans la manche : trois dés, et un <b>deck de ${R.deckSize} cartes illustrées</b> pour relancer un dé, poser un piège ou retourner la situation au dernier moment. Un jeu de stratégie et de bluff <b>gratuit</b>, dans le navigateur, sans rien télécharger.`,
    image: { src: '/img/partie-coups-fourres.webp', w: 390, h: 844, alt: 'Partie de Coups Fourrés sur téléphone : trois dés dans le bac, l’adversaire Dédé du comptoir en haut avec deux pièges cachés, et cinq cartes illustrées en main en bas de l’écran', caption: 'Une partie contre l’ordinateur : les dés au centre, vos cartes en main, les pièges cachés de l’adversaire en haut.' },
    body: `
${play('Jouer gratuitement', 'Sans téléchargement ni inscription · partie guidée de 3 minutes')}
${toc([['principe', 'Le principe en trente secondes'], ['manche', 'Une manche, pas à pas'], ['familles', 'Les quatre familles de cartes'], ['types', 'Cinq types de cartes'], ['modes', 'Les façons de jouer'], ['tournoi', 'Le tournoi du samedi soir'], ['collection', 'Collection, decks et boosters'], ['difference', 'Ce qui change par rapport au 421']])}

<h2 id="principe">Le principe en trente secondes</h2>
<ul>
<li>Chacun commence avec <b>${R.startTokens} jetons</b>. Le premier qui n’en a plus aucun gagne la partie.</li>
<li>À chaque manche, vous lancez <b>trois dés, jusqu’à trois fois</b>, en gardant ceux qui vous plaisent : ce sont les combinaisons du 421, du ${dice('421')} (8 jetons) à la nénette ${dice('221')}, la plus faible.</li>
<li>La meilleure combinaison gagne la manche, et son joueur <b>donne au perdant</b> autant de jetons qu’elle vaut.</li>
<li>Entre deux lancers, vous jouez des cartes en payant des <b>Tournées</b>, la petite monnaie de la partie : ${R.tourneesPerRound} par manche, ${R.tourneesPerRound + R.tourneesLoserBonus} pour celui qui vient de perdre.</li>
<li>Vous voyez les Tournées de l’adversaire, le nombre de cartes dans sa main et ses pièges posés… mais pas lesquels. C’est là que commence le bluff.</li>
</ul>
<p>Une règle de conception guide tout le jeu : <b>le dé garde le dernier mot</b>. Une carte aide, aucune ne garantit un 4-2-1 sans coûter cher, et chaque mauvais coup a sa parade.</p>

<h2 id="manche">Une manche, pas à pas</h2>
<ol class="steps">
<li><b>Service</b> : chacun pioche une carte et reçoit ses Tournées (${R.tourneesMax} en réserve au plus).</li>
<li><b>Le meneur</b> (le perdant de la manche précédente) lance les dés jusqu’à trois fois et joue ses cartes avant ou après chaque lancer. Son nombre de lancers fixe le maximum de l’autre joueur.</li>
<li><b>L’autre joueur</b> joue à son tour, en connaissant la combinaison à battre.</li>
<li><b>Dernier mot</b> : les deux combinaisons sont sur la table. Celui qui perd peut encore jouer une carte « Dernier mot », l’autre peut répondre, jusqu’à ce que les deux passent.</li>
<li><b>Comptes</b> : le gagnant donne ses jetons au perdant, cartes comprises. Le perdant mènera la manche suivante, avec une Tournée de plus pour se refaire.</li>
</ol>
<p>Toutes les règles, avec un exemple commenté et le lexique, sont sur la page <a href="/regles-coups-fourres">règles de Coups Fourrés</a>.</p>

<h2 id="familles">Les quatre familles de cartes</h2>
<p>Les ${CARDS.length} cartes se répartissent en quatre familles, chacune avec sa couleur et sa façon de jouer. Les familles du deck adverse sont visibles dès le début de la partie : vous savez à quoi vous attendre, pas quand.</p>
<div class="cf-grid cf-grid-4">
${cardFig('josiane', { full: false, eager: true, caption: FAM_TEXT.habitues })}
${cardFig('cul-sec', { full: false, eager: true, caption: FAM_TEXT.ivresse })}
${cardFig('croche-patte', { full: false, caption: FAM_TEXT.pieges })}
${cardFig('coup-pouce', { full: false, caption: FAM_TEXT.chaines })}
</div>
<p>Les ${CARDS.length} cartes, avec leur effet complet et leur rareté, sont réunies sur la page <a href="/cartes-coups-fourres">les cartes de Coups Fourrés</a>.</p>

<h2 id="types">Cinq types de cartes</h2>
<p>Chaque carte coûte des Tournées (le chiffre dans le petit verre, en haut à gauche) et se joue à un moment précis :</p>
${typesTable()}

<h2 id="modes">Les façons de jouer</h2>
<div class="cards">
<section class="card"><h3>Partie guidée</h3><p>Trois minutes contre Dédé du comptoir, pas à pas : le jeu vous montre les dés, les Tournées et les cartes, une étape après l’autre. Idéal si vous n’avez jamais joué au 421.</p></section>
<section class="card"><h3>Contre l’ordinateur</h3><p>Trois adversaires de niveau croissant : <b>P’tit Louis</b> (débutant), <b>Dédé du comptoir</b> (habitué) et <b>Mado la Fouine</b>, qui calcule tout, lit vos Tournées et bluffe. Avec les deux decks de départ, même sans compte.</p></section>
<section class="card"><h3>Entre amis</h3><p>Ouvrez une table à code et envoyez-la : de <b>2 à 4 joueurs</b>, ${R.startTokensMulti} jetons chacun à 3 ou 4. Vous voyez aussi quels amis sont dans Coups Fourrés, et vous pouvez les défier d’un geste.</p></section>
<section class="card"><h3>Partie classée</h3><p>Des duels contre d’autres joueurs, appariés selon leurs points, dans une <b>ligue mensuelle</b> : du Comptoir au Grand Café, avec des boosters en fin de saison selon votre division.</p></section>
<section class="card"><h3>Tournoi du samedi</h3><p>Chaque samedi soir, un tournoi gratuit à élimination directe, avec des boosters pour les meilleurs (voir ci-dessous).</p></section>
</div>
<div class="table-wrap"><table>
<thead><tr><th>Ce que vous voulez faire</th><th>Sans compte</th><th>Avec un compte gratuit</th></tr></thead>
<tbody>
<tr><td>Partie guidée, parties contre l’ordinateur</td><td>Oui (decks de départ, sans rien gagner)</td><td>Oui, avec vos decks et ${CAPSULES.vsBot} capsules par partie</td></tr>
<tr><td>Consulter les ${CARDS.length} cartes et les règles</td><td>Oui</td><td>Oui</td></tr>
<tr><td>Collection, boosters, decks personnalisés</td><td>Non</td><td>Oui (2 decks de départ et ${CAPSULES.welcomeBoosters} boosters offerts)</td></tr>
<tr><td>Tables entre amis, défis, partie classée, tournoi</td><td>Non</td><td>Oui</td></tr>
</tbody></table></div>
<p>Le compte est le même que pour le 421 classique : un pseudo et un mot de passe, <b>sans adresse e-mail</b>. Vos amis, vos messages et vos réglages sont partagés entre les deux modes.</p>

<h2 id="tournoi">Le tournoi du samedi soir</h2>
<p>Chaque <b>samedi à 20 h 30</b> (heure de Bruxelles), le salon du tournoi ouvre pour dix minutes ; le départ est donné à 20 h 40. L’inscription est <b>gratuite</b>, pendant la semaine ou dans le salon, avec votre deck actif. Les duels se jouent à élimination directe, avec les mêmes règles que la partie classée, de 4 à 32 joueurs. Le vainqueur gagne de 2 à 4 boosters selon le nombre de participants ; le finaliste en reçoit aussi, et les demi-finalistes à partir de 8 joueurs.</p>
<p>Le 421 classique a aussi ses tournois, tous les jours à 11 h et 21 h : voir <a href="/jouer-au-421-en-ligne">jouer au 421 en ligne</a>.</p>

<h2 id="collection">Collection, decks et boosters</h2>
<p>Coups Fourrés est un petit <b>jeu de cartes à collectionner</b> : ${CARDS.length} cartes, quatre raretés (commune, rare, épique, légendaire), et une version « brillante » de chaque carte, purement décorative. En découvrant le mode avec un compte, vous recevez les deux decks de départ, <b>Le Zinc</b> et <b>La Bringue</b>, et ${CAPSULES.welcomeBoosters} boosters.</p>
<ul>
<li>Un <b>booster</b> contient ${BOOSTER.size} cartes tirées au pur hasard et coûte ${BOOSTER.price} capsules.</li>
<li>Les <b>capsules</b> se gagnent en jouant : parties classées, parties contre l’ordinateur, missions du jour, ligue. <b>Elles ne s’achètent pas</b> : il n’y a rien à payer dans le jeu.</li>
<li>Vous construisez jusqu’à 5 decks de ${R.deckSize} cartes (${DECK_RULES.maxFamilies} familles au plus, une seule légendaire), ou laissez le jeu en construire un automatiquement à partir de votre collection.</li>
</ul>

<h2 id="difference">Ce qui change par rapport au 421</h2>
<p>Si vous connaissez le 421, vous savez déjà jouer aux dés : mêmes combinaisons, mêmes valeurs, trois lancers au plus, et le premier joueur qui fixe le nombre de lancers. Coups Fourrés se joue surtout <b>en duel</b>, uniquement en <b>décharge</b>, et ajoute une deuxième couche de décisions : quelle carte jouer, quand, et combien de Tournées garder pour répondre. Le hasard des dés reste là, mais une bonne lecture de l’adversaire fait souvent la différence.</p>
<p>Vous préférez les dés seuls, à plusieurs autour de la table ? Le <a href="/jouer-au-421-en-ligne">421 classique</a> est toujours là, de 2 à 6 joueurs, et ses <a href="/regles-du-421">règles</a> sont expliquées pas à pas.</p>
${play('Jouer gratuitement à Coups Fourrés', 'Dans le navigateur, sans téléchargement : la partie guidée dure 3 minutes')}
`,
    faq: [
      ['Coups Fourrés est-il gratuit ?', 'Oui, entièrement. Les boosters s’ouvrent avec des capsules, qui se gagnent en jouant et ne s’achètent pas. Il n’y a ni abonnement ni publicité.'],
      ['Faut-il télécharger une application ?', 'Non. Coups Fourrés se joue dans le navigateur, sur téléphone comme sur ordinateur, depuis 421online.com.'],
      ['Faut-il créer un compte ?', 'Non pour la partie guidée et les parties contre l’ordinateur. Un compte gratuit, sans adresse e-mail, est nécessaire pour la collection, les decks, les parties entre amis, la ligue et le tournoi du samedi.'],
      ['Combien de temps dure une partie ?', `Un duel compte en moyenne 7 à 8 manches (d’après 2 000 parties simulées avec le moteur du jeu), et jamais plus de ${R.maxRounds} : le bistrot ferme après la ${R.maxRounds}e manche.`],
      ['Faut-il connaître le 421 pour jouer ?', 'Non. La partie guidée explique les dés et les cartes en trois minutes, et l’écran de jeu indique à chaque instant la combinaison à battre et les cartes jouables.'],
      ['À combien peut-on jouer ?', 'En duel contre l’ordinateur, en partie classée et en tournoi ; de 2 à 4 joueurs à une table entre amis.'],
      ['Quel rapport avec le coup fourré du Mille Bornes ?', 'Seulement un clin d’œil au nom. Au Mille Bornes, le coup fourré est une carte jouée en réponse à une attaque. Coups Fourrés est un jeu à part entière, basé sur les dés du 421 ; ses cartes de réponse s’appellent des Ripostes.'],
    ],
    related: ['regles-coups-fourres', 'cartes-coups-fourres', 'jouer-au-421-en-ligne'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'regles-coups-fourres', nav: 'Règles CF', short: 'Règles de Coups Fourrés', parent: 'coups-fourres',
    blurb: 'Manche, Tournées, types de cartes, pièges, partie à 3 ou 4, lexique.',
    published: '2026-11-05', updated: '2026-11-06', play: CF_PLAY, og: '/og-coups-fourres.jpg', about: 'cf',
    title: 'Règles de Coups Fourrés : manche, Tournées, cartes et lexique',
    description: 'Les règles de Coups Fourrés, le 421 aux cartes : déroulé d’une manche, combinaisons, Tournées, types de cartes, pièges, parties à 3 ou 4 et lexique.',
    h1: 'Les règles de Coups Fourrés',
    lead: `Coups Fourrés reprend les dés et les combinaisons du 421, et y ajoute un deck de ${R.deckSize} cartes par joueur. Voici les règles complètes du duel, puis celles de la partie à 3 ou 4, avec un exemple commenté et le lexique. Dans le jeu, tout est appliqué automatiquement : vous n’avez rien à retenir pour commencer.`,
    body: `
${toc([['but', 'Le but'], ['mise-en-place', 'Mise en place'], ['manche', 'Une manche'], ['combinaisons', 'Les combinaisons'], ['tournees', 'Les Tournées'], ['types', 'Les types de cartes'], ['exemple', 'Exemple commenté'], ['fin', 'Fin de partie'], ['plus', 'Petits plus'], ['multi', 'À 3 ou 4 joueurs'], ['deck', 'Deck et collection'], ['conseils', 'Conseils pour débuter'], ['lexique', 'Lexique']])}

<h2 id="but">Le but</h2>
<p>On joue au 421 en <b>décharge</b> : chacun commence avec <b>${R.startTokens} jetons</b> (${R.startTokensMulti} à 3 ou 4 joueurs). Le premier à n’avoir plus aucun jeton gagne la partie.</p>

<h2 id="mise-en-place">Mise en place</h2>
<ul>
<li>Chaque joueur mélange son deck de ${R.deckSize} cartes et en pioche ${R.startHand}.</li>
<li>Il peut renvoyer jusqu’à ${R.mulligan} cartes sous son deck et en repiocher autant, une seule fois.</li>
<li>Le premier meneur est tiré au sort.</li>
</ul>

<h2 id="manche">Une manche</h2>
<ol class="steps">
<li><b>Service</b> : chacun pioche 1 carte et reçoit ${R.tourneesPerRound} Tournées (${R.tourneesPerRound + R.tourneesLoserBonus} pour le perdant de la manche précédente). Réserve : ${R.tourneesMax} Tournées au plus.</li>
<li><b>Tour du meneur</b> : il lance les 3 dés jusqu’à ${R.maxThrows} fois, garde des dés entre deux lancers et s’arrête quand il veut. Il peut jouer des cartes avant ou après chaque lancer. Son nombre de lancers fixe le maximum de l’autre joueur.</li>
<li><b>Tour de l’autre joueur</b>, dans cette limite, en voyant le résultat du meneur.</li>
<li><b>Dernier mot</b> : les deux combinaisons sont sur la table. Le joueur qui perd à ce moment peut jouer une carte « Dernier mot » ; l’autre peut répondre, et ainsi de suite jusqu’à ce que les deux passent.</li>
<li><b>Comptes</b> : le gagnant donne au perdant autant de jetons que vaut sa combinaison, cartes comprises, sans plafond. En cas d’égalité parfaite, personne ne donne rien.</li>
<li><b>Fin de manche</b> : le perdant devient le meneur de la manche suivante.</li>
<li><b>Commande du comptoir</b> : au début de chaque manche, une règle bonus tirée au hasard vaut pour tout le monde, le temps de la manche (les brelans valent 2 de plus, un lancer de plus, le perdant pioche 2 cartes…).</li>
</ol>

<h2 id="combinaisons">Les combinaisons</h2>
<p>Ce sont celles du 421, de la plus forte à la plus faible. La valeur est le nombre de jetons que le gagnant donne au perdant, avant l’effet des cartes.</p>
<div class="table-wrap"><table>
<thead><tr><th>Combinaison</th><th>Exemple</th><th>Valeur</th></tr></thead>
<tbody>
<tr><td>4-2-1</td><td>${dice('421')}</td><td>8 jetons</td></tr>
<tr><td>Trois as</td><td>${dice('111')}</td><td>7 jetons</td></tr>
<tr><td>Deux as + x, puis brelan de x</td><td>${dice('511')} ${dice('666')}</td><td>x jetons</td></tr>
<tr><td>Suite</td><td>${dice('543')}</td><td>2 jetons</td></tr>
<tr><td>Le reste</td><td>${dice('652')}</td><td>1 jeton</td></tr>
<tr><td>Nénette (la plus faible)</td><td>${dice('221')}</td><td>son perdant reçoit au moins 2 jetons</td></tr>
</tbody></table></div>
<p>Le classement détaillé et les probabilités de chaque combinaison sont sur la page <a href="/combinaisons-du-421">combinaisons du 421</a>.</p>

<h2 id="tournees">Les Tournées</h2>
<p>Les Tournées paient les cartes : le chiffre dans le petit verre de chaque carte est son coût. On en reçoit à chaque service, certaines cartes en donnent (« Tournée du patron » : +2), d’autres font perdre toutes les siennes à l’adversaire (« Domino »). Les Tournées de chaque joueur sont <b>visibles de tous</b> : un adversaire à zéro Tournée ne peut presque rien jouer, un adversaire à quatre ou plus peut préparer un gros coup.</p>

<h2 id="types">Les types de cartes</h2>
${typesTable()}
<ul>
<li><b>Pièges</b> : ${R.maxTraps} posés au plus. On voit combien l’adversaire en a posé, jamais lesquels. Un piège qui ne s’est pas déclenché en ${R.trapReturnRounds} manches revient dans la main de son propriétaire.</li>
<li><b>Habitués</b> : ${R.maxHabitues} en jeu au plus. Chacun reste ${R.habitueRounds} manches, sauf s’il est chassé avant (par exemple par « Fermeture ! »).</li>
<li><b>Ripostes en chaîne</b> : si plusieurs cartes se répondent, la dernière posée s’applique la première.</li>
</ul>

<h2 id="exemple">Exemple commenté</h2>
<p>Alice et Bruno ont chacun ${R.startTokens} jetons. Alice a perdu la manche précédente : elle mène, avec ${byId['coup-pouce'].cost} Tournées. Bruno, lui, a posé un piège face cachée à la manche d’avant.</p>
<ol>
<li>Alice lance ${dice('642')}. Elle garde le 4 et le 2, relance le 6 et obtient ${dice('422')}.</li>
<li>Elle joue « Coup de pouce » (${byId['coup-pouce'].cost} Tournées) : elle retire 1 à un de ses 2, et la voilà avec ${dice('421')}. Elle s’arrête après <b>deux lancers</b> : Bruno n’en aura que deux.</li>
<li>Le piège de Bruno se révèle : c’était un « Faux 4-2-1 ». Le 4-2-1 d’Alice reste la meilleure combinaison, mais il <b>ne vaut plus que 2</b> cette manche.</li>
<li>Bruno lance ${dice('653')}, relance le 3 et finit sur ${dice('655')} : il perd la manche. Au Dernier mot, il n’a rien à jouer et passe.</li>
<li>Comptes : Alice donne 2 jetons à Bruno au lieu de 8. Alice en a 9, Bruno 13. Bruno mènera la manche suivante, avec 3 Tournées.</li>
</ol>

<h2 id="fin">Fin de partie</h2>
<ul>
<li>Dès qu’un joueur n’a plus aucun jeton, il gagne.</li>
<li>Si la partie dure, le bistrot ferme après la <b>${R.maxRounds}e manche</b> : celui qui a le moins de jetons l’emporte.</li>
<li>Deck vide : on remélange sa défausse pour refaire un deck, et on reçoit ${plural(R.reshufflePenalty, 'jeton')}.</li>
<li>En partie classée, quitter la partie compte comme une défaite ; après une déconnexion, vous avez 60 secondes pour revenir.</li>
</ul>

<h2 id="plus">Petits plus</h2>
<ul>
<li><b>Le perdant se refait</b> : une Tournée de plus au perdant de la manche précédente, qui mène la suivante.</li>
<li><b>Temps</b> : ${R.decisionSeconds} secondes par décision, plus une réserve de ${R.reserveSeconds} secondes pour toute la partie.</li>
</ul>

<h2 id="multi">À 3 ou 4 joueurs</h2>
<p>Entre amis, à une table à code : ${R.startTokensMulti} jetons chacun. Le premier à 0 gagne et la partie s’arrête ; les autres sont classés selon leurs jetons. On joue du meneur dans le sens des aiguilles d’une montre, et chacun voit les combinaisons déjà faites. <b>Seul le plus mauvais de la manche reçoit des jetons</b>, du meilleur, comme au 421. Une carte qui vise « l’adversaire » vise le joueur de votre choix ; un piège se pose devant un joueur précis, à la vue de tous. Au Dernier mot, on parle du plus mauvais vers le meilleur.</p>

<h2 id="deck">Deck et collection</h2>
<ul>
<li>Un deck compte exactement <b>${R.deckSize} cartes</b> : ${R.maxCopies} exemplaires au plus de chaque carte, <b>${DECK_RULES.maxFamilies} familles au plus</b> et <b>une seule carte légendaire</b>, pour qu’aucun deck ne réunisse toutes les meilleures cartes. Jusqu’à 5 decks enregistrés.</li>
<li>Booster : ${BOOSTER.size} cartes au pur hasard pour ${BOOSTER.price} capsules. Les cartes en double au-delà du maximum utile deviennent des éclats de verre, qui servent à fabriquer la carte de votre choix.</li>
<li>Toutes les cartes et les decks de départ sont détaillés sur la page <a href="/cartes-coups-fourres">les cartes de Coups Fourrés</a>.</li>
</ul>

<h2 id="conseils">Conseils pour débuter</h2>
<ul>
<li><b>Gardez une Riposte et de quoi la payer.</b> Un « Ticket de caisse » (${plural(byId['ticket-caisse'].cost, 'Tournée')}) en main fait réfléchir l’adversaire avant chaque petit coup.</li>
<li><b>Lisez les Tournées adverses.</b> Quatre ou plus : méfiez-vous du « Retournement de veste », du « Bon numéro » ou de la « Tournée générale ».</li>
<li><b>Face à un Retournement de veste, visez plus bas.</b> Il ne se déclenche que si vous deviez donner 8 jetons ou plus : arrêtez-vous sur une combinaison qui vaut moins (et sans Double tournée).</li>
<li><b>Meneur avec une bonne combinaison ?</b> Arrêtez-vous tôt : l’autre joueur n’aura pas plus de lancers que vous.</li>
<li><b>Bluffez avec le Leurre.</b> Il ne fait rien, mais l’adversaire voit un piège posé… et s’il le défausse, vous piochez.</li>
</ul>
<p>D’autres conseils sont dans le jeu, rubrique « Apprendre ». Pour le choix des dés eux-mêmes, la <a href="/strategie-421">stratégie du 421</a> s’applique telle quelle.</p>

<h2 id="lexique">Lexique</h2>
<dl class="lexique">
<dt>Booster</dt><dd>${BOOSTER.size} cartes tirées au pur hasard, pour ${BOOSTER.price} capsules. Une carte sur vingt sort brillante (sans effet en partie).</dd>
<dt>Capsules</dt><dd>La monnaie du mode, gagnée en jouant (parties, missions du jour, ligue). Elle sert à ouvrir des boosters.</dd>
<dt>Comptes</dt><dd>Fin de manche : le gagnant donne au perdant autant de jetons que vaut sa combinaison, cartes comprises.</dd>
<dt>Décharge</dt><dd>On commence avec des jetons et on cherche à s’en débarrasser ; le premier à zéro gagne.</dd>
<dt>Deck</dt><dd>Vos ${R.deckSize} cartes pour une partie.</dd>
<dt>Dernier mot</dt><dd>Étape juste avant les comptes, où le joueur qui perd peut encore jouer une carte de ce type.</dd>
<dt>Éclats de verre</dt><dd>Rendus par les doublons en trop ; ils servent à fabriquer une carte au choix.</dd>
<dt>Famille</dt><dd>Habitués (vert), Ivresse (rouge), Pièges (violet), Chaînes (bleu et or).</dd>
<dt>Meneur</dt><dd>Celui qui joue en premier dans la manche (le perdant de la précédente). Son nombre de lancers fixe le maximum de l’autre.</dd>
<dt>Riposte</dt><dd>Carte jouée à tout moment en réponse à une carte adverse.</dd>
<dt>Tournée</dt><dd>Ce que coûtent les cartes : ${R.tourneesPerRound} par manche, +${R.tourneesLoserBonus} pour le perdant de la précédente, ${R.tourneesMax} en réserve au plus.</dd>
</dl>
${play('Essayer Coups Fourrés', 'La partie guidée applique ces règles pas à pas')}
`,
    faq: [
      ['Combien de jetons au départ à Coups Fourrés ?', `${R.startTokens} jetons chacun en duel, ${R.startTokensMulti} à 3 ou 4 joueurs. Le premier à n’en avoir plus aucun gagne.`],
      ['Combien de cartes dans un deck ?', `Exactement ${R.deckSize}, avec ${R.maxCopies} exemplaires au plus de chaque carte, ${DECK_RULES.maxFamilies} familles au plus et une seule carte légendaire.`],
      ['Qu’est-ce qu’une Tournée ?', `La monnaie de la partie, qui paie les cartes. On en reçoit ${R.tourneesPerRound} par manche (${R.tourneesPerRound + R.tourneesLoserBonus} après une manche perdue), et on peut en garder ${R.tourneesMax} au plus.`],
      ['Peut-on voir les pièges de l’adversaire ?', 'On voit combien il en a posé, pas lesquels. La carte « Fouine » en défausse un, et vous découvrez lequel c’était.'],
      ['Que se passe-t-il en cas d’égalité ?', 'Si les deux combinaisons sont exactement égales, personne ne donne de jetons.'],
    ],
    related: ['coups-fourres', 'cartes-coups-fourres', 'regles-du-421'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    slug: 'cartes-coups-fourres', nav: 'Cartes', short: 'Les cartes de Coups Fourrés', parent: 'coups-fourres',
    blurb: `Les ${CARDS.length} cartes illustrées, leur effet, leur coût et leur rareté.`,
    published: '2026-11-05', updated: '2026-11-06', play: CF_PLAY, og: '/og-coups-fourres.jpg', about: 'cf',
    title: `Les ${CARDS.length} cartes de Coups Fourrés : familles, effets et raretés`,
    description: `Toutes les cartes de Coups Fourrés, jeu de cartes à collectionner gratuit autour du 421 : ${CARDS.length} cartes illustrées en 4 familles, avec effet, coût et rareté.`,
    h1: `Les ${CARDS.length} cartes de Coups Fourrés`,
    lead: `Patrons, serveuses, piliers de comptoir, pièges et tournées générales : voici toutes les cartes du premier set de Coups Fourrés, le jeu de cartes à collectionner du 421. Chaque carte a son illustration originale, son effet, son coût en Tournées et sa rareté. Dans le jeu, la rubrique « Les ${CARDS.length} cartes » les montre toutes, même celles que vous n’avez pas encore.`,
    body: `
${toc([['apercu', 'Le set en un coup d’œil'], ...FAMS.map((f) => [f, FAMILY_LABEL[f]]), ['decks-depart', 'Les decks de départ'], ['obtenir', 'Obtenir des cartes']])}

<h2 id="apercu">Le set en un coup d’œil</h2>
<div class="table-wrap"><table>
<thead><tr><th>Famille</th>${rarities.map((r) => `<th>${RARITY_LABEL[r]}s</th>`).join('')}<th>Total</th></tr></thead>
<tbody>
${FAMS.map((f) => `<tr><td><a href="#${f}">${FAMILY_LABEL[f]}</a></td>${rarities.map((r) => `<td>${count((c) => c.family === f && c.rarity === r)}</td>`).join('')}<td>${count((c) => c.family === f)}</td></tr>`).join('\n')}
<tr><td><b>Toutes</b></td>${rarities.map((r) => `<td><b>${count((c) => c.rarity === r)}</b></td>`).join('')}<td><b>${CARDS.length}</b></td></tr>
</tbody></table></div>
<p>Chaque carte appartient à l’un des cinq types : Coup, Piège, Riposte, Dernier mot ou Habitué. Leur moment de jeu est expliqué dans les <a href="/regles-coups-fourres">règles de Coups Fourrés</a>.</p>
${FAMS.map((f, fi) => `
<h2 id="${f}">${FAMILY_LABEL[f]}</h2>
<p>${FAM_TEXT[f]}</p>
<div class="cf-grid">
${CARDS.filter((c) => c.family === f).map((c, i) => cardFig(c.id, { eager: fi === 0 && i < 2 })).join('\n')}
</div>`).join('\n')}

<h2 id="decks-depart">Les decks de départ</h2>
<p>Deux decks de ${R.deckSize} cartes, sans légendaire, sont offerts en découvrant le mode avec un compte. Ce sont aussi ceux des parties contre l’ordinateur sans compte.</p>
<div class="cards">
${STARTER_DECKS.map((d) => `<section class="card"><h3>${d.name}</h3><p>${deckList(d)}.</p></section>`).join('\n')}
</div>
<p>Le Zinc mise sur les Habitués et les Chaînes (Tournées, retouches de dés, Ripostes) ; La Bringue sur l’Ivresse et les Pièges (relances, paris et pièges cachés).</p>

<h2 id="obtenir">Obtenir des cartes</h2>
<ul>
<li><b>Boosters</b> : ${BOOSTER.size} cartes au pur hasard pour ${BOOSTER.price} capsules. Chaque carte a ${pct(BOOSTER.odds.commune)} de chances d’être commune, ${pct(BOOSTER.odds.rare)} rare, ${pct(BOOSTER.odds.epique)} épique et ${pct(BOOSTER.odds.legendaire)} légendaire ; une sur vingt sort brillante. Il n’y a pas de rare garantie.</li>
<li><b>Capsules</b> : ${CAPSULES.rankedWin} par victoire classée, ${CAPSULES.rankedLoss} par défaite classée jouée jusqu’au bout, ${CAPSULES.vsBot} par partie contre l’ordinateur (${CAPSULES.vsBotDailyMax} par jour au plus), plus les missions du jour. La première victoire du jour rapporte un booster. Les capsules ne s’achètent pas.</li>
<li><b>Récompenses</b> : boosters de fin de saison de la ligue (de 1 au Comptoir à 5 au Grand Café) et du tournoi du samedi.</li>
<li><b>Fabrication</b> : les doublons en trop deviennent des éclats de verre, qui permettent de fabriquer la carte de votre choix.</li>
</ul>
<div class="table-wrap"><table>
<thead><tr><th>Rareté</th><th>Un doublon rapporte</th><th>Fabriquer la carte coûte</th></tr></thead>
<tbody>
${rarities.map((r) => `<tr><td>${RARITY_LABEL[r]}</td><td>${SHARDS[r].recycle} éclats</td><td>${SHARDS[r].craft} éclats</td></tr>`).join('\n')}
</tbody></table></div>
${play('Jouer avec ces cartes', 'Gratuit, dans le navigateur : les decks de départ sont prêts')}
`,
    faq: [
      ['Combien y a-t-il de cartes dans Coups Fourrés ?', `${CARDS.length} cartes dans le premier set : ${count((c) => c.rarity === 'commune')} communes, ${count((c) => c.rarity === 'rare')} rares, ${count((c) => c.rarity === 'epique')} épiques et ${count((c) => c.rarity === 'legendaire')} légendaires, réparties en 4 familles.`],
      ['Peut-on acheter des boosters avec de l’argent ?', 'Non. Les boosters s’ouvrent avec des capsules, qui se gagnent uniquement en jouant.'],
      ['Les cartes brillantes sont-elles plus fortes ?', 'Non, la version brillante est purement décorative : elle a exactement le même effet.'],
      ['Combien d’exemplaires d’une carte dans un deck ?', `${R.maxCopies} au plus, et un seul pour une carte légendaire (une seule légendaire par deck).`],
    ],
    related: ['coups-fourres', 'regles-coups-fourres', 'jeux-entre-amis-a-distance'],
  },
];
