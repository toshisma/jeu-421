/**
 * Pages d'aide en anglais (capter les anglophones qui cherchent à jouer au Farkle, ou au jeu de dés de
 * Kingdom Come: Deliverance 2, en ligne avec des amis). Branchées sur scripts/build-seo.mjs.
 *
 * Ce qui y est dit est vérifié : règles et valeurs = moteur du Courtisan (shared/dixmille/engine.ts, via
 * kindValue et DM_TARGETS, contrôlés par tests/seo.test.ts) ; probabilités = MISS_CHANCE de shared/dixmille/ai.ts ;
 * durées = mêmes simulations que les pages françaises (scripts/dixmille-simulate.ts).
 * Kingdom Come : uniquement les règles de base du jeu traditionnel, aucun nom de dé spécial, d'objet ou de
 * personnage du jeu vidéo, aucune image, aucun texte recopié. Mention d'indépendance sur toute page qui le cite.
 * Aucun site concurrent, aucune note ni faux avis. Seul Le Courtisan est en anglais : c'est dit honnêtement.
 */
import { CT_OG, DM_TARGETS, kindValue } from './seo-courtisan-pages.mjs';

/** Lien « Jouer » : le mode en anglais (écrit pour un attribut HTML). */
export const EN_PLAY = '/?mode=courtisan&amp;lang=en';
export const EN_DISCLAIMER = '421online.com is an independent website, not affiliated with Warhorse Studios, Deep Silver or Plaion; Kingdom Come: Deliverance is a trademark of its owners.';
/** Chaque page anglaise et sa version française : `hreflang` réciproques, `x-default` vers le français. */
export const EN_ALTERNATES = [
  ['dix-mille-en-ligne', 'play-farkle-online'],
  ['regles-du-dix-mille', 'farkle-rules'],
  ['jeu-de-des-kingdom-come-deliverance-2', 'kingdom-come-deliverance-2-dice-game'],
];

const UPDATED = '2026-11-09';
const nb = (n) => n.toLocaleString('en-US');
const dice = (s) => `<span class="dice" role="img" aria-label="${s.split('').join('-')}">${s.split('').map((d) => `<i class="d d${d}"></i>`).join('')}</span>`;
const play = (label, sub) => `<p class="play-box"><a class="cta" href="${EN_PLAY}" data-play>${label}</a>${sub ? `<small>${sub}</small>` : ''}</p>`;
const toc = (items) => `<nav class="toc" aria-label="Contents"><b>Contents</b><ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;
const indep = `<p class="disclaimer" role="note"><b>${EN_DISCLAIMER}</b> This page describes the traditional dice game that inspired the video game; it contains no image or text from the video game.</p>`;
const common = { lang: 'en', published: UPDATED, updated: UPDATED, play: EN_PLAY, og: CT_OG, about: 'farkle-en' };
const fr = '<p class="note">Only The Courtier (Farkle) is available in English. The rest of 421online.com, including the 421 and Coups Fourrés games, is in French.</p>';

const kinds = [1, 2, 3, 4, 5, 6].map((f) => [f, [3, 4, 5, 6].map((n) => kindValue(f, n))]);
const scoreRow = (label, d, pts) => `<tr><td>${label}<br>${dice(d)}</td><td>${pts}</td></tr>`;
const scoringTable = `<div class="table-wrap"><table>
<thead><tr><th>Combination</th><th>Points</th></tr></thead>
<tbody>
${scoreRow('A single 1', '1', '100')}
${scoreRow('A single 5', '5', '50')}
${scoreRow('Three 1s', '111', nb(kindValue(1, 3)))}
${scoreRow('Three 2s, 3s, 4s, 5s or 6s', '444', 'face × 100 (three 4s = 400)')}
${scoreRow('Four, five or six of a kind', '2222', 'doubles with each extra die (four 2s = 400)')}
${scoreRow('Straight 1–5', '12345', '500')}
${scoreRow('Straight 2–6', '23456', '750')}
${scoreRow('Full straight 1–6', '123456', nb(1500))}
</tbody></table></div>`;
const kindsTable = `<div class="table-wrap"><table>
<thead><tr><th>Face</th><th>Three</th><th>Four</th><th>Five</th><th>Six</th></tr></thead>
<tbody>
${kinds.map(([f, v]) => `<tr><td>${dice(String(f))} ${f}s</td>${v.map((x) => `<td>${nb(x)}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
const targets = DM_TARGETS.map(nb);
const targetsText = targets.join(', ').replace(/, ([^,]+)$/, ' or $1');

export const enPages = [
  // ---------------------------------------------------------------------------------------------
  {
    ...common, slug: 'play-farkle-online', nav: 'Play Farkle', short: 'Play Farkle online',
    blurb: 'Free Farkle in your browser: against the computer or with friends, 2 to 6 players.',
    title: 'Play Farkle Online Free With Friends: 6-Dice Game in Your Browser',
    description: 'Play Farkle online for free with friends: share a table code, 2 to 6 players, or play against the computer. No download, works on phone and desktop.',
    h1: 'Play Farkle online, free, with friends',
    lead: `<b>The Courtier</b> is our version of <b>Farkle</b>, the classic six-dice push-your-luck game (also known as Ten Thousand or Zilch). Open a table, send your friends a code, and play together in the browser on your phone or computer. It’s free, there’s no download, and you don’t need an account to play.`,
    body: `
${play('Play Farkle now', 'Free, no download, phone or desktop')}
${toc([['how', 'How to play with friends'], ['modes', 'Ways to play'], ['rules', 'The rules we use'], ['stakes', 'Free or for Groschen'], ['language', 'English and French'], ['kcd', 'Came from Kingdom Come?']])}

<h2 id="how">How to play with friends</h2>
<ol class="steps">
<li><b>Open <a href="${EN_PLAY}" data-play>The Courtier</a></b> and choose <b>Open a table</b>.</li>
<li><b>Share the 5-character code or the link</b>. Your friends join from any browser, no install needed.</li>
<li><b>Start the game</b> when everyone is ready: 2 to 6 players at the table, and the host can add computer players to fill empty seats.</li>
</ol>
<p>Every roll is drawn by the server, and all players see the same dice tumble in the 3D tray.</p>

<h2 id="modes">Ways to play</h2>
<div class="cards">
<section class="card"><h3>With friends online</h3><p>A private table with a code or a link, for <b>2 to 6 players</b>. Chat and quick reactions are built in.</p></section>
<section class="card"><h3>Against the computer</h3><p><b>1 to 3 opponents</b> at three levels: Beginner, who pushes their luck too far; Regular, who plays sensibly; and Sharp, who calculates the odds.</p></section>
<section class="card"><h3>Quick game</h3><p>One tap to join a public table that’s waiting for players.</p></section>
<section class="card"><h3>Your target</h3><p>Play to <b>${targetsText}</b> points. A two-player game takes about 3 turns each to ${targets[0]}, 6 to 7 turns to ${targets[1]}, and 17 to 18 turns to ${targets[2]}.</p></section>
</div>
<p class="note">Durations come from thousands of simulated games between two Regular computers, run with the game’s own engine.</p>

<h2 id="rules">The rules we use</h2>
<p>Roll six dice, set aside at least one scoring die, then <b>roll again</b> or <b>bank</b> your points. A roll with no scoring dice is a <b>farkle</b>: you lose the points from that turn. Set aside all six dice and you have <b>hot dice</b>: roll all six again. The first player to reach the target when banking <b>wins immediately</b>, with no final round. All the scoring is on the <a href="/farkle-rules">Farkle rules</a> page.</p>

<h2 id="stakes">Free or for Groschen</h2>
<p>You can play every game for free. The Courtier also has its own play money, <b>Groschen</b>: with a free account you get 20 Groschen a day and can stake them on a game, winner takes the pot. Groschen are <b>game currency only: no real money</b>, they can’t be bought or cashed out.</p>
<p>A free account (a username and a password, <b>no email address</b>) also lets you add friends and keep your progress across devices.</p>

<h2 id="language">English and French</h2>
${fr}
<p>Inside the game, a small FR / EN switch changes the language of The Courtier at any time.</p>

<h2 id="kcd">Came from Kingdom Come?</h2>
<p>If you met this game in the taverns of <i>Kingdom Come: Deliverance 2</i>, it’s the same traditional dice game at heart: see <a href="/kingdom-come-deliverance-2-dice-game">what’s the same and what’s different</a>.</p>
${indep}
${play('Roll the dice', 'Against the computer or with friends')}
`,
    faq: [
      ['Is this Farkle game free?', 'Yes. There’s no subscription, no ads and nothing to buy. It runs in your browser on a phone or a computer.'],
      ['Do my friends need an account to join?', 'No. They open your link or enter the table code, choose a name and play. An account is only needed for stakes in Groschen, friends lists and saved progress.'],
      ['How many players can play Farkle online here?', 'From 2 to 6 players at an online table, or 1 to 3 computer opponents when you play alone.'],
      ['Is the whole site in English?', 'No. Only The Courtier, the Farkle mode, is in English. The rest of 421online.com, including its other games, is in French.'],
      ['Does it use real money?', 'No. Groschen are play money only: they can’t be bought or cashed out, and you can always play for free.'],
    ],
    related: ['farkle-rules', 'kingdom-come-deliverance-2-dice-game'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...common, slug: 'farkle-rules', nav: 'Farkle rules', short: 'Farkle rules', parent: 'play-farkle-online',
    blurb: 'Scoring, farkles, hot dice and how the game ends, with worked examples.',
    title: 'Farkle Rules and Scoring: 6-Dice Combinations and Examples',
    description: 'Complete Farkle rules and scoring for six dice: 1s, 5s, three of a kind, straights, farkles, hot dice and how a game ends, with worked examples.',
    h1: 'Farkle rules and scoring',
    lead: 'Farkle is played with six dice and at least two players. The goal: <b>be the first to reach the target score</b>. These are the rules exactly as The Courtier applies them on 421online.com.',
    body: `
${toc([['turn', 'A turn'], ['scoring', 'Scoring'], ['kinds', 'Three to six of a kind'], ['examples', 'Worked examples'], ['farkle', 'Farkle'], ['hot', 'Hot dice'], ['end', 'End of the game'], ['odds', 'Odds of a farkle'], ['variants', 'Common variants']])}

<h2 id="turn">A turn</h2>
<ol class="steps">
<li>Roll <b>all six dice</b>.</li>
<li>Set aside <b>at least one scoring die</b>. You can set aside several, but <b>every die you set aside must score</b>: a 1, a 5, or a die that’s part of a combination from that roll.</li>
<li>Choose: <b>roll again</b> with the remaining dice, or <b>bank</b>. Banking adds all the points you set aside this turn to your score and ends your turn.</li>
<li>If you roll again, repeat step 2 with fewer dice, until you bank or farkle.</li>
</ol>

<h2 id="scoring">Scoring</h2>
${scoringTable}
<p>2s, 3s, 4s and 6s score nothing on their own: they only count as three of a kind or more, or in a straight.</p>

<h2 id="kinds">Three to six of a kind</h2>
<p>Three of a kind is worth the face × 100, except three 1s, worth ${nb(1000)}. <b>Each extra matching die doubles the value</b>:</p>
${kindsTable}
<p>The biggest possible roll is ${dice('111111')}: six 1s, ${nb(kindValue(1, 6))} points in one go.</p>

<h2 id="examples">Worked examples</h2>
<div class="table-wrap"><table>
<thead><tr><th>Roll and what scores</th><th>Points</th></tr></thead>
<tbody>
<tr><td>${dice('133356')}<br>Three 3s (300), the 1 (100) and the 5 (50). The 6 stays in play.</td><td>450</td></tr>
<tr><td>${dice('123455')}<br>Straight 1–5 (500) and the extra 5 (50): all six dice score, so you have hot dice.</td><td>550</td></tr>
<tr><td>${dice('222333')}<br>Two sets of three in the same roll: three 2s (200) and three 3s (300).</td><td>500</td></tr>
<tr><td>${dice('111555')}<br>Three 1s (${nb(1000)}) and three 5s (500).</td><td>${nb(1500)}</td></tr>
<tr><td>${dice('112233')}<br>Three pairs are not a combination here: only the two 1s score.</td><td>200</td></tr>
<tr><td>${dice('223346')}<br>No 1, no 5, no three of a kind, no straight: a farkle.</td><td>0</td></tr>
</tbody></table></div>
<p>A combination only counts if its dice come up <b>in the same roll</b>: a 5 set aside, then two 5s on the next roll, do not make three 5s.</p>

<h2 id="farkle">Farkle</h2>
<p>When a roll has <b>no scoring dice</b>, that’s a farkle: <b>all the points you set aside this turn are lost</b>, and play passes to the next player. Points you banked on earlier turns are safe.</p>

<h2 id="hot">Hot dice</h2>
<p>If all <b>six dice</b> have been set aside during your turn, all scoring, you have <b>hot dice</b>: you can pick up all six and roll again, keeping the points you’ve built up. You can also bank instead. There’s no limit: a turn can chain several hot dice, or lose it all on the next roll.</p>

<h2 id="end">End of the game</h2>
<p>You choose the target before the game: ${targetsText} points. <b>The first player to reach it when banking wins immediately</b> and the game ends: there is no final round for the other players. There’s no minimum to get on the board: you can bank 50 points on your very first turn.</p>

<h2 id="odds">Odds of a farkle</h2>
<div class="table-wrap"><table>
<thead><tr><th>Dice rolled</th><th>Chance of a farkle</th></tr></thead>
<tbody>
<tr><td>6</td><td>about 1 in 32 (3.1%)</td></tr>
<tr><td>5</td><td>7.7%</td></tr>
<tr><td>4</td><td>15.7%</td></tr>
<tr><td>3</td><td>27.8%</td></tr>
<tr><td>2</td><td>44.4%</td></tr>
<tr><td>1</td><td>2 in 3 (66.7%)</td></tr>
</tbody></table></div>
<p>That’s why it can pay to keep just one 1 and roll more dice, rather than setting aside everything that scores.</p>

<h2 id="variants">Common variants</h2>
<p>House rules vary a lot. These are <b>not</b> used in The Courtier, so agree on them first if you play at a real table: a minimum score to get started (often 500 or 1,000), three pairs as a combination, a penalty for three farkles in a row, a final round once someone reaches the target, or different values for four of a kind and straights.</p>
${fr}
<p class="note">${EN_DISCLAIMER}</p>
${play('Play Farkle with these rules', 'Free, in your browser')}
`,
    faq: [
      ['How much is three of a kind worth in Farkle?', 'The face value × 100 (three 4s = 400), except three 1s, worth 1,000. Each extra matching die doubles the value.'],
      ['What is a farkle?', 'A roll with no scoring dice. You lose every point you set aside during that turn, and play passes to the next player.'],
      ['What are hot dice?', 'When all six dice have been set aside during a turn, all scoring. You can roll all six again and keep building your score.'],
      ['Do you need a minimum score to get on the board?', 'Not in The Courtier: you can bank from your first turn, even 50 points. Some house rules ask for 500 or 1,000 to start.'],
      ['Do three pairs score in Farkle?', 'Not here: only the 1s and 5s of a roll like 1-1-2-2-3-3 score. In some house rules three pairs count as a combination.'],
      ['Does the other player get a last turn?', 'No: the first player to reach the target when banking wins immediately.'],
    ],
    related: ['play-farkle-online', 'kingdom-come-deliverance-2-dice-game'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...common, slug: 'kingdom-come-deliverance-2-dice-game', nav: 'KCD2 dice game', short: 'KCD2 dice game online',
    blurb: 'The traditional game behind the tavern dice: what’s the same, what’s different, and where to play it with friends.',
    title: 'KCD2 Dice Game Online With Friends: Play the Traditional Game',
    description: 'Want to play the dice game from Kingdom Come: Deliverance 2 with friends? Play its traditional six-dice version, Farkle, free online. Independent site.',
    h1: 'The Kingdom Come: Deliverance 2 dice game, online with friends',
    lead: `The dice game in <i>Kingdom Come: Deliverance 2</i> is based on a traditional six-dice game known as <b>Farkle</b>. You can play that traditional game online with your friends, free, on 421online.com. This is <b>not an official version</b> of the video game, and it’s not the game itself: it’s the old dice game that inspired it.`,
    body: `
${indep}
${toc([['basics', 'The basic rules'], ['different', 'What the video game adds'], ['play', 'Play it with friends'], ['language', 'English and French']])}

<h2 id="basics">The basic rules</h2>
<p>Like the traditional game, the base rules work like this: roll six dice, set aside at least one scoring die, then roll the rest again or bank your points. A roll with nothing to score loses your points for the turn. Set aside all six dice and you can roll all six again.</p>
<p>The common scoring: a 1 is worth 100, a 5 is worth 50, three of a kind is the face × 100 (three 1s: ${nb(1000)}), each extra matching die doubles the value, and straights are worth 500 (1 to 5), 750 (2 to 6) and ${nb(1500)} (1 to 6). See every combination on the <a href="/farkle-rules">Farkle rules</a> page. Details can vary between versions; on 421online.com, the first player to reach the target when banking wins immediately.</p>

<h2 id="different">What the video game adds</h2>
<p>In the video game, the dice game is part of a role-playing world: it adds <b>wagers</b> in the game’s money, <b>special dice</b> that don’t roll like ordinary ones, and <b>collectible items</b> that change the game. The Courtier has none of those: it’s played with six ordinary, fair dice. You can stake play money if you want, never real money.</p>

<h2 id="play">Play it with friends</h2>
<p>Want a game of dice without launching the video game, or to show it to friends who don’t own it? On <a href="${EN_PLAY}" data-play>421online.com</a>, The Courtier lets you play Farkle:</p>
<ul>
<li><b>for free</b>, with no ads or purchases, in a phone or computer browser;</li>
<li><b>with friends online</b>, 2 to 6 players at a table you share with a code or a link;</li>
<li><b>against the computer</b>, 1 to 3 opponents at three levels;</li>
<li>to <b>${targetsText} points</b>, depending on how much time you have.</li>
</ul>

<h2 id="language">English and French</h2>
${fr}
${play('Play the traditional game', 'Farkle with friends, free in your browser')}
`,
    faq: [
      ['Is the Kingdom Come: Deliverance 2 dice game the same as Farkle?', 'It’s based on the traditional game of Farkle and uses its basic rules, with extra elements of its own. It’s not exactly the same game.'],
      ['Can I play the KCD2 dice game online with friends?', 'You can play its traditional version: on 421online.com, open a table in The Courtier and send your friends the code, for 2 to 6 players. This is not the video game itself, which is single-player.'],
      ['Is this an official Kingdom Come: Deliverance game?', 'No. 421online.com is an independent website, not affiliated with Warhorse Studios, Deep Silver or Plaion, and this is the traditional game that inspired the video game.'],
      ['Are the special dice from the video game included?', 'No. The Courtier uses six ordinary, fair dice, and has no items with special effects.'],
      ['Is it in English?', 'The Courtier, the Farkle mode, is in English. The rest of 421online.com is in French.'],
    ],
    related: ['play-farkle-online', 'farkle-rules'],
  },
];
