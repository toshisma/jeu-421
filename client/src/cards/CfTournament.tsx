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

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
/** « dans 2 j 5 h », « dans 3 h 12 », « dans 14 min », « 4:07 ». */
export function untilLabel(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const min = Math.ceil(s / 60);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `dans ${h} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return `dans ${Math.floor(h / 24)} j ${h % 24} h`;
}
const STAGES = ['Vainqueur', 'Finaliste', 'Demi-finalistes'];

/** Carte « Tournoi du samedi » du menu du mode. */
export function TournamentCard({ token, acc, onOpen }: { token: Tok; acc: boolean; onOpen: () => void }) {
  const { tour, skew } = useCfTour(acc ? token : null, 30_000);
  const now = useNow(skew, 15_000);
  let line = 'Samedi 20 h 30 · élimination directe';
  let pill: { text: string; cls: string } = { text: acc ? 'Voir' : 'Compte requis', cls: '' };
  if (tour) {
    const live = tour.status === 'en-cours', open = tour.status === 'salon';
    if (live) { line = `En direct · ${plural(tour.count, 'joueur')}`; pill = { text: tour.me?.state === 'en-lice' ? 'Votre tournoi' : 'Suivre', cls: 'live' }; }
    else if (open) { line = `Salon ouvert · départ ${untilLabel(tour.beginsAt - now)} · ${plural(tour.count, 'inscrit')}`; pill = { text: tour.here ? 'Dans le salon' : 'Entrer', cls: 'live' }; }
    else if (tour.status === 'termine' || tour.status === 'annule') {
      line = tour.status === 'termine' ? `${tour.champion?.name ?? '?'} a gagné · prochain ${tour.next ? untilLabel(tour.next.startsAt - now) : ''}` : `Annulé · prochain ${tour.next ? untilLabel(tour.next.startsAt - now) : ''}`;
      pill = { text: 'Résultats', cls: '' };
    } else {
      line = `${untilLabel(tour.startsAt - now)} · ${plural(tour.count, 'inscrit')}`;
      pill = tour.registered ? { text: 'Inscrit ✓', cls: 'ok' } : { text: 'S’inscrire', cls: 'gold' };
    }
  }
  return (
    <button className="cf-tour-card" onClick={onOpen}>
      <span className="cf-tour-ic" aria-hidden><Icon name="trophy" size={24} /></span>
      <span className="cf-tour-text"><b>Tournoi du samedi</b><small>{line}</small></span>
      <em className={pill.cls}>{pill.text}</em>
    </button>
  );
}

function Face({ p, size = 26 }: { p: CfTourPlayer | null; size?: number }) {
  if (!p) return <i className="cf-tm-face empty" aria-hidden>?</i>;
  return p.photo ? <Avatar photo={p.photo} size={size} /> : <i className="cf-tm-face" aria-hidden>{p.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'}</i>;
}
const REASON: Record<string, string> = { bye: 'Qualifié sans jouer', forfait: 'Forfait', abandon: 'Abandon', 'double-forfait': 'Double forfait', victoire: '' };

function MatchCard({ m, now, onWatch }: { m: CfTourMatchView; now: number; onWatch: (code: string) => void }) {
  const row = (p: CfTourPlayer | null, side: 'a' | 'b') => (
    <span className={`cf-tm-row${m.winner === side ? ' win' : m.winner && m.status === 'fini' ? ' lose' : ''}`}>
      <Face p={p} />
      <b>{p ? p.name : m.status === 'fini' ? '—' : 'À déterminer'}</b>
      {m.winner === side && <Icon name="check" size={16} />}
    </span>
  );
  const chip = m.status === 'en-cours' ? 'En cours' : m.status === 'pret' ? ((m.readyAt ?? 0) > now ? `Départ ${untilLabel((m.readyAt ?? 0) - now)}` : 'Va commencer') : m.status === 'fini' ? REASON[m.reason ?? ''] ?? '' : 'À venir';
  return (
    <li className={`cf-tm${m.mine ? ' mine' : ''}${m.status === 'en-cours' ? ' live' : ''}`}>
      <span className="cf-tm-players">{row(m.a, 'a')}{m.b || m.status !== 'fini' || m.reason !== 'bye' ? row(m.b, 'b') : null}</span>
      <span className="cf-tm-side">
        {chip && <small>{chip}</small>}
        {m.game && !m.mine && <button className="cf-btn small violet" onClick={() => onWatch(m.game!)}><Icon name="eye" size={16} />Regarder</button>}
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
    try { set(await f()); } catch (e) { onError(e instanceof Error ? e.message : 'Action impossible.'); } finally { setBusy(false); }
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
    <CfShell title="Tournoi du samedi" sub={tour ? cfTourDate(tour.startsAt) + ' · 20 h 30' : 'Chaque samedi à 20 h 30'} onBack={onBack} className="cf-tour">
      {!acc && (
        <button className="cf-guest-card" onClick={onAccount}><b>Réservé aux comptes</b><small>Créez un compte gratuit : collection, decks, classé et tournoi du samedi.</small><em>Créer un compte</em></button>
      )}
      {acc && !tour && <p className="cf-muted">Chargement…</p>}
      {tour && (
        <section className={`cf-tour-hero is-${status}`}>
          {status === 'a-venir' && <><small>Ouverture du salon</small><b className="cf-tour-clock">{untilLabel(tour.startsAt - now)}</b></>}
          {status === 'salon' && <><small>Départ du tournoi</small><b className="cf-tour-clock">{untilLabel(tour.beginsAt - now)}</b></>}
          {status === 'en-cours' && <><small>En direct</small><b className="cf-tour-clock">{rounds?.[current]?.name ?? 'Tournoi'}</b></>}
          {status === 'termine' && <><small>Vainqueur</small><b className="cf-tour-clock champ"><Face p={tour.champion} size={30} />{tour.champion?.name ?? '—'}</b></>}
          {status === 'annule' && <><small>Tournoi annulé</small><b className="cf-tour-reason">{tour.reason}</b></>}
          <span className="cf-tour-stats">
            <span><b>{tour.count}</b>{open ? (tour.count > 1 ? ' inscrits' : ' inscrit') : ' joueurs'}</span>
            {status === 'salon' && <span><b>{tour.present}</b> dans le salon</span>}
            <span>{tour.min} à {tour.max} joueurs</span>
          </span>
          {tour.next && (status === 'termine' || status === 'annule') && <p className="cf-tour-next">Prochain tournoi : {cfTourDate(tour.next.startsAt)} à 20 h 30 ({untilLabel(tour.next.startsAt - now)}).</p>}
        </section>
      )}

      {tour && acc && (
        <div className="cf-tour-actions">
          {open && tour.cannot && !tour.registered && <p className="cf-sheet-note">{tour.cannot}</p>}
          {status === 'a-venir' && (tour.registered
            ? <><p className="cf-tour-me ok"><Icon name="check" size={18} />Vous êtes inscrit. Le salon ouvre samedi à 20 h 30 : entrez-y avant 20 h 40.</p>
              <button className="cf-btn ghost" disabled={busy} onClick={() => run(() => cfTourUnregister(token))}>Se désinscrire</button></>
            : <button className="cf-btn gold big" disabled={busy || !!tour.cannot} onClick={() => run(() => cfTourRegister(token))}>S’inscrire (gratuit)</button>)}
          {status === 'salon' && (tour.here
            ? <><p className="cf-tour-me ok"><Icon name="check" size={18} />Vous êtes dans le salon. Restez dans Coups Fourrés : votre premier match se lancera tout seul.</p>
              <button className="cf-btn ghost" disabled={busy} onClick={() => { wantSalon.current = false; void run(() => cfTourUnregister(token)); }}>Se désinscrire</button></>
            : <button className="cf-btn gold big" disabled={busy || (!tour.registered && !!tour.cannot)} onClick={() => { wantSalon.current = true; void run(() => cfTourSalon(token, true)); }}>
              {tour.registered ? 'Entrer dans le salon' : 'S’inscrire et entrer'}</button>)}
          {me && status === 'en-cours' && (
            <p className={`cf-tour-me${me.state === 'elimine' ? '' : ' ok'}`}>
              {me.state === 'absent' ? 'Vous n’étiez pas dans le salon au départ.'
                : me.state === 'elimine' ? 'Vous êtes éliminé. Suivez la suite du tableau !'
                  : myLive ? 'Votre match est en cours.' : 'Vous êtes en lice : votre prochain match se lancera tout seul.'}
            </p>
          )}
          {myLive && <button className="cf-btn gold big" onClick={onResume}>Reprendre mon match</button>}
          {st && (open || (status === 'en-cours' && me && me.state !== 'elimine' && me.state !== 'absent')) && (
            <div className="cf-tour-deck">
              {tourDeck ? <DeckBadge deck={tourDeck} label={tourDeck.valid ? 'Deck joué au tournoi' : 'Deck pas jouable'} /> : <small>Aucun deck choisi</small>}
              <button className="cf-btn small ghost" disabled={busy} onClick={() => setDeckSheet(true)}>Changer</button>
            </div>
          )}
          {me && status === 'termine' && me.state !== 'absent' && (
            <p className="cf-tour-me ok">{me.place === 1 ? 'Vous remportez le tournoi !' : me.place ? `Vous terminez ${me.place === 2 ? 'finaliste' : me.place === 3 ? 'demi-finaliste' : `${me.place}e`}.` : 'Tournoi terminé.'}
              {me.boosters > 0 && <> {plural(me.boosters, 'booster')} {me.boosters > 1 ? 'vous attendent' : 'vous attend'} dans Boosters.</>}</p>
          )}
        </div>
      )}

      {rounds && (
        <section className="cf-tour-bracket" aria-label="Tableau du tournoi">
          <div className="cf-chips cf-tour-rounds" role="tablist">
            {rounds.map((r, i) => <button key={r.name} role="tab" aria-selected={i === shownRound} className={i === shownRound ? 'on' : ''} onClick={() => setRoundSel(i)}>{r.name}</button>)}
          </div>
          <ul className="cf-tm-list">{rounds[shownRound].matches.map((m, i) => <MatchCard key={i} m={m} now={now} onWatch={onWatch} />)}</ul>
        </section>
      )}

      {tour && open && (
        <section className="cf-tour-info">
          <h3 className="cf-tour-h"><BoosterPack width={18} count={1} />Récompenses en boosters</h3>
          <div className="cf-tour-prizes">
            {CF_TOUR_PRIZE_TIERS.map((t) => (
              <div key={t.from} className={tour.count >= t.from && tour.count <= t.to ? 'on' : ''}>
                <small>{t.from} à {t.to} joueurs</small>
                <span>{t.boosters.map((b, i) => <span key={i} className="cf-tour-prize">{STAGES[i]} <b>{b}</b></span>)}</span>
              </div>
            ))}
          </div>
          <h3>Déroulé</h3>
          <ul className="cf-tour-rules">
            <li>Inscription gratuite pendant la semaine, ou dans le salon de 20 h 30 à 20 h 40, avec votre deck actif.</li>
            <li>Duels à élimination directe, mêmes règles que la partie classée. Tableau tiré au hasard ; s’il manque un adversaire, on passe le tour sans jouer.</li>
            <li>Chaque match se lance tout seul, après une courte pause. Absent au départ d’un match : forfait. Abandon ou déconnexion de plus de 60 s : défaite.</li>
            <li>Moins de 4 joueurs dans le salon à 20 h 40 : le tournoi est annulé.</li>
          </ul>
        </section>
      )}
      {deckSheet && st && (
        <DeckChoiceSheet st={st} title="Deck du tournoi" intro="Chaque match du tournoi se joue avec ce deck (vous pouvez en changer jusqu’au lancement de chaque match)."
          confirm="Jouer le tournoi" onClose={() => setDeckSheet(false)}
          onConfirm={(id) => { setDeckSheet(false); void cfSetActiveDeck(token, id).then((r) => onState?.(r.state)).catch((e) => onError(e instanceof Error ? e.message : 'Action impossible.')); }} />
      )}
    </CfShell>
  );
}
