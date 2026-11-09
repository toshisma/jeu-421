import { comboLabel } from './i18n';
import type { MessageKey } from '../../../shared/i18n';
export { plural } from './i18n';
import { plural } from './i18n';
import { tr } from '../i18n/lang';
/**
 * Coups Fourrés : fonctions pures d'affichage (aucun DOM, testées dans tests/cf-ui.test.ts).
 * Ce que fait une carte ici et maintenant, pourquoi elle n'est pas jouable, libellés de la partie,
 * combinaisons de chacun, choix des paramètres d'une carte (cible, dé, face, ±1…).
 * Tout s'appuie sur la vue partielle du joueur (CfView) et ses actions légales : rien de caché.
 */
import { evaluate } from '../../../shared/combos';
import { DEFAULT_CONFIG } from '../../../shared/config';
import { type CardDef } from '../../../shared/cards/catalog';
import { CARD_BY_ID, TYPE_LABEL } from './i18n';
import { ADDITION_MIN, ARDOISE_EXTRA, FEE_TRIES, LOT_DRAW, LOT_TOURNEES, PAPILLON_DRAW, PLAT_TOURNEES, FERMETURE_TOURNEES, FLAGRANT_MAX, PEAU_MIN, TOURNEE_PATRON_GAIN, TICKET_MAX, LEURRE_DRAW, LEURRE_TOURNEES, MOUCHARD_DRAW, MOUCHARD_TOURNEES, VIDE_POCHES_TOURNEES, POT_MIN, VESTE_MIN, beauFrere, boucleOk, echoSource, evalPlayer, guarded, maxTrapsOn, petiteSoeurOk, retrouvaillesTarget, trapsBefore, type CfAction, type CfEvent, type CfPlayerView, type CfView, type PlayParams } from '../../../shared/cards/engine';

const def = (id: string): CardDef | undefined => CARD_BY_ID[id];
const le = (v: number) => (v === 1 ? tr('cf.describe.l_as') : tr('cf.le' as MessageKey, { v }));
/** « 421 » s'écrit 4-2-1 dans les phrases. */
const lbl = (l: string) => (l === '421' ? '4-2-1' : comboLabel(l));

// Spectateur : il n'a pas de siège (« spectateur ») ; il voit la partie depuis la place du premier joueur, sans sa main.
export const meOf = (v: CfView): CfPlayerView => v.players.find((p) => p.id === v.you) ?? v.players[0];
export const playerOf = (v: CfView, id: string): CfPlayerView | undefined => v.players.find((p) => p.id === id);
export const opponentsOf = (v: CfView): CfPlayerView[] => v.players.filter((p) => p.id !== v.you && !p.out);
export const nameIn = (v: CfView, id: string | undefined | null) => (id ? playerOf(v, id)?.name ?? '?' : '?');

/** C'est à ce joueur de lancer (son tour, pas encore arrêté). */
export const isTurnOf = (v: CfView, id: string) => v.phase === 'turn' && v.order[v.turn] === id && !playerOf(v, id)?.r.done;
/** Joue en second (ou après) dans la manche. */
export const playsAfter = (v: CfView, id: string) => v.order.indexOf(id) > 0;

export interface ComboShown { dice: number[]; label: string; value: number; kind: string; done: boolean }
/** Combinaison actuelle d'un joueur (effets de cartes compris), ou null s'il n'a pas encore lancé. */
export function comboOf(v: CfView, p: CfPlayerView): ComboShown | null {
  if (!p.r.dice.some((d) => d > 0)) return null;
  const e = evalPlayer({ values: v.values }, p);
  return { dice: [...p.r.dice], label: e.combo.label, value: e.value, kind: e.combo.kind, done: p.r.done };
}
/** Combinaison qu'aurait ce joueur avec ces dés (sans changer la vue). */
export function comboWith(v: CfView, p: CfPlayerView, dice: number[]): { label: string; value: number; kind: string } {
  const e = evalPlayer({ values: v.values }, { habitues: p.habitues, r: { ...p.r, dice, forcedNenette: false } });
  return { label: e.combo.label, value: e.value, kind: e.combo.kind };
}

// ------------------------------------------------------------------ actions légales et paramètres

/** Actions « jouer cette carte » permises, et leurs paramètres. */
export function playOptions(legal: CfAction[], uid: string): PlayParams[] {
  return legal.filter((a): a is Extract<CfAction, { type: 'play' }> => a.type === 'play' && a.card === uid).map(({ type: _t, card: _c, ...rest }) => rest);
}
export const playableUids = (legal: CfAction[]) => new Set(legal.filter((a) => a.type === 'play').map((a) => (a as { card: string }).card));

export type ParamKey = 'target' | 'trap' | 'habitue' | 'die' | 'delta' | 'face';
/** Ordre dans lequel on demande les paramètres d'une carte. */
export const PARAM_ORDER: ParamKey[] = ['target', 'trap', 'habitue', 'die', 'delta', 'face'];

/** Prochain paramètre à demander (celui qui varie encore parmi les options restantes), ou null. */
export function nextParam(opts: PlayParams[], chosen: PlayParams): ParamKey | null {
  const rest = filterOptions(opts, chosen);
  for (const k of PARAM_ORDER) {
    if (chosen[k] !== undefined) continue;
    const vals = new Set(rest.map((o) => o[k]));
    if (vals.size > 1) return k;
  }
  return null;
}
/** Options compatibles avec ce qui est déjà choisi. */
export function filterOptions(opts: PlayParams[], chosen: PlayParams): PlayParams[] {
  return opts.filter((o) => PARAM_ORDER.every((k) => chosen[k] === undefined || o[k] === chosen[k]));
}
/** Valeurs possibles d'un paramètre (dans l'ordre d'apparition). */
export function valuesFor(opts: PlayParams[], chosen: PlayParams, k: ParamKey): (string | number)[] {
  const out: (string | number)[] = [];
  for (const o of filterOptions(opts, chosen)) { const x = o[k]; if (x !== undefined && !out.includes(x)) out.push(x); }
  return out;
}
/** L'option complète si les choix suffisent à la désigner. */
export function resolveOption(opts: PlayParams[], chosen: PlayParams): PlayParams | null {
  const rest = filterOptions(opts, chosen);
  if (!rest.length) return null;
  return nextParam(opts, chosen) === null ? rest[0] : null;
}
/** Libellé de la question posée pour un paramètre. */
export function paramQuestion(k: ParamKey, cardId: string): string {
  switch (k) {
    case 'target': return cardId === 'de-sous-table' || cardId === 'tournee-generale' ? tr('cf.describe.quel_adversaire') : cardId === 'trinquer' ? tr('cf.describe.avec_qui_trinquer') : cardId === 'pourboire' ? tr('cf.describe.a_qui_donner_le_jeton') : tr('cf.describe.sur_qui');
    case 'trap': return cardId === 'passe-passe' ? tr('cf.describe.quel_piege_reprendre') : tr('cf.describe.quel_piege_defausser');
    case 'habitue': return tr('cf.describe.quel_habitue_chasser');
    case 'die': return ['de-sous-table', 'coup-etrier', 'petit-dernier', 'fee-verte'].includes(cardId) ? tr('cf.describe.quel_de_relancer') : cardId === 'miroir' ? tr('cf.describe.quel_de_changer') : tr('cf.describe.quel_de');
    case 'delta': return tr('cf.describe.ajouter_ou_retirer_1');
    case 'face': return cardId === 'fee-verte' ? tr('cf.describe.quelle_face_viser') : cardId === 'miroir' ? tr('cf.describe.copier_quelle_face') : tr('cf.describe.sur_quelle_face');
  }
}

// ------------------------------------------------------------------ ce que fait une carte maintenant

const conditionOf: Record<string, string> = {
  get 'gueule-bois'() { return tr('cf.describe.il_perd_une_manche_il_n'); },
  get leurre() { return tr('cf.describe.une_carte_adverse_le_decouvre_et', { tournees: plural(LEURRE_TOURNEES, 'Tournée'), cartes: plural(LEURRE_DRAW, 'carte') }); },
  get 'croche-patte'() { return tr('cf.describe.il_finit_son_tour_un_de'); },
  get 'main-sac'() { return tr('cf.describe.il_joue_un_coup_qui_coute'); },
  get 'ardoise-piegee'() { return tr('cf.describe.il_joue_un_coup_il_paie', { ARDOISE_EXTRA: ARDOISE_EXTRA }); },
  get 'faux-421'() { return tr('cf.describe.il_termine_avec_un_4_2'); },
  get 'coup-nenette'() { return tr('cf.describe.il_devrait_gagner_avec_une_combinais'); },
  get 'retournement-veste'() { return tr('cf.describe.il_devrait_vous_donner_jetons_ou', { VESTE_MIN: VESTE_MIN }); },
  get mouchard() { return tr('cf.describe.il_joue_un_coup_vous_gagnez', { tournees: plural(MOUCHARD_TOURNEES, 'Tournée'), cartes: plural(MOUCHARD_DRAW, 'carte') }); },
  get 'verre-de-trop'() { return tr('cf.describe.il_fait_un_2e_lancer_dans'); },
  get 'courant-air'() { return tr('cf.describe.il_installe_un_habitue_ou_joue'); },
  get engrenage() { return tr('cf.describe.il_joue_sa_2e_carte_de'); },
  get 'pique-assiette'() { return tr('cf.describe.il_gagne_des_tournees_grace_a'); },
  get hoquet() { return tr('cf.describe.il_relance_en_gardant_des_des'); },
  get 'der-des-ders'() { return tr('cf.describe.il_perd_une_manche_il_recoit'); },
  get 'mot-de-trop'() { return tr('cf.describe.il_joue_un_dernier_mot_il'); },
  get 'peau-banane'() { return tr('cf.describe.il_s_arrete_sur_une_combinaison', { PEAU_MIN: PEAU_MIN }); },
  get 'attrape-nigaud'() { return tr('cf.describe.il_pose_un_piege_devant_vous'); },
  get 'lot-consolation'() { return tr('cf.describe.il_gagne_une_manche_vous_gagnez', { tournees: plural(LOT_TOURNEES, 'Tournée'), cartes: plural(LOT_DRAW, 'carte') }); },
  get souriciere() { return tr('cf.describe.il_joue_sa_1re_carte_de'); },
  get 'noeud-coulant'() { return tr('cf.describe.il_joue_sa_2e_carte_de_2'); },
};

/** Effet d'un dé modifié : « Le 6 devient un 1 : vous passez à 4-2-1 (vaut 8). » */
function diceChange(v: CfView, p: CfPlayerView, die: number, to: number, who = tr('cf.describe.vous_passez')): string {
  const from = p.r.dice[die];
  const dice = [...p.r.dice];
  dice[die] = to;
  const c = comboWith(v, p, dice);
  return tr('cf.describe.devient_a_vaut', { a: from === 1 ? tr('cf.describe.l_as_2') : tr('cf.describe.le', { from: from }), b: to === 1 ? tr('cf.describe.un_as') : tr('cf.un' as MessageKey, { v: to }), who: who, c: lbl(c.label), value: c.value });
}

/** Meilleur résultat possible parmi des options de dé (pour conseiller sans choisir à la place). */
function bestDiceOption(v: CfView, p: CfPlayerView, opts: PlayParams[], apply: (o: PlayParams) => number[]): { o: PlayParams; label: string; value: number; rank: number } | null {
  let best: { o: PlayParams; label: string; value: number; rank: number } | null = null;
  for (const o of opts) {
    const dice = apply(o);
    const e = evalPlayer({ values: v.values }, { habitues: p.habitues, r: { ...p.r, dice, forcedNenette: false } });
    if (!best || e.rank > best.rank) best = { o, label: lbl(e.combo.label), value: e.value, rank: e.rank };
  }
  return best;
}

/**
 * Ce que la carte va faire ici et maintenant, en une ou deux phrases (vouvoiement).
 * `params` : paramètres déjà choisis (cible, dé…) ; `opts` : options légales (pour les conseils).
 */
export function describeNow(v: CfView, cardId: string, params: PlayParams = {}, opts: PlayParams[] = []): string {
  const d = def(cardId);
  if (!d) return '';
  const p = meOf(v);
  const opps = opponentsOf(v);
  const target = params.target ? playerOf(v, params.target) : opps.length === 1 ? opps[0] : undefined;
  const tName = target?.name ?? tr('cf.board.l_adversaire');
  const top = v.stack[v.stack.length - 1];
  switch (cardId) {
    case 'tournee-patron': {
      const after = Math.min(v.rules.tourneesMax, p.tournees - costNow(v, cardId) + TOURNEE_PATRON_GAIN);
      return tr('cf.describe.vous_gagnez_tournees_vous_en_aurez', { TOURNEE_PATRON_GAIN: TOURNEE_PATRON_GAIN, after: after, tourneesMax: v.rules.tourneesMax });
    }
    case 'cul-sec': {
      const lim = p.throwLimit ?? v.rules.maxThrows;
      return tr('cf.describe.un_lancer_de_plus_ce_tour', { lancers: plural(lim + 1, 'lancer'), lim: lim });
    }
    case 'tete-tourne': {
      if (params.die !== undefined) return diceChange(v, p, params.die, 7 - p.r.dice[params.die]);
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? 7 - x : x)));
      return tr('cf.describe.retournez_un_de_sur_sa_face', { a: b ? tr('cf.describe.le_mieux', { a: le(p.r.dice[b.o.die!]), label: b.label }) : '' });
    }
    case 'coup-pouce': case 'recompter': {
      if (params.die !== undefined && params.delta !== undefined) return diceChange(v, p, params.die, p.r.dice[params.die] + params.delta);
      if (params.die !== undefined) return tr('cf.describe.choisissez_1_ou_1_pour', { a: le(p.r.dice[params.die]) });
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? x + o.delta! : x)));
      return tr('cf.describe.ajoutez_ou_retirez_1_a_un', { a: b ? tr('cf.describe.le_mieux_2', { a: le(p.r.dice[b.o.die!]), b: b.o.delta! > 0 ? '+1' : '−1', label: b.label }) : '' });
    }
    case 'bon-numero': {
      if (params.die !== undefined && params.face !== undefined) return diceChange(v, p, params.die, params.face);
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? o.face! : x)));
      return tr('cf.describe.mettez_un_de_vos_des_sur', { a: b ? tr('cf.describe.le_mieux_vaut', { label: b.label, value: b.value }) : '' });
    }
    case 'pari-comptoir':
      return tr('cf.describe.si_vous_gagnez_la_manche_recoit', { tName: tName });
    case 'double-tournee': {
      const c = comboOf(v, p);
      return tr('cf.describe.si_vous_gagnez_la_manche_votre', { a: c ? tr('cf.describe.donnerait_jetons_au_lieu_de', { label: lbl(c.label), a: c.value * 2, value: c.value }) : '' });
    }
    case 'de-sous-table': {
      if (target && target.id === p.id) return params.die !== undefined ? tr('cf.describe.vous_relancez_au_hasard_sans_utilise', { a: p.r.dice[params.die] === 1 ? tr('cf.describe.votre_as') : tr('cf.votre' as MessageKey, { v: p.r.dice[params.die] }) }) : tr('cf.describe.personne_n_a_fini_son_tour');
      if (!target && opts.length && opts.every((o) => o.target === p.id)) return tr('cf.describe.personne_n_a_fini_son_tour');
      if (target && params.die !== undefined) {
        const c = comboOf(v, target);
        return tr('cf.describe.de_est_relance_au_hasard', { a: target.r.dice[params.die] === 1 ? tr('cf.describe.l_as_2') : tr('cf.describe.le_2', { a: target.r.dice[params.die] }), name: target.name, b: c ? tr('cf.describe.il_a_pour_l_instant', { label: lbl(c.label) }) : '' });
      }
      const c = target ? comboOf(v, target) : null;
      return tr('cf.describe.relancez_au_hasard_un_de_de', { tName: tName, a: c ? tr('cf.describe.qui_a', { label: lbl(c.label) }) : '' });
    }
    case 'tournee-generale':
      if (!params.target && opts.length && opts.every((o) => !o.target)) return tr('cf.describe.personne_n_a_fini_son_tour_2');
      return tr('cf.describe.et_vous_relancez_tous_vos_des', { tName: tName });
    case 'domino': {
      const n = target ? target.tournees : 0;
      return n > 0 ? tr('cf.describe.perd_toutes_ses_tournees', { tName: tName, n: n }) : tr('cf.describe.n_a_plus_de_tournees_il', { tName: tName });
    }
    case 'fermeture': {
      if (params.habitue) {
        const owner = v.players.find((o) => o.habitues.some((h) => h.uid === params.habitue));
        const h = owner?.habitues.find((x) => x.uid === params.habitue);
        return tr('cf.describe.de_rentre_chez_lui_defausse', { a: (h ? def(h.id)?.name : tr('cf.describe.cet_habitue'))!, b: owner?.name ?? tr('cf.board.l_adversaire') });
      }
      if (!opts.some((o) => o.habitue)) return tr('cf.describe.aucun_habitue_adverse_a_chasser_vous', { tournees: plural(FERMETURE_TOURNEES, 'Tournée'), a: Math.min(v.rules.tourneesMax, p.tournees - costNow(v, cardId) + FERMETURE_TOURNEES), tourneesMax: v.rules.tourneesMax });
      return tr('cf.describe.un_habitue_adverse_rentre_chez_lui');
    }
    case 'fouine':
      if (!opts.some((o) => o.trap) && !params.trap) return tr('cf.describe.aucun_piege_adverse_pose_vous_pioche');
      return tr('cf.describe.vous_defaussez_le_piege_adverse_choi');
    case 'coup-coude': return tr('cf.describe.vous_piochez_1_carte_il_en', { deckCount: p.deckCount });
    case 'mise-bouche': return tr('cf.describe.vous_piochez_1_carte_et_votre');
    case 'calcul-mental': return p.deckCount > 0 ? tr('cf.describe.vous_regardez_les_cartes_du_dessus', { a: Math.min(3, p.deckCount) }) : tr('cf.describe.votre_deck_est_vide_rien_a');
    case 'grand-enchainement': {
      const last = p.r.lastCoup;
      return last ? tr('cf.describe.rejoue_gratuitement', { a: (def(last)?.name)!, b: describeNow(v, last, params, opts) }) : tr('cf.describe.aucun_coup_joue_cette_manche_a');
    }
    case 'note-salee': return tr('cf.describe.si_vous_gagnez_la_manche_recoit_2', { tName: tName });
    case 'ticket-caisse': case 'reaction-chaine': case 'pot-aux-roses': {
      const what = top && top.kind === 'card' ? (top.cardId ? `« ${def(top.cardId)?.name} »` : tr('cf.describe.ce_piege')) : tr('cf.describe.la_carte_adverse');
      const back = cardId === 'reaction-chaine' && p.r.played >= 2 ? tr('cf.describe.et_comme_c_est_au_moins') : '';
      return tr('cf.describe.annule_de', { what: what, a: top ? nameIn(v, top.owner) : tName, back: back });
    }
    case 'efface-tout': {
      const meE = evalPlayer({ values: v.values }, p);
      const best = Math.max(...v.players.filter((o) => o.id !== p.id && v.order.includes(o.id)).map((o) => evalPlayer({ values: v.values }, o).rank));
      const state = meE.rank < best ? tr('cf.describe.pour_l_instant_vous_perdez_vous') : meE.rank > best ? tr('cf.describe.pour_l_instant_vous_gagnez_elle') : '';
      return tr('cf.describe.si_vous_perdez_la_manche_vous', { state: state });
    }
    case 'verre-offert': {
      if (!target) return tr('cf.describe.l_adversaire_choisi_n_aura_qu');
      const now = !target.r.done && v.order.indexOf(target.id) > v.order.indexOf(p.id);
      return now ? tr('cf.describe.n_aura_qu_un_seul_lancer', { tName: tName }) : tr('cf.describe.a_deja_joue_il_n_aura', { tName: tName });
    }
    case 'trinquer': {
      const c = target ? comboOf(v, target) : null;
      return tr('cf.describe.un_de_vos_des_et_un', { a: p.r.dice.join('-'), tName: tName, b: c ? ` (${target!.r.dice.join('-')})` : '' });
    }
    case 'vide-poches':
      return target
        ? `${target.tournees > 0 ? tr('cf.describe.vous_prenez_a', { tournees: plural(Math.min(VIDE_POCHES_TOURNEES, target.tournees), 'Tournée'), tName: tName, a: p.tournees >= v.rules.tourneesMax ? tr('cf.describe.votre_reserve_est_pleine_elle_est') : '' }) : tr('cf.describe.n_a_pas_de_tournee_a', { tName: tName })}${target.handCount > 0 ? tr('cf.describe.defausse_au_hasard_une_de_ses', { tName: tName, cartes: plural(target.handCount, 'carte') }) : tr('cf.describe.sa_main_est_vide')}`
        : tr('cf.describe.prenez_1_tournee_a_l_adversaire');
    case 'tant-qu-on-y-est': {
      const n = p.r.played + 2;
      const after = Math.min(v.rules.tourneesMax, p.tournees - costNow(v, cardId) + n);
      return tr('cf.describe.vous_gagnez_2_vous_en_aurez', { tournees: plural(n, 'Tournée'), a: p.r.played ? tr('cf.describe.pour', { played: p.r.played, a: p.r.played > 1 ? tr('cf.describe.les_cartes_deja_jouees') : tr('cf.describe.la_carte_deja_jouee') }) : '', after: after, tourneesMax: v.rules.tourneesMax });
    }
    case 'pourboire': {
      const left = p.tokens - 1;
      return left <= 0 ? tr('cf.describe.vous_donnez_votre_dernier_jeton_a', { tName: tName }) : tr('cf.describe.vous_donnez_1_de_vos_jetons', { tName: tName, left: left });
    }
    case 'coup-etrier': {
      if (params.die !== undefined) return tr('cf.describe.vous_relancez_au_hasard_vous_avez', { a: p.r.dice[params.die] === 1 ? tr('cf.describe.votre_as') : tr('cf.votre' as MessageKey, { v: p.r.dice[params.die] }), b: lowerFirst(lbl(comboOf(v, p)?.label ?? '')) });
      return tr('cf.describe.relancez_au_hasard_un_de_vos');
    }
    case 'petite-soeur': {
      const top = [...p.discard].reverse().find(petiteSoeurOk);
      return top ? tr('cf.describe.vous_reprenez_en_main_le_dernier', { a: (def(top.id)?.name)!}) : tr('cf.describe.aucun_coup_dans_votre_defausse_rien');
    }
    case 'yeux-piquent': {
      const what = top && top.kind === 'card' && top.cardId ? `« ${def(top.cardId)?.name} »` : tr('cf.describe.son_coup_de_des');
      return tr('cf.describe.annule_de_ses_des_ne_bougent', { what: what, a: top ? nameIn(v, top.owner) : tName });
    }
    // ------------------------------------------------------------- 0.46
    case 'cafe-serre': return p.habitues.length ? tr('cf.describe.vous_piochez_1_carte_et_comme') : tr('cf.describe.vous_piochez_1_carte_avec_un');
    case 'plat-du-jour': return tr('cf.describe.a_la_prochaine_manche_vous_recevrez', { PLAT_TOURNEES: PLAT_TOURNEES, tourneesMax: v.rules.tourneesMax });
    case 'boule-de-neige': { const n = Math.min(3, p.r.played); return n ? tr('cf.describe.vous_piochez_une_par_carte_deja', { cartes: plural(n, 'carte') }) : tr('cf.describe.jouez_d_abord_une_autre_carte'); }
    case 'effet-papillon': return tr('cf.describe.vous_piochez_jusqu_a_la_fin', { cartes: plural(PAPILLON_DRAW, 'carte') });
    case 'addition': {
      const c = comboOf(v, p);
      return tr('cf.describe.si_vous_gagnez_la_manche_votre_2', { ADDITION_MIN: ADDITION_MIN, a: c && c.value < ADDITION_MIN ? tr('cf.describe.votre_vaut_elle_passerait_a', { a: lbl(c.label), value: c.value, ADDITION_MIN: ADDITION_MIN }) : '' });
    }
    case 'sante': return tr('cf.describe.si_vous_perdez_la_manche_recoit', { tName: tName });
    case 'compte-rond': { const n = Math.min(3, p.r.played); return tr('cf.describe.vous_gagnez_une_par_carte_deja', { tournees: plural(n, 'Tournée'), a: Math.min(v.rules.tourneesMax, p.tournees - costNow(v, cardId) + n), tourneesMax: v.rules.tourneesMax }); }
    case 'petit-dernier':
      return params.die !== undefined ? tr('cf.describe.vous_relancez_au_hasard_sans_utilise', { a: p.r.dice[params.die] === 1 ? tr('cf.describe.votre_as') : tr('cf.votre' as MessageKey, { v: p.r.dice[params.die] }) }) : tr('cf.describe.relancez_au_hasard_un_de_vos_2');
    case 'calva': {
      if (params.die !== undefined) return diceChange(v, p, params.die, 7 - p.r.dice[params.die]);
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? 7 - x : x)));
      return tr('cf.describe.retournez_un_de_vos_des_sur', { a: b ? tr('cf.describe.le_mieux', { a: le(p.r.dice[b.o.die!]), label: b.label }) : '' });
    }
    case 'miroir': case 'derniere-maille': {
      if (params.die !== undefined && params.face !== undefined) return diceChange(v, p, params.die, params.face);
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? o.face! : x)));
      const head = cardId === 'miroir' ? tr('cf.describe.un_de_vos_des_prend_la') : tr('cf.describe.mettez_un_de_vos_des_sur_2');
      return `${head}${b ? tr('cf.describe.le_mieux_vaut', { label: b.label, value: b.value }) : ''}`;
    }
    case 'fee-verte':
      if (params.die !== undefined && params.face !== undefined) return tr('cf.describe.est_relance_jusqu_a_fois_tant', { a: p.r.dice[params.die] === 1 ? tr('cf.describe.votre_as_2') : tr('cf.describe.votre', { a: p.r.dice[params.die] }), FEE_TRIES: FEE_TRIES, face: params.face });
      return tr('cf.describe.choisissez_un_de_et_la_face', { FEE_TRIES: FEE_TRIES });
    case 'verres-echanges': {
      const c = target ? comboOf(v, target) : null;
      const mine = comboOf(v, p);
      return tr('cf.describe.vos_des_et_ceux_de_changent', { a: mine ? ` (${lbl(mine.label)})` : '', tName: tName, b: c ? ` (${lbl(c.label)})` : '' });
    }
    case 'debauchage': {
      if (params.habitue) {
        const owner = v.players.find((o) => o.habitues.some((h) => h.uid === params.habitue));
        const h = owner?.habitues.find((x) => x.uid === params.habitue);
        return tr('cf.describe.quitte_et_s_installe_devant_vous', { a: (h ? def(h.id)?.name : tr('cf.describe.cet_habitue'))!, b: owner?.name ?? tr('cf.board.l_adversaire'), c: h?.rounds ? tr('cf.describe.encore', { manches: plural(h.rounds, 'manche') }) : '' });
      }
      return opts.some((o) => o.habitue) ? tr('cf.describe.un_habitue_adverse_passe_de_votre') : tr('cf.describe.aucun_habitue_adverse_a_debaucher_vo');
    }
    case 'retrouvailles': {
      const k = retrouvaillesTarget(p, v.rules.maxHabitues);
      return k ? tr('cf.describe.revient_s_installer_devant_vous_pour', { a: (def(k.id)?.name)!, b: v.rules.habitueRounds ?? 3 }) : tr('cf.describe.aucun_habitue_a_faire_revenir_de');
    }
    case 'boucle': {
      const got = [...p.discard].reverse().filter(boucleOk).slice(0, 2);
      return got.length ? tr('cf.describe.vous_reprenez_en_main', { a: got.map((k) => `« ${def(k.id)?.name} »`).join(' et ') }) : tr('cf.describe.aucune_carte_a_reprendre_dans_votre');
    }
    case 'passe-passe': return tr('cf.describe.un_de_vos_pieges_poses_revient');
    case 'denonciation': return tr('cf.describe.vous_defaussez_le_piege_adverse_choi_2');
    case 'embuscade': {
      const traps = (p.hand ?? []).filter((k) => def(k.id)?.type === 'piege').length;
      const room = target ? Math.max(0, maxTrapsOn(v) - trapsBefore(v, target.id)) : maxTrapsOn(v);
      return tr('cf.describe.vous_posez_gratuitement_devant_de_vo', { tName: tName, pieges: plural(Math.min(traps, room), 'piège'), traps: traps, room: room, s: room > 1 ? 's' : '' });
    }
    case 'echo': {
      const src = echoSource(v, p.id);
      return src ? tr('cf.describe.rejoue_gratuitement', { a: (def(src)?.name)!, b: describeNow(v, src, params, opts) }) : tr('cf.describe.aucun_coup_adverse_joue_cette_manche');
    }
    case 'table-reservee': return tr('cf.describe.annule_le_piege_que_pose_devant', { a: top ? nameIn(v, top.owner) : tName });
    case 'a-la-votre': {
      const what = top && top.kind === 'card' && top.cardId ? `« ${def(top.cardId)?.name} »` : tr('cf.describe.sa_riposte');
      return tr('cf.describe.annule_de_votre_carte_passe', { what: what, a: top ? nameIn(v, top.owner) : tName });
    }
    case 'retour-envoyeur': case 'flagrant-delit': {
      const what = top && top.kind === 'card' && top.cardId ? `« ${def(top.cardId)?.name} »` : tr('cf.describe.la_carte_adverse');
      return tr('cf.describe.annule_de_2', { what: what, a: top ? nameIn(v, top.owner) : tName, b: cardId === 'retour-envoyeur' ? tr('cf.describe.elle_retourne_dans_sa_main_les') : '' });
    }
  }
  if (d.type === 'habitue') {
    return tr('cf.describe.s_installe_devant_vous_pour_manches', { a: v.rules.habitueRounds ?? 3, b: p.habitues.length + 1, maxHabitues: v.rules.maxHabitues, c: lowerFirst(d.text) });
  }
  if (d.type === 'piege') {
    const before = target ? trapsBefore(v, target.id) : 0;
    return tr('cf.describe.pose_face_cachee_devant_pieges_devan', { tName: tName, a: before + 1, b: maxTrapsOn(v), c: conditionOf[cardId] ?? tr('cf.describe.sa_condition_arrivera') });
  }
  return d.text;
}
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Coût réel maintenant (Mise en bouche comprise). */
export function costNow(v: CfView, cardId: string): number {
  const d = def(cardId);
  const p = meOf(v);
  return d ? Math.max(0, d.cost - beauFrere(p, cardId) - (cardId === 'mise-bouche' ? 0 : p.r.discount) - (p.r.roundDiscount ?? 0)) : 0;
}

/** Pourquoi cette carte n'est pas jouable maintenant (phrase courte), ou null si elle l'est. */
export function whyNot(v: CfView, cardId: string, legal: CfAction[], uid: string): string | null {
  if (playOptions(legal, uid).length) return null;
  const d = def(cardId);
  if (!d) return tr('cf.describe.carte_inconnue');
  const p = meOf(v);
  const cost = costNow(v, cardId);
  const decision = v.decision;
  if (v.phase === 'over') return tr('cf.describe.la_partie_est_finie');
  if (v.phase === 'mulligan') return tr('cf.describe.la_partie_n_a_pas_encore');
  if (p.r.locked) return tr('cf.describe.plus_de_carte_pour_vous_cette', { a: def(p.r.locked)?.name ?? tr('cf.describe.un_piege') });
  if (d.type === 'riposte') {
    if (decision === 'respond' && v.waiting.includes(p.id)) {
      const top = v.stack[v.stack.length - 1];
      if (cost > p.tournees) return tr('cf.describe.il_vous_manque', { tournees: plural(cost - p.tournees, 'Tournée') });
      if (cardId === 'yeux-piquent') return tr('cf.describe.n_annule_qu_un_coup_qui');
      if (cardId === 'ticket-caisse' && top?.kind === 'card') return tr('cf.describe.n_annule_qu_un_coup_qui_2', { TICKET_MAX: TICKET_MAX });
      if (cardId === 'pot-aux-roses') return tr('cf.describe.n_annule_qu_un_coup_ou', { POT_MIN: POT_MIN });
      if (cardId === 'table-reservee') return tr('cf.describe.n_annule_qu_un_piege_pose');
      if (cardId === 'a-la-votre') return tr('cf.describe.n_annule_qu_une_riposte');
      if (cardId === 'retour-envoyeur') return tr('cf.describe.n_annule_qu_un_coup');
      if (cardId === 'flagrant-delit') return tr('cf.describe.n_annule_qu_un_coup_qui_3', { FLAGRANT_MAX: FLAGRANT_MAX });
      return tr('cf.describe.ne_peut_pas_repondre_a_cette');
    }
    return tr('cf.describe.riposte_se_joue_en_reponse_a');
  }
  if (d.type === 'dernier-mot') {
    if (v.phase !== 'lastword') return tr('cf.describe.dernier_mot_se_joue_quand_les');
    if (cost > p.tournees) return tr('cf.describe.il_vous_manque', { tournees: plural(cost - p.tournees, 'Tournée') });
    if ((cardId === 'recompter' || cardId === 'compte-rond') && p.r.played < 1) return tr('cf.describe.il_faut_avoir_joue_une_autre');
    if (cardId === 'derniere-maille' && p.r.played < 2) return tr('cf.describe.il_faut_avoir_joue_2_autres');
    if (cardId === 'denonciation') return tr('cf.describe.aucun_piege_adverse_pose_devant_vous');
    if (cardId === 'trinquer') return opponentsOf(v).every((o) => guarded(o)) ? tr('cf.describe.le_garde_champetre_protege_ses_des') : tr('cf.describe.il_faut_des_des_des_deux');
    if (!v.waiting.includes(p.id)) return tr('cf.describe.attendez_votre_tour_de_parole');
    return tr('cf.describe.pas_jouable_maintenant');
  }
  if (v.phase === 'lastword') return tr('cf.describe.etape_dernier_mot_seules_les_cartes');
  if (decision === 'respond' || decision === 'choice') return tr('cf.describe.attendez_la_fin_de_l_action');
  if (!isTurnOf(v, p.id)) return tr('cf.describe.se_joue_pendant_votre_tour');
  if (cost > p.tournees) return tr('cf.describe.il_vous_manque_cout_vous_en', { tournees: plural(cost - p.tournees, 'Tournée'), cost: cost, tournees2: p.tournees });
  if (d.type === 'habitue') return p.habitues.some((h) => h.id === cardId) ? tr('cf.describe.il_est_deja_installe_devant_vous') : tr('cf.describe.vous_avez_deja_habitues_en_jeu', { maxHabitues: v.rules.maxHabitues });
  if (d.type === 'piege') {
    if (v.traps.filter((t) => t.owner === p.id).length >= v.rules.maxTraps) return tr('cf.describe.vous_avez_deja_pieges_poses', { maxTraps: v.rules.maxTraps });
    return tr('cf.describe.plus_de_place_pieges_au_plus', { a: maxTrapsOn(v) });
  }
  switch (cardId) {
    case 'tete-tourne': case 'coup-pouce': case 'bon-numero': case 'petit-dernier': case 'miroir': case 'fee-verte': return tr('cf.describe.lancez_d_abord_les_des');
    case 'de-sous-table': case 'tournee-generale': return tr('cf.describe.lancez_d_abord_vos_des');
    case 'ricochet': return p.r.played < 1 ? tr('cf.describe.jouez_d_abord_une_autre_carte_2') : tr('cf.describe.lancez_d_abord_les_des');
    case 'verres-echanges': return opponentsOf(v).some((o) => o.r.done) ? (p.r.throwsUsed ? tr('cf.describe.le_garde_champetre_protege_ses_des') : tr('cf.describe.lancez_d_abord_vos_des')) : tr('cf.describe.il_faut_un_adversaire_qui_a');
    case 'petite-soeur': case 'boucle': return tr('cf.describe.aucun_coup_a_reprendre_dans_votre');
    case 'vide-poches': return tr('cf.describe.l_adversaire_n_a_ni_tournee');
    case 'fermeture': return tr('cf.describe.ses_habitues_sont_proteges_par_le');
    case 'debauchage': return p.habitues.length >= v.rules.maxHabitues ? tr('cf.describe.vous_avez_deja_habitues', { maxHabitues: v.rules.maxHabitues }) : tr('cf.describe.aucun_habitue_adverse_a_debaucher');
    case 'retrouvailles': return tr('cf.describe.aucun_habitue_a_faire_revenir_de');
    case 'passe-passe': return tr('cf.describe.vous_n_avez_aucun_piege_pose');
    case 'embuscade': return (p.hand ?? []).some((k) => def(k.id)?.type === 'piege') ? tr('cf.describe.plus_de_place_pour_vos_pieges') : tr('cf.describe.aucun_piege_dans_votre_main');
    case 'echo': return tr('cf.describe.aucun_coup_adverse_a_rejouer_cette');
  }
  return tr('cf.describe.pas_jouable_maintenant');
}

// ------------------------------------------------------------------ libellés de la partie

/** Ligne d'état en haut du plateau. */
export function phaseLine(v: CfView, mode: string): string {
  if (v.phase === 'mulligan') return tr('cf.boardparts.main_de_depart');
  if (v.phase === 'over') return tr('cf.game.partie_terminee');
  const order = v.order.indexOf(v.you);
  const pos = order === 0 ? tr('cf.board.vous_menez_2') : order === 1 ? tr('cf.describe.vous_jouez_en_second') : order > 1 ? tr('cf.describe.vous_jouez_en_e', { a: order + 1 }) : '';
  return [tr('cf.describe.manche', { round: v.round }), mode, pos].filter(Boolean).join(' · ');
}

/** Ce que le joueur doit faire maintenant (consigne courte), ou ce qu'on attend. */
export function decisionLine(v: CfView): string {
  const mine = v.waiting.includes(v.you);
  const who = nameIn(v, v.waiting[0]);
  switch (v.decision) {
    case 'mulligan': return mine ? tr('cf.describe.renvoyez_jusqu_a_2_cartes_sous') : tr('cf.describe.choisit_sa_main', { who: who });
    case 'respond': return mine ? tr('cf.describe.repondre_avec_une_riposte') : tr('cf.board.peut_repondre', { who: who });
    case 'choice': return mine ? tr('cf.describe.faites_votre_choix') : tr('cf.board.choisit', { who: who });
    case 'lastword': return mine ? tr('cf.describe.dernier_mot_jouez_une_carte_ou') : tr('cf.board.dernier_mot_reflechit', { who: who });
    case 'discard': return mine ? tr('cf.describe.main_pleine_defaussez_jusqu_a_cartes', { handMax: v.rules.handMax }) : tr('cf.board.defausse', { who: who });
    case 'turn': {
      if (!mine) return tr('cf.board.joue', { who: who });
      const p = meOf(v);
      if (p.r.throwsUsed === 0) return tr('cf.describe.a_vous_lancez_les_des');
      const left = (p.throwLimit ?? 0) - p.r.throwsUsed;
      return left > 0 ? tr('cf.describe.touchez_un_de_pour_le_garder', { lancers: plural(left, 'lancer') }) : tr('cf.describe.plus_de_lancer_jouez_une_carte');
    }
  }
  return '';
}

/** Libellé du bouton de relance selon les dés gardés. */
export function rerollLabel(dice: number[], keep: boolean[]): string {
  const out = dice.filter((_, i) => !keep[i]);
  if (out.length === 3) return tr('cf.describe.relancer_les_3');
  if (out.length === 0) return tr('cf.describe.tout_est_garde');
  return tr('cf.describe.relancer', { a: out.map((x) => le(x)).join(' et ') });
}

export const typeLine = (id: string) => { const d = def(id); return d ? `${TYPE_LABEL[d.type]} · ${plural(d.cost, 'Tournée')}` : ''; };

// ------------------------------------------------------------------ événements

export type EventTone = 'piege' | 'carte' | 'comptes' | 'manche' | 'fin' | 'lancer' | 'info' | 'prive' | 'annule';
/** Famille d'un événement (couleur dans le journal, animation à jouer). */
export function eventTone(e: CfEvent): EventTone {
  switch (e.kind) {
    case 'piege-revele': case 'piege': case 'pose': case 'faux-421': case 'coup-nenette': case 'gueule-bois': case 'croche-patte': case 'ardoise-piegee': case 'videur': case 'revele': case 'leurre':
    case 'pique-assiette': case 'hoquet': case 'peau-banane': case 'mot-de-trop': case 'attrape-nigaud': case 'lot-consolation': case 'souriciere': case 'noeud-coulant': return 'piege';
    case 'carte': case 'effet': case 'rejoue': case 'retour-main': case 'yeux-piquent': case 'josiane': case 'patron': return 'carte';
    case 'annule': case 'sans-effet': return 'annule';
    case 'comptes': return 'comptes';
    case 'manche': case 'tirage': return 'manche';
    case 'fin': case 'sortie': return 'fin';
    case 'lancer': case 'fin-tour': return 'lancer';
    case 'pioche-privee': case 'fouine': return 'prive';
  }
  return 'info';
}

/** Événements qui méritent un message à l'écran (le reste ne va qu'au journal). */
export function isHeadline(e: CfEvent): boolean {
  return !['pioche', 'pioche-privee', 'lancer', 'tour', 'mulligan', 'fin-tour'].includes(e.kind);
}

/** Valeurs des dés « avant » l'événement : sert à animer seulement les dés qui ont changé. */
export function changedDice(before: number[], after: number[]): boolean[] {
  return after.map((x, i) => x !== before[i]);
}

/** Le 4-2-1 et les trois as ont droit à la mise en scène (décision de Sam : pas les brelans). */
export function isBigShot(dice: number[]): '421' | '111' | null {
  const k = evaluate(dice, DEFAULT_CONFIG.values).kind;
  return k === '421' ? '421' : k === '111' ? '111' : null;
}

// ------------------------------------------------------------------ decks

export interface DeckStats {
  total: number;
  /** Nombre de cartes par coût : 0, 1, 2, 3, 4 et plus. */
  curve: number[];
  families: Record<string, number>;
  types: Record<string, number>;
  avgCost: number;
}
export function deckStats(cards: Record<string, number>): DeckStats {
  const curve = [0, 0, 0, 0, 0];
  const families: Record<string, number> = {};
  const types: Record<string, number> = {};
  let total = 0, sum = 0;
  for (const [id, n] of Object.entries(cards)) {
    const d = def(id);
    if (!d || n <= 0) continue;
    total += n; sum += d.cost * n;
    curve[Math.min(4, d.cost)] += n;
    families[d.family] = (families[d.family] ?? 0) + n;
    types[d.type] = (types[d.type] ?? 0) + n;
  }
  return { total, curve, families, types, avgCost: total ? sum / total : 0 };
}

/** Conseils sur un deck en construction (phrases courtes, du plus important au moins important). */
export function deckAlerts(cards: Record<string, number>, size = 20): { level: 'bloque' | 'conseil'; text: string }[] {
  const s = deckStats(cards);
  const out: { level: 'bloque' | 'conseil'; text: string }[] = [];
  if (s.total < size) out.push({ level: 'bloque', text: tr('cf.describe.encore_pour_arriver_a', { cartes: plural(size - s.total, 'carte'), size: size }) });
  if (s.total > size) out.push({ level: 'bloque', text: tr('cf.describe.en_trop_un_deck_compte_exactement', { cartes: plural(s.total - size, 'carte'), size: size }) });
  const expensive = s.curve[3] + s.curve[4];
  if (expensive > 4) out.push({ level: 'conseil', text: tr('cf.describe.trop_cher_cartes_a_3_tournees', { expensive: expensive }) });
  else if (s.total >= 10 && s.avgCost > 1.9) out.push({ level: 'conseil', text: tr('cf.describe.cout_moyen_eleve_tournee_ajoutez_des', { a: s.avgCost.toFixed(1).replace('.', ',') }) });
  const parades = Object.entries(cards).filter(([id]) => def(id)?.type === 'riposte' || ['fouine', 'videur', 'denonciation', 'guetteur'].includes(id)).reduce((a, [, n]) => a + n, 0);
  if (s.total >= 10 && parades === 0) out.push({ level: 'conseil', text: tr('cf.describe.sans_parade_aucune_riposte_fouine_ou') });
  const dice = ['tete-tourne', 'coup-pouce', 'bon-numero', 'recompter', 'cul-sec', 'josiane', 'trinquer', 'petit-dernier', 'calva', 'miroir', 'fee-verte', 'pochtron', 'ricochet', 'derniere-maille'].reduce((a, id) => a + (cards[id] ?? 0), 0);
  if (s.total >= 14 && dice === 0) out.push({ level: 'conseil', text: tr('cf.describe.aucune_carte_pour_agir_sur_vos') });
  if (Object.keys(s.families).length >= 4) out.push({ level: 'conseil', text: tr('cf.describe.quatre_familles_un_deck_a_deux') });
  return out;
}
