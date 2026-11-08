import { useEffect, useMemo, useState } from 'react';
import { askConfirm } from './confirm';
import { useNavGuard } from './navGuard';
import { describeConfig } from '../../../shared/config';
import type { GameState } from '../../../shared/engine';
import type { Appearance } from '../../../shared/progress/catalog';
import type { RewardContext } from '../../../shared/progress/profile';
import {
  DEFAULT_TOURNAMENT, MIN_TOURNAMENT_PLAYERS, STAKES, TABLE_SIZES, TOURNAMENT_SIZES, currentTableOf, prizes, roundName, roundsFor,
  type PublicTournament, type TournamentSettings,
} from '../../../shared/tournament';
import type { EndReward, ProfileApi } from '../account/useProfile';
import { OnlineController, OnlineSession } from '../game/online';
import { publicUrl } from '../platform';
import { loadSession, type Settings } from '../settings';
import { Avatar } from './Avatar';
import { ConfigEditor } from './ConfigEditor';
import { GameScreen, type EarlyOptions } from './GameScreen';
import { Chat } from './Chat';
import { Icon } from './Icon';
import { Seg, StakePicker } from './OnlineHub';
import { BigAction, Choices, Section, Shell } from './kit';
import { ScheduledLobby, ScheduledResults } from './Scheduled';
import { schedRounds } from '../../../shared/scheduled';
import { usePresenceLayer } from '../presence';

export type TournamentMode = { kind: 'create' } | { kind: 'join'; code: string; pay?: boolean } | { kind: 'resume' };
/** Nombre de tours prévus (tournoi programmé : format propre, finale de 4 à 6 joueurs). */
const totalRounds = (t: PublicTournament) => Math.max(t.rounds.length,
  t.sched ? schedRounds(t.sched.starters ?? t.players.length).rounds : roundsFor(t.players.length, t.settings.tableSize));
const PLACE = (i: number) => (i === 0 ? '1er' : `${i + 1}e`);

function useSession(session: OnlineSession | null) {
  const [, force] = useState(0);
  useEffect(() => {
    const off = session?.subscribe(() => force((n) => n + 1));
    return () => { off?.(); };
  }, [session]);
}
/** Secondes restantes avant un horodatage (rafraîchi chaque seconde). */
function useCountdown(at: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
}

/** Tournoi : création ou inscription → salle d'attente → tables successives → classement final. */
export function TournamentFlow({ mode, settings, onSettings, onExit, onCancel, appearance, onGameEnd, pa }: {
  mode: TournamentMode; settings: Settings; onSettings: (s: Settings) => void; onExit: () => void; onCancel?: () => void;
  appearance: Appearance; onGameEnd: (state: GameState, meId: string, ctx: RewardContext) => Promise<EndReward | null>; pa: ProfileApi;
}) {
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<TournamentSettings>({ ...DEFAULT_TOURNAMENT, title: `Tournoi de ${settings.name || 'mon comptoir'}` });
  const [watchBracket, setWatchBracket] = useState(false);
  useSession(session);

  const name = settings.name.trim() || pa.session?.username || 'Joueur';
  const connect = async (kind: 'create' | 'join' | 'resume') => {
    setBusy(true);
    setError(null);
    const s = new OnlineSession(pa.token, pa.onServerReward, pa.onServerProfile);
    s.dice = pa.profile.equipped.dice;
    try {
      if (kind === 'create') await s.tCreate(name, settings.avatar, form);
      else if (kind === 'join') await s.tJoin((mode as { code: string }).code, name, settings.avatar, undefined, (mode as { pay?: boolean }).pay);
      else {
        const saved = loadSession();
        if (!saved?.tournament) throw new Error('Aucun tournoi à reprendre');
        await s.tJoin(saved.code, name, settings.avatar, saved.token);
      }
      setSession(s);
    } catch (e) {
      s.socket.disconnect();
      setError((e as Error).message);
    }
    setBusy(false);
  };
  useEffect(() => { if (mode.kind !== 'create') void connect(mode.kind); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const controller = useMemo(() => (session ? new OnlineController(session) : null), [session]);
  const t = session?.tournament ?? null;
  const room = session?.room ?? null;
  // Partir par la barre du bas : comme la flèche retour du tableau (désinscription d'un tournoi pas encore
  // lancé, sinon on se détache : le tournoi reste reprenable depuis l'accueil).
  useNavGuard(session ? { leave: () => { if (session.closed) return; if (t?.status === 'inscriptions' && !t.sched) session.tLeave(); else session.detach(); } } : null);
  // Nouvelle table (tour suivant) : on y retourne automatiquement.
  useEffect(() => { setWatchBracket(false); }, [room?.code]);
  // Présence (administration) : salon du tournoi ou table en cours.
  usePresenceLayer(t ? { view: room?.status === 'playing' && session?.game ? 'partie' : 'salon', code: room?.status === 'playing' && room.code ? room.code : t.code } : null);

  if (session && t && controller) {
    const myTable = currentTableOf(t, session.playerId);
    const live = t.status === 'en-cours' && myTable && !myTable.ranking && room?.code === myTable.code && room.status === 'playing';
    const atTable = room?.tournament === t.code && room.code === myTable?.code && session.game;
    if ((live || atTable) && !watchBracket) {
      const roundIdx = t.rounds.length - 1;
      const total = totalRounds(t);
      const note = (st: GameState) => {
        const rank = st.ranking.indexOf(session.playerId);
        const tb = currentTableOf(t, session.playerId);
        if (roundIdx === total - 1 || t.rounds[roundIdx].tables.length === 1) return rank === 0 ? 'Vous remportez le tournoi !' : `Finale terminée : vous finissez ${PLACE(rank)}.`;
        return rank >= 0 && tb && rank < tb.qualified ? `Qualifié pour ${roundName(roundIdx + 1, total).toLowerCase()} !` : 'Éliminé du tournoi. Merci d’avoir joué !';
      };
      // Sorti avant la fin de la table : qualifié (on attend le tour suivant), éliminé ou place de finale acquise (on peut partir).
      const early = (_st: GameState, place: number): EarlyOptions => {
        const tb = currentTableOf(t, session.playerId);
        const final = t.rounds[roundIdx].tables.length === 1;
        const board = { label: 'Voir le tableau', run: () => setWatchBracket(true) };
        const quit = { label: 'Empocher et quitter', run: () => { session.tLeave(); onExit(); } };
        if (final) return {
          title: place === 1 ? 'Vous remportez le tournoi !' : `Vous finissez ${PLACE(place - 1)} du tournoi !`,
          note: pa.isAccount ? 'Votre place est acquise : votre gain de tournoi vous est déjà versé.' : 'Votre place au tournoi est acquise.', quit, alt: board,
        };
        if (tb && place - 1 < tb.qualified) return {
          title: `Qualifié pour ${roundName(roundIdx + 1, total).toLowerCase()} !`,
          note: 'Restez dans les parages : le tour suivant commence quand toutes les tables ont fini.', quit: null, alt: board,
        };
        return {
          title: `Éliminé : ${PLACE(place - 1)} de la table`,
          note: pa.isAccount ? 'Votre classement final (et votre gain éventuel) vous sera versé à la fin du tournoi.' : 'Merci d’avoir joué ! Vous pouvez partir ou regarder la fin.', quit, alt: board,
        };
      };
      return (
        <>
        <GameScreen key={room!.code} controller={controller} settings={settings} onSettings={onSettings} onExit={() => setWatchBracket(true)}
          appearance={appearance} pa={pa} onGameEnd={(st, ctx) => onGameEnd(st, controller.meId, ctx)}
          tableExit={{ label: 'Voir le tableau', note }} early={early} />
          {/* Tchat de la table, comme à une table en ligne ordinaire. */}
          <Chat session={session} pa={pa} />
        </>
      );
    }
    return <TournamentView session={session} t={t} pa={pa} onExit={onExit}
      onBackToTable={live || atTable ? () => setWatchBracket(false) : null} />;
  }

  if (mode.kind !== 'create' || session) {
    return (
      <Shell title="Tournoi" onBack={() => { session?.detach(); onExit(); }}>
        <div className="form">
          {(busy || session) && !error && <p>Connexion au tournoi…</p>}
          {error && <><p className="error">{error}</p><button className="btn" onClick={onCancel ?? onExit}>Retour</button></>}
        </div>
      </Shell>
    );
  }

  const set = (patch: Partial<TournamentSettings>) => setForm((f) => ({ ...f, ...patch }));
  const rounds = roundsFor(form.maxPlayers, form.tableSize);
  return (
    <Shell title="Créer un tournoi" onBack={onCancel ?? onExit} wide icon="trophy" sub={`${form.maxPlayers} joueurs max., tables de ${form.tableSize}`}
      foot={<>{error && <p className="error">{error}</p>}<BigAction icon="trophy" tone="gold" disabled={busy || !form.title.trim()} onClick={() => void connect('create')}
        label={busy ? 'Création…' : 'Créer le tournoi'} sub={`${rounds} tour${rounds > 1 ? 's' : ''} une fois complet`} /></>}>
      <form className="cols" onSubmit={(e) => { e.preventDefault(); void connect('create'); }}>
        <section className="k-form">
          <label className="k-field"><span className="k-label">Nom du tournoi</span>
            <input className="k-input" value={form.title} maxLength={32} onChange={(e) => set({ title: e.target.value })} /></label>
          <div className="k-field"><span className="k-label">Qui peut s'inscrire ?</span>
            <Choices value={form.visibility} onChange={(v) => set({ visibility: v })}
              options={[{ v: 'private', label: 'Sur invitation', hint: 'Avec le code ou le lien', icon: 'key' }, { v: 'public', label: 'Tout le monde', hint: 'Visible dans la liste', icon: 'people' }]} />
          </div>
          <Seg label="Nombre de joueurs maximum" hint={`Le tournoi peut démarrer dès ${MIN_TOURNAMENT_PLAYERS} inscrits ; il démarre seul quand il est complet.`}
            value={form.maxPlayers} onChange={(v) => set({ maxPlayers: v })} options={TOURNAMENT_SIZES.map((n) => ({ v: n, label: String(n) }))} />
          <Seg label="Joueurs par table" value={form.tableSize} onChange={(v) => set({ tableSize: v })}
            options={TABLE_SIZES.map((n) => ({ v: n, label: String(n) }))} />
          <p className="k-hint">Complet, ce tournoi se joue en {rounds} tour{rounds > 1 ? 's' : ''} : la meilleure moitié de chaque table se qualifie, jusqu'à la finale.</p>
          <StakePicker value={form.stake} onChange={(v) => set({ stake: v })} pa={pa} stakes={STAKES} />
          {form.stake > 0 && (
            <Seg label="Répartition de la cagnotte" value={form.payout} onChange={(v) => set({ payout: v })}
              hint={form.payout === 'podium' ? '60 % au vainqueur, 30 % au deuxième, 10 % au troisième.' : 'Le vainqueur prend toute la cagnotte.'}
              options={[{ v: 'podium', label: 'Podium' }, { v: 'winner', label: 'Tout au vainqueur' }]} />
          )}
        </section>
        <Section title="Règles des parties">
          <ConfigEditor config={form.config} onChange={(c) => set({ config: c })} />
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </Section>
      </form>
    </Shell>
  );
}

function TournamentView({ session, t, pa, onExit, onBackToTable }: {
  session: OnlineSession; t: PublicTournament; pa: ProfileApi; onExit: () => void; onBackToTable: (() => void) | null;
}) {
  const me = t.players.find((p) => p.id === session.playerId);
  const isHost = t.hostId === session.playerId;
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const countdown = useCountdown(t.nextRoundAt);
  const total = totalRounds(t);
  const sched = t.sched;
  const nameOf = (id: string) => t.players.find((p) => p.id === id)?.name ?? '?';
  const link = `${publicUrl()}/?tournoi=${t.code}`;
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); }
    catch { window.prompt('Copiez :', text); }
  };
  const share = async () => { try { await navigator.share({ title: t.settings.title, text: `Inscris-toi au tournoi de 421 « ${t.settings.title} ». Code : ${t.code}`, url: link }); } catch { /* annulé */ } };
  const start = async () => { setErr(null); const a = await session.tStart(); if (!a.ok) setErr(a.error); };
  const gains = t.status === 'inscriptions' ? prizes(t.settings.stake * t.players.length, t.players.length, t.settings.payout) : t.prizes;

  // Ce que le joueur doit savoir tout de suite.
  let headline: string;
  if (session.removed) headline = `Vous avez été désinscrit : ${session.removed}`;
  else if (sched?.cancelled) headline = 'Tournoi annulé : tout le monde est remboursé.';
  else if (sched && t.status === 'inscriptions') headline = 'Salon ouvert : le tournoi part dans quelques minutes.';
  else if (t.status === 'inscriptions') headline = countdown != null ? `Complet ! Départ dans ${countdown} s.` : `Inscriptions ouvertes : ${t.players.length} joueur${t.players.length > 1 ? 's' : ''} sur ${t.settings.maxPlayers}.`;
  else if (t.status === 'termine') {
    const place = t.standings!.indexOf(session.playerId);
    headline = place === 0 ? 'Vous remportez le tournoi !' : `Victoire de ${nameOf(t.standings![0])}. Vous finissez ${PLACE(place)}.`;
  } else if (me?.out != null) headline = `Éliminé au ${roundName(me.out, total).toLowerCase()}. Suivez la suite du tournoi ici.`;
  else if (countdown != null) headline = `Qualifié ! ${roundName(t.rounds.length, total)} dans ${countdown} s.`;
  else if (onBackToTable) headline = `Votre partie est en cours (${roundName(t.rounds.length - 1, total).toLowerCase()}).`;
  else headline = 'Qualifié ! En attente des autres tables.';

  const leaveLabel = sched && t.status === 'inscriptions' ? null : t.status === 'inscriptions' ? 'Me désinscrire' : t.status === 'en-cours' && me?.out == null ? 'Abandonner le tournoi' : null;
  const leave = async () => {
    if (t.status === 'en-cours' && !(await askConfirm('Abandonner le tournoi ? Le serveur jouera vos parties à votre place.', 'Abandonner'))) return;
    session.tLeave();
    onExit();
  };

  return (
    <Shell title={t.settings.title} onBack={() => { if (t.status === 'inscriptions' && !sched) session.tLeave(); else session.detach(); onExit(); }} wide>
      <div className="t-head">
        <p className="t-headline">{headline}</p>
        {onBackToTable && <button className="btn primary" onClick={onBackToTable}><Icon name="dice" /> Revenir à ma table</button>}
        {t.status === 'inscriptions' && isHost && !sched && (
          <button className="btn primary" disabled={t.players.length < MIN_TOURNAMENT_PLAYERS} onClick={start}>
            {t.players.length < MIN_TOURNAMENT_PLAYERS ? `Il faut ${MIN_TOURNAMENT_PLAYERS} inscrits pour lancer` : `Lancer le tournoi (${t.players.length} joueurs)`}
          </button>
        )}
        {t.status === 'inscriptions' && isHost && !sched && t.settings.stake === 0 && t.players.length < t.settings.maxPlayers && (
          <button className="btn" onClick={async () => { setErr(null); const a = await session.tFillBots('normal'); if (!a.ok) setErr(a.error); }}>
            <Icon name="plus" /> Compléter avec des ordinateurs
          </button>
        )}
        {t.status === 'inscriptions' && !isHost && !sched && <p className="muted small">L'organisateur lance le tournoi ; il démarre aussi tout seul quand il est complet.</p>}
        {err && <p className="error">{err}</p>}
      </div>

      {sched && t.status === 'inscriptions' ? (
        <ScheduledLobby t={t} meId={session.playerId} />
      ) : sched?.cancelled ? (
        <ScheduledResults t={t} meId={session.playerId} />
      ) : t.status === 'inscriptions' ? (
        <div className="cols">
          <section>
            <div className="code-box">
              <small>{t.settings.visibility === 'public' ? 'Tournoi public. Code à partager :' : 'Code du tournoi'}</small>
              <div className="code">{t.code}</div>
              <div className="code-actions">
                <button className="btn small" onClick={() => copy(t.code, 'code')}><Icon name="copy" size={18} />{copied === 'code' ? 'Copié' : 'Copier le code'}</button>
                {typeof navigator.share === 'function'
                  ? <button className="btn small" onClick={share}><Icon name="share" size={18} />Inviter des amis</button>
                  : <button className="btn small" onClick={() => copy(link, 'lien')}><Icon name="share" size={18} />{copied === 'lien' ? 'Copié' : "Copier le lien d'invitation"}</button>}
              </div>
            </div>
            <h3>Inscrits ({t.players.length}/{t.settings.maxPlayers})</h3>
            <ol className="members">
              {t.players.map((p, i) => (
                <li key={p.id}>
                  <span className="ord">{i + 1}</span>
                  <Avatar photo={p.photo} emoji={p.avatar} size={36}><i className={`dot ${p.connected ? "on" : "off"}`} /></Avatar>
                  <b>{p.name}</b>
                  {p.id === t.hostId && <span className="tag">Organisateur</span>}
                  {p.bot && <span className="tag bot">Ordinateur</span>}
                  {p.id === session.playerId && <span className="tag">Vous</span>}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <TournamentRules t={t} gains={gains} pa={pa} />
          </section>
        </div>
      ) : (
        <>
          {t.status === 'termine' && sched && <ScheduledResults t={t} meId={session.playerId} />}
          {t.status === 'termine' && t.standings && !sched && (
            <section>
              <h3>Classement final</h3>
              <ol className="ranking t-standings">
                {t.standings.map((id, i) => (
                  <li key={id} className={id === session.playerId ? 'me' : ''}>
                    <span className="rk">{PLACE(i)}</span>
                    <span className="nm">{nameOf(id)}</span>
                    {t.prizes[i] ? <span className="sc coins-text">+{t.prizes[i]} pièces</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <h3>Tableau</h3>
          <div className="bracket">
            {Array.from({ length: total }, (_, ri) => {
              const rd = t.rounds[ri];
              return (
                <div className="b-round" key={ri}>
                  <h4>{roundName(ri, total)}</h4>
                  {rd ? rd.tables.map((tb, ti) => {
                    const order = tb.ranking ?? tb.ids;
                    const mine = tb.ids.includes(session.playerId);
                    return (
                      <div key={tb.code} className={`b-table${!tb.ranking ? ' live' : ''}${mine ? ' mine' : ''}`}>
                        <header><span>Table {ti + 1}</span><span>{tb.ranking ? 'Terminée' : 'En cours'}</span></header>
                        <ol>
                          {order.map((id, k) => (
                            <li key={id} className={tb.ranking ? (k < tb.qualified ? 'q' : 'x') : ''}>
                              <span>{nameOf(id)}{id === session.playerId ? ' (vous)' : ''}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  }) : <div className="b-table"><ol><li className="tbd">À venir</li></ol></div>}
                </div>
              );
            })}
          </div>
          {!sched && <TournamentRules t={t} gains={gains} pa={pa} compact />}
        </>
      )}

      <div className="row left t-actions">
        {leaveLabel && <button className="btn danger" onClick={leave}>{leaveLabel}</button>}
        {(t.status === 'termine' || sched?.cancelled) && <button className="btn" onClick={() => { session.detach(); onExit(); }}>Retour à l'accueil</button>}
      </div>
    </Shell>
  );
}

function TournamentRules({ t, gains, pa, compact }: { t: PublicTournament; gains: number[]; pa: ProfileApi; compact?: boolean }) {
  const s = t.settings;
  const pot = t.status === 'inscriptions' ? s.stake * t.players.length : t.pot;
  return (
    <div className={compact ? 't-rules compact' : 't-rules'}>
      {s.stake > 0 && (
        <div className="pot">
          <span>Cagnotte{t.status === 'inscriptions' ? ' (si le tournoi démarrait maintenant)' : ''}<br />
            <small className="muted">Entrée {s.stake} pièces par joueur{pa.isAccount ? `, vous avez ${pa.profile.coins.toLocaleString('fr-BE')} pièces` : ''}</small></span>
          <b>{pot} pièces</b>
        </div>
      )}
      {s.stake > 0 && gains.length > 0 && (
        <p className="muted">Gains : {gains.map((g, i) => `${PLACE(i)} ${g} pièces`).join(', ')}.</p>
      )}
      <h3>Format</h3>
      <ul className="muted">
        <li>Tables de {s.tableSize} joueurs ; la meilleure moitié de chaque table se qualifie.</li>
        <li>{s.stake ? `Droit d'entrée de ${s.stake} pièces, prélevé au départ du tournoi.` : 'Sans mise : on joue pour la gloire (et l’XP).'}</li>
      </ul>
      <h3>Règles des parties</h3>
      <ul className="muted">{describeConfig(s.config).map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}
