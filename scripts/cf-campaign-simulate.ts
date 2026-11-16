/**
 * Coups Fourrés, campagne « Les Comptoirs rivaux » : chaque comptoir joué par des ordinateurs, jusqu'au bout.
 *
 *   npx tsx scripts/cf-campaign-simulate.ts [--games 400] [--stage bar-amis] [--level habitue]
 *
 * « Joueur moyen » : ordinateur de niveau Habitué (--level pour changer) avec, à tour de rôle, Le Zinc, La Bringue
 * ou un deck automatique tiré d'une petite collection au hasard (comme les decks des ordinateurs). Les adversaires
 * jouent exactement la table du comptoir (shared/campaigns/cf.ts : ccfBots), avec le moteur et les fonctions de
 * botmatch (mêmes que le serveur). Affiche par comptoir : taux de victoire, manches, durée de calcul,
 * part des victoires qui donnent chaque étoile.
 */
import { advanceBots, startBotMatch, type BotMatchSetup } from '../shared/cards/botmatch';
import type { CfEvent } from '../shared/cards/engine';
import type { CfLevel } from '../shared/cards/ai';
import { CARDS, STARTER_DECKS } from '../shared/cards/catalog';
import { buildAutoDeck } from '../shared/cards/autodeck';
import { CCF_STAGES, ccfBots, ccfDeckList, ccfFacts, ccfStarMet, type CcfStage } from '../shared/campaigns/cf';
import { mulberry32 } from '../shared/rng';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const GAMES = Number(arg('games', '400'));
const ONLY = arg('stage', '');
const LEVEL = arg('level', 'habitue') as CfLevel;

const W: Record<string, number> = { commune: 8, rare: 3, epique: 1, legendaire: 0.4 };
function playerDeck(i: number, rnd: () => number): string[] {
  if (i % 3 < 2) return ccfDeckList(STARTER_DECKS[i % 3].cards);
  const total = CARDS.reduce((a, c) => a + W[c.rarity], 0);
  for (;;) {
    const owned: Record<string, number> = {};
    for (let k = 0; k < 60; k++) { let x = rnd() * total; const c = CARDS.find((q) => (x -= W[q.rarity]) < 0) ?? CARDS[0]; owned[c.id] = (owned[c.id] ?? 0) + 1; }
    const d = buildAutoDeck(owned);
    if (d) return ccfDeckList(d);
  }
}


function run(stage: CcfStage) {
  let wins = 0, rounds = 0, roundsWin = 0, ms = 0, maxRounds = 0;
  const starHits = [0, 0];
  const wr: number[] = [], lead: number[] = [], lost: number[] = [], combo: number[] = [];
  let noTrap = 0, traps2 = 0;
  const rnd = mulberry32(12345);
  for (let g = 0; g < GAMES; g++) {
    const deck = playerDeck(g, rnd);
    const seed = 1 + g * 7919;
    const setup: BotMatchSetup = { seed, me: { id: 'joueur', name: 'Joueur', deck }, bots: ccfBots(stage) };
    const t = performance.now();
    // Le joueur moyen est un ordinateur : on lance la partie avec lui comme premier « bot » (même ordre de sièges).
    const all: BotMatchSetup = { seed, me: setup.me, bots: [{ id: 'joueur', name: 'Joueur', deck, level: LEVEL }, ...setup.bots] };
    const evs: CfEvent[] = [];
    const m = startBotMatchAsBots(all, evs);
    ms += performance.now() - t;
    const f = ccfFacts(setup, m.state, evs);
    rounds += f.rounds; maxRounds = Math.max(maxRounds, f.rounds);
    if (f.won) {
      wins++; roundsWin += f.rounds; wr.push(f.rounds); lead.push(f.minOppTokens); lost.push(f.lost); combo.push(f.maxCards);
      if (!f.trapsOnMe) noTrap++;
      if (f.myTraps >= 2) traps2++;
      stage.stars.forEach((s, i) => { if (ccfStarMet(s, f)) starHits[i]++; });
    }
  }
  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)} %` : '–');
  console.log(`${stage.id.padEnd(15)} ${String(stage.rivals.length + 1)} j.  victoires ${pct(wins, GAMES).padStart(5)}  manches ${(rounds / GAMES).toFixed(1)} (gagnées ${(roundsWin / Math.max(1, wins)).toFixed(1)}, max ${maxRounds})  calcul ${(ms / GAMES).toFixed(0)} ms/partie  ★2 ${pct(starHits[0], wins)} (${JSON.stringify(stage.stars[0])})  ★3 ${pct(starHits[1], wins)} (${JSON.stringify(stage.stars[1])})`);
  const q = (a: number[], x: number) => { const b = [...a].sort((u, v) => u - v); return b.length ? b[Math.min(b.length - 1, Math.floor(x * b.length))] : 0; };
  if (process.argv.includes('--detail')) console.log(`   victoires : manches q25/q50/q75 ${q(wr, 0.25)}/${q(wr, 0.5)}/${q(wr, 0.75)} · jetons adverses q25/q50/q75 ${q(lead, 0.25)}/${q(lead, 0.5)}/${q(lead, 0.75)} · perdues ${q(lost, 0.25)}/${q(lost, 0.5)}/${q(lost, 0.75)} · cartes/manche ${q(combo, 0.25)}/${q(combo, 0.5)}/${q(combo, 0.75)} · sans piège subi ${pct(noTrap, wins)} · 2 pièges déclenchés ${pct(traps2, wins)}`);
  return wins / GAMES;
}

/**
 * Comme startBotMatch, mais le joueur (premier siège) est joué par l'ordinateur : on construit un setup dont le
 * « me » est le joueur et dont les bots comprennent aussi le joueur (advanceBots fait jouer tout le monde).
 */
function startBotMatchAsBots(all: BotMatchSetup, evs: CfEvent[]) {
  const [meBot, ...others] = all.bots;
  const { match, events } = startBotMatch({ seed: all.seed, me: { id: meBot.id, name: meBot.name, deck: meBot.deck }, bots: others });
  evs.push(...events);
  match.setup = { ...match.setup, bots: all.bots };
  evs.push(...advanceBots(match, 1_000_000));
  if (match.state.phase !== 'over') throw new Error(`Partie inachevée (${match.state.phase})`);
  return match;
}

const list = ONLY ? CCF_STAGES.filter((s) => s.id === ONLY) : CCF_STAGES;
console.log(`Comptoirs rivaux : ${GAMES} parties par comptoir, joueur moyen = ordinateur « ${LEVEL} » (Zinc / Bringue / deck automatique)`);
for (const s of list) run(s);
