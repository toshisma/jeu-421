/**
 * Coups Fourrés : « L'énigme du jour » (entrée dans le menu du mode + écran).
 *
 * Une fin de tour fixe, la même pour tout le monde ce jour-là : on joue ses cartes une par une avec
 * le vrai moteur (fiche de carte et choix du dé comme en partie), on recommence autant qu'on veut,
 * puis on valide une seule fois. Comptes : le serveur rejoue la réponse et calcule le score officiel,
 * classement du jour et petite récompense en capsules. Invités : résultat gardé sur l'appareil.
 * Styles : bloc `.cf-enigme` à la fin de styles.css.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../account/api';
import { legalActions, viewFor, evalPlayer, type CfAction } from '../../../shared/cards/engine';
import { cardDef } from '../../../shared/cards/catalog';
import {
  ENIGME_CAPSULES, ENIGME_ME, dailyPuzzle, describeLine, enigmeDay, enigmeShareText, enigmeStreak, puzzleScore, replayPuzzle, type CfPuzzle,
} from '../../../shared/cards/puzzles';
import { Icon } from '../ui/Icon';
import { BigCard, EffectChips, Fiche, Glasses, Hand, type FicheTarget } from './BoardParts';
import { activeEffects } from './effects';
import { handHints } from './board';
import { CfShell, Capsules, Pip } from './cfui';
import { sound } from '../audio/sound';

type Tok = string | null | undefined;

export interface CfEnigmeBoard {
  day: string;
  top: { rank: number; username: string; score: number; cards: number }[];
  total: number;
  best: number;
  mine: { score: number; best: number; cards: number; capsules: number; actions: CfAction[]; rank: number; total: number } | null;
  streak: number;
}
export const cfEnigmeBoard = (token: Tok) => api<CfEnigmeBoard & { ok: true }>('/cf/enigme', { token });
export const cfEnigmeSubmit = (token: Tok, day: string, actions: CfAction[]) =>
  api<CfEnigmeBoard & { ok: true; score: number; capsules: number }>('/cf/enigme', { token, body: { day, actions } });

// --- Invités : résultat gardé sur l'appareil -------------------------------------------------------
const LOCAL_KEY = '421.cf.enigme';
interface LocalDay { day: string; score: number; best: number; cards: number; actions: CfAction[] }
function localDays(): LocalDay[] {
  try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x.day === 'string') : []; } catch { return []; }
}
function localSave(d: LocalDay) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify([d, ...localDays().filter((x) => x.day !== d.day)].slice(0, 60))); } catch { /* stockage indisponible */ }
}

/** Statut du jour pour l'entrée du menu (compte : serveur ; invité : appareil). */
function useEnigmeStatus(token: Tok, acc: boolean): { done: boolean; score?: number; best?: number; streak: number } | null {
  const [st, setSt] = useState<{ done: boolean; score?: number; best?: number; streak: number } | null>(null);
  useEffect(() => {
    const day = enigmeDay();
    if (!acc) {
      const days = localDays();
      const mine = days.find((x) => x.day === day);
      setSt({ done: !!mine, score: mine?.score, best: mine?.best, streak: enigmeStreak(days, day) });
      return;
    }
    let stop = false;
    cfEnigmeBoard(token).then((b) => { if (!stop) setSt({ done: !!b.mine, score: b.mine?.score, best: b.mine?.best, streak: b.streak }); }).catch(() => { if (!stop) setSt({ done: false, streak: 0 }); });
    return () => { stop = true; };
  }, [token, acc]);
  return st;
}

/** Entrée bien visible dans le menu du mode. */
export function EnigmeEntry({ token, acc, onOpen }: { token: Tok; acc: boolean; onOpen: () => void }) {
  const st = useEnigmeStatus(token, acc);
  const sub = st?.done
    ? `Résolue : ${st.score} jeton${(st.score ?? 0) > 1 ? 's' : ''} sur ${st.best}${st.streak > 1 ? ` · série de ${st.streak} jours` : ''}`
    : `Une fin de tour à résoudre, sans hasard${acc ? ` · jusqu’à ${ENIGME_CAPSULES.best} capsules` : ''}`;
  return (
    <button className={`cf-enigme-entry${st?.done ? ' done' : ''}`} onClick={onOpen}>
      <span className="cf-enigme-entry-ic" aria-hidden><Pip v={4} size={22} /><Pip v={2} size={22} /><Pip v={1} size={22} /><i>?</i></span>
      <span className="cf-enigme-entry-tx"><b>L’énigme du jour</b><small>{sub}</small></span>
      {st?.done ? <em className="ok">✓</em> : <em>Jouer</em>}
    </button>
  );
}

// --- Écran -------------------------------------------------------------------------------------------

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const longDay = (day: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : day; };
const jetons = (n: number) => `${n} jeton${n > 1 ? 's' : ''}`;

interface Validated { score: number; best: number; cards: number; capsules: number; rank?: number; total?: number; streak: number; actions: CfAction[] }

export function EnigmeScreen({ token, acc, onBack, onAccount }: { token: Tok; acc: boolean; onBack: () => void; onAccount: () => void }) {
  const [puzzle, setPuzzle] = useState<CfPuzzle | null>(null);
  const [board, setBoard] = useState<CfEnigmeBoard | null>(null);
  const [actions, setActions] = useState<CfAction[]>([]);
  const [done, setDone] = useState<Validated | null>(null);
  const [fiche, setFiche] = useState<FicheTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  // Le jour : celui du serveur pour un compte (même énigme pour tous), sinon celui de Bruxelles.
  useEffect(() => {
    let stop = false;
    const open = (day: string, b: CfEnigmeBoard | null) => {
      // Calcul de l'énigme (quelques dixièmes de seconde) après le premier affichage.
      setTimeout(() => {
        if (stop) return;
        const p = dailyPuzzle(day);
        setPuzzle(p);
        setBoard(b);
        if (b?.mine) { setDone({ ...b.mine, streak: b.streak }); setActions(b.mine.actions); return; }
        if (!acc) {
          const days = localDays();
          const mine = days.find((x) => x.day === day);
          if (mine) { setDone({ ...mine, capsules: 0, streak: enigmeStreak(days, day) }); setActions(mine.actions); }
        }
      }, 30);
    };
    if (acc) cfEnigmeBoard(token).then((b) => open(b.day, b)).catch(() => { setErr('Serveur injoignable : votre réponse ne pourra pas être validée pour l’instant.'); open(enigmeDay(), null); });
    else open(enigmeDay(), null);
    return () => { stop = true; };
  }, [token, acc]);

  const run = useMemo(() => (puzzle ? replayPuzzle(puzzle, actions) : null), [puzzle, actions]);
  const s = run?.state ?? null;
  const v = useMemo(() => (s ? viewFor(s, ENIGME_ME) : null), [s]);
  const legal = useMemo(() => (s && !done ? legalActions(s, ENIGME_ME) : []), [s, done]);
  const score = s ? puzzleScore(s) : null;
  const steps = useMemo(() => (puzzle ? describeLine(puzzle, actions).filter((t, i, a) => !(score !== null && i === a.length - 1)) : []), [puzzle, actions, score]);

  const act = useCallback((a: CfAction) => { setFiche(null); setActions((x) => [...x, a]); sound.click?.(); }, []);
  const restart = () => { setActions([]); setFiche(null); setMsg(null); };
  const finishTurn = () => { if (legal.some((a) => a.type === 'stop')) act({ type: 'stop' }); };
  const pass = () => { if (legal.some((a) => a.type === 'pass')) act({ type: 'pass' }); };

  const validate = async () => {
    if (!puzzle || score === null || done) return;
    setBusy(true); setMsg(null);
    try {
      if (acc) {
        const r = await cfEnigmeSubmit(token, puzzle.day, actions);
        setBoard(r);
        setDone({ score: r.score, best: r.best, cards: r.mine?.cards ?? run!.cards, capsules: r.capsules, rank: r.mine?.rank, total: r.mine?.total, streak: r.streak, actions });
      } else {
        localSave({ day: puzzle.day, score, best: puzzle.best, cards: run!.cards, actions });
        setDone({ score, best: puzzle.best, cards: run!.cards, capsules: 0, streak: enigmeStreak(localDays(), puzzle.day), actions });
      }
      if (score >= puzzle.best) sound.treasure?.(); else sound.chips?.(2);
    } catch (e) {
      setMsg(e instanceof ApiError || e instanceof Error ? e.message : 'Validation impossible.');
      if (e instanceof ApiError && e.status === 409) void cfEnigmeBoard(token).then((b) => { setBoard(b); if (b.mine) { setDone({ ...b.mine, streak: b.streak }); setActions(b.mine.actions); } }).catch(() => {});
    } finally { setBusy(false); }
  };

  const share = async () => {
    if (!done || !puzzle) return;
    const text = enigmeShareText(puzzle.day, done.score, done.best, done.cards, done.streak);
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (typeof nav.share === 'function') { try { await nav.share({ text }); setShared('Partagé !'); return; } catch { /* annulé : on copie */ } }
    try { await navigator.clipboard.writeText(text); setShared('Copié : collez-le où vous voulez !'); } catch { setShared(text); }
  };

  if (!puzzle || !v || !s) {
    return <CfShell title="L’énigme du jour" onBack={onBack} className="cf-enigme"><p className="cf-enigme-wait">Le patron prépare l’énigme…</p></CfShell>;
  }

  const me = v.players[1], opp = v.players[0];
  const oppEval = evalPlayer(s, s.players[0]);
  const myEval = evalPlayer(s, s.players[1]);
  const phase = score !== null ? 'fin' : s.phase === 'lastword' ? 'dernier-mot' : 'tour';
  // Dés affichés : à la fin de la manche, ceux du résumé (le moteur passe à la manche suivante).
  const myDice = score !== null ? s.lastRound!.combos[ENIGME_ME].dice : me.r.dice;
  const myLabel = score !== null ? s.lastRound!.combos[ENIGME_ME].label : myEval.combo.label;
  const oppDice = score !== null ? s.lastRound!.combos[opp.id].dice : s.players[0].r.dice;
  const oppLabel = score !== null ? s.lastRound!.combos[opp.id].label : oppEval.combo.label;
  const leading = myEval.rank > oppEval.rank;
  const hints = handHints(v, legal).hints;
  const hand = me.hand ?? [];
  const lastwordInHand = hand.some((k) => cardDef(k.id)?.type === 'dernier-mot');
  const fx = activeEffects(v, me, true);
  const trapsShown = s.traps.map((t) => t.id);

  return (
    <CfShell title="L’énigme du jour" sub={`${longDay(puzzle.day)} · la même pour tout le monde`} onBack={onBack} className="cf-enigme">
      <p className="cf-enigme-goal">
        <b>{puzzle.oppName}</b> a fini sur <b>{puzzle.oppDice.join('-')}</b>. Vos dés font <b>{puzzle.dice.join('-')}</b>, plus de lancer.
        Gagnez la manche en donnant <b>le plus de jetons possible</b> à {puzzle.oppName}.
      </p>
      {err && <p className="cf-enigme-err">{err}</p>}

      <section className="cf-enigme-table" aria-label="La table">
        <div className="cf-enigme-row opp">
          <span className="who"><b>{opp.name}</b><small>a fini son tour</small></span>
          <span className="dice">{oppDice.map((x, i) => <Pip key={i} v={x} size={30} />)}</span>
          <span className="combo">{oppLabel}</span>
          {(s.players[0].habitues.length > 0 || trapsShown.length > 0) && (
            <span className="extras">
              {s.players[0].habitues.map((h) => <button key={h.uid} className="tag hab" onClick={() => setFiche({ id: h.id, owner: opp.id })}>Habitué : {cardDef(h.id)?.name}</button>)}
              {s.traps.map((t) => <button key={t.uid} className="tag trap" onClick={() => setFiche({ id: t.id, owner: opp.id })}>Piège devant vous : {cardDef(t.id)?.name}</button>)}
            </span>
          )}
        </div>
        <div className={`cf-enigme-row me${score !== null ? (score > 0 ? ' win' : ' lose') : leading ? ' lead' : ''}`}>
          <span className="who"><b>Vous</b><small>{phase === 'tour' ? 'plus de lancer' : phase === 'dernier-mot' ? 'Dernier mot' : 'manche finie'}</small></span>
          <span className="dice">{myDice.map((x, i) => <Pip key={i} v={x} size={38} on={x !== puzzle.dice[i]} />)}</span>
          <span className="combo">{myLabel}</span>
          <span className="extras">
            {/* Manche finie : le moteur sert déjà la manche suivante (Tournées, effets) : on ne les montre plus. */}
            {score === null && <Glasses n={me.tournees} max={v.rules.tourneesMax} label />}
            {me.habitues.map((h) => <button key={h.uid} className="tag hab" onClick={() => setFiche({ id: h.id, owner: me.id })}>{cardDef(h.id)?.name}</button>)}
          </span>
          {score === null && fx.length > 0 && <EffectChips list={fx} onCard={(id) => setFiche({ id, owner: me.id })} />}
        </div>
      </section>

      {steps.length > 0 && (
        <ol className="cf-enigme-steps" aria-label="Vos coups">{steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
      )}

      {score === null && !done && (
        <>
          <p className="cf-enigme-hint">
            {phase === 'tour'
              ? <>Touchez une carte pour la jouer. {leading ? 'Pour l’instant, vous gagnez la manche.' : 'Pour l’instant, vous perdez la manche.'}{lastwordInHand ? ' Les Derniers mots se jouent après « Finir mon tour ».' : ''}</>
              : <>Dernier mot : jouez-en un, ou passez pour compter les points.</>}
          </p>
          {hand.length > 0 && <Hand cards={hand} hints={hints} onPick={(uid) => setFiche({ uid, id: hand.find((k) => k.uid === uid)!.id, owner: me.id })} />}
          <div className="cf-enigme-acts">
            <button className="cf-btn ghost" onClick={restart} disabled={!actions.length}>Recommencer</button>
            {phase === 'tour'
              ? <button className="cf-btn gold" onClick={finishTurn}>Finir mon tour</button>
              : <button className="cf-btn gold" onClick={pass}>Passer et compter</button>}
          </div>
        </>
      )}

      {score !== null && !done && (
        <div className="cf-enigme-result">
          <b>{score > 0 ? `Vous gagnez la manche : ${puzzle.oppName} reçoit ${jetons(score)}.` : 'Vous ne gagnez pas la manche : 0 jeton.'}</b>
          <small>{run!.cards} carte{run!.cards > 1 ? 's' : ''} jouée{run!.cards > 1 ? 's' : ''}. Vous pouvez recommencer autant que vous voulez avant de valider{acc ? '' : ' (invité : résultat gardé sur cet appareil)'}.</small>
          {msg && <p className="cf-enigme-err">{msg}</p>}
          <div className="cf-enigme-acts">
            <button className="cf-btn ghost" onClick={restart}>Recommencer</button>
            <button className="cf-btn gold" disabled={busy} onClick={() => void validate()}>{busy ? 'Un instant…' : 'Valider ma réponse'}</button>
          </div>
        </div>
      )}

      {done && (
        <div className={`cf-enigme-done${done.score >= done.best ? ' is-best' : ''}`}>
          <span className="big">{done.score} <small>jeton{done.score > 1 ? 's' : ''} sur {done.best} possible{done.best > 1 ? 's' : ''}</small></span>
          <b>{done.score >= done.best ? 'Bravo, c’est le meilleur score !' : done.score > 0 ? 'Bien joué, mais on pouvait faire mieux.' : 'Manche perdue : regardez la solution.'}</b>
          <span className="meta">
            {done.rank ? <span>{done.rank === 1 ? '1re' : `${done.rank}e`} place sur {done.total}</span> : null}
            {done.streak > 0 && <span>Série : {done.streak} jour{done.streak > 1 ? 's' : ''} réussi{done.streak > 1 ? 's' : ''}</span>}
            {done.capsules > 0 && <span className="caps">+<Capsules n={done.capsules} size={15} /></span>}
          </span>
          <button className="cf-btn violet" onClick={() => void share()}><Icon name="share" size={18} />Partager sans dévoiler</button>
          {shared && <small className="shared">{shared}</small>}
          <details className="cf-enigme-sol" open={done.score < done.best}>
            <summary>La solution ({puzzle.bestCards} carte{puzzle.bestCards > 1 ? 's' : ''})</summary>
            <ol>{describeLine(puzzle, puzzle.solution).map((t, i) => <li key={i}>{t}</li>)}</ol>
          </details>
          {!acc && <p className="cf-enigme-note">Invité : pas de classement ni de capsules. <button className="cf-link" onClick={onAccount}>Créer un compte</button></p>}
          <p className="cf-enigme-note">Nouvelle énigme demain (minuit, heure de Bruxelles).</p>
        </div>
      )}

      {acc && board && (board.top.length > 0 || done) && (
        <section className="cf-enigme-board" aria-label="Classement du jour">
          <h3>Classement du jour <small>{board.total} joueur{board.total > 1 ? 's' : ''}</small></h3>
          <ol>
            {board.top.slice(0, 10).map((r) => (
              <li key={r.rank} className={done?.rank === r.rank ? 'me' : ''}><span>{r.rank}</span><b>{r.username}</b><em>{jetons(r.score)}</em></li>
            ))}
          </ol>
          {done?.rank && done.rank > 10 && <p className="cf-enigme-note">Votre place : {done.rank}e sur {done.total}.</p>}
          {!done && <p className="cf-enigme-note">Meilleur score d’abord, puis le plus tôt validé.</p>}
        </section>
      )}

      {fiche && (
        fiche.uid
          ? <Fiche t={fiche} v={v} legal={legal} snapLegal={legal} pending={false} discard={false} onAct={act} onClose={() => setFiche(null)} />
          : <div className="cfn-fiche-back" onClick={() => setFiche(null)}>
              <div className="cfn-fiche" role="dialog" aria-modal="true" aria-label={cardDef(fiche.id)?.name} onClick={(e) => e.stopPropagation()}>
                <div className="cfn-fiche-top"><i className="cfn-grip" aria-hidden /><button className="cfn-x" onClick={() => setFiche(null)} aria-label="Fermer"><Icon name="close" size={18} /></button></div>
                <BigCard id={fiche.id} width={Math.min(250, (typeof window !== 'undefined' ? window.innerWidth : 360) - 60)} />
              </div>
            </div>
      )}
    </CfShell>
  );
}
