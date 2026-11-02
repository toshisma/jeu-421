import { currentPlayerId, diceSum, roundStatus, type GameState } from '../../../shared/engine';
import { DiceRow } from './MiniDie';

const tok = (n: number, points = false) => `${n} ${points ? 'point' : 'jeton'}${n > 1 ? 's' : ''}`;

/**
 * Bandeau de suivi de la manche : qui est en train de perdre et combien ça coûte.
 * Ex. : « 521 pour 1 jeton », puis après un 611 : « 521 pour 6 jetons ».
 */
export function RoundTracker({ s, nameOf, colorOf }: { s: GameState; nameOf: (id: string) => string; colorOf: (id: string) => string | undefined }) {
  if (s.phase === 'fini') return null;
  const st = roundStatus(s);
  const cur = currentPlayerId(s);
  const who = (ids: string[]) => ids.map((id, i) => (
    <span key={id}>{i > 0 && (i === ids.length - 1 ? ' et ' : ', ')}<b>{nameOf(id)}</b></span>
  ));

  let main: React.ReactNode;
  let sub: React.ReactNode = null;
  if (st.points) {
    main = st.best
      ? <>Meilleur coup : <DiceRow dice={st.best.combo.dice} size={18} /> <b>{st.best.combo.label}</b>, par {who([st.best.id])}</>
      : <>Manche {s.round}/{s.config.rounds} : {who([cur!])} ouvre</>;
  } else if (!st.worst) {
    main = s.isRolloff
      ? <>Barrage {s.config.rolloffMode === 'addition' ? 'à l’addition ' : 'à la figure '}pour <b className="stake">{tok(s.rolloffPayout ?? 0)}</b>, un seul lancer chacun</>
      : <>Manche {s.round} : {who([cur!])} ouvre{s.phase === 'charge' ? `, ${tok(s.pot)} au pot` : ''}</>;
  } else {
    const tie = st.worst.ids.length > 1;
    main = (
      <>
        {s.isRolloff && <span className="tag-barrage">Barrage{st.addition ? ' à l’addition' : ''}</span>}
        <DiceRow dice={st.worst.combo.dice} size={18} />
        <b className="worst">{st.addition ? `total ${diceSum(st.worst.combo.dice)}` : st.worst.combo.label}</b>
        <span>pour</span>
        <b className="stake">{tok(st.amount)}</b>
        <span className="muted">{tie ? <>égalité entre {who(st.worst.ids)}{s.config.tieRule === 'barrage' ? ' (barrage)' : ''}</> : <>perdant : {who(st.worst.ids)}</>}</span>
      </>
    );
    if (st.best && !st.worst.ids.includes(st.best.id)) {
      sub = <>Meilleur : <b>{st.best.combo.label}</b> ({who([st.best.id])}) {s.phase === 'decharge' ? 'donne' : 'fixe l’enjeu'}</>;
    }
  }
  const left = st.remaining;
  return (
    <div className="tracker" aria-live="polite">
      <div className="tr-main">{main}</div>
      <div className="tr-sub">
        {sub}{sub && left > 0 && '. '}
        {left > 0 && <>{left === 1 ? 'dernier joueur' : `${left} joueurs à jouer`}</>}
        {s.phase === 'charge' && st.worst && <>. Pot : {tok(s.pot)}</>}
      </div>
    </div>
  );
}

/** Pour le joueur actif : que se passerait-il s'il gardait ses dés maintenant ? */
export function WhatIf({ s, meId }: { s: GameState; meId: string }) {
  if (s.phase === 'fini' || s.throwsUsed === 0 || currentPlayerId(s) !== meId) return null;
  const st = roundStatus(s, { id: meId, dice: s.dice, throws: s.throwsUsed });
  if (st.points) return null;
  const othersPlayed = s.roundOrder.filter((id) => s.results[id]).length;
  if (!othersPlayed && st.remaining <= 1) return null;
  if (st.worst?.ids.includes(meId)) {
    return <div className="whatif bad">{othersPlayed ? <>Vous seriez <b>dernier</b> : {st.worst.combo.label} pour {tok(st.amount)}</> : <>Vous ouvrez : à battre {st.worst.combo.label} pour {tok(st.amount)}</>}</div>;
  }
  if (st.best?.id === meId) return <div className="whatif top">Meilleur coup de la manche : l'enjeu passe à {tok(st.amount)}</div>;
  return <div className="whatif ok">À l'abri pour l'instant</div>;
}
