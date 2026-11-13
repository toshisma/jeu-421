/**
 * Pages d'aide en allemand, écrites pour les recherches germanophones (Würfelspiel, Zehntausend, Farkle ; Schocken
 * sert de comparaison pour le 421). Valeurs : mêmes sources que les pages françaises. Voir la note gelée en tête de
 * seo-i18n-common.mjs : publiées uniquement avec le jeu entièrement traduit.
 */
import { CT_OG } from './seo-courtisan-pages.mjs';
import { CARDS, CF_RULES as R, DECK_RULES, DISCLAIMERS, DM_TARGETS, UPDATED, V421, combosTable, helpers, kindValue, kindsTable, oddsTable, playLinks, scoringTable } from './seo-i18n-common.mjs';

const H = helpers('de');
const P = playLinks('de');
const nb = H.nb;
const base421 = { lang: 'de', published: UPDATED, updated: UPDATED, play: P.l421 };
const baseCT = { lang: 'de', published: UPDATED, updated: UPDATED, play: P.courtisan, og: CT_OG, about: 'farkle-de' };
const baseCF = { lang: 'de', published: UPDATED, updated: UPDATED, play: P.cartes, og: '/og-coups-fourres.jpg', about: 'cf-de' };
const play421 = (a, b) => H.play(P.l421, a, b);
const playCT = (a, b) => H.play(P.courtisan, a, b);
const playCF = (a, b) => H.play(P.cartes, a, b);
const indep = `<p class="disclaimer" role="note"><b>${DISCLAIMERS.de}</b> Diese Seite beschreibt das traditionelle Würfelspiel, das das Videospiel inspiriert hat; sie enthält weder Bilder noch Texte aus dem Videospiel.</p>`;
const targets = DM_TARGETS.map(nb);
const targetsText = `${targets[0]}, ${targets[1]} oder ${targets[2]}`;
const L421 = { head: ['Kombination', 'Beispiel', 'Wert'], tokens: (n) => `${n} ${n > 1 ? 'Jetons' : 'Jeton'}`, r421: '4-2-1', r111: 'Drei Einsen', rx: 'Zwei Einsen + x, danach Dreierpasch x', rxv: 'x Jetons (6 bis 2)', rs: 'Straße', ro: 'Alle anderen', rn: 'Nénette (die schlechteste)', rnv: `der Verlierer nimmt mindestens ${V421.nenette} Jetons` };
const SC = { h: ['Kombination', 'Punkte'], one: 'Eine einzelne 1', five: 'Eine einzelne 5', t1: 'Drei Einsen', tx: 'Dreierpasch aus 2, 3, 4, 5 oder 6', txv: 'Augenzahl × 100 (drei 4er = 400)', more: 'Vierer-, Fünfer- oder Sechserpasch', morev: 'verdoppelt sich mit jedem weiteren Würfel (vier 2er = 400)', s15: 'Straße 1–5', s26: 'Straße 2–6', s16: 'Große Straße 1–6' };
const KT = { face: 'Augenzahl', three: 'Drei', four: 'Vier', five: 'Fünf', six: 'Sechs', of: (f) => `${f}er` };

export const dePages = [
  // ---------------------------------------------------------------------------------------------
  {
    ...base421, slug: '421-wuerfelspiel-online', nav: '421 spielen', short: '421 online spielen',
    blurb: 'Das französische Kneipen-Würfelspiel, kostenlos im Browser: allein oder mit Freunden.',
    title: '421 online spielen: das französische Würfelspiel, kostenlos',
    description: '421, das klassische französische Kneipen-Würfelspiel, kostenlos online spielen: 3 Würfel, Jetons, 2 bis 6 Spieler oder gegen den Computer. Ohne Download.',
    h1: '421 online spielen: das Würfelspiel aus Frankreich',
    lead: `<b>421</b> (auf Deutsch „Vier-Zwei-Eins“) ist in Frankreich und Belgien das, was Schocken in deutschen Kneipen ist: drei Würfel, ein Haufen Jetons, und wer am Ende noch welche hat, zahlt traditionell die nächste Runde. Außerhalb Frankreichs kennt es kaum jemand, und auf <a href="${P.l421}" data-play>421online.com</a> kannst du es kostenlos im Browser spielen, gegen den Computer oder mit Freunden.`,
    body: `
${play421('421 jetzt spielen', 'Kostenlos, ohne Download, auf Handy und PC')}
${H.toc('Inhalt', [['was', 'Was ist 421?'], ['ablauf', 'So läuft ein Spiel'], ['arten', 'Spielarten'], ['konto', 'Mit oder ohne Konto'], ['fair', 'Faire Würfel']])}

<h2 id="was">Was ist 421?</h2>
<p>421 ist nach seinem besten Wurf benannt, ${H.dice('421')}. Wie beim Schocken würfelt jeder mit drei Würfeln, bis zu dreimal, und der schlechteste Wurf der Runde kassiert. Der Unterschied liegt in den Kombinationen und ihrem Wert: Beim 421 entscheidet der beste Wurf, wie viele Jetons die Hand wechseln. Eine Partie dauert wenige Minuten, und alle spielen in jeder Runde mit.</p>

<h2 id="ablauf">So läuft ein Spiel</h2>
<ol class="steps">
<li>Pro Runde würfelst du bis zu ${V421.throws}-mal mit drei Würfeln und behältst die, die dir passen. Der erste Spieler der Runde gibt die Zahl der Würfe für alle vor.</li>
<li>Der schlechteste Wurf verliert die Runde, der beste legt fest, wie viele Jetons fällig werden.</li>
<li>Erst wird <b>aufgeladen</b>: Der Verlierer nimmt Jetons aus einem Topf mit ${V421.pot} Jetons. Dann wird <b>abladen</b>: Die Jetons wandern zum Verlierer. Wer keine mehr hat, ist raus und sicher. Wer am Ende noch welche hat, verliert.</li>
</ol>
<p>Alle Regeln mit Beispiel stehen auf der Seite <a href="/421-wuerfelspiel-regeln">421 Regeln</a>. Das Spiel zählt die Jetons für dich, und eine geführte Partie erklärt alles beim Spielen.</p>

<h2 id="arten">Spielarten</h2>
<div class="cards">
<section class="card"><h3>Gegen den Computer</h3><p>1 bis 5 Gegner in drei Stufen, von leicht bis schwer.</p></section>
<section class="card"><h3>Schnelles Spiel</h3><p>Mit einem Tipp an einen offenen Tisch, 2 bis 6 Spieler; der Gastgeber kann mit Computerspielern auffüllen.</p></section>
<section class="card"><h3>Privater Tisch</h3><p>Tisch erstellen, Link oder 5-stelligen Code teilen. <a href="/online-wuerfelspiel-mit-freunden">Mit Freunden spielen</a>.</p></section>
<section class="card"><h3>Turniere</h3><p>Täglich um 11 und 21 Uhr (Brüsseler Zeit), 4 bis 16 Spieler, mit Konto. Eigene Turniere kannst du auch anlegen.</p></section>
<section class="card"><h3>Tagesherausforderung</h3><p>Für alle dieselben Würfel, fünf Würfe, ein Versuch, eine tägliche Rangliste.</p></section>
<section class="card"><h3>Hausregeln</h3><p>Jetons, Würfe, Werte und Gleichstand vor dem Spiel einstellen. Fertige Formate: Klassisch, Blitz und Sudden Death.</p></section>
<section class="card"><h3>Coups Fourrés</h3><p>421 mit Kartendeck, Fallen und Bluff. <a href="/coups-fourres-karten-wuerfelspiel">Mehr dazu</a>.</p></section>
<section class="card"><h3>Der Höfling</h3><p>Sechs Würfel, Risiko und Zehntausend-Feeling. <a href="/farkle-online-spielen">Farkle spielen</a>.</p></section>
</div>

<h2 id="konto">Mit oder ohne Konto</h2>
<p>Du brauchst kein Konto: Namen wählen und losspielen. Ein kostenloses Konto (Benutzername und Passwort, <b>keine E-Mail-Adresse</b>) bringt Freunde, Nachrichten, die täglichen Turniere und gespeicherten Fortschritt auf allen Geräten. Spielmünzen verdienst du nur beim Spielen, für Aussehen und Turniere: <b>Sie lassen sich nicht kaufen</b>, und es gibt nichts zu kaufen.</p>

<h2 id="fair">Faire Würfel</h2>
<p>Online zieht der Server jeden Würfel mit einer kryptografischen Zufallsquelle: Kein Spieler kann das Ergebnis beeinflussen. Die 3D-Schale spielt diesen Wurf nur ab, damit alle dieselben Würfel rollen sehen.</p>
${play421('421 jetzt spielen', 'Dein erstes Spiel ist geführt')}
`,
    faq: [
      ['Was ist das Würfelspiel 421?', 'Ein traditionelles französisches Kneipenspiel mit drei Würfeln und Jetons. Der beste Wurf ist 4-2-1, der schlechteste Wurf verliert jede Runde, und wer zuletzt noch Jetons hat, verliert das Spiel.'],
      ['Ist 421online kostenlos?', 'Ja, ohne Werbung, ohne Abo und ohne Käufe. Es läuft im Browser.'],
      ['Wie viele können mitspielen?', '2 bis 6 Spieler an einem Online-Tisch oder 1 bis 5 Computergegner.'],
      ['Ist 421 wie Schocken?', 'Es ist verwandt: drei Würfel, bis zu drei Würfe, der schlechteste Wurf verliert. Kombinationen und Werte unterscheiden sich aber.'],
      ['Brauche ich ein Konto?', 'Nein. Ein kostenloses Konto ohne E-Mail-Adresse bringt nur Freunde, tägliche Turniere und gespeicherten Fortschritt.'],
    ],
    related: ['421-wuerfelspiel-regeln', 'online-wuerfelspiel-mit-freunden', 'coups-fourres-karten-wuerfelspiel'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...base421, slug: '421-wuerfelspiel-regeln', nav: '421 Regeln', short: '421 Regeln', parent: '421-wuerfelspiel-online',
    blurb: 'Würfe, Kombinationen, Aufladen und Abladen, Gleichstand: die Regeln mit Beispiel.',
    title: '421 Würfelspiel Regeln: Kombinationen, Jetons und Ablauf',
    description: 'So spielt man das französische Würfelspiel 421: drei Würfel, Rangfolge der Kombinationen, Wert der Jetons, Aufladen und Abladen, Gleichstand und Hausregeln.',
    h1: '421 Regeln: so spielt man das Würfelspiel',
    lead: `421 wird mit drei Würfeln und einem Topf Jetons gespielt. Ziel ist es, <b>alle Jetons loszuwerden</b>; wer am Ende noch welche hat, verliert. Das hier sind die Standardregeln auf 421online, danach die gängigen Varianten.`,
    body: `
${H.toc('Inhalt', [['material', 'Material'], ['runde', 'Eine Runde'], ['kombis', 'Die Kombinationen'], ['aufladen', 'Aufladen'], ['abladen', 'Abladen'], ['beispiel', 'Beispiel'], ['gleich', 'Gleichstand'], ['varianten', 'Varianten']])}

<h2 id="material">Material</h2>
<p>Du brauchst drei sechsseitige Würfel und ${V421.pot} Jetons (Streichhölzer oder Münzen gehen auch) in der Tischmitte, ab 2 Spielern; am schönsten sind 3 bis 6.</p>

<h2 id="runde">Eine Runde</h2>
<p>Jeder würfelt in seinem Zug mit den drei Würfeln. Du kannst aufhören oder <b>die Würfel behalten, die dir passen, und den Rest neu werfen</b>, bis zu ${V421.throws} Würfe insgesamt. Ein behaltener Würfel darf beim nächsten Wurf wieder mitgeworfen werden.</p>
<p>Der <b>erste Spieler der Runde</b> gibt die Grenze vor: Hört er nach einem Wurf auf, haben alle nur einen; nimmt er zwei, hat niemand mehr als zwei.</p>
<p>Wenn alle dran waren, <b>verliert die schlechteste Kombination die Runde</b>, und die <b>beste</b> bestimmt, wie viele Jetons fällig sind. Der Verlierer beginnt die nächste Runde.</p>

<h2 id="kombis">Die Kombinationen</h2>
<p>Von der besten zur schlechtesten:</p>
${combosTable(L421, H.dice)}
<p>Bei zwei „anderen“ Kombinationen ordnest du die Würfel von hoch nach niedrig und vergleichst der Reihe nach: 6-5-2 schlägt 6-4-3. Zwei Einsen schlagen einen gleich hohen Dreierpasch: 6-1-1 schlägt 6-6-6, das schlägt 5-1-1. Die 2-2-1, in Frankreich <b>Nénette</b> genannt, ist die schlechteste Kombination.</p>

<h2 id="aufladen">Aufladen</h2>
<p>Am Anfang liegen alle ${V421.pot} Jetons im Topf. In jeder Runde <b>nimmt der Verlierer so viele Jetons aus dem Topf, wie die beste Kombination wert ist</b>. Beim Aufladen gilt hier standardmäßig ein einziger Wurf, damit es schnell geht. Ist der Topf leer, ist die Aufladephase vorbei, und wer <b>keine Jetons</b> hat, hat schon gewonnen und scheidet aus.</p>

<h2 id="abladen">Abladen</h2>
<p>Wer Jetons hat, spielt weiter, jetzt mit drei Würfen. <b>Der Spieler mit der besten Kombination gibt dem Verlierer</b> so viele Jetons, wie seine Kombination wert ist. Wer keine Jetons mehr hat, ist raus und sicher. Wer zuletzt noch welche hat, verliert das Spiel.</p>

<h2 id="beispiel">Beispiel</h2>
<p>Anna, Ben und Clara spielen, im Topf liegen noch 9 Jetons. Anna wirft ${H.dice('641')}, wirft die 6 und die 1 neu und hat ${H.dice('421')}. Sie stoppt nach <b>zwei Würfen</b>, also dürfen die anderen nur zweimal.</p>
<p>Ben kommt auf ${H.dice('555')}, Clara auf ${H.dice('221')}. Clara hat die schlechteste Kombination und verliert; die beste ist Annas 421 mit ${V421.v421} Jetons. Clara nimmt ${V421.v421} Jetons aus dem Topf, einer bleibt übrig, und sie beginnt die nächste Runde.</p>

<h2 id="gleich">Gleichstand</h2>
<ul>
<li>Gleichstand um den letzten Platz: Die Betroffenen <b>stechen</b>, ein Wurf pro Person, der schlechteste verliert. Immer noch gleich? Neu werfen.</li>
<li>Gleichstand um die beste Kombination beim Abladen: Ein Stechen entscheidet, wer die Jetons gibt.</li>
<li>Wer mit einer Nénette verliert, nimmt mindestens ${V421.nenette} Jetons.</li>
<li>Ist der Topf fast leer, nimmt der Verlierer nur den Rest; beim Abladen gibt man höchstens, was man noch hat.</li>
</ul>

<h2 id="varianten">Varianten</h2>
<p>421 ändert sich von Kneipe zu Kneipe, also vorher klären. Auf 421online stellst du Jetons, Würfe, den Wert jeder Kombination, die Gleichstandsregel und das Format ein: Aufladen und Abladen, <b>nur Abladen</b> (alle starten mit gleich vielen Jetons) oder <b>nach Punkten</b> (feste Rundenzahl).</p>
${play421('Eine Partie versuchen', 'Das Spiel wendet die Regeln an und zählt die Jetons')}
`,
    faq: [
      ['Mit wie vielen Würfeln spielt man 421?', 'Mit drei, bis zu drei Würfe pro Zug. Der erste Spieler jeder Runde gibt die Zahl der Würfe vor.'],
      ['Was ist die beste Kombination?', `4-2-1, standardmäßig ${V421.v421} Jetons wert. Danach kommen drei Einsen mit ${V421.v111} Jetons.`],
      ['Was ist eine Nénette?', `Die 2-2-1, die schlechteste Kombination. Wer damit verliert, nimmt mindestens ${V421.nenette} Jetons.`],
      ['Wer verliert beim 421?', 'Wer am Ende des Entladens als Letzter noch Jetons hat. In französischen Kneipen zahlt er traditionell die Runde.'],
      ['Wie viele Jetons gibt es?', `${V421.pot} Jetons liegen im Topf; das Aufladen verteilt sie auf die Spieler.`],
    ],
    related: ['421-wuerfelspiel-online', '421-wuerfelspiel-statistik', 'online-wuerfelspiel-mit-freunden', 'coups-fourres-regeln'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...base421, updated: '2026-11-11', slug: 'online-wuerfelspiel-mit-freunden', nav: 'Mit Freunden', short: 'Online-Würfelspiel mit Freunden',
    blurb: 'Privaten Tisch öffnen, Code oder Link schicken und gemeinsam würfeln, egal wo.',
    title: 'Online-Würfelspiel mit Freunden: privater Tisch, ohne Download',
    description: 'Online würfeln mit Freunden: privaten Tisch eröffnen, Link oder Code teilen und 421 oder Farkle zusammen im Browser spielen. Kostenlos, ohne Installation.',
    h1: 'Online-Würfelspiel mit Freunden',
    lead: `Deine Freunde sind weit weg und niemand hat Würfel zur Hand? Auf <a href="${P.l421}" data-play>421online.com</a> ist ein privater Tisch in einer Minute eröffnet. Jeder steigt vom Handy oder PC aus ein, ohne Installation, und die 3D-Würfel rollen für alle gleichzeitig.`,
    body: `
${H.play(P.amis, 'Tisch für Freunde eröffnen', 'Kostenlos, ohne Download')}
${H.toc('Inhalt', [['schritte', 'Freunde einladen in vier Schritten'], ['welches', 'Welches Spiel nehmen?'], ['ohne', 'Nichts zu installieren'], ['ideen', 'Ideen für den Spieleabend'], ['fair', 'Keiner kann die Würfel manipulieren']])}

<h2 id="schritte">Freunde einladen in vier Schritten</h2>
<ol class="steps">
<li><b>Öffne das Spiel</b> und wähle 421, Der Höfling (Farkle) oder Poker menteur (Lügenpoker).</li>
<li><b>Eröffne einen privaten Tisch</b>: Er bekommt einen Code aus 5 Zeichen.</li>
<li><b>Schick den Code</b> (oder den Link) in die Gruppe.</li>
<li><b>Starte das Spiel</b>, wenn alle sitzen. Fehlt jemand, kann der Gastgeber Computerspieler dazunehmen.</li>
</ol>

<h2 id="welches">Welches Spiel nehmen?</h2>
<div class="table-wrap"><table>
<thead><tr><th>Spiel</th><th>Spieler</th><th>Stimmung</th></tr></thead>
<tbody>
<tr><td><a href="/421-wuerfelspiel-online">421</a></td><td>2 bis 6</td><td>Drei Würfel und Jetons zum Weiterreichen: schnell, frech, mit eigenen Hausregeln.</td></tr>
<tr><td><a href="/farkle-online-spielen">Der Höfling (Farkle)</a></td><td>2 bis 6</td><td>Sechs Würfel und eine Frage: weiterwürfeln oder sichern?</td></tr>
<tr><td><a href="/coups-fourres-karten-wuerfelspiel">Coups Fourrés</a></td><td>2 bis 4</td><td>421 mit Kartendeck, Fallen und Bluff, für Strategen.</td></tr>
<tr><td><a href="/luegenpoker-wuerfel-online">Poker menteur (Lügenpoker)</a></td><td>2 bis 6</td><td>Fünf Pokerwürfel unter einem Becher, der herumgeht: ansagen, bluffen oder „Lügner!“ rufen.</td></tr>
</tbody></table></div>

<h2 id="ohne">Nichts zu installieren</h2>
<p>Alles läuft im Browser, auf Android, iPhone, iPad, Windows, Mac oder Linux, und alle am Tisch dürfen verschiedene Geräte nutzen. Bei Spielen ohne Einsatz reicht ein Name. Ein kostenloses Konto ohne E-Mail-Adresse bringt eine Freundesliste, Nachrichten und Fortschritt auf allen Geräten.</p>

<h2 id="ideen">Ideen für den Spieleabend</h2>
<ul>
<li>Videocall starten und das Spiel daneben offen lassen: die Würfel im Spiel, das Lachen im Call.</li>
<li>Beim 421 das Format Blitz wählen (11 Jetons, 10 Sekunden pro Entscheidung) für eine kurze Partie.</li>
<li>Nicht alle haben gleichzeitig Zeit? Bei Freundes-Herausforderungen im 421 bekommen beide genau dieselben Würfel, jeder spielt innerhalb von 72 Stunden.</li>
<li>Beim 421 geht auch ein einziges Handy, das herumgereicht wird, oder eure echten Würfel, die App zählt mit.</li>
</ul>

<h2 id="fair">Keiner kann die Würfel manipulieren</h2>
<p>Online werden die Würfel vom Server gezogen, nicht vom Handy eines Spielers, und alle sehen dasselbe Ergebnis.</p>
${H.play(P.amis, 'Freunde einladen', 'Ein Link reicht')}
`,
    faq: [
      ['Wie kann ich online mit Freunden würfeln?', 'Eröffne auf 421online.com einen privaten Tisch und schick deinen Freunden Code oder Link. Sie steigen im Browser ein, ohne Installation.'],
      ['Geht das ohne Konto?', 'Ja, bei Spielen ohne Einsatz: Jeder wählt einfach einen Namen.'],
      ['Wie viele können mitspielen?', 'Bis zu 6 an einem Tisch mit 421, Farkle oder Lügenpoker, bis zu 4 bei Coups Fourrés.'],
    ],
    related: ['421-wuerfelspiel-online', 'farkle-online-spielen', 'luegenpoker-wuerfel-online'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCT, slug: 'farkle-online-spielen', nav: 'Farkle spielen', short: 'Farkle online spielen',
    blurb: 'Farkle (Zehntausend) kostenlos im Browser: gegen den Computer oder mit Freunden.',
    title: 'Farkle online spielen: Zehntausend gratis mit Freunden',
    description: 'Farkle online spielen, auch bekannt als Zehntausend oder 10000: kostenlos, 2 bis 6 Spieler per Code oder gegen den Computer. Ohne Download, im Browser.',
    h1: 'Farkle online spielen, kostenlos, mit Freunden',
    lead: `<b>Der Höfling</b> ist unsere Version von <b>Farkle</b>, dem klassischen Würfelspiel mit sechs Würfeln, in Deutschland auch als <b>Zehntausend</b>, 10000 oder Macke bekannt. Tisch öffnen, Code an die Freunde schicken und zusammen im Browser spielen. Kostenlos, ohne Download und ohne Konto.`,
    body: `
${playCT('Farkle jetzt spielen', 'Kostenlos, ohne Download, auf Handy und PC')}
${H.toc('Inhalt', [['freunde', 'Mit Freunden spielen'], ['arten', 'Spielarten'], ['regeln', 'Unsere Regeln'], ['groschen', 'Gratis oder um Groschen'], ['kcd', 'Von Kingdom Come hierher?']])}

<h2 id="freunde">Mit Freunden spielen</h2>
<ol class="steps">
<li><b>Öffne <a href="${P.courtisan}" data-play>Der Höfling</a></b> und wähle <b>Tisch eröffnen</b>.</li>
<li><b>Teile den Code aus 5 Zeichen oder den Link</b>. Deine Freunde steigen mit jedem Browser ein.</li>
<li><b>Starte das Spiel</b>, wenn alle bereit sind: 2 bis 6 Spieler, leere Plätze kann der Gastgeber mit Computern füllen.</li>
</ol>
<p>Jeden Wurf zieht der Server, und alle sehen dieselben Würfel in der 3D-Schale rollen.</p>

<h2 id="arten">Spielarten</h2>
<div class="cards">
<section class="card"><h3>Online mit Freunden</h3><p>Ein privater Tisch mit Code oder Link, für <b>2 bis 6 Spieler</b>, mit Chat und Reaktionen.</p></section>
<section class="card"><h3>Gegen den Computer</h3><p><b>1 bis 3 Gegner</b> in drei Stufen, vom Anfänger bis zum Rechner, der die Chancen kalkuliert.</p></section>
<section class="card"><h3>Schnelles Spiel</h3><p>Mit einem Tipp an einen offenen Tisch.</p></section>
<section class="card"><h3>Dein Ziel</h3><p>Spiele bis <b>${targetsText}</b> Punkte. Eine Partie zu zweit dauert bis ${targets[0]} etwa 3 Züge pro Person, bis ${targets[1]} etwa 6 bis 7 und bis ${targets[2]} etwa 17 bis 18.</p></section>
</div>
<p class="note">Die Dauer stammt aus tausenden simulierten Partien zweier Computer auf mittlerer Stufe, mit der Spiel-Engine berechnet.</p>

<h2 id="regeln">Unsere Regeln</h2>
<p>Wirf sechs Würfel, leg mindestens einen punktenden Würfel beiseite, dann <b>würfle weiter</b> oder <b>sichere</b> deine Punkte. Ein Wurf ohne punktende Würfel ist ein <b>Farkle</b>: Die Punkte des Zugs sind weg. Liegen alle sechs Würfel beiseite, hast du <b>Hot Dice</b>: Du darfst alle sechs noch einmal werfen. Wer beim Sichern das Ziel erreicht, <b>gewinnt sofort</b>, ohne letzte Runde. Die volle Wertung steht bei den <a href="/zehntausend-wuerfelspiel-regeln">Zehntausend-Regeln</a>.</p>

<h2 id="groschen">Gratis oder um Groschen</h2>
<p>Jede Partie geht auch gratis. Der Höfling hat eine eigene Spielwährung, die <b>Groschen</b>: Mit einem kostenlosen Konto bekommst du täglich 20 und kannst sie setzen, der Gewinner bekommt den Pott. Groschen sind <b>reines Spielgeld</b>: nicht zu kaufen und nicht auszahlbar. Ein Konto braucht nur Benutzername und Passwort, <b>keine E-Mail-Adresse</b>.</p>

<h2 id="kcd">Von Kingdom Come hierher?</h2>
<p>Falls du das Spiel aus den Tavernen von <i>Kingdom Come: Deliverance 2</i> kennst: Dahinter steckt dasselbe alte Würfelspiel. <a href="/kingdom-come-deliverance-2-wuerfelspiel">Was gleich ist und was nicht</a>.</p>
${indep}
${playCT('Würfel werfen', 'Gegen den Computer oder mit Freunden')}
`,
    faq: [
      ['Ist dieses Farkle kostenlos?', 'Ja. Kein Abo, keine Werbung, nichts zu kaufen. Es läuft im Browser auf Handy und PC.'],
      ['Ist Farkle dasselbe wie Zehntausend?', 'Ja, im Kern. Farkle, Zehntausend, 10000 und Macke sind Namen für dasselbe Risiko-Würfelspiel, mit Hausregeln, die sich unterscheiden.'],
      ['Brauchen meine Freunde ein Konto?', 'Nein. Sie öffnen den Link oder geben den Code ein, wählen einen Namen und spielen.'],
      ['Wie viele können mitspielen?', '2 bis 6 Spieler an einem Online-Tisch oder 1 bis 3 Computer im Einzelspiel.'],
      ['Geht es um echtes Geld?', 'Nein. Groschen sind reine Spielwährung, ohne Kauf und ohne Auszahlung.'],
    ],
    related: ['zehntausend-wuerfelspiel-regeln', 'kingdom-come-deliverance-2-wuerfelspiel', 'online-wuerfelspiel-mit-freunden'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCT, slug: 'zehntausend-wuerfelspiel-regeln', nav: 'Zehntausend-Regeln', short: 'Regeln Farkle / Zehntausend', parent: 'farkle-online-spielen',
    blurb: 'Punktewertung, Farkle, Hot Dice, Spielende, mit durchgerechneten Würfen.',
    title: 'Zehntausend Würfelspiel Regeln: Punkte und Kombinationen',
    description: 'Zehntausend (Farkle) mit sechs Würfeln: Punkte für 1er, 5er, Pasch und Straßen, Farkle, Hot Dice und Spielende. Die Regeln mit durchgerechneten Beispielen.',
    h1: 'Zehntausend-Regeln: Punkte, Pasch und Straßen',
    lead: `Zehntausend, international als Farkle bekannt, spielst du mit sechs Würfeln und mindestens zu zweit. Ziel: <b>als Erster die vereinbarte Punktzahl erreichen</b>. Hier stehen die Regeln, wie Der Höfling auf 421online sie anwendet, inklusive der echten Hausregel-Unterschiede.`,
    body: `
${H.toc('Inhalt', [['zug', 'Ein Zug'], ['punkte', 'Die Punkte'], ['pasch', 'Drei bis sechs Gleiche'], ['beispiele', 'Beispielwürfe'], ['farkle', 'Farkle'], ['hot', 'Hot Dice'], ['ende', 'Spielende'], ['chance', 'Chance auf einen Farkle'], ['varianten', 'Hausregeln']])}

<h2 id="zug">Ein Zug</h2>
<ol class="steps">
<li>Wirf <b>alle sechs Würfel</b>.</li>
<li>Lege <b>mindestens einen punktenden Würfel</b> beiseite. Es dürfen mehrere sein, aber <b>jeder beiseitegelegte Würfel muss punkten</b>: eine 1, eine 5 oder Teil einer Kombination aus diesem Wurf.</li>
<li>Entscheide dich: mit den übrigen Würfeln <b>weiterwürfeln</b> oder <b>sichern</b>. Sichern schreibt dir alle Punkte des Zugs gut und beendet ihn.</li>
<li>Würfelst du weiter, geht es bei Schritt 2 mit weniger Würfeln weiter, bis du sicherst oder ein Farkle kommt.</li>
</ol>

<h2 id="punkte">Die Punkte</h2>
${scoringTable(SC, H.dice, nb)}
<p>2er, 3er, 4er und 6er bringen einzeln nichts: Sie zählen nur im Dreierpasch oder mehr oder in einer Straße.</p>

<h2 id="pasch">Drei bis sechs Gleiche</h2>
<p>Ein Dreierpasch ist die Augenzahl × 100 wert, drei Einsen ${nb(kindValue(1, 3))}. <b>Jeder weitere gleiche Würfel verdoppelt den Wert</b>:</p>
${kindsTable(KT, H.dice, nb)}
<p>Der größte Wurf ist ${H.dice('111111')}: sechs Einsen, ${nb(kindValue(1, 6))} Punkte auf einmal.</p>

<h2 id="beispiele">Beispielwürfe</h2>
<div class="table-wrap"><table>
<thead><tr><th>Wurf und was punktet</th><th>Punkte</th></tr></thead>
<tbody>
<tr><td>${H.dice('133356')}<br>Drei 3er (300), die 1 (100), die 5 (50). Die 6 bleibt im Spiel.</td><td>450</td></tr>
<tr><td>${H.dice('123455')}<br>Straße 1–5 (500) und die zweite 5 (50): Alle sechs punkten, also Hot Dice.</td><td>550</td></tr>
<tr><td>${H.dice('222333')}<br>Zwei Dreierpasche im selben Wurf: 2er (200) und 3er (300).</td><td>500</td></tr>
<tr><td>${H.dice('112233')}<br>Drei Pärchen zählen hier nicht: Nur die beiden Einsen punkten.</td><td>200</td></tr>
<tr><td>${H.dice('223346')}<br>Keine 1, keine 5, kein Dreierpasch, keine Straße: Farkle.</td><td>0</td></tr>
</tbody></table></div>
<p>Eine Kombination zählt nur, wenn ihre Würfel <b>im selben Wurf</b> fallen.</p>

<h2 id="farkle">Farkle</h2>
<p>Bringt ein Wurf <b>nichts Punktendes</b>, ist das ein Farkle: <b>Alle in diesem Zug beiseitegelegten Punkte sind weg</b>, und der Nächste ist dran. Früher gesicherte Punkte bleiben.</p>

<h2 id="hot">Hot Dice</h2>
<p>Hast du <b>alle sechs Würfel</b> mit Punkten beiseitegelegt, hast du Hot Dice: Du darfst alle sechs neu werfen und die Punkte behalten, oder sichern. Das geht beliebig oft, bis zum nächsten Farkle.</p>

<h2 id="ende">Spielende</h2>
<p>Das Ziel legst du vor dem Spiel fest: ${targetsText} Punkte. <b>Wer es beim Sichern zuerst erreicht, gewinnt sofort</b>, ohne letzte Runde für die anderen. Es gibt keine Mindestpunktzahl zum Einstieg.</p>

<h2 id="chance">Chance auf einen Farkle</h2>
${oddsTable(['Würfel im Wurf', 'Risiko'], [['6', 'etwa 1 von 32 (3,1 %)'], ['5', '7,7 %'], ['4', '15,7 %'], ['3', '27,8 %'], ['2', '44,4 %'], ['1', '2 von 3 (66,7 %)']])}
<p>Darum lohnt es sich oft, nur eine 1 zu behalten und mit mehr Würfeln weiterzumachen.</p>

<h2 id="varianten">Hausregeln</h2>
<p>Zehntausend kennt viele Hausregeln. Die folgenden gelten im Höfling <b>nicht</b>, klärt sie also vorher: eine Mindestpunktzahl zum Einstieg (oft 500 oder 1.000 Punkte), drei Pärchen als Kombination, Strafpunkte für mehrere Farkle in Folge, eine letzte Runde für die anderen, oder andere Werte für Pasche und Straßen. Auch Fünftausend mit fünf Würfeln wird oft gespielt.</p>
<p class="note">${DISCLAIMERS.de}</p>
${playCT('Mit diesen Regeln spielen', 'Kostenlos im Browser')}
`,
    faq: [
      ['Wie viel ist ein Dreierpasch beim Farkle wert?', `Augenzahl × 100 (drei 4er = 400), außer drei Einsen: ${nb(kindValue(1, 3))} Punkte. Jeder weitere gleiche Würfel verdoppelt.`],
      ['Was ist ein Farkle?', 'Ein Wurf ohne punktende Würfel. Du verlierst alle Punkte des Zugs, und der Nächste ist dran.'],
      ['Was sind Hot Dice?', 'Wenn alle sechs Würfel im Zug punktend beiseitegelegt sind: Du darfst alle sechs neu werfen und weitersammeln.'],
      ['Braucht man eine Mindestpunktzahl?', 'Im Höfling nicht: Du darfst schon im ersten Zug sichern, auch 50 Punkte. Manche Hausregeln verlangen mehr.'],
      ['Zählen drei Pärchen?', 'Hier nicht: Nur die 1er und 5er eines solchen Wurfs punkten.'],
      ['Gibt es eine letzte Runde?', 'Nein: Wer beim Sichern zuerst das Ziel erreicht, gewinnt sofort.'],
    ],
    related: ['farkle-online-spielen', 'kingdom-come-deliverance-2-wuerfelspiel', 'online-wuerfelspiel-mit-freunden'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCT, slug: 'kingdom-come-deliverance-2-wuerfelspiel', nav: 'KCD2-Würfelspiel', short: 'KCD2-Würfelspiel mit Freunden', parent: 'farkle-online-spielen',
    blurb: 'Das Spiel hinter dem Tavernen-Würfeln: Gemeinsamkeiten, Unterschiede, und wo ihr es zusammen spielt.',
    title: 'KCD2 Würfelspiel mit Freunden: das traditionelle Spiel online',
    description: 'Das Würfelspiel aus Kingdom Come: Deliverance 2 mit Freunden spielen? Spiel die traditionelle Variante Farkle kostenlos online. Unabhängige Website.',
    h1: 'Das Würfelspiel aus Kingdom Come: Deliverance 2, online mit Freunden',
    lead: `Das Würfeln in <i>Kingdom Come: Deliverance 2</i> beruht auf einem traditionellen Spiel mit sechs Würfeln, international <b>Farkle</b>, im Deutschen meist <b>Zehntausend</b>. Dieses alte Spiel kannst du online mit Freunden spielen, kostenlos, auf 421online.com. Das ist <b>keine offizielle Version</b> des Videospiels und auch nicht das Videospiel selbst.`,
    body: `
${indep}
${H.toc('Inhalt', [['grund', 'Die Grundregeln'], ['anders', 'Was das Videospiel ergänzt'], ['spielen', 'Mit Freunden spielen']])}

<h2 id="grund">Die Grundregeln</h2>
<p>Wie im traditionellen Spiel gilt in der Grundform: sechs Würfel werfen, mindestens einen punktenden beiseitelegen, dann den Rest neu werfen oder Punkte sichern. Ein Wurf ohne Punkte kostet die Punkte des Zugs. Liegen alle sechs beiseite, darfst du alle sechs neu werfen.</p>
<p>Die übliche Wertung: Eine 1 zählt 100, eine 5 zählt 50, ein Dreierpasch Augenzahl × 100 (drei Einsen: ${nb(kindValue(1, 3))}), jeder weitere gleiche Würfel verdoppelt, Straßen zählen 500 (1 bis 5), 750 (2 bis 6) und ${nb(1500)} (1 bis 6). Alle Kombinationen stehen bei den <a href="/zehntausend-wuerfelspiel-regeln">Zehntausend-Regeln</a>. Details können je nach Version abweichen; auf 421online gewinnt, wer beim Sichern zuerst das Ziel erreicht.</p>

<h2 id="anders">Was das Videospiel ergänzt</h2>
<p>Im Videospiel gehört das Würfeln zu einer Rollenspielwelt: Es kommen <b>Wetten</b> in Spielgeld, <b>besondere Würfel</b>, die anders rollen als normale, und <b>Sammelgegenstände</b> mit eigenen Effekten dazu. All das gibt es im Höfling nicht: Hier rollen sechs normale, faire Würfel. Du kannst Spielgeld setzen, nie echtes Geld.</p>

<h2 id="spielen">Mit Freunden spielen</h2>
<p>Lust auf eine Partie Würfeln, ohne das Videospiel zu starten, oder willst du es Freunden zeigen, die es nicht besitzen? Auf <a href="${P.courtisan}" data-play>421online.com</a> spielst du mit Der Höfling Farkle:</p>
<ul>
<li><b>kostenlos</b>, ohne Werbung oder Käufe, im Browser von Handy und PC;</li>
<li><b>online mit Freunden</b>, 2 bis 6 Spieler an einem Tisch mit Code oder Link;</li>
<li><b>gegen den Computer</b>, 1 bis 3 Gegner in drei Stufen;</li>
<li>bis <b>${targetsText} Punkte</b>, je nachdem, wie viel Zeit ihr habt.</li>
</ul>
${playCT('Das traditionelle Spiel spielen', 'Farkle mit Freunden, kostenlos im Browser')}
`,
    faq: [
      ['Ist das KCD2-Würfelspiel dasselbe wie Farkle?', 'Es beruht auf dem traditionellen Farkle und nutzt dessen Grundregeln, mit eigenen Zusätzen. Es ist nicht exakt dasselbe Spiel.'],
      ['Kann ich das KCD2-Würfelspiel online mit Freunden spielen?', 'Die traditionelle Variante schon: Eröffne im Höfling einen Tisch und schick deinen Freunden den Code, für 2 bis 6 Spieler. Das Videospiel selbst ist ein Einzelspieler-Spiel.'],
      ['Ist das ein offizielles Kingdom-Come-Spiel?', 'Nein. 421online.com ist eine unabhängige Website ohne Verbindung zu Warhorse Studios, Deep Silver oder Plaion. Hier geht es um das traditionelle Spiel, das das Videospiel inspiriert hat.'],
      ['Gibt es die besonderen Würfel aus dem Videospiel?', 'Nein. Der Höfling nutzt sechs normale, faire Würfel und keine Gegenstände mit Effekten.'],
    ],
    related: ['farkle-online-spielen', 'zehntausend-wuerfelspiel-regeln', 'online-wuerfelspiel-mit-freunden'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCF, slug: 'coups-fourres-karten-wuerfelspiel', nav: 'Coups Fourrés', short: 'Coups Fourrés: Karten- und Würfelspiel',
    blurb: 'Ein Duell aus Würfeln und Karten: Deck mit 20 Karten, Fallen und Bluff. Gratis im Browser.',
    title: 'Coups Fourrés: Karten- und Würfelspiel gratis im Browser',
    description: `Coups Fourrés verbindet das Würfelspiel 421 mit einem Sammelkartenspiel: ${CARDS.length} Karten, Fallen und Bluff im kurzen Duell. Kostenlos, ohne Download.`,
    h1: 'Coups Fourrés: 421 mit Karten',
    lead: `<b>Coups Fourrés</b> (französisch für „faule Tricks“) ist 421 als Duell, mit einem <b>Deck aus ${R.deckSize} Karten</b> in der Hinterhand: einen Würfel neu werfen, eine Falle stellen oder das Spiel im letzten Moment drehen. Ein kostenloses Strategie- und Bluffspiel im Browser, ohne Download.`,
    body: `
${playCF('Kostenlos spielen', 'Ohne Download und Anmeldung, geführte Partie in 3 Minuten')}
${H.toc('Inhalt', [['idee', 'Die Idee'], ['runde', 'Eine Runde'], ['typen', 'Fünf Kartenarten'], ['familien', 'Vier Kartenfamilien'], ['arten', 'Spielarten'], ['sammeln', 'Sammlung und Decks']])}

<h2 id="idee">Die Idee</h2>
<ul>
<li>Jeder startet mit <b>${R.startTokens} Jetons</b>. Wer als Erster keine mehr hat, gewinnt.</li>
<li>In jeder Runde würfelst du <b>mit drei Würfeln bis zu ${R.maxThrows}-mal</b>, mit den Kombinationen aus dem <a href="/421-wuerfelspiel-regeln">421</a>.</li>
<li>Die beste Kombination gewinnt die Runde, und ihr Spieler <b>gibt dem Verlierer</b> so viele Jetons, wie sie wert ist.</li>
<li>Zwischen den Würfen spielst du Karten und bezahlst sie mit <b>Biere</b> („Runden“, die Spielwährung jeder Partie): ${R.tourneesPerRound} pro Runde, ${R.tourneesPerRound + R.tourneesLoserBonus} für den, der gerade verloren hat.</li>
<li>Du siehst die Biere des Gegners, seine Kartenzahl und seine Fallen… aber nicht, welche. Da beginnt der Bluff.</li>
</ul>

<h2 id="runde">Eine Runde</h2>
<ol class="steps">
<li><b>Ausschank</b>: Jeder zieht eine Karte und bekommt seine Biere (höchstens ${R.tourneesMax} im Vorrat).</li>
<li><b>Der Vorspieler</b> (Verlierer der letzten Runde) würfelt und spielt Karten. Seine Zahl der Würfe ist die Grenze für den anderen.</li>
<li><b>Der andere Spieler</b> ist dran und kennt die Kombination, die er schlagen muss.</li>
<li><b>Letztes Wort</b>: Beide Kombinationen liegen auf dem Tisch; wer gerade verliert, darf noch eine „Letztes Wort“-Karte spielen.</li>
<li><b>Abrechnung</b>: Der Gewinner gibt dem Verlierer Jetons, Karteneffekte eingerechnet.</li>
</ol>
<p>Alle Regeln stehen auf der Seite <a href="/coups-fourres-regeln">Coups Fourrés Regeln</a>.</p>

<h2 id="typen">Fünf Kartenarten</h2>
<div class="table-wrap"><table>
<thead><tr><th>Art</th><th>Wann du sie spielst</th></tr></thead>
<tbody>
<tr><td><b>Streich</b></td><td>In deinem Zug, vor oder nach einem Wurf, danach abgelegt.</td></tr>
<tr><td><b>Falle</b></td><td>Verdeckt in deinem Zug gelegt; sie löst von selbst aus, wenn ihre Bedingung eintritt.</td></tr>
<tr><td><b>Konter</b></td><td>Jederzeit als Antwort auf eine gegnerische Karte.</td></tr>
<tr><td><b>Letztes Wort</b></td><td>Nur im Schritt „Letztes Wort“, direkt vor der Abrechnung.</td></tr>
<tr><td><b>Stammgast</b></td><td>In deinem Zug; er bleibt ${R.habitueRounds} Runden vor dir liegen (höchstens ${R.maxHabitues}).</td></tr>
</tbody></table></div>

<h2 id="familien">Vier Kartenfamilien</h2>
<p>Die ${CARDS.length} Karten gehören zu vier Familien: <b>Stammgäste</b> bringen Verbündete und mehr Biere, <b>Rausch</b>-Karten lassen Würfel kreisen und bringen die des Gegners durcheinander, <b>Fallen</b> liegen verdeckt, und <b>Ketten</b> verbinden Nachziehen, Rabatte und immer stärkere Antworten. Ein Deck hat höchstens ${DECK_RULES.maxFamilies} Familien, und die Familien des Gegners sind von Anfang an sichtbar.</p>

<h2 id="arten">Spielarten</h2>
<div class="cards">
<section class="card"><h3>Geführte Partie</h3><p>Drei Minuten gegen den Computer, Schritt für Schritt.</p></section>
<section class="card"><h3>Gegen den Computer</h3><p>Drei Gegner mit steigender Stärke, auch ohne Konto.</p></section>
<section class="card"><h3>Mit Freunden</h3><p>Ein Tisch mit Code für 2 bis 4 Spieler (kostenloses Konto).</p></section>
<section class="card"><h3>Liga und Turnier</h3><p>Ranglisten-Duelle in einer Monatsliga und jeden Samstag ab 20:40 Uhr (Brüsseler Zeit) ein kostenloses K.-o.-Turnier.</p></section>
</div>

<h2 id="sammeln">Sammlung und Decks</h2>
<p>Coups Fourrés ist auch ein kleines Sammelkartenspiel: Booster enthalten zufällige Karten und werden mit <b>Kapseln</b> geöffnet, die du beim Spielen verdienst. <b>Die kann man nicht kaufen</b>, es gibt nichts zu bezahlen. Du baust bis zu 5 Decks, oder das Spiel baut eines aus deiner Sammlung.</p>
${playCF('Coups Fourrés gratis spielen', 'Im Browser, mit geführter Partie in 3 Minuten')}
`,
    faq: [
      ['Ist Coups Fourrés kostenlos?', 'Ja. Kapseln verdienst du beim Spielen, sie sind nicht käuflich, und es gibt weder Werbung noch Abo.'],
      ['Muss ich 421 kennen?', 'Nein. Die geführte Partie erklärt Würfel und Karten in drei Minuten.'],
      ['Wie viele Spieler?', 'Duell gegen den Computer, in der Liga oder im Turnier; 2 bis 4 an einem Tisch mit Freunden.'],
      ['Wie lange dauert eine Partie?', `Ein Duell dauert wenige Minuten und nie länger als ${R.maxRounds} Runden.`],
    ],
    related: ['coups-fourres-regeln', '421-wuerfelspiel-online', 'online-wuerfelspiel-mit-freunden'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCF, slug: 'coups-fourres-regeln', nav: 'Regeln CF', short: 'Coups Fourrés Regeln', parent: 'coups-fourres-karten-wuerfelspiel',
    blurb: 'Aufbau, Runden, Biere, Kartenarten, Fallen und Partien zu dritt oder viert.',
    title: 'Coups Fourrés Regeln: Runden, Karten, Fallen und Jetons',
    description: 'Die Regeln von Coups Fourrés: Aufbau, eine Runde Schritt für Schritt, Kombinationen, Biere, die fünf Kartenarten, Fallen und Partien mit 3 oder 4 Spielern.',
    h1: 'Die Regeln von Coups Fourrés',
    lead: `Coups Fourrés nimmt die Würfel und Kombinationen des 421 und ergänzt ein Deck aus ${R.deckSize} Karten pro Spieler. Das Spiel wendet alle Regeln selbst an; hier stehen die Details.`,
    body: `
${H.toc('Inhalt', [['ziel', 'Das Ziel'], ['aufbau', 'Aufbau'], ['runde', 'Eine Runde'], ['kombis', 'Die Kombinationen'], ['tournees', 'Biere'], ['karten', 'Fallen, Stammgäste, Konter'], ['ende', 'Spielende'], ['mehr', 'Mit 3 oder 4 Spielern'], ['deck', 'Ein Deck bauen']])}

<h2 id="ziel">Das Ziel</h2>
<p>Du spielst 421 nur mit Abladen: Alle starten mit <b>${R.startTokens} Jetons</b> (${R.startTokensMulti} zu dritt oder viert). Wer als Erster keine Jetons mehr hat, gewinnt.</p>

<h2 id="aufbau">Aufbau</h2>
<p>Jeder mischt sein Deck mit ${R.deckSize} Karten und zieht ${R.startHand}. Bis zu ${R.mulligan} Karten darfst du einmalig unter das Deck legen und nachziehen. Der erste Vorspieler wird ausgelost.</p>

<h2 id="runde">Eine Runde</h2>
<ol class="steps">
<li><b>Ausschank</b>: 1 Karte ziehen und ${R.tourneesPerRound} Bier bekommen (${R.tourneesPerRound + R.tourneesLoserBonus} für den Verlierer der letzten Runde). Du kannst bis zu ${R.tourneesMax} sparen.</li>
<li><b>Tresen-Bestellung</b>: Eine zufällige Bonusregel gilt für alle in dieser Runde.</li>
<li><b>Zug des Vorspielers</b>: bis zu ${R.maxThrows}-mal würfeln, Würfel zwischen den Würfen behalten, jederzeit aufhören. Karten dürfen vor oder nach jedem Wurf gespielt werden. Die Zahl der Würfe ist die Grenze des anderen.</li>
<li><b>Zug des anderen</b> innerhalb dieser Grenze, mit Blick auf das Ergebnis des Vorspielers.</li>
<li><b>Letztes Wort</b>: Wer gerade verliert, darf eine „Letztes Wort“-Karte spielen, der andere antworten, bis beide passen.</li>
<li><b>Abrechnung</b>: Der Gewinner gibt dem Verlierer so viele Jetons, wie seine Kombination wert ist, Karten eingerechnet. Bei völligem Gleichstand gibt niemand etwas.</li>
<li>Der Verlierer beginnt die nächste Runde.</li>
</ol>

<h2 id="kombis">Die Kombinationen</h2>
<p>Wie beim 421, von der besten zur schlechtesten:</p>
${combosTable(L421, H.dice)}

<h2 id="tournees">Biere</h2>
<p>Biere bezahlen Karten: Die Zahl im kleinen Glas auf der Karte sind ihre Kosten. Du bekommst sie bei jedem Ausschank, und die Biere jedes Spielers sind <b>für alle sichtbar</b>. Ein Gegner ohne Biere kann kaum etwas spielen, einer mit vier oder mehr plant vielleicht etwas Großes.</p>

<h2 id="karten">Fallen, Stammgäste, Konter</h2>
<ul>
<li><b>Fallen</b>: höchstens ${R.maxTrapsOn} vor einem Spieler, höchstens ${R.maxTraps} pro Spieler gelegt. Du siehst, wie viele liegen, nie welche. Eine Falle, die nach ${R.trapReturnRounds} Runden nicht ausgelöst hat, kommt auf die Hand ihres Besitzers zurück.</li>
<li><b>Stammgäste</b>: höchstens ${R.maxHabitues} im Spiel, je ${R.habitueRounds} Runden, außer sie werden verjagt.</li>
<li><b>Konter</b>: Wenn mehrere Karten aufeinander antworten, wirkt die zuletzt gespielte zuerst.</li>
</ul>

<h2 id="ende">Spielende</h2>
<ul>
<li>Wer keine Jetons mehr hat, gewinnt sofort.</li>
<li>Zieht sich eine Partie hin, schließt die Kneipe nach Runde <b>${R.maxRounds}</b>: Wer die wenigsten Jetons hat, gewinnt.</li>
<li>Deck leer: Ablagestapel neu mischen und ${R.reshufflePenalty} Jeton nehmen.</li>
<li>Pro Entscheidung hast du ${R.decisionSeconds} Sekunden, dazu ${R.reserveSeconds} Sekunden Reserve für die ganze Partie. In der Rangliste zählt Verlassen als Niederlage; nach einem Verbindungsabbruch hast du 60 Sekunden, um zurückzukehren.</li>
</ul>

<h2 id="mehr">Mit 3 oder 4 Spielern</h2>
<p>An einem Tisch mit Code: ${R.startTokensMulti} Jetons pro Spieler. Wer zuerst bei 0 ist, gewinnt, und die Partie endet. <b>Nur die schlechteste Kombination der Runde bekommt Jetons</b>, von der besten, wie beim 421. Fallen liegen sichtbar vor einem gewählten Spieler.</p>

<h2 id="deck">Ein Deck bauen</h2>
<p>Ein Deck hat genau <b>${R.deckSize} Karten</b>: höchstens ${R.maxCopies} Kopien einer Karte, <b>höchstens ${DECK_RULES.maxFamilies} Familien</b> und <b>eine legendäre Karte</b>. Du kannst bis zu 5 Decks speichern.</p>
${playCF('Coups Fourrés ausprobieren', 'Die geführte Partie erklärt die Regeln')}
`,
    faq: [
      ['Mit wie vielen Jetons startet man?', `${R.startTokens} im Duell, ${R.startTokensMulti} mit 3 oder 4 Spielern. Wer zuerst keine mehr hat, gewinnt.`],
      ['Wie viele Karten hat ein Deck?', `Genau ${R.deckSize}, höchstens ${R.maxCopies} Kopien pro Karte, höchstens ${DECK_RULES.maxFamilies} Familien und eine legendäre Karte.`],
      ['Sieht man die Fallen des Gegners?', 'Du siehst, wie viele liegen, aber nicht welche.'],
      ['Was passiert bei Gleichstand?', 'Bei völligem Gleichstand der beiden Kombinationen gibt niemand Jetons.'],
    ],
    related: ['coups-fourres-karten-wuerfelspiel', '421-wuerfelspiel-regeln', '421-wuerfelspiel-online'],
  },
];
