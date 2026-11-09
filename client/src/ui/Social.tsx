import { trServer, tr } from '../i18n/lang';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { enablePush, pushActive, pushSupported } from '../push';
import { sound } from '../audio/sound';
import { Icon } from './Icon';
import { BigAction, Empty, Shell, Tabs } from './kit';
import type { DuelPlay } from './ChallengeScreen';

export interface DuelView {
  id: string; opponent: string; sent: boolean; stake: number; status: 'ouvert' | 'fini' | 'refuse' | 'expire'; createdAt: number; expiresAt: number;
  mine: { points: number; throws: number } | null; theirsPlayed: boolean; theirs: { points: number; throws: number } | null;
  winner: string | null; pot: number; seen: boolean;
}
export interface Notifs { requests: { username: string; at: number }[]; toPlay: DuelView[]; results: DuelView[]; notices?: { id: number; kind: string; text: string; at: number }[]; count: number }

/** Notifications dans le jeu : relues toutes les 30 s, au retour sur l'onglet, et à la demande. */
export function useNotifications(pa: ProfileApi) {
  const [n, setN] = useState<Notifs | null>(null);
  const load = useCallback(() => {
    if (!pa.token) { setN(null); return; }
    api<Notifs>('/notifications', { token: pa.token }).then(setN).catch(() => {});
  }, [pa.token]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);
    const vis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [load]);
  return { notifs: n, reload: load };
}

/** Cloche de l'accueil, avec le compteur rouge. */
export function NotifBell({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button className="bell" onClick={onOpen} aria-label={count ? tr(count > 1 ? 'app.notification.p' : 'app.notification', { count }) : tr('app.notifications')}>
      <Icon name="bell" size={22} />
      {count > 0 && <i className="bell-badge">{count > 9 ? '9+' : count}</i>}
    </button>
  );
}

const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? tr('app.il_y_a_min', { v: Math.max(1, m) }) : m < 1440 ? tr('app.il_y_a_h', { v: Math.round(m / 60) }) : tr('app.il_y_a_j', { v: Math.round(m / 1440) }); };
const resultText = (d: DuelView, me?: string) =>
  d.status === 'refuse' ? tr('app.a_refuse_votre_defi', { opponent: d.opponent, v: d.stake ? tr('app.mise_rendue') : '' })
    : d.status === 'expire' ? tr('app.defi_avec_expire', { opponent: d.opponent, v: d.stake ? tr('app.mises_rendues') : '' })
      : !d.winner ? tr('app.egalite_avec_a', { opponent: d.opponent, points: d.mine?.points, points2: d.theirs?.points })
        : d.winner === me ? tr('app.vous_avez_battu_a', { opponent: d.opponent, points: d.mine?.points, points2: d.theirs?.points, v: d.pot ? tr('app.pieces_3', { pot: d.pot }) : '' })
          : tr('app.vous_a_battu_a', { opponent: d.opponent, points: d.theirs?.points, points2: d.mine?.points });

/** Panneau des notifications : demandes d'amis à accepter, défis à jouer, résultats. */
export function NotifPanel({ pa, notifs, reload, onClose, onPlay, onDuels }: {
  pa: ProfileApi; notifs: Notifs | null; reload: () => void; onClose: () => void; onPlay: (d: DuelPlay) => void; onDuels: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [push, setPush] = useState<boolean | null>(null);
  useEffect(() => { void pushActive().then(setPush); }, []);
  // Les résultats affichés sont considérés comme vus.
  useEffect(() => {
    for (const d of notifs?.results ?? []) void api(`/duels/${d.id}/seen`, { body: {}, token: pa.token }).catch(() => {});
  }, [notifs?.results.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Avis de la modération : lus une fois affichés (ils restent visibles jusqu'à la fermeture du panneau).
  const [shownNotices, setShownNotices] = useState<NonNullable<Notifs['notices']>>([]);
  useEffect(() => {
    const fresh = notifs?.notices ?? [];
    if (!fresh.length) return;
    setShownNotices((l) => [...fresh.filter((x) => !l.some((y) => y.id === x.id)), ...l]);
    void api('/notifications/seen', { body: { notices: fresh.map((x) => x.id) }, token: pa.token }).then(reload).catch(() => {});
  }, [notifs?.notices?.map((x) => x.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (path: string, body: object, ok: string) => {
    try { await api(path, { body, token: pa.token }); setMsg(ok); sound.click(); reload(); } catch (e) { setMsg((e as Error).message); }
  };
  const empty = notifs && !notifs.requests.length && !notifs.toPlay.length && !notifs.results.length && !shownNotices.length;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet notif-sheet" role="dialog" aria-label={tr('app.notifications')} onClick={(e) => e.stopPropagation()}>
        <div className="notif-head"><h2>{tr('app.notifications')}</h2><button className="icon-btn small" onClick={onClose} aria-label={tr('app.fermer')}><Icon name="close" size={18} /></button></div>
        <div className={`push-box${push ? ' on' : ''}`}>
          {push ? <span>{tr('app.notifications_activees_sur_cet_appar')}</span>
            : !pushSupported() ? <span>{/iPhone|iPad/.test(navigator.userAgent)
              ? tr('app.pour_recevoir_les_notifications_sur_')
              : tr('app.ce_navigateur_ne_gere_pas_les_notifi')}</span>
              : <button className="btn primary" onClick={async () => { const e = await enablePush(pa.token!); setMsg(e ?? tr('app.notifications_activees_sur_cet_appar_2')); setPush(!e); }}>
                <Icon name="bell" size={18} /> {tr('app.activer_les_notifications_sur_ce_tel')}</button>}
        </div>
        {!notifs && <p className="muted">{tr('app.chargement')}</p>}
        {empty && <p className="empty">{tr('app.rien_de_neuf_pour_l_instant_defiez')}</p>}
        {shownNotices.length > 0 && (
          <section>
            <h3>Modération</h3>
            <ul className="notif-list">
              {shownNotices.map((x) => (
                <li key={x.id} className="mod-notice">
                  <span className="n-ico" aria-hidden>{x.kind === 'merci' ? '🙏' : x.kind === 'role' ? '🛡️' : '⚠️'}</span>
                  <div className="n-main"><b>{trServer(x.text)}</b><small>{ago(x.at)}</small></div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!notifs?.requests.length && (
          <section>
            <h3>{tr('app.demandes_d_amis')}</h3>
            <ul className="notif-list">
              {notifs.requests.map((r) => (
                <li key={r.username}>
                  <span className="n-ico" aria-hidden>👋</span>
                  <div className="n-main"><b>{r.username}</b><small>{tr('app.veut_etre_votre_ami_2')} {ago(r.at)}</small></div>
                  <div className="n-actions">
                    <button className="btn small primary" onClick={() => void act('/friends/accept', { username: r.username }, tr('app.est_maintenant_votre_ami', { username: r.username }))}>{tr('app.accepter')}</button>
                    <button className="btn small ghost" onClick={() => void act('/friends/decline', { username: r.username }, tr('app.demande_refusee'))}>{tr('app.refuser')}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!notifs?.toPlay.length && (
          <section>
            <h3>{tr('app.defis_a_jouer')}</h3>
            <ul className="notif-list">
              {notifs.toPlay.map((d) => (
                <li key={d.id}>
                  <span className="n-ico" aria-hidden>🎲</span>
                  <div className="n-main"><b>{d.sent ? tr('app.votre_defi_a', { opponent: d.opponent }) : tr('app.vous_defie', { opponent: d.opponent })}</b><small>{d.stake ? tr('app.mise_pieces_2', { stake: d.stake }) : ''}{d.theirsPlayed ? tr('app.a_deja_joue', { opponent: d.opponent }) : tr('app.memes_des_pour_vous_deux')}</small></div>
                  <div className="n-actions">
                    <button className="btn small primary" onClick={() => onPlay({ id: d.id, opponent: d.opponent, stake: d.stake })}>{tr('app.jouer')}</button>
                    {!d.sent && <button className="btn small ghost" onClick={() => void act(`/duels/${d.id}/decline`, {}, tr('app.defi_refuse'))}>{tr('app.refuser')}</button>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!notifs?.results.length && (
          <section>
            <h3>{tr('app.resultats')}</h3>
            <ul className="notif-list">
              {notifs.results.map((d) => (
                <li key={d.id} className={d.winner === pa.session?.username ? 'won' : ''}>
                  <span className="n-ico" aria-hidden>{d.winner === pa.session?.username ? '🏆' : d.status === 'fini' ? '🍺' : '✉️'}</span>
                  <div className="n-main"><b>{resultText(d, pa.session?.username)}</b></div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {msg && <p className="ok small">{msg}</p>}
        <div className="row">
          <button className="btn secondary" onClick={onDuels}><Icon name="dice" size={18} /> {tr('app.defier_un_ami')}</button>
        </div>
      </div>
    </div>
  );
}

/** Défis entre amis : en cours, terminés, et lancer un nouveau défi. */
export function DuelsScreen({ pa, onBack, onPlay, onAccount }: { pa: ProfileApi; onBack: () => void; onPlay: (d: DuelPlay) => void; onAccount: () => void }) {
  const [duels, setDuels] = useState<DuelView[] | null>(null);
  const [friends, setFriends] = useState<string[]>([]);
  const [who, setWho] = useState('');
  const [stake, setStake] = useState(0);
  const [stakes, setStakes] = useState<number[]>([0, 10, 25, 50]);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'nouveau' | 'encours' | 'finis'>('nouveau');
  const load = () => {
    if (!pa.token) return;
    api<{ duels: DuelView[]; stakes: number[] }>('/duels', { token: pa.token }).then((r) => { setDuels(r.duels); setStakes(r.stakes); if (r.duels.some((d) => d.status === 'ouvert' && !d.mine)) setTab((t) => (t === 'nouveau' ? 'encours' : t)); }).catch((e) => setErr(e.message));
    api<{ friends: { username: string; me?: boolean }[] }>('/friends', { token: pa.token }).then((r) => setFriends(r.friends.filter((f) => !f.me).map((f) => f.username))).catch(() => {});
  };
  useEffect(load, [pa.token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pa.token) {
    return (
      <Shell title={tr('app.defis_entre_amis')} onBack={onBack} icon="target" foot={<BigAction icon="key" tone="gold" label={tr('app.creer_un_compte_ou_se_connecter')} sub={tr('app.gratuit_sans_adresse_e_mail')} onClick={onAccount} />}>
        <Empty icon="target">{tr('app.defiez_vos_amis_a_distance_memes_des')}</Empty>
      </Shell>
    );
  }
  const create = async () => {
    setErr(null);
    try {
      const r = await api<{ duel: DuelView }>('/duels', { body: { username: who, stake }, token: pa.token });
      pa.refresh();
      onPlay({ id: r.duel.id, opponent: r.duel.opponent, stake: r.duel.stake });
    } catch (e) { setErr((e as Error).message); }
  };
  const open = duels?.filter((d) => d.status === 'ouvert') ?? [];
  const done = duels?.filter((d) => d.status !== 'ouvert') ?? [];
  const toPlay = open.filter((d) => !d.mine).length;
  return (
    <Shell title={tr('app.defis_entre_amis')} onBack={onBack} icon="target" wide sub={toPlay ? tr(toPlay > 1 ? 'app.defi_a_jouer.p' : 'app.defi_a_jouer', { toPlay }) : tr('app.5_coups_memes_des_pour_vous_deux')}
      foot={friends.length > 0 && tab === 'nouveau' ? <BigAction icon="dice" disabled={!who || pa.profile.coins < stake} onClick={() => void create()}
        label={who ? tr('app.defier_2', { who }) : tr('app.choisissez_un_ami')} sub={pa.profile.coins < stake ? tr('app.pas_assez_de_pieces_pour_cette_mise') : stake ? tr('app.mise_pieces_le_gagnant_prend_tout', { stake }) : tr('app.sans_mise')} /> : undefined}>
      <Tabs label={tr('app.defis')} value={tab} onChange={setTab}
        options={[{ v: 'nouveau', label: tr('app.nouveau'), icon: 'plus' }, { v: 'encours', label: tr('app.en_cours'), badge: toPlay || undefined }, { v: 'finis', label: tr('app.termines') }]} />
      {tab === 'nouveau' && (
        <div className="k-form">
          <p className="k-hint">{tr('app.5_coups_3_lancers_par_coup_les')}</p>
          {friends.length === 0 ? <Empty icon="people">{tr('app.ajoutez_d_abord_des_amis_ecran_amis')}</Empty> : (
            <>
              <div className="k-field"><span className="k-label">{tr('app.ami')}</span>
                <div className="k-pills">{friends.map((f) => <button key={f} type="button" className={who === f ? 'on' : ''} onClick={() => setWho(f)}>{f}</button>)}</div>
              </div>
              <div className="k-field"><span className="k-label">{tr('app.mise')} <small>{tr('app.le_gagnant_prend_tout')}</small></span>
                <div className="k-pills coins">{stakes.map((x) => <button key={x} type="button" className={stake === x ? 'on' : ''} disabled={x > pa.profile.coins} onClick={() => setStake(x)}>{x ? x : tr('app.aucune')}</button>)}</div>
              </div>
            </>
          )}
        </div>
      )}
      {tab === 'encours' && <>
        {duels && !open.length && <Empty icon="target" action={<button className="btn small" onClick={() => setTab('nouveau')}>{tr('app.lancer_un_defi')}</button>}>{tr('app.aucun_defi_en_cours')}</Empty>}
        <ul className="notif-list">
          {open.map((d) => (
            <li key={d.id}>
              <span className="n-ico" aria-hidden>🎲</span>
              <div className="n-main"><b>{d.sent ? tr('app.contre', { opponent: d.opponent }) : tr('app.vous_defie', { opponent: d.opponent })}</b>
                <small>{d.mine ? tr('app.vous_pts', { points: d.mine.points, v: d.theirsPlayed ? '' : tr('app.en_attente_de', { opponent: d.opponent }) }) : d.theirsPlayed ? tr('app.a_joue_a_vous', { opponent: d.opponent }) : tr('app.a_vous_de_jouer')}{d.stake ? tr('app.mise_2', { stake: d.stake }) : ''}</small></div>
              {!d.mine && <div className="n-actions"><button className="btn small primary" onClick={() => onPlay({ id: d.id, opponent: d.opponent, stake: d.stake })}>{tr('app.jouer')}</button></div>}
            </li>
          ))}
        </ul>
      </>}
      {tab === 'finis' && <>
        {duels && !done.length && <Empty icon="trophy">{tr('app.pas_encore_de_resultat')}</Empty>}
        <ul className="notif-list">
          {done.map((d) => (
            <li key={d.id} className={d.winner === pa.session?.username ? 'won' : ''}>
              <span className="n-ico" aria-hidden>{d.winner === pa.session?.username ? '🏆' : '🍺'}</span>
              <div className="n-main"><b>{resultText(d, pa.session?.username)}</b><small>{ago(d.createdAt)}</small></div>
            </li>
          ))}
        </ul>
      </>}
      {err && <p className="error">{err}</p>}
    </Shell>
  );
}
