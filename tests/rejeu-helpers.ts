/**
 * Aides de test : jouer une partie solo « comme le téléphone » (graine du serveur, ordinateurs du moteur
 * partagé), noter les décisions du joueur et compter les faits comme l'écran de partie (GameScreen).
 */
import { decide, type Difficulty } from '../shared/ai';
import { currentPlayerId, rollAction, stopAction, type GameState } from '../shared/engine';
import { albumKey, didWin, finalPlace, settledPlace } from '../shared/progress/profile';
import type { ComboKind } from '../shared/combos';
import { mulberry32 } from '../shared/rng';
import { ME, MOVE_STOP, dieAt, moveRoll, newGame421, playBot421, type Facts421, type Setup421 } from '../shared/rejeu/r421';
import { act, currentPlayer, placeOf, type DmAction, type DmState } from '../shared/dixmille/engine';
import { decide as dmDecide } from '../shared/dixmille/ai';
import { encodeDm, newGameDm, type SetupDm } from '../shared/rejeu/dixmille';
import { act as pmAct, placeOf as pmPlaceOf, type PmAction, type PmState } from '../shared/pokermenteur/engine';
import { decide as pmDecide } from '../shared/pokermenteur/ai';
import { encodePm, newGamePm, pmBotDecide, type SetupPm } from '../shared/rejeu/poker';

/** Joueur humain simulé : une IA (avec son propre hasard), parfois un lancer « d'un geste ». */
export function play421(setup: Setup421, seed: number, human: Difficulty = 'difficile', humanSeed = 7): { moves: string; facts: Facts421; state: GameState } {
  const s = newGame421(setup);
  const hr = mulberry32(humanSeed);
  let moves = '';
  const f: Facts421 = {
    won: false, place: 0, rounds: 0, count421: 0, combos: {} as Partial<Record<ComboKind, number>>, gestureThrows: 0, maxTokens: 0, comboKeys: [],
    suddenDeath: setup.config.variant === 'manches' && setup.config.rounds <= 1, opponents: setup.opponents.length, difficulty: setup.opponents[0].difficulty,
  };
  let lost = 0;
  const seen = (prev: number | undefined) => {
    const me = s.players.find((p) => p.id === ME)!;
    f.maxTokens = Math.max(f.maxTokens, me.tokens);
    const sm = s.lastSummary;
    if (sm && sm.seq !== prev && !sm.barrage && sm.loserId === ME) lost++;
  };
  seen(undefined);
  while (s.phase !== 'fini' && settledPlace(s, ME) == null) {
    const pid = currentPlayerId(s)!;
    const prev = s.lastSummary?.seq;
    if (pid !== ME) { playBot421(s, setup, seed, pid); seen(prev); continue; }
    const d = decide(s, ME, human, hr);
    if (d.kind === 'stop') { stopAction(s, ME); moves += MOVE_STOP; seen(prev); continue; }
    const gesture = hr() < 0.3;
    const r = rollAction(s, ME, d.keep, dieAt(seed, s.version));
    if (!r.ok) throw new Error(r.error);
    moves += moveRoll(d.keep, gesture);
    const roll = r.roll!;
    if (roll.combo.kind === '421' && !roll.rolloff) f.count421++;
    f.combos[roll.combo.kind] = (f.combos[roll.combo.kind] ?? 0) + 1;
    if (gesture) f.gestureThrows++;
    const k = albumKey(roll.dice);
    if (k && !f.comboKeys.includes(k)) f.comboKeys.push(k);
    if (!f.best || roll.combo.rank > f.best.rank) f.best = { label: roll.combo.label, rank: roll.combo.rank };
    seen(prev);
  }
  f.won = didWin(s, ME);
  f.place = finalPlace(s, ME);
  f.rounds = s.round;
  f.roundsLost = s.config.variant === 'manches' ? undefined : lost;
  return { moves, facts: f, state: s };
}

export function playDm(setup: SetupDm, seed: number, humanLevel: 'debutant' | 'habitue' | 'fouine' = 'fouine'): { moves: string; state: DmState } {
  let s = newGameDm(setup, seed);
  const moves: string[] = [];
  while (s.phase !== 'fini') {
    const mine = currentPlayer(s).id === 'moi';
    const a: DmAction = mine ? dmDecide(s, humanLevel) : dmDecide(s, setup.level);
    const r = act(s, a);
    if ('error' in r) throw new Error(r.error);
    if (mine) moves.push(encodeDm(a));
    s = r.state;
  }
  return { moves: moves.join('.'), state: s };
}
export const dmPlace = (s: DmState) => placeOf(s, 'moi');

export function playPm(setup: SetupPm, seed: number, humanLevel: 'debutant' | 'habitue' | 'fouine' = 'fouine', humanSeed = 3): { moves: string; state: PmState } {
  let s = newGamePm(setup, seed);
  const hr = mulberry32(humanSeed);
  const moves: string[] = [];
  while (s.phase !== 'fini') {
    const mine = s.players[s.current].id === 'moi';
    const a: PmAction = mine ? pmDecide(s, humanLevel, hr) : pmBotDecide(s, setup.level);
    const r = pmAct(s, a);
    if ('error' in r) throw new Error(r.error);
    if (mine) moves.push(encodePm(a));
    s = r.state;
  }
  return { moves: moves.join('.'), state: s };
}
export const pmPlace = (s: PmState) => pmPlaceOf(s, 'moi');

/** Table « partie libre » du 421 (habitués). */
export const freeSetup = (n = 1, difficulty: Difficulty = 'facile', config: Record<string, unknown> = {}, firstIdx = 0) => ({
  config, opponents: ['marcel', 'josiane', 'baron', 'lulu', 'dede'].slice(0, n).map((persona) => ({ persona, difficulty })), firstIdx,
});

type Api = (path: string, body: unknown, token: string) => Promise<any>;
/**
 * Joue une vraie partie de 421 par l'API (début avec la table, fin avec les décisions). `want` : rejoue de
 * nouvelles parties (nouvelles graines) jusqu'à obtenir ce résultat. `before` : appelé avant la fin (horloge).
 */
export async function solo421(api: Api, token: string, o: { setup?: unknown; boss?: string; tdc?: string; want?: 'win' | 'lose'; accept?: (f: Facts421) => boolean; extra?: Record<string, unknown>; before?: () => void | Promise<void>; tries?: number } = {}) {
  for (let i = 0; i < (o.tries ?? 60); i++) {
    const st = await api('/solo/start', { ...(o.boss ? { boss: o.boss } : {}), ...(o.tdc ? { tdc: o.tdc } : {}), setup: o.setup ?? freeSetup() }, token);
    if (st.seed === undefined) throw new Error(`pas de graine : ${JSON.stringify(st)}`);
    const g = play421(st.setup, st.seed, 'difficile', i + 1);
    if (o.want && (o.want === 'win') !== g.facts.won) continue;
    if (o.accept && !o.accept(g.facts)) continue;
    await o.before?.();
    const end = await api('/solo/end', { gameToken: st.gameToken, moves: g.moves, ...(o.extra ?? {}) }, token);
    return { start: st, end, facts: g.facts };
  }
  throw new Error('résultat voulu introuvable');
}

/** Table du patron de la semaine (le patron difficile, puis ses acolytes). */
export const bossTable = (b: { persona: string; sidekicks: number }) => ({
  config: {}, firstIdx: 0,
  opponents: [{ persona: b.persona, difficulty: 'difficile' }, ...['marcel', 'simone', 'dede', 'lulu', 'baron'].filter((p) => p !== b.persona).slice(0, b.sidekicks).map((persona) => ({ persona, difficulty: 'normal' }))],
});
