/**
 * Pages « variantes du 421 » et « vocabulaire du 421 » (français), utilisées par build-seo.mjs.
 *
 * Règle de rédaction : n'écrire que ce qui est attesté par PLUSIEURS recueils de règles consultés le 13/11/2026
 * (liste SOURCES ci-dessous, gardée pour mémoire, non affichée), et le présenter comme « selon les comptoirs » :
 * aucune variante n'est attribuée à une région ou un pays faute de source sérieuse (pas de « 421 belge » inventé).
 * Chaque réglage cité existe dans le jeu : clé de shared/config.ts + libellé exact de l'écran (zone jeu421),
 * contrôlés par tests/variantes.test.ts (valeurs acceptées par sanitizeConfig, libellés identiques).
 */
export const SOURCES = [
  'https://regles2jeux.fr/regles-du-421/',
  'https://www.regles-du-jeu.net/regles-du-jeux-du-421/',
  'https://www.provence7.com/portails/traditions/fetes-et-jeux-en-provence/jeux-de-des/',
  'https://www.lemagloisirs.fr/regle-421/',
  'https://v-lo-club-noeuxois.over-blog.com/article-le-421-est-un-jeu-populaire-37661880.html',
  'https://verane.forumgaming.fr/t25-regles-du-421',
  'https://regis-iglesias.over-blog.com/article-le-421-31302268.html',
  'https://qcsalon.net/en/zanzibar',
  'https://rulespal.com/four-twenty-one/rulebook',
  'https://www.regles-du-jeu.net/regles-du-zanzibar/',
];

/**
 * Réglages du jeu cités dans les pages : clé de GameConfig, clé du libellé (zone jeu421), libellé exact affiché,
 * et valeurs données en exemple (toutes doivent être acceptées telles quelles par sanitizeConfig).
 */
export const VARIANT_SETTINGS = [
  { key: 'values.v421', i18n: null, label: '4-2-1', examples: [8, 10, 11] },
  { key: 'totalTokens', i18n: 'g421.cfgE.tokensPot', label: 'Jetons dans le pot', examples: [21, 11] },
  { key: 'values.nenetteMin', i18n: null, label: 'Nénette', examples: [2, 4] },
  { key: 'chargeThrows', i18n: 'g421.cfgE.chargeThrows', label: 'Lancers pendant la charge', examples: [1, 3] },
  { key: 'maxThrows', i18n: 'g421.cfgE.maxThrows', label: 'Lancers max. par tour', examples: [3] },
  { key: 'leaderSetsThrows', i18n: 'g421.cfgE.leaderSets', label: 'Le premier joueur fixe le nombre de lancers', examples: [true, false] },
  { key: 'tieRule', i18n: 'g421.cfgE.tieLast', label: 'Égalité pour la dernière place', examples: ['barrage', 'premierPerd', 'dernierPerd'] },
  { key: 'rolloffMode', i18n: 'g421.cfgE.barMode', label: 'Barrage départagé', examples: ['figure', 'addition'] },
  { key: 'bestTieRule', i18n: 'g421.cfgE.tieBest', label: 'Égalité pour la meilleure combinaison', examples: ['barrage', 'premier'] },
  { key: 'variant', i18n: 'g421.cfgE.variant', label: 'Variante', examples: ['classique', 'decharge', 'manches'] },
  { key: 'rounds', i18n: 'g421.cfgE.rounds', label: 'Nombre de manches', examples: [5] },
];
/** Autres libellés de l'écran cités (chemin pour trouver les réglages). */
export const VARIANT_UI = [
  { i18n: 'app.421_classique', label: '421 classique' },
  { i18n: 'g421.menu.playCpu', label: 'Jouer contre l\'ordinateur' },
  { i18n: 'g421.solo.rules', label: 'Règles' },
  { i18n: 'g421.cfgE.customize', label: 'Personnaliser les règles' },
  { i18n: 'g421.cfgE.values', label: 'Valeur des combinaisons' },
  { i18n: 'g421.mode.blitz.name', label: 'Blitz' },
  { i18n: 'g421.variant.manches', label: 'Aux points' },
  { i18n: 'g421.tie.premierPerd', label: 'Le premier à avoir joué perd' },
  { i18n: 'g421.cfgE.byAdd', label: 'À l\'addition' },
];

const dates = { published: '2026-11-13', updated: '2026-11-13' };
const play = (label, sub, href = '/?jouer=1') => `<p class="play-box"><a class="cta" href="${href}" data-play>${label}</a>${sub ? `<small>${sub}</small>` : ''}</p>`;
const toc = (items) => `<nav class="toc" aria-label="Sommaire"><b>Sommaire</b><ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;
const dice = (s) => `<span class="dice" role="img" aria-label="${s.split('').join('-')}">${s.split('').map((d) => `<i class="d d${d}"></i>`).join('')}</span>`;
/** Libellé d'un réglage tel qu'affiché dans le jeu. */
const R = (key) => `«\u00a0${VARIANT_SETTINGS.find((s) => s.key === key).label}\u00a0»`;
const U = (i18n) => `«\u00a0${VARIANT_UI.find((s) => s.i18n === i18n).label.replace(/'/g, '’')}\u00a0»`;
const HOW = `<p class="note">Où régler : contre l’ordinateur, ${U('app.421_classique')} › ${U('g421.menu.playCpu')} › ${U('g421.solo.rules')} › ${U('g421.cfgE.customize')} ; entre amis, l’hôte règle la table dans le salon (<a href="/?jouer=amis" data-play>créer une table</a>).</p>`;

export const variantesPages = [
  {
    slug: 'variantes-du-421', nav: 'Variantes', short: 'Variantes du 421', ...dates, parent: 'regles-du-421',
    blurb: 'Valeur du 4-2-1, 21 ou 11 jetons, nénette, charge en un lancer, égalités : les règles qui changent et comment les régler.',
    title: 'Variantes du 421 : les règles qui changent d’un comptoir à l’autre',
    description: '421 à 8 ou 10 jetons, 21 ou 11 jetons, nénette à 2 ou 4, charge en un lancer, rampo : les variantes du 421 et comment les jouer en ligne.',
    h1: 'Les variantes du 421',
    lead: 'Demandez les règles du 421 à trois comptoirs, vous aurez trois réponses. Le cœur du jeu ne bouge pas, mais la valeur du 4-2-1, le nombre de jetons ou le sort de la nénette changent <b>selon les tables</b>. Voici les variantes que l’on retrouve dans plusieurs recueils de règles, et, pour chacune, le réglage qui permet de la jouer sur <a href="/" data-play>421online</a>.',
    body: `
${toc([['socle', 'Ce qui ne change pas'], ['valeur-421', 'Le 4-2-1 vaut 8, 10 ou 11'], ['jetons', '21 ou 11 jetons'], ['nenette', 'La nénette à 2 ou à 4'], ['charge', 'La charge en un seul lancer'], ['le-bon', 'Le premier joueur fixe les lancers'], ['egalites', 'Égalités : rampo et barrage'], ['points', 'Aux points plutôt qu’aux jetons'], ['limites', 'Ce que le site ne règle pas'], ['regions', 'Et les « variantes régionales » ?']])}

<h2 id="socle">Ce qui ne change pas</h2>
<p>Partout : trois dés, des jetons, une <b>charge</b> où le perdant de chaque manche prend des jetons au pot, puis une <b>décharge</b> où le meilleur lui en donne. Le 4-2-1 est la meilleure combinaison, la <b>nénette</b> (${dice('221')}) la plus faible, et le dernier qui garde des jetons a perdu (et paie la tournée, dit la tradition). Le détail est sur la page des <a href="/regles-du-421">règles du 421</a>.</p>
${HOW}

<h2 id="valeur-421">Le 4-2-1 vaut 8, 10 ou 11 jetons</h2>
<p>C’est la différence la plus fréquente : le 4-2-1 rapporte <b>8 jetons</b> dans beaucoup de recueils, <b>10</b> dans d’autres, parfois 11. Le jeu utilise 8 par défaut. Pour jouer à 10 : ${U('g421.cfgE.customize')} › ${U('g421.cfgE.values')} › ${R('values.v421')}. Les trois as (7), les suites (2) et les autres combinaisons (1) se règlent au même endroit.</p>

<h2 id="jetons">21 ou 11 jetons au pot</h2>
<p>Le pot classique compte <b>21 jetons</b> ; on joue aussi souvent à <b>11</b> pour une partie plus courte. Réglage : ${R('totalTokens')}. Le format ${U('g421.mode.blitz.name')}, prêt à jouer, prend 11 jetons et 10 secondes par décision.</p>

<h2 id="nenette">La nénette à 2 ou à 4 jetons</h2>
<p>Perdre sur une nénette coûte cher : le perdant prend <b>au moins 2 jetons</b> dans la règle la plus répandue, et <b>4</b> dans certaines variantes. Réglage : ${R('values.nenetteMin')} (le minimum pris), dans ${U('g421.cfgE.values')}.</p>

<h2 id="charge">La charge en un seul lancer</h2>
<p>Selon les tables, la charge se joue en <b>un seul lancer</b> par joueur, sans relance, pour distribuer vite les jetons, ou avec relances, comme la décharge. Le jeu applique un lancer par défaut ; réglage : ${R('chargeThrows')} (jusqu’à la valeur de ${R('maxThrows')}, 3 en général).</p>

<h2 id="le-bon">Le premier joueur fixe le nombre de lancers</h2>
<p>Dans la décharge, celui qui ouvre la manche peut s’arrêter avant ses trois lancers (il annonce « le bon ») ; les suivants n’ont alors pas droit à plus de lancers que lui. Les règles le présentent presque toujours ainsi, mais certaines tables l’oublient. Réglage : ${R('leaderSetsThrows')}.</p>

<h2 id="egalites">Égalités : rampo et barrage</h2>
<p>Quand deux joueurs font la même plus mauvaise combinaison, on les départage : on parle de <b>rampo</b> ou de <b>barrage</b>, les ex æquo relançant pour savoir qui perd. Certaines tables préfèrent faire perdre le premier (ou le dernier) à avoir joué. Réglages : ${R('tieRule')} (barrage, ${U('g421.tie.premierPerd')} ou le dernier), ${R('rolloffMode')} (à la figure ou ${U('g421.cfgE.byAdd')}), et, pour la décharge, ${R('bestTieRule')}.</p>

<h2 id="points">Aux points plutôt qu’aux jetons</h2>
<p>Sans jetons sous la main, certains comptent des points : chacun ajoute la valeur de sa combinaison, sur un nombre de manches fixé à l’avance, et le plus haut total gagne. Réglage : ${R('variant')} › ${U('g421.variant.manches')}, puis ${R('rounds')}. C’est aussi le principe du Zanzibar, un proche cousin du 421 (voir les <a href="/jeux-de-des">jeux de dés classiques</a>).</p>

<h2 id="limites">Ce que le site ne règle pas</h2>
<ul>
<li><b>L’ordre « deux as » / brelan</b> : à valeur égale, le jeu fait passer 6-1-1 devant 6-6-6, comme la plupart des règles ; cet ordre n’est pas modifiable.</li>
<li><b>La partie en plusieurs manches perdues</b> : certains comptoirs ne font payer la tournée qu’à celui qui perd deux parties. Le jeu compte une partie à la fois : enchaînez la revanche.</li>
<li><b>Celui qui ramasse tout le pot</b> : s’il est le seul à avoir des jetons à la fin de la charge, il a perdu d’office, comme le disent plusieurs règles. C’est déjà le cas dans le jeu, sans réglage : les autres sont sortis.</li>
</ul>

<h2 id="regions">Et les « variantes régionales » ?</h2>
<p>On lit souvent que le 421 « change selon les régions ». C’est vrai au sens où chaque comptoir a ses habitudes, mais nous n’avons trouvé aucune source sérieuse qui attache une règle précise à une région, à la Belgique ou à la Suisse. Le « 421 belge », par exemple, n’est pas une variante : plusieurs recueils donnent ce surnom au ${dice('422')} 4-2-2, une combinaison qui ne vaut rien. Le vocabulaire, lui, varie vraiment : voir le <a href="/vocabulaire-du-421">vocabulaire du 421</a>.</p>
${play('Jouer avec vos règles', 'Une table entre amis : l’hôte choisit les règles', '/?jouer=amis')}
`,
    faq: [
      ['Combien vaut le 421 : 8 ou 10 jetons ?', 'Les deux se jouent : 8 jetons dans beaucoup de règles, 10 dans d’autres, parfois 11. Sur 421online, la valeur se règle avant la partie (8 par défaut).'],
      ['Combien de jetons pour jouer au 421 ?', 'Traditionnellement 21 jetons au pot ; on joue aussi à 11 pour une partie plus courte.'],
      ['Combien prend-on avec une nénette ?', 'Au moins 2 jetons dans la règle la plus répandue, 4 dans certaines variantes.'],
      ['Existe-t-il un 421 belge ?', 'Pas comme variante de règles : ce nom désigne, dans plusieurs recueils, la combinaison 4-2-2, qui ne vaut rien.'],
      ['Peut-on jouer au 421 avec ses propres règles en ligne ?', 'Oui : contre l’ordinateur ou à une table privée entre amis, toutes ces valeurs se règlent avant la partie.'],
    ],
    related: ['regles-du-421', 'vocabulaire-du-421', 'combinaisons-du-421', '421-entre-amis'],
  },
  {
    slug: 'vocabulaire-du-421', nav: 'Vocabulaire', short: 'Vocabulaire du 421', ...dates, parent: 'regles-du-421',
    blurb: 'Fiche, baraque, tierce, nénette, rampo, « le bon » : les mots du 421 expliqués.',
    title: 'Vocabulaire du 421 : fiche, baraque, tierce, nénette, rampo',
    description: 'Les mots du 421 expliqués : fiche, baraque ou zenzi, tierce, nénette, charge, décharge, rampo, « le bon », pot. Avec la valeur de chaque combinaison.',
    h1: 'Le vocabulaire du 421',
    lead: 'Au comptoir, on ne dit pas « deux as et un six » mais « une fiche de six ». Voici les mots du 421 que l’on retrouve d’un recueil de règles à l’autre, avec ce qu’ils valent dans le jeu.',
    body: `
${toc([['combinaisons', 'Les combinaisons'], ['partie', 'Le déroulé d’une partie'], ['surnoms', 'Quelques surnoms de comptoir']])}

<h2 id="combinaisons">Les combinaisons</h2>
<div class="table-wrap"><table>
<thead><tr><th>Mot</th><th>Ce que c’est</th><th>Valeur par défaut sur le site</th></tr></thead>
<tbody>
<tr><td><b>Le 421</b></td><td>${dice('421')} la meilleure combinaison</td><td>8 jetons (réglable)</td></tr>
<tr><td><b>Fiche</b> (ou « Mac », « deux as »)</td><td>${dice('611')} deux as et un autre dé, qui donne sa valeur ; trois as (${dice('111')}) valent 7</td><td>la valeur du dé seul (6-1-1 = 6)</td></tr>
<tr><td><b>Baraque</b> (ou zenzi, brelan)</td><td>${dice('555')} trois dés identiques ; à valeur égale, la fiche passe devant</td><td>la valeur du dé (5-5-5 = 5)</td></tr>
<tr><td><b>Tierce</b> (ou suite)</td><td>${dice('654')} trois dés qui se suivent ; 6-5-4 bat 3-2-1</td><td>2 jetons (réglable)</td></tr>
<tr><td><b>Nénette</b></td><td>${dice('221')} la plus faible combinaison</td><td>le perdant prend au moins 2 jetons (réglable)</td></tr>
<tr><td>Les autres</td><td>${dice('652')} comparées dé par dé, du plus fort au plus faible</td><td>1 jeton (réglable)</td></tr>
</tbody></table></div>
<p>Classement complet et probabilités : <a href="/combinaisons-du-421">combinaisons du 421</a>. Ce qui se règle autrement d’une table à l’autre : <a href="/variantes-du-421">variantes du 421</a>.</p>

<h2 id="partie">Le déroulé d’une partie</h2>
<dl>
<dt><b>Le pot</b></dt><dd>Les jetons au milieu de la table au départ, 21 en général.</dd>
<dt><b>La charge</b></dt><dd>Première phase : le perdant de chaque manche prend au pot autant de jetons que vaut la meilleure combinaison de la manche, jusqu’à ce que le pot soit vide.</dd>
<dt><b>La décharge</b></dt><dd>Seconde phase : le meilleur de la manche donne ses jetons au perdant. Sans jeton, on sort ; le dernier à en avoir a perdu.</dd>
<dt><b>« Le bon »</b></dt><dd>Ce qu’annonce le joueur satisfait de sa combinaison avant d’avoir épuisé ses lancers. Le premier de la manche fixe ainsi le nombre de lancers des suivants. Dans le jeu : s’arrêter avant son dernier lancer.</dd>
<dt><b>Rampo, barrage</b></dt><dd>Égalité pour la plus faible combinaison : les ex æquo relancent pour se départager. Le jeu propose aussi d’autres façons de trancher (voir les <a href="/variantes-du-421#egalites">variantes</a>).</dd>
<dt><b>La tournée</b></dt><dd>Ce que paie traditionnellement le perdant, au comptoir. Sur le site, il n’y a rien à payer : les pièces du jeu ne s’achètent pas.</dd>
</dl>

<h2 id="surnoms">Quelques surnoms de comptoir</h2>
<p>Certaines combinaisons ont des surnoms qui changent d’un bistrot à l’autre. Parmi ceux que citent plusieurs recueils : la <b>Thérèse</b> (${dice('553')}), le <b>torchon</b> (${dice('544')}), et le <b>« 421 belge »</b> (${dice('422')}), qui ne vaut rien malgré son nom. On les entend selon les comptoirs : ils ne changent rien aux règles.</p>
${play('Lancer les dés', 'Le jeu applique les règles et compte les jetons pour vous')}
`,
    faq: [
      ['Qu’est-ce qu’une fiche au 421 ?', 'Deux as et un autre dé : la fiche vaut la valeur de ce troisième dé (6-1-1 vaut 6). Trois as valent 7.'],
      ['Qu’est-ce qu’une baraque au 421 ?', 'Trois dés identiques, aussi appelés zenzi ou brelan ; ils valent la valeur du dé, et la fiche passe devant à valeur égale.'],
      ['Que veut dire « rampo » au 421 ?', 'C’est l’égalité pour la plus faible combinaison : les ex æquo relancent pour savoir qui perd.'],
      ['Qu’est-ce que la nénette ?', 'Le 2-2-1, la plus faible combinaison du 421. Celui qui perd avec une nénette prend au moins 2 jetons.'],
    ],
    related: ['variantes-du-421', 'combinaisons-du-421', 'regles-du-421'],
  },
];
