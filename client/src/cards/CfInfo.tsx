import { cfText } from './i18n';
import { getLang, tr } from '../i18n/lang';
/**
 * Coups Fourrés : classement (ligue du mode), missions du jour et règles (tirées du livre de règles
 * validé par Sam et du catalogue : les chiffres viennent de CF_RULES, BOOSTER, CAPSULES).
 */
import { useEffect, useState } from 'react';
import { TYPE_META, TypeIcon } from './cardTypes';
import { BOOSTER, CAPSULES, CF_RULES, DECK_RULES, type CardFamily } from '../../../shared/cards/catalog';
import { CARDS, FAMILY_LABEL, TYPE_LABEL } from './i18n';
import { CF_DIVISIONS, CF_LEGEND_COUNT, CF_LEGEND_NAME, type CfLeagueBoard } from '../../../shared/cards/progress';
import { DEFAULT_CONFIG } from '../../../shared/config';
import { sound } from '../audio/sound';
import { askConfirm } from '../ui/confirm';
import { cfLeague, cfLegendPick, type CfState } from './api';
import { CardView, FamilyBadge } from './components';
import { Capsules, CfShell, DivisionShield, Pip, divisionProgress, seasonEndsIn, seasonName, useCfToast } from './cfui';

type Tok = string | null;

// ------------------------------------------------------------------------------------------------
// Classement

export function LeagueScreen({ token, state, onState, onBack, onAccount, username }: { token: Tok; state: CfState | null; onState: (s: CfState) => void; onBack: () => void; onAccount: () => void; username?: string }) {
  const [board, setBoard] = useState<CfLeagueBoard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, show] = useCfToast();
  useEffect(() => {
    if (!token) return;
    cfLeague(token).then(setBoard).catch((e) => setErr(e instanceof Error ? cfText(e.message) : tr('cf.info.classement_indisponible')));
  }, [token]);
  if (!token) {
    return (
      <CfShell title={tr('cf.info.classement')} sub={tr('cf.info.ligue_de_coups_fourres')} onBack={onBack}>
        <button className="cf-guest-card" onClick={onAccount}><b>{tr('cf.info.la_ligue_c_est_avec_un')}</b><small>{tr('cf.info.une_saison_par_mois_du_comptoir')}</small><em>{tr('cf.collection.creer_un_compte')}</em></button>
        <Divisions />
      </CfShell>
    );
  }
  const me = board?.me ?? state?.league ?? null;
  const prog = me ? divisionProgress(me.points) : null;
  const floorName = me ? cfText(CF_DIVISIONS.find((d) => d.min === me.floor)?.name ?? '') : null;
  const legends = CARDS.filter((c) => c.rarity === 'legendaire');
  return (
    <CfShell title={tr('cf.info.classement')} sub={me ? `${seasonName(me.season)} · ${seasonEndsIn(me.endsOn)}` : tr('cf.info.ligue_de_coups_fourres')} onBack={onBack}>
      {me && prog && (
        <section className="cf-myleague">
          <DivisionShield id={me.division} size={56} />
          <div>
            <b>{prog.name} · {me.points}{tr('cf.info.pts')}</b>
            <span className="cf-bar"><i style={{ width: `${prog.pct}%` }} /></span>
            <small>{prog.next ? tr('cf.info.pts_avant', { toNext: prog.toNext, next: prog.next }) : tr('cf.info.division_la_plus_haute')}{me.floor > 0 && floorName ? tr('cf.info.vous_ne_redescendrez_pas_sous_cette', { floorName: floorName }) : ''}</small>
            <small>{me.rank ? tr('cf.info.votre_place', { rank: me.rank, a: getLang() === 'fr' ? (me.rank === 1 ? 're' : 'e') : '' }) : tr('cf.info.pas_encore_classe_jouez_une_partie')} · {me.games}{tr('cf.info.partie')}{me.games > 1 ? 's' : ''}, {me.wins}{tr('cf.info.victoire')}{me.wins > 1 ? 's' : ''}</small>
          </div>
        </section>
      )}
      {state && state.legendPicks > 0 && (
        <section className="cf-legend-pick">
          <h3>{CF_LEGEND_NAME}{tr('cf.info.choisissez_votre_legendaire')}</h3>
          <div className="cf-grid" style={{ ['--w' as string]: '100px' }}>
            {legends.map((c) => <CardView key={c.id} id={c.id} width={100} onClick={async () => {
              if (!(await askConfirm(tr('cf.info.recevoir', { name: c.name }), tr('cf.info.choisir')))) return;
              try { const r = await cfLegendPick(token, c.id); onState(r.state); sound.bagReveal(3); show(tr('cf.info.rejoint_votre_collection', { name: c.name })); } catch (e) { show(e instanceof Error ? cfText(e.message) : tr('cf.info.erreur'), 'err'); }
            }} />)}
          </div>
        </section>
      )}
      <Divisions current={me?.division} />
      <section className="cf-top50">
        <h3>{tr('cf.info.les_50_meilleurs')}</h3>
        {err && <p className="cf-err">{err}</p>}
        {!board && !err && <p className="cf-muted">{tr('cf.info.chargement')}</p>}
        {board && !board.top.length && <p className="cf-muted">{tr('cf.info.personne_n_a_encore_joue_de')}</p>}
        <ol>
          {board?.top.map((r) => (
            <li key={r.username} className={r.username === username ? 'me' : ''}>
              <span className="cf-rank">{r.rank}</span>
              <DivisionShield id={r.division} size={20} legend={r.division === 'grand-cafe' && r.rank <= CF_LEGEND_COUNT} />
              <b>{r.username}</b>
              <small>{r.wins}/{r.games}</small>
              <em>{r.points}</em>
            </li>
          ))}
        </ol>
      </section>
      {toast}
    </CfShell>
  );
}

function Divisions({ current }: { current?: string }) {
  return (
    <section className="cf-divs">
      <h3>{tr('cf.info.divisions_et_recompenses_de_fin_de')}</h3>
      <ul>
        {[...CF_DIVISIONS].reverse().map((d) => (
          <li key={d.id} className={current === d.id ? 'on' : ''}>
            <DivisionShield id={d.id} size={26} />
            <span><b>{cfText(d.name)}</b><small>{tr('cf.info.des')}{d.min}{tr('cf.info.pts')}</small></span>
            <em>{d.boosters}{tr('cf.info.booster')}{d.boosters > 1 ? 's' : ''}{d.back ? tr('cf.info.dos', { a: d.back === 'anime' ? tr('cf.info.anime') : tr('cf.info.de_carte') }) : ''}{d.title ? tr('cf.info.titre') : ''}</em>
          </li>
        ))}
        <li className="legend"><DivisionShield id="grand-cafe" size={26} legend /><span><b>{CF_LEGEND_NAME}</b><small>{tr('cf.info.les')}{CF_LEGEND_COUNT}{tr('cf.info.premiers_du_grand_cafe')}</small></span><em>{tr('cf.info.1_legendaire_au_choix')}</em></li>
      </ul>
      <p className="cf-muted">{tr('cf.info.environ_25_points_par_victoire_et')}</p>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------
// Missions

export function MissionsList({ st, onAccount }: { st: CfState | null; onAccount: () => void }) {
  if (!st) return <button className="cf-guest-card" onClick={onAccount}><b>{tr('cf.info.missions_du_jour')}</b><small>{tr('cf.info.avec_un_compte_gratuit_3_missions')}</small><em>{tr('cf.collection.creer_un_compte')}</em></button>;
  return (
    <div className="cf-missions">
      {st.missions.map((m) => (
        <div key={m.id} className={`cf-mission${m.done ? ' done' : ''}`}>
          <span className="cf-mission-ic" aria-hidden>{m.done ? '✓' : ''}</span>
          <span className="cf-mission-text"><b>{cfText(m.text)}</b><span className="cf-bar"><i style={{ width: `${Math.min(100, (100 * m.progress) / m.target)}%` }} /></span><small>{Math.min(m.progress, m.target)}/{m.target}</small></span>
          <Capsules n={m.capsules} size={16} />
        </div>
      ))}
      <p className="cf-muted">{tr('cf.info.les_capsules_arrivent_toutes_seules_')}{st.firstWinToday ? tr('cf.info.deja_gagne_aujourd_hui') : ''}{tr('cf.info.contre_l_ordinateur')}{CAPSULES.vsBot}{tr('cf.info.capsules_par_partie')}{CAPSULES.vsBotDailyMax}{tr('cf.info.par_jour_au_plus')}{st.botCapsulesToday}{tr('cf.info.aujourd_hui')}</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Règles

export function RulesScreen({ onBack }: { onBack: () => void }) {
  return <CfShell title={tr('cf.info.regles')} sub={tr('cf.info.coups_fourres_le_421_aux_cartes')} onBack={onBack}><RulesContent /></CfShell>;
}

const FAMS: { f: CardFamily; text: string }[] = [
  { f: 'habitues', get text() { return tr('cf.info.des_allies_qui_s_installent_pour'); } },
  { f: 'ivresse', get text() { return tr('cf.info.des_des_qui_tournent_relancer_retour'); } },
  { f: 'pieges', get text() { return tr('cf.info.des_pieges_poses_face_cachee_qui'); } },
  { f: 'chaines', get text() { return tr('cf.info.des_cartes_qui_s_enchainent_pioche'); } },
];

export function RulesContent({ short }: { short?: boolean }) {
  const v = DEFAULT_CONFIG.values;
  const R = CF_RULES;
  return (
    <div className="cf-rules">
      <section>
        <h3>{tr('cf.info.le_but')}</h3>
        <p>{tr('cf.info.on_joue_au_421_en')}<b>{tr('cf.info.decharge')}</b>{tr('cf.info.chacun_commence_avec')}<b>{R.startTokens}{tr('cf.info.jetons')}</b> ({R.startTokensMulti}{tr('cf.info.a_3_ou_4_joueurs_le')}{R.maxRounds}{tr('cf.info.e_manche_le_bistrot_ferme_celui')}</p>
        <p>{tr('cf.info.les_combinaisons_sont_celles_du_421')}{v.v421}{tr('cf.info.trois_as')}{v.v111}{tr('cf.info.deux_as_x_vaut_x_brelan')}{v.suite}{tr('cf.info.le_reste')}{v.autre}{tr('cf.info.la_nenette_2_2_1_est')}{v.nenetteMin}.</p>
      </section>
      {!short && (
        <section>
          <h3>{tr('cf.info.les_combinaisons')}</h3>
          <ul className="cf-rules-combos">
            {([[[4, 2, 1], '4-2-1', v.v421], [[1, 1, 1], tr('cf.info.trois_as_2'), v.v111], [[1, 1, 5], tr('cf.info.deux_as_x'), tr('cf.info.x_ici_5')], [[6, 6, 6], tr('cf.info.brelan_de_x'), tr('cf.info.x_ici_6')], [[3, 4, 5], tr('cf.info.suite'), v.suite], [[6, 5, 2], tr('cf.info.le_reste_2'), v.autre], [[2, 2, 1], tr('cf.info.nenette_la_plus_faible'), tr('cf.info.son_perdant_recoit_au_moins', { nenetteMin: v.nenetteMin })]] as [number[], string, string | number][]).map(([d, n, val]) => (
              <li key={n}><span className="cf-rules-dice">{d.map((x, i) => <Pip key={i} v={x} size={20} />)}</span><b>{n}</b><em>{typeof val === 'number' ? tr('cf.vaut' as never, { v: val }) : val}</em></li>
            ))}
          </ul>
          <p className="cf-muted">{tr('cf.info.du_plus_fort_au_plus_faible')}</p>
        </section>
      )}
      <section>
        <h3>{tr('cf.boardparts.une_manche')}</h3>
        <ol>
          <li><b>{tr('cf.info.service')}</b>{tr('cf.info.chacun_pioche_1_carte_et_recoit')}{R.tourneesPerRound}{tr('cf.boardparts.tournee')}{R.tourneesPerRound > 1 ? 's' : ''} ({R.tourneesPerRound + R.tourneesLoserBonus}{tr('cf.info.pour_le_perdant_de_la_manche')}{R.tourneesMax}{tr('cf.info.au_plus_pour_economiser_en_vue')}</li>
          <li><b>{tr('cf.boardparts.le_meneur')}</b>{tr('cf.info.lance_les_3_des_jusqu_a')}{R.maxThrows}{tr('cf.info.fois_garde_des_des_entre_deux')}</li>
          <li><b>{tr('cf.info.l_autre_joueur')}</b>{tr('cf.info.joue_a_son_tour_en_voyant')}</li>
          <li><b>{tr('cf.boardparts.dernier_mot')}</b>{tr('cf.info.les_combinaisons_sont_sur_la_table')}</li>
          <li><b>{tr('cf.boardparts.comptes')}</b>{tr('cf.info.le_gagnant_donne_au_perdant_autant')}</li>
          <li><b>{tr('cf.info.fin_de_manche')}</b>{tr('cf.info.le_perdant_mene_la_manche_suivante')}</li>
          <li><b>{tr('cf.boardparts.commande_du_comptoir')}</b>{tr('cf.info.au_debut_de_chaque_manche_une')}</li>
        </ol>
      </section>
      <section>
        <h3>{tr('cf.info.les_cartes')}</h3>
        <ul className="cf-rules-types">
          <li><b className="cfn-typetag" style={{ color: TYPE_META['coup'].color }}><TypeIcon type="coup" size={14} />{TYPE_LABEL.coup}</b>{tr('cf.info.pendant_votre_tour_avant_ou_apres')}</li>
          <li><b className="cfn-typetag" style={{ color: TYPE_META['piege'].color }}><TypeIcon type="piege" size={14} />{TYPE_LABEL.piege}</b>{tr('cf.info.pose_face_cachee_pendant_votre_tour')}{R.maxTrapsOn}{tr('cf.info.pieges_au_plus_devant_un_meme')}{R.maxTraps}{tr('cf.info.poses_au_plus_par_joueur_un')}{R.trapReturnRounds}{tr('cf.info.manches_revient_dans_votre_main')}</li>
          <li><b className="cfn-typetag" style={{ color: TYPE_META['riposte'].color }}><TypeIcon type="riposte" size={14} />{TYPE_LABEL.riposte}</b>{tr('cf.info.a_tout_moment_en_reponse_a')}</li>
          <li><b className="cfn-typetag" style={{ color: TYPE_META['dernier-mot'].color }}><TypeIcon type="dernier-mot" size={14} />{TYPE_LABEL['dernier-mot']}</b>{tr('cf.info.seulement_pendant_l_etape_dernier_mo')}</li>
          <li><b className="cfn-typetag" style={{ color: TYPE_META['habitue'].color }}><TypeIcon type="habitue" size={14} />{TYPE_LABEL.habitue}</b>{tr('cf.info.s_installe_devant_vous_pour')}{R.habitueRounds}{tr('cf.info.manches_celle_ou_il_arrive_comprise')}{R.maxHabitues}{tr('cf.info.au_plus_jamais_deux_fois_le')}</li>
        </ul>
        <p>{tr('cf.info.chaque_carte_coute_des')}<b>{tr('cf.boardparts.tournees')}</b>{tr('cf.info.le_chiffre_dans_le_petit_verre')}</p>
      </section>
      {!short && (
        <section>
          <h3>{tr('cf.info.les_quatre_familles')}</h3>
          {FAMS.map(({ f, text }) => <p key={f} className="cf-rules-fam"><FamilyBadge family={f} /> <span>{text}</span></p>)}
        </section>
      )}
      {!short && (
        <section>
          <h3>{tr('cf.info.fin_de_partie')}</h3>
          <p>{tr('cf.info.des_qu_un_joueur_n_a')}{R.maxRounds}{tr('cf.info.e_manche_celui_qui_a_le')}</p>
        </section>
      )}
      <section>
        <h3>{tr('cf.info.petits_plus')}</h3>
        <ul>
          <li><b>{tr('cf.boardparts.main_de_depart')}</b>{tr('cf.info.on_pioche')}{R.startHand}{tr('cf.info.cartes_et_on_peut_en_renvoyer')}{R.mulligan}{tr('cf.info.sous_le_deck_pour_en_repiocher')}</li>
          <li><b>{tr('cf.info.deck_vide')}</b>{tr('cf.info.on_remelange_sa_defausse_et_on')}{R.reshufflePenalty}{tr('cf.info.jeton')}</li>
          <li><b>{tr('cf.info.temps')}</b> : {R.decisionSeconds}{tr('cf.info.secondes_par_decision_plus_une_reser')}{R.reserveSeconds}{tr('cf.info.secondes_pour_la_partie')}</li>
          <li><b>{tr('cf.info.le_perdant_se_refait')}</b>{tr('cf.info.1_tournee_au_perdant_de_la')}</li>
        </ul>
      </section>
      {!short && (
        <>
          <section>
            <h3>{tr('cf.info.a_3_ou_4_entre_amis')}</h3>
            <p>{R.startTokensMulti}{tr('cf.info.jetons_chacun_le_premier_a_0')}</p>
          </section>
          <section>
            <h3>{tr('cf.info.deck_et_collection')}</h3>
            <ul>
              <li>{tr('cf.info.un_deck_compte')}<b>{R.deckSize}{tr('cf.info.cartes')}</b> : {R.maxCopies}{tr('cf.info.exemplaires_au_plus_de_chaque_carte')}<b>{DECK_RULES.maxFamilies}{tr('cf.info.familles_au_plus')}</b>{tr('cf.info.et')}<b>{tr('cf.info.une_seule_legendaire')}</b>{tr('cf.info.pour_qu_aucun_deck_ne_reunisse')}</li>
              <li>{tr('cf.info.booster')}{BOOSTER.size}{tr('cf.info.cartes_au_pur_hasard_pour')}{BOOSTER.price}{tr('cf.info.capsules_communes_70_rares_22_epique')}</li>
              <li>{tr('cf.info.doublons_en_trop_eclats_de_verre')}</li>
              <li>{tr('cf.info.capsules_victoire_classee')}{CAPSULES.rankedWin}{tr('cf.info.defaite_classee_jouee_jusqu_au_bout')}{CAPSULES.rankedLoss}{tr('cf.info.contre_l_ordinateur_2')}{CAPSULES.vsBot} ({CAPSULES.vsBotDailyMax}{tr('cf.info.par_jour_au_plus_missions_du')}</li>
            </ul>
          </section>
          <section>
            <h3>{tr('cf.info.les')}{CARDS.length}{tr('cf.info.cartes')}</h3>
            <p className="cf-muted">{tr('cf.info.retrouvez_les_toutes_avec_leur_texte')}{Object.values(FAMILY_LABEL).join(', ')}.</p>
          </section>
        </>
      )}
    </div>
  );
}
