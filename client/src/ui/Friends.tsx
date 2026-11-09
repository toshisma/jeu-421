import { useEffect, useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import type { LobbyEntry } from '../../../shared/tournament';
import { BigAction, Empty, Initial, Section, Shell, useToast } from './kit';
import { ProfileView } from './ProfileView';
import { Icon } from './Icon';

interface Friend {
  username: string; level: number; me?: boolean; lastSeen: number; online: boolean;
  room: { code: string; status: 'salon' | 'partie'; joinable: boolean; watchable?: boolean; game?: 'courtisan' } | null;
  /** Présence dans Coups Fourrés (menu du mode, ou partie qu'on peut regarder). */
  cf?: { status: 'menu' | 'partie'; code?: string; watchable?: boolean } | null;
}

/** « Vu il y a 3 h », comme sur Steam. */
export function seenAgo(t: number, now = Date.now()): string {
  if (!t) return 'Jamais vu en ligne';
  const m = Math.max(1, Math.round((now - t) / 60_000));
  if (m < 60) return `En ligne il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `En ligne il y a ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `En ligne il y a ${d} jour${d > 1 ? 's' : ''}` : 'En ligne il y a plus d’un mois';
}

/** Écran Amis : qui est en ligne, qui joue, rejoindre son salon d'un clic, voir son profil. */
export function FriendsScreen({ pa, onBack, onAccount, onJoin, onInvite, onMessage, onWatch, onCfChallenge, onCfWatch }: { pa: ProfileApi; onBack: () => void; onAccount: () => void; onJoin: (code: string, game?: string) => void; onInvite: (username: string) => void; onMessage?: (username: string) => void; onWatch?: (code: string, game?: string) => void;
  /** Ouvert depuis Coups Fourrés : « Défier » lance un duel du mode cartes, « Regarder » sa partie. */
  onCfChallenge?: (username: string) => void; onCfWatch?: (code: string) => void }) {
  const [list, setList] = useState<Friend[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [toast, showToast] = useToast();
  const [incoming, setIncoming] = useState<{ username: string; at: number }[]>([]);
  const load = () => {
    if (!pa.token) return;
    api<{ friends: Friend[] }>('/friends', { token: pa.token }).then((r) => setList(r.friends.filter((f) => !f.me))).catch(() => {});
    api<{ incoming: { username: string; at: number }[] }>('/friends/requests', { token: pa.token }).then((r) => setIncoming(r.incoming)).catch(() => {});
  };
  const answer = async (username: string, accept: boolean) => {
    try {
      await api(accept ? '/friends/accept' : '/friends/decline', { token: pa.token!, body: { username } });
      showToast(accept ? `${username} est maintenant votre ami.` : `Demande de ${username} refusée.`);
      setIncoming((l) => l.filter((x) => x.username !== username));
      load();
    } catch (x) { showToast((x as Error).message, 'err'); }
  };
  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [pa.token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pa.isAccount) {
    return (
      <Shell title="Amis" onBack={onBack} icon="people"
        foot={<BigAction icon="key" tone="gold" label="Créer mon compte" sub="Gratuit, sans adresse e-mail" onClick={onAccount} />}>
        <Empty icon="people">Avec un compte, ajoutez des amis, voyez qui est en ligne et rejoignez leurs parties d'un geste.</Empty>
      </Shell>
    );
  }
  const rank = (f: Friend) => (onCfChallenge && f.cf ? -1 : f.room?.joinable ? 0 : f.room ? 1 : f.online ? 2 : 3);
  const sorted = [...(list ?? [])].sort((a, b) => rank(a) - rank(b) || b.lastSeen - a.lastSeen);
  const onlineCount = sorted.filter((f) => f.online).length;
  const active = sorted.filter((f) => f.online || f.room), away = sorted.filter((f) => !f.online && !f.room);
  const add = async () => {
    const n = name.trim();
    try {
      const r = await api<{ result: string }>('/friends', { token: pa.token!, body: { username: n } });
      showToast(r.result === 'accepted' ? `Vous êtes maintenant amis avec ${n}.` : `Demande envoyée à ${n}.`); setName(''); load();
    } catch (x) { showToast((x as Error).message, 'err'); }
  };
  const row = (f: Friend) => (
    <li key={f.username} className={f.online ? 'on' : ''}>
      <button className="fr-main" onClick={() => setOpen(f.username)} aria-label={`Profil de ${f.username}`}>
        <Initial name={f.username} dot={f.room || f.cf?.status === 'partie' ? 'play' : f.online ? 'on' : 'off'} />
        <span className="fr-name"><b>{f.username}</b><small>
          {f.cf ? (f.cf.status === 'partie' ? 'En partie de Coups Fourrés' : 'Dans Coups Fourrés')
            : f.room?.game === 'courtisan' ? (f.room.status === 'salon' ? 'À une table du Courtisan' : 'Joue au Courtisan')
            : f.room ? (f.room.status === 'salon' ? 'Dans un salon, en attente' : 'En pleine partie') : f.online ? 'En ligne' : seenAgo(f.lastSeen)}
          {' · '}niv. {f.level}</small></span>
      </button>
      {onCfChallenge ? (f.cf?.status === 'partie' && f.cf.watchable && f.cf.code && onCfWatch
        ? <button className="btn small" onClick={() => onCfWatch(f.cf!.code!)}><Icon name="eye" size={16} /> Regarder</button>
        : <button className="btn small primary" onClick={() => onCfChallenge(f.username)}>Défier</button>)
        : f.room?.joinable ? <button className="btn small primary" onClick={() => onJoin(f.room!.code, f.room!.game)}>Rejoindre</button>
        : f.room?.watchable && onWatch ? <button className="btn small" onClick={() => onWatch(f.room!.code, f.room!.game)}><Icon name="eye" size={16} /> Regarder</button>
        : f.online && !f.room ? <button className="btn small primary" onClick={() => onInvite(f.username)}>Inviter</button>
        : onMessage ? <button className="icon-btn" onClick={() => onMessage(f.username)} aria-label={`Écrire à ${f.username}`}><Icon name="chat" size={20} /></button> : null}
    </li>
  );
  return (
    <Shell title="Amis" onBack={onBack} icon="people" sub={list ? (onlineCount > 0 ? `${onlineCount} ami${onlineCount > 1 ? 's' : ''} en ligne` : 'Aucun ami en ligne') : 'Chargement…'}>
      <form className="hub-code friend-search" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 3) void add(); }}>
        <Icon name="plus" size={20} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ajouter un ami par son pseudo" maxLength={20} aria-label="Pseudo d'un ami" />
        <button className="btn small primary" disabled={name.trim().length < 3}>Ajouter</button>
      </form>
      {incoming.length > 0 && (
        <Section title="Demandes reçues" count={incoming.length}>
          <ul className="friends-list">
            {incoming.map((r) => (
              <li key={r.username} className="on friend-request">
                <span className="fr-main"><Initial name={r.username} dot="off" /><span className="fr-name"><b>{r.username}</b><small>veut être votre ami</small></span></span>
                <span className="friend-request-actions">
                  <button className="btn small primary" onClick={() => void answer(r.username, true)}>Accepter</button>
                  <button className="btn small ghost" onClick={() => void answer(r.username, false)}>Refuser</button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {list?.length === 0 && incoming.length === 0 && <Empty icon="people">Pas encore d'amis : ajoutez un pseudo ci-dessus, ou partagez votre lien de parrainage depuis l'accueil.</Empty>}
      {active.length > 0 && <Section title="En ligne" count={active.length}><ul className="friends-list">{active.map(row)}</ul></Section>}
      {away.length > 0 && <Section title="Hors ligne" count={away.length}><ul className="friends-list">{away.map(row)}</ul></Section>}
      {open && <ProfileView pa={pa} username={open} onClose={() => setOpen(null)} onInvite={onInvite} onMessage={onMessage} onWatch={onWatch} />}
      {toast}
    </Shell>
  );
}

/** Accueil : les salons en attente de joueurs, à rejoindre d'un clic. */
export function OpenLobbies({ onJoin, onAll }: { onJoin: (code: string) => void; onAll: () => void }) {
  const [lobbies, setLobbies] = useState<LobbyEntry[]>([]);
  useEffect(() => {
    const load = () => api<{ lobbies: LobbyEntry[] }>('/lobbies').then((r) => setLobbies(r.lobbies)).catch(() => {});
    load(); const t = setInterval(load, 8000); return () => clearInterval(t);
  }, []);
  if (!lobbies.length) return null;
  return (
    <section className="open-lobbies" aria-live="polite">
      <header><i className="fr-dot play" aria-hidden /><b>{lobbies.length > 1 ? `${lobbies.length} parties attendent des joueurs` : 'Une partie attend des joueurs'}</b></header>
      {lobbies.slice(0, 3).map((l) => (
        <div key={l.code} className="ol-row">
          <span><b>{l.title}</b><small>{l.players}/{l.max} joueurs{l.stake ? ` · mise ${l.stake} pièces` : ''}</small></span>
          <button className="btn primary small" onClick={() => onJoin(l.code)}>Rejoindre</button>
        </div>
      ))}
      {lobbies.length > 3 && <button className="btn ghost small" onClick={onAll}>Voir toutes les tables</button>}
    </section>
  );
}

/** Bouton Amis à côté de la cloche, avec le nombre d'amis en ligne. */
export function FriendsButton({ pa, onOpen }: { pa: ProfileApi; onOpen: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!pa.token) return;
    const load = () => api<{ friends: Friend[] }>('/friends', { token: pa.token! }).then((r) => setN(r.friends.filter((f) => !f.me && f.online).length)).catch(() => {});
    load(); const t = setInterval(load, 30_000); return () => clearInterval(t);
  }, [pa.token]);
  return (
    <button className="bell" onClick={onOpen} aria-label={n ? `Amis : ${n} en ligne` : 'Amis'}>
      <Icon name="user" size={22} />
      {n > 0 && <i className="bell-badge friends-badge">{n > 9 ? '9+' : n}</i>}
    </button>
  );
}

/** Bandeau d'invitation reçue : accepter (rejoindre la table) ou refuser. */
export function InviteBanner({ pa, onJoin }: { pa: ProfileApi; onJoin: (code: string, game?: string) => void }) {
  const [list, setList] = useState<{ from: string; code: string; game?: string }[]>([]);
  useEffect(() => {
    if (!pa.token) { setList([]); return; }
    const load = () => { if (document.visibilityState === 'visible') api<{ invites: { from: string; code: string; game?: string }[] }>('/invites', { token: pa.token! }).then((r) => setList(r.invites)).catch(() => {}); };
    load(); const t = setInterval(load, 10_000); return () => clearInterval(t);
  }, [pa.token]);
  const inv = list[list.length - 1];
  if (!inv) return null;
  const drop = () => { setList((l) => l.filter((x) => x.code !== inv.code)); void api('/invites/decline', { token: pa.token!, body: { code: inv.code } }).catch(() => {}); };
  return (
    <div className="invite-banner" role="alert">
      <span aria-hidden>🎲</span>
      <span className="ib-text"><b>{inv.from}</b> vous invite à sa table{inv.game === 'courtisan' ? ' du Courtisan' : ''}</span>
      <button className="btn primary small" onClick={() => { drop(); onJoin(inv.code, inv.game); }}>Accepter</button>
      <button className="btn ghost small" onClick={drop}>Refuser</button>
    </div>
  );
}

/** Petit toast discret quand un ami se connecte (n'intercepte aucun clic, disparaît seul). */
export function FriendOnlineToast({ pa }: { pa: ProfileApi }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!pa.token) return;
    let known: Set<string> | null = null;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ friends: Friend[] }>('/friends', { token: pa.token! }).then((r) => {
        const now = new Set(r.friends.filter((f) => !f.me && f.online).map((f) => f.username));
        const fresh = known ? [...now].filter((n) => !known!.has(n)) : [];
        known = now;
        if (fresh.length) {
          setMsg(fresh.length > 1 ? `${fresh.slice(0, 2).join(' et ')}${fresh.length > 2 ? '…' : ''} sont en ligne` : `${fresh[0]} est en ligne`);
          clearTimeout(hide); hide = setTimeout(() => setMsg(null), 4500);
        }
      }).catch(() => {});
    };
    load(); const t = setInterval(load, 30_000);
    return () => { clearInterval(t); clearTimeout(hide); };
  }, [pa.token]);
  if (!msg) return null;
  return <div className="friend-toast" role="status"><i className="fr-dot on" aria-hidden />{msg}</div>;
}

/** Historique global : les dernières parties jouées sur le site, et par qui. */
export function RecentGames({ onOpen }: { onOpen?: (username: string) => void }) {
  const [games, setGames] = useState<{ mode: string; humans: number; bots: number; endedAt: number; duration: number; players: { username: string; won: boolean }[]; guests: number }[] | null>(null);
  useEffect(() => {
    const load = () => api<{ games: NonNullable<typeof games> }>('/recent-games').then((r) => setGames(r.games)).catch(() => {});
    load(); const t = setInterval(load, 30_000); return () => clearInterval(t);
  }, []);
  if (!games?.length) return null;
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60_000); return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
  return (
    <section className="recent-games">
      <h3>Dernières parties jouées</h3>
      <ul className="history">
        {games.map((g, i) => {
          const winner = g.players.find((p) => p.won);
          return (
            <li key={i}>
              <span className="h-ico" aria-hidden>{g.mode === 'online' ? '🌐' : '🤖'}</span>
              <span className="h-main">
                <b>{g.players.map((p, j) => <span key={p.username}>{j > 0 && ', '}<button className="link-btn" onClick={() => onOpen?.(p.username)}>{p.username}</button></span>)}
                  {g.guests > 0 && `${g.players.length ? ' + ' : ''}${g.guests} invité${g.guests > 1 ? 's' : ''}`}</b>
                <small>{g.mode === 'online' ? 'En ligne' : `Contre ${g.bots} ordi`} · {winner ? `🏆 ${winner.username}` : g.mode === 'solo' ? 'perdue' : 'victoire d’un invité ou d’un ordi'} · {Math.max(1, Math.round(g.duration / 60))} min</small>
              </span>
              <small className="h-when">{ago(g.endedAt)}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Fil d'actualité discret : une ligne qui défile doucement sous le compteur de joueurs. */
export function NewsTicker() {
  const [feed, setFeed] = useState<{ text: string; at: number }[]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    const load = () => api<{ feed: { text: string; at: number }[] }>('/feed').then((r) => setFeed(r.feed.filter((f) => Date.now() - f.at < 3 * 86400_000))).catch(() => {});
    load(); const t = setInterval(load, 60_000); return () => clearInterval(t);
  }, []);
  useEffect(() => { if (feed.length < 2) return; const t = setInterval(() => setI((x) => x + 1), 6000); return () => clearInterval(t); }, [feed.length]);
  if (!feed.length) return null;
  const f = feed[i % feed.length];
  const m = Math.round((Date.now() - f.at) / 60_000);
  return <p className="news-ticker" aria-live="off" key={f.at}>{f.text} <small>{m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : 'hier'}</small></p>;
}
