/**
 * Coups Fourrés : partie contre l'ordinateur, rejouable à l'identique.
 * Le serveur donne la graine et les decks ; le client joue avec ces fonctions ; à la fin il renvoie
 * seulement SES actions, et le serveur rejoue la partie (moteur + IA déterministes) pour vérifier
 * le résultat avant de donner des capsules. Les deux côtés DOIVENT utiliser ces fonctions.
 */
import { apply, legalActions, actionKey, newGame, viewFor, waitingFor, type CfAction, type CfEvent, type CfState } from './engine';
import { cfDecide, type CfLevel } from './ai';
import { mulberry32, type Rng } from '../rng';

export interface BotMatchSetup {
  seed: number;
  me: { id: string; name: string; deck: string[] };
  bots: { id: string; name: string; deck: string[]; level: CfLevel }[];
}

export interface BotMatch {
  setup: BotMatchSetup;
  state: CfState;
  /** Générateur des décisions des ordinateurs (dérivé de la graine). */
  aiRng: Rng;
  /** Actions du joueur humain, dans l'ordre. */
  mine: CfAction[];
}

export const botRngSeed = (seed: number) => (seed ^ 0x5bd1e995) >>> 0;

export function startBotMatch(setup: BotMatchSetup): { match: BotMatch; events: CfEvent[] } {
  const players = [setup.me, ...setup.bots].map((p) => ({ id: p.id, name: p.name, deck: p.deck }));
  const match: BotMatch = { setup, state: newGame({}, players, setup.seed), aiRng: mulberry32(botRngSeed(setup.seed)), mine: [] };
  const events = advanceBots(match);
  return { match, events };
}

/** Fait jouer les ordinateurs tant que c'est à l'un d'eux. Renvoie les événements produits (non filtrés). */
export function advanceBots(match: BotMatch, maxSteps = 5000): CfEvent[] {
  const out: CfEvent[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const bot = match.setup.bots.find((b) => waitingFor(match.state).includes(b.id));
    if (!bot) break;
    const action = cfDecide(viewFor(match.state, bot.id), legalActions(match.state, bot.id), bot.level, match.aiRng);
    const r = apply(match.state, bot.id, action);
    if (!r.ok) throw new Error(`Action d'ordinateur refusée : ${r.error}`);
    match.state = r.state;
    out.push(...r.events);
  }
  return out;
}

/** Une ou plusieurs étapes d'ordinateur à la fois (pour les animer une par une côté client). */
export function botToPlay(match: BotMatch): string | null {
  return match.setup.bots.find((b) => waitingFor(match.state).includes(b.id))?.id ?? null;
}
export function stepBot(match: BotMatch): CfEvent[] {
  const id = botToPlay(match);
  if (!id) return [];
  const bot = match.setup.bots.find((b) => b.id === id)!;
  const action = cfDecide(viewFor(match.state, id), legalActions(match.state, id), bot.level, match.aiRng);
  const r = apply(match.state, id, action);
  if (!r.ok) throw new Error(`Action d'ordinateur refusée : ${r.error}`);
  match.state = r.state;
  return r.events;
}

/** Action du joueur humain. Les ordinateurs NE jouent PAS automatiquement ensuite (appeler stepBot / advanceBots). */
export function playMine(match: BotMatch, action: CfAction): { ok: boolean; error?: string; events: CfEvent[] } {
  const id = match.setup.me.id;
  if (!waitingFor(match.state).includes(id)) return { ok: false, error: 'Ce n’est pas à vous de jouer.', events: [] };
  const key = actionKey(action);
  if (!legalActions(match.state, id).some((a) => actionKey(a) === key)) return { ok: false, error: 'Action impossible maintenant.', events: [] };
  const r = apply(match.state, id, action);
  if (!r.ok) return { ok: false, error: r.error, events: [] };
  match.state = r.state;
  match.mine.push(action);
  return { ok: true, events: r.events };
}

/**
 * Rejoue une partie à partir de la graine et des actions du joueur (vérification serveur).
 * Après chaque action humaine, les ordinateurs jouent tout ce qu'ils ont à jouer avant l'action suivante
 * (ordre identique à celui du client, qui doit vider les tours des ordinateurs avant de rendre la main).
 * `onEvents` (facultatif) reçoit tous les événements bruts, dans l'ordre (missions côté serveur).
 */
export function replayBotMatch(setup: BotMatchSetup, mine: CfAction[], onEvents?: (events: CfEvent[]) => void): { ok: true; state: CfState } | { ok: false; error: string } {
  try {
    const { match, events } = startBotMatch(setup);
    onEvents?.(events);
    for (const a of mine) {
      const r = playMine(match, a);
      if (!r.ok) return { ok: false, error: r.error ?? 'Action refusée.' };
      onEvents?.(r.events);
      const bots = advanceBots(match);
      onEvents?.(bots);
    }
    return { ok: true, state: match.state };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
