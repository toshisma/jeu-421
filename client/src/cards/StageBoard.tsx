/**
 * TEMPORAIRE (planche de relecture, comme CardGallery) : l'écran de partie dans une situation choisie,
 * pour les captures et la relecture par Sam. `?cf-gallery=1&vue=plateau&scene=main|calcul|adverse&adv=1..3`
 * - main : votre tour avec 12 cartes en main (flèches, glisser) ;
 * - calcul : le choix de Calcul mental (3 cartes) ;
 * - adverse : début de manche (commande du comptoir), puis un adversaire joue une carte ; Habitués et
 *   pièges posés devant les adversaires.
 * La partie continue ensuite pour de vrai (moteur et ordinateurs), sans serveur ni récompense.
 */
import { useMemo, useState } from 'react';
import { CARDS, STARTER_DECKS } from '../../../shared/cards/catalog';
import { cfDecide } from '../../../shared/cards/ai';
import { COMMANDES, apply, eventsFor, legalActions, newGame, viewFor, waitingFor, type CfAction, type CfEvent, type CfState } from '../../../shared/cards/engine';
import { mulberry32 } from '../../../shared/rng';
import { useProfile } from '../account/useProfile';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import type { CfController, CfSeat, CfSnapshot } from './controller';
import { CfGame } from './CfGame';
import { CardZoomHost } from './zoom';
import { deckList } from './local';

const NAMES = ['Vous', 'Bébert la Tournée', 'Josette du coin', 'Le Grand Roger'];

class StageController implements CfController {
  readonly kind = 'bot' as const;
  readonly ranked = false;
  readonly me = 'a';
  private s: CfState;
  private subs = new Set<(snap: CfSnapshot, events: CfEvent[]) => void>();
  private seats: CfSeat[];
  private first: CfEvent[];
  private rng = mulberry32(7);
  constructor(scene: string, opp: number) {
    const ids = ['a', 'b', 'c', 'd'].slice(0, opp + 1);
    let s = newGame({ commandes: true }, ids.map((id, i) => ({ id, name: NAMES[i], deck: deckList(STARTER_DECKS[i % 2].cards) })), 11);
    for (const id of ids) s = apply(s, id, { type: 'mulligan', cards: [] }).state;
    // Les ordinateurs jouent jusqu'à ce que ce soit à vous.
    for (let i = 0; i < 200 && waitingFor(s)[0] !== 'a' && s.phase !== 'over'; i++) s = this.botStep(s);
    let uid = 9000;
    const inst = (id: string, rounds?: number) => ({ uid: `x${uid++}`, id, ...(rounds ? { rounds } : {}) });
    const me = s.players.find((p) => p.id === 'a')!;
    me.tournees = s.rules.tourneesMax;
    if (scene === 'main' || scene === 'adverse') {
      const pick = ['tete-tourne', 'note-salee', 'coup-coude', 'fouine', 'calcul-mental', 'josiane', 'pilier', 'croche-patte', 'cul-sec', 'reaction-chaine', 'grand-enchainement', 'double-tournee', 'leurre', 'vieux-marcel']
        .filter((id) => CARDS.some((c) => c.id === id));
      me.hand = pick.slice(0, 12).map((id) => inst(id));
    }
    // Devant les adversaires : Habitués (manches restantes) et pièges posés face cachée.
    const habs = ['pilier', 'vieux-marcel', 'beau-frere', 'videur'];
    const trapIds = ['faux-421', 'croche-patte', 'coup-nenette', 'mouchard'];
    s.players.filter((p) => p.id !== 'a').forEach((p, i) => {
      p.habitues = habs.slice(0, i === 0 ? 2 : 1).map((id, k) => inst(id, 3 - k - i > 0 ? 3 - k - i : 1));
      for (let k = 0; k < (i === 0 ? 2 : 1); k++) s.traps.push({ uid: `t${uid++}`, id: trapIds[(i + k) % trapIds.length], owner: p.id, target: 'a', posedRound: s.round, seenBy: [p.id] });
    });
    me.habitues = [inst('josiane', 2)];
    if (scene === 'calcul') s.choice = { kind: 'calcul', player: 'a', cards: [inst('grand-enchainement'), inst('reaction-chaine'), inst('note-salee')] };
    s.commande = COMMANDES[1]?.id ?? COMMANDES[0].id;
    this.s = s;
    this.seats = ids.map((id, i) => ({ id, name: NAMES[i], bot: i > 0, avatar: ['🙂', '🎩', '💄', '🧔'][i], label: i ? 'Habitué' : undefined }));
    const b = s.players.find((p) => p.id === 'b')!;
    this.first = scene === 'adverse' ? [
      { kind: 'manche', text: `Manche ${s.round} : ${b.name} mène.` },
      { kind: 'commande', text: 'Commande du comptoir.' },
      { kind: 'carte', player: 'b', card: 'note-salee', text: `${b.name} joue La note salée sur vous.` },
    ] : [];
  }
  private botStep(s: CfState): CfState {
    const id = waitingFor(s)[0];
    const legal = legalActions(s, id);
    const a = cfDecide(viewFor(s, id), legal, 'habitue', this.rng);
    return apply(s, id, a).state;
  }
  private snap(): CfSnapshot {
    return { view: viewFor(this.s, 'a'), legal: legalActions(this.s, 'a'), waitingFor: waitingFor(this.s), seats: this.seats, finished: this.s.phase === 'over' ? { standings: this.s.ranking } : null };
  }
  current() { return this.snap(); }
  subscribe(cb: (snap: CfSnapshot, events: CfEvent[]) => void) {
    this.subs.add(cb);
    setTimeout(() => cb(this.snap(), []), 30);
    if (this.first.length) setTimeout(() => cb(this.snap(), this.first), 900);
    return () => { this.subs.delete(cb); };
  }
  async act(a: CfAction) {
    const r = apply(this.s, 'a', a);
    if (!r.ok) return r.error ?? 'Impossible.';
    this.s = r.state;
    let events = eventsFor(r.events, 'a');
    for (let i = 0; i < 60 && this.s.phase !== 'over' && !waitingFor(this.s).includes('a'); i++) {
      const id = waitingFor(this.s)[0];
      const x = apply(this.s, id, cfDecide(viewFor(this.s, id), legalActions(this.s, id), 'habitue', this.rng));
      this.s = x.state;
      events = [...events, ...eventsFor(x.events, 'a')];
    }
    const snap = this.snap();
    for (const cb of this.subs) cb(snap, events);
    return null;
  }
  leave() { /* planche : rien */ }
}

export function StageBoard() {
  const q = new URLSearchParams(location.search);
  const scene = q.get('scene') ?? 'main';
  const opp = Math.max(1, Math.min(3, Number(q.get('adv') ?? 3) || 3));
  const ctrl = useMemo(() => new StageController(scene, opp), [scene, opp]);
  const pa = useProfile(false);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  return (
    <>
      <CfGame controller={ctrl} mode="planche" settings={settings} onSettings={setSettings} pa={pa} onExit={() => location.reload()} onAccount={() => {}} />
      <CardZoomHost />
    </>
  );
}
