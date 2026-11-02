import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { dailyQuests, questsFor, today } from '../../../shared/progress/quests';
import { levelInfo, type Profile } from '../../../shared/progress/profile';
import type { ProfileApi } from '../account/useProfile';
import { api } from '../account/api';
import { publicUrl } from '../platform';
import { sound } from '../audio/sound';
import { Shell } from './Screens';
import { ProfileView } from './ProfileView';

// ---------------------------------------------------------------------------------------------
// Défis du jour

function untilMidnight(): string {
  const now = new Date();
  const end = new Date(now); end.setHours(24, 0, 0, 0);
  const m = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function QuestsPanel({ profile, onClaim }: { profile: Profile; onClaim: (id: string) => Promise<string | null> }) {
  const day = today();
  const q = questsFor(profile.quests, day);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="quests">
      <header><h3>Défis du jour</h3><span className="muted small">nouveaux dans {untilMidnight()}</span></header>
      <ul>
        {dailyQuests(day).map((d) => {
          const n = q.progress[d.id] ?? 0;
          const done = n >= d.target;
          const claimed = q.claimed.includes(d.id);
          return (
            <li key={d.id} className={claimed ? 'claimed' : done ? 'done' : ''}>
              <div className="q-text">
                <span>{d.text}</span>
                <span className="q-bar"><i style={{ width: `${(100 * n) / d.target}%` }} /></span>
                <small className="q-meta">{n} sur {d.target}, rapporte {d.coins} pièces et {d.xp} XP</small>
              </div>
              {claimed ? <span className="q-ok">✓</span>
                : done ? <button className="btn primary small" disabled={busy === d.id} onClick={async () => {
                  setBusy(d.id); setErr(null); sound.unlock();
                  const e = await onClaim(d.id);
                  setBusy(null);
                  if (e) setErr(e); else sound.chips(5);
                }}>Récupérer</button> : null}
            </li>
          );
        })}
      </ul>
      {err && <p className="error small">{err}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Compte

export function AccountScreen({ pa, onBack, onPrivacy }: { pa: ProfileApi; onBack: () => void; onPrivacy?: () => void }) {
  const [tab, setTab] = useState<'login' | 'register' | 'recover'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [importGuest, setImportGuest] = useState(true);
  const [referrer, setReferrer] = useState(() => { try { return localStorage.getItem('421.parrain') ?? ''; } catch { return ''; } });
  const [ref, setRef] = useState<{ code: string; invited: number; paid: number; bonus: number; gamesNeeded: number } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (pa.token) api<{ code: string; invited: number; paid: number; bonus: number; gamesNeeded: number }>('/referral', { token: pa.token }).then(setRef).catch(() => {}); }, [pa.token]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rank, setRank] = useState<number | null>(null);

  useEffect(() => {
    if (!pa.token) return;
    api<{ rank: number | null }>('/me', { token: pa.token }).then((r) => setRank(r.rank)).catch(() => {});
  }, [pa.token]);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setErr(null);
    try { const r = await fn(); if (typeof r === 'string') setRecovery(r); setPassword(''); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  if (recovery) {
    return (
      <Shell title="Votre code de récupération" onBack={() => setRecovery(null)}>
        <div className="form">
          <p>Notez ce code et gardez-le en lieu sûr. C'est <b>le seul moyen</b> de récupérer votre compte si vous oubliez votre mot de passe (il n'y a pas d'adresse e-mail).</p>
          <div className="recovery">{recovery}</div>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(recovery).catch(() => {})}>Copier le code</button>
          <button className="btn primary" onClick={() => setRecovery(null)}>C'est noté</button>
        </div>
      </Shell>
    );
  }

  const exportData = async () => {
    try {
      const data = await api('/me/export', { token: pa.token });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `421-${pa.session?.username}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErr((e as Error).message); }
  };

  if (pa.isAccount) {
    const li = levelInfo(pa.profile.xp);
    return (
      <Shell title="Mon compte" onBack={onBack}>
        <div className="form">
          <div className="acct-head">
            <div className="acct-name">{pa.session!.username}</div>
            <div className="muted small">Niveau {li.level}, {pa.profile.coins} pièces</div>
          </div>
          <div className="acct-stats">
            <div><b>{pa.user?.onlineWins ?? '–'}</b><small>victoires en ligne</small></div>
            <div><b>{pa.user?.onlineGames ?? '–'}</b><small>parties en ligne</small></div>
            <div><b>{rank ?? '–'}</b><small>au classement</small></div>
            <div><b>{pa.profile.stats.won}</b><small>victoires au total</small></div>
          </div>
          <p className="muted small">Votre progression (niveau, pièces, objets, défis) est enregistrée sur le serveur et vous suit sur tous vos appareils.</p>
          {ref && (
            <>
              <h3>Inviter des amis</h3>
              <p className="muted small">Quand un ami crée son compte avec votre pseudo comme code de parrainage et joue {ref.gamesNeeded} parties, vous recevez chacun {ref.bonus} pièces.
                {ref.invited ? ` Amis invités : ${ref.invited}, dont ${ref.paid} récompensé${ref.paid > 1 ? 's' : ''}.` : ''}</p>
              <div className="row left">
                <button className="btn" onClick={async () => {
                  const link = `${publicUrl()}/?parrain=${encodeURIComponent(ref.code)}`;
                  try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt('Copiez :', link); }
                }}><Icon name="share" size={18} />{copied ? 'Lien copié' : "Copier mon lien d'invitation"}</button>
              </div>
            </>
          )}
          <h3>Joueurs bloqués</h3>
          {pa.blocked.length ? (
            <ul className="list">
              {pa.blocked.map((b) => (
                <li key={b}><div className="l-main"><b>{b}</b><small>Photo et réactions masquées, ne peut pas rejoindre vos tables</small></div>
                  <button className="btn small" onClick={() => void pa.block(b, false)}>Débloquer</button></li>
              ))}
            </ul>
          ) : <p className="muted small">Personne. Pour bloquer quelqu'un, ouvrez son profil (classement, amis ou carte en partie).</p>}
          <h3>Vos données</h3>
          <p className="muted small">Téléchargez tout ce que le serveur garde sur votre compte, ou lisez la <button className="link" onClick={onPrivacy}>politique de confidentialité</button>.</p>
          <button className="btn" onClick={() => void exportData()}>Télécharger mes données</button>
          <button className="btn" onClick={() => void pa.logout()}>Se déconnecter</button>
          {!deleting ? (
            <button className="btn ghost danger" onClick={() => setDeleting(true)}>Supprimer mon compte…</button>
          ) : (
            <div className="danger-zone">
              <p><b>Suppression définitive et immédiate</b> : pseudo, progression, objets, statistiques et liste d'amis sont effacés du serveur. Impossible de revenir en arrière.</p>
              <label className="field"><span>Mot de passe pour confirmer</span>
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              {err && <p className="error">{err}</p>}
              <div className="row">
                <button className="btn" onClick={() => { setDeleting(false); setErr(null); }}>Annuler</button>
                <button className="btn danger-solid" disabled={busy || !password} onClick={() => run(() => pa.deleteAccount(password))}>Supprimer définitivement</button>
              </div>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Compte joueur" onBack={onBack}>
      <div className="form">
        <p className="muted small">Facultatif : vous pouvez jouer sans compte. Avec un compte, votre progression vous suit sur tous vos appareils, vous apparaissez au classement et pouvez ajouter des amis.</p>
        <div className="seg">
          <button className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>Créer un compte</button>
          <button className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>Se connecter</button>
        </div>
        <form className="form" onSubmit={(e) => {
          e.preventDefault();
          if (tab === 'register') void run(() => pa.register(username, password, importGuest, referrer));
          else if (tab === 'login') void run(() => pa.login(username, password));
          else void run(() => pa.recover(username, code, password));
        }}>
          <label className="field"><span>Pseudo</span>
            <input value={username} maxLength={20} autoComplete="username" onChange={(e) => setUsername(e.target.value)} placeholder="3 à 20 caractères" /></label>
          {tab === 'recover' && (
            <label className="field"><span>Code de récupération</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" /></label>
          )}
          <label className="field"><span>{tab === 'recover' ? 'Nouveau mot de passe' : 'Mot de passe'}</span>
            <input type="password" value={password} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" /></label>
          {tab === 'register' && (
            <label className="field"><span>Code de parrainage<small>Facultatif : le pseudo de l'ami qui vous a invité.</small></span>
              <input value={referrer} maxLength={20} onChange={(e) => setReferrer(e.target.value)} placeholder="Pseudo du parrain" /></label>
          )}
          {tab === 'register' && (
            <label className="field check"><input type="checkbox" checked={importGuest} onChange={(e) => setImportGuest(e.target.checked)} />
              <span>Reprendre la progression de cet appareil (niveau {levelInfo(pa.profile.xp).level}, {pa.profile.coins} pièces)</span></label>
          )}
          {err && <p className="error">{err}</p>}
          <button className="btn primary big" disabled={busy || username.trim().length < 3 || password.length < 8}>
            {busy ? '…' : tab === 'register' ? 'Créer mon compte' : tab === 'login' ? 'Se connecter' : 'Changer le mot de passe'}
          </button>
          {tab === 'login' && <button type="button" className="btn ghost small" onClick={() => setTab('recover')}>Mot de passe oublié ?</button>}
          {tab === 'register' && <p className="muted small">En créant un compte, vous acceptez la <button type="button" className="link" onClick={onPrivacy}>politique de confidentialité</button>. Aucune adresse e-mail n'est demandée.</p>}
        </form>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------
// Classement et amis

interface Row { rank: number | null; username: string; onlineWins: number; onlineGames: number; level: number; me?: boolean }

export function LeaderboardScreen({ pa, onBack, onAccount }: { pa: ProfileApi; onBack: () => void; onAccount: () => void }) {
  const [tab, setTab] = useState<'ligue' | 'monde' | 'amis'>('ligue');
  const [top, setTop] = useState<Row[] | null>(null);
  const [me, setMe] = useState<Row | null>(null);
  const [friends, setFriends] = useState<Row[] | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const token = pa.token;

  const load = () => {
    if (!token) return;
    api<{ top: Row[]; me: Row }>('/leaderboard', { token }).then((r) => { setTop(r.top); setMe(r.me); }).catch((e) => setErr(e.message));
    api<{ friends: Row[] }>('/friends', { token }).then((r) => setFriends(r.friends)).catch(() => {});
  };
  useEffect(load, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!token) {
    return (
      <Shell title="Classement" onBack={onBack}>
        <div className="form">
          <p>Le classement compte les <b>victoires en ligne</b>, vérifiées par le serveur. Il faut un compte (gratuit) pour y figurer et ajouter des amis.</p>
          <button className="btn primary" onClick={onAccount}>Créer un compte ou se connecter</button>
        </div>
      </Shell>
    );
  }
  const rows = tab === 'monde' ? top : friends;
  return (
    <Shell title="Classement" onBack={onBack}>
      <div className="seg wide-seg three">
        <button className={tab === 'ligue' ? 'on' : ''} onClick={() => setTab('ligue')}>Ma ligue</button>
        <button className={tab === 'monde' ? 'on' : ''} onClick={() => setTab('monde')}>Tous les joueurs</button>
        <button className={tab === 'amis' ? 'on' : ''} onClick={() => setTab('amis')}>Mes amis</button>
      </div>
      {tab === 'ligue' ? <LeagueView pa={pa} onOpen={setOpen} /> : <>
      <p className="muted small">Victoires en ligne (le solo ne compte pas). À égalité, le moins de parties jouées passe devant.</p>
      {tab === 'amis' && (
        <form className="friend-add" onSubmit={async (e) => {
          e.preventDefault(); setErr(null);
          try { await api('/friends', { token, body: { username: name } }); setName(''); load(); }
          catch (x) { setErr((x as Error).message); }
        }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pseudo d'un ami" maxLength={20} />
          <button className="btn small primary" disabled={name.trim().length < 3}>Ajouter</button>
        </form>
      )}
      {err && <p className="error small">{err}</p>}
      <ol className="board">
        {!rows && <li className="muted">Chargement…</li>}
        {rows?.length === 0 && <li className="muted">{tab === 'monde' ? 'Personne encore : jouez une partie en ligne !' : 'Ajoutez des amis par leur pseudo.'}</li>}
        {rows?.map((r) => (
          <li key={r.username} className={`${r.username === pa.session?.username ? 'me' : ''} clickable`} onClick={() => setOpen(r.username)} title="Voir le profil">
            <span className="b-rank">{r.rank ?? '–'}</span>
            <span className="b-name">{r.username}<small>niveau {r.level}</small></span>
            <span className="b-wins"><b>{r.onlineWins}</b> <small>/ {r.onlineGames}</small></span>
            {tab === 'amis' && !r.me && (
              <button className="icon-btn small" title="Retirer" onClick={async (e) => {
                e.stopPropagation(); await api(`/friends/${encodeURIComponent(r.username)}`, { token, method: 'DELETE' }).catch(() => {}); load(); }} aria-label="Retirer"><Icon name="close" size={18} /></button>
            )}
          </li>
        ))}
      </ol>
      {tab === 'monde' && me && (me.rank == null || me.rank > 50) && (
        <p className="board-me">Votre place : {me.rank ? `${me.rank}e` : 'pas encore classé'}, {me.onlineWins} victoire{me.onlineWins > 1 ? 's' : ''} / {me.onlineGames}</p>
      )}
      </>}
      {open && <ProfileView pa={pa} username={open} onClose={() => setOpen(null)} />}
    </Shell>
  );
}


// ---------------------------------------------------------------------------------------------
// Ligue de la semaine

interface League {
  week: string; endsAt: string; league: number; name: string; promote: number; demote: number; prizes: number[];
  group: { rank: number; username: string; xp: number; me: boolean }[];
}
const LEAGUE_COLORS = ['#b8743c', '#b9c2cc', '#d4ad2f', '#3a6fd8', '#c8312b', '#7fd6ff'];

function LeagueView({ pa, onOpen }: { pa: ProfileApi; onOpen: (u: string) => void }) {
  const [l, setL] = useState<League | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<League>('/league', { token: pa.token }).then(setL).catch((e) => setErr(e.message)); }, [pa.token]);
  if (err) return <p className="error">{err}</p>;
  if (!l) return <p className="muted">Chargement…</p>;
  const n = l.group.length;
  const end = new Date(`${l.endsAt}T00:00:00`);
  return (
    <div className="league">
      <div className="league-head" style={{ ['--lc' as string]: LEAGUE_COLORS[l.league] }}>
        <span className="league-badge" aria-hidden />
        <div>
          <b>Ligue {l.name}</b>
          <span>Se termine dimanche soir ({end.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })}).</span>
        </div>
      </div>
      <p className="muted small">Chaque point d'XP gagné cette semaine compte. Les {l.promote} premiers montent de ligue
        et gagnent {l.prizes.join(', ')} pièces{l.demote ? `, les ${l.demote} derniers redescendent` : ''}.</p>
      {n === 0 ? <p className="empty">Jouez une partie cette semaine pour entrer dans un groupe de {20} joueurs.</p> : (
        <ol className="board league-board">
          {l.group.map((r) => {
            const zone = r.rank <= l.promote ? 'up' : l.demote && n >= 8 && r.rank > n - l.demote ? 'down' : '';
            return (
              <li key={r.username} className={`${r.me ? 'me ' : ''}${zone} clickable`} onClick={() => onOpen(r.username)}>
                <span className="b-rank">{r.rank}</span>
                <span className="b-name">{r.username}<small>{zone === 'up' ? 'Zone de montée' : zone === 'down' ? 'Zone de descente' : ''}</small></span>
                <span className="b-wins"><b>{r.xp}</b> <small>XP</small></span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
