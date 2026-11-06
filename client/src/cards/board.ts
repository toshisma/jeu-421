/**
 * Coups Fourrés : fonctions pures du plateau de partie (aucun DOM ; testées dans tests/cf-board.test.ts).
 *
 * - cardHint : pour chaque carte en main, jouable maintenant (et pourquoi, en 3 mots) ou pas (son
 *   moment, ou ce qui manque : « Tour adverse », « Dernier mot », « 3 Tournées »).
 * - decisionBanner : la consigne du bandeau (« À vous ! Battez 6-5-3 · encore 1 lancer sur 2 »…).
 * - friseSteps : la frise de la manche (Service → meneur → … → Dernier mot → Comptes).
 * - planEvents : la file des annonces (une par une, au centre) à partir des événements du moteur.
 * - threatLine : ce que la carte adverse va vous faire (fenêtre de riposte).
 */
import { CARDS, CARD_BY_ID, FAMILY_LABEL, type CardFamily, type CardType } from '../../../shared/cards/catalog';
import { ARDOISE_EXTRA, FERMETURE_TOURNEES, TOURNEE_PATRON_GAIN, LEURRE_DRAW, LEURRE_TOURNEES, VESTE_MIN, commandeOf, evalPlayer, petiteSoeurOk, type CfAction, type CfEvent, type CfPlayerView, type CfView } from '../../../shared/cards/engine';
import { comboOf, comboWith, costNow, isTurnOf, meOf, nameIn, playOptions, playerOf, playsAfter, plural } from './describe';
import { FAMILY_SHORT } from './meta';
import { TYPE_META } from './cardTypes';

const def = (id: string | null | undefined) => (id ? CARD_BY_ID[id] : undefined);
export const cardName = (id: string | null | undefined) => def(id)?.name ?? 'une carte';

/** « 421 » → « 4-2-1 », « 6-1-1 (deux as) » → « 6-1-1 ». */
export function shortCombo(label: string): string {
  if (label === '421') return '4-2-1';
  return label.replace(/ \(deux as\)$/, '');
}

// ------------------------------------------------------------------------------------------------
// Cartes en main

export type HintTone = 'ok' | 'moment' | 'cost' | 'wait';
export interface CardHint { playable: boolean; label: string; tone: HintTone; type: CardType }

const le = (x: number) => String(x);

/** Meilleur résultat d'une carte qui change un de vos dés : « 6 → 1 : 4-2-1 ! ». */
function bestDice(v: CfView, p: CfPlayerView, opts: { die?: number; delta?: number; face?: number }[], to: (o: { die?: number; delta?: number; face?: number }) => number): string | null {
  let best: { from: number; to: number; rank: number; label: string; kind: string } | null = null;
  for (const o of opts) {
    if (o.die === undefined) continue;
    const dice = [...p.r.dice];
    const t = to(o);
    dice[o.die] = t;
    const e = evalPlayer({ values: v.values }, { habitues: p.habitues, r: { ...p.r, dice, forcedNenette: false } });
    if (!best || e.rank > best.rank) best = { from: p.r.dice[o.die], to: t, rank: e.rank, label: shortCombo(e.combo.label), kind: e.combo.kind };
  }
  if (!best) return null;
  return `${le(best.from)} → ${le(best.to)} : ${best.label}${best.kind === '421' || best.kind === '111' ? ' !' : ''}`;
}

/** Raison courte d'une carte jouable maintenant. */
function playableLabel(v: CfView, legal: CfAction[], uid: string, id: string): string {
  const p = meOf(v);
  const opts = playOptions(legal, uid);
  const d = def(id)!;
  switch (id) {
    case 'tete-tourne': return bestDice(v, p, opts, (o) => 7 - p.r.dice[o.die!]) ?? 'Retourner un dé';
    case 'coup-pouce': case 'recompter': return bestDice(v, p, opts, (o) => p.r.dice[o.die!] + (o.delta ?? 0)) ?? '±1 à un dé';
    case 'bon-numero': { const b = bestDice(v, p, opts, (o) => o.face!); return b ? `→ ${b.split(' : ')[1]}` : 'Choisir une face'; }
    case 'fouine': return opts.some((o) => o.trap) ? 'Défausser son piège' : 'Piocher 1 carte';
    case 'tournee-patron': return `+${TOURNEE_PATRON_GAIN} Tournées, 1 carte`;
    case 'cul-sec': return '+1 lancer, 1 carte';
    case 'coup-coude': return 'Piocher 1 carte';
    case 'mise-bouche': return '1 carte, suivante gratuite';
    case 'calcul-mental': return 'Garder 1 sur 3';
    case 'pari-comptoir': return 'Pari ±2 jetons';
    case 'double-tournee': return 'Gain doublé';
    case 'de-sous-table': return 'Relancer son dé';
    case 'tournee-generale': return 'Tout relancer';
    case 'domino': { const o = v.players.find((x) => x.id === opts[0]?.target); const n = o ? o.tournees : 0; return `Lui ôter ${plural(n, 'Tournée')}`; }
    case 'fermeture': return v.players.some((o) => o.id !== p.id && o.habitues.length) ? 'Chasser un Habitué' : `+${FERMETURE_TOURNEES} Tournées`;
    case 'grand-enchainement': return p.r.lastCoup ? `Rejouer ${cardName(p.r.lastCoup).split(' ')[0]}` : 'Rejouer';
    case 'note-salee': return '+2 jetons donnés';
    case 'ticket-caisse': case 'reaction-chaine': case 'pot-aux-roses': return 'Annuler sa carte';
    case 'pourboire': return p.tokens <= 1 ? 'Dernier jeton : gagné !' : '1 jeton donné, 1 carte';
    case 'coup-etrier': return 'Relancer un de vos dés';
    case 'yeux-piquent': return 'Annuler son coup de dés';
    case 'efface-tout': return 'Ne recevoir qu’un jeton';
    case 'trinquer': return 'Échanger un dé';
    case 'verre-offert': {
      const o = v.players.find((x) => x.id === opts[0]?.target);
      return o && !o.r.done && v.order.indexOf(o.id) > v.order.indexOf(p.id) ? 'Un lancer pour lui' : 'Un lancer, manche suivante';
    }
    case 'vide-poches': return 'Lui prendre 1 Tournée';
    case 'tant-qu-on-y-est': return `+${plural(Math.min(v.rules.tourneesMax - p.tournees + costNow(v, id), p.r.played + 2), 'Tournée')}`;
    case 'petite-soeur': return 'Reprendre un Coup';
  }
  if (d.type === 'piege') return 'Poser face cachée';
  if (d.type === 'habitue') return 'Installer';
  return 'Jouable';
}

/** Ce que dit l'étiquette d'une carte en main : jouable (raison) ou pas (moment / ce qui manque). */
export function cardHint(v: CfView, legal: CfAction[], k: { uid: string; id: string }, discard = false, tuto = false): CardHint {
  const d = def(k.id);
  const type: CardType = d?.type ?? 'coup';
  if (!d) return { playable: false, label: '?', tone: 'wait', type };
  if (discard) return { playable: true, label: 'Défausser', tone: 'ok', type };
  if (playOptions(legal, k.uid).length) return { playable: true, label: playableLabel(v, legal, k.uid, k.id), tone: 'ok', type };
  const p = meOf(v);
  const cost = costNow(v, k.id);
  const short = cost > p.tournees ? { playable: false, label: plural(cost, 'Tournée'), tone: 'cost' as const, type } : null;
  const moment = (label: string) => ({ playable: false, label, tone: 'moment' as const, type });
  const wait = (label: string) => ({ playable: false, label, tone: 'wait' as const, type });
  if (v.phase === 'mulligan') return wait('Main de départ');
  if (v.phase === 'over') return wait('Partie finie');
  if (d.type === 'riposte') {
    if (v.decision === 'respond' && v.waiting.includes(p.id)) return short ?? wait('Pas contre ça');
    return moment('Tour adverse');
  }
  if (d.type === 'dernier-mot') {
    if (v.phase !== 'lastword') return moment('Dernier mot');
    if (short) return short;
    if (k.id === 'recompter' && p.r.played < 1) return wait('1 carte jouée');
    return wait('Attendez');
  }
  if (v.phase === 'lastword' || v.phase === 'discard') return moment('Votre tour');
  if (!isTurnOf(v, p.id)) return moment('Votre tour');
  if (v.decision !== 'turn') return wait('Patientez');
  if (short) return short;
  // Partie guidée : une seule action permise à la fois, les autres cartes attendent.
  if (tuto) return wait('Plus tard');
  if (d.type === 'habitue' && p.habitues.some((h) => h.id === k.id)) return wait('Déjà en jeu');
  if (d.type === 'habitue' && p.habitues.length >= v.rules.maxHabitues) return wait(`${v.rules.maxHabitues} Habitués max`);
  if (d.type === 'piege' && v.traps.filter((t) => t.owner === p.id).length >= v.rules.maxTraps) return wait(`${v.rules.maxTraps} pièges max`);
  const second = playsAfter(v, p.id);
  switch (k.id) {
    case 'tete-tourne': case 'coup-pouce': case 'bon-numero': return wait('Après un lancer');
    case 'de-sous-table': return wait(second ? 'Ses dés d’abord' : 'En second');
    case 'tournee-generale': return wait(second ? 'Après un lancer' : 'En second');
    case 'fermeture': return wait('Aucun Habitué');
    case 'grand-enchainement': return wait('Après un Coup');
    case 'petite-soeur': return wait('Aucun Coup défaussé');
    case 'vide-poches': return wait('Ni Tournée ni carte à lui prendre');
  }
  return wait('Pas maintenant');
}

/** Étiquettes de toute la main et nombre de cartes jouables maintenant. */
export function handHints(v: CfView, legal: CfAction[], discard = false, tuto = false): { hints: Record<string, CardHint>; playable: number } {
  const hints: Record<string, CardHint> = {};
  let playable = 0;
  for (const k of meOf(v).hand ?? []) {
    const h = cardHint(v, legal, k, discard, tuto);
    hints[k.uid] = h;
    if (h.playable) playable++;
  }
  return { hints, playable };
}

// ------------------------------------------------------------------------------------------------
// Bandeau d'instruction

export interface Banner { mine: boolean; title: string; text: string; tone: 'gold' | 'wait' | 'lastword' | 'riposte' | 'violet' }

/** Meilleure combinaison déjà posée par un adversaire (celle à battre). */
export function toBeat(v: CfView): { label: string; who: string } | null {
  let best: { rank: number; label: string; who: string } | null = null;
  for (const p of v.players) {
    if (p.id === v.you || p.out || !p.r.done || !v.order.includes(p.id)) continue;
    const e = evalPlayer({ values: v.values }, p);
    if (!best || e.rank > best.rank) best = { rank: e.rank, label: shortCombo(e.combo.label), who: p.name };
  }
  return best;
}

/** « Bébert : 4-2-1 en 2 lancers » (bandeau pendant et après le tour adverse). */
export function rollLine(name: string, label: string, throws: number): string {
  return `${name} : ${shortCombo(label)} en ${plural(throws, 'lancer')}`;
}

export function decisionBanner(v: CfView, legal: CfAction[], spectator = false): Banner {
  const mine = !spectator && legal.length > 0;
  const who = nameIn(v, v.waiting[0]);
  const wait = (text: string): Banner => ({ mine: false, title: '', text, tone: 'wait' });
  if (v.phase === 'over') return wait('Partie terminée');
  // C'est à moi, mais l'écran finit d'animer : jamais « Vous réfléchit… ».
  if (!mine && !spectator && v.waiting.includes(v.you)) return wait('À vous dans un instant…');
  switch (v.decision) {
    case 'mulligan':
      return mine ? { mine, title: 'Votre main', text: `Choisissez jusqu’à ${plural(v.rules.mulligan, 'carte')} à changer`, tone: 'gold' } : wait(`${who} choisit sa main… attendez`);
    case 'turn': {
      if (!mine) {
        if (!spectator && v.waiting[0] === v.you) return wait('À vous dans un instant…');
        // Ce que l'adversaire a sur le tapis (les dés affichés) : même phrase qu'à la fin de son lancer.
        const tp = playerOf(v, v.waiting[0]);
        const c = tp && tp.r.throwsUsed > 0 ? comboOf(v, tp) : null;
        return wait(tp && c ? rollLine(tp.name, c.label, tp.r.throwsUsed) : `${who} joue…`);
      }
      const p = meOf(v);
      const lim = p.throwLimit ?? v.rules.maxThrows;
      const beat = toBeat(v);
      const lead = beat ? `Battez ${beat.label}` : v.order[0] === p.id ? 'Vous menez' : 'À vous de lancer';
      if (p.r.throwsUsed === 0) return { mine, title: 'À vous !', text: `${lead} · ${plural(lim, 'lancer')} au plus`, tone: 'gold' };
      const left = lim - p.r.throwsUsed;
      const c = comboOf(v, p);
      const have = c ? `Vous avez ${shortCombo(c.label)} · ` : '';
      const lead2 = have ? lead.replace(/^Battez/, 'battez').replace(/^Vous menez/, 'vous menez').replace(/^À vous de lancer$/, '') : lead;
      const head = `${have}${lead2}`.replace(/ · $/, '');
      return { mine, title: 'À vous !', text: left > 0 ? `${head} · encore ${plural(left, 'lancer')} sur ${lim}` : `${head} · plus de lancer : une carte, ou arrêtez-vous`, tone: 'gold' };
    }
    case 'respond': {
      const top = v.stack[v.stack.length - 1];
      return mine ? { mine, title: 'Riposte ?', text: `Répondez à ${top ? nameIn(v, top.owner) : 'l’adversaire'}`, tone: 'riposte' } : wait(`${who} peut répondre…`);
    }
    case 'choice':
      return mine ? { mine, title: 'À vous', text: 'Faites votre choix', tone: 'gold' } : wait(`${who} choisit…`);
    case 'lastword': {
      if (!mine) return wait(`Dernier mot : ${who} réfléchit…`);
      const me = meOf(v);
      const c = comboOf(v, me);
      const beat = toBeat(v);
      const meE = evalPlayer({ values: v.values }, me);
      const best = Math.max(...v.players.filter((p) => p.id !== me.id && v.order.includes(p.id)).map((p) => evalPlayer({ values: v.values }, p).rank));
      const state = c && beat ? (meE.rank > best ? `vous gagnez avec ${shortCombo(c.label)}` : meE.rank < best ? `vous perdez ${shortCombo(c.label)} contre ${beat.label}` : `égalité à ${shortCombo(c.label)}`) : '';
      return { mine, title: 'Dernier mot', text: `${state ? `${state} · ` : ''}jouez une carte ou passez`, tone: 'lastword' };
    }
    case 'discard': {
      const n = (meOf(v).hand?.length ?? 0) - v.rules.handMax;
      return mine ? { mine, title: 'Main pleine', text: `Défaussez jusqu’à ${v.rules.handMax} cartes (encore ${n})`, tone: 'violet' } : wait(`${who} défausse…`);
    }
  }
  return wait('');
}

// ------------------------------------------------------------------------------------------------
// Frise de la manche

export interface FriseStep { key: string; label: string; state: 'done' | 'on' | 'todo' }

const firstName = (n: string) => { const w = n.split(/\s+/)[0] ?? n; return w.length > 9 ? `${w.slice(0, 8)}.` : w; };

/** Étapes de la manche dans l'ordre réel (meneur d'abord). `stage` : forcer l'étape affichée (les comptes animés). */
export function friseSteps(v: CfView, me: string | null, stage?: 'comptes' | null): FriseStep[] {
  const order = v.order.length ? v.order : v.players.filter((p) => !p.out).map((p) => p.id);
  const keys: { key: string; label: string }[] = [
    { key: 'service', label: 'Service' },
    ...order.map((id) => ({ key: id, label: id === me ? 'Vous' : firstName(nameIn(v, id)) })),
    { key: 'lastword', label: 'Dernier mot' },
    { key: 'comptes', label: 'Comptes' },
  ];
  let on: number;
  if (stage === 'comptes' || v.phase === 'discard') on = keys.length - 1;
  else if (v.phase === 'mulligan') on = 0;
  else if (v.phase === 'turn') on = 1 + Math.min(v.turn, order.length - 1);
  else if (v.phase === 'lastword') on = keys.length - 2;
  else on = keys.length; // partie finie
  return keys.map((k, i) => ({ ...k, state: i < on ? 'done' : i === on ? 'on' : 'todo' }));
}

// ------------------------------------------------------------------------------------------------
// Pièges

/** Pièges possibles d'après les familles visibles du deck adverse. */
export function trapPossibilities(families: CardFamily[]): string[] {
  return CARDS.filter((c) => c.type === 'piege' && families.includes(c.family)).map((c) => c.name);
}
export function familiesLabel(families: CardFamily[]): string {
  return families.map((f) => FAMILY_SHORT[f]).join(' / ');
}

/** Quand un piège se déclenche (pour la victime, 2e personne). */
export const TRAP_WHEN: Record<string, string> = {
  'gueule-bois': 'quand vous perdez une manche : un seul lancer à la suivante',
  leurre: 'jamais : il ne fait rien (son poseur gagne 1 Tournée et pioche s’il est découvert)',
  'verre-de-trop': 'quand vous faites un 2e lancer dans votre tour : vous recevez 1 jeton',
  'courant-air': 'quand vous installez un Habitué ou jouez une Riposte : la carte est défaussée sans effet',
  engrenage: 'quand vous jouez votre 2e carte de la manche : elle est annulée',
  'croche-patte': 'quand vous finissez votre tour : un de vos dés est relancé au hasard',
  'main-sac': 'quand vous jouez un Coup qui coûte 1 ou plus : ce Coup est annulé',
  'ardoise-piegee': `quand vous jouez un Coup : ${ARDOISE_EXTRA} Tournées de plus, sinon le Coup est annulé`,
  'faux-421': 'quand vous finissez sur 4-2-1 : il ne vaut plus que 2',
  'coup-nenette': 'quand vous devriez gagner avec une combinaison qui vaut 1 ou 2 : elle devient une nénette',
  'retournement-veste': `quand vous devriez lui donner ${VESTE_MIN} jetons ou plus : c’est lui qui les reçoit`,
  mouchard: 'quand vous jouez un Coup : son poseur gagne 1 Tournée et pioche 1 carte',
};
export const TRAP_TIP: Record<string, string> = {
  'faux-421': 'Astuce : la « Fouine » défausse un piège avant que vous vous arrêtiez.',
  'croche-patte': 'Astuce : la Fouine défausse le piège avant ; après coup, « Recompter » peut encore rattraper le dé relancé.',
  'gueule-bois': 'Astuce : avec un seul lancer, les cartes qui changent un dé deviennent précieuses.',
  'main-sac': 'Astuce : quand un piège traîne, commencez par un Coup gratuit (0 Tournée).',
  'ardoise-piegee': 'Astuce : la Fouine défausse un piège avant que vous jouiez.',
  'coup-nenette': 'Astuce : une petite combinaison qui vaut 1 est fragile quand un piège est posé.',
  'retournement-veste': 'Astuce : méfiez-vous des gros gains quand un piège est posé devant vous.',
  mouchard: 'Astuce : la Fouine défausse un piège avant que vous jouiez vos Coups.',
  'verre-de-trop': 'Astuce : quand un piège est posé, un bon premier lancer vaut parfois mieux qu’une relance.',
  'courant-air': 'Astuce : la Fouine défausse un piège avant que vous installiez un Habitué ou ripostiez.',
  engrenage: 'Astuce : quand un piège est posé, jouez d’abord une carte bon marché pour le déclencher.',
};
const TIP_DEFAULT = 'Astuce : la Fouine défausse un piège adverse ; le Videur annule le premier piège de chaque manche.';

// ------------------------------------------------------------------------------------------------
// Annonces

export type AnnStyle = 'big' | 'strip' | 'reveal' | 'trap' | 'comptes';
export type AnnTone = CardType | 'info' | 'good' | 'bad' | 'manche' | 'comptes';
export interface Announce {
  style: AnnStyle;
  tone: AnnTone;
  kicker?: string;
  title: string;
  text?: string;
  /** Carte à montrer en grand (identifiant) ; null : piège face cachée. */
  card?: string | null;
  conseq?: string;
  hint?: string;
  /** Durée d'affichage (ms) ; touchez pour passer. */
  ms: number;
  /** Il faut toucher « Compris » (pièges et annulations qui vous frappent). */
  block?: boolean;
  /** Possibilités (piège posé). */
  list?: string[];
  /** Comptes : la manche en bref (cartes jouées, pièges, annulations), 3 lignes au plus. */
  recap?: string[];
}

/** La manche en bref, à partir des événements de la manche (ordre du journal). */
export function roundRecap(events: CfEvent[], v: CfView, me: string): string[] {
  const nm = (id: string) => (id === me ? 'Vous' : nameIn(v, id));
  const played = new Map<string, string[]>();
  const traps: string[] = [];
  const cancels: string[] = [];
  for (const e of events) {
    if (!e.player) continue;
    if (e.kind === 'carte' && e.card) played.set(e.player, [...(played.get(e.player) ?? []), cardName(e.card)]);
    else if (e.kind === 'pose') played.set(e.player, [...(played.get(e.player) ?? []), e.player === me && e.card ? `${cardName(e.card)} (piège)` : 'un piège']);
    else if (e.kind === 'piege-revele' && e.card) traps.push(`${cardName(e.card)} (${nm(e.player)})`);
    else if (e.kind === 'annule' && e.card) cancels.push(cardName(e.card));
  }
  const out: string[] = [];
  const who = [...played].map(([id, cs]) => `${nm(id)} : ${cs.join(', ')}`);
  if (who.length) out.push(`Cartes · ${who.join(' — ')}`);
  else out.push('Aucune carte jouée cette manche');
  if (traps.length) out.push(`Pièges déclenchés · ${traps.join(', ')}`);
  if (cancels.length) out.push(`Annulés · ${cancels.join(', ')}`);
  return out.slice(0, 3);
}
/**
 * Étape à jouer : des dés à animer (`strip` : la phrase du bandeau pendant le lancer ; `after` : la phrase
 * une fois les dés posés, avec leurs vraies valeurs), ou une annonce.
 */
export type PlanStep = { kind: 'dice'; ev: CfEvent; strip?: Announce; after?: Announce } | { kind: 'ann'; ann: Announce; ev?: CfEvent };

// Durées de lecture (touchez pour passer). Raccourcies le 5 novembre : le jeu doit rester vif.
// 0.39 : tout un peu plus court (Sam : « le jeu est lent »). Toucher l'annonce la passe.
export const ANN_MS = { big: 1800, strip: 1100, trap: 2300, comptes: 2600, reveal: 3200 };
const TRAP_CONSEQ = new Set(['faux-421', 'croche-patte', 'gueule-bois', 'coup-nenette', 'ardoise-piegee', 'mouchard', 'piege', 'annule', 'verre-de-trop', 'courant-air', 'engrenage']);
const noDot = (t: string) => t.replace(/[.!]\s*$/, '');

/**
 * Transforme les événements d'une mise à jour en étapes à jouer une par une : dés à animer dans le
 * bac (avec un petit bandeau) et annonces au centre. `me` : le joueur qui regarde ('' pour un
 * spectateur : tout à la 3e personne). `prev` : la vue avant ces événements (nombre de lancers…).
 */
export function planEvents(events: CfEvent[], me: string, next: CfView, prev: CfView | null): PlanStep[] {
  const out: PlanStep[] = [];
  const name = (id?: string) => (id ? nameIn(next, id) : '?');
  const typeOf = (id?: string): CardType => def(id)?.type ?? 'coup';
  const skip = new Set<number>();
  const strip = (title: string, tone: AnnTone, ms = ANN_MS.strip): Announce => ({ style: 'strip', tone, title: noDot(title), ms });
  for (let i = 0; i < events.length; i++) {
    if (skip.has(i)) continue;
    const e = events[i];
    const mine = !!me && e.player === me;
    const n = name(e.player);
    switch (e.kind) {
      case 'pioche': case 'pioche-privee': case 'tour': case 'mulligan': case 'fin': case 'calcul':
        continue;
      case 'lancer': {
        const kept = (e.dice ?? []).filter((_, j) => e.kept?.[j]);
        if (mine) {
          out.push({ kind: 'dice', ev: e, strip: strip(kept.length ? `Vous gardez ${kept.join('-')} et relancez ${plural(3 - kept.length, 'dé')}` : 'Vous lancez les dés', 'info', 0) });
          continue;
        }
        const t = kept.length ? `${n} garde ${kept.join('-')} et relance ${plural(3 - kept.length, 'dé')}` : `${n} lance les dés`;
        const pl = playerOf(next, e.player!);
        const after = pl && e.dice ? strip(rollLine(n, comboWith(next, pl, e.dice).label, e.throwIndex ?? pl.r.throwsUsed), 'info', 900) : undefined;
        out.push({ kind: 'dice', ev: e, strip: strip(t, 'info', 0), after });
        continue;
      }
      case 'fin-tour': {
        const pv = prev ? playerOf(prev, e.player!) : undefined;
        const c = e.dice ? shortCombo(comboWith(next, playerOf(next, e.player!)!, e.dice).label) : '';
        // Mon arrêt : réponse immédiate dans le bandeau (courte), puis l'adversaire enchaîne.
        if (mine) { if (c) out.push({ kind: 'ann', ev: e, ann: strip(`Vous vous arrêtez sur ${c}`, 'info', 700) }); continue; }
        const k = pv?.r.throwsUsed;
        out.push({ kind: 'ann', ev: e, ann: strip(`${n} s’arrête sur ${c}${k ? ` (${plural(k, 'lancer')})` : ''}`, 'info', 1300) });
        continue;
      }
      case 'pose': {
        if (mine) { out.push({ kind: 'ann', ev: e, ann: strip(e.text, 'piege') }); continue; }
        const owner = playerOf(next, e.player!);
        const fams = owner?.families ?? [];
        const list = trapPossibilities(fams);
        const onMe = !me || next.players.length === 2 || /sur /.test(e.text) === false || e.text.includes(nameIn(next, me));
        out.push({ kind: 'ann', ev: e, ann: {
          style: 'trap', tone: 'piege', kicker: 'Piège posé', card: null, ms: ANN_MS.trap, list,
          title: next.players.length === 2 ? `${n} pose un piège face cachée` : noDot(e.text),
          text: `${onMe && me ? 'Il se déclenchera tout seul si sa condition arrive pendant votre tour.' : 'Il se déclenchera tout seul quand sa condition arrivera.'}${list.length ? ` Avec un deck ${familiesLabel(fams.filter((f) => CARDS.some((c) => c.family === f && c.type === 'piege')))}, ça peut être : ${list.slice(0, 3).join(', ')}${list.length > 3 ? '…' : ''}` : ''}`,
        } });
        continue;
      }
      case 'carte': {
        const t = typeOf(e.card);
        if (mine) { out.push({ kind: 'ann', ev: e, ann: strip(e.text, t, 1200) }); continue; }
        // Riposte adverse qui annule votre carte, dans la même mise à jour : une seule fenêtre « Compris ».
        if (t === 'riposte' && me) {
          const j = events.findIndex((x, idx) => idx > i && x.kind === 'annule' && x.player === me);
          if (j > 0) {
            skip.add(j);
            const victim = events[j];
            out.push({ kind: 'ann', ev: e, ann: {
              style: 'reveal', tone: 'riposte', kicker: 'Riposte', card: e.card, ms: ANN_MS.reveal, block: true,
              title: `${n} riposte avec ${cardName(e.card)} !`,
              conseq: `Votre carte « ${cardName(victim.card)} » est annulée : elle ne fait rien.`,
              hint: 'Les Tournées payées sont perdues. Astuce : gardez vous aussi une Riposte pour répondre à ses cartes.',
            } });
            continue;
          }
        }
        out.push({ kind: 'ann', ev: e, ann: {
          style: 'big', tone: t, card: e.card, ms: ANN_MS.big,
          kicker: t === 'habitue' ? 'Habitué installé' : `${TYPE_META[t].label}`,
          title: noDot(e.text), text: def(e.card)?.text,
        } });
        continue;
      }
      case 'piege-revele': {
        const owner = e.player!;
        let conseq: string | undefined;
        let victim: string | undefined;
        // Conséquence qui bouge des dés (Croche-patte) : on la montre aussi dans le bac, après l'annonce.
        let diceAfter: PlanStep | null = null;
        // Le Complice (0.40) s'annonce entre le piège et sa conséquence : on regarde juste après.
        const ci = events[i + 1]?.kind === 'complice' ? i + 2 : i + 1;
        const nc = events[ci];
        if (nc && TRAP_CONSEQ.has(nc.kind) && (nc.kind !== 'annule' || /Ardoise|Main dans le sac/.test(nc.text))) {
          const nx = nc;
          conseq = nx.text; victim = nx.kind === 'piege' ? undefined : nx.player; skip.add(ci);
          // L'Engrenage : l'annulation qui suit est déjà dite dans la conséquence.
          if (nx.kind === 'engrenage' || nx.kind === 'courant-air') { const j = events.findIndex((x, idx) => idx > ci && x.kind === 'annule' && x.card === nx.card); if (j > 0) skip.add(j); }
          if (nx.dice && nx.rolled?.length) diceAfter = { kind: 'dice', ev: nx, strip: strip(noDot(nx.player === me ? nx.text.replace(/^Croche-patte : /, 'Croche-patte : ') : nx.text), 'piege', 1300) };
        }
        if (!victim) {
          const posed = prev?.traps.find((t) => t.owner === owner && (t.id === e.card || t.id === null));
          victim = posed?.target ?? (next.players.length === 2 ? next.players.find((p) => p.id !== owner)?.id : undefined);
        }
        if (me && victim === me && owner !== me) {
          out.push({ kind: 'ann', ev: e, ann: {
            style: 'reveal', tone: 'piege', card: e.card, ms: ANN_MS.reveal, block: true,
            title: `Le piège de ${n} se déclenche !`,
            conseq: conseq ?? `Il se déclenche ${TRAP_WHEN[e.card ?? ''] ?? 'quand sa condition arrive'}.`,
            hint: TRAP_TIP[e.card ?? ''] ?? TIP_DEFAULT,
          } });
        } else {
          out.push({ kind: 'ann', ev: e, ann: {
            style: 'big', tone: 'piege', card: e.card, ms: ANN_MS.big, kicker: owner === me ? 'Votre piège' : 'Piège révélé',
            title: owner === me ? `Votre piège se déclenche : ${cardName(e.card)} !` : `Le piège de ${n} se déclenche !`,
            text: conseq ?? def(e.card)?.text,
          } });
        }
        if (diceAfter) out.push(diceAfter);
        continue;
      }
      case 'annule': {
        if (mine) {
          out.push({ kind: 'ann', ev: e, ann: {
            style: 'reveal', tone: 'riposte', kicker: 'Annulée', card: e.card, ms: ANN_MS.reveal, block: true,
            title: `« ${cardName(e.card)} » est annulée`, conseq: noDot(e.text) + '.', hint: 'Les Tournées payées sont perdues.',
          } });
        } else out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'riposte', kicker: 'Annulée', card: e.card, ms: 2200, title: noDot(e.text) } });
        continue;
      }
      case 'fouine': {
        if (next.choice && next.choice.kind === 'fouine' && next.choice.player === me) continue; // la fenêtre de choix la montre en grand
        out.push({ kind: 'ann', ev: e, ann: {
          style: 'reveal', tone: 'piege', kicker: 'Fouine', card: e.card, ms: ANN_MS.reveal, block: !!me,
          title: 'La Fouine vous montre le piège', conseq: `${cardName(e.card)} : il se déclenche ${TRAP_WHEN[e.card ?? ''] ?? 'quand sa condition arrive'}.`,
          hint: 'Vous savez maintenant ce qui vous attend : jouez en conséquence.',
        } });
        continue;
      }
      case 'fouine-public':
        if (mine) continue;
        out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'coup', kicker: 'Fouine', card: 'fouine', ms: ANN_MS.big, title: noDot(e.text), text: 'Il connaît maintenant ce piège et peut payer 1 Tournée pour le défausser.' } });
        continue;
      case 'fouine-defausse':
        // 0.40 : la Fouine défausse directement ; celui qui la joue découvre le piège (« Compris »).
        out.push({ kind: 'ann', ev: e, ann: mine ? {
          style: 'reveal', tone: 'piege', kicker: 'Fouine', card: e.card, ms: ANN_MS.reveal, block: true,
          title: 'La Fouine défausse le piège', conseq: `C’était ${cardName(e.card)} : il se serait déclenché ${TRAP_WHEN[e.card ?? ''] ?? 'quand sa condition arrivait'}.`,
          hint: 'Un piège de moins devant vous.',
        } : { style: 'big', tone: 'piege', kicker: 'Piège défaussé', card: e.card, ms: ANN_MS.big, title: noDot(e.text) } });
        continue;
      case 'leurre':
        out.push({ kind: 'ann', ev: e, ann: mine ? strip(e.text, 'piege') : { style: 'big', tone: 'piege', kicker: 'Leurre', card: 'leurre', ms: ANN_MS.big, title: 'C’était un Leurre !', text: `Il ne fait rien… et ${n} gagne ${plural(LEURRE_TOURNEES, 'Tournée')} et pioche ${plural(LEURRE_DRAW, 'carte')}.` } });
        continue;
      case 'videur':
        out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'habitue', kicker: 'Le Videur', card: 'videur', ms: ANN_MS.big, title: noDot(e.text) } });
        continue;
      case 'ardoise':
        out.push({ kind: 'ann', ev: e, ann: mine || !/prend/.test(e.text) ? strip(e.text, 'info') : { style: 'big', tone: 'info', kicker: 'L’ardoise', ms: 2400, title: `${n} prend l’ardoise`, text: 'Il emprunte 3 Tournées tout de suite, mais ne recevra rien à la prochaine manche.' } });
        continue;
      case 'yeux-piquent':
        out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'riposte', kicker: 'Riposte', card: 'yeux-piquent', ms: 2400, title: noDot(e.text) } });
        continue;
      case 'manche': case 'tirage':
        out.push({ kind: 'ann', ev: e, ann: strip(e.text, 'manche', 1600) });
        continue;
      case 'commande': {
        // Commande du comptoir : annoncée en grand au début de la manche (elle reste écrite en haut).
        const k = commandeOf(next.commande);
        if (k) out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'info', kicker: 'Commande du comptoir', ms: 2600, title: k.title, text: `${k.text} Pour tout le monde, cette manche seulement.` } });
        continue;
      }
      case 'comptes': {
        const lr = next.lastRound;
        const w = lr?.winner ?? null;
        const l = lr?.loser ?? null;
        const title = !w ? 'Égalité : personne ne donne' : w === me ? 'Vous gagnez la manche' : `${name(w)} gagne la manche`;
        let text = e.text;
        const effaced = !!lr?.detail?.some((d) => d.label === 'On efface tout');
        if (w && l && lr && effaced) {
          text = l === me ? 'Vous effacez tout : vous ne recevez qu’un jeton.' : w === me ? `${name(l)} efface tout : vous ne lui donnez qu’un jeton.` : `${name(l)} efface tout : il ne reçoit qu’un jeton.`;
        } else if (w && l && lr) {
          if (lr.reversed) text = noDot(e.text);
          else if (w === me) text = `Vous donnez ${plural(lr.amount, 'jeton')} à ${name(l)} : c’est le but, vous vous déchargez !`;
          else if (l === me) text = `${name(w)} vous donne ${plural(lr.amount, 'jeton')}.`;
          else text = `${name(w)} donne ${plural(lr.amount, 'jeton')} à ${name(l)}.`;
          // Détail du calcul dès qu'une carte l'a changé (Note salée, Pilier, Double tournée…), et plafond éventuel.
          if (!lr.reversed && lr.detail && lr.detail.length > 1) text += ` Calcul : ${lr.detail.map((d, i) => (i === 0 ? `${d.label} ${d.delta}` : `${d.label} ${d.delta >= 0 ? '+' : '−'}${Math.abs(d.delta)}`)).join(' · ')}.`;
          if (!lr.reversed && lr.cappedFrom) text += ` ${w === me ? 'Vous n’aviez' : `${name(w)} n’avait`} que ${plural(lr.amount, 'jeton')} : ${lr.cappedFrom} prévus.`;
        }
        out.push({ kind: 'ann', ev: e, ann: { style: 'comptes', tone: 'comptes', kicker: 'Comptes', ms: ANN_MS.comptes, title, text } });
        continue;
      }
      case 'sortie':
        out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: mine ? 'good' : 'info', ms: 2400, title: noDot(e.text) } });
        continue;
    }
    // Effets de cartes qui changent des dés : le bac les anime, un bandeau les explique.
    if (e.dice && e.player) { out.push({ kind: 'dice', ev: e, strip: strip(e.text, typeOf(e.card) ?? 'info', 1700) }); continue; }
    if (e.kind === 'defausse' && mine) continue;
    out.push({ kind: 'ann', ev: e, ann: strip(e.text, e.card ? typeOf(e.card) : e.who === me && me ? 'bad' : 'info') });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Dés gardés (comme au 421 classique : la sélection reste d'un lancer à l'autre)

/**
 * Ma sélection de dés gardés après un événement de dés du moteur : après mon lancer, exactement les
 * dés que le moteur a gardés (Croche-patte en libère un, Les yeux qui piquent les libèrent tous) ;
 * un dé relancé par une carte (Dé sous la table, Tournée générale…) n'est plus gardé ; un dé dont la
 * valeur change (Tête qui tourne, Coup de pouce, Le bon numéro…) garde son état.
 */
export function keepAfter(keep: boolean[], e: CfEvent, me: string): boolean[] {
  if (!me || e.player !== me) return keep;
  if (e.kind === 'lancer') return e.kept ? [...e.kept] : [false, false, false];
  if (e.rolled?.length) return keep.map((x, i) => x && !e.rolled!.includes(i));
  return keep;
}

// ------------------------------------------------------------------------------------------------
// Fenêtre de riposte : ce que la carte adverse va vous faire

export function threatLine(v: CfView): string {
  const top = v.stack[v.stack.length - 1];
  if (!top) return '';
  const o = playerOf(v, top.owner);
  const n = o?.name ?? 'L’adversaire';
  if (top.kind === 'keep') {
    const kept = (o?.r.dice ?? []).filter((_, i) => top.keep[i]);
    return `${n} garde ${kept.join('-')} et va relancer le reste.`;
  }
  if (!top.cardId) return 'Un piège va être posé face cachée devant vous.';
  const pr = top.params;
  const me = meOf(v);
  const dieOf = (p: CfPlayerView | undefined, i?: number) => (p && i !== undefined ? p.r.dice[i] : 0);
  switch (top.cardId) {
    case 'de-sous-table': {
      const t = playerOf(v, pr.target ?? me.id) ?? me;
      const c = comboOf(v, t);
      return `Ici : il relance votre ${dieOf(t, pr.die)}${c ? ` → votre ${shortCombo(c.label)} est menacé` : ''}.`;
    }
    case 'tete-tourne': case 'coup-pouce': case 'recompter': case 'bon-numero': {
      if (!o || pr.die === undefined) break;
      const from = dieOf(o, pr.die);
      const to = top.cardId === 'tete-tourne' ? 7 - from : top.cardId === 'bon-numero' ? pr.face! : from + (pr.delta ?? 0);
      const dice = [...o.r.dice]; dice[pr.die] = to;
      return `Ici : son ${from} devient un ${to} → il passe à ${shortCombo(comboWith(v, o, dice).label)}.`;
    }
    case 'tournee-generale': return 'Ici : vous relancez tous vos dés, lui aussi, puis il peut encore en relancer un.';
    case 'domino': return `Ici : vous perdez toutes vos Tournées (${me.tournees}).`;
    case 'fermeture': { if (!pr.habitue) return `Ici : il gagne ${FERMETURE_TOURNEES} Tournées.`; const h = v.players.flatMap((p) => p.habitues).find((x) => x.uid === pr.habitue); return `Ici : ${cardName(h?.id)} rentre chez lui (défaussé).`; }
    case 'double-tournee': return 'Ici : s’il gagne la manche, sa combinaison vaut le double.';
    case 'pari-comptoir': return 'Ici : le perdant de la manche recevra 2 jetons de plus.';
    case 'note-salee': return 'Ici : s’il gagne, vous recevrez 2 jetons de plus.';
    case 'cul-sec': return 'Ici : il gagne un lancer de plus ce tour.';
    case 'tournee-patron': return `Ici : il gagne ${TOURNEE_PATRON_GAIN} Tournées et pioche 1 carte.`;
    case 'fouine': return 'Ici : il défausse un de vos pièges.';
    case 'verre-offert': return pr.target === me.id ? `Ici : vous n’aurez qu’un seul lancer à votre prochain tour${!me.r.done && v.order.indexOf(me.id) > v.order.indexOf(top.owner) ? ' (celui-ci)' : ''}.` : 'Ici : son adversaire n’aura qu’un seul lancer.';
    case 'vide-poches': return pr.target === me.id ? 'Ici : on vous prend 1 Tournée et vous défaussez une carte de votre main au hasard.' : 'Ici : 1 Tournée prise et une carte de main défaussée au hasard.';
    case 'tant-qu-on-y-est': return `Ici : il gagne ${plural((o?.r.played ?? 0) + 1, 'Tournée')}.`;
    case 'pot-aux-roses': case 'ticket-caisse': case 'reaction-chaine': {
      const under = v.stack[v.stack.length - 2];
      const what = under && under.kind === 'card' && under.cardId ? `« ${cardName(under.cardId)} »` : 'la carte';
      return `Ici : il annule ${what}${under && under.owner === me.id ? ', votre carte' : ''}.`;
    }
    case 'pourboire': return pr.target === me.id ? `Ici : il vous donne 1 de ses jetons${o && o.tokens <= 1 ? ' : son dernier, il gagnerait la partie' : ''}.` : 'Ici : il donne 1 de ses jetons.';
    case 'coup-etrier': return `Ici : il relance son ${dieOf(o, pr.die) === 1 ? 'as' : dieOf(o, pr.die)} au hasard.`;
    case 'petite-soeur': { const t = o ? [...o.discard].reverse().find(petiteSoeurOk) : undefined; return `Ici : il reprend en main ${t ? `« ${cardName(t.id)} »` : 'une carte de sa défausse'}.`; }
    case 'efface-tout': return 'Ici : s’il perd la manche, il ne recevra qu’un jeton.';
    case 'trinquer': return pr.target === me.id ? 'Ici : un de vos dés et un des siens, pris au hasard, changent de camp.' : 'Ici : un de ses dés et un dé de son adversaire changent de camp.';
  }
  const d = def(top.cardId);
  if (d?.type === 'habitue') return `Ici : ${d.name} s’installe devant lui pour ${plural(v.rules.habitueRounds ?? 3, 'manche')}.`;
  return d?.text ?? '';
}

export { FAMILY_LABEL };
