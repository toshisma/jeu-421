import { tr } from '../i18n/lang';
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
import { type CardFamily, type CardType } from '../../../shared/cards/catalog';
import { CARDS, CARD_BY_ID, FAMILY_LABEL, cfText, comboLabel } from './i18n';
import { ADDITION_MIN, ARDOISE_EXTRA, PLAT_TOURNEES, FERMETURE_TOURNEES, PEAU_MIN, TOURNEE_PATRON_GAIN, LEURRE_DRAW, LEURRE_TOURNEES, VESTE_MIN, commandeOf, echoSource, evalPlayer, maxTrapsOn, petiteSoeurOk, type CfAction, type CfEvent, type CfPlayerView, type CfView } from '../../../shared/cards/engine';
import { comboOf, comboWith, costNow, isTurnOf, meOf, nameIn, playOptions, playerOf, playsAfter, plural } from './describe';
import { FAMILY_SHORT } from './meta';
import { TYPE_META } from './cardTypes';

const def = (id: string | null | undefined) => (id ? CARD_BY_ID[id] : undefined);
export const cardName = (id: string | null | undefined) => def(id)?.name ?? tr('cf.board.une_carte');

/** « 421 » → « 4-2-1 », « 6-1-1 (deux as) » → « 6-1-1 ». */
export function shortCombo(label: string): string {
  if (label === '421') return '4-2-1';
  return comboLabel(label).replace(/ \((deux as|two aces|zwei Asse|twee azen)\)$/, '');
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
    case 'tete-tourne': return bestDice(v, p, opts, (o) => 7 - p.r.dice[o.die!]) ?? tr('cf.board.retourner_un_de');
    case 'coup-pouce': case 'recompter': return bestDice(v, p, opts, (o) => p.r.dice[o.die!] + (o.delta ?? 0)) ?? tr('cf.board.1_a_un_de');
    case 'bon-numero': { const b = bestDice(v, p, opts, (o) => o.face!); return b ? `→ ${b.split(' : ')[1]}` : tr('cf.board.choisir_une_face'); }
    case 'fouine': return opts.some((o) => o.trap) ? tr('cf.board.defausser_son_piege') : tr('cf.board.piocher_1_carte');
    case 'tournee-patron': return tr('cf.board.tournees', { TOURNEE_PATRON_GAIN: TOURNEE_PATRON_GAIN });
    case 'cul-sec': return tr('cf.board.1_lancer_1_carte');
    case 'coup-coude': return tr('cf.board.piocher_1_carte');
    case 'mise-bouche': return tr('cf.board.1_carte_suivante_2');
    case 'calcul-mental': return tr('cf.board.garder_1_sur_3');
    case 'pari-comptoir': return tr('cf.board.pari_2_jetons');
    case 'double-tournee': return tr('cf.board.gain_double');
    case 'de-sous-table': return opts.length && opts.every((o) => o.target === p.id) ? tr('cf.board.relancer_votre_de') : tr('cf.board.relancer_son_de');
    case 'tournee-generale': return tr('cf.board.tout_relancer');
    case 'domino': { const o = v.players.find((x) => x.id === opts[0]?.target); const n = o ? o.tournees : 0; return tr('cf.board.lui_oter', { tournees: plural(n, 'Tournée') }); }
    case 'fermeture': return v.players.some((o) => o.id !== p.id && o.habitues.length) ? tr('cf.board.chasser_un_habitue') : tr('cf.board.tournees_2', { FERMETURE_TOURNEES: FERMETURE_TOURNEES });
    case 'grand-enchainement': return p.r.lastCoup ? tr('cf.board.rejouer_le_coup') : tr('cf.board.piocher_2_cartes');
    case 'note-salee': return tr('cf.board.2_jetons_donnes');
    case 'ticket-caisse': case 'reaction-chaine': case 'pot-aux-roses': return tr('cf.board.annuler_sa_carte');
    case 'pourboire': return p.tokens <= 1 ? tr('cf.board.dernier_jeton_gagne') : tr('cf.board.1_jeton_donne_1_carte');
    case 'coup-etrier': return tr('cf.board.relancer_un_de_vos_des');
    case 'yeux-piquent': return tr('cf.board.annuler_son_coup_de_des');
    case 'efface-tout': return tr('cf.board.ne_recevoir_qu_un_jeton');
    case 'trinquer': return tr('cf.board.echanger_un_de');
    case 'verre-offert': {
      const o = v.players.find((x) => x.id === opts[0]?.target);
      return o && !o.r.done && v.order.indexOf(o.id) > v.order.indexOf(p.id) ? tr('cf.board.un_lancer_pour_lui') : tr('cf.board.un_lancer_manche_suivante');
    }
    case 'vide-poches': return tr('cf.board.lui_prendre_1_tournee');
    case 'tant-qu-on-y-est': return `+${plural(Math.min(v.rules.tourneesMax - p.tournees + costNow(v, id), p.r.played + 2), 'Tournée')}`;
    case 'petite-soeur': return tr('cf.board.reprendre_un_coup');
    // 0.46
    case 'cafe-serre': return p.habitues.length ? tr('cf.board.1_carte_1_tournee') : tr('cf.board.piocher_1_carte');
    case 'plat-du-jour': return tr('cf.board.tournees_ensuite', { PLAT_TOURNEES: PLAT_TOURNEES });
    case 'boule-de-neige': return tr('cf.board.piocher', { cartes: plural(Math.min(3, p.r.played), 'carte') });
    case 'effet-papillon': return tr('cf.board.1_carte_suivantes_1');
    case 'addition': return tr('cf.board.au_moins_si_gagne', { ADDITION_MIN: ADDITION_MIN });
    case 'sante': return tr('cf.board.1_jeton_au_gagnant');
    case 'compte-rond': return `+${plural(Math.min(3, p.r.played), 'Tournée')}`;
    case 'petit-dernier': return tr('cf.board.relancer_un_de');
    case 'calva': return bestDice(v, p, opts, (o) => 7 - p.r.dice[o.die!]) ?? tr('cf.board.retourner_un_de');
    case 'miroir': return bestDice(v, p, opts, (o) => o.face!) ?? tr('cf.board.copier_un_de');
    case 'derniere-maille': { const b = bestDice(v, p, opts, (o) => o.face!); return b ? `→ ${b.split(' : ')[1]}` : tr('cf.board.choisir_une_face'); }
    case 'ricochet': return bestDice(v, p, opts, (o) => p.r.dice[o.die!] + (o.delta ?? 0)) ?? tr('cf.board.1_a_un_de');
    case 'fee-verte': return tr('cf.board.viser_une_face');
    case 'verres-echanges': return tr('cf.board.echanger_vos_des');
    case 'debauchage': return opts.some((o) => o.habitue) ? tr('cf.board.debaucher_un_habitue') : tr('cf.board.piocher_2_cartes');
    case 'retrouvailles': return tr('cf.board.rappeler_un_habitue');
    case 'boucle': return tr('cf.board.reprendre_2_cartes');
    case 'passe-passe': return tr('cf.board.reprendre_un_piege_1_tournee');
    case 'denonciation': return tr('cf.board.defausser_son_piege');
    case 'embuscade': return tr('cf.board.poser_vos_pieges');
    case 'echo': { const src = echoSource(v, p.id); return src ? tr('cf.board.rejouer', { a: cardName(src).split(' ')[0] }) : tr('cf.boardparts.rejouer'); }
    case 'table-reservee': case 'retour-envoyeur': case 'flagrant-delit': return tr('cf.board.annuler_sa_carte');
    case 'a-la-votre': return tr('cf.board.annuler_sa_riposte');
  }
  if (d.type === 'piege') return tr('cf.boardparts.poser_face_cachee');
  if (d.type === 'habitue') return tr('cf.boardparts.installer');
  return tr('cf.boardparts.jouable');
}

/** Ce que dit l'étiquette d'une carte en main : jouable (raison) ou pas (moment / ce qui manque). */
export function cardHint(v: CfView, legal: CfAction[], k: { uid: string; id: string }, discard = false, tuto = false): CardHint {
  const d = def(k.id);
  const type: CardType = d?.type ?? 'coup';
  if (!d) return { playable: false, label: '?', tone: 'wait', type };
  if (discard) return { playable: true, label: tr('cf.boardparts.defausser'), tone: 'ok', type };
  if (playOptions(legal, k.uid).length) return { playable: true, label: playableLabel(v, legal, k.uid, k.id), tone: 'ok', type };
  const p = meOf(v);
  const cost = costNow(v, k.id);
  const short = cost > p.tournees ? { playable: false, label: plural(cost, 'Tournée'), tone: 'cost' as const, type } : null;
  const moment = (label: string) => ({ playable: false, label, tone: 'moment' as const, type });
  const wait = (label: string) => ({ playable: false, label, tone: 'wait' as const, type });
  if (v.phase === 'mulligan') return wait(tr('cf.boardparts.main_de_depart'));
  if (v.phase === 'over') return wait(tr('cf.board.partie_finie'));
  if (d.type === 'riposte') {
    if (v.decision === 'respond' && v.waiting.includes(p.id)) return short ?? wait(tr('cf.board.pas_contre_ca'));
    return moment(tr('cf.board.tour_adverse'));
  }
  if (d.type === 'dernier-mot') {
    if (v.phase !== 'lastword') return moment(tr('cf.boardparts.dernier_mot'));
    if (short) return short;
    if ((k.id === 'recompter' || k.id === 'compte-rond') && p.r.played < 1) return wait(tr('cf.board.1_carte_jouee'));
    if (k.id === 'derniere-maille' && p.r.played < 2) return wait(tr('cf.board.2_cartes_jouees'));
    if (k.id === 'denonciation') return wait(tr('cf.board.aucun_piege'));
    return wait(tr('cf.board.attendez'));
  }
  if (v.phase === 'lastword' || v.phase === 'discard') return moment(tr('cf.board.votre_tour'));
  if (!isTurnOf(v, p.id)) return moment(tr('cf.board.votre_tour'));
  if (v.decision !== 'turn') return wait(tr('cf.board.patientez'));
  if (short) return short;
  // Partie guidée : une seule action permise à la fois, les autres cartes attendent.
  if (tuto) return wait(tr('cf.challengebanner.plus_tard'));
  if (d.type === 'habitue' && p.habitues.some((h) => h.id === k.id)) return wait(tr('cf.board.deja_en_jeu'));
  if (d.type === 'habitue' && p.habitues.length >= v.rules.maxHabitues) return wait(tr('cf.board.habitues_max', { maxHabitues: v.rules.maxHabitues }));
  if (p.r.locked) return wait(tr('cf.board.bloque_ce_tour'));
  if (d.type === 'piege' && v.traps.filter((t) => t.owner === p.id).length >= v.rules.maxTraps) return wait(tr('cf.board.pieges_max', { maxTraps: v.rules.maxTraps }));
  if (d.type === 'piege') return wait(tr('cf.board.pieges_devant_lui', { a: maxTrapsOn(v) }));
  const second = playsAfter(v, p.id);
  switch (k.id) {
    case 'tete-tourne': case 'coup-pouce': case 'bon-numero': return wait(tr('cf.board.apres_un_lancer'));
    case 'de-sous-table': case 'tournee-generale': return wait(tr('cf.board.apres_un_lancer'));
    case 'fermeture': return wait(tr('cf.board.proteges_par_le_patron'));
    case 'grand-enchainement': return wait(tr('cf.board.apres_un_coup'));
    case 'petite-soeur': case 'boucle': return wait(tr('cf.board.aucun_coup_defausse'));
    case 'petit-dernier': case 'miroir': case 'fee-verte': return wait(tr('cf.board.apres_un_lancer'));
    case 'ricochet': return wait(p.r.played < 1 ? tr('cf.board.apres_une_carte') : tr('cf.board.apres_un_lancer'));
    case 'verres-echanges': return wait(second ? tr('cf.board.apres_un_lancer') : tr('cf.board.en_second'));
    case 'debauchage': return wait(tr('cf.board.aucun_habitue'));
    case 'retrouvailles': return wait(tr('cf.board.aucun_habitue_defausse'));
    case 'passe-passe': return wait(tr('cf.board.aucun_piege_pose'));
    case 'embuscade': return wait(tr('cf.board.aucun_piege_en_main'));
    case 'echo': return wait(tr('cf.board.apres_son_coup'));
    case 'vide-poches': return wait(tr('cf.board.ni_tournee_ni_carte_a_lui'));
  }
  return wait(tr('cf.board.pas_maintenant'));
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
  return tr('cf.board.en', { name: name, a: shortCombo(label), lancers: plural(throws, 'lancer') });
}

export function decisionBanner(v: CfView, legal: CfAction[], spectator = false): Banner {
  const mine = !spectator && legal.length > 0;
  const who = nameIn(v, v.waiting[0]);
  const wait = (text: string): Banner => ({ mine: false, title: '', text, tone: 'wait' });
  if (v.phase === 'over') return wait(tr('cf.game.partie_terminee'));
  // C'est à moi, mais l'écran finit d'animer : jamais « Vous réfléchit… ».
  if (!mine && !spectator && v.waiting.includes(v.you)) return wait(tr('cf.board.a_vous_dans_un_instant'));
  switch (v.decision) {
    case 'mulligan':
      return mine ? { mine, title: tr('cf.board.votre_main'), text: tr('cf.board.choisissez_jusqu_a_a_changer', { cartes: plural(v.rules.mulligan, 'carte') }), tone: 'gold' } : wait(tr('cf.board.choisit_sa_main_attendez', { who: who }));
    case 'turn': {
      if (!mine) {
        if (!spectator && v.waiting[0] === v.you) return wait(tr('cf.board.a_vous_dans_un_instant'));
        // Ce que l'adversaire a sur le tapis (les dés affichés) : même phrase qu'à la fin de son lancer.
        const tp = playerOf(v, v.waiting[0]);
        const c = tp && tp.r.throwsUsed > 0 ? comboOf(v, tp) : null;
        return wait(tp && c ? rollLine(tp.name, c.label, tp.r.throwsUsed) : tr('cf.board.joue', { who: who }));
      }
      const p = meOf(v);
      const lim = p.throwLimit ?? v.rules.maxThrows;
      const beat = toBeat(v);
      const lead = beat ? tr('cf.board.battez', { label: beat.label }) : v.order[0] === p.id ? tr('cf.board.vous_menez') : tr('cf.board.a_vous_de_lancer');
      if (p.r.throwsUsed === 0) return { mine, title: tr('cf.board.a_vous'), text: tr('cf.board.au_plus', { lead: lead, lancers: plural(lim, 'lancer') }), tone: 'gold' };
      const left = lim - p.r.throwsUsed;
      const c = comboOf(v, p);
      const have = c ? tr('cf.board.vous_avez', { a: shortCombo(c.label) }) : '';
      // Déjà devant (ou à égalité) : on ne demande plus de « battre » une combinaison déjà battue.
      const myRank = evalPlayer({ values: v.values }, p).rank;
      const bestRank = beat ? Math.max(...v.players.filter((o) => o.id !== p.id && !o.out && o.r.done && v.order.includes(o.id)).map((o) => evalPlayer({ values: v.values }, o).rank)) : -Infinity;
      const lead2 = !have ? lead : beat && myRank > bestRank ? tr('cf.board.vous_menez_2') : beat && myRank === bestRank ? tr('cf.board.egalite_avec', { label: beat.label }) : lead.replace(/^Battez/, 'battez').replace(/^Vous menez/, tr('cf.board.vous_menez_2')).replace(/^À vous de lancer$/, '');
      const head = `${have}${lead2}`.replace(/ · $/, '');
      return { mine, title: tr('cf.board.a_vous'), text: left > 0 ? tr('cf.board.encore_sur', { head: head, lancers: plural(left, 'lancer'), lim: lim }) : tr('cf.board.plus_de_lancer_une_carte_ou', { head: head }), tone: 'gold' };
    }
    case 'respond': {
      const top = v.stack[v.stack.length - 1];
      return mine ? { mine, title: tr('cf.board.riposte'), text: tr('cf.board.repondez_a', { a: top ? nameIn(v, top.owner) : tr('cf.board.l_adversaire') }), tone: 'riposte' } : wait(tr('cf.board.peut_repondre', { who: who }));
    }
    case 'choice':
      return mine ? { mine, title: tr('cf.board.a_vous_2'), text: tr('cf.board.faites_votre_choix'), tone: 'gold' } : wait(tr('cf.board.choisit', { who: who }));
    case 'lastword': {
      if (!mine) return wait(tr('cf.board.dernier_mot_reflechit', { who: who }));
      const me = meOf(v);
      const c = comboOf(v, me);
      const beat = toBeat(v);
      const meE = evalPlayer({ values: v.values }, me);
      const best = Math.max(...v.players.filter((p) => p.id !== me.id && v.order.includes(p.id)).map((p) => evalPlayer({ values: v.values }, p).rank));
      const state = c && beat ? (meE.rank > best ? tr('cf.board.vous_gagnez_avec', { a: shortCombo(c.label) }) : meE.rank < best ? tr('cf.board.vous_perdez_contre', { a: shortCombo(c.label), label: beat.label }) : tr('cf.board.egalite_a', { a: shortCombo(c.label) })) : '';
      return { mine, title: tr('cf.boardparts.dernier_mot'), text: tr('cf.board.jouez_une_carte_ou_passez', { a: state ? `${state} · ` : '' }), tone: 'lastword' };
    }
    case 'discard': {
      const n = (meOf(v).hand?.length ?? 0) - v.rules.handMax;
      return mine ? { mine, title: tr('cf.board.main_pleine'), text: tr('cf.board.defaussez_jusqu_a_cartes_encore', { handMax: v.rules.handMax, n: n }), tone: 'violet' } : wait(tr('cf.board.defausse', { who: who }));
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
    { key: 'service', label: tr('cf.info.service') },
    ...order.map((id) => ({ key: id, label: id === me ? tr('cf.boardparts.vous') : firstName(nameIn(v, id)) })),
    { key: 'lastword', label: tr('cf.boardparts.dernier_mot') },
    { key: 'comptes', label: tr('cf.boardparts.comptes') },
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
  get 'gueule-bois'() { return tr('cf.board.quand_vous_perdez_une_manche_un'); },
  get leurre() { return tr('cf.board.jamais_il_ne_fait_rien_son'); },
  get 'verre-de-trop'() { return tr('cf.board.quand_vous_faites_un_2e_lancer'); },
  get 'courant-air'() { return tr('cf.board.quand_vous_installez_un_habitue_ou'); },
  get engrenage() { return tr('cf.board.quand_vous_jouez_votre_2e_carte'); },
  get 'croche-patte'() { return tr('cf.board.quand_vous_finissez_votre_tour_un'); },
  get 'main-sac'() { return tr('cf.board.quand_vous_jouez_un_coup_qui'); },
  get 'ardoise-piegee'() { return tr('cf.board.quand_vous_jouez_un_coup_tournees', { ARDOISE_EXTRA: ARDOISE_EXTRA }); },
  get 'faux-421'() { return tr('cf.board.quand_vous_finissez_sur_4_2'); },
  get 'coup-nenette'() { return tr('cf.board.quand_vous_devriez_gagner_avec_une'); },
  get 'retournement-veste'() { return tr('cf.board.quand_vous_devriez_lui_donner_jetons', { VESTE_MIN: VESTE_MIN }); },
  get mouchard() { return tr('cf.board.quand_vous_jouez_un_coup_son'); },
  get 'pique-assiette'() { return tr('cf.board.quand_vous_gagnez_des_tournees_grace'); },
  get hoquet() { return tr('cf.board.quand_vous_relancez_en_gardant_des'); },
  get 'der-des-ders'() { return tr('cf.board.quand_vous_perdez_une_manche_vous'); },
  get 'mot-de-trop'() { return tr('cf.board.quand_vous_jouez_un_dernier_mot'); },
  get 'peau-banane'() { return tr('cf.board.quand_vous_vous_arretez_sur_une', { PEAU_MIN: PEAU_MIN }); },
  get 'attrape-nigaud'() { return tr('cf.board.quand_vous_posez_un_piege_devant'); },
  get 'lot-consolation'() { return tr('cf.board.quand_vous_gagnez_une_manche_son'); },
  get souriciere() { return tr('cf.board.quand_vous_jouez_votre_1re_carte'); },
  get 'noeud-coulant'() { return tr('cf.board.quand_vous_jouez_votre_2e_carte_2'); },
};
export const TRAP_TIP: Record<string, string> = {
  get 'faux-421'() { return tr('cf.board.astuce_la_fouine_defausse_un_piege'); },
  get 'croche-patte'() { return tr('cf.board.astuce_la_fouine_defausse_le_piege'); },
  get 'gueule-bois'() { return tr('cf.board.astuce_avec_un_seul_lancer_les'); },
  get 'main-sac'() { return tr('cf.board.astuce_quand_un_piege_traine_commenc'); },
  get 'ardoise-piegee'() { return tr('cf.board.astuce_la_fouine_defausse_un_piege_2'); },
  get 'coup-nenette'() { return tr('cf.board.astuce_une_petite_combinaison_qui_va'); },
  get 'retournement-veste'() { return tr('cf.board.astuce_mefiez_vous_des_gros_gains'); },
  get mouchard() { return tr('cf.board.astuce_la_fouine_defausse_un_piege_3'); },
  get 'verre-de-trop'() { return tr('cf.board.astuce_quand_un_piege_est_pose'); },
  get 'courant-air'() { return tr('cf.board.astuce_la_fouine_defausse_un_piege_4'); },
  get engrenage() { return tr('cf.board.astuce_quand_un_piege_est_pose_2'); },
  get 'pique-assiette'() { return tr('cf.board.astuce_la_fouine_defausse_un_piege_5'); },
  get hoquet() { return tr('cf.board.astuce_quand_un_piege_est_pose_3'); },
  get 'der-des-ders'() { return tr('cf.board.astuce_on_efface_tout_ou_le'); },
  get 'mot-de-trop'() { return tr('cf.board.astuce_jouez_vos_cartes_pendant_votr'); },
  get 'peau-banane'() { return tr('cf.board.astuce_la_fouine_defausse_un_piege_6'); },
  get 'attrape-nigaud'() { return tr('cf.board.astuce_la_fouine_ou_la_denonciation'); },
  get 'lot-consolation'() { return tr('cf.board.astuce_gagner_reste_le_but_ce'); },
  get souriciere() { return tr('cf.board.astuce_quand_un_piege_est_pose_4'); },
  get 'noeud-coulant'() { return tr('cf.board.astuce_quand_un_piege_est_pose_5'); },
};
const TIP_DEFAULT = tr('cf.board.astuce_la_fouine_defausse_un_piege_7');

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
  /** Joueur qui joue la carte (la carte arrive de sa case). */
  from?: string;
}

/** La manche en bref, à partir des événements de la manche (ordre du journal). */
export function roundRecap(events: CfEvent[], v: CfView, me: string): string[] {
  const nm = (id: string) => (id === me ? tr('cf.boardparts.vous') : nameIn(v, id));
  const played = new Map<string, string[]>();
  const traps: string[] = [];
  const cancels: string[] = [];
  for (const e of events) {
    if (!e.player) continue;
    if (e.kind === 'carte' && e.card) played.set(e.player, [...(played.get(e.player) ?? []), cardName(e.card)]);
    else if (e.kind === 'pose') played.set(e.player, [...(played.get(e.player) ?? []), e.player === me && e.card ? tr('cf.board.piege', { a: cardName(e.card) }) : tr('cf.board.un_piege')]);
    else if (e.kind === 'piege-revele' && e.card) traps.push(`${cardName(e.card)} (${nm(e.player)})`);
    else if (e.kind === 'annule' && e.card) cancels.push(cardName(e.card));
  }
  const out: string[] = [];
  const who = [...played].map(([id, cs]) => `${nm(id)} : ${cs.join(', ')}`);
  if (who.length) out.push(tr('cf.board.cartes', { a: who.join(' — ') }));
  else out.push(tr('cf.board.aucune_carte_jouee_cette_manche'));
  if (traps.length) out.push(tr('cf.board.pieges_declenches', { a: traps.join(', ') }));
  if (cancels.length) out.push(tr('cf.board.annules', { a: cancels.join(', ') }));
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
/**
 * Temps de lecture d'un texte (demande de Sam, novembre : « laisser plus longtemps le texte des petits
 * événements ») : une base, plus ~45 ms par caractère, entre `min` et `max`. Toucher passe toujours.
 */
export const readMs = (text: string | undefined, min: number, max: number, base = 1200, perChar = 45) =>
  Math.round(Math.max(min, Math.min(max, base + (text?.length ?? 0) * perChar)));
/** Petite annonce du bandeau (événement court) : au moins 2,4 s, plus si le texte est long. */
export const stripMs = (text: string) => readMs(text, 2400, 5200);
const TRAP_CONSEQ = new Set(['faux-421', 'croche-patte', 'gueule-bois', 'coup-nenette', 'ardoise-piegee', 'mouchard', 'piege', 'annule', 'verre-de-trop', 'courant-air', 'engrenage',
  'pique-assiette', 'hoquet', 'peau-banane', 'mot-de-trop', 'attrape-nigaud', 'lot-consolation', 'souriciere', 'noeud-coulant']);
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
          out.push({ kind: 'dice', ev: e, strip: strip(kept.length ? tr('cf.board.vous_gardez_et_relancez', { a: kept.join('-'), des: plural(3 - kept.length, 'dé') }) : tr('cf.board.vous_lancez_les_des'), 'info', 0) });
          continue;
        }
        const t = kept.length ? tr('cf.board.garde_et_relance', { n: n, a: kept.join('-'), des: plural(3 - kept.length, 'dé') }) : tr('cf.board.lance_les_des', { n: n });
        const pl = playerOf(next, e.player!);
        const after = pl && e.dice ? strip(rollLine(n, comboWith(next, pl, e.dice).label, e.throwIndex ?? pl.r.throwsUsed), 'info', 900) : undefined;
        out.push({ kind: 'dice', ev: e, strip: strip(t, 'info', 0), after });
        continue;
      }
      case 'fin-tour': {
        const pv = prev ? playerOf(prev, e.player!) : undefined;
        const c = e.dice ? shortCombo(comboWith(next, playerOf(next, e.player!)!, e.dice).label) : '';
        // Mon arrêt : réponse immédiate dans le bandeau (courte), puis l'adversaire enchaîne.
        if (mine) { if (c) out.push({ kind: 'ann', ev: e, ann: strip(tr('cf.board.vous_vous_arretez_sur', { c: c }), 'info', 700) }); continue; }
        const k = pv?.r.throwsUsed;
        out.push({ kind: 'ann', ev: e, ann: strip(tr('cf.board.s_arrete_sur', { n: n, c: c, a: k ? ` (${plural(k, 'lancer')})` : '' }), 'info', 1300) });
        continue;
      }
      case 'pose': {
        if (mine) { out.push({ kind: 'ann', ev: e, ann: strip(e.text, 'piege') }); continue; }
        const owner = playerOf(next, e.player!);
        const fams = owner?.families ?? [];
        const list = trapPossibilities(fams);
        const onMe = !me || next.players.length === 2 || (e.target ? e.target === me : /sur /.test(e.text) === false || e.text.includes(nameIn(next, me)));
        // Correctif 0.46 : « sur vous » (et non « sur Vous ») quand le piège vous vise.
        const on = e.target ? (e.target === me ? 'vous' : nameIn(next, e.target)) : null;
        out.push({ kind: 'ann', ev: e, ann: {
          style: 'trap', tone: 'piege', kicker: tr('cf.board.piege_pose'), card: null, ms: ANN_MS.trap, list,
          title: next.players.length === 2 ? tr('cf.board.pose_un_piege_face_cachee', { n: n }) : on ? tr('cf.board.pose_un_piege_sur', { n: n, on: on }) : noDot(e.text),
          text: `${onMe && me ? tr('cf.board.il_se_declenchera_tout_seul_si') : tr('cf.board.il_se_declenchera_tout_seul_quand')}${list.length ? tr('cf.board.avec_un_deck_ca_peut_etre', { a: familiesLabel(fams.filter((f) => CARDS.some((c) => c.family === f && c.type === 'piege'))), b: list.slice(0, 3).join(', '), c: list.length > 3 ? '…' : '' }) : ''}`,
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
              style: 'reveal', tone: 'riposte', kicker: tr('cf.learn.riposte'), card: e.card, ms: ANN_MS.reveal, block: true,
              title: tr('cf.board.riposte_avec', { n: n, a: cardName(e.card) }),
              conseq: tr('cf.board.votre_carte_est_annulee_elle_ne', { a: cardName(victim.card) }),
              hint: tr('cf.board.les_tournees_payees_sont_perdues_ast'),
            } });
            continue;
          }
        }
        // Carte adverse : en grand au centre (illustration, nom, ce qu'elle fait), le temps de la lire.
        out.push({ kind: 'ann', ev: e, ann: {
          style: 'big', tone: t, card: e.card, ms: readMs(def(e.card)?.text, 2800, 4600, 1600, 18), from: e.player,
          kicker: t === 'habitue' ? tr('cf.board.habitue_installe') : `${TYPE_META[t].label}`,
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
          if (nx.kind === 'engrenage' || nx.kind === 'courant-air' || nx.kind === 'mot-de-trop') { const j = events.findIndex((x, idx) => idx > ci && x.kind === 'annule' && x.card === nx.card); if (j > 0) skip.add(j); }
          if (nx.dice && nx.rolled?.length) diceAfter = { kind: 'dice', ev: nx, strip: strip(noDot(nx.player === me ? nx.text.replace(/^Croche-patte : /, tr('cf.board.croche_patte')) : nx.text), 'piege', 1300) };
        }
        if (!victim) {
          const posed = prev?.traps.find((t) => t.owner === owner && (t.id === e.card || t.id === null));
          victim = posed?.target ?? (next.players.length === 2 ? next.players.find((p) => p.id !== owner)?.id : undefined);
        }
        if (me && victim === me && owner !== me) {
          out.push({ kind: 'ann', ev: e, ann: {
            style: 'reveal', tone: 'piege', card: e.card, ms: ANN_MS.reveal, block: true,
            title: tr('cf.board.le_piege_de_se_declenche', { n: n }),
            conseq: conseq ?? tr('cf.board.il_se_declenche', { a: TRAP_WHEN[e.card ?? ''] ?? tr('cf.board.quand_sa_condition_arrive') }),
            hint: TRAP_TIP[e.card ?? ''] ?? TIP_DEFAULT,
          } });
        } else {
          out.push({ kind: 'ann', ev: e, ann: {
            style: 'big', tone: 'piege', card: e.card, ms: ANN_MS.big, kicker: owner === me ? tr('cf.board.votre_piege') : tr('cf.board.piege_revele'),
            title: owner === me ? tr('cf.board.votre_piege_se_declenche', { a: cardName(e.card) }) : tr('cf.board.le_piege_de_se_declenche', { n: n }),
            text: conseq ?? def(e.card)?.text,
          } });
        }
        if (diceAfter) out.push(diceAfter);
        continue;
      }
      case 'annule': {
        if (mine) {
          out.push({ kind: 'ann', ev: e, ann: {
            style: 'reveal', tone: 'riposte', kicker: tr('cf.board.annulee'), card: e.card, ms: ANN_MS.reveal, block: true,
            title: tr('cf.board.est_annulee', { a: cardName(e.card) }), conseq: noDot(e.text) + '.', hint: tr('cf.board.les_tournees_payees_sont_perdues'),
          } });
        } else out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'riposte', kicker: tr('cf.board.annulee'), card: e.card, ms: 2200, title: noDot(e.text) } });
        continue;
      }
      case 'fouine': {
        if (next.choice && next.choice.kind === 'fouine' && next.choice.player === me) continue; // la fenêtre de choix la montre en grand
        out.push({ kind: 'ann', ev: e, ann: {
          style: 'reveal', tone: 'piege', kicker: tr('cf.boardparts.fouine'), card: e.card, ms: ANN_MS.reveal, block: !!me,
          title: tr('cf.board.la_fouine_vous_montre_le_piege'), conseq: tr('cf.board.il_se_declenche_2', { a: cardName(e.card), b: TRAP_WHEN[e.card ?? ''] ?? tr('cf.board.quand_sa_condition_arrive') }),
          hint: tr('cf.board.vous_savez_maintenant_ce_qui_vous'),
        } });
        continue;
      }
      case 'fouine-public':
        if (mine) continue;
        out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'coup', kicker: tr('cf.boardparts.fouine'), card: 'fouine', ms: ANN_MS.big, title: noDot(e.text), text: tr('cf.board.il_connait_maintenant_ce_piege_et') } });
        continue;
      case 'fouine-defausse':
        // 0.40 : la Fouine défausse directement ; celui qui la joue découvre le piège (« Compris »).
        out.push({ kind: 'ann', ev: e, ann: mine ? {
          style: 'reveal', tone: 'piege', kicker: tr('cf.boardparts.fouine'), card: e.card, ms: ANN_MS.reveal, block: true,
          title: tr('cf.board.la_fouine_defausse_le_piege'), conseq: tr('cf.board.c_etait_il_se_serait_declenche', { a: cardName(e.card), b: TRAP_WHEN[e.card ?? ''] ?? tr('cf.board.quand_sa_condition_arrivait') }),
          hint: tr('cf.board.un_piege_de_moins_devant_vous'),
        } : { style: 'big', tone: 'piege', kicker: tr('cf.board.piege_defausse'), card: e.card, ms: ANN_MS.big, title: noDot(e.text) } });
        continue;
      case 'leurre':
        out.push({ kind: 'ann', ev: e, ann: mine ? strip(e.text, 'piege') : { style: 'big', tone: 'piege', kicker: tr('cf.board.leurre'), card: 'leurre', ms: ANN_MS.big, title: tr('cf.board.c_etait_un_leurre'), text: tr('cf.board.il_ne_fait_rien_et_gagne', { n: n, tournees: plural(LEURRE_TOURNEES, 'Tournée'), cartes: plural(LEURRE_DRAW, 'carte') }) } });
        continue;
      case 'videur':
        out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'habitue', kicker: tr('cf.board.le_videur'), card: 'videur', ms: ANN_MS.big, title: noDot(e.text) } });
        continue;
      case 'ardoise':
        out.push({ kind: 'ann', ev: e, ann: mine || !/prend/.test(e.text) ? strip(e.text, 'info') : { style: 'big', tone: 'info', kicker: tr('cf.board.l_ardoise'), ms: 2400, title: tr('cf.board.prend_l_ardoise', { n: n }), text: tr('cf.board.il_emprunte_3_tournees_tout_de') } });
        continue;
      case 'yeux-piquent':
        out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'riposte', kicker: tr('cf.learn.riposte'), card: 'yeux-piquent', ms: 2400, title: noDot(e.text) } });
        continue;
      case 'manche': case 'tirage':
        out.push({ kind: 'ann', ev: e, ann: strip(e.text, 'manche', readMs(e.text, 2600, 4200)) });
        continue;
      case 'commande': {
        // Commande du comptoir : annoncée en grand au début de la manche (elle reste écrite en haut).
        const k = commandeOf(next.commande);
        // 0.46 : deux fois plus longue au moins, selon la longueur du texte (touchez pour passer).
        if (k) { const text = tr('cf.board.pour_tout_le_monde_cette_manche', { text: cfText(k.text) }); out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: 'info', kicker: tr('cf.boardparts.commande_du_comptoir'), ms: readMs(k.title + text, 5600, 10000, 2400, 55), title: k.title, text, hint: tr('cf.board.elle_reste_ecrite_en_haut_de') } }); }
        continue;
      }
      case 'comptes': {
        const lr = next.lastRound;
        const w = lr?.winner ?? null;
        const l = lr?.loser ?? null;
        const title = !w ? tr('cf.board.egalite_personne_ne_donne') : w === me ? tr('cf.board.vous_gagnez_la_manche') : tr('cf.board.gagne_la_manche', { a: name(w) });
        let text = e.text;
        const effaced = !!lr?.detail?.some((d) => d.label === 'On efface tout');
        if (w && l && lr && effaced) {
          text = l === me ? tr('cf.board.vous_effacez_tout_vous_ne_recevez') : w === me ? tr('cf.board.efface_tout_vous_ne_lui_donnez', { a: name(l) }) : tr('cf.board.efface_tout_il_ne_recoit_qu', { a: name(l) });
        } else if (w && l && lr) {
          if (lr.reversed) text = noDot(e.text);
          else if (w === me) text = tr('cf.board.vous_donnez_a_c_est_le', { jetons: plural(lr.amount, 'jeton'), a: name(l) });
          else if (l === me) text = tr('cf.board.vous_donne', { a: name(w), jetons: plural(lr.amount, 'jeton') });
          else text = tr('cf.board.donne_a', { a: name(w), jetons: plural(lr.amount, 'jeton'), b: name(l) });
          // Détail du calcul dès qu'une carte l'a changé (Note salée, Pilier, Double tournée…), et plafond éventuel.
          if (!lr.reversed && lr.detail && lr.detail.length > 1) text += tr('cf.board.calcul', { a: lr.detail.map((d, i) => (i === 0 ? `${cfText(d.label)} ${d.delta}` : `${cfText(d.label)} ${d.delta >= 0 ? '+' : '−'}${Math.abs(d.delta)}`)).join(' · ') });
          if (!lr.reversed && lr.cappedFrom) text += tr('cf.board.que_prevus', { a: w === me ? tr('cf.board.vous_n_aviez') : tr('cf.board.n_avait', { a: name(w) }), jetons: plural(lr.amount, 'jeton'), cappedFrom: lr.cappedFrom });
        }
        out.push({ kind: 'ann', ev: e, ann: { style: 'comptes', tone: 'comptes', kicker: tr('cf.boardparts.comptes'), ms: ANN_MS.comptes, title, text } });
        continue;
      }
      case 'sortie':
        out.push({ kind: 'ann', ev: e, ann: { style: 'big', tone: mine ? 'good' : 'info', ms: 2400, title: noDot(e.text) } });
        continue;
    }
    // Effets de cartes qui changent des dés : le bac les anime, un bandeau les explique.
    if (e.dice && e.player) { out.push({ kind: 'dice', ev: e, strip: strip(e.text, typeOf(e.card) ?? 'info', 1700) }); continue; }
    if (e.kind === 'defausse' && mine) continue;
    out.push({ kind: 'ann', ev: e, ann: strip(e.text, e.card ? typeOf(e.card) : e.who === me && me ? 'bad' : 'info', stripMs(e.text)) });
  }
  return out.map(localizeStep);
}
/** Le moteur écrit en français : on traduit ici ce qui en vient (bandeaux et annonces). */
function localizeAnn<T extends Announce>(a: T): T {
  return { ...a, title: a.title ? cfText(a.title) : a.title, text: a.text ? cfText(a.text) : a.text, conseq: a.conseq ? cfText(a.conseq) : a.conseq };
}
function localizeStep(p: PlanStep): PlanStep {
  if (p.kind === 'ann') return { ...p, ann: localizeAnn(p.ann) };
  if (p.kind === 'dice' && p.strip) return { ...p, strip: localizeAnn(p.strip) };
  return p;
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
  const n = o?.name ?? tr('cf.boardparts.l_adversaire');
  if (top.kind === 'keep') {
    const kept = (o?.r.dice ?? []).filter((_, i) => top.keep[i]);
    return tr('cf.board.garde_et_va_relancer_le_reste', { n: n, a: kept.join('-') });
  }
  if (!top.cardId) return tr('cf.board.un_piege_va_etre_pose_face');
  const pr = top.params;
  const me = meOf(v);
  const dieOf = (p: CfPlayerView | undefined, i?: number) => (p && i !== undefined ? p.r.dice[i] : 0);
  switch (top.cardId) {
    case 'de-sous-table': {
      const t = playerOf(v, pr.target ?? me.id) ?? me;
      const face = dieOf(t, pr.die) === 1 ? 'as' : dieOf(t, pr.die);
      if (t.id === top.owner) return tr('cf.board.ici_personne_n_a_fini_son', { face: face });
      if (t.id !== me.id) return tr('cf.board.ici_il_relance_le_de', { face: face, name: t.name });
      const c = comboOf(v, t);
      return tr('cf.board.ici_il_relance_votre', { face: face, a: c ? tr('cf.board.votre_est_menace', { a: shortCombo(c.label) }) : '' });
    }
    case 'tete-tourne': case 'coup-pouce': case 'recompter': case 'bon-numero': {
      if (!o || pr.die === undefined) break;
      const from = dieOf(o, pr.die);
      const to = top.cardId === 'tete-tourne' ? 7 - from : top.cardId === 'bon-numero' ? pr.face! : from + (pr.delta ?? 0);
      const dice = [...o.r.dice]; dice[pr.die] = to;
      return tr('cf.board.ici_son_devient_un_il_passe', { from: from, to: to, a: shortCombo(comboWith(v, o, dice).label) });
    }
    case 'tournee-generale': {
      if (!pr.target) return tr('cf.board.ici_personne_n_a_fini_son_2');
      if (pr.target !== me.id) return tr('cf.board.ici_et_lui_relancent_tous_leurs', { a: nameIn(v, pr.target) });
      return tr('cf.board.ici_vous_relancez_tous_vos_des');
    }
    case 'domino': return tr('cf.board.ici_vous_perdez_toutes_vos_tournees', { tournees: me.tournees });
    case 'fermeture': { if (!pr.habitue) return tr('cf.board.ici_il_gagne_tournees', { FERMETURE_TOURNEES: FERMETURE_TOURNEES }); const h = v.players.flatMap((p) => p.habitues).find((x) => x.uid === pr.habitue); return tr('cf.board.ici_rentre_chez_lui_defausse', { a: cardName(h?.id) }); }
    case 'double-tournee': return tr('cf.board.ici_s_il_gagne_la_manche');
    case 'pari-comptoir': return tr('cf.board.ici_le_perdant_de_la_manche');
    case 'note-salee': return tr('cf.board.ici_s_il_gagne_vous_recevrez');
    case 'cul-sec': return tr('cf.board.ici_il_gagne_un_lancer_de');
    case 'tournee-patron': return tr('cf.board.ici_il_gagne_tournees_2', { TOURNEE_PATRON_GAIN: TOURNEE_PATRON_GAIN });
    case 'fouine': return tr('cf.board.ici_il_defausse_un_de_vos');
    case 'verre-offert': return pr.target === me.id ? tr('cf.board.ici_vous_n_aurez_qu_un', { a: !me.r.done && v.order.indexOf(me.id) > v.order.indexOf(top.owner) ? tr('cf.board.celui_ci') : '' }) : tr('cf.board.ici_son_adversaire_n_aura_qu');
    case 'vide-poches': return pr.target === me.id ? tr('cf.board.ici_on_vous_prend_1_tournee') : tr('cf.board.ici_1_tournee_prise_et_une');
    case 'tant-qu-on-y-est': return tr('cf.board.ici_il_gagne', { tournees: plural((o?.r.played ?? 0) + 1, 'Tournée') });
    case 'pot-aux-roses': case 'ticket-caisse': case 'reaction-chaine': {
      const under = v.stack[v.stack.length - 2];
      const what = under && under.kind === 'card' && under.cardId ? `« ${cardName(under.cardId)} »` : tr('cf.board.la_carte');
      return tr('cf.board.ici_il_annule', { what: what, a: under && under.owner === me.id ? tr('cf.board.votre_carte') : '' });
    }
    case 'pourboire': return pr.target === me.id ? tr('cf.board.ici_il_vous_donne_1_de', { a: o && o.tokens <= 1 ? tr('cf.board.son_dernier_il_gagnerait_la_partie') : '' }) : tr('cf.board.ici_il_donne_1_de_ses');
    case 'coup-etrier': return tr('cf.board.ici_il_relance_son_au_hasard', { a: dieOf(o, pr.die) === 1 ? 'as' : dieOf(o, pr.die) });
    case 'petite-soeur': { const t = o ? [...o.discard].reverse().find(petiteSoeurOk) : undefined; return tr('cf.board.ici_il_reprend_en_main', { a: t ? `« ${cardName(t.id)} »` : tr('cf.board.une_carte_de_sa_defausse') }); }
    case 'efface-tout': return tr('cf.board.ici_s_il_perd_la_manche');
    case 'trinquer': return pr.target === me.id ? tr('cf.board.ici_un_de_vos_des_et') : tr('cf.board.ici_un_de_ses_des_et');
    // 0.46
    case 'miroir': case 'derniere-maille': case 'calva': case 'ricochet': {
      if (!o || pr.die === undefined) break;
      const from = dieOf(o, pr.die);
      const to = top.cardId === 'calva' ? 7 - from : top.cardId === 'ricochet' ? from + (pr.delta ?? 0) : pr.face!;
      const dice = [...o.r.dice]; dice[pr.die] = to;
      return tr('cf.board.ici_son_devient_un_il_passe', { from: from, to: to, a: shortCombo(comboWith(v, o, dice).label) });
    }
    case 'petit-dernier': return tr('cf.board.ici_il_relance_son_au_hasard', { a: dieOf(o, pr.die) === 1 ? 'as' : dieOf(o, pr.die) });
    case 'fee-verte': return tr('cf.board.ici_il_relance_son_jusqu_a', { a: dieOf(o, pr.die) === 1 ? 'as' : dieOf(o, pr.die), face: (pr.face)!});
    case 'verres-echanges': { const c = comboOf(v, me); return pr.target === me.id ? tr('cf.board.ici_il_prend_vos_des_et', { a: c ? ` (${shortCombo(c.label)})` : '' }) : tr('cf.board.ici_il_echange_ses_des_avec'); }
    case 'debauchage': { if (!pr.habitue) return tr('cf.board.ici_il_pioche_2_cartes'); const h = v.players.flatMap((p) => p.habitues).find((x) => x.uid === pr.habitue); return tr('cf.board.ici_passe_de_son_cote_du', { a: cardName(h?.id) }); }
    case 'retrouvailles': return tr('cf.board.ici_un_habitue_de_sa_defausse');
    case 'embuscade': return pr.target === me.id ? tr('cf.board.ici_il_pose_devant_vous_tous') : tr('cf.board.ici_il_pose_tous_les_pieges');
    case 'effet-papillon': return tr('cf.board.ici_il_pioche_1_carte_et');
    case 'echo': { const src = o ? echoSource(v, o.id) : null; return tr('cf.board.ici_il_rejoue_gratuitement', { a: src ? `« ${cardName(src)} »` : tr('cf.board.votre_dernier_coup') }); }
    case 'boucle': return tr('cf.board.ici_il_reprend_en_main_les');
    case 'cafe-serre': return tr('cf.board.ici_il_pioche_1_carte', { a: o?.habitues.length ? tr('cf.board.et_gagne_1_tournee') : '' });
    case 'plat-du-jour': return tr('cf.board.ici_il_recevra_tournees_de_plus', { PLAT_TOURNEES: PLAT_TOURNEES });
    case 'boule-de-neige': return tr('cf.board.ici_il_pioche', { cartes: plural(Math.max(1, Math.min(3, (o?.r.played ?? 2) - 1)), 'carte') });
    case 'passe-passe': return tr('cf.board.ici_il_reprend_un_de_ses');
    case 'addition': return tr('cf.board.ici_s_il_gagne_sa_combinaison', { ADDITION_MIN: ADDITION_MIN });
    case 'sante': return tr('cf.board.ici_s_il_perd_le_gagnant');
    case 'compte-rond': return tr('cf.board.ici_il_gagne_des_tournees_pour');
    case 'denonciation': return tr('cf.board.ici_il_defausse_un_de_vos_2');
    case 'table-reservee': case 'retour-envoyeur': case 'flagrant-delit': case 'a-la-votre': {
      const under = v.stack[v.stack.length - 2];
      const what = under && under.kind === 'card' && under.cardId ? `« ${cardName(under.cardId)} »` : tr('cf.board.la_carte');
      return tr('cf.board.ici_il_annule_2', { what: what, a: under && under.owner === me.id ? tr('cf.board.votre_carte') : '', b: top.cardId === 'retour-envoyeur' ? tr('cf.board.elle_retourne_dans_votre_main') : '' });
    }
  }
  const d = def(top.cardId);
  if (d?.type === 'habitue') return tr('cf.board.ici_s_installe_devant_lui_pour', { name: d.name, manches: plural(v.rules.habitueRounds ?? 3, 'manche') });
  return d?.text ?? '';
}

export { FAMILY_LABEL };
