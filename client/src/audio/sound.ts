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
  /** Petits sons des célébrations du 4-2-1 (discrets : le son du jackpot reste le principal). */
  party(kind: 'coin' | 'boom' | 'pop' | 'thunder', s: number) {
    if (kind === 'coin') { const f = 2400 + Math.random() * 900; this.tone(f, 0, 0.18, 0.03 * s, 'sine'); this.tone(f * 1.5, 0.01, 0.12, 0.015 * s, 'sine'); }
    else if (kind === 'boom') { this.hit(0, 0.5, 0.12 * s, 180, 0.7); this.hit(0.03, 0.9, 0.04 * s, 3200, 0.5); }
    else if (kind === 'pop') { this.hit(0, 0.12, 0.08 * s, 900, 1.2); this.hit(0.05, 0.1, 0.06 * s, 1300, 1.2); }
    else { this.hit(0, 0.25, 0.14 * s, 2500, 0.4); this.hit(0.05, 1.3, 0.12 * s, 90, 0.6); }
  }
  /** Dernières secondes du temps de jeu. */
  tick() { this.tone(1250, 0, 0.04, 0.05, 'square'); }
  turn() { this.tone(880, 0, 0.08, 0.05, 'sine'); }

  /** Coup de bruit filtré (caisse claire, souffle, cymbale). */
  private hit(start: number, dur: number, gain: number, freq: number, q = 1) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource(); src.buffer = this.noise!;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t); src.stop(t + dur + 0.05);
  }
  /** Note qui glisse d'une fréquence à l'autre (montée de tension). */
  private sweep(f0: number, f1: number, start: number, dur: number, gain: number, type: OscillatorType = 'sawtooth') {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(3200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(lp).connect(g).connect(this.master!);
    o.start(t); o.stop(t + dur + 0.1);
  }
  /** Trésor trouvé : petite montée scintillante puis accord triomphal (composition originale). */
  treasure() {
    [392, 440, 494, 523, 587, 659, 740, 784].forEach((f, i) => this.tone(f * 2, i * 0.055, 0.12, 0.06, 'square'));
    [[523, 0.5], [659, 0.5], [784, 0.5], [1046, 0.5]].forEach(([f, s0]) => this.tone(f, s0, 1.1, 0.1));
    this.tone(1568, 0.62, 0.9, 0.05, 'sine');
    this.tone(131, 0.5, 1.2, 0.12, 'sine');
  }
  /** Ouverture d'un sac : roulement de tambour qui accélère et montée de tension (durée en secondes). */
  bagBuild(dur: number) {
    let t = 0, gap = 0.16;
    while (t < dur) { this.hit(t, 0.07, 0.05 + 0.13 * (t / dur), 1800, 0.8); t += gap; gap = Math.max(0.035, gap * 0.9); }
    this.sweep(110, 880, 0, dur, 0.06);
    this.sweep(55, 220, 0, dur, 0.05, 'triangle');
    [0, dur * 0.5, dur * 0.8].forEach((s) => this.tone(55, s, 0.4, 0.18, 'sine'));
  }
  /** Révélation : coup de cymbale et fanfare d'autant plus longue que le dé est rare (0 commun → 3 légendaire). */
  bagReveal(tier: number) {
    this.hit(0, 1.4, 0.22, 6000, 0.4);
    this.tone(65, 0, 0.9, 0.3, 'sine');
    const C = [523, 659, 784, 1046];
    C.forEach((f, i) => this.tone(f, 0.05 + i * 0.08, 0.5, 0.12));
    if (tier >= 1) [587, 740, 880, 1175].forEach((f, i) => this.tone(f, 0.45 + i * 0.08, 0.55, 0.12));
    if (tier >= 2) {
      [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.85 + i * 0.08, 0.7, 0.12));
      [262, 392, 523].forEach((f) => this.tone(f, 0.85, 1.4, 0.07, 'sawtooth'));
    }
    if (tier >= 3) {
      // Fanfare finale et pluie d'étincelles.
      [[1046, 0], [1046, 0.12], [1046, 0.24], [1318, 0.4], [1568, 0.7]].forEach(([f, s]) => this.tone(f, 1.35 + s, s === 0.7 ? 1.4 : 0.14, 0.13));
      [262, 330, 392, 523].forEach((f) => this.tone(f, 2.05, 1.8, 0.06, 'sawtooth'));
      for (let i = 0; i < 14; i++) this.tone(2000 + Math.random() * 2500, 2.05 + i * 0.07, 0.25, 0.035, 'sine');
      this.hit(2.05, 1.8, 0.16, 7000, 0.4);
    }
  }

}

export const sound = new SoundEngine();
