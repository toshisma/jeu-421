/**
 * « Le 421 en chiffres » (fr, en, de, nl) : gabarits des pages de statistiques, utilisés par build-seo.mjs.
 * Le serveur (server/chiffres.ts) remplace le bloc <!--CHIFFRES:START--> … <!--CHIFFRES:END--> par les vrais
 * chiffres agrégés de la base (recalculés toutes les heures) : rien n'est écrit ici à la main.
 * Les adresses doivent rester celles de CHIFFRES_SLUGS (shared/chiffres.ts), vérifié par tests/chiffres.test.ts.
 */
export const CHIFFRES_SLUGS = { fr: 'le-421-en-chiffres', en: '421-dice-game-statistics', de: '421-wuerfelspiel-statistik', nl: '421-dobbelspel-statistieken' };
export const CHIFFRES_GROUP = { ...CHIFFRES_SLUGS };

const dates = { published: '2026-11-13', updated: '2026-11-13' };
const SLOT = (wait) => `<!--CHIFFRES:START-->\n<p>${wait}</p>\n<!--CHIFFRES:END-->`;

const T = {
  fr: {
    nav: 'En chiffres', short: 'Le 421 en chiffres', blurb: 'Parties jouées, fréquence réelle des combinaisons, barrages, heures de pointe : les vrais chiffres du site.',
    title: 'Le 421 en chiffres : parties jouées et fréquence réelle des combinaisons',
    description: 'Les statistiques réelles du 421 sur 421online : parties jouées, fréquence de chaque combinaison face à la probabilité exacte, barrages, heures de pointe.',
    h1: 'Le 421 en chiffres',
    lead: 'Combien de 4-2-1 sortent vraiment ? À quelle heure joue-t-on le plus ? Cette page publie les statistiques réelles de <a href="/" data-play>421online.com</a>, calculées automatiquement à partir des parties jouées sur le site. Uniquement des totaux : aucun joueur n’y est identifiable.',
    wait: 'Les chiffres sont calculés par le serveur du jeu.',
    methodH: 'D’où viennent ces chiffres', method: `<ul>
<li><b>Parties</b> : seules les parties réellement terminées sont comptées, une seule fois chacune.</li>
<li><b>Combinaisons</b> : en ligne, chaque dé est tiré au sort par le serveur avec une source de hasard cryptographique. Seuls les lancers des trois dés à la fois (aucun dé gardé) servent à la comparaison avec la théorie ; les probabilités exactes sont calculées sur les 216 tirages possibles, comme sur la page des <a href="/combinaisons-du-421">combinaisons du 421</a>.</li>
<li><b>Pays</b> : déduit sans adresse IP, d’après le fuseau horaire ou la langue de l’appareil ; un pays n’apparaît qu’au-delà d’un nombre minimal de joueurs.</li>
<li><b>Dates</b> : certains compteurs ont commencé plus tard que d’autres ; la date de départ de chacun est indiquée à côté.</li>
</ul>`,
    faq: [
      ['D’où viennent les chiffres du 421 en chiffres ?', 'Des parties jouées sur 421online.com, comptées par le serveur du jeu et recalculées automatiquement toutes les heures. Ce sont des totaux anonymes.'],
      ['Quelle est la probabilité de faire 421 en un lancer ?', 'Six tirages sur 216, soit 1 chance sur 36 (environ 2,8 %) pour un lancer des trois dés.'],
      ['Les dés du site sont-ils truqués ?', 'Non : en ligne, chaque dé est tiré au sort par le serveur. La fréquence réelle de chaque combinaison, publiée ici, se rapproche de la probabilité exacte à mesure que les lancers s’accumulent.'],
      ['Pourquoi certains chiffres commencent à une date récente ?', 'Parce qu’ils n’étaient pas enregistrés avant : la page le dit honnêtement en indiquant, pour chaque chiffre, la date de début du comptage.'],
    ],
    related: ['combinaisons-du-421', 'regles-du-421', 'strategie-421'],
    ds: { name: 'Statistiques de jeu de 421online', description: 'Statistiques agrégées et anonymes des parties jouées sur 421online.com : nombre de parties par jeu, fréquence observée de chaque combinaison du 421 comparée à sa probabilité exacte, barrages, heures de fin des parties, durée médiane et répartition des joueurs par pays.', vars: ['Parties terminées par jeu', 'Fréquence observée des combinaisons du 421', 'Probabilité exacte des combinaisons du 421', 'Nombre de barrages', 'Heure de fin des parties', 'Durée médiane d’une partie', 'Part des joueurs par pays'], technique: 'Comptage automatique par le serveur du jeu ; dés tirés par une source de hasard cryptographique ; probabilités calculées sur les 216 tirages possibles de trois dés.' },
  },
  en: {
    nav: 'Statistics', short: '421 in numbers', blurb: 'Games played, real frequency of each hand, tie-breaks, peak hours: the site’s real figures.',
    title: '421 Dice Game Statistics: Games Played and Real Hand Frequencies',
    description: 'Real statistics from 421online: games played, how often each 421 hand really comes up versus its exact probability, tie-breaks and peak hours.',
    h1: '421 dice game statistics',
    lead: 'How often does 4-2-1 really come up? When do people play the most? This page publishes the real statistics of <a href="/?lang=en" data-play>421online.com</a>, worked out automatically from games played on the site. Totals only: no player can be identified.',
    wait: 'The figures are computed by the game server.',
    methodH: 'Where these figures come from', method: `<ul>
<li><b>Games</b>: only games that actually finished are counted, each one once.</li>
<li><b>Hands</b>: online, every die is drawn by the server from a cryptographic source of randomness. Only rolls of all three dice at once (no die kept) are compared with theory; exact probabilities are worked out over the 216 possible rolls.</li>
<li><b>Countries</b>: worked out without IP addresses, from the device time zone or language; a country only appears above a minimum number of players.</li>
<li><b>Dates</b>: some counters started later than others; each one shows its start date.</li>
</ul>`,
    faq: [
      ['Where do these 421 statistics come from?', 'From games played on 421online.com, counted by the game server and recalculated automatically every hour. They are anonymous totals.'],
      ['What are the odds of rolling 4-2-1 in one throw?', 'Six rolls out of 216, i.e. 1 in 36 (about 2.8%) for a single throw of the three dice.'],
      ['Are the site’s dice rigged?', 'No: online, every die is drawn by the server. The real frequency of each hand, published here, gets closer to the exact probability as rolls add up.'],
    ],
    related: ['421-dice-game-rules', 'play-421-dice-game-online'],
    ds: { name: '421online game statistics', description: 'Aggregated, anonymous statistics of games played on 421online.com: games per game type, observed frequency of each 421 hand compared with its exact probability, tie-breaks, game end times, median game length and share of players by country.', vars: ['Finished games per game', 'Observed frequency of 421 hands', 'Exact probability of 421 hands', 'Number of tie-breaks', 'Game end time', 'Median game length', 'Share of players by country'], technique: 'Automatic counting by the game server; dice drawn from a cryptographic source of randomness; probabilities computed over the 216 possible rolls of three dice.' },
  },
  de: {
    nav: 'Statistik', short: '421 in Zahlen', blurb: 'Gespielte Partien, echte Häufigkeit jeder Kombination, Stechen, Stoßzeiten: die echten Zahlen der Seite.',
    title: '421 Würfelspiel Statistik: Partien und echte Häufigkeiten',
    description: 'Echte Statistik von 421online: gespielte Partien, wie oft jede 421-Kombination wirklich fällt im Vergleich zur exakten Wahrscheinlichkeit, Stoßzeiten.',
    h1: '421 Würfelspiel in Zahlen',
    lead: 'Wie oft fällt die 4-2-1 wirklich? Wann wird am meisten gespielt? Diese Seite veröffentlicht die echte Statistik von <a href="/?lang=de" data-play>421online.com</a>, automatisch aus den Partien auf der Seite berechnet. Nur Summen: Kein Spieler ist erkennbar.',
    wait: 'Die Zahlen werden vom Spielserver berechnet.',
    methodH: 'Woher die Zahlen kommen', method: `<ul>
<li><b>Partien</b>: Gezählt werden nur wirklich beendete Partien, jede genau einmal.</li>
<li><b>Kombinationen</b>: Online wird jeder Würfel vom Server mit einer kryptografischen Zufallsquelle ausgelost. Mit der Theorie verglichen werden nur Würfe aller drei Würfel (keiner behalten); die exakten Wahrscheinlichkeiten sind über die 216 möglichen Würfe berechnet.</li>
<li><b>Länder</b>: ohne IP-Adresse ermittelt, aus Zeitzone oder Sprache des Geräts; ein Land erscheint erst ab einer Mindestzahl an Spielern.</li>
<li><b>Daten</b>: Manche Zähler laufen erst seit Kurzem; bei jedem steht das Startdatum.</li>
</ul>`,
    faq: [
      ['Woher stammen diese 421-Zahlen?', 'Aus den Partien auf 421online.com, vom Spielserver gezählt und jede Stunde automatisch neu berechnet. Es sind anonyme Summen.'],
      ['Wie wahrscheinlich ist eine 4-2-1 mit einem Wurf?', 'Sechs von 216 Würfen, also 1 zu 36 (etwa 2,8 %) bei einem Wurf mit drei Würfeln.'],
      ['Sind die Würfel der Seite gezinkt?', 'Nein: Online lost der Server jeden Würfel aus. Die hier veröffentlichte echte Häufigkeit jeder Kombination nähert sich mit jedem Wurf der exakten Wahrscheinlichkeit.'],
    ],
    related: ['421-wuerfelspiel-regeln', '421-wuerfelspiel-online'],
    ds: { name: '421online Spielstatistik', description: 'Zusammengefasste, anonyme Statistik der Partien auf 421online.com: Partien pro Spiel, beobachtete Häufigkeit jeder 421-Kombination im Vergleich zur exakten Wahrscheinlichkeit, Stechen, Endzeit der Partien, mittlere Spieldauer und Anteil der Spieler nach Land.', vars: ['Beendete Partien pro Spiel', 'Beobachtete Häufigkeit der 421-Kombinationen', 'Exakte Wahrscheinlichkeit der 421-Kombinationen', 'Anzahl der Stechen', 'Endzeit der Partien', 'Mittlere Spieldauer', 'Anteil der Spieler nach Land'], technique: 'Automatische Zählung durch den Spielserver; Würfel aus einer kryptografischen Zufallsquelle; Wahrscheinlichkeiten über die 216 möglichen Würfe mit drei Würfeln berechnet.' },
  },
  nl: {
    nav: 'Statistieken', short: '421 in cijfers', blurb: 'Gespeelde potjes, echte frequentie van elke combinatie, herworpen, piekuren: de echte cijfers van de site.',
    title: '421 dobbelspel statistieken: potjes en echte frequenties',
    description: 'Echte statistieken van 421online: gespeelde potjes, hoe vaak elke 421-combinatie echt valt tegenover de exacte kans, herworpen en piekuren.',
    h1: '421 dobbelspel in cijfers',
    lead: 'Hoe vaak valt 4-2-1 echt? Wanneer wordt er het meest gespeeld? Deze pagina publiceert de echte statistieken van <a href="/?lang=nl" data-play>421online.com</a>, automatisch berekend uit de potjes op de site. Alleen totalen: geen enkele speler is herkenbaar.',
    wait: 'De cijfers worden door de spelserver berekend.',
    methodH: 'Waar deze cijfers vandaan komen', method: `<ul>
<li><b>Potjes</b>: alleen echt afgemaakte potjes tellen, elk één keer.</li>
<li><b>Combinaties</b>: online wordt elke steen door de server geloot met een cryptografische bron van toeval. Alleen worpen met alle drie de stenen (geen enkele vastgehouden) worden met de theorie vergeleken; de exacte kansen zijn berekend over de 216 mogelijke worpen.</li>
<li><b>Landen</b>: bepaald zonder IP-adres, uit de tijdzone of taal van het toestel; een land verschijnt pas vanaf een minimum aantal spelers.</li>
<li><b>Data</b>: sommige tellers zijn later begonnen dan andere; bij elke teller staat de startdatum.</li>
</ul>`,
    faq: [
      ['Waar komen deze 421-cijfers vandaan?', 'Uit de potjes op 421online.com, geteld door de spelserver en elk uur automatisch herberekend. Het zijn anonieme totalen.'],
      ['Hoe groot is de kans op 4-2-1 in één worp?', 'Zes worpen op 216, dus 1 op 36 (ongeveer 2,8 %) voor één worp met drie stenen.'],
      ['Zijn de stenen van de site vervalst?', 'Nee: online loot de server elke steen. De echte frequentie van elke combinatie, hier gepubliceerd, komt dichter bij de exacte kans naarmate er meer worpen zijn.'],
    ],
    related: ['421-dobbelspel-regels', '421-dobbelspel-online'],
    ds: { name: '421online spelstatistieken', description: 'Samengevatte, anonieme statistieken van de potjes op 421online.com: potjes per spel, waargenomen frequentie van elke 421-combinatie tegenover de exacte kans, herworpen, eindtijd van de potjes, mediane speelduur en aandeel spelers per land.', vars: ['Afgemaakte potjes per spel', 'Waargenomen frequentie van 421-combinaties', 'Exacte kans van 421-combinaties', 'Aantal herworpen', 'Eindtijd van de potjes', 'Mediane speelduur', 'Aandeel spelers per land'], technique: 'Automatische telling door de spelserver; stenen geloot met een cryptografische bron van toeval; kansen berekend over de 216 mogelijke worpen met drie stenen.' },
  },
};

const page = (lang) => {
  const L = T[lang];
  return {
    ...dates, ...(lang === 'fr' ? {} : { lang, play: `/?jouer=1&amp;lang=${lang}` }), slug: CHIFFRES_SLUGS[lang], noNav: true,
    nav: L.nav, short: L.short, blurb: L.blurb, title: L.title, description: L.description, h1: L.h1, lead: L.lead,
    body: `
${SLOT(L.wait)}

<h2 id="methode">${L.methodH}</h2>
${L.method}
`,
    faq: L.faq, related: L.related, dataset: L.ds,
  };
};

export const chiffresPageFr = page('fr');
export const chiffresPagesI18n = { en: page('en'), de: page('de'), nl: page('nl') };
