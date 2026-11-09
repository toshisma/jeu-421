/**
 * Pages d'aide en néerlandais, écrites pour les recherches néerlandophones (dobbelspel, Farkle, Tienduizend).
 * Valeurs : mêmes sources que les pages françaises. Voir la note gelée en tête de seo-i18n-common.mjs : publiées
 * uniquement avec le jeu entièrement traduit.
 */
import { CT_OG } from './seo-courtisan-pages.mjs';
import { CARDS, CF_RULES as R, DECK_RULES, DISCLAIMERS, DM_TARGETS, UPDATED, V421, combosTable, helpers, kindValue, kindsTable, oddsTable, playLinks, scoringTable } from './seo-i18n-common.mjs';

const H = helpers('nl');
const P = playLinks('nl');
const nb = H.nb;
const base421 = { lang: 'nl', published: UPDATED, updated: UPDATED, play: P.l421 };
const baseCT = { lang: 'nl', published: UPDATED, updated: UPDATED, play: P.courtisan, og: CT_OG, about: 'farkle-nl' };
const baseCF = { lang: 'nl', published: UPDATED, updated: UPDATED, play: P.cartes, og: '/og-coups-fourres.jpg', about: 'cf-nl' };
const play421 = (a, b) => H.play(P.l421, a, b);
const playCT = (a, b) => H.play(P.courtisan, a, b);
const playCF = (a, b) => H.play(P.cartes, a, b);
const indep = `<p class="disclaimer" role="note"><b>${DISCLAIMERS.nl}</b> Deze pagina beschrijft het traditionele dobbelspel dat het videospel heeft geïnspireerd; ze bevat geen beelden of teksten uit het videospel.</p>`;
const targets = DM_TARGETS.map(nb);
const targetsText = `${targets[0]}, ${targets[1]} of ${targets[2]}`;
const L421 = { head: ['Combinatie', 'Voorbeeld', 'Waarde'], tokens: (n) => `${n} ${n > 1 ? 'fiches' : 'fiche'}`, r421: '4-2-1', r111: 'Drie enen', rx: 'Twee enen + x, dan drie keer x', rxv: 'x fiches (6 tot 2)', rs: 'Straat', ro: 'Elke andere combinatie', rn: 'Nénette (de slechtste)', rnv: `de verliezer neemt minstens ${V421.nenette} fiches` };
const SC = { h: ['Combinatie', 'Punten'], one: 'Eén losse 1', five: 'Eén losse 5', t1: 'Drie enen', tx: 'Drie 2-en, 3-en, 4-en, 5-en of 6-en', txv: 'waarde × 100 (drie 4-en = 400)', more: 'Vier, vijf of zes dezelfde', morev: 'verdubbelt met elke extra steen (vier 2-en = 400)', s15: 'Straat 1–5', s26: 'Straat 2–6', s16: 'Grote straat 1–6' };
const KT = { face: 'Waarde', three: 'Drie', four: 'Vier', five: 'Vijf', six: 'Zes', of: (f) => `${f}-en` };

export const nlPages = [
  // ---------------------------------------------------------------------------------------------
  {
    ...base421, slug: '421-dobbelspel-online', nav: '421 spelen', short: '421 online spelen',
    blurb: 'Het Franse caféspel met drie dobbelstenen, gratis in je browser, alleen of met vrienden.',
    title: '421 online spelen: het Franse dobbelspel, gratis in je browser',
    description: 'Speel 421, het Franse caféspel met dobbelstenen, gratis online: 3 stenen, fiches, 2 tot 6 spelers of tegen de computer. Geen download, op gsm en computer.',
    h1: '421 online spelen: het dobbelspel uit Frankrijk',
    lead: `<b>421</b> (zeg maar „vier-twee-een”) is het dobbelspel van de toog in Franse en Belgische cafés: drie stenen, een hoopje fiches, en wie op het einde nog fiches heeft, betaalt traditioneel het volgende rondje. Buiten Frankrijk kennen weinigen het. Op <a href="${P.l421}" data-play>421online.com</a> speel je het gratis in je browser, tegen de computer of met vrienden.`,
    body: `
${play421('Speel 421 nu', 'Gratis, geen download, op gsm en computer')}
${H.toc('Inhoud', [['wat', 'Wat is 421?'], ['verloop', 'Zo verloopt een spel'], ['manieren', 'Manieren om te spelen'], ['account', 'Met of zonder account'], ['eerlijk', 'Eerlijke stenen']])}

<h2 id="wat">Wat is 421?</h2>
<p>421 is genoemd naar de beste worp, ${H.dice('421')}. Iedereen gooit met drie stenen, de slechtste combinatie van de ronde krijgt fiches, en je wilt de jouwe zo snel mogelijk kwijt. Een spel duurt enkele minuten en iedereen speelt elke ronde mee, dus niemand zit te wachten.</p>

<h2 id="verloop">Zo verloopt een spel</h2>
<ol class="steps">
<li>Per ronde gooi je tot ${V421.throws} keer met drie stenen en houd je wat je bevalt. De eerste speler van de ronde bepaalt hoeveel worpen de anderen krijgen.</li>
<li>De laagste combinatie verliest de ronde, en de hoogste bepaalt hoeveel fiches er van eigenaar wisselen.</li>
<li>Eerst <b>laad</b> je: de verliezer neemt fiches uit een pot van ${V421.pot}. Daarna <b>los</b> je: de fiches gaan naar de verliezer. Geen fiches meer: je bent veilig. Wie als laatste fiches heeft, verliest.</li>
</ol>
<p>Alle regels met voorbeeld staan op de pagina <a href="/421-dobbelspel-regels">421 spelregels</a>. Het spel telt de fiches voor je, en een begeleid spel legt alles uit terwijl je speelt.</p>

<h2 id="manieren">Manieren om te spelen</h2>
<div class="cards">
<section class="card"><h3>Tegen de computer</h3><p>1 tot 5 tegenstanders op drie niveaus, van makkelijk tot moeilijk.</p></section>
<section class="card"><h3>Snel potje</h3><p>Met één tik aan een open tafel, 2 tot 6 spelers; de gastheer kan plaatsen aanvullen met computers.</p></section>
<section class="card"><h3>Privétafel</h3><p>Maak een tafel en deel de link of de code van 5 letters. <a href="/online-dobbelspel-met-vrienden">Met vrienden spelen</a>.</p></section>
<section class="card"><h3>Toernooien</h3><p>Elke dag om 11 en 21 uur (Brusselse tijd), 4 tot 16 spelers, met een account. Je kunt ook je eigen toernooi opzetten.</p></section>
<section class="card"><h3>Dagelijkse uitdaging</h3><p>Dezelfde stenen voor iedereen, vijf worpen, één poging, een dagelijkse rangschikking.</p></section>
<section class="card"><h3>Huisregels</h3><p>Stel fiches, worpen, waarden en gelijkspel in voor het spel. Kant-en-klare formats: Klassiek, Blitz en Sudden Death.</p></section>
<section class="card"><h3>Coups Fourrés</h3><p>421 met een kaartendeck, vallen en bluf. <a href="/coups-fourres-kaart-dobbelspel">Ontdek het</a>.</p></section>
<section class="card"><h3>De Hoveling</h3><p>Het risicospel met zes stenen. <a href="/farkle-online-spelen">Speel Farkle</a>.</p></section>
</div>

<h2 id="account">Met of zonder account</h2>
<p>Je hebt geen account nodig: kies een naam en speel. Een gratis account (een gebruikersnaam en wachtwoord, <b>geen e-mailadres</b>) voegt vrienden, berichten, de dagelijkse toernooien en voortgang op al je apparaten toe. Munten verdien je alleen door te spelen, voor uiterlijk en toernooien: <b>je kunt ze niet kopen</b>, en er valt niets te kopen.</p>

<h2 id="eerlijk">Eerlijke stenen</h2>
<p>Online trekt de server elke steen met een cryptografische toevalsbron: geen enkele speler kan de uitslag beïnvloeden. Het 3D-bakje speelt die worp daarna af, zodat iedereen dezelfde stenen ziet rollen.</p>
${play421('Speel 421 nu', 'Je eerste spel is begeleid')}
`,
    faq: [
      ['Wat is het dobbelspel 421?', 'Een traditioneel Frans caféspel met drie stenen en fiches. De beste worp is 4-2-1, de laagste combinatie verliest elke ronde, en wie als laatste fiches heeft, verliest het spel.'],
      ['Is 421online gratis?', 'Ja, zonder reclame, abonnement of aankopen. Het werkt in je browser.'],
      ['Met hoeveel spelers?', '2 tot 6 aan een online tafel, of tegen 1 tot 5 computers.'],
      ['Heb ik een account nodig?', 'Nee. Een gratis account zonder e-mailadres voegt alleen vrienden, dagelijkse toernooien en bewaarde voortgang toe.'],
    ],
    related: ['421-dobbelspel-regels', 'online-dobbelspel-met-vrienden', 'coups-fourres-kaart-dobbelspel'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...base421, slug: '421-dobbelspel-regels', nav: '421 regels', short: '421 spelregels', parent: '421-dobbelspel-online',
    blurb: 'Worpen, combinaties, laden en lossen, gelijkspel: de regels met een voorbeeld.',
    title: '421 spelregels: combinaties, fiches, laden en lossen',
    description: 'Zo speel je 421, het Franse dobbelspel: drie stenen, de volgorde van de combinaties, de waarde in fiches, laden en lossen, gelijkspel en huisregels.',
    h1: '421 spelregels: zo speel je het dobbelspel',
    lead: `421 speel je met drie dobbelstenen en een pot fiches. Het doel: <b>al je fiches kwijtraken</b>; wie als laatste nog fiches heeft, verliest. Dit zijn de standaardregels op 421online, gevolgd door de bekende varianten.`,
    body: `
${H.toc('Inhoud', [['materiaal', 'Materiaal'], ['ronde', 'Een ronde'], ['combos', 'De combinaties'], ['laden', 'Laden'], ['lossen', 'Lossen'], ['voorbeeld', 'Voorbeeld'], ['gelijk', 'Gelijkspel'], ['varianten', 'Varianten']])}

<h2 id="materiaal">Materiaal</h2>
<p>Je hebt drie zeskantige dobbelstenen nodig en ${V421.pot} fiches (of lucifers, of munten) in het midden van de tafel, voor minstens 2 spelers; 3 tot 6 is ideaal.</p>

<h2 id="ronde">Een ronde</h2>
<p>Iedereen gooit om de beurt met de drie stenen. Je kunt stoppen, of <b>de stenen die je bevallen houden en de rest opnieuw gooien</b>, tot ${V421.throws} worpen in totaal. Een gehouden steen mag je bij de volgende worp opnieuw meegooien: niets ligt vast tot je stopt.</p>
<p>De <b>eerste speler van de ronde</b> bepaalt de grens: stopt hij na één worp, dan krijgt iedereen er één; gebruikt hij er twee, dan krijgt niemand er meer dan twee.</p>
<p>Als iedereen geweest is, <b>verliest de laagste combinatie de ronde</b> en bepaalt de <b>hoogste</b> hoeveel fiches er meegaan. De verliezer begint de volgende ronde.</p>

<h2 id="combos">De combinaties</h2>
<p>Van de beste naar de slechtste:</p>
${combosTable(L421, H.dice)}
<p>Bij twee „andere” combinaties zet je de stenen van hoog naar laag en vergelijk je één voor één: 6-5-2 wint van 6-4-3. Twee enen winnen van drie dezelfde met dezelfde waarde: 6-1-1 wint van 6-6-6, en dat wint van 5-1-1. De 2-2-1, de <b>nénette</b>, is de allerslechtste combinatie.</p>

<h2 id="laden">Laden</h2>
<p>In het begin liggen alle ${V421.pot} fiches in de pot. Elke ronde <b>neemt de verliezer zoveel fiches uit de pot als de beste combinatie waard is</b>. Bij het laden geldt hier standaard één worp per persoon, zodat het vlot gaat. Is de pot leeg, dan stopt het laden, en wie <b>geen fiches</b> heeft, heeft al gewonnen en gaat eruit.</p>

<h2 id="lossen">Lossen</h2>
<p>Wie fiches heeft, speelt verder, nu met drie worpen. <b>De speler met de beste combinatie geeft de verliezer</b> zoveel fiches als zijn combinatie waard is. Geen fiches meer: je bent eruit en veilig. Wie als laatste fiches heeft, verliest het spel.</p>

<h2 id="voorbeeld">Voorbeeld</h2>
<p>Anna, Ben en Clara spelen en er liggen nog 9 fiches in de pot. Anna gooit ${H.dice('641')}, gooit de 6 en de 1 opnieuw en krijgt ${H.dice('421')}. Ze stopt na <b>twee worpen</b>, dus de anderen mogen maar twee keer.</p>
<p>Ben eindigt op ${H.dice('555')}, Clara op ${H.dice('221')}. Clara heeft de laagste combinatie en verliest; de beste is de 421 van Anna, ${V421.v421} waard, dus Clara neemt ${V421.v421} fiches uit de pot en er blijft er één over. Zij begint de volgende ronde.</p>

<h2 id="gelijk">Gelijkspel</h2>
<ul>
<li>Gelijk om de laatste plaats: die spelers doen een <b>barrage</b>, één worp per persoon, de laagste verliest. Nog gelijk? Opnieuw.</li>
<li>Gelijk om de beste combinatie tijdens het lossen: een barrage beslist wie de fiches geeft.</li>
<li>Wie verliest met een nénette, neemt minstens ${V421.nenette} fiches.</li>
<li>Is de pot bijna leeg, dan neemt de verliezer alleen wat er nog ligt; bij het lossen geef je hoogstens wat je nog hebt.</li>
</ul>

<h2 id="varianten">Varianten</h2>
<p>421 verschilt van café tot café, dus spreek het vooraf af. Op 421online stel je fiches, worpen, de waarde van elke combinatie, de regel bij gelijkspel en het format in: laden en lossen, <b>alleen lossen</b> (iedereen start met evenveel fiches) of <b>op punten</b> (een vast aantal rondes).</p>
${play421('Probeer een potje', 'Het spel past de regels toe en telt de fiches')}
`,
    faq: [
      ['Met hoeveel stenen speel je 421?', 'Met drie, tot drie worpen per beurt. De eerste speler van elke ronde bepaalt het aantal worpen.'],
      ['Wat is de beste combinatie?', `4-2-1, standaard ${V421.v421} fiches waard. Daarna drie enen, ${V421.v111} fiches.`],
      ['Wat is een nénette?', `De 2-2-1, de slechtste combinatie. Wie ermee verliest, neemt minstens ${V421.nenette} fiches.`],
      ['Wie verliest bij 421?', 'Wie aan het einde van het lossen als laatste fiches heeft. In Franse cafés betaalt die traditioneel het rondje.'],
      ['Hoeveel fiches zijn er?', `${V421.pot} fiches in de pot; het laden verdeelt ze over de spelers.`],
    ],
    related: ['421-dobbelspel-online', 'online-dobbelspel-met-vrienden', 'coups-fourres-spelregels'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...base421, slug: 'online-dobbelspel-met-vrienden', nav: 'Met vrienden', short: 'Online dobbelspel met vrienden',
    blurb: 'Open een privétafel, stuur een code of link en dobbel samen, waar je ook bent.',
    title: 'Online dobbelspel met vrienden: privétafel, zonder download',
    description: 'Online dobbelen met vrienden: open een privétafel, deel een link of code en speel 421 of Farkle samen in je browser. Gratis, niets te installeren.',
    h1: 'Een online dobbelspel om met vrienden te spelen',
    lead: `Je vrienden zijn ver weg en niemand heeft dobbelstenen bij de hand? Op <a href="${P.l421}" data-play>421online.com</a> open je in een minuut een privétafel. Iedereen doet mee vanaf gsm of computer, zonder iets te installeren, en de 3D-stenen rollen voor iedereen tegelijk.`,
    body: `
${play421('Tafel met vrienden openen', 'Gratis, geen download')}
${H.toc('Inhoud', [['stappen', 'Vrienden uitnodigen in vier stappen'], ['welk', 'Welk spel kies je?'], ['niets', 'Niets te installeren'], ['ideeen', 'Ideeën voor een spelavond'], ['eerlijk', 'Niemand kan de stenen vervalsen']])}

<h2 id="stappen">Vrienden uitnodigen in vier stappen</h2>
<ol class="steps">
<li><b>Open het spel</b> en kies 421 of De Hoveling (Farkle).</li>
<li><b>Open een privétafel</b>: die krijgt een code van 5 letters.</li>
<li><b>Stuur de code</b> (of de link) naar je groepsgesprek.</li>
<li><b>Start het spel</b> als iedereen zit. Ontbreekt er iemand? De gastheer kan computers toevoegen.</li>
</ol>

<h2 id="welk">Welk spel kies je?</h2>
<div class="table-wrap"><table>
<thead><tr><th>Spel</th><th>Spelers</th><th>Sfeer</th></tr></thead>
<tbody>
<tr><td><a href="/421-dobbelspel-online">421</a></td><td>2 tot 6</td><td>Drie stenen en fiches om door te geven: snel, plagerig, met eigen huisregels.</td></tr>
<tr><td><a href="/farkle-online-spelen">De Hoveling (Farkle)</a></td><td>2 tot 6</td><td>Zes stenen en één vraag: opnieuw gooien of vastzetten?</td></tr>
<tr><td><a href="/coups-fourres-kaart-dobbelspel">Coups Fourrés</a></td><td>2 tot 4</td><td>421 met een kaartendeck, vallen en bluf, voor wie van strategie houdt.</td></tr>
</tbody></table></div>

<h2 id="niets">Niets te installeren</h2>
<p>Alles draait in de browser, op Android, iPhone, iPad, Windows, Mac of Linux, en spelers aan dezelfde tafel mogen verschillende apparaten gebruiken. Voor een potje zonder inzet is een naam genoeg. Een gratis account zonder e-mailadres voegt een vriendenlijst, berichten en voortgang op al je apparaten toe.</p>

<h2 id="ideeen">Ideeën voor een spelavond</h2>
<ul>
<li>Start een videogesprek en laat het spel ernaast openstaan: de stenen in het spel, het lachen in het gesprek.</li>
<li>Kies bij 421 het format Blitz (11 fiches, 10 seconden per beslissing) voor een kort potje.</li>
<li>Kunnen niet alle spelers tegelijk? Bij vriendenuitdagingen in 421 krijgen jullie exact dezelfde stenen, en ieder speelt binnen 72 uur.</li>
<li>In 421 kun je ook één gsm doorgeven aan tafel, of met echte dobbelstenen spelen terwijl de app de score bijhoudt.</li>
</ul>

<h2 id="eerlijk">Niemand kan de stenen vervalsen</h2>
<p>In online potjes trekt de server de stenen, niet de gsm van een speler, en iedereen ziet dezelfde uitslag.</p>
${play421('Mijn vrienden uitnodigen', 'Eén link is genoeg')}
`,
    faq: [
      ['Hoe dobbel ik online met vrienden?', 'Open een privétafel op 421online.com en stuur je vrienden de code of de link. Zij doen mee in hun browser, zonder iets te installeren.'],
      ['Kan het zonder account?', 'Ja, bij een potje zonder inzet: iedereen kiest gewoon een naam.'],
      ['Met hoeveel spelers kan het?', 'Tot 6 aan een tafel met 421 of Farkle, tot 4 bij Coups Fourrés.'],
    ],
    related: ['421-dobbelspel-online', 'farkle-online-spelen', 'coups-fourres-kaart-dobbelspel'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCT, slug: 'farkle-online-spelen', nav: 'Farkle spelen', short: 'Farkle online spelen',
    blurb: 'Farkle (Tienduizend) gratis in je browser: tegen de computer of met vrienden.',
    title: 'Farkle online spelen: gratis dobbelspel met vrienden',
    description: 'Speel Farkle online, ook bekend als Tienduizend of 10.000: gratis, 2 tot 6 spelers via een code of tegen de computer. Geen download, gewoon in je browser.',
    h1: 'Farkle online spelen, gratis, met vrienden',
    lead: `<b>De Hoveling</b> is onze versie van <b>Farkle</b>, het klassieke risicospel met zes dobbelstenen, ook bekend als <b>Tienduizend</b> of 10.000. Open een tafel, stuur je vrienden een code en speel samen in je browser, op gsm of computer. Gratis, zonder download en zonder account.`,
    body: `
${playCT('Speel Farkle nu', 'Gratis, geen download, op gsm en computer')}
${H.toc('Inhoud', [['vrienden', 'Spelen met vrienden'], ['manieren', 'Manieren om te spelen'], ['regels', 'Onze regels'], ['groschen', 'Gratis of om Groschen'], ['kcd', 'Kom je van Kingdom Come?']])}

<h2 id="vrienden">Spelen met vrienden</h2>
<ol class="steps">
<li><b>Open <a href="${P.courtisan}" data-play>De Hoveling</a></b> en kies <b>Tafel openen</b>.</li>
<li><b>Deel de code van 5 tekens of de link</b>. Je vrienden doen mee vanuit elke browser.</li>
<li><b>Start het spel</b> als iedereen klaar is: 2 tot 6 spelers, en de gastheer kan lege plaatsen met computers vullen.</li>
</ol>
<p>Elke worp wordt door de server getrokken, en iedereen ziet dezelfde stenen rollen in het 3D-bakje.</p>

<h2 id="manieren">Manieren om te spelen</h2>
<div class="cards">
<section class="card"><h3>Online met vrienden</h3><p>Een privétafel met code of link, voor <b>2 tot 6 spelers</b>, met chat en reacties.</p></section>
<section class="card"><h3>Tegen de computer</h3><p><b>1 tot 3 tegenstanders</b> op drie niveaus, van beginner tot de rekenaar die de kansen uitrekent.</p></section>
<section class="card"><h3>Snel potje</h3><p>Met één tik aan een open tafel.</p></section>
<section class="card"><h3>Jouw doel</h3><p>Speel tot <b>${targetsText}</b> punten. Een potje met twee duurt tot ${targets[0]} ongeveer 3 beurten per persoon, tot ${targets[1]} 6 à 7 en tot ${targets[2]} 17 à 18.</p></section>
</div>
<p class="note">De duur komt uit duizenden gesimuleerde potjes tussen twee computers op middelniveau, berekend met de spelmotor.</p>

<h2 id="regels">Onze regels</h2>
<p>Gooi zes stenen, leg minstens één scorende steen apart, en <b>gooi opnieuw</b> of <b>zet je punten vast</b>. Een worp zonder scorende stenen is een <b>farkle</b>: de punten van die beurt ben je kwijt. Alle zes apart gelegd? Dan heb je <b>hot dice</b> en mag je alle zes opnieuw gooien. Wie bij het vastzetten het doel haalt, <b>wint meteen</b>, zonder laatste ronde. De volledige puntentelling staat bij de <a href="/farkle-spelregels">Farkle-spelregels</a>.</p>

<h2 id="groschen">Gratis of om Groschen</h2>
<p>Je kunt elk spel gratis spelen. De Hoveling heeft ook eigen speelgeld, <b>Groschen</b>: met een gratis account krijg je er elke dag 20 en kun je ze inzetten, de winnaar neemt de pot. Groschen zijn <b>alleen speelgeld</b>: niet te koop en niet uit te betalen. Een account heeft alleen een gebruikersnaam en wachtwoord nodig, <b>geen e-mailadres</b>.</p>

<h2 id="kcd">Kom je van Kingdom Come?</h2>
<p>Ken je dit spel uit de herbergen van <i>Kingdom Come: Deliverance 2</i>? In de kern is het hetzelfde oude dobbelspel. <a href="/kingdom-come-deliverance-2-dobbelspel">Wat hetzelfde is en wat niet</a>.</p>
${indep}
${playCT('Gooi de stenen', 'Tegen de computer of met vrienden')}
`,
    faq: [
      ['Is deze Farkle gratis?', 'Ja. Geen abonnement, geen reclame, niets te kopen. Het werkt in je browser, op gsm of computer.'],
      ['Is Farkle hetzelfde als Tienduizend?', 'In de kern wel: Farkle, Tienduizend en 10.000 zijn namen voor hetzelfde risicospel, met huisregels die verschillen.'],
      ['Hebben mijn vrienden een account nodig?', 'Nee. Ze openen de link of voeren de code in, kiezen een naam en spelen.'],
      ['Met hoeveel spelers?', '2 tot 6 aan een online tafel, of 1 tot 3 computers als je alleen speelt.'],
      ['Gaat het om echt geld?', 'Nee. Groschen zijn alleen speelgeld, niet te koop en niet uit te betalen.'],
    ],
    related: ['farkle-spelregels', 'kingdom-come-deliverance-2-dobbelspel', 'online-dobbelspel-met-vrienden'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCT, slug: 'farkle-spelregels', nav: 'Farkle-regels', short: 'Farkle-spelregels', parent: 'farkle-online-spelen',
    blurb: 'Puntentelling, farkle, hot dice en het einde van het spel, met uitgewerkte worpen.',
    title: 'Farkle spelregels en puntentelling met zes dobbelstenen',
    description: 'De Farkle-spelregels (Tienduizend) met zes stenen: punten voor enen, vijven, drie dezelfde en straten, farkle, hot dice en het einde, met voorbeelden.',
    h1: 'Farkle-spelregels en puntentelling',
    lead: `Farkle, ook Tienduizend genoemd, speel je met zes dobbelstenen en minstens twee spelers. Het doel: <b>als eerste de afgesproken score halen</b>. Dit zijn de regels zoals De Hoveling ze toepast op 421online.`,
    body: `
${H.toc('Inhoud', [['beurt', 'Een beurt'], ['punten', 'De punten'], ['gelijke', 'Drie tot zes dezelfde'], ['voorbeelden', 'Voorbeeldworpen'], ['farkle', 'Farkle'], ['hot', 'Hot dice'], ['einde', 'Einde van het spel'], ['kans', 'Kans op een farkle'], ['huisregels', 'Huisregels']])}

<h2 id="beurt">Een beurt</h2>
<ol class="steps">
<li>Gooi <b>alle zes de stenen</b>.</li>
<li>Leg <b>minstens één scorende steen</b> apart. Het mogen er meer zijn, maar <b>elke apart gelegde steen moet punten geven</b>: een 1, een 5, of een steen uit een combinatie in die worp.</li>
<li>Kies: <b>opnieuw gooien</b> met de overige stenen, of <b>vastzetten</b>. Vastzetten telt al je punten van die beurt bij je score en beëindigt je beurt.</li>
<li>Gooi je opnieuw, dan begin je weer bij stap 2 met minder stenen, tot je vastzet of farkelt.</li>
</ol>

<h2 id="punten">De punten</h2>
${scoringTable(SC, H.dice, nb)}
<p>2-en, 3-en, 4-en en 6-en leveren alleen op in een groep van drie of meer dezelfde, of in een straat.</p>

<h2 id="gelijke">Drie tot zes dezelfde</h2>
<p>Drie dezelfde zijn de waarde × 100 waard, behalve drie enen, die ${nb(kindValue(1, 3))} punten waard zijn. <b>Elke extra gelijke steen verdubbelt de waarde</b>:</p>
${kindsTable(KT, H.dice, nb)}
<p>De grootste worp is ${H.dice('111111')}: zes enen, ${nb(kindValue(1, 6))} punten in één keer.</p>

<h2 id="voorbeelden">Voorbeeldworpen</h2>
<div class="table-wrap"><table>
<thead><tr><th>Worp en wat scoort</th><th>Punten</th></tr></thead>
<tbody>
<tr><td>${H.dice('133356')}<br>Drie 3-en (300), de 1 (100) en de 5 (50). De 6 blijft in het spel.</td><td>450</td></tr>
<tr><td>${H.dice('123455')}<br>Straat 1–5 (500) en de extra 5 (50): alle zes scoren, dus hot dice.</td><td>550</td></tr>
<tr><td>${H.dice('222333')}<br>Twee groepen van drie in dezelfde worp: drie 2-en (200) en drie 3-en (300).</td><td>500</td></tr>
<tr><td>${H.dice('112233')}<br>Drie paren tellen hier niet: alleen de twee enen scoren.</td><td>200</td></tr>
<tr><td>${H.dice('223346')}<br>Geen 1, geen 5, geen drie dezelfde, geen straat: een farkle.</td><td>0</td></tr>
</tbody></table></div>
<p>Een combinatie telt alleen als de stenen <b>in dezelfde worp</b> vallen.</p>

<h2 id="farkle">Farkle</h2>
<p>Als een worp <b>niets scoort</b>, is dat een farkle: <b>alle punten die je deze beurt apart had gelegd, ben je kwijt</b> en de volgende speler is aan de beurt. Eerder vastgezette punten blijven staan.</p>

<h2 id="hot">Hot dice</h2>
<p>Heb je <b>alle zes de stenen</b> scorend apart gelegd, dan heb je hot dice: je mag alle zes opnieuw gooien en de punten houden, of vastzetten. Dat kan zo vaak je wilt, tot de volgende farkle.</p>

<h2 id="einde">Einde van het spel</h2>
<p>Je kiest het doel voor het spel: ${targetsText} punten. <b>Wie het als eerste haalt bij het vastzetten, wint meteen</b>; de anderen krijgen geen laatste ronde. Er is geen minimumscore om te mogen beginnen.</p>

<h2 id="kans">Kans op een farkle</h2>
${oddsTable(['Stenen in de worp', 'Kans op een farkle'], [['6', 'ongeveer 1 op 32 (3,1%)'], ['5', '7,7%'], ['4', '15,7%'], ['3', '27,8%'], ['2', '44,4%'], ['1', '2 op 3 (66,7%)']])}
<p>Daarom loont het soms om maar één 1 te houden en meer stenen opnieuw te gooien.</p>

<h2 id="huisregels">Huisregels</h2>
<p>Van tafel tot tafel verschillen de regels. De volgende gelden in De Hoveling <b>niet</b>, dus spreek ze vooraf af: een minimumscore om te beginnen (vaak 500 of 1.000), drie paren als combinatie, een straf na drie farkles op rij, een laatste ronde zodra iemand het doel haalt, of andere waarden voor drie dezelfde en straten.</p>
<p class="note">${DISCLAIMERS.nl}</p>
${playCT('Speel met deze regels', 'Gratis in je browser')}
`,
    faq: [
      ['Hoeveel is drie dezelfde waard bij Farkle?', `De waarde × 100 (drie 4-en = 400), behalve drie enen: ${nb(kindValue(1, 3))} punten. Elke extra gelijke steen verdubbelt.`],
      ['Wat is een farkle?', 'Een worp zonder scorende stenen. Je verliest alle punten van die beurt, en de volgende is aan de beurt.'],
      ['Wat zijn hot dice?', 'Als alle zes de stenen in een beurt scorend apart liggen: je mag alle zes opnieuw gooien en verder bouwen.'],
      ['Heb je een minimumscore nodig?', 'In De Hoveling niet: je mag vanaf je eerste beurt vastzetten, zelfs 50 punten. Sommige huisregels vragen er meer.'],
      ['Tellen drie paren?', 'Hier niet: alleen de enen en vijven van zo’n worp scoren.'],
      ['Krijgen de anderen nog een laatste beurt?', 'Nee: wie het doel als eerste haalt bij het vastzetten, wint meteen.'],
    ],
    related: ['farkle-online-spelen', 'kingdom-come-deliverance-2-dobbelspel', 'online-dobbelspel-met-vrienden'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCT, slug: 'kingdom-come-deliverance-2-dobbelspel', nav: 'KCD2-dobbelspel', short: 'KCD2-dobbelspel met vrienden', parent: 'farkle-online-spelen',
    blurb: 'Het traditionele spel achter het dobbelen in de herberg: wat hetzelfde is, wat niet, en waar je samen speelt.',
    title: 'KCD2 dobbelspel met vrienden: het traditionele spel online',
    description: 'Het dobbelspel uit Kingdom Come: Deliverance 2 met vrienden spelen? Speel de traditionele versie, Farkle, gratis online. Onafhankelijke website.',
    h1: 'Het dobbelspel uit Kingdom Come: Deliverance 2, online met vrienden',
    lead: `Het dobbelen in <i>Kingdom Come: Deliverance 2</i> is gebaseerd op een traditioneel spel met zes stenen, bekend als <b>Farkle</b> of <b>Tienduizend</b>. Dat oude spel speel je online met vrienden, gratis, op 421online.com. Dit is <b>geen officiële versie</b> van het videospel en ook niet het videospel zelf.`,
    body: `
${indep}
${H.toc('Inhoud', [['basis', 'De basisregels'], ['anders', 'Wat het videospel toevoegt'], ['spelen', 'Spelen met vrienden']])}

<h2 id="basis">De basisregels</h2>
<p>Net als in het traditionele spel: gooi zes stenen, leg minstens één scorende steen apart, gooi dan de rest opnieuw of zet je punten vast. Een worp zonder punten kost je de punten van de beurt. Liggen alle zes apart, dan mag je alle zes opnieuw gooien.</p>
<p>De gebruikelijke telling: een 1 is 100 punten, een 5 is 50, drie dezelfde is de waarde × 100 (drie enen: ${nb(kindValue(1, 3))}), elke extra gelijke steen verdubbelt, straten zijn 500 (1 tot 5), 750 (2 tot 6) en ${nb(1500)} (1 tot 6) waard. Alle combinaties staan bij de <a href="/farkle-spelregels">Farkle-spelregels</a>. Details kunnen per versie verschillen; op 421online wint wie als eerste het doel haalt bij het vastzetten.</p>

<h2 id="anders">Wat het videospel toevoegt</h2>
<p>In het videospel hoort het dobbelen bij een rollenspelwereld: er komen <b>weddenschappen</b> in spelgeld bij, <b>speciale stenen</b> die anders rollen dan gewone, en <b>verzamelobjecten</b> met eigen effecten. Dat alles zit niet in De Hoveling: daar rollen zes gewone, eerlijke stenen. Je kunt speelgeld inzetten, nooit echt geld.</p>

<h2 id="spelen">Spelen met vrienden</h2>
<p>Zin in een potje dobbelen zonder het videospel te starten, of wil je het laten zien aan vrienden die het niet hebben? Op <a href="${P.courtisan}" data-play>421online.com</a> speel je Farkle met De Hoveling:</p>
<ul>
<li><b>gratis</b>, zonder reclame of aankopen, in de browser van gsm of computer;</li>
<li><b>online met vrienden</b>, 2 tot 6 spelers aan een tafel met code of link;</li>
<li><b>tegen de computer</b>, 1 tot 3 tegenstanders op drie niveaus;</li>
<li>tot <b>${targetsText} punten</b>, afhankelijk van hoeveel tijd je hebt.</li>
</ul>
${playCT('Speel het traditionele spel', 'Farkle met vrienden, gratis in je browser')}
`,
    faq: [
      ['Is het KCD2-dobbelspel hetzelfde als Farkle?', 'Het is gebaseerd op het traditionele Farkle en gebruikt de basisregels ervan, met eigen toevoegingen. Het is niet precies hetzelfde spel.'],
      ['Kan ik het KCD2-dobbelspel online met vrienden spelen?', 'De traditionele versie wel: open in De Hoveling een tafel en stuur je vrienden de code, voor 2 tot 6 spelers. Het videospel zelf is singleplayer.'],
      ['Is dit een officieel Kingdom Come-spel?', 'Nee. 421online.com is een onafhankelijke website, niet verbonden aan Warhorse Studios, Deep Silver of Plaion. Het gaat om het traditionele spel dat het videospel heeft geïnspireerd.'],
      ['Zitten de speciale stenen uit het videospel erin?', 'Nee. De Hoveling gebruikt zes gewone, eerlijke stenen en geen objecten met effecten.'],
    ],
    related: ['farkle-online-spelen', 'farkle-spelregels', 'online-dobbelspel-met-vrienden'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCF, slug: 'coups-fourres-kaart-dobbelspel', nav: 'Coups Fourrés', short: 'Coups Fourrés: kaart- en dobbelspel',
    blurb: 'Een duel met dobbelstenen en kaarten: deck van 20, vallen en bluf. Gratis in je browser.',
    title: 'Coups Fourrés: gratis kaart- en dobbelspel in je browser',
    description: `Coups Fourrés combineert het dobbelspel 421 met een verzamelkaartspel: ${CARDS.length} kaarten, vallen en bluf in een kort duel. Gratis, zonder download.`,
    h1: 'Coups Fourrés: 421 met kaarten',
    lead: `<b>Coups Fourrés</b> (Frans voor „vuile streken”) is 421 als duel, met een <b>deck van ${R.deckSize} kaarten</b> achter de hand: gooi een steen opnieuw, zet een val of draai alles om op het laatste moment. Een gratis strategie- en blufspel in je browser, zonder download.`,
    body: `
${playCF('Gratis spelen', 'Zonder download of inschrijving, begeleid potje van 3 minuten')}
${H.toc('Inhoud', [['idee', 'Het idee'], ['ronde', 'Een ronde'], ['typen', 'Vijf soorten kaarten'], ['families', 'Vier kaartfamilies'], ['manieren', 'Manieren om te spelen'], ['verzamelen', 'Verzamelen en decks']])}

<h2 id="idee">Het idee</h2>
<ul>
<li>Iedereen start met <b>${R.startTokens} fiches</b>. Wie als eerste geen fiches meer heeft, wint.</li>
<li>Elke ronde gooi je <b>tot ${R.maxThrows} keer met drie stenen</b>, met de combinaties van <a href="/421-dobbelspel-regels">421</a>.</li>
<li>De beste combinatie wint de ronde, en die speler <b>geeft de verliezer</b> zoveel fiches als ze waard is.</li>
<li>Tussen de worpen speel je kaarten en betaal je met <b>Biertjes</b> („rondjes”, het kleingeld van elk potje): ${R.tourneesPerRound} per ronde, ${R.tourneesPerRound + R.tourneesLoserBonus} voor wie net verloren heeft.</li>
<li>Je ziet de Biertjes, het aantal kaarten en de vallen van je tegenstander… maar niet welke vallen. Daar begint de bluf.</li>
</ul>

<h2 id="ronde">Een ronde</h2>
<ol class="steps">
<li><b>Uitschenken</b>: iedereen trekt een kaart en krijgt Biertjes (hoogstens ${R.tourneesMax} in voorraad).</li>
<li><b>De voorspeler</b> (verliezer van de vorige ronde) gooit en speelt kaarten. Zijn aantal worpen is de grens voor de ander.</li>
<li><b>De andere speler</b> is aan de beurt en kent de combinatie die hij moet verslaan.</li>
<li><b>Laatste woord</b>: beide combinaties liggen op tafel, en wie op dat moment verliest, mag nog een „laatste woord”-kaart spelen.</li>
<li><b>Afrekening</b>: de winnaar geeft de verliezer fiches, kaarten inbegrepen.</li>
</ol>
<p>Alle regels staan op de pagina <a href="/coups-fourres-spelregels">Coups Fourrés spelregels</a>.</p>

<h2 id="typen">Vijf soorten kaarten</h2>
<div class="table-wrap"><table>
<thead><tr><th>Soort</th><th>Wanneer je ze speelt</th></tr></thead>
<tbody>
<tr><td><b>Zet</b></td><td>In je beurt, voor of na een worp, en dan afgelegd.</td></tr>
<tr><td><b>Val</b></td><td>Gedekt gelegd in je beurt; ze gaat vanzelf af als aan haar voorwaarde is voldaan.</td></tr>
<tr><td><b>Repliek</b></td><td>Altijd, als antwoord op een kaart van de tegenstander.</td></tr>
<tr><td><b>Laatste woord</b></td><td>Alleen in de stap „laatste woord”, vlak voor de afrekening.</td></tr>
<tr><td><b>Stamgast</b></td><td>In je beurt; een stamgast blijft ${R.habitueRounds} rondes voor je liggen (hoogstens ${R.maxHabitues}).</td></tr>
</tbody></table></div>

<h2 id="families">Vier kaartfamilies</h2>
<p>De ${CARDS.length} kaarten horen bij vier families: <b>Stamgasten</b> brengen bondgenoten en extra Biertjes, <b>Dronkenschap</b>-kaarten laten stenen draaien en brengen die van de tegenstander in de war, <b>Vallen</b> worden gedekt gelegd, en <b>Kettingen</b> combineren trekken, kortingen en steeds sterkere antwoorden. Een deck heeft hoogstens ${DECK_RULES.maxFamilies} families, en de families van de tegenstander zijn vanaf het begin zichtbaar.</p>

<h2 id="manieren">Manieren om te spelen</h2>
<div class="cards">
<section class="card"><h3>Begeleid potje</h3><p>Drie minuten tegen de computer, stap voor stap.</p></section>
<section class="card"><h3>Tegen de computer</h3><p>Drie tegenstanders van toenemende sterkte, ook zonder account.</p></section>
<section class="card"><h3>Met vrienden</h3><p>Een tafel met code voor 2 tot 4 spelers (gratis account).</p></section>
<section class="card"><h3>Ranked en toernooi</h3><p>Ranked duels in een maandelijkse liga en elke zaterdag om 20:40 (Brusselse tijd) een gratis afvaltoernooi.</p></section>
</div>

<h2 id="verzamelen">Verzamelen en decks</h2>
<p>Coups Fourrés is ook een klein verzamelkaartspel: boosters bevatten willekeurige kaarten en open je met <b>capsules</b> die je verdient door te spelen. <b>Je kunt ze niet kopen</b>, en er valt niets te betalen. Je bouwt tot 5 decks, of laat het spel er een maken uit je collectie.</p>
${playCF('Speel Coups Fourrés gratis', 'In je browser, met een begeleid potje van 3 minuten')}
`,
    faq: [
      ['Is Coups Fourrés gratis?', 'Ja. Capsules verdien je door te spelen en zijn niet te koop, en er is geen reclame of abonnement.'],
      ['Moet ik 421 kennen?', 'Nee. Het begeleide potje legt de stenen en de kaarten in drie minuten uit.'],
      ['Met hoeveel spelers?', 'Een duel tegen de computer, in ranked of in een toernooi; 2 tot 4 aan een tafel met vrienden.'],
      ['Hoe lang duurt een potje?', `Een duel duurt enkele minuten en nooit langer dan ${R.maxRounds} rondes.`],
    ],
    related: ['coups-fourres-spelregels', '421-dobbelspel-online', 'online-dobbelspel-met-vrienden'],
  },
  // ---------------------------------------------------------------------------------------------
  {
    ...baseCF, slug: 'coups-fourres-spelregels', nav: 'Regels CF', short: 'Coups Fourrés spelregels', parent: 'coups-fourres-kaart-dobbelspel',
    blurb: 'Opstelling, rondes, Biertjes, soorten kaarten, vallen en spellen met 3 of 4.',
    title: 'Coups Fourrés spelregels: rondes, kaarten, vallen en fiches',
    description: 'De regels van Coups Fourrés: opstelling, een ronde stap voor stap, combinaties, Biertjes, de vijf soorten kaarten, vallen en spellen met 3 of 4 spelers.',
    h1: 'De spelregels van Coups Fourrés',
    lead: `Coups Fourrés gebruikt de stenen en de combinaties van 421 en voegt een deck van ${R.deckSize} kaarten per speler toe. Het spel past alle regels voor je toe; hier vind je de details.`,
    body: `
${H.toc('Inhoud', [['doel', 'Het doel'], ['opstelling', 'Opstelling'], ['ronde', 'Een ronde'], ['combos', 'De combinaties'], ['tournees', 'Biertjes'], ['kaarten', 'Vallen, stamgasten en ripostes'], ['einde', 'Einde van het spel'], ['meer', 'Met 3 of 4 spelers'], ['deck', 'Een deck bouwen']])}

<h2 id="doel">Het doel</h2>
<p>Je speelt 421 enkel met lossen: iedereen start met <b>${R.startTokens} fiches</b> (${R.startTokensMulti} met 3 of 4 spelers). Wie als eerste geen fiches meer heeft, wint het spel.</p>

<h2 id="opstelling">Opstelling</h2>
<p>Iedereen schudt een deck van ${R.deckSize} kaarten en trekt er ${R.startHand}. Eén keer mag je tot ${R.mulligan} kaarten onder je deck leggen en evenveel kaarten bijtrekken. De eerste voorspeler wordt geloot.</p>

<h2 id="ronde">Een ronde</h2>
<ol class="steps">
<li><b>Uitschenken</b>: trek 1 kaart en krijg ${R.tourneesPerRound} Biertje (${R.tourneesPerRound + R.tourneesLoserBonus} voor de verliezer van de vorige ronde). Je kunt er tot ${R.tourneesMax} sparen.</li>
<li><b>Bestelling aan de toog</b>: een willekeurige bonusregel geldt voor iedereen in die ronde.</li>
<li><b>Beurt van de voorspeler</b>: gooi tot ${R.maxThrows} keer, houd stenen tussen de worpen en stop wanneer je wilt. Kaarten mogen voor of na elke worp gespeeld worden. Het aantal worpen is de grens voor de ander.</li>
<li><b>Beurt van de ander</b>, binnen die grens, met zicht op het resultaat van de voorspeler.</li>
<li><b>Laatste woord</b>: wie op dat moment verliest, mag een „laatste woord”-kaart spelen, de ander mag antwoorden, tot beiden passen.</li>
<li><b>Afrekening</b>: de winnaar geeft de verliezer zoveel fiches als zijn combinatie waard is, kaarten inbegrepen. Bij een volledig gelijkspel geeft niemand iets.</li>
<li>De verliezer begint de volgende ronde.</li>
</ol>

<h2 id="combos">De combinaties</h2>
<p>Dezelfde als bij 421, van de beste naar de slechtste:</p>
${combosTable(L421, H.dice)}

<h2 id="tournees">Biertjes</h2>
<p>Biertjes betalen de kaarten: het cijfer in het glaasje op elke kaart is de kostprijs. Je krijgt ze bij elke ronde, en de Biertjes van elke speler zijn <b>voor iedereen zichtbaar</b>. Een tegenstander zonder Biertjes kan bijna niets spelen, en iemand met vier of meer plant misschien iets groots.</p>

<h2 id="kaarten">Vallen, stamgasten en ripostes</h2>
<ul>
<li><b>Vallen</b>: hoogstens ${R.maxTrapsOn} voor een speler, hoogstens ${R.maxTraps} per speler gelegd. Je ziet hoeveel er liggen, nooit welke. Een val die na ${R.trapReturnRounds} rondes niet is afgegaan, keert terug naar de hand van de eigenaar.</li>
<li><b>Stamgasten</b>: hoogstens ${R.maxHabitues} in het spel, elk voor ${R.habitueRounds} rondes, tenzij ze weggejaagd worden.</li>
<li><b>Ripostes</b>: als meerdere kaarten elkaar beantwoorden, werkt de laatst gespeelde als eerste.</li>
</ul>

<h2 id="einde">Einde van het spel</h2>
<ul>
<li>Zodra iemand geen fiches meer heeft, wint die speler.</li>
<li>Duurt het spel lang, dan sluit het café na ronde <b>${R.maxRounds}</b>: wie de minste fiches heeft, wint.</li>
<li>Leeg deck: schud je aflegstapel opnieuw en neem ${R.reshufflePenalty} fiche.</li>
<li>Je hebt ${R.decisionSeconds} seconden per beslissing, en ${R.reserveSeconds} seconden reserve voor het hele spel. In ranked telt weggaan als verlies; na een verbroken verbinding heb je 60 seconden om terug te komen.</li>
</ul>

<h2 id="meer">Met 3 of 4 spelers</h2>
<p>Aan een tafel met code: ${R.startTokensMulti} fiches per speler. Wie als eerste 0 fiches heeft, wint en het spel stopt. <b>Alleen de slechtste combinatie van de ronde krijgt fiches</b>, van de beste, net als bij 421. Vallen liggen zichtbaar voor een gekozen speler.</p>

<h2 id="deck">Een deck bouwen</h2>
<p>Een deck heeft precies <b>${R.deckSize} kaarten</b>: hoogstens ${R.maxCopies} exemplaren per kaart, <b>hoogstens ${DECK_RULES.maxFamilies} families</b> en <b>één legendarische kaart</b>. Je kunt tot 5 decks bewaren.</p>
${playCF('Probeer Coups Fourrés', 'Het begeleide potje legt de regels uit')}
`,
    faq: [
      ['Met hoeveel fiches begin je?', `${R.startTokens} in een duel, ${R.startTokensMulti} met 3 of 4 spelers. Wie als eerste geen fiches meer heeft, wint.`],
      ['Hoeveel kaarten zitten er in een deck?', `Precies ${R.deckSize}, hoogstens ${R.maxCopies} exemplaren per kaart, hoogstens ${DECK_RULES.maxFamilies} families en één legendarische kaart.`],
      ['Zie je de vallen van je tegenstander?', 'Je ziet hoeveel er liggen, maar niet welke.'],
      ['Wat gebeurt er bij gelijkspel?', 'Bij een volledig gelijkspel tussen de twee combinaties geeft niemand fiches.'],
    ],
    related: ['coups-fourres-kaart-dobbelspel', '421-dobbelspel-regels', '421-dobbelspel-online'],
  },
];
