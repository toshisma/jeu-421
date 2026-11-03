/**
 * Pages lisibles par les moteurs de recherche (HTML statique, sans JavaScript) : règles,
 * combinaisons, jouer en ligne, jouer entre amis. Plus robots.txt et sitemap.xml.
 * Usage : node scripts/build-seo.mjs   (écrit dans client/public, publié tel quel par Vite)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://421online.com';
const OUT = join(process.cwd(), 'client', 'public');
const today = new Date().toISOString().slice(0, 10);

const pages = [
  {
    slug: 'regles-du-421', nav: 'Règles',
    title: 'Règles du 421 : charge, décharge, combinaisons et nénette',
    description: 'Les règles complètes du 421, le jeu de dés de comptoir : déroulement d’une partie, charge et décharge, valeur des combinaisons, nénette, barrages et variantes.',
    h1: 'Les règles du 421',
    body: `
<p class="lead">Le 421 se joue avec trois dés et un pot de jetons. Le but est simple : <b>se débarrasser de tous ses jetons</b>. Le dernier qui en garde a perdu… et paie traditionnellement la tournée.</p>

<h2>Le matériel</h2>
<p>Trois dés, une piste (ou un bac) pour les lancer, et 21 jetons au milieu de la table. On joue à partir de deux joueurs, idéalement entre trois et six.</p>

<h2>Le déroulement d’une manche</h2>
<p>Chaque joueur, à son tour, lance les trois dés. Il peut <b>garder les dés qui l’arrangent et relancer les autres</b>, jusqu’à trois lancers au total. Le premier joueur de la manche fixe le nombre de lancers : s’il s’arrête après un seul lancer, les suivants n’auront droit qu’à un seul lancer eux aussi.</p>
<p>Quand tout le monde a joué, on compare les combinaisons. <b>Le joueur qui a la plus faible combinaison perd la manche</b>. La valeur de la <b>meilleure</b> combinaison de la manche fixe le nombre de jetons en jeu.</p>

<h2>La charge</h2>
<p>Au début, les 21 jetons sont au pot. À chaque manche, le perdant prend au pot autant de jetons que la meilleure combinaison en vaut. Pendant la charge, on ne lance souvent qu’une fois par manche pour aller plus vite. Quand le pot est vide, la charge est terminée : ceux qui n’ont aucun jeton sont déjà tirés d’affaire.</p>

<h2>La décharge</h2>
<p>Les joueurs qui ont des jetons s’affrontent. Cette fois, <b>le joueur qui a fait la meilleure combinaison donne ses jetons au perdant</b> : autant que la valeur de sa combinaison. Celui qui n’a plus de jetons sort de la partie, gagnant. Le dernier à garder des jetons a perdu.</p>

<h2>La valeur des combinaisons</h2>
<p>De la meilleure à la plus faible :</p>
<table>
<thead><tr><th>Combinaison</th><th>Exemple</th><th>Valeur</th></tr></thead>
<tbody>
<tr><td>4-2-1</td><td>4, 2, 1</td><td>8 jetons</td></tr>
<tr><td>Trois as</td><td>1, 1, 1</td><td>7 jetons</td></tr>
<tr><td>Deux as + x, puis brelan de x</td><td>6-1-1, 6-6-6, 5-1-1, 5-5-5… 2-1-1, 2-2-2</td><td>x jetons (de 6 à 2)</td></tr>
<tr><td>Suite</td><td>6-5-4, 5-4-3, 4-3-2, 3-2-1</td><td>2 jetons</td></tr>
<tr><td>Autre combinaison</td><td>6-5-2, 5-3-3…</td><td>1 jeton</td></tr>
<tr><td>Nénette</td><td>2-2-1</td><td>la plus faible : le perdant qui la fait prend au moins 2 jetons</td></tr>
</tbody></table>
<p>Entre deux « autres combinaisons », on compare les dés un à un, du plus fort au plus faible : 6-5-2 bat 6-4-3. Le détail est sur la page <a href="/combinaisons-du-421">combinaisons du 421</a>.</p>

<h2>Les égalités et les barrages</h2>
<p>Si plusieurs joueurs sont à égalité pour la plus faible combinaison, ils font un <b>barrage</b> : un seul lancer chacun, le plus faible perd. Si plusieurs joueurs sont à égalité pour la meilleure combinaison pendant la décharge, un barrage entre eux désigne celui qui donne ses jetons. Certaines tables départagent plutôt « à l’addition » (total des trois dés) ; d’autres font perdre le premier ou le dernier à avoir joué.</p>

<h2>Les variantes courantes</h2>
<ul>
<li><b>Décharge seule</b> : chacun commence avec le même nombre de jetons, sans charge.</li>
<li><b>Aux points</b> : on joue un nombre fixe de manches et on additionne la valeur de ses combinaisons.</li>
<li><b>Valeurs différentes</b> : selon les régions, le 4-2-1 vaut 10, les suites 4… Sur <a href="/">421online</a>, toutes ces valeurs se règlent avant la partie.</li>
</ul>

<h2>Jouer au 421 tout de suite</h2>
<p>Sur <a href="/">421online.com</a>, vous pouvez jouer gratuitement contre l’ordinateur, en ligne contre d’autres joueurs ou avec vos amis, sans rien installer. Le jeu applique ces règles pour vous, compte les jetons et gère les barrages.</p>
`,
    faq: [
      ['Combien de jetons au 421 ?', 'Traditionnellement 21 jetons au pot, distribués pendant la charge.'],
      ['Combien vaut un 421 ?', 'Le 4-2-1 est la meilleure combinaison et vaut 8 jetons dans la règle la plus courante (parfois 10).'],
      ['Qu’est-ce que la nénette au 421 ?', 'C’est le 2-2-1, la combinaison la plus faible. Le joueur qui perd avec une nénette prend au moins 2 jetons.'],
      ['Combien de lancers a-t-on au 421 ?', 'Jusqu’à trois lancers par tour, mais le premier joueur de la manche fixe le nombre de lancers des suivants.'],
    ],
  },
  {
    slug: 'combinaisons-du-421', nav: 'Combinaisons',
    title: 'Combinaisons du 421 : classement, valeurs et probabilités',
    description: 'Toutes les combinaisons du 421 classées de la meilleure à la plus faible, avec leur valeur en jetons et leurs chances de sortir en un lancer.',
    h1: 'Les combinaisons du 421',
    body: `
<p class="lead">Au 421, chaque tirage de trois dés donne une combinaison. Voici leur ordre exact, leur valeur en jetons et la probabilité de les obtenir <b>en un seul lancer</b> (sur 216 tirages possibles).</p>
<table>
<thead><tr><th>Rang</th><th>Combinaison</th><th>Valeur</th><th>Chance en un lancer</th></tr></thead>
<tbody>
<tr><td>1</td><td>4-2-1</td><td>8</td><td>2,8 % (6 tirages sur 216)</td></tr>
<tr><td>2</td><td>1-1-1 (trois as)</td><td>7</td><td>0,5 % (1 sur 216)</td></tr>
<tr><td>3</td><td>6-1-1</td><td>6</td><td>1,4 % (3 sur 216)</td></tr>
<tr><td>4</td><td>6-6-6</td><td>6</td><td>0,5 %</td></tr>
<tr><td>5</td><td>5-1-1</td><td>5</td><td>1,4 %</td></tr>
<tr><td>6</td><td>5-5-5</td><td>5</td><td>0,5 %</td></tr>
<tr><td>7</td><td>4-1-1</td><td>4</td><td>1,4 %</td></tr>
<tr><td>8</td><td>4-4-4</td><td>4</td><td>0,5 %</td></tr>
<tr><td>9</td><td>3-1-1</td><td>3</td><td>1,4 %</td></tr>
<tr><td>10</td><td>3-3-3</td><td>3</td><td>0,5 %</td></tr>
<tr><td>11</td><td>2-1-1</td><td>2</td><td>1,4 %</td></tr>
<tr><td>12</td><td>2-2-2</td><td>2</td><td>0,5 %</td></tr>
<tr><td>13</td><td>Suites : 6-5-4, 5-4-3, 4-3-2, 3-2-1</td><td>2</td><td>2,8 % chacune (11,1 % pour une suite quelconque)</td></tr>
<tr><td>14</td><td>Autres combinaisons</td><td>1</td><td>75 % (162 sur 216)</td></tr>
<tr><td>15</td><td>2-2-1 (nénette)</td><td>la plus faible</td><td>1,4 %</td></tr>
</tbody></table>

<h2>Comment comparer deux combinaisons</h2>
<ul>
<li>« Deux as + x » et le brelan de x valent tous les deux x jetons ; à valeur égale, <b>les deux as passent devant</b> : 6-1-1 bat 6-6-6, qui bat 5-1-1.</li>
<li>Entre deux suites, la plus haute gagne : 6-5-4 bat 3-2-1.</li>
<li>Entre deux « autres combinaisons », on range les dés du plus fort au plus faible et on compare dé par dé : 6-5-5 bat 6-5-2, qui bat 6-4-3.</li>
<li>La nénette (2-2-1) est la pire combinaison du jeu.</li>
</ul>

<h2>Quels dés garder ?</h2>
<p>Avec trois lancers, garder un 4, un 2 ou un 1 pour viser le 421 est tentant, mais garder deux as est souvent plus sûr : le dernier dé donne forcément au moins un 2-1-1, et une fois sur six les trois as. Le bon choix dépend aussi de ce que les autres ont déjà fait : si vous n’avez qu’à éviter la dernière place, inutile de tout risquer.</p>
<p>Pour vous entraîner, le <a href="/">bac d’essai de 421online</a> permet de lancer et relancer autant que vous voulez. Les règles complètes sont sur la page <a href="/regles-du-421">règles du 421</a>.</p>
`,
    faq: [
      ['Quelle est la meilleure combinaison au 421 ?', 'Le 4-2-1, qui vaut 8 jetons, devant les trois as (7 jetons).'],
      ['Est-ce que 2-1-1 bat un brelan de 4 ?', 'Non : 2-1-1 vaut 2 jetons et le brelan de 4 vaut 4. L’ordre suit la valeur : 4-1-1, 4-4-4, 3-1-1, 3-3-3, 2-1-1, 2-2-2.'],
      ['Quelle est la probabilité de faire 421 ?', '6 tirages sur 216, soit environ 2,8 % en un seul lancer.'],
    ],
  },
  {
    slug: 'jouer-au-421-en-ligne', nav: 'Jouer en ligne',
    title: 'Jouer au 421 en ligne gratuitement, contre l’ordinateur ou d’autres joueurs',
    description: 'Jouez au 421 en ligne, gratuit et sans inscription : bac de dés en 3D, adversaires de comptoir, parties en ligne, tournois et défis entre amis.',
    h1: 'Jouer au 421 en ligne, gratuitement',
    body: `
<p class="lead"><a href="/">421online.com</a> est un jeu de 421 gratuit, en français, qui se joue directement dans le navigateur, sur téléphone comme sur ordinateur. Pas de téléchargement, pas d’inscription obligatoire.</p>

<h2>Ce que vous pouvez faire</h2>
<ul>
<li><b>Jouer contre l’ordinateur</b> : jusqu’à 5 adversaires, trois niveaux de difficulté, chacun avec son caractère.</li>
<li><b>Jouer en ligne</b> : partie rapide contre d’autres joueurs, tables publiques ou privées, avec ou sans mise de pièces.</li>
<li><b>Tournois</b> : plusieurs tables jouent en même temps, les meilleurs passent au tour suivant jusqu’à la finale.</li>
<li><b>Défi du jour</b> : les mêmes dés pour tout le monde, un classement chaque jour.</li>
<li><b>Défis entre amis</b> : mêmes dés pour vous deux, chacun joue quand il veut.</li>
</ul>

<h2>Un vrai bac de dés</h2>
<p>Les dés roulent dans un bac en 3D, avec le bruit du feutre et des rebords. On peut lancer d’un geste, en glissant le doigt sur le bac ou en secouant le téléphone, ou même au gobelet. Le hasard est réel : chaque dé est tiré au sort de façon équitable, sans rien de truqué.</p>

<h2>Progresser et collectionner</h2>
<p>Chaque partie rapporte de l’expérience et des pièces, gagnées seulement en jouant : elles ne s’achètent pas. Elles servent à personnaliser votre table : tapis, rebords, décors et dés. Des sacs trouvés en jouant contiennent des dés de collection, du commun au légendaire, que les autres joueurs voient quand vous lancez.</p>

<h2>Les règles</h2>
<p>Le jeu applique les règles classiques du 421 (charge puis décharge, 21 jetons, nénette) et vous pouvez tout modifier avant une partie : nombre de jetons, de lancers, valeurs des combinaisons, règles d’égalité. Les règles sont expliquées en détail sur la page <a href="/regles-du-421">règles du 421</a>.</p>

<p><a class="cta" href="/">Jouer maintenant</a></p>
`,
    faq: [
      ['Le 421 en ligne est-il gratuit ?', 'Oui, entièrement gratuit, sans publicité et sans achat : les pièces du jeu se gagnent en jouant.'],
      ['Faut-il créer un compte ?', 'Non pour jouer. Un compte gratuit permet de garder sa progression sur plusieurs appareils et d’apparaître aux classements.'],
      ['Peut-on jouer sur téléphone ?', 'Oui, le jeu fonctionne dans le navigateur du téléphone et peut s’installer sur l’écran d’accueil comme une application.'],
    ],
  },
  {
    slug: '421-entre-amis', nav: 'Entre amis',
    title: 'Jouer au 421 entre amis : table privée, soirée sur un téléphone ou vrais dés',
    description: 'Trois façons de jouer au 421 entre amis : une table privée en ligne avec un code, une soirée sur un seul téléphone, ou avec vos vrais dés en laissant l’application arbitrer.',
    h1: 'Jouer au 421 entre amis',
    body: `
<p class="lead">Le 421 est d’abord un jeu de bande. Sur <a href="/">421online</a>, il y a trois façons d’y jouer à plusieurs, à distance ou autour de la même table.</p>

<h2>1. Une table privée en ligne</h2>
<p>Créez une table, envoyez le code ou le lien à vos amis, et jouez chacun sur son téléphone. Vous choisissez les règles, le temps pour jouer et, si vous le voulez, une mise en pièces du jeu. Des réactions et des phrases rapides permettent de chambrer sans clavier.</p>

<h2>2. Une soirée sur un seul téléphone</h2>
<p>Pas de réseau, ou envie de jouer comme au comptoir ? Le mode « soirée entre amis » se joue sur un seul téléphone que l’on passe de main en main. Jusqu’à six joueurs.</p>

<h2>3. Avec vos vrais dés : l’application arbitre</h2>
<p>Sortez vos dés et votre piste : chacun indique ses trois dés et son nombre de lancers, l’application s’occupe des jetons, des manches et des barrages. Fini les disputes sur qui doit combien.</p>

<h2>Et à distance, quand chacun a le temps</h2>
<p>Les <b>défis entre amis</b> donnent exactement les mêmes dés aux deux joueurs : chacun joue quand il veut, dans les 72 heures, et le meilleur score gagne. Une notification prévient quand votre ami a joué.</p>

<p>Besoin d’un rappel des règles avant de commencer ? Tout est sur la page <a href="/regles-du-421">règles du 421</a>, et la valeur de chaque combinaison sur <a href="/combinaisons-du-421">combinaisons du 421</a>.</p>
<p><a class="cta" href="/">Lancer une partie</a></p>
`,
    faq: [
      ['Combien de joueurs au 421 ?', 'À partir de deux joueurs ; le jeu en ligne accepte jusqu’à six joueurs par table.'],
      ['Peut-on jouer au 421 à distance avec des amis ?', 'Oui : une table privée en ligne avec un code, ou des défis à distance avec les mêmes dés pour chacun.'],
    ],
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const nav = pages.map((p) => `<a href="/${p.slug}">${p.nav}</a>`).join('');

for (const p of pages) {
  const url = `${SITE}/${p.slug}`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.description, inLanguage: 'fr', mainEntityOfPage: url, dateModified: today,
      author: { '@type': 'Organization', name: '421online' }, publisher: { '@type': 'Organization', name: '421online', url: SITE } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '421online', item: SITE }, { '@type': 'ListItem', position: 2, name: p.h1, item: url }] },
  ];
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#161b1e">
<meta name="color-scheme" content="dark only">
<meta property="og:type" content="article">
<meta property="og:site_name" content="421online">
<meta property="og:locale" content="fr_BE">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-421.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icons/icon-192.png">
<link rel="stylesheet" href="/seo.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<header class="top">
  <a class="logo" href="/" aria-label="421online, jouer"><span>421</span></a>
  <nav>${nav}</nav>
  <a class="cta small" href="/">Jouer</a>
</header>
<main>
<article>
<h1>${p.h1}</h1>
${p.body.trim()}
<section class="faq">
<h2>Questions fréquentes</h2>
${p.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n')}
</section>
</article>
</main>
<footer>
<p><a href="/">421online.com</a> : le 421, jeu de dés de comptoir, gratuit en ligne. Les pièces du jeu se gagnent en jouant et ne s’achètent pas.</p>
<p class="links">${pages.map((x) => `<a href="/${x.slug}">${x.h1}</a>`).join('')}</p>
</footer>
</body>
</html>
`;
  writeFileSync(join(OUT, `${p.slug}.html`), html);
}

writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
${pages.map((p) => `  <url><loc>${SITE}/${p.slug}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>
`);
console.log(`${pages.length} pages, robots.txt et sitemap.xml écrits dans client/public`);
