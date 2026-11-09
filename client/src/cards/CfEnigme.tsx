import { cfText, plural } from './i18n';
import { getLang, tr } from '../i18n/lang';
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
import { cardDef } from './i18n';
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
    ? tr('cf.enigme.resolue_jeton_sur', { score: (st.score)!, s: (st.score ?? 0) > 1 ? 's' : '', best: (st.best)!, a: st.streak > 1 ? tr('cf.enigme.serie_de_jours', { streak: st.streak }) : '' })
    : tr('cf.enigme.une_fin_de_tour_a_resoudre', { a: acc ? tr('cf.enigme.jusqu_a_capsules', { best: ENIGME_CAPSULES.best }) : '' });
  return (
    <button className={`cf-enigme-entry${st?.done ? ' done' : ''}`} onClick={onOpen}>
      <span className="cf-enigme-entry-ic" aria-hidden><Pip v={4} size={22} /><Pip v={2} size={22} /><Pip v={1} size={22} /><i>?</i></span>
      <span className="cf-enigme-entry-tx"><b>{tr('cf.enigme.l_enigme_du_jour')}</b><small>{sub}</small></span>
      {st?.done ? <em className="ok">✓</em> : <em>{tr('cf.boardparts.jouer')}</em>}
    </button>
  );
}

// --- Écran -------------------------------------------------------------------------------------------

const MONTHS = ['janvier', tr('cf.enigme.fevrier'), 'mars', 'avril', 'mai', 'juin', 'juillet', tr('cf.enigme.aout'), 'septembre', 'octobre', 'novembre', tr('cf.enigme.decembre')];
const longDay = (day: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : day; };
const jetons = (n: number) => plural(n, 'jeton');

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
    if (acc) cfEnigmeBoard(token).then((b) => open(b.day, b)).catch(() => { setErr(tr('cf.enigme.serveur_injoignable_votre_reponse_ne')); open(enigmeDay(), null); });
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
      setMsg(e instanceof ApiError || e instanceof Error ? cfText(e.message) : tr('cf.enigme.validation_impossible'));
      if (e instanceof ApiError && e.status === 409) void cfEnigmeBoard(token).then((b) => { setBoard(b); if (b.mine) { setDone({ ...b.mine, streak: b.streak }); setActions(b.mine.actions); } }).catch(() => {});
    } finally { setBusy(false); }
  };

  const share = async () => {
    if (!done || !puzzle) return;
    const text = enigmeShareText(puzzle.day, done.score, done.best, done.cards, done.streak);
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (typeof nav.share === 'function') { try { await nav.share({ text }); setShared(tr('cf.enigme.partage')); return; } catch { /* annulé : on copie */ } }
    try { await navigator.clipboard.writeText(text); setShared(tr('cf.enigme.copie_collez_le_ou_vous_voulez')); } catch { setShared(text); }
  };

  if (!puzzle || !v || !s) {
    return <CfShell title={tr('cf.enigme.l_enigme_du_jour')} onBack={onBack} className="cf-enigme"><p className="cf-enigme-wait">{tr('cf.enigme.le_patron_prepare_l_enigme')}</p></CfShell>;
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
    <CfShell title={tr('cf.enigme.l_enigme_du_jour')} sub={tr('cf.enigme.la_meme_pour_tout_le_monde', { a: longDay(puzzle.day) })} onBack={onBack} className="cf-enigme">
      <p className="cf-enigme-goal">
        <b>{puzzle.oppName}</b>{tr('cf.enigme.a_fini_sur')}<b>{puzzle.oppDice.join('-')}</b>{tr('cf.enigme.vos_des_font')}<b>{puzzle.dice.join('-')}</b>{tr('cf.enigme.plus_de_lancer_gagnez_la_manche')}<b>{tr('cf.enigme.le_plus_de_jetons_possible')}</b>{tr('cf.enigme.a')}{puzzle.oppName}.
      </p>
      {err && <p className="cf-enigme-err">{err}</p>}

      <section className="cf-enigme-table" aria-label={tr('cf.enigme.la_table')}>
        <div className="cf-enigme-row opp">
          <span className="who"><b>{opp.name}</b><small>{tr('cf.enigme.a_fini_son_tour')}</small></span>
          <span className="dice">{oppDice.map((x, i) => <Pip key={i} v={x} size={30} />)}</span>
          <span className="combo">{oppLabel}</span>
          {(s.players[0].habitues.length > 0 || trapsShown.length > 0) && (
            <span className="extras">
              {s.players[0].habitues.map((h) => <button key={h.uid} className="tag hab" onClick={() => setFiche({ id: h.id, owner: opp.id })}>{tr('cf.enigme.habitue')}{cardDef(h.id)?.name}</button>)}
              {s.traps.map((t) => <button key={t.uid} className="tag trap" onClick={() => setFiche({ id: t.id, owner: opp.id })}>{tr('cf.enigme.piege_devant_vous')}{cardDef(t.id)?.name}</button>)}
            </span>
          )}
        </div>
        <div className={`cf-enigme-row me${score !== null ? (score > 0 ? ' win' : ' lose') : leading ? ' lead' : ''}`}>
          <span className="who"><b>{tr('cf.boardparts.vous')}</b><small>{phase === 'tour' ? tr('cf.enigme.plus_de_lancer') : phase === 'dernier-mot' ? tr('cf.boardparts.dernier_mot') : tr('cf.enigme.manche_finie')}</small></span>
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
        <ol className="cf-enigme-steps" aria-label={tr('cf.enigme.vos_coups')}>{steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
      )}

      {score === null && !done && (
        <>
          <p className="cf-enigme-hint">
            {phase === 'tour'
              ? <>{tr('cf.enigme.touchez_une_carte_pour_la_jouer')}{leading ? tr('cf.enigme.pour_l_instant_vous_gagnez_la') : tr('cf.enigme.pour_l_instant_vous_perdez_la')}{lastwordInHand ? tr('cf.enigme.les_derniers_mots_se_jouent_apres') : ''}</>
              : <>{tr('cf.enigme.dernier_mot_jouez_en_un_ou')}</>}
          </p>
          {hand.length > 0 && <Hand cards={hand} hints={hints} onPick={(uid) => setFiche({ uid, id: hand.find((k) => k.uid === uid)!.id, owner: me.id })} />}
          <div className="cf-enigme-acts">
            <button className="cf-btn ghost" onClick={restart} disabled={!actions.length}>{tr('cf.enigme.recommencer')}</button>
            {phase === 'tour'
              ? <button className="cf-btn gold" onClick={finishTurn}>{tr('cf.enigme.finir_mon_tour')}</button>
              : <button className="cf-btn gold" onClick={pass}>{tr('cf.enigme.passer_et_compter')}</button>}
          </div>
        </>
      )}

      {score !== null && !done && (
        <div className="cf-enigme-result">
          <b>{score > 0 ? tr('cf.enigme.vous_gagnez_la_manche_recoit', { oppName: puzzle.oppName, a: jetons(score) }) : tr('cf.enigme.vous_ne_gagnez_pas_la_manche')}</b>
          <small>{run!.cards}{tr('cf.enigme.carte')}{run!.cards > 1 ? 's' : ''}{tr('cf.enigme.jouee')}{run!.cards > 1 ? 's' : ''}{tr('cf.enigme.vous_pouvez_recommencer_autant_que_v')}{acc ? '' : tr('cf.enigme.invite_resultat_garde_sur_cet_appare')}.</small>
          {msg && <p className="cf-enigme-err">{msg}</p>}
          <div className="cf-enigme-acts">
            <button className="cf-btn ghost" onClick={restart}>{tr('cf.enigme.recommencer')}</button>
            <button className="cf-btn gold" disabled={busy} onClick={() => void validate()}>{busy ? tr('cf.enigme.un_instant') : tr('cf.enigme.valider_ma_reponse')}</button>
          </div>
        </div>
      )}

      {done && (
        <div className={`cf-enigme-done${done.score >= done.best ? ' is-best' : ''}`}>
          <span className="big">{done.score} <small>{tr('cf.boardparts.jeton')}{done.score > 1 ? 's' : ''}{tr('cf.boardparts.sur')}{done.best}{tr('cf.enigme.possible')}{done.best > 1 ? 's' : ''}</small></span>
          <b>{done.score >= done.best ? tr('cf.enigme.bravo_c_est_le_meilleur_score') : done.score > 0 ? tr('cf.enigme.bien_joue_mais_on_pouvait_faire') : tr('cf.enigme.manche_perdue_regardez_la_solution')}</b>
          <span className="meta">
            {done.rank ? <span>{getLang() === 'fr' ? (done.rank === 1 ? '1re' : `${done.rank}e`) : String(done.rank)}{tr('cf.enigme.place_sur')}{done.total}</span> : null}
            {done.streak > 0 && <span>{tr('cf.enigme.serie')}{done.streak}{tr('cf.enigme.jour')}{done.streak > 1 ? 's' : ''}{tr('cf.enigme.reussi')}{done.streak > 1 ? 's' : ''}</span>}
            {done.capsules > 0 && <span className="caps">+<Capsules n={done.capsules} size={15} /></span>}
          </span>
          <button className="cf-btn violet" onClick={() => void share()}><Icon name="share" size={18} />{tr('cf.enigme.partager_sans_devoiler')}</button>
          {shared && <small className="shared">{shared}</small>}
          <details className="cf-enigme-sol" open={done.score < done.best}>
            <summary>{tr('cf.enigme.la_solution')}{plural(puzzle.bestCards, 'carte')})</summary>
            <ol>{describeLine(puzzle, puzzle.solution).map((t, i) => <li key={i}>{cfText(t)}</li>)}</ol>
          </details>
          {!acc && <p className="cf-enigme-note">{tr('cf.enigme.invite_pas_de_classement_ni_de')}<button className="cf-link" onClick={onAccount}>{tr('cf.collection.creer_un_compte')}</button></p>}
          <p className="cf-enigme-note">{tr('cf.enigme.nouvelle_enigme_demain_minuit_heure_')}</p>
        </div>
      )}

      {acc && board && (board.top.length > 0 || done) && (
        <section className="cf-enigme-board" aria-label={tr('cf.enigme.classement_du_jour')}>
          <h3>{tr('cf.enigme.classement_du_jour_2')}<small>{board.total}{tr('cf.enigme.joueur')}{board.total > 1 ? 's' : ''}</small></h3>
          <ol>
            {board.top.slice(0, 10).map((r) => (
              <li key={r.rank} className={done?.rank === r.rank ? 'me' : ''}><span>{r.rank}</span><b>{r.username}</b><em>{jetons(r.score)}</em></li>
            ))}
          </ol>
          {done?.rank && done.rank > 10 && <p className="cf-enigme-note">{tr('cf.enigme.votre_place')}{done.rank}{tr('cf.enigme.e_sur')}{done.total}.</p>}
          {!done && <p className="cf-enigme-note">{tr('cf.enigme.meilleur_score_d_abord_puis_le')}</p>}
        </section>
      )}

      {fiche && (
        fiche.uid
          ? <Fiche t={fiche} v={v} legal={legal} snapLegal={legal} pending={false} discard={false} onAct={act} onClose={() => setFiche(null)} />
          : <div className="cfn-fiche-back" onClick={() => setFiche(null)}>
              <div className="cfn-fiche" role="dialog" aria-modal="true" aria-label={cardDef(fiche.id)?.name} onClick={(e) => e.stopPropagation()}>
                <div className="cfn-fiche-top"><i className="cfn-grip" aria-hidden /><button className="cfn-x" onClick={() => setFiche(null)} aria-label={tr('cf.boardparts.fermer')}><Icon name="close" size={18} /></button></div>
                <BigCard id={fiche.id} width={Math.min(250, (typeof window !== 'undefined' ? window.innerWidth : 360) - 60)} />
              </div>
            </div>
      )}
    </CfShell>
  );
}
