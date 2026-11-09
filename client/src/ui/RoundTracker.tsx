import { currentPlayerId, diceSum, roundStatus, type GameState } from '../../../shared/engine';
import { DiceRow } from './MiniDie';
import { tr } from '../i18n/lang';
import { botName, rich, trCombo, trn } from '../i18n/g421';

const tok = (n: number, points = false) => trn(points ? 'g421.ptLong' : 'g421.tok', n);
const lbl = (c: string) => trCombo(c);

/**
 * Bandeau de suivi de la manche : qui est en train de perdre et combien ça coûte.
 * Ex. : « 521 pour 1 jeton », puis après un 611 : « 521 pour 6 jetons ».
 */
export function RoundTracker({ s, nameOf, colorOf }: { s: GameState; nameOf: (id: string) => string; colorOf: (id: string) => string | undefined }) {
  if (s.phase === 'fini') return null;
  const st = roundStatus(s);
  const cur = currentPlayerId(s);
  const who = (ids: string[]) => ids.map((id, i) => (
    <span key={id}>{i > 0 && (i === ids.length - 1 ? ` ${tr('g421.and')} ` : ', ')}<b>{botName(nameOf(id))}</b></span>
  ));

  let main: React.ReactNode;
  let sub: React.ReactNode = null;
  if (s.isRolloff && s.rolloffKind === 'donneur') {
    // Barrage entre les meilleurs : le plus fort donne les jetons au perdant déjà connu.
    main = <><span className="tag-barrage">{tr('g421.barrage')}</span> {tr('g421.tr.whoGives1')}<b className="stake">{tok(s.rolloffPayout ?? 0)}</b> {tr('g421.tr.whoGives2')}{who([s.rolloffLoserId!])} ?</>;
    sub = st.best ? <>{tr('g421.tr.lead')}{who([st.best.id])} (<b>{st.addition ? tr('g421.totalN', { n: diceSum(st.best.combo.dice) }) : lbl(st.best.combo.label)}</b>){tr('g421.tr.oneEach')}</> : <>{tr('g421.tr.oneEachBest')}</>;
  } else if (st.points) {
    main = st.best
      ? <>{tr('g421.tr.bestRoll')}<DiceRow dice={st.best.combo.dice} size={18} /> <b>{lbl(st.best.combo.label)}</b>{tr('g421.tr.by')}{who([st.best.id])}</>
      : <>{tr('g421.phase.manche', { n: s.round, total: s.config.rounds })}{tr('g421.tr.colon')}{who([cur!])}{tr('g421.tr.opens')}</>;
  } else if (!st.worst) {
    main = s.isRolloff
      ? <>{tr(s.config.rolloffMode === 'addition' ? 'g421.tr.barAdd' : 'g421.tr.barFig')}<b className="stake">{tok(s.rolloffPayout ?? 0)}</b>{tr('g421.tr.oneEach')}</>
      : <>{tr('g421.tr.mancheN', { n: s.round })}{who([cur!])}{tr('g421.tr.opens')}{s.phase === 'charge' ? tr('g421.tr.inPot', { x: tok(s.pot) }) : ''}</>;
  } else {
    const tie = st.worst.ids.length > 1;
    main = (
      <>
        {s.isRolloff && <span className="tag-barrage">{tr('g421.barrage')}{st.addition ? tr('g421.tr.barAddTag') : ''}</span>}
        <DiceRow dice={st.worst.combo.dice} size={18} />
        <b className="worst">{st.addition ? tr('g421.totalN', { n: diceSum(st.worst.combo.dice) }) : lbl(st.worst.combo.label)}</b>
        <span>{tr('g421.tr.for')}</span>
        <b className="stake">{tok(st.amount)}</b>
        <span className="muted">{tie ? <>{tr('g421.tr.tieBetween')}{who(st.worst.ids)}{s.config.tieRule === 'barrage' ? tr('g421.tr.barParen') : ''}</> : <>{tr('g421.tr.loser')}{who(st.worst.ids)}</>}</span>
      </>
    );
    if (st.best && !st.worst.ids.includes(st.best.id)) {
      sub = <>{tr('g421.tr.bestPre')}<b>{lbl(st.best.combo.label)}</b> ({who([st.best.id])}) {tr(s.phase === 'decharge' ? 'g421.tr.gives' : 'g421.tr.setsStake')}</>;
    }
  }
  const left = st.remaining;
  return (
    <div className="tracker" aria-live="polite">
      <div className="tr-main">{main}</div>
      <div className="tr-sub">
        {sub}{sub && left > 0 && '. '}
        {left > 0 && <>{left === 1 ? tr('g421.tr.lastPlayer') : tr('g421.tr.playersLeft', { n: left })}</>}
        {s.phase === 'charge' && st.worst && <>{tr('g421.tr.pot')}{tok(s.pot)}</>}
      </div>
    </div>
  );
}

/** Pour le joueur actif : que se passerait-il s'il gardait ses dés maintenant ? */
export function WhatIf({ s, meId }: { s: GameState; meId: string }) {
  if (s.phase === 'fini' || s.throwsUsed === 0 || currentPlayerId(s) !== meId) return null;
  const st = roundStatus(s, { id: meId, dice: s.dice, throws: s.throwsUsed });
  if (st.points) return null;
  if (s.isRolloff && s.rolloffKind === 'donneur') {
    return st.best?.id === meId ? <div className="whatif top">{tr('g421.wi.leadBarrage', { x: tok(st.amount) })}</div> : <div className="whatif ok">{tr('g421.wi.otherBetter')}</div>;
  }
  const othersPlayed = s.roundOrder.filter((id) => s.results[id]).length;
  if (!othersPlayed && st.remaining <= 1) return null;
  if (st.worst?.ids.includes(meId)) {
    return <div className="whatif bad">{othersPlayed ? rich(tr('g421.wi.last', { c: lbl(st.worst.combo.label), x: tok(st.amount) })) : tr('g421.wi.open', { c: lbl(st.worst.combo.label), x: tok(st.amount) })}</div>;
  }
  if (st.best?.id === meId) return <div className="whatif top">{tr('g421.wi.bestRound', { x: tok(st.amount) })}</div>;
  return <div className="whatif ok">{tr('g421.wi.safe')}</div>;
}
