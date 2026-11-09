/**
 * Pages d'aide en anglais (capter les anglophones qui cherchent à jouer au Farkle, ou au jeu de dés de
 * Kingdom Come: Deliverance 2, en ligne avec des amis). Branchées sur scripts/build-seo.mjs.
 *
 * Ce qui y est dit est vérifié : règles et valeurs = moteur du Courtisan (shared/dixmille/engine.ts, via
 * kindValue et DM_TARGETS, contrôlés par tests/seo.test.ts) ; probabilités = MISS_CHANCE de shared/dixmille/ai.ts ;
 * durées = mêmes simulations que les pages françaises (scripts/dixmille-simulate.ts).
 * Kingdom Come : uniquement les règles de base du jeu traditionnel, aucun nom de dé spécial, d'objet ou de
 * personnage du jeu vidéo, aucune image, aucun texte recopié. Mention d'indépendance sur toute page qui le cite.
 * Aucun site concurrent, aucune note ni faux avis. Voir la note gelée en tête de scripts/seo-i18n-common.mjs :
 * ces pages ne sont publiées qu'avec le jeu entièrement traduit.
 */
import { CT_OG, DM_TARGETS, kindValue } from './seo-courtisan-pages.mjs';
import { CARDS, CF_RULES, DECK_RULES, DISCLAIMERS, UPDATED, V421, combosTable, helpers, playLinks } from './seo-i18n-common.mjs';

/** Lien « Jouer » : le mode en anglais (écrit pour un attribut HTML). */
export const EN_PLAY = '/?mode=courtisan&amp;lang=en';
export const EN_DISCLAIMER = DISCLAIMERS.en;

const nb = (n) => n.toLocaleString('en-US');
const dice = (s) => `<span class="dice" role="img" aria-label="${s.split('').join('-')}">${s.split('').map((d) => `<i class="d d${d}"></i>`).join('')}</span>`;
const play = (label, sub) => `<p class="play-box"><a class="cta" href="${EN_PLAY}" data-play>${label}</a>${sub ? `<small>${sub}</small>` : ''}</p>`;
const toc = (items) => `<nav class="toc" aria-label="Contents"><b>Contents</b><ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;
const indep = `<p class="disclaimer" role="note"><b>${EN_DISCLAIMER}</b> This page describes the traditional dice game that inspired the video game; it contains no image or text from the video game.</p>`;
const H = helpers('en');
const P = playLinks('en');
const R = CF_RULES;
const base421 = { lang: 'en', published: UPDATED, updated: UPDATED, play: P.l421 };
const baseCF = { lang: 'en', published: UPDATED, updated: UPDATED, play: P.cartes, og: '/og-coups-fourres.jpg' };
const play421 = (a, b) => H.play(P.l421, a, b);
const playCF = (a, b) => H.play(P.cartes, a, b);
const L421 = { head: ['Hand', 'Example', 'Value'], tokens: (n) => `${n} token${n > 1 ? 's' : ''}`, r421: '4-2-1', r111: 'Three 1s', rx: 'Two 1s + x, then three x', rxv: 'x tokens (6 down to 2)', rs: 'Straight', ro: 'Any other hand', rn: 'Nénette (the worst)', rnv: `the loser takes at least ${V421.nenette} tokens` };
const common = { lang: 'en', published: UPDATED, updated: UPDATED, play: EN_PLAY, og: CT_OG, about: 'farkle-en' };

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
${toc([['how', 'How to play with friends'], ['modes', 'Ways to play'], ['rules', 'The rules we use'], ['stakes', 'Free or for Groschen'], ['language', 'Languages'], ['kcd', 'Came from Kingdom Come?']])}

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

<h2 id="language">Languages</h2>
<p>The game is available in English, French, German and Dutch. A language selector in the game settings lets you switch at any time.</p>

<h2 id="kcd">Came from Kingdom Come?</h2>
<p>If you met this game in the taverns of <i>Kingdom Come: Deliverance 2</i>, it’s the same traditional dice game at heart: see <a href="/kingdom-come-deliverance-2-dice-game">what’s the same and what’s different</a>.</p>
${indep}
${play('Roll the dice', 'Against the computer or with friends')}
`,
    faq: [
      ['Is this Farkle game free?', 'Yes. There’s no subscription, no ads and nothing to buy. It runs in your browser on a phone or a computer.'],
      ['Do my friends need an account to join?', 'No. They open your link or enter the table code, choose a name and play. An account is only needed for stakes in Groschen, friends lists and saved progress.'],
      ['How many players can play Farkle online here?', 'From 2 to 6 players at an online table, or 1 to 3 computer opponents when you play alone.'],
      ['Which languages is the game available in?', 'English, French, German and Dutch. You can switch language at any time in the game settings.'],
      ['Does it use real money?', 'No. Groschen are play money only: they can’t be bought or cashed out, and you can always play for free.'],
    ],
    related: ['farkle-rules', 'kingdom-come-deliverance-2-dice-game', 'online-dice-game-with-friends'],
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
${toc([['basics', 'The basic rules'], ['different', 'What the video game adds'], ['play', 'Play it with friends']])}

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

${play('Play the traditional game', 'Farkle with friends, free in your browser')}
`,
    faq: [
      ['Is the Kingdom Come: Deliverance 2 dice game the same as Farkle?', 'It’s based on the traditional game of Farkle and uses its basic rules, with extra elements of its own. It’s not exactly the same game.'],
      ['Can I play the KCD2 dice game online with friends?', 'You can play its traditional version: on 421online.com, open a table in The Courtier and send your friends the code, for 2 to 6 players. This is not the video game itself, which is single-player.'],
      ['Is this an official Kingdom Come: Deliverance game?', 'No. 421online.com is an independent website, not affiliated with Warhorse Studios, Deep Silver or Plaion, and this is the traditional game that inspired the video game.'],
      ['Are the special dice from the video game included?', 'No. The Courtier uses six ordinary, fair dice, and has no items with special effects.'],
      ['Is it in English?', 'Yes. The game is available in English, French, German and Dutch.'],
    ],
    related: ['play-farkle-online', 'farkle-rules'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...base421, slug: 'play-421-dice-game-online', nav: 'Play 421', short: 'Play 421 online',
    blurb: 'The classic French bar dice game, free in your browser, alone or with friends.',
    title: 'Play 421 Online: the French Dice Game, Free in Your Browser',
    description: 'Play 421, the classic French bar dice game, free online: 3 dice, tokens, 2 to 6 players or against the computer. No download, on phone or desktop.',
    h1: 'Play 421 online, the French dice game',
    lead: `<b>421</b> (say “four-two-one”) is the dice game you’ll find on the zinc counters of French and Belgian bars: three dice, a pile of tokens, and whoever’s left holding tokens at the end traditionally buys the next round. It’s little known outside France, and <a href="${P.l421}" data-play>421online.com</a> lets you play it free, in your browser, against the computer or with friends.`,
    body: `
${play421('Play 421 now', 'Free, no download, phone or desktop')}
${H.toc('Contents', [['what', 'What is 421?'], ['how', 'How it plays'], ['modes', 'Ways to play'], ['account', 'Account or no account'], ['fair', 'Fair dice']])}

<h2 id="what">What is 421?</h2>
<p>In France, 421 is what Liar’s Dice or Yahtzee are elsewhere: the game people play between two coffees. It’s named after its best roll, ${H.dice('421')}. Everyone rolls three dice, the worst hand of the round takes tokens, and you want to get rid of yours before anyone else. A game takes a few minutes, and everybody plays every round, so nobody’s stuck waiting.</p>

<h2 id="how">How it plays</h2>
<ol class="steps">
<li>Each round, roll three dice up to ${V421.throws} times, keeping the dice you like. The first player of the round sets how many rolls everyone else gets.</li>
<li>The lowest hand loses the round, and the highest hand decides how many tokens change hands.</li>
<li>First you <b>charge</b>, taking tokens from a pot of ${V421.pot}; then you <b>discharge</b>, passing your tokens to the loser. Out of tokens: you’re safe. Last one holding tokens loses.</li>
</ol>
<p>The full rules, with an example, are on the <a href="/421-dice-game-rules">421 rules page</a>. The game counts the tokens for you, and a guided game teaches you the ropes.</p>

<h2 id="modes">Ways to play</h2>
<div class="cards">
<section class="card"><h3>Against the computer</h3><p>1 to 5 opponents at three levels, from easy to hard.</p></section>
<section class="card"><h3>Quick game</h3><p>One tap to join a public table, 2 to 6 players; the host can fill seats with computer players.</p></section>
<section class="card"><h3>Private table</h3><p>Create a table and share the link or the 5-letter code. <a href="/online-dice-game-with-friends">Playing with friends</a>.</p></section>
<section class="card"><h3>Tournaments</h3><p>Every day at 11:00 and 21:00 (Brussels time), 4 to 16 players, with an account. You can also set up your own.</p></section>
<section class="card"><h3>Daily challenge</h3><p>The same dice for everyone, five rolls, one attempt, a daily ranking.</p></section>
<section class="card"><h3>House rules</h3><p>Change tokens, rolls, values and tie rules before a game. Ready-made formats: Classic, Blitz and Sudden Death.</p></section>
<section class="card"><h3>Coups Fourrés</h3><p>421 with a deck of cards, traps and bluffing. <a href="/coups-fourres-card-dice-game">Discover it</a>.</p></section>
<section class="card"><h3>The Courtier</h3><p>The six-dice push-your-luck game. <a href="/play-farkle-online">Play Farkle</a>.</p></section>
</div>

<h2 id="account">Account or no account</h2>
<p>No account needed: choose a name and play. A free account (a username and password, <b>no email address</b>) adds friends, private messages, daily tournaments and progress saved across devices. In-game coins are earned by playing and spent on looks and tournament entries: <b>they can’t be bought</b>, and there’s nothing to buy.</p>

<h2 id="fair">Fair dice</h2>
<p>Online, every die is drawn by the server with a cryptographic random source, so no player can influence a result. The 3D tray then replays that draw so everyone sees the same dice tumble.</p>
${play421('Play 421 now', 'Your first game is a guided one')}
`,
    faq: [
      ['What is 421 in dice?', 'A traditional French bar game with three dice and tokens. The best roll is 4-2-1, the lowest hand loses each round, and the last player holding tokens loses the game.'],
      ['Is 421online free?', 'Yes, with no ads, no subscription and nothing to buy. It runs in your browser.'],
      ['How many people can play 421?', 'From 2 to 6 at an online table, or against 1 to 5 computer opponents.'],
      ['Do I need an account?', 'No. A free account, without an email address, only adds friends, daily tournaments and saved progress.'],
    ],
    related: ['421-dice-game-rules', 'online-dice-game-with-friends', 'coups-fourres-card-dice-game'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...base421, slug: '421-dice-game-rules', nav: '421 rules', short: '421 rules', parent: 'play-421-dice-game-online',
    blurb: 'Rolls, hands, charge and discharge, ties: how 421 works, with an example.',
    title: '421 Dice Game Rules: Hands, Tokens, Charge and Discharge',
    description: 'How to play 421, the French dice game: three dice, the ranking of hands, token values, charge and discharge, ties and house rules, with a worked example.',
    h1: 'How to play 421: the rules',
    lead: `421 is played with three dice and a pot of tokens. The aim is to <b>get rid of all your tokens</b>; the last player still holding some loses. These are the rules used on 421online by default, followed by the common variants.`,
    body: `
${H.toc('Contents', [['basics', 'The basics'], ['round', 'A round'], ['hands', 'The ranking of hands'], ['charge', 'Charge'], ['discharge', 'Discharge'], ['example', 'Worked example'], ['ties', 'Ties'], ['variants', 'Variants']])}

<h2 id="basics">The basics</h2>
<p>You need three six-sided dice and ${V421.pot} tokens (or matchsticks, or coins) in the middle of the table, for at least 2 players; 3 to 6 is ideal.</p>

<h2 id="round">A round</h2>
<p>Each player rolls the three dice on their turn. You can stop, or <b>keep the dice you like and reroll the rest</b>, up to ${V421.throws} rolls in all. A kept die can still be rerolled on your next roll: nothing is final until you stop.</p>
<p>The <b>first player of the round</b> sets the limit: stop after one roll and everybody else gets one roll; use two and nobody gets more than two.</p>
<p>When everyone has played, <b>the lowest hand loses the round</b>, and the <b>best hand</b> sets the number of tokens at stake. The loser starts the next round.</p>

<h2 id="hands">The ranking of hands</h2>
<p>From best to worst:</p>
${combosTable(L421, H.dice)}
<p>Between two “other hands”, sort the dice from high to low and compare one by one: 6-5-2 beats 6-4-3. Two 1s beat three of a kind of the same value: 6-1-1 beats 6-6-6, which beats 5-1-1. The 2-2-1, called the <b>nénette</b>, is the worst hand in the game.</p>

<h2 id="charge">Charge</h2>
<p>At the start, all ${V421.pot} tokens are in the pot. Each round, <b>the loser takes from the pot as many tokens as the best hand is worth</b>. During the charge, the default here is a single roll each to keep things moving. When the pot is empty the charge ends, and anybody with <b>no tokens</b> has already won and leaves the game.</p>

<h2 id="discharge">Discharge</h2>
<p>The players holding tokens carry on, this time with three rolls. <b>The player with the best hand gives the loser</b> as many tokens as their hand is worth. When you have no tokens left, you’re out and safe. The last player holding tokens loses the game.</p>

<h2 id="example">Worked example</h2>
<p>Ana, Ben and Chloe are playing, and there are 9 tokens left in the pot. Ana rolls ${H.dice('641')}, rerolls the 6 and the 1, and gets ${H.dice('421')}. She stops after <b>two rolls</b>, so the others can only roll twice.</p>
<p>Ben ends on ${H.dice('555')} and Chloe on ${H.dice('221')}. Chloe has the lowest hand and loses the round; the best hand is Ana’s 421, worth ${V421.v421}, so Chloe takes ${V421.v421} tokens from the pot, leaving 1. She starts the next round.</p>

<h2 id="ties">Ties</h2>
<ul>
<li>Tied for last place: those players <b>roll off</b>, one roll each, and the lowest loses. Still tied? Roll again.</li>
<li>Tied for best hand during the discharge: a roll-off decides who gives the tokens.</li>
<li>A losing nénette always takes at least ${V421.nenette} tokens.</li>
<li>Near an empty pot the loser only takes what’s left, and in the discharge a winner only gives what they still have.</li>
</ul>

<h2 id="variants">Variants</h2>
<p>421 varies from one bar to the next, so agree before you start. On 421online, you can change the tokens, the number of rolls, the value of each hand, the tie rule, and the format: charge and discharge, <b>discharge only</b> (everyone starts with the same number of tokens), or <b>points</b> (a fixed number of rounds).</p>
${play421('Try a game', 'The game applies the rules and counts the tokens')}
`,
    faq: [
      ['How many dice do you use in 421?', 'Three, with up to three rolls per turn. The first player of each round sets how many rolls everyone else gets.'],
      ['What is the best hand in 421?', `4-2-1, worth ${V421.v421} tokens by default. Next come three 1s, worth ${V421.v111}.`],
      ['What is a nénette?', `The 2-2-1, the worst hand of all. A player who loses with it takes at least ${V421.nenette} tokens.`],
      ['Who loses at 421?', 'The last player still holding tokens at the end of the discharge. In French bars, that player traditionally buys the round.'],
      ['How many tokens do you start with?', `${V421.pot} tokens are placed in the pot; the charge spreads them among the players.`],
    ],
    related: ['play-421-dice-game-online', 'online-dice-game-with-friends', 'coups-fourres-rules'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...base421, slug: 'online-dice-game-with-friends', nav: 'With friends', short: 'Online dice games with friends',
    blurb: 'Open a private table, send a code or a link, and roll dice together from anywhere.',
    title: 'Online Dice Game With Friends: Private Table, No Download',
    description: 'Play dice online with friends: open a private table, share a link or code, and play 421 or Farkle together in the browser. Free, nothing to install.',
    h1: 'A dice game to play online with friends',
    lead: `Your friends are far away and nobody has dice to hand? On <a href="${P.l421}" data-play>421online.com</a> you can open a private table in a minute. Everyone joins from a phone or a computer, nothing to install, and the 3D dice roll for everyone at the same time.`,
    body: `
${play421('Create a table with friends', 'Free, no download')}
${H.toc('Contents', [['steps', 'Invite friends, step by step'], ['choose', 'Which game to play?'], ['install', 'Nothing to install'], ['ideas', 'Game-night ideas'], ['fair', 'Nobody can rig the dice']])}

<h2 id="steps">Invite friends, step by step</h2>
<ol class="steps">
<li><b>Open the game</b> and pick 421 or The Courtier (Farkle).</li>
<li><b>Create a private table</b>: it gets a 5-letter code.</li>
<li><b>Send the code</b> (or the link) to your group chat.</li>
<li><b>Start the game</b> when everyone’s seated. Someone missing? The host can add computer players.</li>
</ol>

<h2 id="choose">Which game to play?</h2>
<div class="table-wrap"><table>
<thead><tr><th>Game</th><th>Players</th><th>What it’s like</th></tr></thead>
<tbody>
<tr><td><a href="/play-421-dice-game-online">421</a></td><td>2 to 6</td><td>Three dice and tokens to pass around: fast, a bit cheeky, with your own house rules.</td></tr>
<tr><td><a href="/play-farkle-online">The Courtier (Farkle)</a></td><td>2 to 6</td><td>Six dice and one question: roll again or bank?</td></tr>
<tr><td><a href="/coups-fourres-card-dice-game">Coups Fourrés</a></td><td>2 to 4</td><td>421 with a deck of cards, traps and bluffing, for strategy lovers.</td></tr>
</tbody></table></div>

<h2 id="install">Nothing to install</h2>
<p>Everything runs in the browser, on Android, iPhone, iPad, Windows, Mac or Linux, and players at a table can mix devices. For a game without stakes, anyone can sit down just by choosing a name. A free account, with no email address, adds a friends list, messages and progress kept across devices.</p>

<h2 id="ideas">Game-night ideas</h2>
<ul>
<li>Start a video call and keep the game in another window: the dice in the game, the laughter on the call.</li>
<li>Pick the Blitz format in 421 for a quick game (11 tokens, 10 seconds per decision).</li>
<li>Can’t all be there at once? 421 friend challenges give both players exactly the same dice: each plays within 72 hours.</li>
<li>In 421 you can also play on one phone passed around the table, or use your real dice and let the app keep score.</li>
</ul>

<h2 id="fair">Nobody can rig the dice</h2>
<p>In online games the dice are drawn by the server, not by anyone’s phone, and everyone sees the same result.</p>
${play421('Invite my friends', 'One link is enough')}
`,
    faq: [
      ['How can I play dice with friends online?', 'Open a private table on 421online.com and send your friends the code or link. They join in their browser, with nothing to install.'],
      ['Can we play without an account?', 'Yes, for a game with no stakes: everyone just picks a name.'],
      ['How many players can join?', 'Up to 6 at a 421 or Farkle table, and up to 4 at Coups Fourrés.'],
    ],
    related: ['play-421-dice-game-online', 'play-farkle-online', 'coups-fourres-card-dice-game'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCF, slug: 'coups-fourres-card-dice-game', nav: 'Coups Fourrés', short: 'Coups Fourrés card and dice game', about: 'cf-en',
    blurb: 'A duel of dice and cards: a deck of 20, traps and bluffing. Free in the browser.',
    title: 'Coups Fourrés: a Free Dice and Card Duel Game in Your Browser',
    description: `Coups Fourrés mixes 421 dice with a collectible card game: ${CARDS.length} cards, traps and bluffing in a quick duel. Free in your browser, no download.`,
    h1: 'Coups Fourrés: 421 with cards',
    lead: `<b>Coups Fourrés</b> (French for “dirty tricks”) is 421 played as a duel, with a <b>${R.deckSize}-card deck</b> up your sleeve: reroll a die, set a trap, or turn things round at the last moment. A free strategy and bluffing game in your browser, with nothing to download.`,
    body: `
${playCF('Play for free', 'No download, no sign-up, a 3-minute guided game')}
${H.toc('Contents', [['idea', 'The idea'], ['round', 'A round'], ['types', 'Five kinds of card'], ['families', 'Four card families'], ['modes', 'Ways to play'], ['collect', 'Collection and decks']])}

<h2 id="idea">The idea</h2>
<ul>
<li>Each player starts with <b>${R.startTokens} tokens</b>. The first player with none left wins.</li>
<li>Each round you roll <b>three dice up to ${R.maxThrows} times</b>, with the same hands as <a href="/421-dice-game-rules">421</a>.</li>
<li>The best hand wins the round, and that player <b>gives the loser</b> as many tokens as the hand is worth.</li>
<li>Between rolls you play cards, paying with <b>Tournées</b> (“rounds”, the small change of each game): ${R.tourneesPerRound} a round, ${R.tourneesPerRound + R.tourneesLoserBonus} for whoever just lost.</li>
<li>You can see your opponent’s Tournées, hand size and trap count… but not which traps. That’s where the bluffing starts.</li>
</ul>

<h2 id="round">A round</h2>
<ol class="steps">
<li><b>Serve</b>: each player draws a card and gets their Tournées (${R.tourneesMax} in reserve at most).</li>
<li><b>The leader</b> (last round’s loser) rolls and plays cards. Their number of rolls is the other player’s limit.</li>
<li><b>The other player</b> plays their turn, knowing the hand to beat.</li>
<li><b>Last word</b>: both hands are on the table, and the losing player can still play a “last word” card.</li>
<li><b>Settling up</b>: the winner hands tokens to the loser, cards included.</li>
</ol>
<p>Every rule is on the <a href="/coups-fourres-rules">Coups Fourrés rules</a> page.</p>

<h2 id="types">Five kinds of card</h2>
<div class="table-wrap"><table>
<thead><tr><th>Kind</th><th>When you play it</th></tr></thead>
<tbody>
<tr><td><b>Strike</b></td><td>On your turn, before or after a roll, then discarded.</td></tr>
<tr><td><b>Trap</b></td><td>Placed face down on your turn; it goes off by itself when its condition arises.</td></tr>
<tr><td><b>Riposte</b></td><td>At any time, in answer to an opposing card.</td></tr>
<tr><td><b>Last word</b></td><td>Only in the “last word” step, just before the tokens are settled.</td></tr>
<tr><td><b>Regular</b></td><td>On your turn; a regular stays in front of you for ${R.habitueRounds} rounds (${R.maxHabitues} at most).</td></tr>
</tbody></table></div>

<h2 id="families">Four card families</h2>
<p>The ${CARDS.length} cards come in four families. <b>Regulars</b> bring allies and extra Tournées, <b>Drunken</b> cards make dice spin and bump your opponent’s, <b>Traps</b> are placed face down, and <b>Chains</b> combine draws, discounts and ever stronger answers. A deck holds ${DECK_RULES.maxFamilies} families at most, and your opponent’s families are visible from the start.</p>

<h2 id="modes">Ways to play</h2>
<div class="cards">
<section class="card"><h3>Guided game</h3><p>Three minutes against the computer, one step at a time.</p></section>
<section class="card"><h3>Against the computer</h3><p>Three opponents of rising difficulty, even with no account.</p></section>
<section class="card"><h3>With friends</h3><p>A coded table for 2 to 4 players (free account).</p></section>
<section class="card"><h3>Ranked and tournament</h3><p>Ranked duels in a monthly league, and a free knockout tournament every Saturday evening at 20:40 (Brussels time).</p></section>
</div>

<h2 id="collect">Collection and decks</h2>
<p>Coups Fourrés is also a small collectible card game: boosters hold random cards and are opened with <b>capsules</b> earned by playing. <b>They can’t be bought</b>, and there’s nothing to pay for. Build up to 5 decks, or let the game build one from your collection.</p>
${playCF('Play Coups Fourrés for free', 'In your browser, with a 3-minute guided game')}
`,
    faq: [
      ['Is Coups Fourrés free?', 'Yes. Capsules are earned by playing and can’t be bought, and there are no ads or subscriptions.'],
      ['Do I need to know 421?', 'No. The guided game explains the dice and the cards in three minutes.'],
      ['How many players?', 'A duel against the computer, in ranked or in a tournament; 2 to 4 at a table with friends.'],
      ['How long does a game take?', `A duel lasts a few minutes. It can never go beyond ${R.maxRounds} rounds.`],
    ],
    related: ['coups-fourres-rules', 'play-421-dice-game-online', 'online-dice-game-with-friends'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCF, slug: 'coups-fourres-rules', nav: 'Coups Fourrés rules', short: 'Coups Fourrés rules', parent: 'coups-fourres-card-dice-game', about: 'cf-en',
    blurb: 'Setup, rounds, Tournées, the kinds of card, traps and games for 3 or 4.',
    title: 'Coups Fourrés Rules: Rounds, Cards, Traps and Tokens',
    description: 'The complete rules of Coups Fourrés: setup, a round step by step, hands, Tournées, the five kinds of card, traps, games for 3 or 4 players and glossary.',
    h1: 'The rules of Coups Fourrés',
    lead: `Coups Fourrés takes the dice and the hands of 421 and adds a ${R.deckSize}-card deck per player. The game applies every rule for you: read on for the details.`,
    body: `
${H.toc('Contents', [['goal', 'The goal'], ['setup', 'Setup'], ['round', 'A round'], ['hands', 'The hands'], ['tournees', 'Tournées'], ['cards', 'Traps, regulars and ripostes'], ['end', 'End of the game'], ['multi', 'With 3 or 4 players'], ['deck', 'Building a deck']])}

<h2 id="goal">The goal</h2>
<p>You play 421 in discharge only: everyone starts with <b>${R.startTokens} tokens</b> (${R.startTokensMulti} with 3 or 4 players). The first player with no tokens left wins the game.</p>

<h2 id="setup">Setup</h2>
<p>Each player shuffles a ${R.deckSize}-card deck and draws ${R.startHand}. You can send up to ${R.mulligan} cards back under the deck and redraw as many, once. The first leader is drawn at random.</p>

<h2 id="round">A round</h2>
<ol class="steps">
<li><b>Serve</b>: draw 1 card and receive ${R.tourneesPerRound} Tournée (${R.tourneesPerRound + R.tourneesLoserBonus} for the loser of the previous round). You can save up to ${R.tourneesMax}.</li>
<li><b>Bar order</b>: a random bonus rule applies to everyone for the round.</li>
<li><b>Leader’s turn</b>: roll up to ${R.maxThrows} times, keep dice between rolls, and stop whenever you like. Cards can be played before or after each roll. The number of rolls sets the other player’s limit.</li>
<li><b>The other player’s turn</b>, within that limit, seeing the leader’s result.</li>
<li><b>Last word</b>: the player losing at that moment may play a “last word” card, the other may answer, and so on until both pass.</li>
<li><b>Settling up</b>: the winner gives the loser as many tokens as the hand is worth, cards included. On a perfect tie, nobody gives anything.</li>
<li>The loser leads the next round.</li>
</ol>

<h2 id="hands">The hands</h2>
<p>The same as 421, from best to worst:</p>
${combosTable(L421, H.dice)}

<h2 id="tournees">Tournées</h2>
<p>Tournées pay for cards: the number in the small glass on each card is its cost. You receive them with each serve, and the amount each player holds is <b>visible to all</b>. An opponent with none can hardly play anything; one with four or more may be planning something big.</p>

<h2 id="cards">Traps, regulars and ripostes</h2>
<ul>
<li><b>Traps</b>: ${R.maxTrapsOn} at most in front of any player, ${R.maxTraps} placed at most per player. You see how many are down, never which. A trap that hasn’t gone off in ${R.trapReturnRounds} rounds returns to its owner’s hand.</li>
<li><b>Regulars</b>: ${R.maxHabitues} in play at most, each for ${R.habitueRounds} rounds unless chased away.</li>
<li><b>Ripostes</b>: when several cards answer each other, the last one played applies first.</li>
</ul>

<h2 id="end">End of the game</h2>
<ul>
<li>As soon as a player has no tokens left, they win.</li>
<li>If a game drags on, the bar closes after round <b>${R.maxRounds}</b>: the player with the fewest tokens wins.</li>
<li>Empty deck: reshuffle your discard pile and take ${R.reshufflePenalty} token.</li>
<li>You have ${R.decisionSeconds} seconds per decision, plus a ${R.reserveSeconds}-second reserve for the whole game. In ranked, leaving counts as a defeat; after a disconnection you have 60 seconds to return.</li>
</ul>

<h2 id="multi">With 3 or 4 players</h2>
<p>At a coded table with friends: ${R.startTokensMulti} tokens each. The first player at 0 wins and the game stops. <b>Only the worst hand of the round receives tokens</b>, from the best hand, as in 421. Traps are placed in front of a chosen player, for all to see.</p>

<h2 id="deck">Building a deck</h2>
<p>A deck holds exactly <b>${R.deckSize} cards</b>: ${R.maxCopies} copies at most of a card, <b>${DECK_RULES.maxFamilies} families at most</b>, and <b>one legendary card</b>. You can save up to 5 decks.</p>
${playCF('Try Coups Fourrés', 'The guided game walks you through these rules')}
`,
    faq: [
      ['How many tokens do you start with in Coups Fourrés?', `${R.startTokens} each in a duel, ${R.startTokensMulti} each with 3 or 4 players. The first to have none left wins.`],
      ['How many cards are in a deck?', `Exactly ${R.deckSize}, with ${R.maxCopies} copies at most per card, ${DECK_RULES.maxFamilies} families at most and one legendary card.`],
      ['Can you see your opponent’s traps?', 'You can see how many are down, but not which ones.'],
      ['What happens on a tie?', 'On a perfect tie between the two hands, nobody gives any tokens.'],
    ],
    related: ['coups-fourres-card-dice-game', '421-dice-game-rules', 'play-421-dice-game-online'],
  },
];
