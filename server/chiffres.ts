/**
 * « Le 421 en chiffres » : page publique de statistiques agrégées, servie en HTML complet (lisible par
 * les moteurs de recherche sans JavaScript), à /le-421-en-chiffres (et en, de, nl).
 *
 * Gabarit : la page générée par scripts/build-seo.mjs (même en-tête, navigation, pied de page et JSON-LD
 * que les pages d'aide). Le serveur remplace le bloc entre <!--CHIFFRES:START--> et <!--CHIFFRES:END-->
 * par les chiffres du moment, et les dates (mise à jour, période couverte). Recalcul au plus une fois par heure.
 *
 * Confidentialité : uniquement des totaux. Aucun pseudo, aucun identifiant, aucune adresse ; les pays ne
 * sont montrés qu'au-delà d'un nombre minimal de joueurs (CHIFFRES_MIN), les autres sont regroupés.
 *
 * Données :
 *  - parties du 421 : games_log (parties réellement terminées, voir server/stats.ts) ;
 *  - Coups Fourrés : cf_stat_games (server/cf-stats.ts) ;
 *  - Courtisan et Poker menteur en ligne, lancers du 421 en ligne (dés tirés par le serveur), barrages :
 *    compteurs anonymes par jour enregistrés ICI (table pub_counts, record dans pub_records), depuis la
 *    date notée dans meta `pub_since` (première mise en service) ;
 *  - pays des joueurs : visites (pays déduit sans adresse IP, voir shared/geo.ts) des visiteurs qui ont lancé
 *    au moins une partie (visit_events first_play / first_roll), conservées un an.
 */
import type { Express, Request, Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { DatabaseSync } from 'node:sqlite';
import type { Store } from './db';
import type { ComboKind } from '../shared/combos';
import type { GameState, RollRecord } from '../shared/engine';
import { CHIFFRES_MIN, CHIFFRES_SLUGS, ROLL_KINDS, theoreticalKinds, type ChiffresLang } from '../shared/chiffres';
import { brusselsDay } from './stats';

const ready = new WeakSet<DatabaseSync>();
function ensure(store: Store): DatabaseSync {
  const db = store.sqlite;
  if (ready.has(db)) return db;
  db.exec(`
    -- Statistiques publiques (page « Le 421 en chiffres ») : compteurs anonymes par jour, aucun joueur.
    CREATE TABLE IF NOT EXISTS pub_counts (day TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, key));
    CREATE TABLE IF NOT EXISTS pub_records (key TEXT PRIMARY KEY, value INTEGER NOT NULL, day TEXT NOT NULL);
  `);
  if (!store.getMeta('pub_since')) store.setMeta('pub_since', brusselsDay(Date.now()));
  ready.add(db);
  return db;
}
function bump(store: Store, key: string, n = 1, at = Date.now()) {
  try {
    ensure(store).prepare('INSERT INTO pub_counts (day, key, n) VALUES (?, ?, ?) ON CONFLICT(day, key) DO UPDATE SET n = n + excluded.n').run(brusselsDay(at), key, n);
  } catch { /* une statistique ne doit jamais gêner une partie */ }
}

/** Partie en ligne terminée du Courtisan ou du Poker menteur (appelé par leurs serveurs). */
export function noteOnlineGame(store: Store, game: 'courtisan' | 'poker') { bump(store, `game:${game}`); }

/** Suite de barrages en cours, par table (mémoire seulement). */
const chains = new Map<string, { seq: number; round: number; n: number }>();
/**
 * Après chaque action d'une partie de 421 en ligne : lancer complet (trois dés lancés, aucun gardé, donc
 * tiré au hasard par le serveur) → compté par famille ; barrages → nombre et plus longue suite dans une manche.
 */
export function noteAction(store: Store, table: string, roll: RollRecord | undefined, g: GameState) {
  try {
    if (roll && roll.kept.every((k) => !k)) bump(store, `roll:${roll.combo.kind}`);
    const sm = g.lastSummary;
    const c = chains.get(table) ?? { seq: -1, round: -1, n: 0 };
    if (sm && sm.seq !== c.seq) {
      c.seq = sm.seq;
      if (sm.barrage) {
        c.n = c.round === sm.round ? c.n + 1 : 1;
        c.round = sm.round;
        bump(store, 'barrage');
        const db = ensure(store);
        const best = (db.prepare("SELECT value FROM pub_records WHERE key = 'barrage_chain'").get() as { value: number } | undefined)?.value ?? 0;
        if (c.n > best) db.prepare("INSERT OR REPLACE INTO pub_records (key, value, day) VALUES ('barrage_chain', ?, ?)").run(c.n, brusselsDay(Date.now()));
      } else c.n = 0;
    }
    if (g.phase === 'fini') chains.delete(table);
    else { if (chains.size > 3000) chains.clear(); chains.set(table, c); }
  } catch { /* jamais bloquant */ }
}

// --- Calcul -------------------------------------------------------------------------------------

export interface GameCount { total: number; since: string | null }
export interface ChiffresData {
  day: string;
  games: { k421: GameCount & { online: number; solo: number }; cf: GameCount; courtisan: GameCount; poker: GameCount };
  rolls: { total: number; since: string; byKind: Record<ComboKind, number> };
  barrage: { total: number; since: string; longest: number; longestDay: string | null };
  hours: { total: number; since: string | null; byHour: number[] } | null;
  durations: { onlineMedian: number | null; soloMedian: number | null; onlineGames: number; soloGames: number; avgTable: number | null; since: string | null };
  countries: { total: number; since: string | null; rows: { code: string; share: number }[]; othersShare: number } | null;
}

const one = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T | undefined => {
  try { return db.prepare(sql).get(...args) as T | undefined; } catch { return undefined; }
};
const all = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T[] => {
  try { return db.prepare(sql).all(...args) as T[]; } catch { return []; }
};
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', hourCycle: 'h23' });

export function computeChiffres(store: Store, now = Date.now()): ChiffresData {
  const db = ensure(store);
  const pubSince = store.getMeta('pub_since') ?? brusselsDay(now);
  const count = (key: string) => one<{ n: number }>(db, 'SELECT COALESCE(SUM(n), 0) AS n FROM pub_counts WHERE key = ?', key)?.n ?? 0;

  const g = one<{ n: number; online: number; solo: number; since: string | null }>(db, `SELECT COUNT(*) AS n, COALESCE(SUM(mode = 'online'), 0) AS online,
    COALESCE(SUM(mode = 'solo'), 0) AS solo, MIN(day) AS since FROM games_log`) ?? { n: 0, online: 0, solo: 0, since: null };
  const cf = one<{ n: number; at: number | null }>(db, 'SELECT COUNT(*) AS n, MIN(at) AS at FROM cf_stat_games') ?? { n: 0, at: null };

  const byKind = Object.fromEntries(ROLL_KINDS.map((k) => [k, count(`roll:${k}`)])) as Record<ComboKind, number>;
  const rollsTotal = ROLL_KINDS.reduce((s, k) => s + byKind[k], 0);
  const longest = one<{ value: number; day: string }>(db, "SELECT value, day FROM pub_records WHERE key = 'barrage_chain'");

  // Heures de pointe (fin de partie, heure de Bruxelles) : décalage horaire calculé une fois par jour.
  let hours: ChiffresData['hours'] = null;
  if (g.n >= CHIFFRES_MIN.hours) {
    const byHour = new Array<number>(24).fill(0);
    const off = new Map<string, number>();
    for (const r of all<{ t: number; day: string }>(db, 'SELECT ended_at AS t, day FROM games_log')) {
      let o = off.get(r.day);
      if (o === undefined) { o = (Number(hourFmt.format(r.t)) - new Date(r.t).getUTCHours() + 24) % 24; off.set(r.day, o); }
      byHour[(new Date(r.t).getUTCHours() + o) % 24]++;
    }
    hours = { total: g.n, since: g.since, byHour };
  }

  const median = (mode: string, n: number) => (n >= CHIFFRES_MIN.durations
    ? one<{ d: number }>(db, 'SELECT duration_s AS d FROM games_log WHERE mode = ? ORDER BY duration_s LIMIT 1 OFFSET ?', mode, Math.floor(n / 2))?.d ?? null : null);
  const avgTable = g.online >= CHIFFRES_MIN.durations ? one<{ a: number }>(db, "SELECT AVG(humans + bots) AS a FROM games_log WHERE mode = 'online'")?.a ?? null : null;

  // Pays des joueurs (visiteurs ayant lancé une partie), dernier pays connu de chaque visiteur.
  let countries: ChiffresData['countries'] = null;
  const rows = all<{ c: string; n: number }>(db, `SELECT c, COUNT(*) AS n FROM (
      SELECT (SELECT x.country FROM visits x WHERE x.visitor = e.visitor AND x.country IS NOT NULL ORDER BY x.at DESC LIMIT 1) AS c
      FROM (SELECT DISTINCT visitor FROM visit_events WHERE kind IN ('first_play', 'first_roll')) e
    ) WHERE c IS NOT NULL GROUP BY c ORDER BY n DESC`);
  const known = rows.reduce((s, r) => s + r.n, 0);
  const shown = rows.filter((r) => /^[A-Z]{2}$/.test(r.c) && r.n >= CHIFFRES_MIN.countryPlayers);
  if (known >= CHIFFRES_MIN.countryTotal && shown.length >= CHIFFRES_MIN.countries) {
    const share = (n: number) => Math.round((1000 * n) / known) / 10;
    const list = shown.slice(0, 12).map((r) => ({ code: r.c, share: share(r.n) }));
    countries = {
      total: known, since: one<{ d: string }>(db, "SELECT MIN(day) AS d FROM visit_events WHERE kind IN ('first_play', 'first_roll')")?.d ?? null,
      rows: list, othersShare: Math.max(0, Math.round(10 * (100 - list.reduce((s, r) => s + r.share, 0))) / 10),
    };
  }

  return {
    day: brusselsDay(now),
    games: {
      k421: { total: g.n, online: g.online, solo: g.solo, since: g.since },
      cf: { total: cf.n, since: cf.at ? brusselsDay(cf.at) : null },
      courtisan: { total: count('game:courtisan'), since: pubSince },
      poker: { total: count('game:poker'), since: pubSince },
    },
    rolls: { total: rollsTotal, since: pubSince, byKind },
    barrage: { total: count('barrage'), since: pubSince, longest: longest?.value ?? 0, longestDay: longest?.day ?? null },
    hours,
    durations: { onlineMedian: median('online', g.online), soloMedian: median('solo', g.solo), onlineGames: g.online, soloGames: g.solo, avgTable, since: g.since },
    countries,
  };
}

// --- Rendu ---------------------------------------------------------------------------------------

const LOCALE: Record<ChiffresLang, string> = { fr: 'fr-BE', en: 'en-US', de: 'de-DE', nl: 'nl-BE' };
type Dict = {
  gamesH: string; game: string; games: string; since: string; g421: string; g421d: (o: string, s: string) => string; cf: string; ct: string; pk: string; onlineOnly: string;
  fewer: (n: string) => string; combosH: string; combosLead: (n: string, d: string) => string; combosWait: (n: string, d: string, min: string) => string;
  combo: string; seen: string; real: string; theory: string; kinds: Record<ComboKind, string>; combosNote: string;
  barrageH: string; barrage: (n: string, d: string) => string; longest: (n: string, d: string) => string; noBarrage: (d: string) => string;
  hoursH: string; hoursLead: (n: string, d: string) => string; peak: (list: string) => string; hour: (h: number) => string; wait: (min: string) => string;
  durH: string; durOnline: (m: string) => string; durSolo: (m: string) => string; table: (n: string) => string; min: (s: number) => string;
  countriesH: string; countriesLead: (n: string, d: string) => string; others: string; country: string; share: string; countriesWait: string;
  updated: (d: string) => string;
};
const plural = (n: number, a: string, b: string) => (n > 1 ? b : a);
const T: Record<ChiffresLang, Dict> = {
  fr: {
    gamesH: 'Parties jouées', game: 'Jeu', games: 'Parties terminées', since: 'Comptées depuis le', g421: 'Le 421', g421d: (o, s) => `dont ${o} en ligne et ${s} contre l’ordinateur`,
    cf: 'Coups Fourrés (le 421 aux cartes)', ct: 'Le Courtisan (Dix mille), en ligne', pk: 'Le Poker menteur, en ligne', onlineOnly: 'Pour le Courtisan et le Poker menteur, seules les parties en ligne (arbitrées par le serveur) sont comptées.',
    fewer: (n) => `moins de ${n}`, combosH: 'Les combinaisons : le hasard réel face à la théorie',
    combosLead: (n, d) => `${n} lancers des trois dés, tirés au sort par le serveur pendant les parties de 421 en ligne depuis le ${d}, comparés à la probabilité exacte (calculée sur les 216 tirages possibles). Seuls les lancers où aucun dé n’était gardé comptent : ce sont de vrais tirages de trois dés.`,
    combosWait: (n, d, m) => `Le comptage a commencé le ${d} : ${n} lancers pour l’instant. Le tableau des fréquences réelles s’affichera à partir de ${m} lancers ; en attendant, voici les probabilités exactes.`,
    combo: 'Combinaison', seen: 'Lancers', real: 'Fréquence réelle', theory: 'Probabilité exacte',
    kinds: { '421': '4-2-1', '111': 'Trois as', '11x': 'Deux as + un dé (6-1-1 … 2-1-1)', brelan: 'Brelan (2-2-2 … 6-6-6)', suite: 'Suite (3-2-1 … 6-5-4)', autre: 'Autres combinaisons', nenette: 'Nénette (2-2-1)' },
    combosNote: 'Plus il y a de lancers, plus la fréquence réelle se rapproche de la probabilité exacte : c’est la loi des grands nombres, et le signe que les dés du site ne favorisent personne.',
    barrageH: 'Les barrages', barrage: (n, d) => `${n} barrages joués en ligne depuis le ${d}.`, longest: (n, d) => `Record : ${n} barrages d’affilée dans une même manche (le ${d}).`, noBarrage: (d) => `Aucun barrage compté depuis le ${d} pour l’instant.`,
    hoursH: 'Les heures de pointe', hoursLead: (n, d) => `Heure de fin des ${n} parties de 421 terminées depuis le ${d} (heure de Bruxelles).`, peak: (l) => `Les heures les plus jouées : ${l}.`, hour: (h) => `${h} h`,
    wait: (m) => `Pas encore assez de parties pour être parlant (il en faut au moins ${m}).`,
    durH: 'La durée d’une partie', durOnline: (m) => `Partie de 421 en ligne : ${m} (durée médiane).`, durSolo: (m) => `Partie contre l’ordinateur : ${m} (durée médiane).`, table: (n) => `En moyenne, ${n} joueurs par table en ligne (ordinateurs compris).`,
    min: (s) => (s < 60 ? `${s} secondes` : `${Math.round(s / 60)} ${plural(Math.round(s / 60), 'minute', 'minutes')}`),
    countriesH: 'D’où viennent les joueurs', countriesLead: (n, d) => `Pays de ${n} visiteurs qui ont lancé au moins une partie depuis le ${d}, déduit sans adresse IP (fuseau horaire ou langue de l’appareil). Un pays n’apparaît qu’à partir de ${CHIFFRES_MIN.countryPlayers} joueurs.`,
    others: 'Autres pays', country: 'Pays', share: 'Part des joueurs', countriesWait: `Pas encore assez de joueurs pour une répartition par pays qui ait du sens (au moins ${CHIFFRES_MIN.countryTotal} joueurs et ${CHIFFRES_MIN.countries} pays).`,
    updated: (d) => `Chiffres recalculés automatiquement toutes les heures ; dernier calcul le ${d}.`,
  },
  en: {
    gamesH: 'Games played', game: 'Game', games: 'Finished games', since: 'Counted since', g421: '421', g421d: (o, s) => `including ${o} online and ${s} against the computer`,
    cf: 'Coups Fourrés (421 with cards)', ct: 'The Courtier (Farkle), online', pk: 'Poker menteur (liar’s dice), online', onlineOnly: 'For The Courtier and Poker menteur, only online games (refereed by the server) are counted.',
    fewer: (n) => `fewer than ${n}`, combosH: 'Dice combinations: real luck versus theory',
    combosLead: (n, d) => `${n} rolls of the three dice, drawn by the server during online 421 games since ${d}, compared with the exact probability (worked out over the 216 possible rolls). Only rolls where no die was kept are counted: they are true three-dice draws.`,
    combosWait: (n, d, m) => `Counting started on ${d}: ${n} rolls so far. The table of real frequencies will appear from ${m} rolls; meanwhile, here are the exact probabilities.`,
    combo: 'Combination', seen: 'Rolls', real: 'Real frequency', theory: 'Exact probability',
    kinds: { '421': '4-2-1', '111': 'Three aces', '11x': 'Two aces + one die (6-1-1 … 2-1-1)', brelan: 'Three of a kind (2-2-2 … 6-6-6)', suite: 'Straight (3-2-1 … 6-5-4)', autre: 'Other combinations', nenette: 'Nénette (2-2-1)' },
    combosNote: 'The more rolls there are, the closer the real frequency gets to the exact probability: that is the law of large numbers, and a sign that the site’s dice favour no one.',
    barrageH: 'Tie-breaks', barrage: (n, d) => `${n} tie-break rolls played online since ${d}.`, longest: (n, d) => `Record: ${n} tie-breaks in a row in a single round (on ${d}).`, noBarrage: (d) => `No tie-break counted since ${d} yet.`,
    hoursH: 'Peak hours', hoursLead: (n, d) => `End time of the ${n} games of 421 finished since ${d} (Brussels time).`, peak: (l) => `Busiest hours: ${l}.`, hour: (h) => `${h}:00`,
    wait: (m) => `Not enough games yet to say anything meaningful (at least ${m} needed).`,
    durH: 'How long a game lasts', durOnline: (m) => `Online game of 421: ${m} (median).`, durSolo: (m) => `Game against the computer: ${m} (median).`, table: (n) => `On average, ${n} players per online table (computers included).`,
    min: (s) => (s < 60 ? `${s} seconds` : `${Math.round(s / 60)} ${plural(Math.round(s / 60), 'minute', 'minutes')}`),
    countriesH: 'Where players come from', countriesLead: (n, d) => `Country of ${n} visitors who started at least one game since ${d}, worked out without IP addresses (device time zone or language). A country only appears from ${CHIFFRES_MIN.countryPlayers} players.`,
    others: 'Other countries', country: 'Country', share: 'Share of players', countriesWait: `Not enough players yet for a meaningful breakdown by country (at least ${CHIFFRES_MIN.countryTotal} players and ${CHIFFRES_MIN.countries} countries).`,
    updated: (d) => `Figures recalculated automatically every hour; last update on ${d}.`,
  },
  de: {
    gamesH: 'Gespielte Partien', game: 'Spiel', games: 'Beendete Partien', since: 'Gezählt seit', g421: '421', g421d: (o, s) => `davon ${o} online und ${s} gegen den Computer`,
    cf: 'Coups Fourrés (421 mit Karten)', ct: 'Der Höfling (Farkle), online', pk: 'Poker menteur (Lügenpoker), online', onlineOnly: 'Beim Höfling und beim Poker menteur werden nur Online-Partien gezählt (vom Server geleitet).',
    fewer: (n) => `weniger als ${n}`, combosH: 'Die Kombinationen: echter Zufall gegen Theorie',
    combosLead: (n, d) => `${n} Würfe der drei Würfel, vom Server während der Online-Partien 421 seit dem ${d} ausgelost, verglichen mit der exakten Wahrscheinlichkeit (berechnet über die 216 möglichen Würfe). Gezählt werden nur Würfe, bei denen kein Würfel behalten wurde: echte Würfe mit drei Würfeln.`,
    combosWait: (n, d, m) => `Die Zählung läuft seit dem ${d}: bisher ${n} Würfe. Die Tabelle der echten Häufigkeiten erscheint ab ${m} Würfen; bis dahin die exakten Wahrscheinlichkeiten.`,
    combo: 'Kombination', seen: 'Würfe', real: 'Echte Häufigkeit', theory: 'Theorie (exakt)',
    kinds: { '421': '4-2-1', '111': 'Drei Asse', '11x': 'Zwei Asse + ein Würfel (6-1-1 … 2-1-1)', brelan: 'Drilling (2-2-2 … 6-6-6)', suite: 'Straße (3-2-1 … 6-5-4)', autre: 'Andere Kombinationen', nenette: 'Nénette (2-2-1)' },
    combosNote: 'Je mehr Würfe, desto näher kommt die echte Häufigkeit der exakten Wahrscheinlichkeit: das Gesetz der großen Zahlen – und ein Zeichen, dass die Würfel der Seite niemanden bevorzugen.',
    barrageH: 'Stechen', barrage: (n, d) => `${n} Stechen online gespielt seit dem ${d}.`, longest: (n, d) => `Rekord: ${n} Stechen hintereinander in einer Runde (am ${d}).`, noBarrage: (d) => `Seit dem ${d} noch kein Stechen gezählt.`,
    hoursH: 'Stoßzeiten', hoursLead: (n, d) => `Endzeit der ${n} Partien 421, die seit dem ${d} beendet wurden (Brüsseler Zeit).`, peak: (l) => `Meistgespielte Uhrzeiten: ${l}.`, hour: (h) => `${h} Uhr`,
    wait: (m) => `Noch nicht genug Partien für eine sinnvolle Aussage (mindestens ${m}).`,
    durH: 'Wie lange eine Partie dauert', durOnline: (m) => `Online-Partie 421: ${m} (Median).`, durSolo: (m) => `Partie gegen den Computer: ${m} (Median).`, table: (n) => `Im Schnitt ${n} Spieler pro Online-Tisch (Computer mitgezählt).`,
    min: (s) => (s < 60 ? `${s} Sekunden` : `${Math.round(s / 60)} ${plural(Math.round(s / 60), 'Minute', 'Minuten')}`),
    countriesH: 'Woher die Spieler kommen', countriesLead: (n, d) => `Land von ${n} Besuchern, die seit dem ${d} mindestens eine Partie gestartet haben, ohne IP-Adresse ermittelt (Zeitzone oder Sprache des Geräts). Ein Land erscheint erst ab ${CHIFFRES_MIN.countryPlayers} Spielern.`,
    others: 'Andere Länder', country: 'Land', share: 'Anteil der Spieler', countriesWait: `Noch nicht genug Spieler für eine sinnvolle Aufteilung nach Ländern (mindestens ${CHIFFRES_MIN.countryTotal} Spieler und ${CHIFFRES_MIN.countries} Länder).`,
    updated: (d) => `Zahlen werden stündlich automatisch neu berechnet; letzte Berechnung am ${d}.`,
  },
  nl: {
    gamesH: 'Gespeelde potjes', game: 'Spel', games: 'Afgemaakte potjes', since: 'Geteld sinds', g421: '421', g421d: (o, s) => `waarvan ${o} online en ${s} tegen de computer`,
    cf: 'Coups Fourrés (421 met kaarten)', ct: 'De Hoveling (Farkle), online', pk: 'Poker menteur (blufpoker), online', onlineOnly: 'Bij De Hoveling en Poker menteur tellen alleen online potjes (door de server geleid).',
    fewer: (n) => `minder dan ${n}`, combosH: 'De combinaties: echt toeval tegenover de theorie',
    combosLead: (n, d) => `${n} worpen met de drie stenen, door de server geloot tijdens online potjes 421 sinds ${d}, vergeleken met de exacte kans (berekend over de 216 mogelijke worpen). Alleen worpen waarbij geen steen werd vastgehouden tellen: echte worpen met drie stenen.`,
    combosWait: (n, d, m) => `De telling loopt sinds ${d}: tot nu toe ${n} worpen. De tabel met echte frequenties verschijnt vanaf ${m} worpen; intussen de exacte kansen.`,
    combo: 'Combinatie', seen: 'Worpen', real: 'Echte frequentie', theory: 'Exacte kans',
    kinds: { '421': '4-2-1', '111': 'Drie azen', '11x': 'Twee azen + één steen (6-1-1 … 2-1-1)', brelan: 'Drie gelijke (2-2-2 … 6-6-6)', suite: 'Straat (3-2-1 … 6-5-4)', autre: 'Andere combinaties', nenette: 'Nénette (2-2-1)' },
    combosNote: 'Hoe meer worpen, hoe dichter de echte frequentie bij de exacte kans komt: de wet van de grote aantallen, en een teken dat de stenen van de site niemand bevoordelen.',
    barrageH: 'Herworpen', barrage: (n, d) => `${n} herworpen online gespeeld sinds ${d}.`, longest: (n, d) => `Record: ${n} herworpen na elkaar in één ronde (op ${d}).`, noBarrage: (d) => `Sinds ${d} nog geen herworp geteld.`,
    hoursH: 'Piekuren', hoursLead: (n, d) => `Eindtijd van de ${n} potjes 421 die sinds ${d} zijn afgemaakt (Brusselse tijd).`, peak: (l) => `Drukste uren: ${l}.`, hour: (h) => `${h}.00 u`,
    wait: (m) => `Nog niet genoeg potjes om iets zinnigs te zeggen (minstens ${m}).`,
    durH: 'Hoe lang een potje duurt', durOnline: (m) => `Online potje 421: ${m} (mediaan).`, durSolo: (m) => `Potje tegen de computer: ${m} (mediaan).`, table: (n) => `Gemiddeld ${n} spelers per online tafel (computers meegeteld).`,
    min: (s) => (s < 60 ? `${s} seconden` : `${Math.round(s / 60)} ${plural(Math.round(s / 60), 'minuut', 'minuten')}`),
    countriesH: 'Waar de spelers vandaan komen', countriesLead: (n, d) => `Land van ${n} bezoekers die sinds ${d} minstens één potje zijn begonnen, bepaald zonder IP-adres (tijdzone of taal van het toestel). Een land verschijnt pas vanaf ${CHIFFRES_MIN.countryPlayers} spelers.`,
    others: 'Andere landen', country: 'Land', share: 'Aandeel spelers', countriesWait: `Nog niet genoeg spelers voor een zinvolle verdeling per land (minstens ${CHIFFRES_MIN.countryTotal} spelers en ${CHIFFRES_MIN.countries} landen).`,
    updated: (d) => `Cijfers worden elk uur automatisch herberekend; laatste berekening op ${d}.`,
  },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Bloc HTML des chiffres (inséré dans le gabarit de la page d'aide). Ne contient que des totaux. */
export function renderChiffres(d: ChiffresData, lang: ChiffresLang): string {
  const L = T[lang];
  const nb = (n: number) => n.toLocaleString(LOCALE[lang]);
  const pct = (p: number, digits = 1) => `${(100 * p).toLocaleString(LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`.replace(' %', lang === 'en' ? '%' : ' %');
  const date = (day: string | null) => (day ? new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
  const count = (n: number) => (n < CHIFFRES_MIN.games ? L.fewer(nb(CHIFFRES_MIN.games)) : nb(n));
  const th = theoreticalKinds();
  const out: string[] = [];

  // Parties
  const g = d.games;
  out.push(`<h2 id="parties">${L.gamesH}</h2>
<div class="table-wrap"><table>
<thead><tr><th>${L.game}</th><th>${L.games}</th><th>${L.since}</th></tr></thead>
<tbody>
<tr><td>${L.g421}${g.k421.total >= CHIFFRES_MIN.games ? `<br><small>${L.g421d(nb(g.k421.online), nb(g.k421.solo))}</small>` : ''}</td><td>${count(g.k421.total)}</td><td>${date(g.k421.since)}</td></tr>
<tr><td>${L.cf}</td><td>${count(g.cf.total)}</td><td>${date(g.cf.since)}</td></tr>
<tr><td>${L.ct}</td><td>${count(g.courtisan.total)}</td><td>${date(g.courtisan.since)}</td></tr>
<tr><td>${L.pk}</td><td>${count(g.poker.total)}</td><td>${date(g.poker.since)}</td></tr>
</tbody></table></div>
<p class="note">${L.onlineOnly}</p>`);

  // Combinaisons
  const r = d.rolls;
  const enough = r.total >= CHIFFRES_MIN.rolls;
  out.push(`<h2 id="combinaisons">${L.combosH}</h2>
<p>${enough ? L.combosLead(nb(r.total), date(r.since)) : L.combosWait(nb(r.total), date(r.since), nb(CHIFFRES_MIN.rolls))}</p>
<div class="table-wrap"><table>
<thead><tr><th>${L.combo}</th>${enough ? `<th>${L.real}</th>` : ''}<th>${L.theory}</th></tr></thead>
<tbody>
${ROLL_KINDS.map((k) => `<tr><td>${L.kinds[k]}</td>${enough ? `<td>${pct(r.byKind[k] / r.total, 2)}<br><small>${L.seen}${lang === 'fr' ? ' :' : ':'} ${nb(r.byKind[k])}</small></td>` : ''}<td>${pct(th[k].p, 2)}<br><small>${th[k].ways}/216</small></td></tr>`).join('\n')}
</tbody></table></div>
${enough ? `<p class="note">${L.combosNote}</p>` : ''}`);

  // Barrages
  const b = d.barrage;
  out.push(`<h2 id="barrages">${L.barrageH}</h2>
<p>${b.total ? `${L.barrage(nb(b.total), date(b.since))}${b.longest ? ` ${L.longest(nb(b.longest), date(b.longestDay))}` : ''}` : L.noBarrage(date(b.since))}</p>`);

  // Heures
  out.push(`<h2 id="heures">${L.hoursH}</h2>`);
  if (d.hours) {
    const h = d.hours;
    const max = Math.max(...h.byHour);
    const top = h.byHour.map((n, i) => ({ n, i })).sort((a, b2) => b2.n - a.n).slice(0, 3).map((x) => L.hour(x.i));
    out.push(`<p>${L.hoursLead(nb(h.total), date(h.since))} ${L.peak(top.join(', '))}</p>
<div class="table-wrap"><table>
<tbody>
${h.byHour.map((n, i) => `<tr><td style="width:5.5em">${L.hour(i)}</td><td><span style="display:inline-block;height:0.7em;border-radius:3px;background:#f6d36b;width:${max ? Math.round((70 * n) / max) : 0}%" aria-hidden="true"></span> <small>${pct(n / h.total, 1)}</small></td></tr>`).join('\n')}
</tbody></table></div>`);
  } else out.push(`<p>${L.wait(nb(CHIFFRES_MIN.hours))}</p>`);

  // Durées
  const du = d.durations;
  out.push(`<h2 id="duree">${L.durH}</h2>`);
  const lines = [du.onlineMedian != null ? L.durOnline(L.min(du.onlineMedian)) : null, du.soloMedian != null ? L.durSolo(L.min(du.soloMedian)) : null,
    du.avgTable != null ? L.table((Math.round(du.avgTable * 10) / 10).toLocaleString(LOCALE[lang])) : null].filter(Boolean);
  out.push(lines.length ? `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : `<p>${L.wait(nb(CHIFFRES_MIN.durations))}</p>`);

  // Pays
  out.push(`<h2 id="pays">${L.countriesH}</h2>`);
  if (d.countries) {
    const c = d.countries;
    const names = new Intl.DisplayNames([lang], { type: 'region' });
    out.push(`<p>${L.countriesLead(nb(c.total), date(c.since))}</p>
<div class="table-wrap"><table>
<thead><tr><th>${L.country}</th><th>${L.share}</th></tr></thead>
<tbody>
${c.rows.map((x) => `<tr><td>${esc(names.of(x.code) ?? x.code)}</td><td>${pct(x.share / 100, 1)}</td></tr>`).join('\n')}
${c.othersShare > 0 ? `<tr><td>${L.others}</td><td>${pct(c.othersShare / 100, 1)}</td></tr>` : ''}
</tbody></table></div>`);
  } else out.push(`<p>${L.countriesWait}</p>`);

  out.push(`<p class="meta">${L.updated(date(d.day))}</p>`);
  return out.join('\n');
}

const START = '<!--CHIFFRES:START-->';
const END = '<!--CHIFFRES:END-->';
/** Page complète : gabarit + chiffres, dates de mise à jour et période couverte (JSON-LD) au jour du calcul. */
export function fillTemplate(template: string, d: ChiffresData, lang: ChiffresLang): string {
  const i = template.indexOf(START);
  const j = template.indexOf(END);
  if (i < 0 || j < i) throw new Error('Gabarit « Le 421 en chiffres » sans emplacement des chiffres');
  const firstDay = [d.games.k421.since, d.rolls.since].filter(Boolean).sort()[0] ?? d.day;
  return (template.slice(0, i + START.length) + '\n' + renderChiffres(d, lang) + '\n' + template.slice(j))
    .replace(/("dateModified":")\d{4}-\d{2}-\d{2}"/g, `$1${d.day}"`)
    .replace(/("temporalCoverage":")[^"]*"/g, `$1${firstDay}/${d.day}"`)
    .replace(/(<meta property="article:modified_time" content=")[^"]*"/, `$1${d.day}"`)
    .replace(/<p class="meta">([^<]*)<time datetime="[^"]*">[^<]*<\/time><\/p>/, (_m, label: string) =>
      `<p class="meta">${label}<time datetime="${d.day}">${new Date(`${d.day}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric' })}</time></p>`);
}

/** Routes /le-421-en-chiffres (et traductions), devant les fichiers statiques. Cache d'une heure. */
export function mountChiffres(app: Express, store: Store, clientDir: string, o: { now?: () => number; ttlMs?: number } = {}) {
  const now = o.now ?? Date.now;
  const ttl = o.ttlMs ?? 3600_000;
  let data: { at: number; d: ChiffresData } | null = null;
  const pages = new Map<string, { at: number; html: string; gz: Buffer }>();
  for (const [lang, slug] of Object.entries(CHIFFRES_SLUGS) as [ChiffresLang, string][]) {
    app.get(`/${slug}`, (req: Request, res: Response, next) => {
      const file = join(clientDir, `${slug}.html`);
      if (!existsSync(file)) return next();
      const t = now();
      let p = pages.get(slug);
      if (!p || t - p.at > ttl) {
        try {
          if (!data || t - data.at > ttl) data = { at: t, d: computeChiffres(store, t) };
          const html = fillTemplate(readFileSync(file, 'utf8'), data.d, lang);
          p = { at: t, html, gz: gzipSync(html) };
          pages.set(slug, p);
        } catch (e) {
          console.error('Le 421 en chiffres :', e);
          return next();
        }
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) { res.setHeader('Content-Encoding', 'gzip'); res.end(p.gz); } else res.end(p.html);
    });
  }
}
