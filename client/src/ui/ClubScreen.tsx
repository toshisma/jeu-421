import { tr } from '../i18n/lang';
import { useEffect, useState } from 'react';
import { askConfirm } from './confirm';
import { PHRASES } from '../../../shared/protocol';
import { CLUB_CHEST } from '../../../shared/progress/profile';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { Icon } from './Icon';
import { ProfileView } from './ProfileView';
import { ReportDialog, ReportMsgButton, type ReportTarget } from './Report';
import { BigAction, Empty, Section, Shell, Tabs, useToast } from './kit';

interface Club {
  id: string; name: string; emblem: string; max: number; wins: number; endsAt: string;
  chest: { wins: number; coins: number }[];
  members: { username: string; wins: number; level: number; owner: boolean; me: boolean }[];
  chat: { id: number; username: string; phrase: string; at: number }[];
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
  const [report, setReport] = useState<ReportTarget | null>(null);

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
      <Shell title={tr('app.clubs')} onBack={onBack} icon="club" foot={<BigAction icon="key" tone="gold" label={tr('app.creer_un_compte_ou_se_connecter')} sub={tr('app.gratuit_sans_adresse_e_mail')} onClick={onAccount} />}>
        <Empty icon="club">{tr('app.un_club_c_est_votre_equipe_de')}</Empty>
      </Shell>
    );
  }

  if (mine) {
    const reached = [...mine.chest].reverse().find((t) => mine.wins >= t.wins);
    const next = mine.chest.find((t) => mine.wins < t.wins);
    const maxWins = mine.chest[mine.chest.length - 1].wins;
    return (
      <Shell title={`${mine.emblem} ${mine.name}`} onBack={onBack} wide sub={`${mine.members.length}/${mine.max} membres · ${mine.wins} victoire${mine.wins > 1 ? 's' : ''} cette semaine`}>
        <Tabs label={tr('app.club')} value={clubTab} onChange={setClubTab}
          options={[{ v: 'coffre', label: tr('app.coffre'), icon: 'chest' }, { v: 'membres', label: tr('app.membres'), icon: 'people', badge: mine.members.length }, { v: 'comptoir', label: tr('app.comptoir'), icon: 'chat' }]} />
        {clubTab === 'coffre' && (
          <div className="chest">
            <div className="chest-head"><b>{tr('app.coffre_de_la_semaine')}</b><span>{mine.wins} {tr(mine.wins > 1 ? 'app.victoire_3.p' : 'app.victoire_3')}</span></div>
            <div className="chest-bar">
              <i style={{ width: `${Math.min(100, (100 * mine.wins) / maxWins)}%` }} />
              {mine.chest.map((t) => <span key={t.wins} className={mine.wins >= t.wins ? 'on' : ''} style={{ left: `${(100 * t.wins) / maxWins}%` }}>{t.coins}</span>)}
            </div>
            <p className="k-hint">
              {next ? tr(next.wins - mine.wins > 1 ? 'app.encore_victoire_du_club_pour_pieces_.p' : 'app.encore_victoire_du_club_pour_pieces_', { v: next.wins - mine.wins, coins: next.coins }) : tr('app.coffre_plein')}
              {reached ? tr('app.deja_acquis_pieces_pour_chaque_membr', { coins: reached.coins }) : ''}
              {' '}{tr('app.ouverture_dimanche_soir')}
            </p>
          </div>
        )}
        {clubTab === 'membres' && <>
          <ol className="board">
            {mine.members.map((m, i) => (
              <li key={m.username} className={`${m.me ? 'me ' : ''}clickable`} onClick={() => setOpen(m.username)}>
                <span className="b-rank">{i + 1}</span>
                <span className="b-name">{m.username}<small>{tr('app.niveau_3')} {m.level}{m.owner ? tr('app.fondateur') : ''}</small></span>
                <span className="b-wins"><b>{m.wins}</b> <small>{tr('app.vict')}</small></span>
              </li>
            ))}
          </ol>
          <div className="club-leave">
            <button className="btn ghost danger" onClick={async () => { if (await askConfirm(tr('app.quitter_le_club_2'), tr('app.quitter'))) void run(() => api('/clubs/leave', { body: {}, token }), tr('app.vous_avez_quitte_le_club')); }}>{tr('app.quitter_le_club')}</button>
          </div>
        </>}
        {clubTab === 'comptoir' && <>
          <ul className="club-chat" aria-live="polite">
            {mine.chat.length === 0 && <li className="muted">{tr('app.personne_n_a_encore_parle_cette_sema')}</li>}
            {mine.chat.map((c, i) => <li key={c.id ?? i}><span><b>{c.username}</b> {c.phrase}</span>
              {c.id && c.username !== pa.session?.username && <ReportMsgButton name={c.username} onClick={() => setReport({ username: c.username, message: { place: 'club', id: c.id, text: c.phrase } })} />}</li>)}
          </ul>
          <p className="k-hint">{tr('app.touchez_une_phrase_pour_l_envoyer_au')}</p>
          <div className="phrase-chips">
            {PHRASES.map((p) => <button key={p} className="chip" onClick={() => void run(() => api('/clubs/chat', { body: { phrase: p }, token }))}>{p}</button>)}
          </div>
        </>}
        {err && <p className="error">{err}</p>}
        {open && <ProfileView pa={pa} username={open} onClose={() => setOpen(null)} />}
        {report && <ReportDialog pa={pa} target={report} onClose={() => setReport(null)} />}
        {toast}
      </Shell>
    );
  }

  const canFound = name.trim().length >= 3 && pa.profile.coins >= cost;
  return (
    <Shell title={tr('app.clubs')} onBack={onBack} icon="club" wide sub={tr('app.une_equipe_un_coffre_commun_chaque_s')}>
      <Tabs label={tr('app.clubs')} value={joinTab} onChange={setJoinTab}
        options={[{ v: 'rejoindre', label: tr('app.rejoindre'), icon: 'people' }, { v: 'fonder', label: tr('app.fonder'), icon: 'plus' }]} />
      {joinTab === 'rejoindre' ? <>
        <p className="k-hint club-help">{tr('app.chaque_victoire_d_un_membre_remplit_')}{CLUB_CHEST.map((t) => `${t.wins} victoires : ${t.coins} pièces`).join(', ')} {tr('app.pour_chacun')}</p>
        <form className="hub-code friend-search" onSubmit={(e) => { e.preventDefault(); load(q); }}>
          <Icon name="search" size={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('app.chercher_un_club')} maxLength={24} aria-label={tr('app.chercher_un_club')} />
          <button className="btn small">{tr('app.chercher')}</button>
        </form>
        <Section title={tr('app.clubs_de_la_semaine')} count={top?.length}>
          {top && top.length === 0 && <Empty icon="club" action={<button className="btn small" onClick={() => setJoinTab('fonder')}>{tr('app.fonder_un_club')}</button>}>{tr('app.aucun_club_pour_l_instant_fondez_le')}</Empty>}
          <ul className="hub-list">
            {top?.map((c, i) => (
              <li key={c.id}>
                <span className="club-emblem">{c.emblem}</span>
                <div className="l-main"><b>{i + 1}. {c.name}</b><small>{c.members} {tr(c.members > 1 ? 'app.m_members.p' : 'app.m_members')} · {tr(c.wins > 1 ? 'app.m_wins.p' : 'app.m_wins', { wins: c.wins })} {tr('app.m_thisweek')}</small></div>
                <button className="btn small primary" disabled={c.members >= 30} onClick={() => void run(() => api('/clubs/join', { body: { id: c.id }, token }), tr('app.bienvenue_au_club', { name: c.name }))}>{c.members >= 30 ? tr('app.complet') : tr('app.rejoindre')}</button>
              </li>
            ))}
          </ul>
        </Section>
      </> : (
        <div className="k-form">
          <label className="k-field"><span className="k-label">{tr('app.nom_du_club')}</span>
            <input className="k-input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder={tr('app.le_pot_au_lait')} /></label>
          <div className="k-field"><span className="k-label">{tr('app.embleme')}</span>
            <div className="avatars">{emblems.map((e) => <button type="button" key={e} className={e === emblem ? 'on' : ''} onClick={() => setEmblem(e)} aria-label={tr('app.embleme_2', { e })}>{e}</button>)}</div>
          </div>
          <BigAction icon="plus" tone="gold" disabled={!canFound} label={tr('app.fonder_pour_pieces', { cost })}
            sub={pa.profile.coins < cost ? tr('app.il_vous_faut_pieces_vous_en_avez', { cost, coins: pa.profile.coins }) : name.trim().length < 3 ? tr('app.choisissez_un_nom_3_lettres_au_moins') : `${emblem} ${name.trim()}`}
            onClick={() => void run(async () => { await api('/clubs', { body: { name, emblem }, token }); }, tr('app.club_fonde'))} />
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {toast}
    </Shell>
  );
}
