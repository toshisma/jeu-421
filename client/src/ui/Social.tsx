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
    <button className="bell" onClick={onOpen} aria-label={count ? `${count} notification${count > 1 ? 's' : ''}` : 'Notifications'}>
      <Icon name="bell" size={22} />
      {count > 0 && <i className="bell-badge">{count > 9 ? '9+' : count}</i>}
    </button>
  );
}

const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const resultText = (d: DuelView, me?: string) =>
  d.status === 'refuse' ? `${d.opponent} a refusé votre défi.${d.stake ? ' Mise rendue.' : ''}`
    : d.status === 'expire' ? `Défi avec ${d.opponent} expiré.${d.stake ? ' Mises rendues.' : ''}`
      : !d.winner ? `Égalité avec ${d.opponent} : ${d.mine?.points} à ${d.theirs?.points}.`
        : d.winner === me ? `Vous avez battu ${d.opponent} : ${d.mine?.points} à ${d.theirs?.points}${d.pot ? `, +${d.pot} pièces` : ''} !`
          : `${d.opponent} vous a battu : ${d.theirs?.points} à ${d.mine?.points}.`;

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
      <div className="sheet notif-sheet" role="dialog" aria-label="Notifications" onClick={(e) => e.stopPropagation()}>
        <div className="notif-head"><h2>Notifications</h2><button className="icon-btn small" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button></div>
        <div className={`push-box${push ? ' on' : ''}`}>
          {push ? <span>✓ Notifications activées sur cet appareil.</span>
            : !pushSupported() ? <span>{/iPhone|iPad/.test(navigator.userAgent)
              ? 'Pour recevoir les notifications sur iPhone : dans Safari, touchez Partager puis « Sur l’écran d’accueil », et ouvrez le jeu depuis cette icône.'
              : 'Ce navigateur ne gère pas les notifications. Essayez avec Chrome.'}</span>
              : <button className="btn primary" onClick={async () => { const e = await enablePush(pa.token!); setMsg(e ?? 'Notifications activées sur cet appareil.'); setPush(!e); }}>
                <Icon name="bell" size={18} /> Activer les notifications sur ce téléphone</button>}
        </div>
        {!notifs && <p className="muted">Chargement…</p>}
        {empty && <p className="empty">Rien de neuf pour l'instant. Défiez un ami pour animer la soirée !</p>}
        {shownNotices.length > 0 && (
          <section>
            <h3>Modération</h3>
            <ul className="notif-list">
              {shownNotices.map((x) => (
                <li key={x.id} className="mod-notice">
                  <span className="n-ico" aria-hidden>{x.kind === 'merci' ? '🙏' : x.kind === 'role' ? '🛡️' : '⚠️'}</span>
                  <div className="n-main"><b>{x.text}</b><small>{ago(x.at)}</small></div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!notifs?.requests.length && (
          <section>
            <h3>Demandes d'amis</h3>
            <ul className="notif-list">
              {notifs.requests.map((r) => (
                <li key={r.username}>
                  <span className="n-ico" aria-hidden>👋</span>
                  <div className="n-main"><b>{r.username}</b><small>veut être votre ami, {ago(r.at)}</small></div>
                  <div className="n-actions">
                    <button className="btn small primary" onClick={() => void act('/friends/accept', { username: r.username }, `${r.username} est maintenant votre ami.`)}>Accepter</button>
                    <button className="btn small ghost" onClick={() => void act('/friends/decline', { username: r.username }, 'Demande refusée.')}>Refuser</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!notifs?.toPlay.length && (
          <section>
            <h3>Défis à jouer</h3>
            <ul className="notif-list">
              {notifs.toPlay.map((d) => (
                <li key={d.id}>
                  <span className="n-ico" aria-hidden>🎲</span>
                  <div className="n-main"><b>{d.sent ? `Votre défi à ${d.opponent}` : `${d.opponent} vous défie`}</b><small>{d.stake ? `Mise : ${d.stake} pièces. ` : ''}{d.theirsPlayed ? `${d.opponent} a déjà joué.` : 'Mêmes dés pour vous deux.'}</small></div>
                  <div className="n-actions">
                    <button className="btn small primary" onClick={() => onPlay({ id: d.id, opponent: d.opponent, stake: d.stake })}>Jouer</button>
                    {!d.sent && <button className="btn small ghost" onClick={() => void act(`/duels/${d.id}/decline`, {}, 'Défi refusé.')}>Refuser</button>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!notifs?.results.length && (
          <section>
            <h3>Résultats</h3>
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
          <button className="btn secondary" onClick={onDuels}><Icon name="dice" size={18} /> Défier un ami</button>
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
      <Shell title="Défis entre amis" onBack={onBack} icon="target" foot={<BigAction icon="key" tone="gold" label="Créer un compte ou se connecter" sub="Gratuit, sans adresse e-mail" onClick={onAccount} />}>
        <Empty icon="target">Défiez vos amis à distance : mêmes dés pour vous deux, chacun joue quand il veut.</Empty>
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
    <Shell title="Défis entre amis" onBack={onBack} icon="target" wide sub={toPlay ? `${toPlay} défi${toPlay > 1 ? 's' : ''} à jouer` : '5 coups, mêmes dés pour vous deux'}
      foot={friends.length > 0 && tab === 'nouveau' ? <BigAction icon="dice" disabled={!who || pa.profile.coins < stake} onClick={() => void create()}
        label={who ? `Défier ${who}` : 'Choisissez un ami'} sub={pa.profile.coins < stake ? 'Pas assez de pièces pour cette mise' : stake ? `Mise : ${stake} pièces, le gagnant prend tout` : 'Sans mise'} /> : undefined}>
      <Tabs label="Défis" value={tab} onChange={setTab}
        options={[{ v: 'nouveau', label: 'Nouveau', icon: 'plus' }, { v: 'encours', label: 'En cours', badge: toPlay || undefined }, { v: 'finis', label: 'Terminés' }]} />
      {tab === 'nouveau' && (
        <div className="k-form">
          <p className="k-hint">5 coups, 3 lancers par coup, les mêmes dés pour vous deux. Chacun joue quand il veut (72 heures). Le plus de points gagne, puis le moins de lancers.</p>
          {friends.length === 0 ? <Empty icon="people">Ajoutez d'abord des amis (écran Amis) : une fois votre demande acceptée, vous pourrez les défier.</Empty> : (
            <>
              <div className="k-field"><span className="k-label">Ami</span>
                <div className="k-pills">{friends.map((f) => <button key={f} type="button" className={who === f ? 'on' : ''} onClick={() => setWho(f)}>{f}</button>)}</div>
              </div>
              <div className="k-field"><span className="k-label">Mise <small>le gagnant prend tout</small></span>
                <div className="k-pills coins">{stakes.map((x) => <button key={x} type="button" className={stake === x ? 'on' : ''} disabled={x > pa.profile.coins} onClick={() => setStake(x)}>{x ? x : 'Aucune'}</button>)}</div>
              </div>
            </>
          )}
        </div>
      )}
      {tab === 'encours' && <>
        {duels && !open.length && <Empty icon="target" action={<button className="btn small" onClick={() => setTab('nouveau')}>Lancer un défi</button>}>Aucun défi en cours.</Empty>}
        <ul className="notif-list">
          {open.map((d) => (
            <li key={d.id}>
              <span className="n-ico" aria-hidden>🎲</span>
              <div className="n-main"><b>{d.sent ? `Contre ${d.opponent}` : `${d.opponent} vous défie`}</b>
                <small>{d.mine ? `Vous : ${d.mine.points} pts. ${d.theirsPlayed ? '' : `En attente de ${d.opponent}.`}` : d.theirsPlayed ? `${d.opponent} a joué, à vous !` : 'À vous de jouer.'}{d.stake ? ` Mise : ${d.stake}.` : ''}</small></div>
              {!d.mine && <div className="n-actions"><button className="btn small primary" onClick={() => onPlay({ id: d.id, opponent: d.opponent, stake: d.stake })}>Jouer</button></div>}
            </li>
          ))}
        </ul>
      </>}
      {tab === 'finis' && <>
        {duels && !done.length && <Empty icon="trophy">Pas encore de résultat.</Empty>}
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
