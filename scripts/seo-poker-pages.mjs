/**
 * Pages d'aide du mode « Poker menteur » (4e jeu du site), en français, anglais, allemand et néerlandais,
 * utilisées par scripts/build-seo.mjs (gabarit, hreflang, sitemap).
 *
 * Ce qui est décrit = la règle retenue pour le jeu (version de comptoir française, un seul gobelet qui passe de
 * main en main) : 5 dés de poker (9, 10, Valet, Dame, Roi, As), croire = voir les dés, relancer UNE fois de 0 à
 * 5 dés puis annoncer strictement plus haut ; « Menteur ! » = on soulève le gobelet ; vies (3 par défaut, ou 5) ;
 * Poker d'As = annonce maximale ; variante « sans suites » désactivée par défaut ; 2 à 6 joueurs en ligne ;
 * ordinateurs de 3 niveaux ; 30 s pour décider en ligne. Rien d'autre (pas de comptes, pièces, classements…
 * tant que le jeu ne les a pas). Aucune note, aucun avis, aucun site concurrent.
 *
 * Termes de recherche visés (recherche du 11/11/2026) :
 *  - fr : « poker menteur », « poker menteur en ligne », « règles du poker menteur », « poker menteur dés »
 *    (« poker menteur » désigne aussi un jeu de cartes : les pages disent toujours « aux dés ») ;
 *  - en : « liar's dice » est le nom de la famille de jeux ; la version à un seul gobelet qui circule s'appelle
 *    « common hand » (Wikipédia) et se joue souvent avec des dés de poker (« liar dice », « poker dice »). Les pages
 *    disent honnêtement que ce n'est PAS la version à gobelets multiples (Perudo / Dudo) ;
 *  - de : « Lügenpoker » / « Pokerwürfel » (comparaison : Mäxchen / Meiern, le jeu allemand du gobelet qui passe) ;
 *  - nl : « blufpoker » (aux Pays-Bas, le même principe avec 3 dés ordinaires : dit clairement) / « pokerstenen ».
 *
 * Probabilités : calculées ici même, exactement, sur les 7 776 tirages de 5 dés (et les relances), avec le
 * classement des combinaisons ci-dessous. Images : aucune pour l'instant (le mode n'a pas encore de capture).
 */

/** Liens directs : partie contre l'ordinateur (quickPlay) et menu du mode. */
export const POKER_PLAY = '/?jouer=poker';
export const POKER_MENU = '/?mode=poker';
const playOf = (lang) => (lang === 'fr' ? POKER_PLAY : `${POKER_PLAY}&amp;lang=${lang}`);
const menuOf = (lang) => (lang === 'fr' ? POKER_MENU : `${POKER_MENU}&amp;lang=${lang}`);

/** Réglages décrits (règles du mode). */
export const POKER = { dice: 5, lives: [3, 5], defaultLives: 3, minPlayers: 2, maxPlayers: 6, turnSeconds: 30, aiLevels: 3, rerolls: 1 };

/** Combinaisons, de la plus faible à la plus forte : ordre EXACT du fichier de règles (contrôlé par tests/seo.test.ts). */
export const POKER_HAND_IDS = ['rien', 'paire', 'double-paire', 'brelan', 'petite-suite', 'grande-suite', 'full', 'carre', 'poker'];
export const POKER_HANDS_FR = ['Rien', 'Paire', 'Double paire', 'Brelan', 'Petite suite', 'Grande suite', 'Full', 'Carré', 'Poker'];

/** Groupes de traduction (hreflang) : slugs plats, un par langue. */
export const POKER_GROUPS = [
  { fr: 'poker-menteur-en-ligne', en: 'liars-dice-poker-dice-online', de: 'luegenpoker-wuerfel-online', nl: 'blufpoker-dobbelspel-online' },
  { fr: 'regles-du-poker-menteur', en: 'liars-dice-poker-dice-rules', de: 'luegenpoker-wuerfel-regeln', nl: 'blufpoker-spelregels' },
];
const [G_ONLINE, G_RULES] = POKER_GROUPS;

// Probabilités exactes ------------------------------------------------------------------------------
/** Catégorie (indice dans POKER_HAND_IDS) d'une main de 5 faces (0 = 9 … 5 = As). */
export function pokerCategory(faces, straights = true) {
  const c = [0, 0, 0, 0, 0, 0];
  for (const f of faces) c[f]++;
  const n = c.filter((x) => x > 0).sort((a, b) => b - a);
  if (n[0] === 5) return 8;
  if (n[0] === 4) return 7;
  if (n[0] === 3) return n[1] === 2 ? 6 : 3;
  if (n[0] === 2) return n[1] === 2 ? 2 : 1;
  if (straights && c[0] === 0) return 5; // 10-V-D-R-As
  if (straights && c[5] === 0) return 4; // 9-10-V-D-R
  return 0;
}
const rolls = (n) => (n === 0 ? [[]] : rolls(n - 1).flatMap((r) => [0, 1, 2, 3, 4, 5].map((f) => [...r, f])));
const ALL5 = rolls(5);
const share = (kept, test) => { const r = rolls(5 - kept.length); return r.filter((x) => test(pokerCategory([...kept, ...x]))).length / r.length; };
const oneRoll = POKER_HAND_IDS.map((_, i) => ALL5.filter((d) => pokerCategory(d) === i).length / ALL5.length);
export const POKER_ODDS = {
  oneRoll, // par catégorie, avec les suites
  nothingNoStraights: ALL5.filter((d) => pokerCategory(d, false) === 0).length / ALL5.length,
  atLeastPair: 1 - oneRoll[0],
  fullOrBetter: oneRoll[6] + oneRoll[7] + oneRoll[8],
  pairToTwoPairOrBetter: share([5, 5], (k) => k >= 2), // garder une paire, relancer 3 dés
  pairToTripsOrBetter: share([5, 5], (k) => k >= 3),
  tripsToFullOrBetter: share([4, 4, 4], (k) => k >= 6), // garder un brelan, relancer 2 dés
  twoPairToFull: share([4, 4, 2, 2], (k) => k >= 6), // garder une double paire, relancer 1 dé
  straightDraw: share([1, 2, 3, 4], (k) => k === 4 || k === 5), // garder 10-V-D-R, relancer 1 dé
};
const PCT_LOCALE = { fr: 'fr-FR', en: 'en-US', de: 'de-DE', nl: 'nl-NL' };
const pct = (lang, x, digits = 1) => {
  const v = (x * 100).toLocaleString(PCT_LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return lang === 'en' || lang === 'nl' ? `${v}%` : `${v}&nbsp;%`;
};

// Petits éléments ----------------------------------------------------------------------------------
/** Faces des dés de poker par langue (lettre sur le dé, nom complet pour les lecteurs d'écran). */
const FACES = {
  fr: { s: { 9: '9', T: '10', J: 'V', Q: 'D', K: 'R', A: 'A' }, n: { 9: '9', T: '10', J: 'Valet', Q: 'Dame', K: 'Roi', A: 'As' } },
  en: { s: { 9: '9', T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' }, n: { 9: 'nine', T: 'ten', J: 'jack', Q: 'queen', K: 'king', A: 'ace' } },
  de: { s: { 9: '9', T: '10', J: 'B', Q: 'D', K: 'K', A: 'A' }, n: { 9: 'Neun', T: 'Zehn', J: 'Bube', Q: 'Dame', K: 'König', A: 'Ass' } },
  nl: { s: { 9: '9', T: '10', J: 'B', Q: 'V', K: 'H', A: 'A' }, n: { 9: 'negen', T: 'tien', J: 'boer', Q: 'vrouw', K: 'heer', A: 'aas' } },
};
const pk = (lang, s) => `<span class="dice" role="img" aria-label="${s.split('').map((f) => FACES[lang].n[f]).join(', ')}">${s.split('').map((f) => `<i class="d pk${f === 'T' ? ' pk10' : ''}">${FACES[lang].s[f]}</i>`).join('')}</span>`;
const TOC = { fr: 'Sommaire', en: 'Contents', de: 'Inhalt', nl: 'Inhoud' };
const toc = (lang, items) => `<nav class="toc" aria-label="${TOC[lang]}"><b>${TOC[lang]}</b><ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;
const play = (lang, label, sub) => `<p class="play-box"><a class="cta" href="${playOf(lang)}" data-play>${label}</a>${sub ? `<small>${sub}</small>` : ''}</p>`;

/** Tableau des combinaisons : une ligne par combinaison, dans l'ordre des règles (data-hand pour les tests). */
const EXAMPLES = ['9TJQA', 'QQAT9', 'KKTT9', 'JJJA9', '9TJQK', 'TJQKA', 'KKKTT', 'QQQQ9', 'AAAAA'];
const handsTable = (lang, head, names, notes) => `<div class="table-wrap"><table>
<thead><tr><th>${head[0]}</th><th>${head[1]}</th><th>${head[2]}</th></tr></thead>
<tbody>
${POKER_HAND_IDS.map((id, i) => `<tr data-hand="${id}"><td>${i + 1}. <b>${names[i]}</b><br><small>${notes[i]}</small></td><td>${pk(lang, EXAMPLES[i])}</td><td>${pct(lang, oneRoll[i])}</td></tr>`).join('\n')}
</tbody></table></div>`;

const UPDATED = '2026-11-11';
const O = POKER_ODDS;

// Fiches de jeu (JSON-LD VideoGame), une par langue, sur la page « en ligne ». Aucune note ni avis.
export const POKER_GAME = {
  fr: { name: 'Poker menteur', alt: ['Poker menteur aux dés', 'Menteur'], description: 'Le poker menteur aux dés, gratuit dans le navigateur : cinq dés de poker sous un gobelet qui passe de main en main, des annonces et du bluff. Contre l’ordinateur (3 niveaux) ou en ligne de 2 à 6 joueurs.', genre: ['Jeu de dés', 'Jeu de bluff', 'Jeu de société'], platform: 'Navigateur web', os: 'Tout appareil avec un navigateur récent (Android, iOS, Windows, macOS, Linux)' },
  en: { name: 'Poker menteur', alt: ['Liar’s dice with poker dice', 'Liar dice'], description: 'Single-cup liar’s dice with poker dice, free in the browser: five poker dice under one cup passed from player to player, calls and bluffing. Against the computer (3 levels) or online with 2 to 6 players.', genre: ['Dice game', 'Bluffing game', 'Board game'], platform: 'Web browser', os: 'Any device with a recent browser (Android, iOS, Windows, macOS, Linux)' },
  de: { name: 'Poker menteur', alt: ['Lügenpoker mit Würfeln', 'Pokerwürfel-Bluff'], description: 'Lügenpoker mit Pokerwürfeln, kostenlos im Browser: fünf Pokerwürfel unter einem Becher, der von Hand zu Hand geht, Ansagen und Bluff. Gegen den Computer (3 Stufen) oder online mit 2 bis 6 Spielern.', genre: ['Würfelspiel', 'Bluffspiel', 'Gesellschaftsspiel'], platform: 'Webbrowser', os: 'Jedes Gerät mit aktuellem Browser (Android, iOS, Windows, macOS, Linux)' },
  nl: { name: 'Poker menteur', alt: ['Blufpoker met pokerstenen', 'Leugenaarsdobbelen'], description: 'Blufpoker met pokerstenen, gratis in de browser: vijf pokerstenen onder één beker die van hand tot hand gaat, aankondigingen en bluf. Tegen de computer (3 niveaus) of online met 2 tot 6 spelers.', genre: ['Dobbelspel', 'Blufspel', 'Bordspel'], platform: 'Webbrowser', os: 'Elk apparaat met een recente browser (Android, iOS, Windows, macOS, Linux)' },
};

const base = (lang, group) => ({ lang: lang === 'fr' ? undefined : lang, published: UPDATED, updated: UPDATED, play: playOf(lang), about: `poker-${lang}`, slug: group[lang] });

// =================================================================================================
// FRANÇAIS
// =================================================================================================
const FR_NAMES = POKER_HANDS_FR;
const FR_NOTES = ['5 dés différents, sans suite', 'deux dés pareils', 'deux paires', 'trois dés pareils', '9-10-V-D-R', '10-V-D-R-As', 'un brelan et une paire', 'quatre dés pareils', 'cinq dés pareils'];

export const pokerPagesFr = [
  {
    ...base('fr', G_ONLINE), nav: 'Poker menteur', short: 'Poker menteur en ligne',
    blurb: 'Le jeu de bluff aux cinq dés de poker et au gobelet, contre l’ordinateur ou entre amis.',
    title: 'Poker menteur en ligne gratuit : le jeu de dés de bluff',
    description: 'Jouez au poker menteur aux dés en ligne, gratuit et sans téléchargement : cinq dés de poker, un gobelet et du bluff. Contre l’ordinateur ou de 2 à 6 entre amis.',
    h1: 'Jouer au poker menteur en ligne',
    lead: `Le poker menteur, c’est le jeu de bluff des comptoirs : <b>cinq dés de poker sous un gobelet</b>, une annonce au voisin, et une seule question, « il ment ou pas ? ». Sur <a href="${POKER_PLAY}" data-play>421online.com</a>, il se joue gratuitement dans le navigateur, contre l’ordinateur ou entre amis, sans téléchargement et sans argent en jeu.`,
    body: `
${toc('fr', [['principe', 'Le principe en trente secondes'], ['modes', 'Les façons de jouer'], ['reglages', 'Les réglages d’une partie'], ['equitable', 'Personne ne voit vos dés'], ['noms', 'Poker menteur, Perudo, Liar’s dice'], ['autres', 'Les autres jeux du site']])}

<h2 id="principe">Le principe en trente secondes</h2>
<ol class="steps">
<li><b>Vous secouez le gobelet</b> : vous seul voyez vos cinq dés (9, 10, Valet, Dame, Roi, As).</li>
<li><b>Vous annoncez une main</b> au joueur suivant, vraie ou fausse : « Paire de Dames », « Full aux Rois par les 10 »…</li>
<li><b>Il vous croit</b> : il prend le gobelet, regarde les dés, peut en relancer une fois (de 0 à 5), puis doit annoncer <b>plus haut</b> au suivant.</li>
<li><b>Ou il crie « Menteur ! »</b> : on soulève le gobelet. Si les dés valent au moins l’annonce, c’est lui qui perd une vie ; sinon, c’est vous.</li>
</ol>
<p>Le dernier joueur à qui il reste des vies gagne la partie. L’ordre des combinaisons, les exemples d’annonces et des conseils de bluff sont sur la page <a href="/regles-du-poker-menteur">règles du poker menteur</a>.</p>

<h2 id="modes">Les façons de jouer</h2>
<div class="cards">
<section class="card"><h3>Contre l’ordinateur</h3><p>Des adversaires de <b>${POKER.aiLevels} niveaux</b>, pour apprendre la règle, puis pour vous entraîner à repérer les bluffs (et à les placer).</p></section>
<section class="card"><h3>En ligne, entre amis</h3><p>De <b>${POKER.minPlayers} à ${POKER.maxPlayers} joueurs</b> autour du même gobelet virtuel, chacun sur son téléphone ou son ordinateur. Le <a href="${POKER_MENU}">menu du Poker menteur</a> réunit les parties en ligne et les réglages.</p></section>
<section class="card"><h3>Sans temps mort</h3><p>En ligne, chacun a <b>${POKER.turnSeconds} secondes</b> pour croire, relancer et annoncer. Passé ce délai, le jeu joue à sa place : il croit, ne relance rien et annonce la main juste au-dessus.</p></section>
</div>

<h2 id="reglages">Les réglages d’une partie</h2>
<ul>
<li><b>Vies</b> : ${POKER.defaultLives} par joueur par défaut, ou ${POKER.lives[1]} pour une partie plus longue (partie privée ou contre l’ordinateur).</li>
<li><b>Variante « sans suites »</b> : la petite et la grande suite n’existent plus. Désactivée par défaut.</li>
<li><b>Annoncer vite</b> : le jeu propose d’office la main <b>immédiatement supérieure</b> à l’annonce reçue ; un sélecteur (la combinaison, puis les valeurs) permet de monter plus haut en deux gestes.</li>
</ul>

<h2 id="equitable">Personne ne voit vos dés</h2>
<p>Les dés sont tirés au sort par le serveur, et le contenu du gobelet n’est envoyé <b>qu’au joueur qui le tient</b> : ni les autres joueurs ni l’historique de la partie ne le voient avant qu’on soulève le gobelet. Chaque annonce est vérifiée (elle doit être plus haute que la précédente), et une relance ne peut que relancer de vrais dés, jamais choisir leur valeur.</p>

<h2 id="noms">Poker menteur, Perudo, Liar’s dice</h2>
<p>Le nom « poker menteur » désigne aussi un jeu de cartes : ici, c’est la version <b>aux dés</b>, celle des cafés, avec <b>un seul gobelet qui passe de main en main</b>. Ce n’est pas le <a href="/jeux-de-des#perudo">Perudo</a>, où chacun cache ses propres dés et où l’on parie sur tous les dés de la table. Les anglophones rangent les deux dans la famille du « liar’s dice ».</p>

<h2 id="autres">Les autres jeux du site</h2>
<p>421online, c’est aussi le <a href="/jouer-au-421-en-ligne">421</a>, le jeu de dés de bistrot à trois dés, <a href="/dix-mille-en-ligne">Le Courtisan</a>, le Dix mille à six dés, et <a href="/coups-fourres">Coups Fourrés</a>, le 421 aux cartes : quatre jeux au même comptoir. Tous les jeux de dés du site sont présentés sur la page <a href="/jeux-de-des-en-ligne">jeux de dés en ligne</a>.</p>
${play('fr', 'Jouer au poker menteur', 'Contre l’ordinateur, tout de suite · gratuit')}
`,
    faq: [
      ['Le poker menteur en ligne est-il gratuit ?', 'Oui : pas d’abonnement, pas de publicité, pas d’achat, et aucune mise d’argent. Il se joue dans le navigateur, sur téléphone comme sur ordinateur.'],
      ['Faut-il télécharger une application ?', 'Non. Le jeu s’ouvre dans le navigateur d’un téléphone ou d’un ordinateur, sans rien installer.'],
      ['Peut-on jouer au poker menteur contre l’ordinateur ?', `Oui, contre des adversaires ordinateur de ${POKER.aiLevels} niveaux de difficulté.`],
      ['À combien peut-on jouer en ligne ?', `De ${POKER.minPlayers} à ${POKER.maxPlayers} joueurs autour du même gobelet.`],
      ['Combien de vies a-t-on ?', `${POKER.defaultLives} par défaut, ou ${POKER.lives[1]} si vous le choisissez avant une partie privée ou contre l’ordinateur. Le dernier joueur à qui il reste des vies gagne.`],
      ['Quelle différence avec le Perudo ?', 'Au poker menteur, un seul gobelet de cinq dés de poker circule et chacun annonce une main de poker. Au Perudo, chaque joueur a ses propres dés et l’on parie sur l’ensemble des dés de la table.'],
    ],
    related: ['regles-du-poker-menteur', 'jeux-de-des-en-ligne', 'jeu-de-des-entre-amis'],
  },
  {
    ...base('fr', G_RULES), nav: 'Règles du poker menteur', short: 'Règles du poker menteur', parent: G_ONLINE.fr,
    blurb: 'Combinaisons du 9 à l’As, annonces, « menteur ! », vies, exemples et conseils de bluff.',
    title: 'Règles du poker menteur aux dés : combinaisons, annonces, bluff',
    description: 'Les règles du poker menteur aux dés : ordre des combinaisons, annonces, « menteur ! », vies, exemples commentés et conseils pour bien bluffer, avec les probabilités.',
    h1: 'Les règles du poker menteur aux dés',
    lead: 'Cinq dés de poker, un gobelet opaque et un peu d’aplomb : au poker menteur, on annonce au voisin ce qu’il y a sous le gobelet, et il décide de vous croire ou non. Voici la règle appliquée sur 421online, la valeur des combinaisons avec leurs chances exactes, et de quoi mieux bluffer.',
    body: `
${toc('fr', [['resume', 'Le poker menteur en 6 points'], ['materiel', 'Le matériel'], ['combinaisons', 'Les combinaisons'], ['comparer', 'Départager deux mains'], ['annonces', 'Comment annoncer'], ['manche', 'Une manche, pas à pas'], ['exemple', 'Exemple commenté'], ['fin', 'Vies et fin de partie'], ['variante', 'Variante sans suites'], ['bluff', 'Conseils de bluff']])}

<h2 id="resume">Le poker menteur en 6 points</h2>
<ol class="steps">
<li>On joue avec ${POKER.dice} dés de poker et un gobelet, de ${POKER.minPlayers} à ${POKER.maxPlayers} joueurs ; chacun a ${POKER.defaultLives} vies.</li>
<li>Le premier secoue le gobelet, regarde ses dés en cachette et annonce une main au suivant, vraie ou fausse.</li>
<li>Le suivant peut <b>croire</b> : il regarde les dés, en relance une fois de 0 à 5, puis annonce une main <b>strictement plus haute</b>.</li>
<li>Ou il crie <b>« Menteur ! »</b> : on soulève le gobelet devant tout le monde.</li>
<li>Si les dés valent <b>au moins</b> l’annonce, celui qui a crié perd une vie ; sinon, c’est l’annonceur.</li>
<li>Un joueur sans vie est éliminé ; le dernier encore en jeu gagne.</li>
</ol>

<h2 id="materiel">Le matériel</h2>
<p>Cinq <b>dés de poker</b>, dont les faces vont de la plus faible à la plus forte : <b>9, 10, Valet, Dame, Roi, As</b> (${pk('fr', '9TJQKA')}). Il faut aussi un <b>gobelet opaque</b>, pour que seul le joueur qui le tient voie les dés. Pas de jetons ni de feuille de marque : chaque joueur a simplement un nombre de vies.</p>

<h2 id="combinaisons">Les combinaisons</h2>
<p>De la plus faible à la plus forte, avec la chance de chacune en un seul lancer des cinq dés (calculée sur les 7&nbsp;776 tirages possibles) :</p>
${handsTable('fr', ['Combinaison', 'Exemple', 'En un lancer'], FR_NAMES, FR_NOTES)}
<p class="note">Curiosité : « rien » (${pct('fr', oneRoll[0])}) sort moins souvent qu’une paire ou une double paire, mais c’est bien la main la plus faible. Une main d’au moins une paire sort ${pct('fr', O.atLeastPair)} du temps.</p>

<h2 id="comparer">Départager deux mains</h2>
<ul>
<li><b>Rien</b> : on compare le dé le plus haut, puis le suivant, etc.</li>
<li><b>Paire</b> : la valeur de la paire, puis les autres dés du plus haut au plus bas.</li>
<li><b>Double paire</b> : la plus haute paire, puis la seconde, puis le dé restant.</li>
<li><b>Brelan</b> : la valeur du brelan, puis les deux autres dés.</li>
<li><b>Full</b> : le brelan, puis la paire (« Full aux Rois par les 10 » bat « Full aux Dames par les As »).</li>
<li><b>Carré</b> : la valeur du carré, puis le dé restant. <b>Poker</b> : la valeur des cinq dés.</li>
</ul>
<p>Le <b>Poker d’As</b> (${pk('fr', 'AAAAA')}) est l’annonce la plus haute du jeu : impossible de la dépasser.</p>

<h2 id="annonces">Comment annoncer</h2>
<p>Une annonce est une main précise : la combinaison et ses valeurs. On peut ne dire que ce qui compte ; les dés non précisés valent alors <b>le minimum possible</b>. « Brelan de Valets » tout court vaut donc le plus faible des brelans de Valets. Quelques annonces, de la plus faible à la plus forte :</p>
<ol>
<li>« Paire de Dames » (sous-entendu : avec 9, 10 et Valet)</li>
<li>« Paire de Dames, As, 10, 9 » : même paire, mais un As à côté, donc plus haut</li>
<li>« Double paire, Valets et 9 »</li>
<li>« Double paire, Rois et 10 »</li>
<li>« Brelan de 9 », puis « Brelan d’As »</li>
<li>« Petite suite », puis « Grande suite »</li>
<li>« Full aux 9 par les 10 », « Full aux 9 par les As », puis « Full aux 10 par les 9 »</li>
<li>« Carré de 10 », puis « Poker de 9 »… jusqu’au « Poker d’As »</li>
</ol>
<p>Sur 421online, le jeu propose d’office la main <b>juste au-dessus</b> de l’annonce reçue, et un sélecteur (la combinaison, puis les valeurs) permet d’annoncer plus haut sans tout taper.</p>

<h2 id="manche">Une manche, pas à pas</h2>
<ol class="steps">
<li><b>Le premier joueur</b> secoue le gobelet et regarde ses cinq dés, sans les montrer. Au premier coup d’une manche, <b>n’importe quelle annonce</b> est permise.</li>
<li><b>Le joueur suivant</b> choisit : « Menteur ! » ou « Je crois ».</li>
<li><b>S’il croit</b>, il prend le gobelet et voit les dés. Il peut relancer <b>une seule fois</b> de 0 à 5 dés de son choix ; ceux qu’il garde ne bougent pas. Puis il annonce une main <b>strictement supérieure</b> à celle qu’il a reçue, vraie ou fausse, au joueur suivant.</li>
<li><b>S’il crie « Menteur ! »</b>, on soulève le gobelet devant tout le monde. Main réelle au moins égale à l’annonce : celui qui a crié perd une vie. Main plus faible : celui qui a annoncé perd une vie.</li>
<li><b>Nouvelle manche</b> : le perdant commence, avec un nouveau lancer des cinq dés.</li>
</ol>
<p>Si l’annonce reçue est « Poker d’As », il n’existe rien au-dessus : il ne reste qu’à crier « Menteur ! ».</p>

<h2 id="exemple">Exemple commenté</h2>
<p>Alice, Bruno et Chloé ont chacun ${POKER.defaultLives} vies. Alice secoue le gobelet et voit ${pk('fr', 'KKJT9')} : une paire de Rois. Elle annonce, sans mentir, « Paire de Rois ».</p>
<p>Bruno la croit. Il prend le gobelet, garde les deux Rois et relance les trois autres dés : ${pk('fr', 'KK99Q')}, une double paire Rois et 9. Il doit annoncer plus haut que « Paire de Rois » ; il pourrait dire la vérité, mais préfère mettre la pression : « Brelan de 10 ».</p>
<p>Chloé trouve que ça sent le bluff et crie « Menteur ! ». On soulève le gobelet : une double paire, plus faible qu’un brelan de 10. Bruno a menti, <b>il perd une vie</b> et commence la manche suivante avec un nouveau lancer. Si le gobelet avait contenu un brelan de 10, même tout juste, c’est Chloé qui aurait perdu la vie.</p>

<h2 id="fin">Vies et fin de partie</h2>
<p>Chaque joueur commence avec ${POKER.defaultLives} vies (${POKER.lives[1]} si vous le choisissez avant une partie privée ou contre l’ordinateur). Un joueur qui n’a plus de vie est éliminé et garde sa place au classement selon l’ordre de sortie. <b>Le dernier joueur encore en jeu gagne.</b> En ligne, chacun a ${POKER.turnSeconds} secondes pour choisir, relancer et annoncer ; passé ce délai, le jeu croit pour lui, ne relance rien et annonce la main immédiatement supérieure.</p>

<h2 id="variante">Variante sans suites</h2>
<p>Dans certains cafés, les suites ne comptent pas. Avec le réglage « sans suites » (désactivé par défaut), la petite et la grande suite disparaissent : 9-10-V-D-R ou 10-V-D-R-As ne valent alors que « rien », ce qui arrive ${pct('fr', O.nothingNoStraights)} du temps en un lancer.</p>

<h2 id="bluff">Conseils de bluff</h2>
<ul>
<li><b>Une paire est toujours crédible</b> : en un lancer, il y a au moins une paire ${pct('fr', O.atLeastPair)} du temps. Crier « Menteur ! » sur une petite paire en début de manche est presque toujours perdant.</li>
<li><b>Regardez ce que permet une relance</b> : en gardant une paire et en relançant trois dés, on obtient au moins un brelan ${pct('fr', O.pairToTripsOrBetter, 0)} du temps ; en gardant un brelan et en relançant deux dés, un full ou mieux ${pct('fr', O.tripsToFullOrBetter, 0)} du temps ; avec une double paire et un dé relancé, le full sort une fois sur trois.</li>
<li><b>Plus l’annonce monte, plus le doute paie</b> : un full ou mieux ne sort que ${pct('fr', O.fullOrBetter)} du temps en un lancer. À ce niveau, même avec une relance, l’annonceur a souvent dû inventer.</li>
<li><b>Annoncez un peu plus haut que nécessaire</b> pour mettre la pression au suivant, qui devra monter encore… mais une annonce trop haute attire les « Menteur ! ».</li>
<li><b>Dites parfois la vérité</b> : un joueur qui bluffe à chaque coup se fait vite lire. Une vraie main annoncée avec aplomb fait perdre des vies à ceux qui doutent trop.</li>
<li><b>Pensez au suivant</b> : quand vous croyez, c’est vous qui devrez annoncer plus haut. Croire une annonce déjà très haute, c’est accepter de devoir bluffer à votre tour.</li>
</ul>
<p>Prêt à tester votre aplomb ? Lancez une partie contre l’ordinateur, ou passez par le <a href="${POKER_MENU}">menu du Poker menteur</a> pour jouer en ligne. Vous cherchez un jeu sans bluff ? Les <a href="/regles-du-421">règles du 421</a> s’apprennent en une manche.</p>
${play('fr', 'Essayer une partie', 'Le jeu vérifie les annonces et compte les vies pour vous')}
`,
    faq: [
      ['Quelle est la meilleure main au poker menteur ?', 'Le Poker d’As, cinq As : c’est l’annonce la plus haute, personne ne peut la dépasser.'],
      ['Une suite bat-elle un brelan ?', 'Oui : la petite suite (9-10-V-D-R) et la grande suite (10-V-D-R-As) battent tous les brelans, mais perdent contre le full, le carré et le poker.'],
      ['Que se passe-t-il si les dés valent exactement l’annonce ?', 'L’annonce est juste : c’est le joueur qui a crié « Menteur ! » qui perd une vie.'],
      ['Combien de dés peut-on relancer ?', 'Quand vous croyez une annonce, vous pouvez relancer une seule fois de 0 à 5 dés de votre choix, avant d’annoncer plus haut.'],
      ['Est-on obligé de dire la vérité ?', 'Non, c’est tout le jeu : vous pouvez annoncer une main que vous n’avez pas, à condition qu’elle soit plus haute que l’annonce reçue.'],
    ],
    related: ['poker-menteur-en-ligne', 'jeux-de-des', 'regles-du-421'],
  },
];

// =================================================================================================
// ENGLISH
// =================================================================================================
const EN_NAMES = ['Nothing', 'Pair', 'Two pair', 'Three of a kind', 'Low straight', 'High straight', 'Full house', 'Four of a kind', 'Five of a kind'];
const EN_NOTES = ['5 different dice, no straight', 'two matching dice', 'two pairs', 'three matching dice', '9-10-J-Q-K', '10-J-Q-K-A', 'three of a kind and a pair', 'four matching dice', '“poker”: five matching dice'];
const enRel = { online: G_ONLINE.en, rules: G_RULES.en };

const pokerEn = [
  {
    ...base('en', G_ONLINE), nav: 'Liar’s dice', short: 'Liar’s dice with poker dice',
    blurb: 'The one-cup bluffing game with five poker dice, against the computer or with friends.',
    title: 'Liar’s Dice With Poker Dice: One Cup, Free Online',
    description: 'Play one-cup liar’s dice with five poker dice, free in your browser: roll, call a hand, bluff or shout “liar!”. Against the computer or 2 to 6 friends online.',
    h1: 'Liar’s dice with poker dice, online',
    lead: `This is the classic French bar version of liar’s dice, called <b>poker menteur</b>: <b>five poker dice under one cup</b> that travels around the table, a hand called to the next player, and one question: are they lying? On <a href="${playOf('en')}" data-play>421online.com</a> it’s free in the browser, against the computer or with friends, with nothing to download and no money involved.`,
    body: `
${toc('en', [['idea', 'How it works in 30 seconds'], ['not-perudo', 'Not the Perudo version'], ['modes', 'Ways to play'], ['settings', 'Game settings'], ['fair', 'Nobody sees your dice'], ['other', 'The other games on the site']])}

<h2 id="idea">How it works in 30 seconds</h2>
<ol class="steps">
<li><b>Shake the cup</b>: only you see your five dice (9, 10, jack, queen, king, ace).</li>
<li><b>Call a hand</b> to the next player, true or not: “pair of queens”, “full house, kings over tens”…</li>
<li><b>They believe you</b>: they take the cup, look at the dice, may re-roll once (0 to 5 dice), then must call a <b>higher</b> hand to the next player.</li>
<li><b>Or they shout “Liar!”</b>: the cup is lifted. If the dice are at least what you called, they lose a life; otherwise, you do.</li>
</ol>
<p>The last player with lives left wins. Hand rankings, example calls and bluffing tips are on the <a href="/${enRel.rules}">rules page</a>.</p>

<h2 id="not-perudo">Not the Perudo version</h2>
<p>“Liar’s dice” covers a whole family of games. The best-known one, Perudo (or Dudo), gives every player their own cup and has everyone bid on all the dice on the table. <b>This is the other branch</b>, sometimes called “common hand” liar’s dice: <b>one cup of five poker dice</b> is passed from player to player, and each call is a poker hand. If you’re after the multi-cup bidding game, this isn’t it.</p>

<h2 id="modes">Ways to play</h2>
<div class="cards">
<section class="card"><h3>Against the computer</h3><p>Opponents at <b>${POKER.aiLevels} levels</b>, to learn the rules, then to practise spotting bluffs (and pulling them off).</p></section>
<section class="card"><h3>Online with friends</h3><p><b>${POKER.minPlayers} to ${POKER.maxPlayers} players</b> around the same virtual cup, each on their own phone or computer. The <a href="${menuOf('en')}">Poker menteur menu</a> has online games and settings.</p></section>
<section class="card"><h3>No waiting around</h3><p>Online, everyone has <b>${POKER.turnSeconds} seconds</b> to believe, re-roll and call. After that, the game plays for them: it believes, re-rolls nothing and calls the next hand up.</p></section>
</div>

<h2 id="settings">Game settings</h2>
<ul>
<li><b>Lives</b>: ${POKER.defaultLives} each by default, or ${POKER.lives[1]} for a longer game (private game or against the computer).</li>
<li><b>“No straights” variant</b>: low and high straights don’t exist. Off by default.</li>
<li><b>Quick calls</b>: the game suggests the hand <b>just above</b> the one you received; a simple picker (hand type, then values) lets you go higher in two taps.</li>
</ul>

<h2 id="fair">Nobody sees your dice</h2>
<p>The dice are drawn by the server, and what’s under the cup is sent <b>only to the player holding it</b>: not to the other players, not to the game history, until the cup is lifted. Every call is checked (it must beat the previous one), and a re-roll can only re-roll real dice, never choose their values.</p>

<h2 id="other">The other games on the site</h2>
<p>421online also has <a href="/play-421-dice-game-online">421</a>, the French bar game with three dice, <a href="/play-farkle-online">The Courtier</a>, six-dice Farkle, and <a href="/coups-fourres-card-dice-game">Coups Fourrés</a>, 421 with cards: four games at the same bar. Playing as a group? See our page on <a href="/online-dice-game-with-friends">dice games with friends</a>.</p>
${play('en', 'Play liar’s dice now', 'Against the computer, right away · free')}
`,
    faq: [
      ['Is this liar’s dice game free?', 'Yes: no subscription, no ads, no purchases and no betting. It runs in the browser on phones and computers.'],
      ['Is it the same as Perudo?', 'No. In Perudo every player has their own dice and bids on all the dice on the table. Here a single cup of five poker dice is passed around and each call is a poker hand.'],
      ['Can I play against the computer?', `Yes, against computer opponents at ${POKER.aiLevels} difficulty levels.`],
      ['How many players can play online?', `From ${POKER.minPlayers} to ${POKER.maxPlayers} players around the same cup.`],
      ['How many lives does each player have?', `${POKER.defaultLives} by default, or ${POKER.lives[1]} if you choose it before a private game or a game against the computer. The last player with lives left wins.`],
    ],
    related: [enRel.rules, 'online-dice-game-with-friends', 'play-421-dice-game-online'],
  },
  {
    ...base('en', G_RULES), nav: 'Liar’s dice rules', short: 'Liar’s dice rules (poker dice)', parent: enRel.online,
    blurb: 'Hand rankings from nine to ace, calls, “liar!”, lives, worked examples and bluffing tips.',
    title: 'Liar’s Dice Rules With Poker Dice: Hands, Calls, Bluffing',
    description: 'Rules of one-cup liar’s dice with poker dice: hand rankings, how to call, “liar!”, lives, worked examples and bluffing tips, with the exact odds of each hand.',
    h1: 'Liar’s dice rules with poker dice',
    lead: 'Five poker dice, an opaque cup and a straight face: you tell the next player what’s under the cup, and they decide whether to believe you. Here are the rules used on 421online (the French “poker menteur”), the hand rankings with their exact odds, and how to bluff better.',
    body: `
${toc('en', [['summary', 'The game in 6 points'], ['kit', 'What you need'], ['hands', 'Hand rankings'], ['ties', 'Comparing two hands'], ['calls', 'How to call a hand'], ['round', 'A round, step by step'], ['example', 'Worked example'], ['end', 'Lives and the end of the game'], ['variant', 'No-straights variant'], ['bluff', 'Bluffing tips']])}

<h2 id="summary">The game in 6 points</h2>
<ol class="steps">
<li>You play with ${POKER.dice} poker dice and one cup, ${POKER.minPlayers} to ${POKER.maxPlayers} players; everyone has ${POKER.defaultLives} lives.</li>
<li>The first player shakes the cup, looks at the dice in secret and calls a hand to the next player, true or not.</li>
<li>The next player can <b>believe</b>: they look at the dice, re-roll 0 to 5 of them once, then call a <b>strictly higher</b> hand.</li>
<li>Or they shout <b>“Liar!”</b>: the cup is lifted in front of everyone.</li>
<li>If the dice are <b>at least</b> the call, the player who shouted loses a life; otherwise the caller does.</li>
<li>A player with no lives left is out; the last one still in wins.</li>
</ol>

<h2 id="kit">What you need</h2>
<p>Five <b>poker dice</b>, whose faces run from lowest to highest: <b>9, 10, jack, queen, king, ace</b> (${pk('en', '9TJQKA')}). You also need an <b>opaque cup</b>, so only the player holding it sees the dice. No chips and no score sheet: each player simply has a number of lives.</p>

<h2 id="hands">Hand rankings</h2>
<p>From lowest to highest, with the chance of each in a single roll of the five dice (worked out over all 7,776 possible rolls):</p>
${handsTable('en', ['Hand', 'Example', 'In one roll'], EN_NAMES, EN_NOTES)}
<p class="note">Fun fact: “nothing” (${pct('en', oneRoll[0])}) comes up less often than a pair or two pair, but it’s still the lowest hand. At least a pair comes up ${pct('en', O.atLeastPair)} of the time.</p>

<h2 id="ties">Comparing two hands</h2>
<ul>
<li><b>Nothing</b>: compare the highest die, then the next one, and so on.</li>
<li><b>Pair</b>: the pair’s value, then the other dice from high to low.</li>
<li><b>Two pair</b>: the higher pair, then the lower one, then the odd die.</li>
<li><b>Three of a kind</b>: its value, then the other two dice.</li>
<li><b>Full house</b>: the three, then the pair (“kings over tens” beats “queens over aces”).</li>
<li><b>Four of a kind</b>: its value, then the odd die. <b>Five of a kind</b>: its value.</li>
</ul>
<p><b>Five aces</b> (${pk('en', 'AAAAA')}) is the highest call in the game: nothing beats it.</p>

<h2 id="calls">How to call a hand</h2>
<p>A call is a precise hand: the type and its values. You can say only what matters; any dice you don’t name count as <b>the lowest possible</b>. So plain “three jacks” means the lowest three jacks. Some calls, from lowest to highest:</p>
<ol>
<li>“Pair of queens” (meaning: with 9, 10 and jack)</li>
<li>“Pair of queens, ace, 10, 9”: same pair, but an ace beside it, so higher</li>
<li>“Two pair, jacks and nines”</li>
<li>“Two pair, kings and tens”</li>
<li>“Three nines”, then “three aces”</li>
<li>“Low straight”, then “high straight”</li>
<li>“Nines over tens”, “nines over aces”, then “tens over nines” (full houses)</li>
<li>“Four tens”, then “five nines”… up to “five aces”</li>
</ol>
<p>On 421online, the game suggests the hand <b>just above</b> the one you received, and a picker (hand type, then values) lets you call higher without typing anything.</p>

<h2 id="round">A round, step by step</h2>
<ol class="steps">
<li><b>The first player</b> shakes the cup and looks at the five dice without showing them. On the first call of a round, <b>any hand</b> may be called.</li>
<li><b>The next player</b> chooses: “Liar!” or “I believe you”.</li>
<li><b>If they believe</b>, they take the cup and see the dice. They may re-roll <b>once</b>, 0 to 5 dice of their choice; the dice they keep stay put. Then they call a hand <b>strictly higher</b> than the one they received, true or not, to the next player.</li>
<li><b>If they shout “Liar!”</b>, the cup is lifted in front of everyone. Real hand at least equal to the call: the player who shouted loses a life. Lower: the caller loses a life.</li>
<li><b>New round</b>: the loser starts, with a fresh roll of all five dice.</li>
</ol>
<p>If the call you receive is “five aces”, there’s nothing higher: all you can do is shout “Liar!”.</p>

<h2 id="example">Worked example</h2>
<p>Alice, Ben and Chloe have ${POKER.defaultLives} lives each. Alice shakes the cup and sees ${pk('en', 'KKJT9')}: a pair of kings. She calls, truthfully, “pair of kings”.</p>
<p>Ben believes her. He takes the cup, keeps the two kings and re-rolls the other three dice: ${pk('en', 'KK99Q')}, two pair, kings and nines. He must call higher than “pair of kings”; he could tell the truth, but he’d rather pile on the pressure: “three tens”.</p>
<p>Chloe smells a bluff and shouts “Liar!”. The cup is lifted: two pair, lower than three tens. Ben lied, so <b>he loses a life</b> and starts the next round with a fresh roll. Had the cup held three tens, even just barely, Chloe would have lost the life.</p>

<h2 id="end">Lives and the end of the game</h2>
<p>Everyone starts with ${POKER.defaultLives} lives (${POKER.lives[1]} if you choose it before a private game or a game against the computer). A player with no lives left is out, and keeps their place in the ranking by order of elimination. <b>The last player still in wins.</b> Online, each player has ${POKER.turnSeconds} seconds to choose, re-roll and call; after that, the game believes for them, re-rolls nothing and calls the next hand up.</p>

<h2 id="variant">No-straights variant</h2>
<p>Some tables don’t count straights. With the “no straights” setting (off by default), low and high straights disappear: 9-10-J-Q-K or 10-J-Q-K-A then count as “nothing”, which happens ${pct('en', O.nothingNoStraights)} of the time in one roll.</p>

<h2 id="bluff">Bluffing tips</h2>
<ul>
<li><b>A pair is always believable</b>: one roll gives at least a pair ${pct('en', O.atLeastPair)} of the time. Shouting “Liar!” at a small pair early in a round almost always loses.</li>
<li><b>Know what a re-roll can do</b>: keeping a pair and re-rolling three dice gives at least three of a kind ${pct('en', O.pairToTripsOrBetter, 0)} of the time; keeping three of a kind and re-rolling two gives a full house or better ${pct('en', O.tripsToFullOrBetter, 0)} of the time; two pair with one die re-rolled makes a full house one time in three.</li>
<li><b>The higher the call, the more doubt pays</b>: a full house or better comes up only ${pct('en', O.fullOrBetter)} of the time in one roll. At that level, even with a re-roll, the caller has often had to make it up.</li>
<li><b>Call a little higher than you need</b> to put pressure on the next player, who has to go higher still… but a call that’s too high draws “Liar!”.</li>
<li><b>Tell the truth now and then</b>: a player who bluffs every time is easy to read. A real hand called with confidence costs lives to those who doubt too much.</li>
<li><b>Think one step ahead</b>: when you believe, you’ll have to call higher. Believing a call that’s already very high means accepting you may have to bluff next.</li>
</ul>
<p>Ready to test your poker face? Start a game against the computer, or go through the <a href="${menuOf('en')}">Poker menteur menu</a> to play online. Want a game with no bluffing? The <a href="/421-dice-game-rules">421 rules</a> take one round to learn.</p>
${play('en', 'Try a game', 'The game checks calls and counts lives for you')}
`,
    faq: [
      ['What is the best hand in this liar’s dice game?', 'Five aces: it’s the highest call in the game and nobody can beat it.'],
      ['Does a straight beat three of a kind?', 'Yes: the low straight (9-10-J-Q-K) and the high straight (10-J-Q-K-A) beat every three of a kind, but lose to a full house, four of a kind and five of a kind.'],
      ['What if the dice are exactly what was called?', 'Then the call was true: the player who shouted “Liar!” loses a life.'],
      ['How many dice can I re-roll?', 'When you believe a call, you may re-roll once, 0 to 5 dice of your choice, before calling higher.'],
      ['Do I have to tell the truth?', 'No, that’s the whole game: you can call a hand you don’t have, as long as it’s higher than the call you received.'],
    ],
    related: [enRel.online, '421-dice-game-rules', 'online-dice-game-with-friends'],
  },
];

// =================================================================================================
// DEUTSCH (du)
// =================================================================================================
const DE_NAMES = ['Nichts', 'Paar', 'Zwei Paare', 'Drilling', 'Kleine Straße', 'Große Straße', 'Full House', 'Vierling', 'Fünf Gleiche (Poker)'];
const DE_NOTES = ['5 verschiedene Würfel, keine Straße', 'zwei gleiche Würfel', 'zwei Paare', 'drei gleiche Würfel', '9-10-B-D-K', '10-B-D-K-A', 'ein Drilling und ein Paar', 'vier gleiche Würfel', 'fünf gleiche Würfel'];
const deRel = { online: G_ONLINE.de, rules: G_RULES.de };

const pokerDe = [
  {
    ...base('de', G_ONLINE), nav: 'Lügenpoker', short: 'Lügenpoker mit Würfeln online',
    blurb: 'Das Bluffspiel mit fünf Pokerwürfeln und einem Becher, gegen den Computer oder mit Freunden.',
    title: 'Lügenpoker mit Würfeln online: kostenlos, ohne Download',
    description: 'Lügenpoker mit fünf Pokerwürfeln, kostenlos im Browser: würfeln, ansagen, bluffen oder „Lügner!“ rufen. Gegen den Computer oder mit 2 bis 6 Freunden online.',
    h1: 'Lügenpoker mit Würfeln, online',
    lead: `Lügenpoker mit Pokerwürfeln ist das Bluffspiel der französischen Kneipen, dort <b>„poker menteur“</b> genannt: <b>fünf Pokerwürfel unter einem Becher</b>, eine Ansage an den Nächsten und eine einzige Frage: Lügt er oder nicht? Auf <a href="${playOf('de')}" data-play>421online.com</a> spielst du es kostenlos im Browser, gegen den Computer oder mit Freunden, ohne Download und ohne echtes Geld.`,
    body: `
${toc('de', [['prinzip', 'Das Prinzip in 30 Sekunden'], ['maexchen', 'Wie Mäxchen, aber mit fünf Würfeln'], ['modi', 'So kannst du spielen'], ['einstellungen', 'Einstellungen einer Partie'], ['fair', 'Niemand sieht deine Würfel'], ['andere', 'Die anderen Spiele der Seite']])}

<h2 id="prinzip">Das Prinzip in 30 Sekunden</h2>
<ol class="steps">
<li><b>Du schüttelst den Becher</b>: Nur du siehst deine fünf Würfel (9, 10, Bube, Dame, König, Ass).</li>
<li><b>Du sagst eine Hand an</b>, wahr oder gelogen: „Paar Damen“, „Full House, Könige und Zehnen“ …</li>
<li><b>Der Nächste glaubt dir</b>: Er nimmt den Becher, sieht die Würfel, darf einmal nachwürfeln (0 bis 5 Würfel) und muss dann <b>höher</b> ansagen.</li>
<li><b>Oder er ruft „Lügner!“</b>: Der Becher wird gehoben. Sind die Würfel mindestens so gut wie die Ansage, verliert er ein Leben, sonst du.</li>
</ol>
<p>Wer zuletzt noch Leben hat, gewinnt. Die Rangfolge der Kombinationen, Beispielansagen und Bluff-Tipps stehen bei den <a href="/${deRel.rules}">Lügenpoker-Regeln</a>.</p>

<h2 id="maexchen">Wie Mäxchen, aber mit fünf Würfeln</h2>
<p>Wer Mäxchen (Meiern) kennt, kennt das Prinzip: ein Becher, der von Hand zu Hand geht, Ansagen, die immer höher werden, und der Moment, in dem jemand den Becher hebt. Hier sind es aber <b>fünf Pokerwürfel</b> und Pokerhände statt zwei normaler Würfel. Und es ist nicht Perudo (Dudo, „Liar’s Dice“), bei dem jeder seine eigenen Würfel hat und auf alle Würfel am Tisch geboten wird.</p>

<h2 id="modi">So kannst du spielen</h2>
<div class="cards">
<section class="card"><h3>Gegen den Computer</h3><p>Gegner in <b>${POKER.aiLevels} Stufen</b>: erst die Regeln lernen, dann üben, Bluffs zu durchschauen (und selbst zu landen).</p></section>
<section class="card"><h3>Online mit Freunden</h3><p><b>${POKER.minPlayers} bis ${POKER.maxPlayers} Spieler</b> um denselben virtuellen Becher, jeder am eigenen Handy oder PC. Im <a href="${menuOf('de')}">Menü von Poker menteur</a> findest du Online-Partien und Einstellungen.</p></section>
<section class="card"><h3>Ohne Leerlauf</h3><p>Online hat jeder <b>${POKER.turnSeconds} Sekunden</b>, um zu glauben, nachzuwürfeln und anzusagen. Danach spielt das Spiel für ihn: Es glaubt, würfelt nichts nach und sagt die nächsthöhere Hand an.</p></section>
</div>

<h2 id="einstellungen">Einstellungen einer Partie</h2>
<ul>
<li><b>Leben</b>: standardmäßig ${POKER.defaultLives} pro Spieler, oder ${POKER.lives[1]} für eine längere Partie (private Partie oder gegen den Computer).</li>
<li><b>Variante „ohne Straßen“</b>: Kleine und große Straße gibt es nicht. Standardmäßig aus.</li>
<li><b>Schnell ansagen</b>: Das Spiel schlägt die <b>nächsthöhere</b> Hand vor; eine einfache Auswahl (Kombination, dann Werte) bringt dich mit zwei Tipps höher.</li>
</ul>

<h2 id="fair">Niemand sieht deine Würfel</h2>
<p>Die Würfel werden vom Server gezogen, und was unter dem Becher liegt, bekommt <b>nur der Spieler, der ihn hält</b>: nicht die anderen, nicht der Spielverlauf, bis der Becher gehoben wird. Jede Ansage wird geprüft (sie muss höher sein als die vorige), und beim Nachwürfeln werden echte Würfel neu geworfen, nie Werte ausgesucht.</p>

<h2 id="andere">Die anderen Spiele der Seite</h2>
<p>Auf 421online gibt es außerdem <a href="/421-wuerfelspiel-online">421</a>, das französische Kneipenspiel mit drei Würfeln, <a href="/farkle-online-spielen">Der Höfling</a>, Farkle mit sechs Würfeln, und <a href="/coups-fourres-karten-wuerfelspiel">Coups Fourrés</a>, 421 mit Karten: vier Spiele an einem Tresen. Für Spieleabende in der Gruppe: <a href="/online-wuerfelspiel-mit-freunden">Online-Würfelspiel mit Freunden</a>.</p>
${play('de', 'Lügenpoker spielen', 'Gegen den Computer, sofort · kostenlos')}
`,
    faq: [
      ['Ist Lügenpoker mit Würfeln hier kostenlos?', 'Ja: kein Abo, keine Werbung, keine Käufe und keine Einsätze mit echtem Geld. Es läuft im Browser, auf Handy und PC.'],
      ['Ist das dasselbe wie Perudo oder Liar’s Dice?', 'Nein. Bei Perudo hat jeder eigene Würfel und man bietet auf alle Würfel am Tisch. Hier geht ein einziger Becher mit fünf Pokerwürfeln herum, und jede Ansage ist eine Pokerhand.'],
      ['Kann ich gegen den Computer spielen?', `Ja, gegen Computergegner in ${POKER.aiLevels} Schwierigkeitsstufen.`],
      ['Wie viele können online mitspielen?', `${POKER.minPlayers} bis ${POKER.maxPlayers} Spieler um denselben Becher.`],
      ['Wie viele Leben hat man?', `Standardmäßig ${POKER.defaultLives}, oder ${POKER.lives[1]}, wenn du das vor einer privaten Partie oder einer Partie gegen den Computer wählst. Wer zuletzt noch Leben hat, gewinnt.`],
    ],
    related: [deRel.rules, 'online-wuerfelspiel-mit-freunden', '421-wuerfelspiel-online'],
  },
  {
    ...base('de', G_RULES), nav: 'Lügenpoker-Regeln', short: 'Lügenpoker-Regeln', parent: deRel.online,
    blurb: 'Rangfolge von Neun bis Ass, Ansagen, „Lügner!“, Leben, Beispiele und Bluff-Tipps.',
    title: 'Lügenpoker mit Würfeln: Regeln, Kombinationen, Bluff-Tipps',
    description: 'Die Regeln von Lügenpoker mit Pokerwürfeln: Rangfolge der Kombinationen, Ansagen, „Lügner!“, Leben, Beispiele und Bluff-Tipps, mit den genauen Wahrscheinlichkeiten.',
    h1: 'Lügenpoker mit Würfeln: die Regeln',
    lead: 'Fünf Pokerwürfel, ein blickdichter Becher und ein Pokerface: Du sagst dem Nächsten an, was unter dem Becher liegt, und er entscheidet, ob er dir glaubt. Hier sind die Regeln auf 421online (das französische „poker menteur“), die Rangfolge mit genauen Wahrscheinlichkeiten und Tipps zum Bluffen.',
    body: `
${toc('de', [['kurz', 'Lügenpoker in 6 Punkten'], ['material', 'Was du brauchst'], ['kombinationen', 'Die Kombinationen'], ['vergleich', 'Zwei Hände vergleichen'], ['ansagen', 'Richtig ansagen'], ['runde', 'Eine Runde Schritt für Schritt'], ['beispiel', 'Beispiel'], ['ende', 'Leben und Spielende'], ['variante', 'Variante ohne Straßen'], ['bluff', 'Bluff-Tipps']])}

<h2 id="kurz">Lügenpoker in 6 Punkten</h2>
<ol class="steps">
<li>Gespielt wird mit ${POKER.dice} Pokerwürfeln und einem Becher, mit ${POKER.minPlayers} bis ${POKER.maxPlayers} Spielern; jeder hat ${POKER.defaultLives} Leben.</li>
<li>Der Erste schüttelt den Becher, schaut heimlich auf die Würfel und sagt dem Nächsten eine Hand an, wahr oder gelogen.</li>
<li>Der Nächste kann <b>glauben</b>: Er sieht die Würfel, würfelt einmal 0 bis 5 davon nach und sagt eine <b>echt höhere</b> Hand an.</li>
<li>Oder er ruft <b>„Lügner!“</b>: Der Becher wird vor allen gehoben.</li>
<li>Sind die Würfel <b>mindestens</b> so gut wie die Ansage, verliert der Rufer ein Leben, sonst der Ansager.</li>
<li>Wer kein Leben mehr hat, scheidet aus; der Letzte im Spiel gewinnt.</li>
</ol>

<h2 id="material">Was du brauchst</h2>
<p>Fünf <b>Pokerwürfel</b>, deren Seiten von der schwächsten zur stärksten gehen: <b>9, 10, Bube, Dame, König, Ass</b> (${pk('de', '9TJQKA')}). Dazu einen <b>blickdichten Becher</b>, damit nur der Spieler, der ihn hält, die Würfel sieht. Keine Chips, kein Block: Jeder hat einfach eine Zahl an Leben.</p>

<h2 id="kombinationen">Die Kombinationen</h2>
<p>Von der schwächsten zur stärksten, mit der Chance auf jede bei einem einzigen Wurf der fünf Würfel (berechnet über alle 7.776 möglichen Würfe):</p>
${handsTable('de', ['Kombination', 'Beispiel', 'Pro Wurf'], DE_NAMES, DE_NOTES)}
<p class="note">Kurios: „Nichts“ (${pct('de', oneRoll[0])}) kommt seltener als ein Paar oder zwei Paare, ist aber trotzdem die schwächste Hand. Mindestens ein Paar fällt in ${pct('de', O.atLeastPair)} der Würfe.</p>

<h2 id="vergleich">Zwei Hände vergleichen</h2>
<ul>
<li><b>Nichts</b>: Der höchste Würfel zählt, dann der nächste und so weiter.</li>
<li><b>Paar</b>: der Wert des Paars, dann die übrigen Würfel von hoch nach niedrig.</li>
<li><b>Zwei Paare</b>: das höhere Paar, dann das zweite, dann der einzelne Würfel.</li>
<li><b>Drilling</b>: sein Wert, dann die beiden übrigen Würfel.</li>
<li><b>Full House</b>: erst der Drilling, dann das Paar („Könige und Zehnen“ schlägt „Damen und Asse“).</li>
<li><b>Vierling</b>: sein Wert, dann der einzelne Würfel. <b>Fünf Gleiche</b>: ihr Wert.</li>
</ul>
<p><b>Fünf Asse</b> (${pk('de', 'AAAAA')}) sind die höchste Ansage des Spiels: Darüber geht nichts.</p>

<h2 id="ansagen">Richtig ansagen</h2>
<p>Eine Ansage ist eine genaue Hand: Kombination und Werte. Du musst nur sagen, was zählt; nicht genannte Würfel gelten als <b>die niedrigsten möglichen</b>. „Drilling Buben“ allein ist also der schwächste Buben-Drilling. Einige Ansagen, von schwach nach stark:</p>
<ol>
<li>„Paar Damen“ (gemeint: mit 9, 10 und Bube)</li>
<li>„Paar Damen, Ass, 10, 9“: dasselbe Paar, aber ein Ass daneben, also höher</li>
<li>„Zwei Paare, Buben und Neunen“</li>
<li>„Zwei Paare, Könige und Zehnen“</li>
<li>„Drilling Neunen“, dann „Drilling Asse“</li>
<li>„Kleine Straße“, dann „Große Straße“</li>
<li>„Full House, Neunen und Zehnen“, „Neunen und Asse“, dann „Zehnen und Neunen“</li>
<li>„Vierling Zehnen“, dann „Fünf Neunen“ … bis „Fünf Asse“</li>
</ol>
<p>Auf 421online schlägt das Spiel die <b>nächsthöhere</b> Hand vor, und mit der Auswahl (Kombination, dann Werte) sagst du höher an, ohne etwas zu tippen.</p>

<h2 id="runde">Eine Runde Schritt für Schritt</h2>
<ol class="steps">
<li><b>Der erste Spieler</b> schüttelt den Becher und sieht sich die fünf Würfel an, ohne sie zu zeigen. Beim ersten Zug einer Runde ist <b>jede Ansage</b> erlaubt.</li>
<li><b>Der nächste Spieler</b> wählt: „Lügner!“ oder „Ich glaube dir“.</li>
<li><b>Glaubt er</b>, nimmt er den Becher und sieht die Würfel. Er darf <b>einmal</b> 0 bis 5 Würfel seiner Wahl nachwürfeln; die anderen bleiben liegen. Dann sagt er dem Nächsten eine <b>echt höhere</b> Hand an, wahr oder gelogen.</li>
<li><b>Ruft er „Lügner!“</b>, wird der Becher vor allen gehoben. Echte Hand mindestens so gut wie die Ansage: Der Rufer verliert ein Leben. Schwächer: Der Ansager verliert ein Leben.</li>
<li><b>Neue Runde</b>: Der Verlierer beginnt, mit einem neuen Wurf aller fünf Würfel.</li>
</ol>
<p>Lautet die Ansage „Fünf Asse“, gibt es nichts Höheres: Dann bleibt nur „Lügner!“.</p>

<h2 id="beispiel">Beispiel</h2>
<p>Anna, Ben und Clara haben je ${POKER.defaultLives} Leben. Anna schüttelt den Becher und sieht ${pk('de', 'KKJT9')}: ein Paar Könige. Sie sagt ehrlich „Paar Könige“ an.</p>
<p>Ben glaubt ihr. Er nimmt den Becher, behält die beiden Könige und würfelt die anderen drei nach: ${pk('de', 'KK99Q')}, zwei Paare, Könige und Neunen. Er muss höher als „Paar Könige“ ansagen; er könnte die Wahrheit sagen, macht aber lieber Druck: „Drilling Zehnen“.</p>
<p>Clara wittert einen Bluff und ruft „Lügner!“. Der Becher wird gehoben: zwei Paare, schwächer als ein Drilling Zehnen. Ben hat gelogen, <b>er verliert ein Leben</b> und beginnt die nächste Runde mit einem neuen Wurf. Hätte ein Drilling Zehnen unter dem Becher gelegen, auch nur ganz knapp, hätte Clara das Leben verloren.</p>

<h2 id="ende">Leben und Spielende</h2>
<p>Jeder beginnt mit ${POKER.defaultLives} Leben (${POKER.lives[1]}, wenn du das vor einer privaten Partie oder einer Partie gegen den Computer wählst). Wer kein Leben mehr hat, scheidet aus und behält seinen Platz in der Wertung nach der Reihenfolge des Ausscheidens. <b>Der Letzte im Spiel gewinnt.</b> Online hat jeder ${POKER.turnSeconds} Sekunden zum Wählen, Nachwürfeln und Ansagen; danach glaubt das Spiel für ihn, würfelt nichts nach und sagt die nächsthöhere Hand an.</p>

<h2 id="variante">Variante ohne Straßen</h2>
<p>An manchen Tischen zählen Straßen nicht. Mit der Einstellung „ohne Straßen“ (standardmäßig aus) fallen kleine und große Straße weg: 9-10-B-D-K oder 10-B-D-K-A gelten dann als „Nichts“, was bei einem Wurf in ${pct('de', O.nothingNoStraights)} der Fälle passiert.</p>

<h2 id="bluff">Bluff-Tipps</h2>
<ul>
<li><b>Ein Paar ist immer glaubwürdig</b>: Ein Wurf bringt in ${pct('de', O.atLeastPair)} der Fälle mindestens ein Paar. „Lügner!“ bei einem kleinen Paar zu Beginn einer Runde geht fast immer schief.</li>
<li><b>Wisse, was Nachwürfeln bringt</b>: Ein Paar behalten und drei Würfel nachwerfen ergibt in ${pct('de', O.pairToTripsOrBetter, 0)} der Fälle mindestens einen Drilling; einen Drilling behalten und zwei nachwerfen ergibt in ${pct('de', O.tripsToFullOrBetter, 0)} ein Full House oder besser; zwei Paare und ein Würfel nachgeworfen ergeben jedes dritte Mal ein Full House.</li>
<li><b>Je höher die Ansage, desto eher lohnt der Zweifel</b>: Ein Full House oder besser fällt bei einem Wurf nur in ${pct('de', O.fullOrBetter)} der Fälle. Auf dieser Höhe musste der Ansager oft etwas erfinden, selbst mit Nachwurf.</li>
<li><b>Sag etwas höher an als nötig</b>, um den Nächsten unter Druck zu setzen, der noch höher muss … aber eine zu hohe Ansage zieht „Lügner!“ an.</li>
<li><b>Sag ab und zu die Wahrheit</b>: Wer jedes Mal blufft, wird schnell durchschaut. Eine echte Hand, selbstbewusst angesagt, kostet die Zweifler Leben.</li>
<li><b>Denk einen Zug weiter</b>: Wenn du glaubst, musst du danach höher ansagen. Eine schon sehr hohe Ansage zu glauben heißt, selbst bluffen zu müssen.</li>
</ul>
<p>Bereit für dein Pokerface? Starte eine Partie gegen den Computer oder geh über das <a href="${menuOf('de')}">Menü von Poker menteur</a>, um online zu spielen. Lieber ein Spiel ohne Bluff? Die <a href="/421-wuerfelspiel-regeln">421-Regeln</a> lernst du in einer Runde.</p>
${play('de', 'Eine Partie ausprobieren', 'Das Spiel prüft die Ansagen und zählt die Leben für dich')}
`,
    faq: [
      ['Was ist die beste Hand beim Lügenpoker mit Würfeln?', 'Fünf Asse: die höchste Ansage des Spiels, niemand kann sie überbieten.'],
      ['Schlägt eine Straße einen Drilling?', 'Ja: Die kleine Straße (9-10-B-D-K) und die große Straße (10-B-D-K-A) schlagen jeden Drilling, verlieren aber gegen Full House, Vierling und fünf Gleiche.'],
      ['Was passiert, wenn die Würfel genau der Ansage entsprechen?', 'Dann war die Ansage wahr: Wer „Lügner!“ gerufen hat, verliert ein Leben.'],
      ['Wie viele Würfel darf ich nachwürfeln?', 'Wenn du eine Ansage glaubst, darfst du einmal 0 bis 5 Würfel deiner Wahl nachwürfeln, bevor du höher ansagst.'],
      ['Muss ich die Wahrheit sagen?', 'Nein, genau darum geht es: Du darfst eine Hand ansagen, die du nicht hast, solange sie höher ist als die erhaltene Ansage.'],
    ],
    related: [deRel.online, '421-wuerfelspiel-regeln', 'online-wuerfelspiel-mit-freunden'],
  },
];

// =================================================================================================
// NEDERLANDS (je)
// =================================================================================================
const NL_NAMES = ['Niets', 'Paar', 'Twee paar', 'Drie gelijke', 'Kleine straat', 'Grote straat', 'Full house', 'Carré', 'Poker (vijf gelijke)'];
const NL_NOTES = ['5 verschillende stenen, geen straat', 'twee gelijke stenen', 'twee paren', 'drie gelijke stenen', '9-10-B-V-H', '10-B-V-H-A', 'drie gelijke en een paar', 'vier gelijke stenen', 'vijf gelijke stenen'];
const nlRel = { online: G_ONLINE.nl, rules: G_RULES.nl };

const pokerNl = [
  {
    ...base('nl', G_ONLINE), nav: 'Blufpoker', short: 'Blufpoker met pokerstenen online',
    blurb: 'Het blufspel met vijf pokerstenen en één beker, tegen de computer of met vrienden.',
    title: 'Blufpoker met pokerstenen online: gratis, zonder download',
    description: 'Speel blufpoker met vijf pokerstenen, gratis in je browser: gooien, aankondigen, bluffen of „Leugenaar!” roepen. Tegen de computer of met 2 tot 6 vrienden online.',
    h1: 'Blufpoker met pokerstenen, online',
    lead: `Dit is het blufspel van de Franse cafés, daar <b>„poker menteur”</b> genoemd: <b>vijf pokerstenen onder één beker</b>, een aankondiging aan de volgende speler en één vraag: liegt hij of niet? Op <a href="${playOf('nl')}" data-play>421online.com</a> speel je het gratis in je browser, tegen de computer of met vrienden, zonder download en zonder echt geld.`,
    body: `
${toc('nl', [['principe', 'Het principe in 30 seconden'], ['blufpoker', 'Zoals blufpoker, maar met vijf pokerstenen'], ['spelen', 'Zo kun je spelen'], ['instellingen', 'Instellingen van een spel'], ['eerlijk', 'Niemand ziet je stenen'], ['andere', 'De andere spellen op de site']])}

<h2 id="principe">Het principe in 30 seconden</h2>
<ol class="steps">
<li><b>Je schudt de beker</b>: alleen jij ziet je vijf stenen (9, 10, boer, vrouw, heer, aas).</li>
<li><b>Je kondigt een hand aan</b>, waar of gelogen: „paar vrouwen”, „full house, heren en tienen”…</li>
<li><b>De volgende gelooft je</b>: hij neemt de beker, bekijkt de stenen, mag één keer opnieuw gooien (0 tot 5 stenen) en moet dan <b>hoger</b> aankondigen.</li>
<li><b>Of hij roept „Leugenaar!”</b>: de beker gaat omhoog. Zijn de stenen minstens zo goed als de aankondiging, dan verliest hij een leven; anders jij.</li>
</ol>
<p>Wie als laatste nog levens heeft, wint. De volgorde van de combinaties, voorbeelden en bluftips staan bij de <a href="/${nlRel.rules}">spelregels van blufpoker</a>.</p>

<h2 id="blufpoker">Zoals blufpoker, maar met vijf pokerstenen</h2>
<p>Ken je blufpoker? Dan ken je het principe: één beker die rondgaat, aankondigingen die steeds hoger worden, en het moment waarop iemand de beker optilt. Het klassieke blufpoker gebruikt drie gewone dobbelstenen; hier zijn het <b>vijf pokerstenen</b> en pokerhanden. En het is geen Perudo (Dudo, „liar’s dice”), waarbij iedereen zijn eigen stenen heeft en je biedt op alle stenen op tafel.</p>

<h2 id="spelen">Zo kun je spelen</h2>
<div class="cards">
<section class="card"><h3>Tegen de computer</h3><p>Tegenstanders op <b>${POKER.aiLevels} niveaus</b>: eerst de regels leren, dan oefenen om bluf te herkennen (en zelf te bluffen).</p></section>
<section class="card"><h3>Online met vrienden</h3><p><b>${POKER.minPlayers} tot ${POKER.maxPlayers} spelers</b> rond dezelfde virtuele beker, ieder op zijn eigen gsm of computer. In het <a href="${menuOf('nl')}">menu van Poker menteur</a> vind je online spellen en instellingen.</p></section>
<section class="card"><h3>Geen gewacht</h3><p>Online heeft iedereen <b>${POKER.turnSeconds} seconden</b> om te geloven, opnieuw te gooien en aan te kondigen. Daarna speelt het spel voor hem: het gelooft, gooit niets opnieuw en kondigt de eerstvolgende hogere hand aan.</p></section>
</div>

<h2 id="instellingen">Instellingen van een spel</h2>
<ul>
<li><b>Levens</b>: standaard ${POKER.defaultLives} per speler, of ${POKER.lives[1]} voor een langer spel (privéspel of tegen de computer).</li>
<li><b>Variant „zonder straten”</b>: kleine en grote straat bestaan niet. Standaard uit.</li>
<li><b>Snel aankondigen</b>: het spel stelt de hand <b>net boven</b> de ontvangen aankondiging voor; met een eenvoudige keuzelijst (combinatie, dan waarden) ga je in twee tikken hoger.</li>
</ul>

<h2 id="eerlijk">Niemand ziet je stenen</h2>
<p>De stenen worden door de server getrokken, en wat onder de beker ligt, krijgt <b>alleen de speler die hem vasthoudt</b> te zien: niet de anderen, niet het spelverloop, tot de beker omhooggaat. Elke aankondiging wordt gecontroleerd (ze moet hoger zijn dan de vorige), en opnieuw gooien gooit echte stenen opnieuw, je kiest nooit hun waarde.</p>

<h2 id="andere">De andere spellen op de site</h2>
<p>Op 421online speel je ook <a href="/421-dobbelspel-online">421</a>, het Franse caféspel met drie stenen, <a href="/farkle-online-spelen">De Hoveling</a>, Farkle met zes stenen, en <a href="/coups-fourres-kaart-dobbelspel">Coups Fourrés</a>, 421 met kaarten: vier spellen aan dezelfde toog. Met een groep spelen? Lees ons <a href="/online-dobbelspel-met-vrienden">online dobbelspel met vrienden</a>.</p>
${play('nl', 'Speel blufpoker', 'Tegen de computer, meteen · gratis')}
`,
    faq: [
      ['Is blufpoker met pokerstenen hier gratis?', 'Ja: geen abonnement, geen reclame, geen aankopen en geen inzet met echt geld. Het werkt in de browser, op gsm en computer.'],
      ['Is dit hetzelfde als Perudo of liar’s dice?', 'Nee. Bij Perudo heeft iedereen eigen stenen en bied je op alle stenen op tafel. Hier gaat één beker met vijf pokerstenen rond, en elke aankondiging is een pokerhand.'],
      ['Kan ik tegen de computer spelen?', `Ja, tegen computertegenstanders op ${POKER.aiLevels} niveaus.`],
      ['Met hoeveel spelers kan het online?', `Met ${POKER.minPlayers} tot ${POKER.maxPlayers} spelers rond dezelfde beker.`],
      ['Hoeveel levens heb je?', `Standaard ${POKER.defaultLives}, of ${POKER.lives[1]} als je dat kiest voor een privéspel of een spel tegen de computer. Wie als laatste nog levens heeft, wint.`],
    ],
    related: [nlRel.rules, 'online-dobbelspel-met-vrienden', '421-dobbelspel-online'],
  },
  {
    ...base('nl', G_RULES), nav: 'Blufpoker-regels', short: 'Spelregels blufpoker (pokerstenen)', parent: nlRel.online,
    blurb: 'Volgorde van negen tot aas, aankondigen, „leugenaar!”, levens, voorbeelden en bluftips.',
    title: 'Blufpoker met pokerstenen: spelregels, combinaties en bluftips',
    description: 'De spelregels van blufpoker met pokerstenen: volgorde van de combinaties, aankondigen, „leugenaar!”, levens, voorbeelden en bluftips, met de exacte kansen.',
    h1: 'De spelregels van blufpoker met pokerstenen',
    lead: 'Vijf pokerstenen, een ondoorzichtige beker en een stalen gezicht: je zegt de volgende speler wat er onder de beker ligt, en hij beslist of hij je gelooft. Hier zijn de regels op 421online (het Franse „poker menteur”), de volgorde van de handen met hun exacte kansen, en tips om beter te bluffen.',
    body: `
${toc('nl', [['kort', 'Blufpoker in 6 punten'], ['materiaal', 'Wat je nodig hebt'], ['combinaties', 'De combinaties'], ['vergelijken', 'Twee handen vergelijken'], ['aankondigen', 'Hoe je aankondigt'], ['ronde', 'Een ronde, stap voor stap'], ['voorbeeld', 'Voorbeeld'], ['einde', 'Levens en einde van het spel'], ['variant', 'Variant zonder straten'], ['bluf', 'Bluftips']])}

<h2 id="kort">Blufpoker in 6 punten</h2>
<ol class="steps">
<li>Je speelt met ${POKER.dice} pokerstenen en één beker, met ${POKER.minPlayers} tot ${POKER.maxPlayers} spelers; iedereen heeft ${POKER.defaultLives} levens.</li>
<li>De eerste schudt de beker, bekijkt stiekem de stenen en kondigt de volgende een hand aan, waar of gelogen.</li>
<li>De volgende kan <b>geloven</b>: hij bekijkt de stenen, gooit er één keer 0 tot 5 opnieuw en kondigt een <b>strikt hogere</b> hand aan.</li>
<li>Of hij roept <b>„Leugenaar!”</b>: de beker gaat voor iedereen omhoog.</li>
<li>Zijn de stenen <b>minstens</b> zo goed als de aankondiging, dan verliest de roeper een leven; anders de aankondiger.</li>
<li>Wie geen leven meer heeft, ligt eruit; de laatste die overblijft, wint.</li>
</ol>

<h2 id="materiaal">Wat je nodig hebt</h2>
<p>Vijf <b>pokerstenen</b>, met zijden van laag naar hoog: <b>9, 10, boer, vrouw, heer, aas</b> (${pk('nl', '9TJQKA')}). Verder een <b>ondoorzichtige beker</b>, zodat alleen wie hem vasthoudt de stenen ziet. Geen fiches, geen scoreblok: iedereen heeft gewoon een aantal levens.</p>

<h2 id="combinaties">De combinaties</h2>
<p>Van laag naar hoog, met de kans op elke combinatie in één worp van de vijf stenen (berekend over alle 7.776 mogelijke worpen):</p>
${handsTable('nl', ['Combinatie', 'Voorbeeld', 'Per worp'], NL_NAMES, NL_NOTES)}
<p class="note">Opvallend: „niets” (${pct('nl', oneRoll[0])}) komt minder vaak voor dan een paar of twee paar, maar is toch de laagste hand. Minstens een paar gooi je in ${pct('nl', O.atLeastPair)} van de worpen.</p>

<h2 id="vergelijken">Twee handen vergelijken</h2>
<ul>
<li><b>Niets</b>: de hoogste steen telt, dan de volgende, enzovoort.</li>
<li><b>Paar</b>: de waarde van het paar, dan de andere stenen van hoog naar laag.</li>
<li><b>Twee paar</b>: het hoogste paar, dan het tweede, dan de losse steen.</li>
<li><b>Drie gelijke</b>: hun waarde, dan de twee andere stenen.</li>
<li><b>Full house</b>: eerst de drie gelijke, dan het paar („heren en tienen” wint van „vrouwen en azen”).</li>
<li><b>Carré</b>: de waarde, dan de losse steen. <b>Poker</b>: de waarde van de vijf stenen.</li>
</ul>
<p><b>Poker van azen</b> (${pk('nl', 'AAAAA')}) is de hoogste aankondiging van het spel: daar gaat niets boven.</p>

<h2 id="aankondigen">Hoe je aankondigt</h2>
<p>Een aankondiging is een precieze hand: de combinatie en de waarden. Je mag alleen zeggen wat telt; stenen die je niet noemt, tellen als <b>de laagst mogelijke</b>. Gewoon „drie boeren” is dus de zwakste hand met drie boeren. Enkele aankondigingen, van laag naar hoog:</p>
<ol>
<li>„Paar vrouwen” (bedoeld: met 9, 10 en boer)</li>
<li>„Paar vrouwen, aas, 10, 9”: hetzelfde paar, maar met een aas erbij, dus hoger</li>
<li>„Twee paar, boeren en negens”</li>
<li>„Twee paar, heren en tienen”</li>
<li>„Drie negens”, dan „drie azen”</li>
<li>„Kleine straat”, dan „grote straat”</li>
<li>„Full house, negens en tienen”, „negens en azen”, dan „tienen en negens”</li>
<li>„Carré tienen”, dan „poker van negens”… tot „poker van azen”</li>
</ol>
<p>Op 421online stelt het spel de hand <b>net boven</b> de ontvangen aankondiging voor, en met de keuzelijst (combinatie, dan waarden) kondig je hoger aan zonder te typen.</p>

<h2 id="ronde">Een ronde, stap voor stap</h2>
<ol class="steps">
<li><b>De eerste speler</b> schudt de beker en bekijkt de vijf stenen zonder ze te tonen. Bij de eerste aankondiging van een ronde mag <b>elke hand</b>.</li>
<li><b>De volgende speler</b> kiest: „Leugenaar!” of „Ik geloof je”.</li>
<li><b>Gelooft hij</b>, dan neemt hij de beker en ziet hij de stenen. Hij mag <b>één keer</b> 0 tot 5 stenen naar keuze opnieuw gooien; de rest blijft liggen. Daarna kondigt hij de volgende een <b>strikt hogere</b> hand aan, waar of gelogen.</li>
<li><b>Roept hij „Leugenaar!”</b>, dan gaat de beker voor iedereen omhoog. Echte hand minstens gelijk aan de aankondiging: de roeper verliest een leven. Lager: de aankondiger verliest een leven.</li>
<li><b>Nieuwe ronde</b>: de verliezer begint, met een nieuwe worp van alle vijf stenen.</li>
</ol>
<p>Krijg je „poker van azen” aangekondigd, dan bestaat er niets hogers: je kunt alleen nog „Leugenaar!” roepen.</p>

<h2 id="voorbeeld">Voorbeeld</h2>
<p>Anna, Bram en Clara hebben elk ${POKER.defaultLives} levens. Anna schudt de beker en ziet ${pk('nl', 'KKJT9')}: een paar heren. Ze kondigt eerlijk „paar heren” aan.</p>
<p>Bram gelooft haar. Hij neemt de beker, houdt de twee heren en gooit de andere drie opnieuw: ${pk('nl', 'KK99Q')}, twee paar, heren en negens. Hij moet hoger dan „paar heren” aankondigen; hij kan de waarheid zeggen, maar zet liever druk: „drie tienen”.</p>
<p>Clara ruikt bluf en roept „Leugenaar!”. De beker gaat omhoog: twee paar, lager dan drie tienen. Bram heeft gelogen, <b>hij verliest een leven</b> en begint de volgende ronde met een nieuwe worp. Had er drie tienen onder de beker gelegen, al was het nipt, dan had Clara het leven verloren.</p>

<h2 id="einde">Levens en einde van het spel</h2>
<p>Iedereen begint met ${POKER.defaultLives} levens (${POKER.lives[1]} als je dat kiest voor een privéspel of een spel tegen de computer). Wie geen leven meer heeft, ligt eruit en houdt zijn plaats in de rangschikking volgens de volgorde waarin hij afviel. <b>De laatste die overblijft, wint.</b> Online heeft iedereen ${POKER.turnSeconds} seconden om te kiezen, opnieuw te gooien en aan te kondigen; daarna gelooft het spel voor hem, gooit niets opnieuw en kondigt de eerstvolgende hogere hand aan.</p>

<h2 id="variant">Variant zonder straten</h2>
<p>Aan sommige tafels tellen straten niet. Met de instelling „zonder straten” (standaard uit) verdwijnen de kleine en de grote straat: 9-10-B-V-H of 10-B-V-H-A tellen dan als „niets”, wat in één worp ${pct('nl', O.nothingNoStraights)} van de keren gebeurt.</p>

<h2 id="bluf">Bluftips</h2>
<ul>
<li><b>Een paar is altijd geloofwaardig</b>: één worp geeft in ${pct('nl', O.atLeastPair)} van de gevallen minstens een paar. „Leugenaar!” roepen bij een klein paar aan het begin van een ronde gaat bijna altijd mis.</li>
<li><b>Weet wat opnieuw gooien oplevert</b>: een paar houden en drie stenen opnieuw gooien geeft in ${pct('nl', O.pairToTripsOrBetter, 0)} van de gevallen minstens drie gelijke; drie gelijke houden en twee opnieuw gooien geeft in ${pct('nl', O.tripsToFullOrBetter, 0)} een full house of beter; twee paar met één steen opnieuw geeft één keer op drie een full house.</li>
<li><b>Hoe hoger de aankondiging, hoe meer twijfel loont</b>: een full house of beter valt in één worp maar in ${pct('nl', O.fullOrBetter)} van de gevallen. Op dat niveau heeft de aankondiger vaak iets moeten verzinnen, zelfs met een herworp.</li>
<li><b>Kondig iets hoger aan dan nodig</b> om de volgende onder druk te zetten, want die moet nog hoger… maar een te hoge aankondiging lokt „Leugenaar!” uit.</li>
<li><b>Zeg af en toe de waarheid</b>: wie elke keer bluft, is snel door. Een echte hand, zelfverzekerd aangekondigd, kost twijfelaars levens.</li>
<li><b>Denk een zet vooruit</b>: als je gelooft, moet jij daarna hoger aankondigen. Een al heel hoge aankondiging geloven, betekent dat je zelf zult moeten bluffen.</li>
</ul>
<p>Klaar om je pokerface te testen? Start een spel tegen de computer, of ga via het <a href="${menuOf('nl')}">menu van Poker menteur</a> online spelen. Liever een spel zonder bluf? De <a href="/421-dobbelspel-regels">spelregels van 421</a> leer je in één ronde.</p>
${play('nl', 'Probeer een spel', 'Het spel controleert de aankondigingen en telt de levens')}
`,
    faq: [
      ['Wat is de beste hand bij blufpoker met pokerstenen?', 'Poker van azen, vijf azen: de hoogste aankondiging van het spel, niemand kan erboven.'],
      ['Wint een straat van drie gelijke?', 'Ja: de kleine straat (9-10-B-V-H) en de grote straat (10-B-V-H-A) winnen van elke drie gelijke, maar verliezen van full house, carré en poker.'],
      ['Wat als de stenen precies de aankondiging zijn?', 'Dan klopte de aankondiging: wie „Leugenaar!” riep, verliest een leven.'],
      ['Hoeveel stenen mag ik opnieuw gooien?', 'Als je een aankondiging gelooft, mag je één keer 0 tot 5 stenen naar keuze opnieuw gooien, voor je hoger aankondigt.'],
      ['Moet ik de waarheid zeggen?', 'Nee, daar draait het spel om: je mag een hand aankondigen die je niet hebt, zolang ze hoger is dan wat je kreeg.'],
    ],
    related: [nlRel.online, '421-dobbelspel-regels', 'online-dobbelspel-met-vrienden'],
  },
];

export const pokerPagesI18n = { en: pokerEn, de: pokerDe, nl: pokerNl };
/** Pages françaises : `lang` absent (gabarit français). */
for (const p of pokerPagesFr) delete p.lang;
