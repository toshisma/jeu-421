import { useEffect, useState } from 'react';
import { askConfirm } from './confirm';
import { PHRASES } from '../../../shared/protocol';
import { CLUB_CHEST } from '../../../shared/progress/profile';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { Icon } from './Icon';
import { ProfileView } from './ProfileView';
import { BigAction, Empty, Section, Shell, Tabs, useToast } from './kit';

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
  const [clubTab, setClubTab] = useState<'coffre' | 'membres' | 'comptoir'>('coffre');
  const [joinTab, setJoinTab] = useState<'rejoindre' | 'fonder'>('rejoindre');
  const [toast, showToast] = useToast();

  const load = (query = q) => {
    if (!token) return;
    api<{ mine: Club | null; top: ClubRow[]; cost: number; emblems: string[] }>(`/clubs?q=${encodeURIComponent(query)}`, { token })
      .then((r) => { setMine(r.mine); setTop(r.top); setCost(r.cost); setEmblems(r.emblems); })
      .catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  // La discussion se rafraîchit toute seule.
  useEffect(() => { if (!mine) return; const t = setInterval(() => load(), 6000); return () => clearInterval(t); }, [mine?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok?: string) => { setErr(null); try { await fn(); load(); if (ok) showToast(ok); } catch (e) { setErr((e as Error).message); } };

  if (!token) {
    return (
      <Shell title="Clubs" onBack={onBack} icon="club" foot={<BigAction icon="key" tone="gold" label="Créer un compte ou se connecter" sub="Gratuit, sans adresse e-mail" onClick={onAccount} />}>
        <Empty icon="club">Un club, c'est votre équipe de bistrot : jusqu'à 30 joueurs, un coffre commun qui se remplit avec les victoires de tous, et un classement chaque semaine.</Empty>
      </Shell>
    );
  }

  if (mine) {
    const reached = [...mine.chest].reverse().find((t) => mine.wins >= t.wins);
    const next = mine.chest.find((t) => mine.wins < t.wins);
    const maxWins = mine.chest[mine.chest.length - 1].wins;
    return (
      <Shell title={`${mine.emblem} ${mine.name}`} onBack={onBack} wide sub={`${mine.members.length}/${mine.max} membres · ${mine.wins} victoire${mine.wins > 1 ? 's' : ''} cette semaine`}>
        <Tabs label="Club" value={clubTab} onChange={setClubTab}
          options={[{ v: 'coffre', label: 'Coffre', icon: 'chest' }, { v: 'membres', label: 'Membres', icon: 'people', badge: mine.members.length }, { v: 'comptoir', label: 'Comptoir', icon: 'chat' }]} />
        {clubTab === 'coffre' && (
          <div className="chest">
            <div className="chest-head"><b>Coffre de la semaine</b><span>{mine.wins} victoire{mine.wins > 1 ? 's' : ''}</span></div>
            <div className="chest-bar">
              <i style={{ width: `${Math.min(100, (100 * mine.wins) / maxWins)}%` }} />
              {mine.chest.map((t) => <span key={t.wins} className={mine.wins >= t.wins ? 'on' : ''} style={{ left: `${(100 * t.wins) / maxWins}%` }}>{t.coins}</span>)}
            </div>
            <p className="k-hint">
              {next ? `Encore ${next.wins - mine.wins} victoire${next.wins - mine.wins > 1 ? 's' : ''} du club pour ${next.coins} pièces chacun. ` : 'Coffre plein ! '}
              {reached ? `Déjà acquis : ${reached.coins} pièces pour chaque membre qui a gagné au moins une partie cette semaine.` : ''}
              {' '}Ouverture dimanche soir.
            </p>
          </div>
        )}
        {clubTab === 'membres' && <>
          <ol className="board">
            {mine.members.map((m, i) => (
              <li key={m.username} className={`${m.me ? 'me ' : ''}clickable`} onClick={() => setOpen(m.username)}>
                <span className="b-rank">{i + 1}</span>
                <span className="b-name">{m.username}<small>niveau {m.level}{m.owner ? ', fondateur' : ''}</small></span>
                <span className="b-wins"><b>{m.wins}</b> <small>vict.</small></span>
              </li>
            ))}
          </ol>
          <div className="club-leave">
            <button className="btn ghost danger" onClick={async () => { if (await askConfirm('Quitter le club ?', 'Quitter')) void run(() => api('/clubs/leave', { body: {}, token }), 'Vous avez quitté le club.'); }}>Quitter le club</button>
          </div>
        </>}
        {clubTab === 'comptoir' && <>
          <ul className="club-chat" aria-live="polite">
            {mine.chat.length === 0 && <li className="muted">Personne n'a encore parlé cette semaine. Lancez la conversation !</li>}
            {mine.chat.map((c, i) => <li key={i}><b>{c.username}</b> {c.phrase}</li>)}
          </ul>
          <p className="k-hint">Touchez une phrase pour l'envoyer au club.</p>
          <div className="phrase-chips">
            {PHRASES.map((p) => <button key={p} className="chip" onClick={() => void run(() => api('/clubs/chat', { body: { phrase: p }, token }))}>{p}</button>)}
          </div>
        </>}
        {err && <p className="error">{err}</p>}
        {open && <ProfileView pa={pa} username={open} onClose={() => setOpen(null)} />}
        {toast}
      </Shell>
    );
  }

  const canFound = name.trim().length >= 3 && pa.profile.coins >= cost;
  return (
    <Shell title="Clubs" onBack={onBack} icon="club" wide sub="Une équipe, un coffre commun chaque semaine">
      <Tabs label="Clubs" value={joinTab} onChange={setJoinTab}
        options={[{ v: 'rejoindre', label: 'Rejoindre', icon: 'people' }, { v: 'fonder', label: 'Fonder', icon: 'plus' }]} />
      {joinTab === 'rejoindre' ? <>
        <p className="k-hint club-help">Chaque victoire d'un membre remplit le coffre commun ({CLUB_CHEST.map((t) => `${t.wins} victoires : ${t.coins} pièces`).join(', ')} pour chacun).</p>
        <form className="hub-code friend-search" onSubmit={(e) => { e.preventDefault(); load(q); }}>
          <Icon name="search" size={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un club" maxLength={24} aria-label="Chercher un club" />
          <button className="btn small">Chercher</button>
        </form>
        <Section title="Clubs de la semaine" count={top?.length}>
          {top && top.length === 0 && <Empty icon="club" action={<button className="btn small" onClick={() => setJoinTab('fonder')}>Fonder un club</button>}>Aucun club pour l'instant. Fondez le premier !</Empty>}
          <ul className="hub-list">
            {top?.map((c, i) => (
              <li key={c.id}>
                <span className="club-emblem">{c.emblem}</span>
                <div className="l-main"><b>{i + 1}. {c.name}</b><small>{c.members} membre{c.members > 1 ? 's' : ''} · {c.wins} victoire{c.wins > 1 ? 's' : ''} cette semaine</small></div>
                <button className="btn small primary" disabled={c.members >= 30} onClick={() => void run(() => api('/clubs/join', { body: { id: c.id }, token }), `Bienvenue au club ${c.name} !`)}>{c.members >= 30 ? 'Complet' : 'Rejoindre'}</button>
              </li>
            ))}
          </ul>
        </Section>
      </> : (
        <div className="k-form">
          <label className="k-field"><span className="k-label">Nom du club</span>
            <input className="k-input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Le Pot au Lait" /></label>
          <div className="k-field"><span className="k-label">Emblème</span>
            <div className="avatars">{emblems.map((e) => <button type="button" key={e} className={e === emblem ? 'on' : ''} onClick={() => setEmblem(e)} aria-label={`Emblème ${e}`}>{e}</button>)}</div>
          </div>
          <BigAction icon="plus" tone="gold" disabled={!canFound} label={`Fonder pour ${cost} pièces`}
            sub={pa.profile.coins < cost ? `Il vous faut ${cost} pièces (vous en avez ${pa.profile.coins}).` : name.trim().length < 3 ? 'Choisissez un nom (3 lettres au moins)' : `${emblem} ${name.trim()}`}
            onClick={() => void run(async () => { await api('/clubs', { body: { name, emblem }, token }); }, 'Club fondé !')} />
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {toast}
    </Shell>
  );
}
