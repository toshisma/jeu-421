import { useEffect, useState } from 'react';
import { askConfirm } from './confirm';
import { Icon } from './Icon';
import { dailyQuests, questsFor, today } from '../../../shared/progress/quests';
import { levelInfo, type Profile } from '../../../shared/progress/profile';
import type { ProfileApi } from '../account/useProfile';
import { api } from '../account/api';
import { sound } from '../audio/sound';
import { BigAction, Coins, Empty, Section, Shell, Tabs, Toggle, useToast } from './kit';
import { ProfileView } from './ProfileView';
import { SeasonView } from './SeasonView';
import { ReferralCard } from './Referral';

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

/**
 * `onRegistered` : après la création du compte et le code de récupération, retour là où l'on était
 * (par exemple le menu du jeu, depuis l'invitation de fin de partie).
 */
export function AccountScreen({ pa, onBack, onPrivacy, onRegistered, initial = 'register', forCf = false }: { pa: ProfileApi; onBack: () => void; onPrivacy?: () => void; onRegistered?: () => void; initial?: 'login' | 'register'; forCf?: boolean }) {
  const [tab, setTab] = useState<'login' | 'register' | 'recover'>(initial);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [importGuest, setImportGuest] = useState(true);
  const [referrer, setReferrer] = useState(() => { try { return localStorage.getItem('421.parrain') ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  /** Le code affiché vient d'une inscription (pas d'un mot de passe oublié). */
  const [justRegistered, setJustRegistered] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [toast, showToast] = useToast();

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
    const done = () => { setRecovery(null); if (justRegistered && onRegistered) onRegistered(); };
    return (
      <Shell title="Code de récupération" onBack={done} icon="key"
        foot={<BigAction icon="check" tone="green" label="C'est noté" onClick={done} />}>
        <div className="k-stack">
          <p className="k-warn">Notez ce code et gardez-le en lieu sûr : c'est <b>le seul moyen</b> de récupérer votre compte si vous oubliez votre mot de passe (il n'y a pas d'adresse e-mail).</p>
          <div className="recovery">{recovery}</div>
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(recovery).then(() => showToast('Code copié')).catch(() => {}); }}><Icon name="copy" size={18} /> Copier le code</button>
        </div>
        {toast}
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
      <Shell title="Mon compte" onBack={onBack} icon="key" sub="Progression gardée sur le serveur">
        <div className="k-stack">
          <div className="acct-hero">
            <span className="k-initial big" aria-hidden>{pa.session!.username.slice(0, 1).toUpperCase()}</span>
            <div><div className="acct-name">{pa.session!.username}</div>
              <div className="acct-sub">Niveau {li.level} · <Coins n={pa.profile.coins} label="pièces" /></div></div>
          </div>
          <div className="acct-stats">
            <div><b>{pa.user?.onlineWins ?? '–'}</b><small>victoires en ligne</small></div>
            <div><b>{pa.user?.onlineGames ?? '–'}</b><small>parties en ligne</small></div>
            <div><b>{rank ?? '–'}</b><small>au classement</small></div>
            <div><b>{pa.profile.stats.won}</b><small>victoires au total</small></div>
          </div>
          <p className="k-hint">Niveau, pièces, objets et défis vous suivent sur tous vos appareils.</p>
          <Section title="Inviter des amis">
            <ReferralCard pa={pa} onAccount={() => {}} />
          </Section>
          <Section title="Joueurs bloqués" count={pa.blocked.length || undefined}>
            {pa.blocked.length ? (
              <ul className="list">
                {pa.blocked.map((b) => (
                  <li key={b}><div className="l-main"><b>{b}</b><small>Photo et réactions masquées, ne peut pas rejoindre vos tables</small></div>
                    <button className="btn small" onClick={() => void pa.block(b, false).then(() => showToast(`${b} est débloqué.`))}>Débloquer</button></li>
                ))}
              </ul>
            ) : <Empty icon="user">Personne. Pour bloquer quelqu'un, ouvrez son profil (classement, amis ou carte en partie).</Empty>}
          </Section>
          <Section title="Vos données">
            <div className="k-links">
              <button className="btn" onClick={() => void exportData()}><Icon name="install" size={18} /> Télécharger mes données</button>
              <button className="btn" onClick={onPrivacy}><Icon name="lock" size={18} /> Confidentialité</button>
            </div>
          </Section>
          <Section title="Session">
            <div className="k-links">
              <button className="btn" onClick={() => void pa.logout()}><Icon name="back" size={18} /> Se déconnecter</button>
            </div>
          </Section>
          {!deleting ? (
            <button className="btn ghost danger acct-del" onClick={() => setDeleting(true)}>Supprimer mon compte…</button>
          ) : (
            <div className="danger-zone">
              <p><b>Suppression définitive et immédiate</b> : pseudo, progression, objets, statistiques et liste d'amis sont effacés du serveur. Impossible de revenir en arrière.</p>
              <label className="k-field"><span className="k-label">Mot de passe pour confirmer</span>
                <input className="k-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              {err && <p className="error">{err}</p>}
              <div className="row">
                <button className="btn" onClick={() => { setDeleting(false); setErr(null); }}>Annuler</button>
                <button className="btn danger-solid" disabled={busy || !password} onClick={() => run(() => pa.deleteAccount(password))}>Supprimer définitivement</button>
              </div>
            </div>
          )}
          {!deleting && err && <p className="error">{err}</p>}
        </div>
        {toast}
      </Shell>
    );
  }

  const canSubmit = !busy && username.trim().length >= 3 && password.length >= 8;
  const submit = () => {
    if (!canSubmit) return;
    if (tab === 'register') void run(async () => { const code = await pa.register(username, password, importGuest, referrer); setJustRegistered(true); return code; });
    else if (tab === 'login') void run(() => pa.login(username, password));
    else void run(() => pa.recover(username, code, password));
  };
  return (
    <Shell title={tab === 'register' ? 'Créer un compte' : tab === 'login' ? 'Se connecter' : 'Mot de passe oublié'} onBack={onBack} icon="key"
      sub="Gratuit, sans adresse e-mail"
      foot={<BigAction type="button" onClick={submit} disabled={!canSubmit} icon={tab === 'register' ? 'plus' : tab === 'login' ? 'key' : 'resume'}
        tone={tab === 'register' ? 'gold' : 'blue'}
        label={busy ? 'Un instant…' : tab === 'register' ? 'Créer mon compte' : tab === 'login' ? 'Se connecter' : 'Changer le mot de passe'} />}>
      <div className="k-stack">
        {tab !== 'recover' && <Tabs label="Compte" value={tab} onChange={(v) => { setTab(v); setErr(null); }}
          options={[{ v: 'register', label: 'Nouveau compte', icon: 'plus' }, { v: 'login', label: "J'ai un compte", icon: 'key' }]} />}
        {tab === 'register' && (
          <ul className="acct-perks">
            <li><Icon name="check" size={18} />Progression sauvegardée sur tous vos appareils</li>
            <li><Icon name="check" size={18} />Classements, ligues, clubs et amis</li>
            {forCf
              ? <li><Icon name="check" size={18} />Coups Fourrés : vos cartes, vos decks, des boosters offerts, parties classées</li>
              : <li><Icon name="check" size={18} />Tables avec mise et tournois de 11 h et 21 h</li>}
          </ul>
        )}
        {tab === 'recover' && <p className="k-hint">Entrez votre pseudo, le code de récupération reçu à l'inscription et un nouveau mot de passe.</p>}
        <form className="k-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="k-field"><span className="k-label">Pseudo</span>
            <input className="k-input" value={username} maxLength={20} autoComplete="username" onChange={(e) => setUsername(e.target.value)} placeholder="3 à 20 caractères" /></label>
          {tab === 'recover' && (
            <label className="k-field"><span className="k-label">Code de récupération</span>
              <input className="k-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" /></label>
          )}
          <label className="k-field"><span className="k-label">{tab === 'recover' ? 'Nouveau mot de passe' : 'Mot de passe'}</span>
            <input className="k-input" type="password" value={password} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" /></label>
          {tab === 'register' && (
            <label className="k-field"><span className="k-label">Code de parrainage <small>Facultatif : le pseudo de l'ami qui vous a invité.</small></span>
              <input className="k-input" value={referrer} maxLength={20} onChange={(e) => setReferrer(e.target.value)} placeholder="Pseudo du parrain" /></label>
          )}
          {tab === 'register' && (
            <Toggle label="Reprendre la progression de cet appareil" hint={`Niveau ${levelInfo(pa.profile.xp).level}, ${pa.profile.coins} pièces`} checked={importGuest} onChange={setImportGuest} />
          )}
          {err && <p className="error">{err}</p>}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
        {tab === 'login' && <button type="button" className="btn ghost small" onClick={() => { setTab('recover'); setErr(null); }}>Mot de passe oublié ?</button>}
        {tab === 'recover' && <button type="button" className="btn ghost small" onClick={() => { setTab('login'); setErr(null); }}>Retour à la connexion</button>}
        {tab === 'register' && <p className="k-hint">En créant un compte, vous acceptez la <button type="button" className="link" onClick={onPrivacy}>politique de confidentialité</button>. Aucune adresse e-mail n'est demandée. Vous pouvez aussi jouer sans compte.</p>}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------
// Classement et amis

interface Row { rank: number | null; username: string; onlineWins: number; onlineGames: number; level: number; me?: boolean }

export function LeaderboardScreen({ pa, onBack, onAccount }: { pa: ProfileApi; onBack: () => void; onAccount: () => void }) {
  const [tab, setTab] = useState<'saison' | 'ligue' | 'monde' | 'amis'>('saison');
  const [top, setTop] = useState<Row[] | null>(null);
  const [me, setMe] = useState<Row | null>(null);
  const [friends, setFriends] = useState<Row[] | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const token = pa.token;

  const load = () => {
    if (!token) return;
    api<{ top: Row[]; me: Row }>('/leaderboard', { token }).then((r) => { setTop(r.top); setMe(r.me); }).catch((e) => setErr(e.message));
    api<{ friends: Row[] }>('/friends', { token }).then((r) => setFriends(r.friends)).catch(() => {});
    api<{ outgoing: { username: string }[] }>('/friends/requests', { token }).then((r) => setPending(r.outgoing.map((x) => x.username))).catch(() => {});
  };
  useEffect(load, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!token) {
    return (
      <Shell title="Classement" onBack={onBack} icon="trophy"
        foot={<BigAction icon="key" tone="gold" label="Créer un compte ou se connecter" sub="Gratuit, sans adresse e-mail" onClick={onAccount} />}>
        <Empty icon="trophy">Saison, ligue de la semaine et victoires en ligne, vérifiées par le serveur. Il faut un compte (gratuit) pour y figurer et ajouter des amis.</Empty>
      </Shell>
    );
  }
  const rows = tab === 'monde' ? top : friends;
  const addFriend = async () => {
    setErr(null);
    try {
      const r = await api<{ result: string }>('/friends', { token, body: { username: name } });
      showToast(r.result === 'accepted' ? `Vous êtes maintenant amis avec ${name}.` : `Demande envoyée à ${name}.`);
      setOk(null); setName(''); load();
    } catch (x) { setErr((x as Error).message); }
  };
  return (
    <Shell title="Classement" onBack={onBack} icon="trophy"
      sub={me ? `Votre place : ${me.rank ? `${me.rank}e` : 'pas encore classé'} · ${me.onlineWins} victoire${me.onlineWins > 1 ? 's' : ''} en ligne` : undefined}>
      <Tabs label="Classements" value={tab} onChange={setTab}
        options={[{ v: 'saison', label: 'Saison' }, { v: 'ligue', label: 'Ligue' }, { v: 'monde', label: 'Victoires' }, { v: 'amis', label: 'Amis' }]} />
      {tab === 'saison' ? <SeasonView pa={pa} onOpen={setOpen} /> : tab === 'ligue' ? <LeagueView pa={pa} onOpen={setOpen} /> : <>
      <p className="k-hint lb-help">{tab === 'monde' ? 'Victoires en ligne (le solo ne compte pas). À égalité, le moins de parties jouées passe devant.' : 'Vos amis, classés par victoires en ligne.'}</p>
      {tab === 'amis' && (
        <form className="hub-code friend-search" onSubmit={(e) => { e.preventDefault(); void addFriend(); }}>
          <Icon name="plus" size={20} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pseudo d'un ami" maxLength={20} aria-label="Pseudo d'un ami" />
          <button className="btn small primary" disabled={name.trim().length < 3}>Ajouter</button>
        </form>
      )}
      {err && <p className="error small">{err}</p>}
      {tab === 'amis' && ok && <p className="ok small">{ok}</p>}
      {tab === 'amis' && pending.length > 0 && <p className="k-hint">En attente de réponse : {pending.join(', ')}.</p>}
      {rows?.length === 0 ? <Empty icon={tab === 'monde' ? 'trophy' : 'people'}>{tab === 'monde' ? 'Personne encore : jouez une partie en ligne !' : 'Ajoutez des amis par leur pseudo.'}</Empty> : (
      <ol className="board">
        {!rows && <li className="muted">Chargement…</li>}
        {rows?.map((r) => (
          <li key={r.username} className={`${r.username === pa.session?.username ? 'me' : ''} clickable`} onClick={() => setOpen(r.username)} title="Voir le profil">
            <span className="b-rank">{r.rank ?? '–'}</span>
            <span className="b-name">{r.username}<small>niveau {r.level}</small></span>
            <span className="b-wins"><b>{r.onlineWins}</b> <small>/ {r.onlineGames}</small></span>
            {tab === 'amis' && !r.me && (
              <button className="icon-btn small" title="Retirer" onClick={async (e) => {
                e.stopPropagation();
                if (!(await askConfirm(`Retirer ${r.username} de vos amis ?`, 'Retirer'))) return;
                await api(`/friends/${encodeURIComponent(r.username)}`, { token, method: 'DELETE' }).catch(() => {}); showToast(`${r.username} retiré de vos amis.`); load(); }} aria-label={`Retirer ${r.username}`}><Icon name="close" size={18} /></button>
            )}
          </li>
        ))}
      </ol>)}
      {tab === 'monde' && me && (me.rank == null || me.rank > 50) && (
        <p className="board-me">Votre place : {me.rank ? `${me.rank}e` : 'pas encore classé'}, {me.onlineWins} victoire{me.onlineWins > 1 ? 's' : ''} / {me.onlineGames}</p>
      )}
      </>}
      {open && <ProfileView pa={pa} username={open} onClose={() => setOpen(null)} />}
      {toast}
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
      {n === 0 ? <Empty icon="trophy">Jouez une partie cette semaine pour entrer dans un groupe de 20 joueurs.</Empty> : (
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
