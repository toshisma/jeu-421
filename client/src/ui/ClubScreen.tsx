import { useEffect, useState } from 'react';
import { askConfirm } from './confirm';
import { PHRASES } from '../../../shared/protocol';
import { CLUB_CHEST } from '../../../shared/progress/profile';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { Icon } from './Icon';
import { ProfileView } from './ProfileView';
import { Shell } from './Screens';

interface Club {
  id: string; name: string; emblem: string; max: number; wins: number; endsAt: string;
  chest: { wins: number; coins: number }[];
  members: { username: string; wins: number; level: number; owner: boolean; me: boolean }[];
  chat: { username: string; phrase: string; at: number }[];
}
interface ClubRow { id: string; name: string; emblem: string; members: number; wins: number }

/** Clubs : une équipe de bistrot, un coffre commun chaque semaine, une discussion en phrases rapides. */
export function ClubScreen({ pa, onBack, onAccount }: { pa: ProfileApi; onBack: () => void; onAccount: () => void }) {
  const [mine, setMine] = useState<Club | null>(null);
  const [top, setTop] = useState<ClubRow[] | null>(null);
  const [emblems, setEmblems] = useState<string[]>([]);
  const [cost, setCost] = useState(100);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [emblem, setEmblem] = useState('🍺');
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const token = pa.token;

  const load = (query = q) => {
    if (!token) return;
    api<{ mine: Club | null; top: ClubRow[]; cost: number; emblems: string[] }>(`/clubs?q=${encodeURIComponent(query)}`, { token })
      .then((r) => { setMine(r.mine); setTop(r.top); setCost(r.cost); setEmblems(r.emblems); })
      .catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  // La discussion se rafraîchit toute seule.
  useEffect(() => { if (!mine) return; const t = setInterval(() => load(), 6000); return () => clearInterval(t); }, [mine?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); load(); } catch (e) { setErr((e as Error).message); } };

  if (!token) {
    return (
      <Shell title="Clubs" onBack={onBack}>
        <div className="form">
          <p>Un club, c'est votre équipe de bistrot : jusqu'à 30 joueurs, un coffre commun qui se remplit avec les victoires de tous, et un classement des clubs chaque semaine. Il faut un compte (gratuit).</p>
          <button className="btn primary" onClick={onAccount}>Créer un compte ou se connecter</button>
        </div>
      </Shell>
    );
  }

  if (mine) {
    const reached = [...mine.chest].reverse().find((t) => mine.wins >= t.wins);
    const next = mine.chest.find((t) => mine.wins < t.wins);
    const maxWins = mine.chest[mine.chest.length - 1].wins;
    return (
      <Shell title={`${mine.emblem} ${mine.name}`} onBack={onBack} wide>
        <div className="cols">
          <section>
            <div className="chest">
              <div className="chest-head"><b>Coffre de la semaine</b><span>{mine.wins} victoire{mine.wins > 1 ? 's' : ''}</span></div>
              <div className="chest-bar">
                <i style={{ width: `${Math.min(100, (100 * mine.wins) / maxWins)}%` }} />
                {mine.chest.map((t) => <span key={t.wins} className={mine.wins >= t.wins ? 'on' : ''} style={{ left: `${(100 * t.wins) / maxWins}%` }}>{t.coins}</span>)}
              </div>
              <p className="muted small">
                {next ? `Encore ${next.wins - mine.wins} victoire${next.wins - mine.wins > 1 ? 's' : ''} du club pour ${next.coins} pièces chacun. ` : 'Coffre plein ! '}
                {reached ? `Déjà acquis : ${reached.coins} pièces pour chaque membre qui a gagné au moins une partie cette semaine.` : ''}
                {' '}Ouverture dimanche soir.
              </p>
            </div>
            <h3>Membres ({mine.members.length}/{mine.max})</h3>
            <ol className="board">
              {mine.members.map((m, i) => (
                <li key={m.username} className={`${m.me ? 'me ' : ''}clickable`} onClick={() => setOpen(m.username)}>
                  <span className="b-rank">{i + 1}</span>
                  <span className="b-name">{m.username}<small>niveau {m.level}{m.owner ? ', fondateur' : ''}</small></span>
                  <span className="b-wins"><b>{m.wins}</b> <small>vict.</small></span>
                </li>
              ))}
            </ol>
            <div className="row left">
              <button className="btn ghost danger" onClick={async () => { if (await askConfirm('Quitter le club ?', 'Quitter')) void run(() => api('/clubs/leave', { body: {}, token })); }}>Quitter le club</button>
            </div>
          </section>
          <section>
            <h3>Au comptoir du club</h3>
            <ul className="club-chat" aria-live="polite">
              {mine.chat.length === 0 && <li className="muted">Personne n'a encore parlé cette semaine.</li>}
              {mine.chat.map((c, i) => <li key={i}><b>{c.username}</b> {c.phrase}</li>)}
            </ul>
            <div className="phrase-chips">
              {PHRASES.map((p) => <button key={p} className="btn small" onClick={() => void run(() => api('/clubs/chat', { body: { phrase: p }, token }))}>{p}</button>)}
            </div>
            {err && <p className="error">{err}</p>}
          </section>
        </div>
        {open && <ProfileView pa={pa} username={open} onClose={() => setOpen(null)} />}
      </Shell>
    );
  }

  return (
    <Shell title="Clubs" onBack={onBack} wide>
      <div className="cols">
        <section>
          <p className="muted">Rejoignez une équipe : chaque victoire d'un membre remplit le coffre commun ({CLUB_CHEST.map((t) => `${t.wins} victoires : ${t.coins} pièces`).join(', ')} pour chacun), et les clubs sont classés chaque semaine.</p>
          <form className="friend-add" onSubmit={(e) => { e.preventDefault(); load(q); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un club" maxLength={24} />
            <button className="btn small">Chercher</button>
          </form>
          <h3>Clubs de la semaine</h3>
          {top && top.length === 0 && <p className="empty">Aucun club pour l'instant. Fondez le premier !</p>}
          <ul className="list">
            {top?.map((c, i) => (
              <li key={c.id}>
                <span className="club-emblem">{c.emblem}</span>
                <div className="l-main"><b>{i + 1}. {c.name}</b><small>{c.members} membre{c.members > 1 ? 's' : ''}, {c.wins} victoire{c.wins > 1 ? 's' : ''} cette semaine</small></div>
                <button className="btn small" disabled={c.members >= 30} onClick={() => void run(() => api('/clubs/join', { body: { id: c.id }, token }))}>{c.members >= 30 ? 'Complet' : 'Rejoindre'}</button>
              </li>
            ))}
          </ul>
        </section>
        <section className="form">
          <h3>Fonder un club</h3>
          <label className="field"><span>Nom du club</span>
            <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Le Pot au Lait" /></label>
          <div className="field"><span>Emblème</span>
            <div className="avatars">{emblems.map((e) => <button type="button" key={e} className={e === emblem ? 'on' : ''} onClick={() => setEmblem(e)}>{e}</button>)}</div>
          </div>
          {err && <p className="error">{err}</p>}
          <button className="btn primary" disabled={name.trim().length < 3 || pa.profile.coins < cost} onClick={() => void run(async () => { await api('/clubs', { body: { name, emblem }, token }); })}>
            <Icon name="plus" size={18} /> Fonder pour {cost} pièces
          </button>
          {pa.profile.coins < cost && <p className="muted small">Il vous faut {cost} pièces.</p>}
        </section>
      </div>
    </Shell>
  );
}
