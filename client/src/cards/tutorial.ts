/**
 * Coups Fourrés : contrôleur de la partie guidée (implémente CfController).
 * Le scénario est dans shared/cards/tutorial.ts ; ici on ajoute les pauses de Dédé, la bulle
 * d'explication (`snap.guide`) et la récompense unique (serveur pour les comptes).
 */
import { decisionKind, eventsFor, viewFor, waitingFor, type CfAction, type CfEvent } from '../../../shared/cards/engine';
import { CF_TUTORIAL_CAPSULES, CfTutorial, TUTO_BOT, TUTO_BOT_NAME, TUTO_ME, TUTO_VISIBLE } from '../../../shared/cards/tutorial';
import { cfTutorialDone } from './api';
import { ScreenGate, type CfController, type CfGuide, type CfSeat, type CfSnapshot } from './controller';

const SEEN = '421.cf.tuto';
/** Partie guidée déjà vue sur cet appareil (terminée ou passée). */
export const tutorialSeen = () => { try { return !!localStorage.getItem(SEEN); } catch { return false; } };
export const markTutorialSeen = (how: 'fini' | 'passe' | 'propose') => { try { if (how !== 'propose' || !localStorage.getItem(SEEN)) localStorage.setItem(SEEN, how); } catch { /* */ } };

export interface TutorialOptions {
  me: { name: string; avatar?: string; photo?: string | null; account?: string };
  token?: string | null;
  /** Pauses de Dédé (1 = normal, 0 = tests). */
  pace?: number;
  /** Rappelé quand la récompense est versée (état du mode à jour). */
  onReward?: () => void;
}

export class TutorialCfController implements CfController {
  readonly kind = 'bot' as const;
  readonly ranked = false;
  readonly me = TUTO_ME;
  readonly tutorial = true;
  readonly rewarded: boolean;
  readonly notice = null;
  readonly run: CfTutorial;
  private seats: CfSeat[];
  private subs = new Set<(snap: CfSnapshot, events: CfEvent[]) => void>();
  private snap: CfSnapshot | null = null;
  private busy = false;
  private closed = false;
  private finished: CfSnapshot['finished'] = null;
  private pace: number;

  constructor(private o: TutorialOptions) {
    this.run = new CfTutorial(o.me.name || 'Vous');
    this.pace = o.pace ?? 1;
    this.rewarded = !!o.token;
    this.seats = [
      { id: TUTO_ME, name: o.me.name || 'Vous', avatar: o.me.avatar, photo: o.me.photo ?? undefined, account: o.me.account },
      { id: TUTO_BOT, name: TUTO_BOT_NAME, bot: true, avatar: '🍺', label: 'Partie guidée' },
    ];
  }

  current() { return this.snap; }
  subscribe(cb: (snap: CfSnapshot, events: CfEvent[]) => void) {
    this.subs.add(cb);
    if (!this.snap) { this.publish(this.run.startEvents); void this.advance(); } else cb(this.snap, []);
    return () => { this.subs.delete(cb); };
  }

  async act(a: CfAction): Promise<string | null> {
    if (this.closed) return 'La partie guidée est terminée.';
    if (this.busy) return 'Un instant…';
    const r = this.run.play(a);
    if (!r.ok) return r.error ?? 'Action impossible.';
    this.publish(r.events);
    await this.advance();
    return null;
  }

  /** Bouton « Continuer » d'une étape d'explication. */
  guideNext() {
    if (this.busy || this.closed || this.run.current?.kind !== 'info') return;
    this.run.next();
    this.publish([]);
    void this.advance();
  }

  leave() { this.closed = true; this.gate.release(); markTutorialSeen('passe'); }

  /** L'écran anime (true) ou est au repos (false). */
  private gate = new ScreenGate();
  screen(busy: boolean) { this.gate.set(busy); }

  /** Fait jouer Dédé tant que c'est à lui (avec des pauses), puis rend la main. */
  private async advance() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (!this.closed && this.run.current?.kind === 'bot') {
        const k = decisionKind(this.run.state);
        // La pause part quand l'écran a fini d'animer le coup précédent (rythme régulier).
        if (this.pace > 0) await this.gate.idle();
        await this.wait(this.run.current.text ? 1500 : k === 'respond' ? 500 : 650);
        if (this.closed) return;
        this.publish(this.run.bot());
      }
    } finally { this.busy = false; }
    if (this.run.over && !this.finished) await this.finish();
    else this.publish([]);
  }

  private wait(ms: number) { return this.pace <= 0 ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, ms * this.pace)); }

  private async finish() {
    markTutorialSeen('fini');
    const standings = [...this.run.state.ranking];
    this.finished = { standings };
    this.closed = true;
    this.publish([]);
    if (!this.o.token) {
      this.finished = { standings, reward: { note: `Partie guidée terminée ! Avec un compte gratuit, elle rapporte ${CF_TUTORIAL_CAPSULES} capsules (une fois).` } };
    } else {
      try {
        const r = await cfTutorialDone(this.o.token);
        this.finished = { standings, reward: { capsules: r.capsules } };
        this.o.onReward?.();
      } catch (e) {
        this.finished = { standings, reward: { note: e instanceof Error ? e.message : 'Récompense non enregistrée.' } };
      }
    }
    this.publish([]);
  }

  private guide(): CfGuide | null {
    const st = this.run.current;
    if (!st || this.finished) return null;
    if (st.kind === 'bot') return st.text ? { text: st.text, index: this.run.visibleIndex, total: TUTO_VISIBLE } : null;
    return { title: st.title, text: st.text, next: st.kind === 'info' ? st.button ?? 'Continuer' : undefined, focus: st.focus, index: this.run.visibleIndex, total: TUTO_VISIBLE };
  }

  private publish(events: CfEvent[]) {
    const s = this.run.state;
    const snap: CfSnapshot = {
      view: viewFor(s, TUTO_ME),
      legal: this.closed || this.busy ? [] : this.run.legal(),
      waitingFor: waitingFor(s),
      seats: this.seats,
      deadline: null,
      finished: this.finished,
      guide: this.guide(),
    };
    this.snap = snap;
    const ev = eventsFor(events, TUTO_ME);
    for (const cb of [...this.subs]) cb(snap, ev);
  }
}
