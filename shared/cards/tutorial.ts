/**
 * « Coups Fourrés » : partie guidée (≈ 3 minutes) contre un ordinateur SCÉNARISÉ.
 *
 * On réutilise le vrai moteur (shared/cards/engine.ts) : seules la main de départ, l'ordre des decks,
 * les dés (source `rollDie` imposée) et les décisions de Dédé sont écrits à l'avance. Le joueur ne
 * peut faire que l'action attendue à chaque étape (les autres sont retirées des actions possibles).
 *
 * Déroulé : manche 1 (vous menez) lancer, garder, Tête qui tourne → 4-2-1, poser Croche-patte,
 * s'arrêter (limite de lancers) ; Dédé pose Gueule de bois et se fait piéger ; comptes.
 * Manche 2 (Dédé mène) : Riposte avec Ticket de caisse, Fouine sur son Faux 4-2-1, Tournée du patron, Leurre,
 * un seul lancer (Gueule de bois), puis Dernier mot « Recompter » : 4-2-1 et victoire.
 */
import { CF_RULES } from './catalog';
import { apply, legalActions, newGame, pl, waitingFor, type CfAction, type CfEvent, type CfState, type PlayParams } from './engine';

/** Récompense unique de la partie guidée (comptes, versée par le serveur). Volontairement basse. */
export const CF_TUTORIAL_CAPSULES = 20;

export const TUTO_ME = 'moi';
export const TUTO_BOT = 'dede';
export const TUTO_BOT_NAME = 'Dédé';

/** Zone de l'écran à mettre en avant pendant l'étape. */
export type TutoFocus = 'hand' | 'tray' | 'roll' | 'stop' | 'ardoise' | 'opp' | 'me' | 'respond' | 'choice';

export type TutoStep =
  | { kind: 'info'; title?: string; text: string; button?: string; focus?: TutoFocus }
  | { kind: 'me'; title?: string; text: string; focus?: TutoFocus; expect: (a: CfAction, s: CfState) => boolean }
  | { kind: 'bot'; text?: string; action: (s: CfState) => CfAction };

// --- Préparation -------------------------------------------------------------------------------

const MY_HAND = ['tete-tourne', 'croche-patte', 'ticket-caisse', 'fouine', 'tournee-patron'];
/** Dessus du deck en premier : pioche de la manche 1, puis de la manche 2. */
const MY_DECK = ['recompter', 'leurre', 'coup-coude', 'mise-bouche', 'cul-sec', 'pilier', 'vieux-marcel', 'gueule-bois', 'coup-pouce', 'calcul-mental', 'pari-comptoir', 'main-sac', 'domino', 'josiane', 'note-salee'];
const BOT_HAND = ['gueule-bois', 'coup-pouce', 'faux-421', 'cul-sec'];
const BOT_DECK = ['tournee-patron', 'pari-comptoir', 'vieux-marcel', 'pilier', 'leurre', 'coup-coude', 'mise-bouche', 'croche-patte', 'calcul-mental', 'tete-tourne', 'main-sac', 'cul-sec', 'coup-pouce', 'faux-421', 'leurre', 'gueule-bois'];

/** Dés, dans l'ordre où le moteur les demande. */
const DICE = [
  4, 2, 5, // vous : 1er lancer
  6, // vous : relance du 3e dé
  6, 6, 3, // Dédé : 1er lancer
  5, 2, // Dédé : relance (dont le 6 renvoyé par votre Croche-patte)
  4, 2, 2, // manche 2, Dédé : 1er lancer
  1, 3, 1, // Dédé : 2e lancer
  4, 2, 2, // vous : votre seul lancer
];

function build(seed: number, myName: string): CfState {
  const s = newGame({}, [
    { id: TUTO_ME, name: myName, deck: [...MY_HAND, ...MY_DECK] },
    { id: TUTO_BOT, name: TUTO_BOT_NAME, deck: [...BOT_HAND, ...BOT_DECK] },
  ], seed);
  const inst = (ids: string[]) => ids.map((id) => ({ uid: `k${s.nextUid++}`, id }));
  const me = pl(s, TUTO_ME), bot = pl(s, TUTO_BOT);
  me.hand = inst(MY_HAND); me.deck = inst(MY_DECK);
  bot.hand = inst(BOT_HAND); bot.deck = inst(BOT_DECK);
  return s;
}

/** Graine pour laquelle le tirage au sort donne la première manche au joueur (cherchée une fois). */
let SEED = 0;
function tutoSeed(): number {
  if (SEED) return SEED;
  for (let seed = 1; seed < 500; seed++) {
    let s = build(seed, 'x');
    s = apply(s, TUTO_ME, { type: 'mulligan', cards: [] }).state;
    s = apply(s, TUTO_BOT, { type: 'mulligan', cards: [] }).state;
    if (s.leader === TUTO_ME) return (SEED = seed);
  }
  throw new Error('Partie guidée : aucune graine ne convient');
}

// --- Aides pour écrire les étapes ---------------------------------------------------------------

const uidOf = (s: CfState, pid: string, id: string) => pl(s, pid).hand.find((k) => k.id === id)?.uid ?? '';
const sameKeep = (a: boolean[], b: boolean[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const isRoll = (keep: boolean[]) => (a: CfAction) => a.type === 'roll' && sameKeep(a.keep, keep);
/** Jouer la carte `id` de ma main (avec ces paramètres, s'ils sont donnés). */
const isPlay = (id: string, ok: (p: PlayParams) => boolean = () => true) => (a: CfAction, s: CfState) =>
  a.type === 'play' && pl(s, TUTO_ME).hand.find((k) => k.uid === a.card)?.id === id && ok(a);
const botPlay = (id: string, params: (s: CfState) => PlayParams = () => ({})) => (s: CfState): CfAction =>
  ({ type: 'play', card: uidOf(s, TUTO_BOT, id), ...params(s) });
const NONE = [false, false, false];
const R = CF_RULES;

/** Les étapes de la partie guidée. */
export const TUTO_STEPS: TutoStep[] = [
  { kind: 'info', title: 'Partie guidée', text: `Bienvenue au comptoir ! Vous affrontez ${TUTO_BOT_NAME}. Chacun a ${R.startTokens} jetons : le premier qui n’en a plus aucun gagne. Le 421, mais avec des cartes pour piéger, retourner les dés… et se refaire.`, button: 'C’est parti' },
  { kind: 'info', title: 'Vos cartes et vos Tournées', text: `En bas, votre main. Chaque carte coûte des Tournées (la pastille dorée) : ce sont vos verres, vous en recevez ${R.tourneesPerRound} à chaque manche.`, focus: 'me' },
  { kind: 'me', title: 'Lancer', text: `Vous menez cette manche : lancez les 3 dés (${R.maxThrows} lancers au plus).`, focus: 'roll', expect: isRoll(NONE) },
  { kind: 'me', title: 'Garder des dés', text: 'Un 4 et un 2 : il ne manque qu’un 1 pour le 4-2-1, la meilleure combinaison. Touchez le 4 et le 2 dans le bac pour les garder, puis relancez le dernier dé.', focus: 'tray', expect: isRoll([true, true, false]) },
  { kind: 'me', title: 'Jouer un Coup', text: 'Un 6… Mais « Tête qui tourne » retourne un dé sur sa face opposée : le 6 devient 1 ! Touchez la carte, choisissez le 6, puis « Jouer ». Elle coûte 2 Tournées.', focus: 'hand', expect: isPlay('tete-tourne', (p) => p.die === 2) },
  { kind: 'me', title: 'Poser un piège', text: `4-2-1 ! Posez maintenant « Croche-patte » : un piège face cachée. ${TUTO_BOT_NAME} verra qu’il y a un piège, pas lequel. Il se déclenchera tout seul.`, focus: 'hand', expect: isPlay('croche-patte') },
  { kind: 'me', title: 'La limite de lancers', text: `Arrêtez-vous là. Vous avez fait 2 lancers : ${TUTO_BOT_NAME} n’aura droit qu’à 2 lancers lui aussi. Le meneur fixe la limite de l’autre.`, focus: 'stop', expect: (a) => a.type === 'stop' },
  { kind: 'bot', text: `À ${TUTO_BOT_NAME} de jouer, en voyant votre 4-2-1…`, action: () => ({ type: 'roll', keep: NONE }) },
  { kind: 'bot', text: `${TUTO_BOT_NAME} pose un piège sur vous. Lequel ? Mystère…`, action: botPlay('gueule-bois', () => ({ target: TUTO_ME })) },
  { kind: 'bot', text: `${TUTO_BOT_NAME} garde ses deux 6…`, action: () => ({ type: 'roll', keep: [true, true, false] }) },
  { kind: 'info', title: 'Piège déclenché !', text: `Votre Croche-patte : quand ${TUTO_BOT_NAME} garde des dés, l’un d’eux repart au lancer. Adieu son brelan de 6 !`, focus: 'opp' },
  { kind: 'bot', action: () => ({ type: 'stop' }) },
  { kind: 'info', title: 'Les comptes', text: `Votre 4-2-1 gagne : il vaut 8, vous donnez donc 8 jetons à ${TUTO_BOT_NAME}. Plus que 3 ! Mais son piège « Gueule de bois » vous laisse un seul lancer cette manche. Le perdant mène et reçoit une Tournée de plus.`, focus: 'me' },
  { kind: 'bot', text: `${TUTO_BOT_NAME} mène la manche 2.`, action: () => ({ type: 'roll', keep: NONE }) },
  { kind: 'bot', text: `${TUTO_BOT_NAME} sort une carte…`, action: botPlay('coup-pouce', () => ({ die: 2, delta: -1 })) },
  { kind: 'me', title: 'Riposter', text: `${TUTO_BOT_NAME} joue « Coup de pouce » pour changer un 2 en 1 et faire un 4-2-1 ! Une Riposte se joue à tout moment : « Ticket de caisse » annule un Coup qui coûte 2 ou moins.`, focus: 'respond', expect: isPlay('ticket-caisse') },
  { kind: 'bot', text: `${TUTO_BOT_NAME}, vexé, pose un autre piège sur vous…`, action: botPlay('faux-421', () => ({ target: TUTO_ME })) },
  { kind: 'bot', action: () => ({ type: 'roll', keep: NONE }) },
  { kind: 'bot', action: () => ({ type: 'stop' }) },
  { kind: 'me', title: 'Parer un piège', text: `Deux as et un 3 pour ${TUTO_BOT_NAME}. Avant de lancer, méfiez-vous de son piège : jouez la « Fouine » (gratuite) pour le regarder.`, focus: 'hand', expect: isPlay('fouine') },
  { kind: 'me', title: 'Parer un piège', text: 'Un « Faux 4-2-1 » : votre prochain 4-2-1 ne vaudrait que 2 ! Payez 1 Tournée pour le défausser.', focus: 'choice', expect: (a) => a.type === 'choose' && a.index === 1 },
  { kind: 'me', title: 'Reprendre des Tournées', text: 'Plus de Tournées ? « Tournée du patron » est gratuite et vous en donne 2. Jouez-la : vous en aurez besoin tout à l’heure.', focus: 'hand', expect: isPlay('tournee-patron') },
  { kind: 'me', title: 'Bluffer', text: `Posez ce « Leurre » : il ne fait rien… mais ${TUTO_BOT_NAME} ne le sait pas. Retenez qu’il est posé.`, focus: 'hand', expect: isPlay('leurre') },
  { kind: 'me', title: 'Un seul lancer', text: 'La Gueule de bois ne vous laisse qu’un lancer. Croisez les doigts et lancez !', focus: 'roll', expect: isRoll(NONE) },
  { kind: 'me', title: 'Le Dernier mot', text: `4-2-2 : vous perdez… pas encore ! Avant les comptes, le perdant peut jouer un « Dernier mot ». « Recompter » (si vous avez déjà joué une carte dans la manche) retire 1 à un dé : changez un 2 en 1 !`, focus: 'hand', expect: isPlay('recompter', (p) => (p.die === 1 || p.die === 2) && p.delta === -1) },
];

/** Nombre d'étapes affichées au joueur (explications et actions). */
export const TUTO_VISIBLE = TUTO_STEPS.filter((x) => x.kind !== 'bot').length;

// --- Déroulé ------------------------------------------------------------------------------------

/** Une partie guidée en cours (pure, sans minuterie : le contrôleur de l'écran ajoute les pauses). */
export class CfTutorial {
  state: CfState;
  step = 0;
  private die = 0;
  constructor(myName = 'Vous') {
    let s = build(tutoSeed(), myName);
    const ev: CfEvent[] = [];
    for (const id of [TUTO_ME, TUTO_BOT]) { const r = apply(s, id, { type: 'mulligan', cards: [] }); s = r.state; ev.push(...r.events); }
    this.state = s;
    this.startEvents = ev;
  }
  /** Événements du départ (main gardée, tirage au sort, manche 1). */
  readonly startEvents: CfEvent[];
  private rollDie = () => DICE[this.die++] ?? 3;

  get current(): TutoStep | null { return TUTO_STEPS[this.step] ?? null; }
  get over(): boolean { return this.state.phase === 'over'; }
  /** Rang de l'étape parmi celles que voit le joueur (1…TUTO_VISIBLE). */
  get visibleIndex(): number { return TUTO_STEPS.slice(0, this.step + 1).filter((x) => x.kind !== 'bot').length; }

  /** Actions permises au joueur maintenant : seulement celle(s) attendue(s). */
  legal(): CfAction[] {
    const st = this.current;
    if (!st || st.kind !== 'me' || !waitingFor(this.state).includes(TUTO_ME)) return [];
    return legalActions(this.state, TUTO_ME).filter((a) => st.expect(a, this.state));
  }
  /** Action du joueur (refusée si ce n'est pas celle attendue). */
  play(a: CfAction): { ok: boolean; error?: string; events: CfEvent[] } {
    const st = this.current;
    if (!st || st.kind !== 'me') return { ok: false, error: 'Attendez la suite de la partie guidée.', events: [] };
    if (!st.expect(a, this.state)) return { ok: false, error: 'Suivez la bulle : ce n’est pas encore le moment.', events: [] };
    return this.run(TUTO_ME, a);
  }
  /** Au tour de Dédé : joue son action prévue. */
  bot(): CfEvent[] {
    const st = this.current;
    if (!st || st.kind !== 'bot') return [];
    const r = this.run(TUTO_BOT, st.action(this.state));
    if (!r.ok) throw new Error(`Partie guidée : action de Dédé refusée (${r.error}) à l’étape ${this.step}`);
    return r.events;
  }
  /** Étape d'explication : « Continuer ». */
  next() { if (this.current?.kind === 'info') this.step++; }

  private run(pid: string, a: CfAction) {
    const r = apply(this.state, pid, a, { rollDie: this.rollDie });
    if (!r.ok) return { ok: false, error: r.error, events: [] };
    this.state = r.state;
    this.step++;
    return { ok: true, events: r.events };
  }
}
