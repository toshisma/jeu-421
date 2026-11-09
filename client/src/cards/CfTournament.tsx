import { cfText } from './i18n';
import { plural } from './i18n';
import { tr } from '../i18n/lang';
/**
 * Coups Fourrés : tournoi du samedi (20 h 30, heure de Bruxelles).
 * Carte du menu du mode (compte à rebours, inscrits, inscription) et écran du tournoi
 * (inscription, salon, barème, tableau en direct, regarder un match). Le serveur fait foi :
 * voir server/cf-tournament.ts et shared/cards/tournament.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../account/api';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { CF_TOUR_PRIZE_TIERS, cfTourDate, type CfTourMatchView, type CfTourPlayer, type CfTourView } from '../../../shared/cards/tournament';
import { BoosterPack } from './components';
import { CfShell } from './cfui';
import { cfSetActiveDeck, type CfState } from './api';
import { DeckBadge, DeckChoiceSheet } from './DeckPicker';

type Tok = string | null | undefined;
type TourRes = { ok: true; tour: CfTourView };
export const cfTour = (token: Tok) => api<TourRes>('/cf/tournoi', { token }).then((r) => r.tour);
export const cfTourRegister = (token: Tok) => api<TourRes>('/cf/tournoi/inscription', { token, body: {} }).then((r) => r.tour);
export const cfTourUnregister = (token: Tok) => api<TourRes>('/cf/tournoi/desinscription', { token, body: {} }).then((r) => r.tour);
export const cfTourSalon = (token: Tok, inside: boolean) => api<TourRes>('/cf/tournoi/salon', { token, body: { in: inside } }).then((r) => r.tour);

/** Vue du tournoi, rafraîchie régulièrement ; `skew` corrige l'horloge du téléphone. */
export function useCfTour(token: Tok, every: number) {
  const [tour, setTour] = useState<CfTourView | null>(null);
  const [skew, setSkew] = useState(0);
  const set = useCallback((t: CfTourView) => { setTour(t); setSkew(t.serverNow - Date.now()); }, []);
  const load = useCallback(() => cfTour(token).then(set).catch(() => {}), [token, set]);
  useEffect(() => {
    void load();
    const i = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, every);
    return () => clearInterval(i);
  }, [load, every]);
  return { tour, set, load, skew };
}
function useNow(skew: number, every = 1000) {
  const [t, setT] = useState(() => Date.now() + skew);
  useEffect(() => { setT(Date.now() + skew); const i = setInterval(() => setT(Date.now() + skew), every); return () => clearInterval(i); }, [skew, every]);
  return t;
}

/** « dans 2 j 5 h », « dans 3 h 12 », « dans 14 min », « 4:07 ». */
export function untilLabel(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const min = Math.ceil(s / 60);
  if (min < 60) return tr('cf.tournament.dans_min', { min: min });
  const h = Math.floor(s / 3600);
  if (h < 24) return tr('cf.tournament.dans_h', { h: h, a: String(Math.floor((s % 3600) / 60)).padStart(2, '0') });
  return tr('cf.tournament.dans_j_h', { a: Math.floor(h / 24), b: h % 24 });
}
const STAGES = [tr('cf.tournament.vainqueur'), tr('cf.tournament.finaliste'), tr('cf.tournament.demi_finalistes')];

/** Carte « Tournoi du samedi » du menu du mode. */
export function TournamentCard({ token, acc, onOpen }: { token: Tok; acc: boolean; onOpen: () => void }) {
  const { tour, skew } = useCfTour(acc ? token : null, 30_000);
  const now = useNow(skew, 15_000);
  let line = tr('cf.tournament.samedi_20_h_30_elimination_directe');
  let pill: { text: string; cls: string } = { text: acc ? tr('cf.tournament.voir') : tr('cf.tournament.compte_requis'), cls: '' };
  if (tour) {
    const live = tour.status === 'en-cours', open = tour.status === 'salon';
    if (live) { line = tr('cf.tournament.en_direct', { joueurs: plural(tour.count, 'joueur') }); pill = { text: tour.me?.state === 'en-lice' ? tr('cf.tournament.votre_tournoi') : tr('cf.tournament.suivre'), cls: 'live' }; }
    else if (open) { line = tr('cf.tournament.salon_ouvert_depart', { a: untilLabel(tour.beginsAt - now), inscrits: plural(tour.count, 'inscrit') }); pill = { text: tour.here ? tr('cf.tournament.dans_le_salon') : tr('cf.tournament.entrer'), cls: 'live' }; }
    else if (tour.status === 'termine' || tour.status === 'annule') {
      line = tour.status === 'termine' ? tr('cf.tournament.a_gagne_prochain', { a: tour.champion?.name ?? '?', b: tour.next ? untilLabel(tour.next.startsAt - now) : '' }) : tr('cf.tournament.annule_prochain', { a: tour.next ? untilLabel(tour.next.startsAt - now) : '' });
      pill = { text: tr('cf.tournament.resultats'), cls: '' };
    } else {
      line = `${untilLabel(tour.startsAt - now)} · ${plural(tour.count, 'inscrit')}`;
      pill = tour.registered ? { text: tr('cf.tournament.inscrit'), cls: 'ok' } : { text: tr('cf.tournament.s_inscrire'), cls: 'gold' };
    }
  }
  return (
    <button className="cf-tour-card" onClick={onOpen}>
      <span className="cf-tour-ic" aria-hidden><Icon name="trophy" size={24} /></span>
      <span className="cf-tour-text"><b>{tr('cf.tournament.tournoi_du_samedi')}</b><small>{line}</small></span>
      <em className={pill.cls}>{pill.text}</em>
    </button>
  );
}

function Face({ p, size = 26 }: { p: CfTourPlayer | null; size?: number }) {
  if (!p) return <i className="cf-tm-face empty" aria-hidden>?</i>;
  return p.photo ? <Avatar photo={p.photo} size={size} /> : <i className="cf-tm-face" aria-hidden>{p.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'}</i>;
}
const REASON: Record<string, string> = { get bye() { return tr('cf.tournament.qualifie_sans_jouer'); }, get forfait() { return tr('cf.tournament.forfait'); }, get abandon() { return tr('cf.mode.abandon'); }, get 'double-forfait'() { return tr('cf.tournament.double_forfait'); }, victoire: '' };

function MatchCard({ m, now, onWatch }: { m: CfTourMatchView; now: number; onWatch: (code: string) => void }) {
  const row = (p: CfTourPlayer | null, side: 'a' | 'b') => (
    <span className={`cf-tm-row${m.winner === side ? ' win' : m.winner && m.status === 'fini' ? ' lose' : ''}`}>
      <Face p={p} />
      <b>{p ? p.name : m.status === 'fini' ? '—' : tr('cf.tournament.a_determiner')}</b>
      {m.winner === side && <Icon name="check" size={16} />}
    </span>
  );
  const chip = m.status === 'en-cours' ? tr('cf.boardparts.en_cours_2') : m.status === 'pret' ? ((m.readyAt ?? 0) > now ? tr('cf.tournament.depart', { a: untilLabel((m.readyAt ?? 0) - now) }) : tr('cf.tournament.va_commencer')) : m.status === 'fini' ? REASON[m.reason ?? ''] ?? '' : tr('cf.tournament.a_venir');
  return (
    <li className={`cf-tm${m.mine ? ' mine' : ''}${m.status === 'en-cours' ? ' live' : ''}`}>
      <span className="cf-tm-players">{row(m.a, 'a')}{m.b || m.status !== 'fini' || m.reason !== 'bye' ? row(m.b, 'b') : null}</span>
      <span className="cf-tm-side">
        {chip && <small>{chip}</small>}
        {m.game && !m.mine && <button className="cf-btn small violet" onClick={() => onWatch(m.game!)}><Icon name="eye" size={16} />{tr('cf.mode.regarder')}</button>}
      </span>
    </li>
  );
}

/** Écran du tournoi : inscription, salon, barème, tableau en direct. */
export function TournamentScreen({ token, acc, onBack, onWatch, onResume, onAccount, onError, st, onState }: {
  token: Tok; acc: boolean; onBack: () => void; onWatch: (code: string) => void; onResume: () => void; onAccount: () => void; onError: (t: string) => void;
  /** État du mode (decks) : on choisit ici le deck joué au tournoi (c'est le deck actif au lancement de chaque match). */
  st?: CfState | null; onState?: (s: CfState) => void;
}) {
  const [deckSheet, setDeckSheet] = useState(false);
  const tourDeck = st?.decks.find((d) => d.id === st.activeDeck) ?? null;
  const { tour, set, skew } = useCfTour(acc ? token : null, 4000);
  const now = useNow(skew);
  const [busy, setBusy] = useState(false);
  const [roundSel, setRoundSel] = useState<number | null>(null);
  const wantSalon = useRef(false);
  const run = async (f: () => Promise<CfTourView>) => {
    setBusy(true);
    try { set(await f()); } catch (e) { onError(e instanceof Error ? cfText(e.message) : tr('cf.decks.action_impossible')); } finally { setBusy(false); }
  };
  // Salon : après une coupure (ou un redémarrage du serveur), on y retourne tout seul.
  useEffect(() => {
    if (tour?.status === 'salon' && tour.registered && !tour.here && wantSalon.current) void cfTourSalon(token, true).then(set).catch(() => {});
  }, [tour, token, set]);

  const status = tour?.status;
  const open = status === 'a-venir' || status === 'salon';
  const rounds = tour?.rounds ?? null;
  const current = rounds ? Math.max(0, rounds.findIndex((r) => r.matches.some((m) => m.status !== 'fini'))) : 0;
  const shownRound = rounds ? Math.min(roundSel ?? (rounds.every((r) => r.matches.every((m) => m.status === 'fini')) ? rounds.length - 1 : current), rounds.length - 1) : 0;
  const me = tour?.me;
  const myLive = me?.match?.status === 'en-cours' && me.match.mine;

  return (
    <CfShell title={tr('cf.tournament.tournoi_du_samedi')} sub={tour ? cfTourDate(tour.startsAt) + tr('cf.tournament.20_h_30') : tr('cf.tournament.chaque_samedi_a_20_h_30')} onBack={onBack} className="cf-tour">
      {!acc && (
        <button className="cf-guest-card" onClick={onAccount}><b>{tr('cf.tournament.reserve_aux_comptes')}</b><small>{tr('cf.tournament.creez_un_compte_gratuit_collection_d')}</small><em>{tr('cf.collection.creer_un_compte')}</em></button>
      )}
      {acc && !tour && <p className="cf-muted">{tr('cf.info.chargement')}</p>}
      {tour && (
        <section className={`cf-tour-hero is-${status}`}>
          {status === 'a-venir' && <><small>{tr('cf.tournament.ouverture_du_salon')}</small><b className="cf-tour-clock">{untilLabel(tour.startsAt - now)}</b></>}
          {status === 'salon' && <><small>{tr('cf.tournament.depart_du_tournoi')}</small><b className="cf-tour-clock">{untilLabel(tour.beginsAt - now)}</b></>}
          {status === 'en-cours' && <><small>{tr('cf.tournament.en_direct_2')}</small><b className="cf-tour-clock">{cfText(rounds?.[current]?.name ?? '') || tr('cf.tournament.tournoi')}</b></>}
          {status === 'termine' && <><small>{tr('cf.tournament.vainqueur')}</small><b className="cf-tour-clock champ"><Face p={tour.champion} size={30} />{tour.champion?.name ?? '—'}</b></>}
          {status === 'annule' && <><small>{tr('cf.tournament.tournoi_annule')}</small><b className="cf-tour-reason">{tour.reason}</b></>}
          <span className="cf-tour-stats">
            <span><b>{tour.count}</b>{open ? (tour.count > 1 ? ' inscrits' : ' inscrit') : ' joueurs'}</span>
            {status === 'salon' && <span><b>{tour.present}</b>{tr('cf.tournament.dans_le_salon_2')}</span>}
            <span>{tour.min}{tr('cf.enigme.a')}{tour.max} joueurs</span>
          </span>
          {tour.next && (status === 'termine' || status === 'annule') && <p className="cf-tour-next">{tr('cf.tournament.prochain_tournoi')}{cfTourDate(tour.next.startsAt)}{tr('cf.tournament.a_20_h_30')}{untilLabel(tour.next.startsAt - now)}).</p>}
        </section>
      )}

      {tour && acc && (
        <div className="cf-tour-actions">
          {open && tour.cannot && !tour.registered && <p className="cf-sheet-note">{tour.cannot}</p>}
          {status === 'a-venir' && (tour.registered
            ? <><p className="cf-tour-me ok"><Icon name="check" size={18} />{tr('cf.tournament.vous_etes_inscrit_le_salon_ouvre')}</p>
              <button className="cf-btn ghost" disabled={busy} onClick={() => run(() => cfTourUnregister(token))}>{tr('cf.tournament.se_desinscrire')}</button></>
            : <button className="cf-btn gold big" disabled={busy || !!tour.cannot} onClick={() => run(() => cfTourRegister(token))}>{tr('cf.tournament.s_inscrire_gratuit')}</button>)}
          {status === 'salon' && (tour.here
            ? <><p className="cf-tour-me ok"><Icon name="check" size={18} />{tr('cf.tournament.vous_etes_dans_le_salon_restez')}</p>
              <button className="cf-btn ghost" disabled={busy} onClick={() => { wantSalon.current = false; void run(() => cfTourUnregister(token)); }}>{tr('cf.tournament.se_desinscrire')}</button></>
            : <button className="cf-btn gold big" disabled={busy || (!tour.registered && !!tour.cannot)} onClick={() => { wantSalon.current = true; void run(() => cfTourSalon(token, true)); }}>
              {tour.registered ? tr('cf.tournament.entrer_dans_le_salon') : tr('cf.tournament.s_inscrire_et_entrer')}</button>)}
          {me && status === 'en-cours' && (
            <p className={`cf-tour-me${me.state === 'elimine' ? '' : ' ok'}`}>
              {me.state === 'absent' ? tr('cf.tournament.vous_n_etiez_pas_dans_le')
                : me.state === 'elimine' ? tr('cf.tournament.vous_etes_elimine_suivez_la_suite')
                  : myLive ? tr('cf.tournament.votre_match_est_en_cours') : tr('cf.tournament.vous_etes_en_lice_votre_prochain')}
            </p>
          )}
          {myLive && <button className="cf-btn gold big" onClick={onResume}>{tr('cf.tournament.reprendre_mon_match')}</button>}
          {st && (open || (status === 'en-cours' && me && me.state !== 'elimine' && me.state !== 'absent')) && (
            <div className="cf-tour-deck">
              {tourDeck ? <DeckBadge deck={tourDeck} label={tourDeck.valid ? tr('cf.tournament.deck_joue_au_tournoi') : tr('cf.tournament.deck_pas_jouable')} /> : <small>{tr('cf.tournament.aucun_deck_choisi')}</small>}
              <button className="cf-btn small ghost" disabled={busy} onClick={() => setDeckSheet(true)}>{tr('cf.boardparts.changer')}</button>
            </div>
          )}
          {me && status === 'termine' && me.state !== 'absent' && (
            <p className="cf-tour-me ok">{me.place === 1 ? tr('cf.tournament.vous_remportez_le_tournoi') : me.place ? tr('cf.tournament.vous_terminez', { a: me.place === 2 ? 'finaliste' : me.place === 3 ? 'demi-finaliste' : `${me.place}e` }) : tr('cf.tournament.tournoi_termine')}
              {me.boosters > 0 && <> {plural(me.boosters, 'booster')} {me.boosters > 1 ? tr('cf.tournament.vous_attendent') : tr('cf.tournament.vous_attend')}{tr('cf.tournament.dans_boosters')}</>}</p>
          )}
        </div>
      )}

      {rounds && (
        <section className="cf-tour-bracket" aria-label={tr('cf.tournament.tableau_du_tournoi')}>
          <div className="cf-chips cf-tour-rounds" role="tablist">
            {rounds.map((r, i) => <button key={r.name} role="tab" aria-selected={i === shownRound} className={i === shownRound ? 'on' : ''} onClick={() => setRoundSel(i)}>{r.name}</button>)}
          </div>
          <ul className="cf-tm-list">{rounds[shownRound].matches.map((m, i) => <MatchCard key={i} m={m} now={now} onWatch={onWatch} />)}</ul>
        </section>
      )}

      {tour && open && (
        <section className="cf-tour-info">
          <h3 className="cf-tour-h"><BoosterPack width={18} count={1} />{tr('cf.tournament.recompenses_en_boosters')}</h3>
          <div className="cf-tour-prizes">
            {CF_TOUR_PRIZE_TIERS.map((t) => (
              <div key={t.from} className={tour.count >= t.from && tour.count <= t.to ? 'on' : ''}>
                <small>{t.from}{tr('cf.enigme.a')}{t.to} joueurs</small>
                <span>{t.boosters.map((b, i) => <span key={i} className="cf-tour-prize">{STAGES[i]} <b>{b}</b></span>)}</span>
              </div>
            ))}
          </div>
          <h3>{tr('cf.tournament.deroule')}</h3>
          <ul className="cf-tour-rules">
            <li>{tr('cf.tournament.inscription_gratuite_pendant_la_sema')}</li>
            <li>{tr('cf.tournament.duels_a_elimination_directe_memes_re')}</li>
            <li>{tr('cf.tournament.chaque_match_se_lance_tout_seul')}</li>
            <li>{tr('cf.tournament.moins_de_4_joueurs_dans_le')}</li>
          </ul>
        </section>
      )}
      {deckSheet && st && (
        <DeckChoiceSheet st={st} title={tr('cf.tournament.deck_du_tournoi')} intro={tr('cf.tournament.chaque_match_du_tournoi_se_joue')}
          confirm={tr('cf.tournament.jouer_le_tournoi')} onClose={() => setDeckSheet(false)}
          onConfirm={(id) => { setDeckSheet(false); void cfSetActiveDeck(token, id).then((r) => onState?.(r.state)).catch((e) => onError(e instanceof Error ? cfText(e.message) : tr('cf.decks.action_impossible'))); }} />
      )}
    </CfShell>
  );
}
