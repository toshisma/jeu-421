import { useCallback, useEffect, useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { enablePush, pushActive, pushSupported } from '../push';
import { sound } from '../audio/sound';
import { Icon } from './Icon';
import { Shell } from './Screens';
import type { DuelPlay } from './ChallengeScreen';

export interface DuelView {
  id: string; opponent: string; sent: boolean; stake: number; status: 'ouvert' | 'fini' | 'refuse' | 'expire'; createdAt: number; expiresAt: number;
  mine: { points: number; throws: number } | null; theirsPlayed: boolean; theirs: { points: number; throws: number } | null;
  winner: string | null; pot: number; seen: boolean;
}
interface Notifs { requests: { username: string; at: number }[]; toPlay: DuelView[]; results: DuelView[]; count: number }

/** Notifications dans le jeu : relues toutes les 30 s, au retour sur l'onglet, et à la demande. */
export function useNotifications(pa: ProfileApi) {
  const [n, setN] = useState<Notifs | null>(null);
  const load = useCallback(() => {
    if (!pa.token) { setN(null); return; }
    api<Notifs>('/notifications', { token: pa.token }).then(setN).catch(() => {});
  }, [pa.token]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
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
  const act = async (path: string, body: object, ok: string) => {
    try { await api(path, { body, token: pa.token }); setMsg(ok); sound.click(); reload(); } catch (e) { setMsg((e as Error).message); }
  };
  const empty = notifs && !notifs.requests.length && !notifs.toPlay.length && !notifs.results.length;
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
  const load = () => {
    if (!pa.token) return;
    api<{ duels: DuelView[]; stakes: number[] }>('/duels', { token: pa.token }).then((r) => { setDuels(r.duels); setStakes(r.stakes); }).catch((e) => setErr(e.message));
    api<{ friends: { username: string; me?: boolean }[] }>('/friends', { token: pa.token }).then((r) => setFriends(r.friends.filter((f) => !f.me).map((f) => f.username))).catch(() => {});
  };
  useEffect(load, [pa.token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pa.token) {
    return (
      <Shell title="Défis entre amis" onBack={onBack}>
        <div className="form"><p>Défiez vos amis à distance : mêmes dés pour vous deux, chacun joue quand il veut. Il faut un compte (gratuit).</p>
          <button className="btn primary" onClick={onAccount}>Créer un compte ou se connecter</button></div>
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
  return (
    <Shell title="Défis entre amis" onBack={onBack} wide>
      <div className="cols">
        <section className="form">
          <h3>Lancer un défi</h3>
          <p className="muted small">5 coups, 3 lancers par coup, les mêmes dés pour vous deux. Chacun joue quand il veut (72 heures). Le plus de points gagne, puis le moins de lancers.</p>
          {friends.length === 0 ? <p className="empty">Ajoutez d'abord des amis (Classement, onglet Amis) : une fois votre demande acceptée, vous pourrez les défier.</p> : (
            <>
              <div className="field"><span>Ami</span>
                <div className="chips">{friends.map((f) => <button key={f} type="button" className={`chip${who === f ? ' on' : ''}`} onClick={() => setWho(f)}>{f}</button>)}</div>
              </div>
              <div className="field"><span>Mise (le gagnant prend tout)</span>
                <div className="seg">{stakes.map((x) => <button key={x} type="button" className={stake === x ? 'on' : ''} onClick={() => setStake(x)}>{x ? `${x} pièces` : 'Aucune'}</button>)}</div>
              </div>
              <button className="btn primary big" disabled={!who || pa.profile.coins < stake} onClick={() => void create()}>Défier {who || '…'}</button>
            </>
          )}
          {err && <p className="error">{err}</p>}
        </section>
        <section>
          <h3>En cours</h3>
          {duels && !open.length && <p className="empty">Aucun défi en cours.</p>}
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
          <h3>Terminés</h3>
          {duels && !done.length && <p className="empty">Pas encore de résultat.</p>}
          <ul className="notif-list">
            {done.map((d) => (
              <li key={d.id} className={d.winner === pa.session?.username ? 'won' : ''}>
                <span className="n-ico" aria-hidden>{d.winner === pa.session?.username ? '🏆' : '🍺'}</span>
                <div className="n-main"><b>{resultText(d, pa.session?.username)}</b><small>{ago(d.createdAt)}</small></div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
