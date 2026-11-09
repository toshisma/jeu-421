import { cfText } from './i18n';
import { getLang, tr, useLang } from '../i18n/lang';
/**
 * Coups Fourrés : le mode cartes (écran unique chargé à la demande depuis App.tsx).
 * Menu du mode (prototype CFMenu validé par Sam), découverte, et navigation interne vers
 * boosters, collection, decks, classement, règles et parties.
 *
 * Fonctions communes du jeu gardées à l'identique : Messages, Amis, Notifications, profil.
 * Seuls changent la monnaie (capsules), le classement (ligue du mode) et les parties.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ProfileApi } from '../account/useProfile';
import { ApiError } from '../account/api';
import type { CfFriendPresence } from '../../../shared/cards/protocol';
import type { Settings } from '../settings';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { FriendsButton } from '../ui/Friends';
import { Sheet } from '../ui/kit';
import { ModeBar, ModeChip } from '../ui/ModeBar';
import { sound } from '../audio/sound';
import { BOOSTER, CF_RULES, STARTER_DECKS, CAPSULES } from '../../../shared/cards/catalog';
import { CARDS } from './i18n';
import type { CfGameView } from '../../../shared/cards/progress';
import { CF_LEVEL_LABEL, type CfLevel } from '../../../shared/cards/ai';
import { cfBuyBooster, cfDiscover, cfFriends, cfMe, type CfState } from './api';
import { BoosterPack, CardBack, CardView } from './components';
import { Capsules, DivisionShield, WaitingOverlay, divisionProgress, seasonEndsIn, seasonName, useCfToast } from './cfui';
import { PARCOURS, parcoursStepOf } from '../../../shared/cards/parcours';
import { screenTour } from './tour';
import { CF_BOTS, LocalCfController, deckList } from './local';
import type { CfController } from './controller';
import { CfOnline, type CfOnlineController } from './online';
import { CfGame } from './CfGame';
import { CfChatPanel } from './CfChat';
import { BoosterOpening, CollectionScreen } from './CfCollection';
import { DeckEditor, DecksScreen } from './CfDecks';
import { LeagueScreen, MissionsList, RulesScreen } from './CfInfo';
import { CardsCatalogScreen, LearnBlock, LearnHero, LexiconScreen, TipsScreen } from './CfLearn';
import { TutorialCfController, markTutorialSeen, tutorialSeen } from './tutorial';
import { askConfirm } from '../ui/confirm';
import { TournamentCard, TournamentScreen } from './CfTournament';
import { EnigmeEntry, EnigmeScreen } from './CfEnigme';
import './fonts';
import { trackEvent } from '../visit';
import { CardZoomHost } from './zoom';
import { usePresenceLayer } from '../presence';
import { DeckBadge, DeckChoiceSheet, DeckPicker, type DeckOption } from './DeckPicker';

export interface CfModeProps {
  pa: ProfileApi;
  settings: Settings;
  onSettings: (s: Settings) => void;
  avatar: string;
  displayName: string;
  /** Retour au menu principal. */
  onHome: () => void;
  /** Liste d'amis (bouton de l'en-tête : défier un ami, le regarder jouer). */
  onFriends: () => void;
  onAccount: () => void;
  onLogin: () => void;
  /** Sacs de dés gagnés en fin de partie : la collection de dés (commune aux trois jeux) s'ouvre dessus. */
  onBags?: () => void;
  /** À faire dès l'ouverture (venu de la liste d'amis) : défier ce pseudo, ou regarder cette partie. */
  pending?: { challenge?: string; watch?: string; tournoi?: boolean; boosters?: boolean };
}

type Route =
  | { r: 'menu' }
  | { r: 'discover' }
  | { r: 'booster' }
  | { r: 'collection' }
  | { r: 'decks' }
  | { r: 'deck'; id: string | null; cards?: Record<string, number>; name?: string }
  | { r: 'league' }
  | { r: 'rules' }
  | { r: 'cards' }
  | { r: 'tips' }
  | { r: 'lexicon' }
  | { r: 'tournoi' }
  | { r: 'enigme' }
  | { r: 'game'; ctrl: CfController; mode: string; again?: () => void; online?: boolean };

/** Pages du mode → vue de présence (voir server/live.ts). */
const CF_VIEWS: Partial<Record<Route['r'], string>> = {
  discover: 'regles', booster: 'boosters', collection: 'collection', decks: 'decks', deck: 'decks', league: 'ligue',
  rules: 'regles', cards: 'regles', tips: 'regles', lexicon: 'regles', tournoi: 'tournoi', enigme: 'enigme',
};

type SheetKind = 'bot' | 'friends' | 'boosters' | 'missions' | 'learn' | null;

/** Amis présents dans le mode (bandeau « Dédé est dans Coups Fourrés · Défier »). */
type CfFriend = CfFriendPresence;
function useCfFriends(token: string | null): CfFriend[] | null {
  const [list, setList] = useState<CfFriend[] | null>(null);
  useEffect(() => {
    if (!token) { setList(null); return; }
    let stop = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      cfFriends(token).then((f) => { if (!stop) setList(Array.isArray(f) ? f : []); })
        .catch((e) => { if (!stop && e instanceof ApiError && e.status === 404) stop = true; });
    };
    load();
    const t = setInterval(() => { if (!stop) load(); }, 30_000);
    return () => { stop = true; clearInterval(t); };
  }, [token]);
  return list;
}

/** Une clé par partie (Rejouer recrée l'écran de partie). */
const keys = new WeakMap<object, number>();
let keyN = 0;
const gameKey = (c: object) => { let k = keys.get(c); if (!k) { k = ++keyN; keys.set(c, k); } return k; };

const FACE_COLORS = ['linear-gradient(135deg,#3fbf8a,#1d7a55)', 'linear-gradient(135deg,#b06ad9,#6a2f99)', 'linear-gradient(135deg,#e8964a,#b8552b)', 'linear-gradient(135deg,#5b8cff,#2c54c2)'];
const initials = (n: string) => n.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';

/** Le mode, avec l'affichage « carte en grand » commun à tous ses écrans (toucher long, loupe). */
export function CfMode(props: CfModeProps) {
  useLang();
  return <><CfModeScreens {...props} /><CardZoomHost /></>;
}

function CfModeScreens(props: CfModeProps) {
  const { pa } = props;
  const acc = pa.isAccount;
  const [st, setSt] = useState<CfState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => (props.pending?.tournoi ? { r: 'tournoi' } : { r: 'menu' }));
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, showToast] = useCfToast();
  const [waiting, setWaiting] = useState<{ kind: 'queue' | 'challenge'; title: string; deckId?: string } | null>(null);
  /** Choix du deck avant une partie en ligne (classée, défi envoyé ou accepté, table créée ou rejointe). */
  const [pick, setPick] = useState<{ title: string; intro?: string; confirm: string; run: (deckId: string) => void } | null>(null);
  const [starting, setStarting] = useState(false);
  const [online, setOnline] = useState<CfOnline | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  // Présence (administration) : page du mode, file d'attente, salon à code ou partie.
  const cfView = route.r === 'game'
    ? (!route.online ? 'partie-solo' : (route.ctrl as { spectator?: boolean }).spectator ? 'spectateur' : 'partie')
    : waiting ? 'attente' : online?.table ? 'salon' : CF_VIEWS[route.r] ?? 'menu';
  usePresenceLayer({ view: cfView, code: cfView === 'salon' ? online?.table?.code : undefined, depth: 1 });

  const reload = useCallback(async () => {
    if (!pa.token) { setSt(null); return null; }
    try { const s = await cfMe(pa.token); setSt(s); setLoadErr(null); return s; } catch (e) { setLoadErr(e instanceof Error ? cfText(e.message) : tr('cf.mode.serveur_injoignable')); return null; }
  }, [pa.token]);
  useEffect(() => {
    void reload().then(async (s) => {
      if (!s) return;
      // Venu du cadeau de bienvenue (« Ouvrir mes 3 boosters ») : decks de départ reçus et ouverture directe.
      if (props.pending?.boosters && pa.token) {
        if (!s.discovered) {
          try { const r = await cfDiscover(pa.token); setSt(r.state); sound.treasure(); setRoute({ r: 'booster' }); return; } catch { /* écran de découverte */ }
        } else if (s.boosters > 0) { setRoute({ r: 'booster' }); return; }
      }
      if (!s.discovered) setRoute({ r: 'discover' });
    });
  }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connexion « Coups Fourrés en ligne » (comptes) : présence, file classée, défis, tables, reprise.
  useEffect(() => {
    if (!pa.token) { setOnline(null); return; }
    const o = new CfOnline(pa.token);
    setOnline(o);
    o.presence(true);
    const offC = o.onChange(bump);
    const offG = o.onGame((ctrl) => {
      setWaiting(null);
      setSheet(null);
      sound.unlock();
      setRoute({ r: 'game', ctrl, mode: modeLabel(ctrl), online: true });
    });
    return () => { offC(); offG(); o.presence(false); setTimeout(() => o.close(), 300); };
  }, [pa.token]);
  // Messages du serveur (retiré d'une table, défi refusé…).
  useEffect(() => { if (online?.alert) { showToast(online.alert, 'err'); online.alert = null; } });
  useEffect(() => {
    const sc = online?.sentChallenge;
    if (waiting?.kind === 'challenge' && sc?.closed) {
      if (sc.closed !== 'accepte') showToast(sc.closed, 'err');
      online!.sentChallenge = null;
      setWaiting(null);
    }
  });

  // Venu de la liste d'amis : défi ou partie à regarder, dès que la connexion et les decks sont prêts.
  const pendingDone = useRef(false);
  useEffect(() => {
    const pd = props.pending;
    if (!pd || pendingDone.current || !online?.connected || !st) return;
    pendingDone.current = true;
    if (pd.challenge) challenge(pd.challenge);
    else if (pd.watch) watch(pd.watch);
  });

  const name = pa.session?.username ?? (props.displayName || tr('cf.boardparts.vous'));
  const menu = useCallback(() => { setRoute({ r: 'menu' }); void reload(); pa.refresh(); }, [reload, pa]);

  // --- parties ---------------------------------------------------------------------------------
  const activeDeck = st?.decks.find((d) => d.id === st.activeDeck && d.valid) ?? st?.decks.find((d) => d.valid) ?? null;
  // --- partie guidée : proposée à la première partie, relançable depuis « Bien débuter » ---------------
  const startTutorial = useCallback(() => {
    sound.unlock();
    markTutorialSeen('propose');
    const ctrl = new TutorialCfController({ me: { name, avatar: props.avatar, photo: pa.photo, account: pa.session?.username }, token: pa.token, onReward: () => void reload() });
    setSheet(null);
    setRoute({ r: 'game', ctrl, mode: tr('cf.pg' as never), again: () => { setRoute({ r: 'menu' }); setSheet('bot'); } });
  }, [name, props.avatar, pa.photo, pa.session, pa.token, reload]);
  /** Partie guidée à 4 : visite de l'écran, puis une vraie partie contre 3 ordinateurs débutants, sans minuteur ni gain. */
  const startTutorial4 = useCallback(async () => {
    sound.unlock();
    const ctrl = await LocalCfController.create({
      level: 'debutant', deck: deckList(STARTER_DECKS[0].cards), token: null, opponents: 3, tour: true, timed: false,
      me: { name, avatar: props.avatar, photo: pa.photo, account: pa.session?.username },
    });
    setSheet(null);
    setRoute({ r: 'game', ctrl, mode: tr('cf.g4' as never), again: () => void startTutorial4() });
  }, [name, props.avatar, pa.photo, pa.session]);
  /** Première partie dans le mode (ni partie jouée, ni partie guidée vue) : on propose la partie guidée. */
  const offerTutorial = useCallback(async (): Promise<boolean> => {
    if (tutorialSeen() || st?.tutorialDone || (st?.history.length ?? 0) > 0) return false;
    markTutorialSeen('propose');
    const yes = await askConfirm(tr('cf.mode.premiere_partie_de_coups_fourres_une', { a: acc ? tr('cf.mode.et_rapporte_20_capsules_une_fois') : '' }), tr('cf.game.partie_guidee'), tr('cf.mode.jouer_directement'));
    if (yes) startTutorial();
    return yes;
  }, [st, acc, startTutorial]);

  const startBot = useCallback(async (level: CfLevel, deckId: string | null, opponents = 1) => {
    if (starting) return;
    if (await offerTutorial()) return;
    sound.unlock();
    setStarting(true);
    try {
      const own = st?.decks.find((d) => d.id === deckId && d.valid);
      // Parcours débutant : deck d'entraînement de l'étape, bulle « ce qui est nouveau », puis étape suivante.
      const pc = parcoursStepOf(deckId);
      if (pc) parcoursSet(Math.min(PARCOURS.length + 1, pc.step + 1));
      const cards = pc?.cards ?? own?.cards ?? (STARTER_DECKS.find((d) => d.id === deckId) ?? STARTER_DECKS[0]).cards;
      const ctrl = await LocalCfController.create({
        level, deck: deckList(cards), deckId: pc ? `parcours:${pc.step}` : own ? own.id : null, token: own || (pc && st?.discovered) ? pa.token : null, opponents,
        tourSteps: pc ? [...(pc.step === 1 ? screenTour(opponents) : []), { focus: 'hand', title: tr('cf.mode.parcours', { step: pc.step, length: PARCOURS.length, title: cfText(pc.title) }), text: cfText(pc.intro) }] : undefined,
        me: { name, avatar: props.avatar, photo: pa.photo, account: pa.session?.username },
        onGuestEnd: pa.onCfGuestEnd,
      });
      setSheet(null);
      setRoute({ r: 'game', ctrl, mode: '', again: () => void startBot(level, deckId, opponents) });
    } catch (e) {
      showToast(e instanceof Error ? cfText(e.message) : tr('cf.mode.impossible_de_lancer_la_partie'), 'err');
    } finally { setStarting(false); }
  }, [starting, st, pa.token, pa.photo, pa.session, pa.onCfGuestEnd, name, props.avatar, showToast, offerTutorial]);

  /** Commande en ligne : erreur claire en français si elle échoue. */
  const tryOnline = useCallback(async (f: (o: CfOnline) => Promise<unknown>): Promise<boolean> => {
    if (!online) { showToast(acc ? tr('cf.mode.connexion_au_serveur_de_jeu_en') : tr('cf.mode.les_parties_en_ligne_demandent_un'), 'err'); return false; }
    try { await f(online); return true; } catch (e) { showToast(e instanceof Error ? cfText(e.message) : tr('cf.decks.action_impossible'), 'err'); return false; }
  }, [online, acc, showToast]);

  const needDeck = () => { if (!activeDeck) { showToast(tr('cf.mode.il_vous_faut_un_deck_complet'), 'err'); return true; } return false; };
  // Chaque partie en ligne commence par « Avec quel deck ? » (deck actif présélectionné) : plus de deck imposé.
  const ranked = () => {
    if (!acc) { showToast(tr('cf.mode.la_partie_classee_demande_un_compte'), 'err'); return; }
    if (needDeck()) return;
    sound.unlock();
    void offerTutorial().then((t) => {
      if (t) return;
      setPick({ title: tr('cf.mode.partie_classee'), intro: tr('cf.mode.duel_contre_un_joueur_de_votre'), confirm: tr('cf.mode.chercher_un_adversaire'),
        run: (id) => void tryOnline((o) => o.queueJoin(id)).then((ok) => { if (ok) setWaiting({ kind: 'queue', title: tr('cf.mode.partie_classee'), deckId: id }); }) });
    });
  };
  const challenge = (username: string) => {
    if (needDeck()) return;
    setSheet(null);
    setPick({ title: tr('cf.mode.defier', { username: username }), intro: tr('cf.mode.votre_ami_choisira_son_deck_en'), confirm: tr('cf.mode.envoyer_le_defi'),
      run: (id) => void tryOnline((o) => o.challenge(username, id)).then((ok) => { if (ok) setWaiting({ kind: 'challenge', title: tr('cf.mode.defi_envoye_a', { username: username }), deckId: id }); }) });
  };
  const acceptChallenge = (c: { id: string; from: string }) => {
    if (needDeck()) return;
    setPick({ title: tr('cf.mode.defi_de', { from: c.from }), intro: tr('cf.mode.a_deja_choisi_son_deck_et', { from: c.from }), confirm: tr('cf.mode.accepter'), run: (id) => void tryOnline((o) => o.answerChallenge(c.id, true, id)) });
  };
  const tableCreate = () => {
    if (needDeck()) return;
    setSheet(null);
    setPick({ title: tr('cf.mode.ouvrir_une_table'), intro: tr('cf.mode.chacun_choisit_son_deck_vous_pourrez'), confirm: tr('cf.mode.ouvrir_la_table'),
      run: (id) => void tryOnline((o) => o.tableCreate(id)) });
  };
  const tableJoin = (code: string) => {
    if (needDeck()) return;
    setSheet(null);
    setPick({ title: tr('cf.mode.table', { code: code }), intro: tr('cf.mode.avec_quel_deck_rejoignez_vous_la'), confirm: tr('cf.mode.rejoindre'),
      run: (id) => void tryOnline((o) => o.tableJoin(code, id)) });
  };
  const watch = (code: string) => void tryOnline((o) => o.watch(code));

  // Parcours des visiteurs (tableau admin) : première partie de Coups Fourrés lancée, quel que soit le type.
  useEffect(() => { if (route.r === 'game') trackEvent('cards'); }, [route.r]);

  // --- écrans ----------------------------------------------------------------------------------
  if (route.r === 'game') {
    return <CfGame key={gameKey(route.ctrl)} controller={route.ctrl} mode={route.mode} settings={props.settings} onSettings={props.onSettings} pa={pa}
      online={route.online ? online : null} onExit={() => { if (route.mode === 'tournoi') { setRoute({ r: 'tournoi' }); void reload(); pa.refresh(); } else menu(); }} onAgain={route.again ? () => { route.again!(); } : undefined}
      onAccount={props.onAccount} onBags={props.onBags} />;
  }
  if (route.r === 'discover' && st) {
    return <Discover onGo={async () => {
      try { const r = await cfDiscover(pa.token); setSt(r.state); sound.treasure(); setRoute({ r: 'booster' }); }
      catch (e) { showToast(e instanceof Error ? cfText(e.message) : tr('cf.info.erreur'), 'err'); void reload().then((s) => { if (s?.discovered) setRoute({ r: 'menu' }); }); }
    }} onBack={props.onHome} toast={toast} />;
  }
  if (route.r === 'booster' && st) {
    return <BoosterOpening token={pa.token} state={st} onState={setSt} onDone={menu} onCollection={() => setRoute({ r: 'collection' })}
      onAutoDeck={() => setRoute({ r: 'decks' })} />;
  }
  if (route.r === 'collection') {
    return <CollectionScreen token={pa.token} state={st} onState={setSt} onBack={menu} onAccount={props.onAccount} />;
  }
  if (route.r === 'decks') {
    return <DecksScreen token={pa.token} state={st} onState={setSt} onBack={menu} onAccount={props.onAccount}
      onEdit={(id, cards, nm) => setRoute({ r: 'deck', id, cards, name: nm })} />;
  }
  if (route.r === 'deck' && st) {
    return <DeckEditor token={pa.token} state={st} onState={setSt} deckId={route.id} initial={route.cards} initialName={route.name} onBack={() => setRoute({ r: 'decks' })} />;
  }
  if (route.r === 'league') return <LeagueScreen token={pa.token} state={st} onState={setSt} onBack={menu} onAccount={props.onAccount} username={pa.session?.username} />;
  if (route.r === 'rules') return <RulesScreen onBack={menu} />;
  if (route.r === 'cards') return <CardsCatalogScreen onBack={menu} />;
  if (route.r === 'tips') return <TipsScreen onBack={menu} />;
  if (route.r === 'lexicon') return <LexiconScreen onBack={menu} />;
  if (route.r === 'enigme') return <EnigmeScreen token={pa.token} acc={acc} onBack={menu} onAccount={props.onAccount} />;
  if (route.r === 'tournoi') {
    return <>
      <TournamentScreen token={pa.token} acc={acc} onBack={menu} onWatch={watch} onAccount={props.onAccount} onError={(t) => showToast(t, 'err')} st={st} onState={setSt}
        onResume={() => void tryOnline((o) => o.resume())} />
      {toast}
    </>;
  }

  const q = online?.queue;
  const resumeGame = online?.hello?.game && !online.game ? online.hello.game : null;
  return (
    <>
      <CfMenu {...props} st={st} loadErr={loadErr} name={name} token={pa.token}
        onBot={() => setSheet('bot')} onFriendsPlay={() => setSheet('friends')} onRanked={ranked}
        onDecks={() => setRoute({ r: 'decks' })} onBoosters={() => setSheet('boosters')} onCollection={() => setRoute({ r: 'collection' })}
        onMissions={() => setSheet('missions')} onLeague={() => setRoute({ r: 'league' })} onRules={() => setRoute({ r: 'rules' })}
        onTuto={startTutorial} onChallenge={challenge} onWatch={(f) => f.code && watch(f.code)} onRetry={() => void reload()} onTournament={() => setRoute({ r: 'tournoi' })} onEnigme={() => setRoute({ r: 'enigme' })}
        onLearn={() => setSheet('learn')}
        top={<>
          {resumeGame && <button className="cf-banner gold" onClick={() => void tryOnline((o) => o.resume(resumeGame.id))}><b>{tr('cf.mode.partie_en_cours')}</b><span>{resumeGame.ranked ? tr('cf.mode.classee') : tr('cf.mode.entre_amis')}{tr('cf.mode.reprenez_la_avant_d_etre_compte')}</span><em>{tr('cf.mode.reprendre')}</em></button>}
          {online?.challenges.map((c) => (
            <div key={c.id} className="cf-banner duel" role="alert">
              <span><b>{c.from}{tr('cf.mode.vous_defie')}</b><span>{tr('cf.mode.duel_vous_choisissez_votre_deck_en')}</span></span>
              <button className="cf-btn small ghost" onClick={() => void tryOnline((o) => o.answerChallenge(c.id, false))}>{tr('cf.mode.refuser')}</button>
              <button className="cf-btn small gold" onClick={() => acceptChallenge(c)}>{tr('cf.mode.accepter')}</button>
            </div>
          ))}
        </>} />
      {sheet === 'bot' && <BotSheet st={st} acc={acc} starting={starting} onClose={() => setSheet(null)} onStart={startBot} onAccount={props.onAccount} />}
      {sheet === 'friends' && <FriendsPlaySheet acc={acc} token={pa.token} onClose={() => setSheet(null)} onAccount={props.onAccount}
        onCreate={tableCreate} onJoin={tableJoin}
        onChallenge={challenge} onWatch={watch} onFriends={() => { setSheet(null); props.onFriends(); }} />}
      {sheet === 'boosters' && st && <BoostersSheet st={st} onClose={() => setSheet(null)} onOpen={() => { setSheet(null); setRoute({ r: 'booster' }); }}
        onBuy={async () => {
          try { const r = await cfBuyBooster(pa.token); setSt(r.state); sound.chips(3); showToast(tr('cf.mode.booster_achete_il_vous_attend')); }
          catch (e) { showToast(e instanceof Error ? cfText(e.message) : tr('cf.mode.achat_impossible'), 'err'); }
        }} />}
      {sheet === 'missions' && <Sheet title={tr('cf.info.missions_du_jour')} onClose={() => setSheet(null)}><MissionsList st={st} onAccount={props.onAccount} /></Sheet>}
      {sheet === 'learn' && <Sheet title={tr('cf.mode.apprendre_coups_fourres')} onClose={() => setSheet(null)}>
        <LearnBlock fresh={!st?.history.length} onTuto={startTutorial} onTuto4={() => void startTutorial4()} onRules={() => { setSheet(null); setRoute({ r: 'rules' }); }}
          onCards={() => { setSheet(null); setRoute({ r: 'cards' }); }} onTips={() => { setSheet(null); setRoute({ r: 'tips' }); }} onLexicon={() => { setSheet(null); setRoute({ r: 'lexicon' }); }} />
      </Sheet>}
      {online?.table && <TableLobby online={online} st={st} pa={pa} me={pa.session?.username ?? ''} onError={(t) => showToast(t, 'err')} />}
      {waiting?.kind === 'queue' && <WaitingOverlay title={waiting.title} status={q?.text ?? tr('cf.mode.recherche_d_un_adversaire_de_votre')}
        onCancel={() => { void online?.queueLeave(); setWaiting(null); }}
        extra={<>
          <DeckBadge deck={st?.decks.find((d) => d.id === waiting.deckId) ?? null} />
          {q?.offer && <button className="cf-btn violet" onClick={() => { void online?.queueLeave(); setWaiting(null); setSheet('bot'); }}>{tr('cf.mode.jouer_contre_l_ordinateur_en_attenda')}</button>}
        </>} />}
      {waiting?.kind === 'challenge' && <WaitingOverlay title={waiting.title} status={tr('cf.mode.en_attente_de_sa_reponse')}
        extra={<DeckBadge deck={st?.decks.find((d) => d.id === waiting.deckId) ?? null} />}
        onCancel={() => { void online?.cancelChallenge(); setWaiting(null); }} />}
      {pick && <DeckChoiceSheet st={st} title={pick.title} intro={pick.intro} confirm={pick.confirm} onClose={() => setPick(null)}
        onDecks={() => { setPick(null); setRoute({ r: 'decks' }); }}
        onConfirm={(id) => { const p = pick; setPick(null); sound.unlock(); p.run(id); }} />}
      {toast}
    </>
  );
}

const modeLabel = (c: CfOnlineController) => (c.spectator ? 'spectateur' : c.mode === 'classee' ? tr('cf.mode.classee_2') : c.mode === 'ami' ? tr('cf.mode.defi') : c.mode === 'tournoi' ? 'tournoi' : tr('cf.mode.entre_amis_2'));

/**
 * Table privée à code (avant le départ) : joueurs et LEUR deck (prêt ou pas, et pourquoi), mon deck
 * avec « Changer de deck », code à partager, lancer (seulement quand tout le monde a un deck jouable).
 */
function TableLobby({ online, st, me, pa, onError }: { online: CfOnline; st: CfState | null; me: string; pa: ProfileApi; onError: (t: string) => void }) {
  const t = online.table!;
  const host = t.host === me;
  const mine = t.players.find((p) => p.account === me);
  const myDeck = st?.decks.find((d) => d.id === mine?.deckId) ?? null;
  const [choosing, setChoosing] = useState(false);
  const notReady = t.players.filter((p) => p.ready === false);
  const run = (f: () => Promise<unknown>) => void f().catch((e) => onError(e instanceof Error ? cfText(e.message) : tr('cf.decks.action_impossible')));
  const share = () => {
    const text = tr('cf.mode.rejoignez_ma_table_de_coups_fourres', { code: t.code });
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) void nav.share({ text }).catch(() => {}); else void navigator.clipboard?.writeText(t.code);
  };
  return (
    <div className="cf-wait" role="dialog" aria-modal="true" aria-label={tr('cf.mode.table_entre_amis')}>
      <div className="cf-wait-card cf-table">
        <h3>{tr('cf.mode.table_entre_amis')}</h3>
        <button className="cf-table-code" onClick={share} aria-label={tr('cf.mode.code_partager', { code: t.code })}><small>{tr('cf.mode.code')}</small><b>{t.code}</b><Icon name="share" size={18} /></button>
        <ul className="cf-table-list">
          {t.players.map((p) => (
            <li key={p.account} className={p.ready === false ? 'notready' : ''}>
              {p.photo ? <Avatar photo={p.photo} size={30} /> : <i>{initials(p.name)}</i>}
              <span><b>{p.name}{p.host ? tr('cf.mode.hote') : ''}</b>
                <small>{p.deck ? tr('cf.mode.deck', { deck: p.deck }) : tr('cf.mode.choisit_son_deck')}{p.ready === false ? '' : p.deck ? tr('cf.mode.pret') : ''}</small>
                {p.ready === false && <small className="cf-table-why">{tr('cf.mode.pas_pret')}{p.why ?? tr('cf.mode.deck_pas_jouable')}</small>}
              </span>
              {host && !p.host && <button className="cf-btn small ghost" onClick={() => run(() => online.tableKick(p.account))}>{tr('cf.mode.retirer')}</button>}
            </li>
          ))}
          {Array.from({ length: Math.max(0, t.max - t.players.length) }, (_, i) => <li key={`v${i}`} className="empty"><i>?</i><span><small>{tr('cf.mode.place_libre')}</small></span></li>)}
        </ul>
        <div className="cf-table-mydeck">
          {myDeck ? <DeckBadge deck={myDeck} label={mine?.ready === false ? tr('cf.mode.votre_deck_pas_jouable') : tr('cf.mode.vous_jouez')} /> : <small>{tr('cf.mode.choisissez_votre_deck')}</small>}
          <button className="cf-btn small ghost" onClick={() => setChoosing((c) => !c)} aria-expanded={choosing}>{choosing ? tr('cf.boardparts.fermer') : tr('cf.mode.changer_de_deck')}</button>
        </div>
        {(choosing || mine?.ready === false) && st && (
          <DeckPicker decks={st.decks} value={mine?.deckId ?? null} active={st.activeDeck} onChange={(id) => run(async () => { await online.tableDeck(id); setChoosing(false); })} />
        )}
        <p>{host ? (t.players.length < 2 ? tr('cf.mode.partagez_le_code_la_partie_se') : notReady.length ? tr('cf.mode.en_attente_doi_choisir_un_deck', { a: notReady.map((p) => p.name).join(', '), b: getLang() === 'fr' ? (notReady.length > 1 ? 'vent' : 't') : '' }) : tr('cf.mode.tout_le_monde_est_pret_lancez')) : tr('cf.mode.l_hote_lancera_la_partie_des')}</p>
        {host && <button className="cf-btn gold big" disabled={t.players.length < 2 || notReady.length > 0} onClick={() => run(() => online.tableStart())}>{tr('cf.mode.lancer_la_partie')}</button>}
        <CfChatPanel inline pa={pa} src={{ chat: online.tableChat, send: (t) => online.tableSay(t) }} />
        <button className="cf-btn ghost" onClick={() => void online.tableLeave()}>{tr('cf.mode.quitter_la_table')}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Menu du mode

function CfMenu(p: CfModeProps & {
  st: CfState | null; loadErr: string | null; name: string;
  onBot: () => void; onFriendsPlay: () => void; onRanked: () => void; onDecks: () => void; onBoosters: () => void; onCollection: () => void;
  onMissions: () => void; onLeague: () => void; onRules: () => void; onChallenge: (u: string) => void; onWatch: (f: CfFriend) => void; onRetry: () => void;
  /** « Apprendre » : parties guidées, règles, cartes, conseils, lexique. */
  onLearn: () => void;
  onTuto: () => void;
  onTournament: () => void; onEnigme: () => void; token?: string | null; top?: React.ReactNode;
}) {
  const { pa, st } = p;
  const acc = pa.isAccount;
  const friends = useCfFriends(pa.token);
  const league = st?.league;
  const prog = league ? divisionProgress(league.points) : null;
  const owned = st ? Object.values(st.collection).filter((c) => c.count > 0).length : 0;
  const deck = st?.decks.find((d) => d.id === st.activeDeck) ?? null;
  const missionsDone = st?.missions.filter((m) => m.done).length ?? 0;
  const last: CfGameView | undefined = st?.history[0];
  const present = (friends ?? []).slice(0, 3);
  // Nouveau joueur (aucune partie jouée) : la partie guidée est mise en avant.
  const fresh = !st?.history.length;
  return (
    <div className="cf-menu">
      <span className="cf-stars" aria-hidden />
      <ModeBar tone="cartes" title="Coups Fourrés" onBack={p.onHome}>
        {acc ? <ModeChip label={`${st?.capsules ?? 0} capsules`}><Capsules n={st?.capsules ?? 0} size={16} /></ModeChip>
          : null}
        {acc && <FriendsButton pa={pa} onOpen={p.onFriends} />}
        <button className="icon-btn mode-rules" onClick={p.onRules} aria-label={tr('cf.game.regles_de_coups_fourres')}><Icon name="rules" size={20} /></button>
      </ModeBar>

      <main className="cf-menu-main">
        {p.top}
        {fresh && <LearnHero onTuto={p.onTuto} />}
        {present.length > 0 && (
          <div className="cf-present">
            <span className="cf-faces" aria-hidden>{present.map((f, i) => f.photo
              ? <Avatar key={f.username} photo={f.photo} size={26} />
              : <i key={f.username} style={{ background: FACE_COLORS[i % FACE_COLORS.length] }}>{initials(f.username)}</i>)}</span>
            <span className="cf-present-text"><b>{present.length === 1 ? present[0].username : `${present.slice(0, -1).map((f) => f.username).join(', ')} et ${present[present.length - 1].username}`}</b>
              {present.length === 1 ? (present[0].status === 'partie' ? tr('cf.mode.joue_a_coups_fourres') : tr('cf.mode.est_dans_coups_fourres')) : tr('cf.mode.sont_dans_coups_fourres')}</span>
            {present.length === 1 && present[0].status === 'partie' && present[0].watchable
              ? <button className="cf-present-go" onClick={() => p.onWatch(present[0])}>{tr('cf.mode.regarder')}</button>
              : <button className="cf-present-go" onClick={() => p.onChallenge((present.find((f) => f.status === 'menu') ?? present[0]).username)}>{tr('cf.mode.defier_2')}</button>}
          </div>
        )}

        <section className="cf-hero">
          <div className="cf-hero-fan" aria-hidden>
            <i className="cf-hab" /><i className="cf-ivr" /><i className="cf-pie" /><i className="cf-cha" />
            <span className="cf-hero-die"><b /><b /><b /><b /></span>
          </div>
          <h1>Coups Fourrés</h1>
          <p>{tr('cf.mode.le_421_aux_cartes_bluff_fouine')}</p>
        </section>

        {acc && league && prog ? (
          <button className="cf-league" onClick={p.onLeague}>
            <DivisionShield id={league.division} size={38} />
            <span className="cf-league-text">
              <span className="cf-league-row"><b>{prog.name}</b><small>{league.points}{tr('cf.info.pts')}{prog.next ? tr('cf.mode.a', { next: prog.next, a: league.points + prog.toNext }) : ''}</small></span>
              <span className="cf-bar"><i style={{ width: `${prog.pct}%` }} /></span>
              <small>{seasonName(league.season)} · {seasonEndsIn(league.endsOn)}</small>
            </span>
          </button>
        ) : !acc ? (
          <button className="cf-league guest" onClick={p.onAccount}>
            <DivisionShield id="comptoir" size={38} />
            <span className="cf-league-text">
              <span className="cf-league-row"><b>{tr('cf.mode.ligue_reservee_aux_comptes')}</b></span>
              <small>{tr('cf.mode.compte_gratuit_collection_boosters_c')}</small>
            </span>
            <em>{tr('cf.mode.creer')}</em>
          </button>
        ) : p.loadErr ? (
          <button className="cf-league guest" onClick={p.onRetry}><span className="cf-league-text"><b>{p.loadErr}</b><small>{tr('cf.mode.touchez_pour_reessayer')}</small></span></button>
        ) : <div className="cf-league skeleton" aria-hidden />}

        <div className="cf-plays">
          <button className="cf-play rank" onClick={p.onRanked} aria-disabled={!acc}>
            <span className="cf-play-ic" aria-hidden><Icon name="trophy" size={26} /></span>
            <span className="cf-play-text"><b>{tr('cf.mode.partie_classee')}</b><small>{acc ? tr('cf.mode.duel_contre_un_joueur_de_votre_2') : tr('cf.mode.avec_un_compte_gratuit')}</small></span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <div className="cf-play-row">
            <button className="cf-play bot" onClick={p.onBot}><span className="cf-play-text"><b>{tr('cf.game.contre_l_ordinateur')}</b><small>{acc ? tr('cf.mode.entrainement_3_niveaux') : tr('cf.mode.essai_gratuit_3_niveaux')}</small></span></button>
            <button className="cf-play ami" onClick={p.onFriendsPlay}><span className="cf-play-text"><b>{tr('cf.mode.entre_amis')}</b><small>{tr('cf.mode.de_2_a_4_joueurs')}</small></span></button>
          </div>
        </div>

        <EnigmeEntry token={pa.token} acc={acc} onOpen={p.onEnigme} />
        <TournamentCard token={pa.token} acc={acc} onOpen={p.onTournament} />

        <div className="cf-tiles">
          <button className="cf-tile" onClick={p.onDecks}>
            <span className="cf-tile-art minis" aria-hidden><i className="cf-hab" /><i className="cf-cha" /><i className="cf-ivr" /></span>
            <b>{tr('cf.collection.mes_decks')}</b><small>{deck ? `« ${deck.name} »` : acc ? tr('cf.mode.construire') : tr('cf.decks.decks_de_depart')}</small>
          </button>
          <button className="cf-tile" onClick={acc ? p.onBoosters : p.onAccount}>
            {!!st?.boosters && <span className="cf-badge">{st.boosters}</span>}
            <span className="cf-tile-art" aria-hidden><BoosterPack width={24} /></span>
            <b>{tr('cf.mode.boosters')}</b><small>{st?.boosters ? tr('cf.mode.a_ouvrir', { boosters: st.boosters }) : acc ? `${BOOSTER.price} capsules` : tr('cf.mode.avec_un_compte')}</small>
          </button>
          <button className="cf-tile" onClick={p.onCollection}>
            <span className="cf-tile-art num" aria-hidden>{acc ? owned : '?'}<small>/{CARDS.length}</small></span>
            <b>{tr('cf.mode.mes_cartes')}</b><small>{acc ? tr('cf.mode.collection_eclats') : tr('cf.learn.les_cartes', { length: CARDS.length })}</small>
          </button>
          <button className="cf-tile" onClick={p.onMissions}>
            {st && st.missions.some((m) => m.done) && missionsDone < st.missions.length && <span className="cf-badge green">{missionsDone}</span>}
            <span className="cf-tile-art dots" aria-hidden>{(st?.missions ?? [0, 1, 2]).map((m, i) => <i key={i} className={typeof m === 'object' && m.done ? 'on' : ''} />)}</span>
            <b>{tr('cf.info.missions_du_jour')}</b><small>{st ? `${missionsDone} sur ${st.missions.length}` : tr('cf.mode.avec_un_compte')}</small>
          </button>
          <button className="cf-tile" onClick={p.onLeague}>
            <span className="cf-tile-art" aria-hidden><Icon name="chart" size={28} /></span>
            <b>{tr('cf.info.classement')}</b><small>{tr('cf.mode.ligue_du_mois')}</small>
          </button>
          <button className={`cf-tile${fresh ? ' hot' : ''}`} onClick={p.onLearn}>
            <span className="cf-tile-art" aria-hidden><Icon name="rules" size={28} /></span>
            <b>{tr('cf.learn.apprendre')}</b><small>{tr('cf.mode.guide_regles')}</small>
          </button>
        </div>

        {last ? (
          <div className="cf-last">
            <span className={`cf-last-ic ${last.result === 'victoire' ? 'win' : 'lose'}`} aria-hidden>{last.vsBot ? '🤖' : initials(last.opponent ?? '?')}</span>
            <span className="cf-last-text"><b>{last.result === 'victoire' ? tr('cf.boardparts.victoire') : last.result === 'abandon' ? tr('cf.mode.abandon') : tr('cf.boardparts.defaite')}</b>
              {` ${last.vsBot ? tr('cf.mode.contre_l_ordinateur') : `contre ${last.opponent ?? tr('cf.mode.un_joueur')}`}`}
              {last.ranked && last.points ? tr('cf.mode.pts', { a: last.points > 0 ? '+' : '', points: last.points }) : ''}{last.capsules ? tr('cf.mode.capsules', { capsules: last.capsules }) : ''}</span>
          </div>
        ) : !acc ? (
          <p className="cf-guest-note">{tr('cf.mode.invite_essayez_contre_l_ordinateur_a')}<button className="cf-link" onClick={p.onAccount}>{tr('cf.collection.creer_un_compte')}</button>{tr('cf.mode.pour_la_collection_les_boosters_et')}</p>
        ) : null}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Feuilles du menu

const LEVELS: CfLevel[] = ['debutant', 'habitue', 'fine-fouine'];

/** Parcours débutant : prochaine partie (1 à 4), ou 5 quand il est fini ou passé (gardé sur l'appareil). */
const PARCOURS_KEY = '421.cf.parcours';
function parcoursNext(): number { try { const n = Number(localStorage.getItem(PARCOURS_KEY) ?? 1); return Number.isFinite(n) && n >= 1 ? n : 1; } catch { return PARCOURS.length + 1; } }
function parcoursSet(n: number) { try { localStorage.setItem(PARCOURS_KEY, String(n)); } catch { /* */ } }

function BotSheet({ st, acc, starting, onClose, onStart, onAccount }: { st: CfState | null; acc: boolean; starting: boolean; onClose: () => void; onStart: (l: CfLevel, deckId: string | null, opponents: number) => void; onAccount: () => void }) {
  const [opp, setOpp] = useState(1);
  const [level, setLevel] = useState<CfLevel>(() => { try { return (localStorage.getItem('421.cf.niveau') as CfLevel) || 'debutant'; } catch { return 'debutant'; } });
  // Comptes : tous leurs decks (les injouables grisés, avec la raison) ; invités : les decks de départ.
  const decks = useMemo<DeckOption[]>(() => (acc && st ? st.decks : STARTER_DECKS.map((d) => ({ id: d.id, name: d.name, cards: d.cards, valid: true, problems: [] }))), [acc, st]);
  const [deckId, setDeckId] = useState<string | null>(() => (acc && st ? st.activeDeck : STARTER_DECKS[0].id));
  const chosen = decks.find((d) => d.id === deckId && d.valid) ?? decks.find((d) => d.valid) ?? null;
  const left = st ? Math.max(0, CAPSULES.vsBotDailyMax - st.botCapsulesToday) : 0;
  return (
    <Sheet title={tr('cf.game.contre_l_ordinateur')} onClose={onClose}>
      {parcoursNext() <= PARCOURS.length && (() => { const pc = PARCOURS[parcoursNext() - 1]; return (
        <div className="cf-parcours">
          <b>{tr('cf.mode.parcours_debutant_partie')}{pc.step}/{PARCOURS.length}</b>
          <span>{cfText(pc.title)}{tr('cf.mode.un_type_de_carte_en_plus')}</span>
          <button className="cf-btn gold" disabled={starting} onClick={() => onStart('debutant', `parcours:${pc.step}`, 1)}>{starting ? tr('cf.mode.preparation') : tr('cf.mode.jouer', { title: cfText(pc.title) })}</button>
          <button className="cf-link" onClick={() => { parcoursSet(PARCOURS.length + 1); onClose(); }}>{tr('cf.mode.je_connais_deja_le_jeu')}</button>
        </div>
      ); })()}
      <div className="cf-levels" role="radiogroup" aria-label={tr('cf.mode.niveau')}>
        {LEVELS.map((l) => (
          <button key={l} role="radio" aria-checked={level === l} className={level === l ? 'on' : ''} onClick={() => { setLevel(l); try { localStorage.setItem('421.cf.niveau', l); } catch { /* */ } }}>
            <span className="cf-lvl-av" aria-hidden>{CF_BOTS[l].avatar}</span>
            <span><b>{cfText(CF_LEVEL_LABEL[l])}</b><small>{CF_BOTS[l].name} · {CF_BOTS[l].blurb}</small></span>
          </button>
        ))}
      </div>
      <div className="cf-deckpick">
        <b>{tr('cf.mode.adversaires')}</b>
        <div className="cf-chips" role="radiogroup" aria-label={tr('cf.mode.nombre_d_adversaires')}>{[1, 2, 3].map((n) => <button key={n} role="radio" aria-checked={opp === n} className={opp === n ? 'on' : ''} onClick={() => setOpp(n)}>{n === 1 ? tr('cf.mode.duel_1') : tr('cf.ordis' as never, { n: n })}</button>)}</div>
      </div>
      <div className="cf-deckpick">
        <b>{tr('cf.mode.votre_deck')}</b>
        <DeckPicker decks={decks} value={chosen?.id ?? null} active={acc && st ? st.activeDeck : null} onChange={setDeckId} />
      </div>
      <p className="cf-sheet-note">{acc ? (left > 0 ? tr('cf.mode.capsules_par_partie_terminee_encore_', { vsBot: CAPSULES.vsBot, left: left }) : tr('cf.mode.plafond_de_capsules_contre_l_ordinat'))
        : <>{tr('cf.mode.partie_d_essai_des_pieces_pas')}<button className="cf-link" onClick={onAccount}>{tr('cf.collection.creer_un_compte')}</button>{tr('cf.mode.pour_gagner_des_capsules')}</>}</p>
      <button className="cf-btn gold big" disabled={starting || !chosen} onClick={() => chosen && onStart(level, chosen.id, opp)}>{starting ? tr('cf.mode.preparation') : chosen ? tr('cf.mode.jouer_avec', { name: chosen.name }) : tr('cf.boardparts.jouer')}</button>
    </Sheet>
  );
}

function FriendsPlaySheet({ acc, token, onClose, onCreate, onJoin, onChallenge, onWatch, onFriends, onAccount }: {
  acc: boolean; token: string | null; onClose: () => void; onCreate: () => void; onJoin: (code: string) => void;
  onChallenge: (u: string) => void; onWatch: (code: string) => void; onFriends: () => void; onAccount: () => void;
}) {
  const [code, setCode] = useState('');
  const friends = useCfFriends(token);
  return (
    <Sheet title={tr('cf.mode.entre_amis')} onClose={onClose}>
      {!acc && <p className="cf-sheet-note">{tr('cf.mode.les_parties_entre_amis_demandent_un')}<button className="cf-link" onClick={onAccount}>{tr('cf.collection.creer_un_compte')}</button></p>}
      {acc && friends && friends.length > 0 && (
        <ul className="cf-friend-list">
          {friends.map((f) => (
            <li key={f.username}>
              {f.photo ? <Avatar photo={f.photo} size={30} /> : <i>{initials(f.username)}</i>}
              <span><b>{f.username}</b><small>{f.status === 'partie' ? tr('cf.mode.en_partie_de_coups_fourres') : tr('cf.mode.dans_coups_fourres')}</small></span>
              {f.status === 'partie' ? (f.watchable && f.code ? <button className="cf-btn small ghost" onClick={() => onWatch(f.code!)}>{tr('cf.mode.regarder')}</button> : null)
                : <button className="cf-btn small gold" onClick={() => onChallenge(f.username)}>{tr('cf.mode.defier_2')}</button>}
            </li>
          ))}
        </ul>
      )}
      <button className="cf-row-btn" onClick={onFriends} disabled={!acc}><Icon name="people" size={22} /><span><b>{tr('cf.mode.defier_un_ami')}</b><small>{tr('cf.mode.votre_liste_d_amis_bouton_defier')}</small></span></button>
      <button className="cf-row-btn" onClick={onCreate} disabled={!acc}><Icon name="plus" size={22} /><span><b>{tr('cf.mode.ouvrir_une_table_a_code')}</b><small>{tr('cf.mode.de_2_a_4_joueurs_2')}{CF_RULES.startTokensMulti}{tr('cf.mode.jetons_a_3_ou_4')}</small></span></button>
      <form className="cf-code" onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 4) onJoin(code.trim().toUpperCase()); }}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))} placeholder={tr('cf.mode.code_de_la_table')} aria-label={tr('cf.mode.code_de_la_table')} disabled={!acc} autoCapitalize="characters" />
        <button className="cf-btn violet" disabled={!acc || code.trim().length < 4}>{tr('cf.mode.rejoindre')}</button>
      </form>
    </Sheet>
  );
}

function BoostersSheet({ st, onClose, onOpen, onBuy }: { st: CfState; onClose: () => void; onOpen: () => void; onBuy: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={tr('cf.mode.boosters')} onClose={onClose}>
      <div className="cf-boost-head">
        <BoosterPack width={92} />
        <div>
          <b>{st.boosters ? tr('cf.mode.booster_a_ouvrir', { boosters: st.boosters, s: st.boosters > 1 ? 's' : '' }) : tr('cf.mode.aucun_booster_a_ouvrir')}</b>
          <small>{tr('cf.mode.5_cartes_au_pur_hasard_communes')}</small>
        </div>
      </div>
      {st.boosters > 0 && <button className="cf-btn gold big" onClick={onOpen}>{tr('cf.mode.ouvrir')}{st.boosters > 1 ? tr('cf.mode.un_booster') : tr('cf.mode.le_booster')}</button>}
      <button className="cf-btn violet" disabled={busy || st.capsules < BOOSTER.price} onClick={async () => { setBusy(true); await onBuy(); setBusy(false); }}>
        {tr('cf.mode.acheter_un_booster')}{BOOSTER.price} <span className="cf-sr">capsules</span><Capsules n={st.capsules} size={16} className="inline" />
      </button>
      {st.capsules < BOOSTER.price && <p className="cf-sheet-note">{tr('cf.collection.il_vous_manque')}{BOOSTER.price - st.capsules}{tr('cf.mode.capsules_gagnez_en_en_partie_avec')}</p>}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------
// Découverte du mode (première visite d'un compte)

function Discover({ onGo, onBack, toast }: { onGo: () => Promise<void>; onBack: () => void; toast: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="cf-discover">
      <span className="cf-stars" aria-hidden />
      <button className="cf-ib cf-discover-back" onClick={onBack} aria-label={tr('cf.mode.retour_au_menu_principal')}><Icon name="back" size={22} /></button>
      <div className="cf-discover-fan" aria-hidden>
        <CardView id="josiane" width={104} /><CardView id="tete-tourne" width={104} /><CardView id="fouine" width={104} />
      </div>
      <h1>{tr('cf.mode.bienvenue_dans_coups_fourres')}</h1>
      <p className="cf-discover-lead">{tr('cf.mode.le_421_que_vous_connaissez_avec')}</p>
      <ul className="cf-discover-list">
        <li><span className="cf-dl-ic" aria-hidden><CardBack width={24} /></span><span><b>{tr('cf.mode.2_decks_de_depart_offerts')}</b><small>{tr('cf.mode.le_zinc_et_la_bringue_prets')}</small></span></li>
        <li><span className="cf-dl-ic" aria-hidden><BoosterPack width={24} /></span><span><b>{tr('cf.mode.3_boosters_de_bienvenue')}</b><small>{tr('cf.mode.15_cartes_de_plus_pour_votre')}</small></span></li>
        <li><span className="cf-dl-ic" aria-hidden><DivisionShield id="bistrot" size={22} /></span><span><b>{tr('cf.mode.une_ligue_chaque_mois')}</b><small>{tr('cf.mode.du_comptoir_au_grand_cafe')}</small></span></li>
      </ul>
      <button className="cf-btn gold big" disabled={busy} onClick={async () => { setBusy(true); await onGo(); setBusy(false); }}>{busy ? tr('cf.enigme.un_instant') : tr('cf.mode.recevoir_mes_cartes')}</button>
      {toast}
    </div>
  );
}
