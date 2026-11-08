/**
 * Coups Fourrés : fonctions pures d'affichage (aucun DOM, testées dans tests/cf-ui.test.ts).
 * Ce que fait une carte ici et maintenant, pourquoi elle n'est pas jouable, libellés de la partie,
 * combinaisons de chacun, choix des paramètres d'une carte (cible, dé, face, ±1…).
 * Tout s'appuie sur la vue partielle du joueur (CfView) et ses actions légales : rien de caché.
 */
import { evaluate } from '../../../shared/combos';
import { DEFAULT_CONFIG } from '../../../shared/config';
import { CARD_BY_ID, TYPE_LABEL, type CardDef } from '../../../shared/cards/catalog';
import { ADDITION_MIN, ARDOISE_EXTRA, FEE_TRIES, LOT_DRAW, LOT_TOURNEES, PAPILLON_DRAW, PLAT_TOURNEES, FERMETURE_TOURNEES, FLAGRANT_MAX, PEAU_MIN, TOURNEE_PATRON_GAIN, TICKET_MAX, LEURRE_DRAW, LEURRE_TOURNEES, MOUCHARD_DRAW, MOUCHARD_TOURNEES, VIDE_POCHES_TOURNEES, POT_MIN, VESTE_MIN, beauFrere, boucleOk, echoSource, evalPlayer, guarded, maxTrapsOn, petiteSoeurOk, retrouvaillesTarget, trapsBefore, type CfAction, type CfEvent, type CfPlayerView, type CfView, type PlayParams } from '../../../shared/cards/engine';

const def = (id: string): CardDef | undefined => CARD_BY_ID[id];
export const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
const le = (v: number) => (v === 1 ? 'l’as' : `le ${v}`);
/** « 421 » s'écrit 4-2-1 dans les phrases. */
const lbl = (l: string) => (l === '421' ? '4-2-1' : l);

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
    case 'target': return cardId === 'de-sous-table' || cardId === 'tournee-generale' ? 'Quel adversaire ?' : cardId === 'trinquer' ? 'Avec qui trinquer ?' : cardId === 'pourboire' ? 'À qui donner le jeton ?' : 'Sur qui ?';
    case 'trap': return cardId === 'passe-passe' ? 'Quel piège reprendre ?' : 'Quel piège défausser ?';
    case 'habitue': return 'Quel Habitué chasser ?';
    case 'die': return ['de-sous-table', 'coup-etrier', 'petit-dernier', 'fee-verte'].includes(cardId) ? 'Quel dé relancer ?' : cardId === 'miroir' ? 'Quel dé changer ?' : 'Quel dé ?';
    case 'delta': return 'Ajouter ou retirer 1 ?';
    case 'face': return cardId === 'fee-verte' ? 'Quelle face viser ?' : cardId === 'miroir' ? 'Copier quelle face ?' : 'Sur quelle face ?';
  }
}

// ------------------------------------------------------------------ ce que fait une carte maintenant

const conditionOf: Record<string, string> = {
  'gueule-bois': 'il perd une manche (il n’aura qu’un lancer à la suivante)',
  leurre: `il est révélé ou revient dans votre main (vous gagnez ${plural(LEURRE_TOURNEES, 'Tournée')} et piochez ${plural(LEURRE_DRAW, 'carte')}) ; sinon il ne fait rien`,
  'croche-patte': 'il finit son tour (un de ses dés est relancé au hasard)',
  'main-sac': 'il joue un Coup qui coûte 1 ou plus (ce Coup est annulé)',
  'ardoise-piegee': `il joue un Coup (il paie ${ARDOISE_EXTRA} Tournées de plus, sinon le Coup est annulé)`,
  'faux-421': 'il termine avec un 4-2-1 (qui ne vaudra que 2)',
  'coup-nenette': 'il devrait gagner avec une combinaison qui vaut 1 ou 2 (elle devient une nénette)',
  'retournement-veste': `il devrait vous donner ${VESTE_MIN} jetons ou plus (c’est lui qui les reçoit)`,
  mouchard: `il joue un Coup (vous gagnez ${plural(MOUCHARD_TOURNEES, 'Tournée')} et piochez ${plural(MOUCHARD_DRAW, 'carte')})`,
  'verre-de-trop': 'il fait un 2e lancer dans son tour (il reçoit 1 jeton)',
  'courant-air': 'il installe un Habitué ou joue une Riposte (la carte est défaussée sans effet)',
  engrenage: 'il joue sa 2e carte de la manche (elle est annulée)',
  'pique-assiette': 'il gagne des Tournées grâce à une carte (c’est vous qui les gagnez)',
  hoquet: 'il relance en gardant des dés (un des dés gardés est relancé aussi)',
  'der-des-ders': 'il perd une manche (il reçoit 1 jeton de plus)',
  'mot-de-trop': 'il joue un Dernier mot (il est annulé)',
  'peau-banane': `il s’arrête sur une combinaison qui vaut ${PEAU_MIN} ou plus (un de ses dés est relancé au hasard)`,
  'attrape-nigaud': 'il pose un piège devant vous (son piège est défaussé et vous piochez 1 carte)',
  'lot-consolation': `il gagne une manche (vous gagnez ${plural(LOT_TOURNEES, 'Tournée')} et piochez ${plural(LOT_DRAW, 'carte')})`,
  souriciere: 'il joue sa 1re carte de la manche (il ne pourra plus en jouer d’autre)',
  'noeud-coulant': 'il joue sa 2e carte de la manche (1 jeton, et plus aucune autre carte)',
};

/** Effet d'un dé modifié : « Le 6 devient un 1 : vous passez à 4-2-1 (vaut 8). » */
function diceChange(v: CfView, p: CfPlayerView, die: number, to: number, who = 'vous passez'): string {
  const from = p.r.dice[die];
  const dice = [...p.r.dice];
  dice[die] = to;
  const c = comboWith(v, p, dice);
  return `${from === 1 ? 'L’as' : `Le ${from}`} devient ${to === 1 ? 'un as' : `un ${to}`} : ${who} à ${lbl(c.label)} (vaut ${c.value}).`;
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
  const tName = target?.name ?? 'l’adversaire';
  const top = v.stack[v.stack.length - 1];
  switch (cardId) {
    case 'tournee-patron': {
      const after = Math.min(v.rules.tourneesMax, p.tournees - costNow(v, cardId) + TOURNEE_PATRON_GAIN);
      return `Vous gagnez ${TOURNEE_PATRON_GAIN} Tournées (vous en aurez ${after} sur ${v.rules.tourneesMax}) et piochez 1 carte.`;
    }
    case 'cul-sec': {
      const lim = p.throwLimit ?? v.rules.maxThrows;
      return `Un lancer de plus ce tour : ${plural(lim + 1, 'lancer')} au lieu de ${lim}, même au-delà de la limite. Et vous piochez 1 carte.`;
    }
    case 'tete-tourne': {
      if (params.die !== undefined) return diceChange(v, p, params.die, 7 - p.r.dice[params.die]);
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? 7 - x : x)));
      return `Retournez un dé sur sa face opposée (1↔6, 2↔5, 3↔4).${b ? ` Le mieux : ${le(p.r.dice[b.o.die!])} → ${b.label}.` : ''}`;
    }
    case 'coup-pouce': case 'recompter': {
      if (params.die !== undefined && params.delta !== undefined) return diceChange(v, p, params.die, p.r.dice[params.die] + params.delta);
      if (params.die !== undefined) return `Choisissez +1 ou −1 pour ${le(p.r.dice[params.die])}.`;
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? x + o.delta! : x)));
      return `Ajoutez ou retirez 1 à un de vos dés.${b ? ` Le mieux : ${le(p.r.dice[b.o.die!])} ${b.o.delta! > 0 ? '+1' : '−1'} → ${b.label}.` : ''}`;
    }
    case 'bon-numero': {
      if (params.die !== undefined && params.face !== undefined) return diceChange(v, p, params.die, params.face);
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? o.face! : x)));
      return `Mettez un de vos dés sur la face de votre choix.${b ? ` Le mieux : ${b.label} (vaut ${b.value}).` : ''}`;
    }
    case 'pari-comptoir':
      return `Si vous gagnez la manche, ${tName} reçoit 2 jetons de plus ; si vous la perdez, c’est vous qui en recevez 2 de plus.`;
    case 'double-tournee': {
      const c = comboOf(v, p);
      return `Si vous gagnez la manche, votre combinaison vaut le double${c ? ` : ${c.label} donnerait ${c.value * 2} jetons au lieu de ${c.value}` : ''}.`;
    }
    case 'de-sous-table': {
      if (target && target.id === p.id) return params.die !== undefined ? `Vous relancez ${p.r.dice[params.die] === 1 ? 'votre as' : `votre ${p.r.dice[params.die]}`} au hasard, sans utiliser de lancer.` : 'Personne n’a fini son tour : relancez un de vos dés au hasard, sans utiliser de lancer.';
      if (!target && opts.length && opts.every((o) => o.target === p.id)) return 'Personne n’a fini son tour : relancez un de vos dés au hasard, sans utiliser de lancer.';
      if (target && params.die !== undefined) {
        const c = comboOf(v, target);
        return `${target.r.dice[params.die] === 1 ? 'L’as' : `Le ${target.r.dice[params.die]}`} de ${target.name} est relancé au hasard${c ? ` (il a ${c.label} pour l’instant)` : ''}.`;
      }
      const c = target ? comboOf(v, target) : null;
      return `Relancez au hasard un dé de ${tName}${c ? `, qui a ${c.label}` : ''}.`;
    }
    case 'tournee-generale':
      if (!params.target && opts.length && opts.every((o) => !o.target)) return 'Personne n’a fini son tour : vous relancez tous vos dés, sans utiliser de lancer.';
      return `${tName} et vous relancez tous vos dés, puis vous pourrez encore relancer un des vôtres.`;
    case 'domino': {
      const n = target ? target.tournees : 0;
      return n > 0 ? `${tName} perd toutes ses Tournées (${n}).` : `${tName} n’a plus de Tournées : il ne perdrait rien.`;
    }
    case 'fermeture': {
      if (params.habitue) {
        const owner = v.players.find((o) => o.habitues.some((h) => h.uid === params.habitue));
        const h = owner?.habitues.find((x) => x.uid === params.habitue);
        return `${h ? def(h.id)?.name : 'Cet Habitué'} de ${owner?.name ?? 'l’adversaire'} rentre chez lui (défaussé).`;
      }
      if (!opts.some((o) => o.habitue)) return `Aucun Habitué adverse à chasser : vous gagnez ${plural(FERMETURE_TOURNEES, 'Tournée')} (vous en aurez ${Math.min(v.rules.tourneesMax, p.tournees - costNow(v, cardId) + FERMETURE_TOURNEES)} sur ${v.rules.tourneesMax}).`;
      return 'Un Habitué adverse rentre chez lui (défaussé).';
    }
    case 'fouine':
      if (!opts.some((o) => o.trap) && !params.trap) return 'Aucun piège adverse posé : vous piochez 1 carte.';
      return 'Vous défaussez le piège adverse choisi (vous découvrez lequel c’était) et piochez 1 carte.';
    case 'coup-coude': return `Vous piochez 1 carte (il en reste ${p.deckCount} dans votre deck).`;
    case 'mise-bouche': return 'Vous piochez 1 carte, et votre prochaine carte de la manche coûtera 2 Tournées de moins (Riposte et Dernier mot compris).';
    case 'calcul-mental': return p.deckCount > 0 ? `Vous regardez les ${Math.min(3, p.deckCount)} cartes du dessus de votre deck et en gardez une ; les autres repartent dessous.` : 'Votre deck est vide : rien à regarder.';
    case 'grand-enchainement': {
      const last = p.r.lastCoup;
      return last ? `Rejoue gratuitement « ${def(last)?.name} » : ${describeNow(v, last, params, opts)}` : 'Aucun Coup joué cette manche à rejouer : vous piochez 2 cartes.';
    }
    case 'note-salee': return `Si vous gagnez la manche, ${tName} reçoit 2 jetons de plus (sans dépasser les jetons qu’il vous reste).`;
    case 'ticket-caisse': case 'reaction-chaine': case 'pot-aux-roses': {
      const what = top && top.kind === 'card' ? (top.cardId ? `« ${def(top.cardId)?.name} »` : 'ce piège') : 'la carte adverse';
      const back = cardId === 'reaction-chaine' && p.r.played >= 2 ? ' Et comme c’est au moins votre 3e carte de la manche, elle revient dans votre main.' : '';
      return `Annule ${what} de ${top ? nameIn(v, top.owner) : tName}.${back}`;
    }
    case 'efface-tout': {
      const meE = evalPlayer({ values: v.values }, p);
      const best = Math.max(...v.players.filter((o) => o.id !== p.id && v.order.includes(o.id)).map((o) => evalPlayer({ values: v.values }, o).rank));
      const state = meE.rank < best ? ' Pour l’instant, vous perdez : vous ne recevriez qu’un jeton.' : meE.rank > best ? ' Pour l’instant, vous gagnez : elle ne servirait à rien.' : '';
      return `Si vous perdez la manche, vous ne recevez qu’un seul jeton.${state}`;
    }
    case 'verre-offert': {
      if (!target) return 'L’adversaire choisi n’aura qu’un seul lancer à son prochain tour.';
      const now = !target.r.done && v.order.indexOf(target.id) > v.order.indexOf(p.id);
      return now ? `${tName} n’aura qu’un seul lancer ce tour-ci pour battre votre combinaison.` : `${tName} a déjà joué : il n’aura qu’un seul lancer à la prochaine manche.`;
    }
    case 'trinquer': {
      const c = target ? comboOf(v, target) : null;
      return `Un de vos dés (${p.r.dice.join('-')}) et un dé de ${tName}${c ? ` (${target!.r.dice.join('-')})` : ''}, tous deux pris au hasard, changent de camp.`;
    }
    case 'vide-poches':
      return target
        ? `${target.tournees > 0 ? `Vous prenez ${plural(Math.min(VIDE_POCHES_TOURNEES, target.tournees), 'Tournée')} à ${tName}${p.tournees >= v.rules.tourneesMax ? ' (votre réserve est pleine : elle est perdue pour vous)' : ''}. ` : `${tName} n’a pas de Tournée à prendre. `}${target.handCount > 0 ? `${tName} défausse au hasard une de ses ${plural(target.handCount, 'carte')}.` : 'Sa main est vide.'}`
        : 'Prenez 1 Tournée à l’adversaire ; il défausse une carte de sa main au hasard.';
    case 'tant-qu-on-y-est': {
      const n = p.r.played + 2;
      const after = Math.min(v.rules.tourneesMax, p.tournees - costNow(v, cardId) + n);
      return `Vous gagnez ${plural(n, 'Tournée')} (2${p.r.played ? ` + ${p.r.played} pour ${p.r.played > 1 ? 'les cartes déjà jouées' : 'la carte déjà jouée'}` : ''}) : vous en aurez ${after} sur ${v.rules.tourneesMax}.`;
    }
    case 'pourboire': {
      const left = p.tokens - 1;
      return left <= 0 ? `Vous donnez votre dernier jeton à ${tName} : vous êtes déchargé, la partie est gagnée !` : `Vous donnez 1 de vos jetons à ${tName} (il vous en restera ${left}) et piochez 1 carte.`;
    }
    case 'coup-etrier': {
      if (params.die !== undefined) return `Vous relancez ${p.r.dice[params.die] === 1 ? 'votre as' : `votre ${p.r.dice[params.die]}`} au hasard (vous avez ${lowerFirst(lbl(comboOf(v, p)?.label ?? ''))} pour l’instant).`;
      return 'Relancez au hasard un de vos dés, quand les combinaisons sont sur la table.';
    }
    case 'petite-soeur': {
      const top = [...p.discard].reverse().find(petiteSoeurOk);
      return top ? `Vous reprenez en main « ${def(top.id)?.name} », le dernier Coup de votre défausse.` : 'Aucun Coup dans votre défausse : rien à reprendre.';
    }
    case 'yeux-piquent': {
      const what = top && top.kind === 'card' && top.cardId ? `« ${def(top.cardId)?.name} »` : 'son coup de dés';
      return `Annule ${what} de ${top ? nameIn(v, top.owner) : tName} : ses dés ne bougent pas.`;
    }
    // ------------------------------------------------------------- 0.46
    case 'cafe-serre': return p.habitues.length ? 'Vous piochez 1 carte et, comme vous avez un Habitué en jeu, gagnez 1 Tournée.' : 'Vous piochez 1 carte (avec un Habitué en jeu, vous gagneriez aussi 1 Tournée).';
    case 'plat-du-jour': return `Vous gagnez ${PLAT_TOURNEES} Tournées (vous en aurez ${Math.min(v.rules.tourneesMax, p.tournees - costNow(v, cardId) + PLAT_TOURNEES)} sur ${v.rules.tourneesMax}).`;
    case 'boule-de-neige': { const n = Math.min(3, p.r.played); return n ? `Vous piochez ${plural(n, 'carte')} (une par carte déjà jouée cette manche, 3 au plus).` : 'Jouez d’abord une autre carte : elle pioche 1 carte par carte déjà jouée cette manche.'; }
    case 'effet-papillon': return `Vous piochez ${plural(PAPILLON_DRAW, 'carte')} ; jusqu’à la fin de la manche, vos autres cartes coûtent 1 Tournée de moins.`;
    case 'addition': {
      const c = comboOf(v, p);
      return `Si vous gagnez la manche, votre combinaison vaut au moins ${ADDITION_MIN}${c && c.value < ADDITION_MIN ? ` (votre ${lbl(c.label)} vaut ${c.value} : elle passerait à ${ADDITION_MIN})` : ''}.`;
    }
    case 'sante': return `Si vous perdez la manche, ${tName} reçoit aussi 1 jeton (et en a donc un de plus à donner).`;
    case 'compte-rond': { const n = Math.min(3, p.r.played); return `Vous gagnez ${plural(n, 'Tournée')} (une par carte déjà jouée cette manche, 3 au plus) : vous en aurez ${Math.min(v.rules.tourneesMax, p.tournees - costNow(v, cardId) + n)} sur ${v.rules.tourneesMax}.`; }
    case 'petit-dernier':
      return params.die !== undefined ? `Vous relancez ${p.r.dice[params.die] === 1 ? 'votre as' : `votre ${p.r.dice[params.die]}`} au hasard, sans utiliser de lancer.` : 'Relancez au hasard un de vos dés, sans utiliser de lancer.';
    case 'calva': {
      if (params.die !== undefined) return diceChange(v, p, params.die, 7 - p.r.dice[params.die]);
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? 7 - x : x)));
      return `Retournez un de vos dés sur sa face opposée, juste avant les comptes.${b ? ` Le mieux : ${le(p.r.dice[b.o.die!])} → ${b.label}.` : ''}`;
    }
    case 'miroir': case 'derniere-maille': {
      if (params.die !== undefined && params.face !== undefined) return diceChange(v, p, params.die, params.face);
      const b = bestDiceOption(v, p, opts, (o) => p.r.dice.map((x, i) => (i === o.die ? o.face! : x)));
      const head = cardId === 'miroir' ? 'Un de vos dés prend la face d’un autre de vos dés.' : 'Mettez un de vos dés sur la face de votre choix.';
      return `${head}${b ? ` Le mieux : ${b.label} (vaut ${b.value}).` : ''}`;
    }
    case 'fee-verte':
      if (params.die !== undefined && params.face !== undefined) return `${p.r.dice[params.die] === 1 ? 'Votre as' : `Votre ${p.r.dice[params.die]}`} est relancé jusqu’à ${FEE_TRIES} fois, tant qu’il ne tombe pas sur ${params.face} (environ 4 chances sur 10 d’y arriver ; sinon, le dernier résultat reste).`;
      return `Choisissez un dé et la face voulue : il est relancé jusqu’à ${FEE_TRIES} fois, tant qu’il ne tombe pas dessus.`;
    case 'verres-echanges': {
      const c = target ? comboOf(v, target) : null;
      const mine = comboOf(v, p);
      return `Vos dés${mine ? ` (${lbl(mine.label)})` : ''} et ceux de ${tName}${c ? ` (${lbl(c.label)})` : ''} changent de camp.`;
    }
    case 'debauchage': {
      if (params.habitue) {
        const owner = v.players.find((o) => o.habitues.some((h) => h.uid === params.habitue));
        const h = owner?.habitues.find((x) => x.uid === params.habitue);
        return `${h ? def(h.id)?.name : 'Cet Habitué'} quitte ${owner?.name ?? 'l’adversaire'} et s’installe devant vous${h?.rounds ? ` (encore ${plural(h.rounds, 'manche')})` : ''}.`;
      }
      return opts.some((o) => o.habitue) ? 'Un Habitué adverse passe de votre côté du comptoir, avec les manches qu’il lui reste.' : 'Aucun Habitué adverse à débaucher : vous piochez 2 cartes.';
    }
    case 'retrouvailles': {
      const k = retrouvaillesTarget(p, v.rules.maxHabitues);
      return k ? `« ${def(k.id)?.name} » revient s’installer devant vous pour ${v.rules.habitueRounds ?? 3} manches, et vous piochez 1 carte.` : 'Aucun Habitué à faire revenir de votre défausse.';
    }
    case 'boucle': {
      const got = [...p.discard].reverse().filter(boucleOk).slice(0, 2);
      return got.length ? `Vous reprenez en main ${got.map((k) => `« ${def(k.id)?.name} »`).join(' et ')}.` : 'Aucun Coup à reprendre dans votre défausse.';
    }
    case 'passe-passe': return 'Un de vos pièges posés (pas un Leurre) revient dans votre main, prêt à être reposé ; vous gagnez 1 Tournée et piochez 1 carte.';
    case 'denonciation': return 'Vous défaussez le piège adverse choisi, posé devant vous, avant les comptes (vous découvrez lequel c’était), puis piochez 1 carte et gagnez 1 Tournée.';
    case 'embuscade': {
      const traps = (p.hand ?? []).filter((k) => def(k.id)?.type === 'piege').length;
      const room = target ? Math.max(0, maxTrapsOn(v) - trapsBefore(v, target.id)) : maxTrapsOn(v);
      return `Vous posez gratuitement devant ${tName} ${plural(Math.min(traps, room), 'piège')} de votre main (${traps} en main, ${room} place${room > 1 ? 's' : ''} devant lui).`;
    }
    case 'echo': {
      const src = echoSource(v, p.id);
      return src ? `Rejoue gratuitement « ${def(src)?.name} » : ${describeNow(v, src, params, opts)}` : 'Aucun Coup adverse joué cette manche à rejouer.';
    }
    case 'table-reservee': return `Annule le piège que ${top ? nameIn(v, top.owner) : tName} pose devant vous : il est défaussé.`;
    case 'a-la-votre': {
      const what = top && top.kind === 'card' && top.cardId ? `« ${def(top.cardId)?.name} »` : 'sa Riposte';
      return `Annule ${what} de ${top ? nameIn(v, top.owner) : tName} : votre carte passe.`;
    }
    case 'retour-envoyeur': case 'flagrant-delit': {
      const what = top && top.kind === 'card' && top.cardId ? `« ${def(top.cardId)?.name} »` : 'la carte adverse';
      return `Annule ${what} de ${top ? nameIn(v, top.owner) : tName}${cardId === 'retour-envoyeur' ? ' : elle retourne dans sa main (les Tournées payées sont perdues)' : ''}.`;
    }
  }
  if (d.type === 'habitue') {
    return `S’installe devant vous pour ${v.rules.habitueRounds ?? 3} manches, celle-ci comprise (${p.habitues.length + 1}/${v.rules.maxHabitues}) : ${lowerFirst(d.text)}`;
  }
  if (d.type === 'piege') {
    const before = target ? trapsBefore(v, target.id) : 0;
    return `Posé face cachée devant ${tName} (${before + 1}/${maxTrapsOn(v)} pièges devant lui). Il se déclenchera tout seul quand ${conditionOf[cardId] ?? 'sa condition arrivera'}.`;
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
  if (!d) return 'Carte inconnue.';
  const p = meOf(v);
  const cost = costNow(v, cardId);
  const decision = v.decision;
  if (v.phase === 'over') return 'La partie est finie.';
  if (v.phase === 'mulligan') return 'La partie n’a pas encore commencé.';
  if (p.r.locked) return `${def(p.r.locked)?.name ?? 'Un piège'} : plus de carte pour vous cette manche.`;
  if (d.type === 'riposte') {
    if (decision === 'respond' && v.waiting.includes(p.id)) {
      const top = v.stack[v.stack.length - 1];
      if (cost > p.tournees) return `Il vous manque ${plural(cost - p.tournees, 'Tournée')}.`;
      if (cardId === 'yeux-piquent') return 'N’annule qu’un Coup qui change des dés.';
      if (cardId === 'ticket-caisse' && top?.kind === 'card') return `N’annule qu’un Coup qui coûte ${TICKET_MAX} ou moins.`;
      if (cardId === 'pot-aux-roses') return `N’annule qu’un Coup ou un Dernier mot qui coûte ${POT_MIN} ou plus.`;
      if (cardId === 'table-reservee') return 'N’annule qu’un piège posé devant vous.';
      if (cardId === 'a-la-votre') return 'N’annule qu’une Riposte.';
      if (cardId === 'retour-envoyeur') return 'N’annule qu’un Coup.';
      if (cardId === 'flagrant-delit') return `N’annule qu’un Coup qui coûte ${FLAGRANT_MAX} ou moins.`;
      return 'Ne peut pas répondre à cette action.';
    }
    return 'Riposte : se joue en réponse à une carte adverse (on vous le proposera).';
  }
  if (d.type === 'dernier-mot') {
    if (v.phase !== 'lastword') return 'Dernier mot : se joue quand les deux combinaisons sont sur la table.';
    if (cost > p.tournees) return `Il vous manque ${plural(cost - p.tournees, 'Tournée')}.`;
    if ((cardId === 'recompter' || cardId === 'compte-rond') && p.r.played < 1) return 'Il faut avoir joué une autre carte cette manche.';
    if (cardId === 'derniere-maille' && p.r.played < 2) return 'Il faut avoir joué 2 autres cartes cette manche.';
    if (cardId === 'denonciation') return 'Aucun piège adverse posé devant vous.';
    if (cardId === 'trinquer') return opponentsOf(v).every((o) => guarded(o)) ? 'Le Garde champêtre protège ses dés.' : 'Il faut des dés des deux côtés.';
    if (!v.waiting.includes(p.id)) return 'Attendez votre tour de parole.';
    return 'Pas jouable maintenant.';
  }
  if (v.phase === 'lastword') return 'Étape Dernier mot : seules les cartes « Dernier mot » se jouent.';
  if (decision === 'respond' || decision === 'choice') return 'Attendez la fin de l’action en cours.';
  if (!isTurnOf(v, p.id)) return 'Se joue pendant votre tour.';
  if (cost > p.tournees) return `Il vous manque ${plural(cost - p.tournees, 'Tournée')} (coût ${cost}, vous en avez ${p.tournees}).`;
  if (d.type === 'habitue') return p.habitues.some((h) => h.id === cardId) ? 'Il est déjà installé devant vous.' : `Vous avez déjà ${v.rules.maxHabitues} Habitués en jeu.`;
  if (d.type === 'piege') {
    if (v.traps.filter((t) => t.owner === p.id).length >= v.rules.maxTraps) return `Vous avez déjà ${v.rules.maxTraps} pièges posés.`;
    return `Plus de place : ${maxTrapsOn(v)} pièges au plus devant un même joueur.`;
  }
  switch (cardId) {
    case 'tete-tourne': case 'coup-pouce': case 'bon-numero': case 'petit-dernier': case 'miroir': case 'fee-verte': return 'Lancez d’abord les dés.';
    case 'de-sous-table': case 'tournee-generale': return 'Lancez d’abord vos dés.';
    case 'ricochet': return p.r.played < 1 ? 'Jouez d’abord une autre carte cette manche.' : 'Lancez d’abord les dés.';
    case 'verres-echanges': return opponentsOf(v).some((o) => o.r.done) ? (p.r.throwsUsed ? 'Le Garde champêtre protège ses dés.' : 'Lancez d’abord vos dés.') : 'Il faut un adversaire qui a fini son tour.';
    case 'petite-soeur': case 'boucle': return 'Aucun Coup à reprendre dans votre défausse.';
    case 'vide-poches': return 'L’adversaire n’a ni Tournée ni carte en main.';
    case 'fermeture': return 'Ses Habitués sont protégés par le Patron.';
    case 'debauchage': return p.habitues.length >= v.rules.maxHabitues ? `Vous avez déjà ${v.rules.maxHabitues} Habitués.` : 'Aucun Habitué adverse à débaucher.';
    case 'retrouvailles': return 'Aucun Habitué à faire revenir de votre défausse.';
    case 'passe-passe': return 'Vous n’avez aucun piège posé.';
    case 'embuscade': return (p.hand ?? []).some((k) => def(k.id)?.type === 'piege') ? 'Plus de place pour vos pièges.' : 'Aucun piège dans votre main.';
    case 'echo': return 'Aucun Coup adverse à rejouer cette manche.';
  }
  return 'Pas jouable maintenant.';
}

// ------------------------------------------------------------------ libellés de la partie

/** Ligne d'état en haut du plateau. */
export function phaseLine(v: CfView, mode: string): string {
  if (v.phase === 'mulligan') return 'Main de départ';
  if (v.phase === 'over') return 'Partie terminée';
  const order = v.order.indexOf(v.you);
  const pos = order === 0 ? 'vous menez' : order === 1 ? 'vous jouez en second' : order > 1 ? `vous jouez en ${order + 1}e` : '';
  return [`Manche ${v.round}`, mode, pos].filter(Boolean).join(' · ');
}

/** Ce que le joueur doit faire maintenant (consigne courte), ou ce qu'on attend. */
export function decisionLine(v: CfView): string {
  const mine = v.waiting.includes(v.you);
  const who = nameIn(v, v.waiting[0]);
  switch (v.decision) {
    case 'mulligan': return mine ? 'Renvoyez jusqu’à 2 cartes sous le deck, ou gardez votre main.' : `${who} choisit sa main…`;
    case 'respond': return mine ? 'Répondre avec une Riposte ?' : `${who} peut répondre…`;
    case 'choice': return mine ? 'Faites votre choix.' : `${who} choisit…`;
    case 'lastword': return mine ? 'Dernier mot : jouez une carte ou passez.' : `Dernier mot : ${who} réfléchit…`;
    case 'discard': return mine ? `Main pleine : défaussez jusqu’à ${v.rules.handMax} cartes.` : `${who} défausse…`;
    case 'turn': {
      if (!mine) return `${who} joue…`;
      const p = meOf(v);
      if (p.r.throwsUsed === 0) return 'À vous : lancez les dés.';
      const left = (p.throwLimit ?? 0) - p.r.throwsUsed;
      return left > 0 ? `Touchez un dé pour le garder · encore ${plural(left, 'lancer')}` : 'Plus de lancer : jouez une carte ou arrêtez-vous.';
    }
  }
  return '';
}

/** Libellé du bouton de relance selon les dés gardés. */
export function rerollLabel(dice: number[], keep: boolean[]): string {
  const out = dice.filter((_, i) => !keep[i]);
  if (out.length === 3) return 'Relancer les 3';
  if (out.length === 0) return 'Tout est gardé';
  return `Relancer ${out.map((x) => le(x)).join(' et ')}`;
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
  if (s.total < size) out.push({ level: 'bloque', text: `Encore ${plural(size - s.total, 'carte')} pour arriver à ${size}.` });
  if (s.total > size) out.push({ level: 'bloque', text: `${plural(s.total - size, 'carte')} en trop : un deck compte exactement ${size} cartes.` });
  const expensive = s.curve[3] + s.curve[4];
  if (expensive > 4) out.push({ level: 'conseil', text: `Trop cher : ${expensive} cartes à 3 Tournées ou plus, votre main risque d’être bloquée (4 au plus conseillé).` });
  else if (s.total >= 10 && s.avgCost > 1.9) out.push({ level: 'conseil', text: `Coût moyen élevé (${s.avgCost.toFixed(1).replace('.', ',')} Tournée) : ajoutez des cartes à 0 ou 1.` });
  const parades = Object.entries(cards).filter(([id]) => def(id)?.type === 'riposte' || ['fouine', 'videur', 'denonciation', 'guetteur'].includes(id)).reduce((a, [, n]) => a + n, 0);
  if (s.total >= 10 && parades === 0) out.push({ level: 'conseil', text: 'Sans parade : aucune Riposte, Fouine ou Videur pour répondre aux coups adverses.' });
  const dice = ['tete-tourne', 'coup-pouce', 'bon-numero', 'recompter', 'cul-sec', 'josiane', 'trinquer', 'petit-dernier', 'calva', 'miroir', 'fee-verte', 'pochtron', 'ricochet', 'derniere-maille'].reduce((a, id) => a + (cards[id] ?? 0), 0);
  if (s.total >= 14 && dice === 0) out.push({ level: 'conseil', text: 'Aucune carte pour agir sur vos dés : vous dépendrez entièrement du hasard.' });
  if (Object.keys(s.families).length >= 4) out.push({ level: 'conseil', text: 'Quatre familles : un deck à deux familles est plus régulier.' });
  return out;
}
