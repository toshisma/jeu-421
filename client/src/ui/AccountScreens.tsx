import { loc, tr, trServer } from '../i18n/lang';
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
      <header><h3>{tr('app.defis_du_jour')}</h3><span className="muted small">{tr('app.nouveaux_dans')} {untilMidnight()}</span></header>
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
                <small className="q-meta">{n} {tr('app.sur_rapporte_pieces_et_xp', { target: d.target, coins: d.coins, xp: d.xp })}</small>
              </div>
              {claimed ? <span className="q-ok">✓</span>
                : done ? <button className="btn primary small" disabled={busy === d.id} onClick={async () => {
                  setBusy(d.id); setErr(null); sound.unlock();
                  const e = await onClaim(d.id);
                  setBusy(null);
                  if (e) setErr(e); else sound.chips(5);
                }}>{tr('app.recuperer')}</button> : null}
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
    catch (e) { setErr(trServer((e as Error).message)); }
    setBusy(false);
  };

  if (recovery) {
    const done = () => { setRecovery(null); if (justRegistered && onRegistered) onRegistered(); };
    return (
      <Shell title={tr('ac.recoveryTitle')} onBack={done} icon="key"
        foot={<BigAction icon="check" tone="green" label={tr('ac.noted')} onClick={done} />}>
        <div className="k-stack">
          <p className="k-warn">{tr('ac.recoveryWarn1')}<b>{tr('ac.recoveryWarn2')}</b>{tr('ac.recoveryWarn3')}</p>
          <div className="recovery">{recovery}</div>
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(recovery).then(() => showToast(tr('ac.copied'))).catch(() => {}); }}><Icon name="copy" size={18} /> {tr('ac.copy')}</button>
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
      <Shell title={tr('app.mon_compte')} onBack={onBack} icon="key" sub={tr('app.progression_gardee_sur_le_serveur')}>
        <div className="k-stack">
          <div className="acct-hero">
            <span className="k-initial big" aria-hidden>{pa.session!.username.slice(0, 1).toUpperCase()}</span>
            <div><div className="acct-name">{pa.session!.username}</div>
              <div className="acct-sub">{tr('app.niveau_2', { level: li.level })} <Coins n={pa.profile.coins} label={tr('app.pieces_2')} /></div></div>
          </div>
          <div className="acct-stats">
            <div><b>{pa.user?.onlineWins ?? '–'}</b><small>{tr('app.victoires_en_ligne')}</small></div>
            <div><b>{pa.user?.onlineGames ?? '–'}</b><small>{tr('app.parties_en_ligne')}</small></div>
            <div><b>{rank ?? '–'}</b><small>{tr('app.au_classement')}</small></div>
            <div><b>{pa.profile.stats.won}</b><small>{tr('app.victoires_au_total')}</small></div>
          </div>
          <p className="k-hint">{tr('app.niveau_pieces_objets_et_defis_vous_s')}</p>
          <Section title={tr('app.inviter_des_amis')}>
            <ReferralCard pa={pa} onAccount={() => {}} />
          </Section>
          <Section title={tr('app.joueurs_bloques')} count={pa.blocked.length || undefined}>
            {pa.blocked.length ? (
              <ul className="list">
                {pa.blocked.map((b) => (
                  <li key={b}><div className="l-main"><b>{b}</b><small>{tr('app.photo_et_reactions_masquees_ne_peut_')}</small></div>
                    <button className="btn small" onClick={() => void pa.block(b, false).then(() => showToast(tr('app.est_debloque', { b })))}>{tr('app.debloquer')}</button></li>
                ))}
              </ul>
            ) : <Empty icon="user">{tr('app.personne_pour_bloquer_quelqu_un_ouvr')}</Empty>}
          </Section>
          <Section title={tr('app.vos_donnees')}>
            <div className="k-links">
              <button className="btn" onClick={() => void exportData()}><Icon name="install" size={18} /> {tr('app.telecharger_mes_donnees')}</button>
              <button className="btn" onClick={onPrivacy}><Icon name="lock" size={18} /> {tr('app.confidentialite')}</button>
            </div>
          </Section>
          <Section title={tr('app.session')}>
            <div className="k-links">
              <button className="btn" onClick={() => void pa.logout()}><Icon name="back" size={18} /> {tr('app.se_deconnecter')}</button>
            </div>
          </Section>
          {!deleting ? (
            <button className="btn ghost danger acct-del" onClick={() => setDeleting(true)}>{tr('app.supprimer_mon_compte')}</button>
          ) : (
            <div className="danger-zone">
              <p><b>{tr('app.suppression_definitive_et_immediate')}</b>{tr('app.pseudo_progression_objets_statistiqu')}</p>
              <label className="k-field"><span className="k-label">{tr('app.mot_de_passe_pour_confirmer')}</span>
                <input className="k-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              {err && <p className="error">{err}</p>}
              <div className="row">
                <button className="btn" onClick={() => { setDeleting(false); setErr(null); }}>{tr('app.annuler')}</button>
                <button className="btn danger-solid" disabled={busy || !password} onClick={() => run(() => pa.deleteAccount(password))}>{tr('app.supprimer_definitivement')}</button>
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
    <Shell title={tr(tab === 'register' ? 'ac.register' : tab === 'login' ? 'ac.login' : 'ac.forgot')} onBack={onBack} icon="key"
      sub={tr('ac.free')}
      foot={<BigAction type="button" onClick={submit} disabled={!canSubmit} icon={tab === 'register' ? 'plus' : tab === 'login' ? 'key' : 'resume'}
        tone={tab === 'register' ? 'gold' : 'blue'}
        label={tr(busy ? 'ac.wait' : tab === 'register' ? 'ac.registerBtn' : tab === 'login' ? 'ac.login' : 'ac.changePw')} />}>
      <div className="k-stack">
        {tab !== 'recover' && <Tabs label={tr('ac.tabs')} value={tab} onChange={(v) => { setTab(v); setErr(null); }}
          options={[{ v: 'register', label: tr('ac.new'), icon: 'plus' }, { v: 'login', label: tr('ac.have'), icon: 'key' }]} />}
        {tab === 'register' && (
          <ul className="acct-perks">
            <li><Icon name="check" size={18} />{tr('ac.perk1')}</li>
            <li><Icon name="check" size={18} />{tr('ac.perk2')}</li>
            {forCf
              ? <li><Icon name="check" size={18} />{tr('app.coups_fourres_vos_cartes_vos_decks_d')}</li>
              : <li><Icon name="check" size={18} />{tr('ac.perk3')}</li>}
          </ul>
        )}
        {tab === 'recover' && <p className="k-hint">{tr('ac.recoverHint')}</p>}
        <form className="k-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="k-field"><span className="k-label">{tr('ac.username')}</span>
            <input className="k-input" value={username} maxLength={20} autoComplete="username" onChange={(e) => setUsername(e.target.value)} placeholder={tr('ac.usernamePh')} /></label>
          {tab === 'recover' && (
            <label className="k-field"><span className="k-label">{tr('ac.recoveryTitle')}</span>
              <input className="k-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" /></label>
          )}
          <label className="k-field"><span className="k-label">{tr(tab === 'recover' ? 'ac.newPw' : 'ac.pw')}</span>
            <input className="k-input" type="password" value={password} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} onChange={(e) => setPassword(e.target.value)} placeholder={tr('ac.pwPh')} /></label>
          {tab === 'register' && (
            <label className="k-field"><span className="k-label">{tr('ac.refCode')} <small>{tr('ac.refHint')}</small></span>
              <input className="k-input" value={referrer} maxLength={20} onChange={(e) => setReferrer(e.target.value)} placeholder={tr('ac.refPh')} /></label>
          )}
          {tab === 'register' && (
            <Toggle label={tr('ac.import')} hint={tr('ac.importHint', { level: levelInfo(pa.profile.xp).level, coins: pa.profile.coins })} checked={importGuest} onChange={setImportGuest} />
          )}
          {err && <p className="error">{err}</p>}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
        {tab === 'login' && <button type="button" className="btn ghost small" onClick={() => { setTab('recover'); setErr(null); }}>{tr('ac.forgotQ')}</button>}
        {tab === 'recover' && <button type="button" className="btn ghost small" onClick={() => { setTab('login'); setErr(null); }}>{tr('ac.backLogin')}</button>}
        {tab === 'register' && <p className="k-hint">{tr('ac.legal1')}<button type="button" className="link" onClick={onPrivacy}>{tr('ac.legal2')}</button>{tr('ac.legal3')}</p>}
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
      <Shell title={tr('app.classement')} onBack={onBack} icon="trophy"
        foot={<BigAction icon="key" tone="gold" label={tr('app.creer_un_compte_ou_se_connecter')} sub={tr('app.gratuit_sans_adresse_e_mail')} onClick={onAccount} />}>
        <Empty icon="trophy">{tr('app.saison_ligue_de_la_semaine_et_victoi')}</Empty>
      </Shell>
    );
  }
  const rows = tab === 'monde' ? top : friends;
  const addFriend = async () => {
    setErr(null);
    try {
      const r = await api<{ result: string }>('/friends', { token, body: { username: name } });
      showToast(r.result === 'accepted' ? tr('app.vous_etes_maintenant_amis_avec', { name }) : tr('app.demande_envoyee_a', { name }));
      setOk(null); setName(''); load();
    } catch (x) { setErr((x as Error).message); }
  };
  return (
    <Shell title={tr('app.classement')} onBack={onBack} icon="trophy"
      sub={me ? tr(me.onlineWins > 1 ? 'app.votre_place_victoire_en_ligne.p' : 'app.votre_place_victoire_en_ligne', { v: me.rank ? `${me.rank}e` : tr('app.pas_encore_classe'), onlineWins: me.onlineWins }) : undefined}>
      <Tabs label={tr('app.classements')} value={tab} onChange={setTab}
        options={[{ v: 'saison', label: tr('app.saison') }, { v: 'ligue', label: tr('app.ligue') }, { v: 'monde', label: tr('app.victoires') }, { v: 'amis', label: tr('app.amis') }]} />
      {tab === 'saison' ? <SeasonView pa={pa} onOpen={setOpen} /> : tab === 'ligue' ? <LeagueView pa={pa} onOpen={setOpen} /> : <>
      <p className="k-hint lb-help">{tab === 'monde' ? tr('app.victoires_en_ligne_le_solo_ne_compte') : tr('app.vos_amis_classes_par_victoires_en_li')}</p>
      {tab === 'amis' && (
        <form className="hub-code friend-search" onSubmit={(e) => { e.preventDefault(); void addFriend(); }}>
          <Icon name="plus" size={20} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('app.pseudo_d_un_ami')} maxLength={20} aria-label={tr('app.pseudo_d_un_ami')} />
          <button className="btn small primary" disabled={name.trim().length < 3}>{tr('app.ajouter')}</button>
        </form>
      )}
      {err && <p className="error small">{err}</p>}
      {tab === 'amis' && ok && <p className="ok small">{ok}</p>}
      {tab === 'amis' && pending.length > 0 && <p className="k-hint">{tr('app.en_attente_de_reponse')} {pending.join(', ')}.</p>}
      {rows?.length === 0 ? <Empty icon={tab === 'monde' ? 'trophy' : 'people'}>{tab === 'monde' ? tr('app.personne_encore_jouez_une_partie_en_') : tr('app.ajoutez_des_amis_par_leur_pseudo')}</Empty> : (
      <ol className="board">
        {!rows && <li className="muted">{tr('app.chargement')}</li>}
        {rows?.map((r) => (
          <li key={r.username} className={`${r.username === pa.session?.username ? 'me' : ''} clickable`} onClick={() => setOpen(r.username)} title={tr('app.voir_le_profil')}>
            <span className="b-rank">{r.rank ?? '–'}</span>
            <span className="b-name">{r.username}<small>{tr('app.niveau_3')} {r.level}</small></span>
            <span className="b-wins"><b>{r.onlineWins}</b> <small>/ {r.onlineGames}</small></span>
            {tab === 'amis' && !r.me && (
              <button className="icon-btn small" title={tr('app.retirer')} onClick={async (e) => {
                e.stopPropagation();
                if (!(await askConfirm(tr('app.retirer_de_vos_amis', { username: r.username }), tr('app.retirer')))) return;
                await api(`/friends/${encodeURIComponent(r.username)}`, { token, method: 'DELETE' }).catch(() => {}); showToast(tr('app.retire_de_vos_amis', { username: r.username })); load(); }} aria-label={tr('app.retirer_2', { username: r.username })}><Icon name="close" size={18} /></button>
            )}
          </li>
        ))}
      </ol>)}
      {tab === 'monde' && me && (me.rank == null || me.rank > 50) && (
        <p className="board-me">{tr('app.votre_place')} {me.rank ? `${me.rank}e` : tr('app.pas_encore_classe')}{tr(me.onlineWins > 1 ? 'app.victoire.p' : 'app.victoire', { onlineWins: me.onlineWins })} {me.onlineGames}</p>
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
  if (!l) return <p className="muted">{tr('app.chargement')}</p>;
  const n = l.group.length;
  const end = new Date(`${l.endsAt}T00:00:00`);
  return (
    <div className="league">
      <div className="league-head" style={{ ['--lc' as string]: LEAGUE_COLORS[l.league] }}>
        <span className="league-badge" aria-hidden />
        <div>
          <b>{tr('app.ligue')} {trServer(l.name)}</b>
          <span>{tr('app.se_termine_dimanche_soir')}{end.toLocaleDateString(loc(), { day: 'numeric', month: 'long' })}).</span>
        </div>
      </div>
      <p className="muted small">{tr('app.chaque_point_d_xp_gagne_cette_semain', { promote: l.promote })} {l.prizes.join(', ')} {tr('app.pieces_2')}{l.demote ? tr('app.les_derniers_redescendent', { demote: l.demote }) : ''}.</p>
      {n === 0 ? <Empty icon="trophy">{tr('app.jouez_une_partie_cette_semaine_pour_')}</Empty> : (
        <ol className="board league-board">
          {l.group.map((r) => {
            const zone = r.rank <= l.promote ? 'up' : l.demote && n >= 8 && r.rank > n - l.demote ? 'down' : '';
            return (
              <li key={r.username} className={`${r.me ? 'me ' : ''}${zone} clickable`} onClick={() => onOpen(r.username)}>
                <span className="b-rank">{r.rank}</span>
                <span className="b-name">{r.username}<small>{zone === 'up' ? tr('app.zone_de_montee') : zone === 'down' ? tr('app.zone_de_descente') : ''}</small></span>
                <span className="b-wins"><b>{r.xp}</b> <small>{tr('app.xp_2')}</small></span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
