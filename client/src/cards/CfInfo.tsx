/**
 * Coups Fourrés : classement (ligue du mode), missions du jour et règles (tirées du livre de règles
 * validé par Sam et du catalogue : les chiffres viennent de CF_RULES, BOOSTER, CAPSULES).
 */
import { useEffect, useState } from 'react';
import { BOOSTER, CAPSULES, CARDS, CF_RULES, FAMILY_LABEL, TYPE_LABEL, type CardFamily } from '../../../shared/cards/catalog';
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
    cfLeague(token).then(setBoard).catch((e) => setErr(e instanceof Error ? e.message : 'Classement indisponible.'));
  }, [token]);
  if (!token) {
    return (
      <CfShell title="Classement" sub="Ligue de Coups Fourrés" onBack={onBack}>
        <button className="cf-guest-card" onClick={onAccount}><b>La ligue, c’est avec un compte</b><small>Une saison par mois, du Comptoir au Grand Café, et des boosters à la fin de chaque saison.</small><em>Créer un compte</em></button>
        <Divisions />
      </CfShell>
    );
  }
  const me = board?.me ?? state?.league ?? null;
  const prog = me ? divisionProgress(me.points) : null;
  const floorName = me ? CF_DIVISIONS.find((d) => d.min === me.floor)?.name : null;
  const legends = CARDS.filter((c) => c.rarity === 'legendaire');
  return (
    <CfShell title="Classement" sub={me ? `${seasonName(me.season)} · ${seasonEndsIn(me.endsOn)}` : 'Ligue de Coups Fourrés'} onBack={onBack}>
      {me && prog && (
        <section className="cf-myleague">
          <DivisionShield id={me.division} size={56} />
          <div>
            <b>{prog.name} · {me.points} pts</b>
            <span className="cf-bar"><i style={{ width: `${prog.pct}%` }} /></span>
            <small>{prog.next ? `${prog.toNext} pts avant ${prog.next}` : 'Division la plus haute'}{me.floor > 0 && floorName ? ` · vous ne redescendrez pas sous ${floorName} cette saison` : ''}</small>
            <small>{me.rank ? `Votre place : ${me.rank}${me.rank === 1 ? 're' : 'e'}` : 'Pas encore classé : jouez une partie classée'} · {me.games} partie{me.games > 1 ? 's' : ''}, {me.wins} victoire{me.wins > 1 ? 's' : ''}</small>
          </div>
        </section>
      )}
      {state && state.legendPicks > 0 && (
        <section className="cf-legend-pick">
          <h3>{CF_LEGEND_NAME} : choisissez votre légendaire</h3>
          <div className="cf-grid" style={{ ['--w' as string]: '100px' }}>
            {legends.map((c) => <CardView key={c.id} id={c.id} width={100} onClick={async () => {
              if (!(await askConfirm(`Recevoir « ${c.name} » ?`, 'Choisir'))) return;
              try { const r = await cfLegendPick(token, c.id); onState(r.state); sound.bagReveal(3); show(`« ${c.name} » rejoint votre collection.`); } catch (e) { show(e instanceof Error ? e.message : 'Erreur', 'err'); }
            }} />)}
          </div>
        </section>
      )}
      <Divisions current={me?.division} />
      <section className="cf-top50">
        <h3>Les 50 meilleurs</h3>
        {err && <p className="cf-err">{err}</p>}
        {!board && !err && <p className="cf-muted">Chargement…</p>}
        {board && !board.top.length && <p className="cf-muted">Personne n’a encore joué de partie classée cette saison : à vous l’honneur.</p>}
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
      <h3>Divisions et récompenses de fin de saison</h3>
      <ul>
        {[...CF_DIVISIONS].reverse().map((d) => (
          <li key={d.id} className={current === d.id ? 'on' : ''}>
            <DivisionShield id={d.id} size={26} />
            <span><b>{d.name}</b><small>dès {d.min} pts</small></span>
            <em>{d.boosters} booster{d.boosters > 1 ? 's' : ''}{d.back ? ` · dos ${d.back === 'anime' ? 'animé' : 'de carte'}` : ''}{d.title ? ' · titre' : ''}</em>
          </li>
        ))}
        <li className="legend"><DivisionShield id="grand-cafe" size={26} legend /><span><b>{CF_LEGEND_NAME}</b><small>les {CF_LEGEND_COUNT} premiers du Grand Café</small></span><em>+1 légendaire au choix</em></li>
      </ul>
      <p className="cf-muted">Environ +25 points par victoire et −20 par défaite (plus ou moins selon l’écart). Nouvelle saison chaque mois : on redescend de deux divisions.</p>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------
// Missions

export function MissionsList({ st, onAccount }: { st: CfState | null; onAccount: () => void }) {
  if (!st) return <button className="cf-guest-card" onClick={onAccount}><b>Missions du jour</b><small>Avec un compte gratuit : 3 missions par jour, de 20 à 40 capsules chacune.</small><em>Créer un compte</em></button>;
  return (
    <div className="cf-missions">
      {st.missions.map((m) => (
        <div key={m.id} className={`cf-mission${m.done ? ' done' : ''}`}>
          <span className="cf-mission-ic" aria-hidden>{m.done ? '✓' : ''}</span>
          <span className="cf-mission-text"><b>{m.text}</b><span className="cf-bar"><i style={{ width: `${Math.min(100, (100 * m.progress) / m.target)}%` }} /></span><small>{Math.min(m.progress, m.target)}/{m.target}</small></span>
          <Capsules n={m.capsules} size={16} />
        </div>
      ))}
      <p className="cf-muted">Les capsules arrivent toutes seules quand une mission est faite. Première victoire du jour : 1 booster{st.firstWinToday ? ' (déjà gagné aujourd’hui)' : ''}. Contre l’ordinateur : {CAPSULES.vsBot} capsules par partie, {CAPSULES.vsBotDailyMax} par jour au plus ({st.botCapsulesToday} aujourd’hui).</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Règles

export function RulesScreen({ onBack }: { onBack: () => void }) {
  return <CfShell title="Règles" sub="Coups Fourrés, le 421 aux cartes" onBack={onBack}><RulesContent /></CfShell>;
}

const FAMS: { f: CardFamily; text: string }[] = [
  { f: 'habitues', text: 'Des alliés qui restent en jeu (Habitués), des Tournées et de quoi annuler les petits coups.' },
  { f: 'ivresse', text: 'Des dés qui tournent : relancer, retourner, parier… et frapper fort quand on joue en second.' },
  { f: 'pieges', text: 'Des pièges posés face cachée, qui se déclenchent tout seuls chez l’adversaire. Et la Fouine pour les trouver.' },
  { f: 'chaines', text: 'Des cartes qui s’enchaînent : pioche, réductions, retouches de dés, ripostes de plus en plus fortes.' },
];

export function RulesContent({ short }: { short?: boolean }) {
  const v = DEFAULT_CONFIG.values;
  const R = CF_RULES;
  return (
    <div className="cf-rules">
      <section>
        <h3>Le but</h3>
        <p>On joue au 421 en <b>décharge</b> : chacun commence avec <b>{R.startTokens} jetons</b> ({R.startTokensMulti} à 3 ou 4 joueurs). Le premier à n’avoir plus aucun jeton gagne. Après la {R.maxRounds}e manche, le bistrot ferme : celui qui a le moins de jetons gagne.</p>
        <p>Les combinaisons sont celles du 421 : 4-2-1 vaut {v.v421}, trois as {v.v111}, deux as + x vaut x, brelan de x vaut x, suite {v.suite}, le reste {v.autre}. La nénette (2-2-1) est la plus faible : son perdant reçoit au moins {v.nenetteMin}.</p>
      </section>
      {!short && (
        <section>
          <h3>Les combinaisons</h3>
          <ul className="cf-rules-combos">
            {([[[4, 2, 1], '4-2-1', v.v421], [[1, 1, 1], 'Trois as', v.v111], [[1, 1, 5], 'Deux as + x', 'x (ici 5)'], [[6, 6, 6], 'Brelan de x', 'x (ici 6)'], [[3, 4, 5], 'Suite', v.suite], [[6, 5, 2], 'Le reste', v.autre], [[2, 2, 1], 'Nénette (la plus faible)', `son perdant reçoit au moins ${v.nenetteMin}`]] as [number[], string, string | number][]).map(([d, n, val]) => (
              <li key={n}><span className="cf-rules-dice">{d.map((x, i) => <Pip key={i} v={x} size={20} />)}</span><b>{n}</b><em>{typeof val === 'number' ? `vaut ${val}` : val}</em></li>
            ))}
          </ul>
          <p className="cf-muted">Du plus fort au plus faible. La valeur est le nombre de jetons que le gagnant donne au perdant (avant les cartes).</p>
        </section>
      )}
      <section>
        <h3>Une manche</h3>
        <ol>
          <li><b>Service</b> : chacun pioche 1 carte et reçoit {R.tourneesPerRound} Tournées ({R.tourneesPerRound + R.tourneesLoserBonus} pour le perdant de la manche d’avant). Réserve : {R.tourneesMax} au plus.</li>
          <li><b>Le meneur</b> lance les 3 dés jusqu’à {R.maxThrows} fois, garde des dés entre deux lancers, et peut jouer des cartes avant ou après chaque lancer. Son nombre de lancers fixe le maximum de l’autre.</li>
          <li><b>L’autre joueur</b> joue à son tour, en voyant le résultat du meneur.</li>
          <li><b>Dernier mot</b> : les combinaisons sont sur la table ; celui qui perd peut jouer une carte « Dernier mot », l’autre peut répondre, jusqu’à ce que les deux passent.</li>
          <li><b>Comptes</b> : le gagnant donne au perdant autant de jetons que vaut sa combinaison, cartes comprises. Égalité parfaite : rien.</li>
          <li><b>Fin de manche</b> : {R.handMax} cartes en main au plus (défausse au choix). Le perdant mène la manche suivante.</li>
        </ol>
      </section>
      <section>
        <h3>Les cartes</h3>
        <ul className="cf-rules-types">
          <li><b>{TYPE_LABEL.coup}</b> : pendant votre tour, avant ou après un lancer. Puis défaussé.</li>
          <li><b>{TYPE_LABEL.piege}</b> : posé face cachée pendant votre tour (on paie à la pose). Il se déclenche tout seul quand sa condition arrive chez l’adversaire. {R.maxTraps} pièges posés au plus ; un piège qui ne s’est pas déclenché en {R.trapReturnRounds} manches revient dans votre main.</li>
          <li><b>{TYPE_LABEL.riposte}</b> : à tout moment, en réponse à une carte adverse. En chaîne, la dernière posée s’applique la première.</li>
          <li><b>{TYPE_LABEL['dernier-mot']}</b> : seulement pendant l’étape Dernier mot.</li>
          <li><b>{TYPE_LABEL.habitue}</b> : s’installe devant vous et reste en jeu, effet permanent. {R.maxHabitues} au plus.</li>
        </ul>
        <p>Chaque carte coûte des <b>Tournées</b> (la pastille dorée). On voit les Tournées de l’adversaire, son nombre de cartes en main, ses pièges posés et les familles de son deck… mais pas lesquels.</p>
      </section>
      {!short && (
        <section>
          <h3>Les quatre familles</h3>
          {FAMS.map(({ f, text }) => <p key={f} className="cf-rules-fam"><FamilyBadge family={f} /> <span>{text}</span></p>)}
        </section>
      )}
      {!short && (
        <section>
          <h3>Fin de partie</h3>
          <p>Dès qu’un joueur n’a plus aucun jeton, il gagne. Si la partie dure, le bistrot ferme après la {R.maxRounds}e manche : celui qui a le moins de jetons l’emporte. En classée, quitter la partie compte comme une défaite ; après une déconnexion, vous avez 60 secondes pour revenir.</p>
        </section>
      )}
      <section>
        <h3>Petits plus</h3>
        <ul>
          <li><b>Main de départ</b> : on pioche {R.startHand} cartes et on peut en renvoyer jusqu’à {R.mulligan} sous le deck pour en repiocher autant, une fois.</li>
          <li><b>L’ardoise</b> : une fois par partie, empruntez {R.ardoiseLoan} Tournées tout de suite ; vous ne recevrez rien à la manche suivante.</li>
          <li><b>Deck vide</b> : on remélange sa défausse et on reçoit {R.reshufflePenalty} jeton.</li>
          <li><b>Temps</b> : {R.decisionSeconds} secondes par décision, plus une réserve de {R.reserveSeconds} secondes pour la partie.</li>
          <li><b>Le perdant se refait</b> : +1 Tournée au perdant de la manche précédente.</li>
        </ul>
      </section>
      {!short && (
        <>
          <section>
            <h3>À 3 ou 4 entre amis</h3>
            <p>{R.startTokensMulti} jetons chacun ; le premier à 0 gagne, puis on continue pour les places. On joue du meneur dans le sens des aiguilles d’une montre, chacun voit les combinaisons déjà faites. Seul le plus mauvais de la manche reçoit des jetons, du meilleur. Une carte contre « l’adversaire » vise le joueur de votre choix ; un piège se pose devant un joueur précis.</p>
          </section>
          <section>
            <h3>Deck et collection</h3>
            <ul>
              <li>Un deck compte <b>{R.deckSize} cartes</b> : {R.maxCopies} exemplaires au plus, une seule par légendaire. Jusqu’à 5 decks.</li>
              <li>Booster : {BOOSTER.size} cartes au pur hasard pour {BOOSTER.price} capsules (communes 70 %, rares 22 %, épiques 6,5 %, légendaires 1,5 %), une chance sur vingt par carte d’être brillante.</li>
              <li>Doublons en trop → éclats de verre, pour fabriquer la carte de votre choix.</li>
              <li>Capsules : victoire classée {CAPSULES.rankedWin}, défaite classée jouée jusqu’au bout {CAPSULES.rankedLoss}, contre l’ordinateur {CAPSULES.vsBot} ({CAPSULES.vsBotDailyMax} par jour au plus), missions du jour, première victoire du jour = 1 booster.</li>
            </ul>
          </section>
          <section>
            <h3>Les {CARDS.length} cartes</h3>
            <p className="cf-muted">Retrouvez-les toutes, avec leur texte complet, dans la Collection. Familles : {Object.values(FAMILY_LABEL).join(', ')}.</p>
          </section>
        </>
      )}
    </div>
  );
}
