/**
 * Sons synthétisés en temps réel (WebAudio) : aucun fichier audio à charger.
 * Les impacts sont générés à partir des collisions réellement simulées, avec une intensité
 * proportionnelle à la vitesse d'impact : un dé qui frappe fort la paroi sonne fort.
 */
import type { ImpactKind } from '../physics/diceSim';
import { createFx, impact as synthImpact, makeNoise, pickup as synthPickup, type RimKind } from './synth';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private fx: { input: GainNode; output: GainNode } | null = null;
  private rim: RimKind = 'wood';
  private voices = 0;
  volume = 0.8;
  muted = false;

  /** À appeler lors d'un geste utilisateur (exigence des navigateurs). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.noise = makeNoise(this.ctx);
      this.fx = createFx(this.ctx);
      this.fx.output.connect(this.master);
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  configure(o: { volume: number; muted: boolean }) {
    this.volume = o.volume;
    this.muted = o.muted;
    this.applyVolume();
  }

  private applyVolume() {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  private ready() {
    return this.ctx && this.master && this.noise && this.fx && !this.muted && this.volume > 0 ? this.ctx : null;
  }

  /** Impact de dé : son « gras » synthétisé (voir synth.ts), spatialisé gauche/droite. */
  impact(kind: ImpactKind, strength: number, pan = 0) {
    const ctx = this.ready();
    if (!ctx || this.voices > 28) return;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan * 0.7;
    panner.connect(this.fx!.input);
    const dur = synthImpact(ctx, panner, this.noise!, ctx.currentTime, kind, strength, this.rim);
    if (!dur) { panner.disconnect(); return; }
    this.voices++;
    setTimeout(() => { this.voices--; panner.disconnect(); }, (dur + 0.1) * 1000);
  }

  /** Dés ramassés et secoués dans la main, juste avant le lancer. */
  pickup(dice: number) {
    const ctx = this.ready();
    if (!ctx || dice <= 0) return;
    synthPickup(ctx, this.fx!.input, this.noise!, ctx.currentTime, dice);
  }

  /** Gobelet secoué : les dés cliquettent contre le cuir pendant ~0,6 s. */
  rattle() {
    const ctx = this.ready();
    if (!ctx) return;
    for (let k = 0; k < 14; k++) synthImpact(ctx, this.fx!.input, this.noise!, ctx.currentTime + 0.02 + k * 0.042 + Math.random() * 0.015, 'de', 2.5 + Math.random() * 3.5);
  }

  /** Matière du rebord (boutique) : change le son des chocs contre la paroi. */
  setRim(kind: RimKind) { this.rim = kind; }

  private tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'triangle') {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Validation d'un tour : deux notes discrètes. */
  validate() { this.tone(660, 0, 0.12, 0.12, 'sine'); this.tone(990, 0.07, 0.16, 0.08, 'sine'); }
  /** Clic d'interface (sélection d'un dé). */
  click() { this.tone(1400, 0, 0.05, 0.06, 'sine'); }
  /** Jetons qui changent de main. */
  chips(n: number) {
    for (let i = 0; i < Math.min(n, 8); i++) this.tone(2100 + Math.random() * 600, i * 0.045, 0.06, 0.05, 'square');
  }
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * 0.12, 0.45, 0.16)); this.tone(1318, 0.5, 0.8, 0.1); }
  lose() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, i * 0.18, 0.5, 0.14, 'sine')); }
  /** Grand coup (4-2-1, trois as) : accord brillant. */
  jackpot() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, i * 0.07, 0.9, 0.11));
    this.tone(392, 0, 1.1, 0.12, 'sine');
  }
  /** Dernières secondes du temps de jeu. */
  tick() { this.tone(1250, 0, 0.04, 0.05, 'square'); }
  turn() { this.tone(880, 0, 0.08, 0.05, 'sine'); }

}

export const sound = new SoundEngine();
