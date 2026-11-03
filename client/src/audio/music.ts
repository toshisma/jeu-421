/**
 * Musique d'ambiance lofi, composée en direct (WebAudio) : trois morceaux originaux qui
 * s'enchaînent en boucle. Accords feutrés façon piano électrique, basse ronde, batterie douce
 * et craquements de vinyle. Aucun fichier à télécharger.
 */
interface Track { bpm: number; chords: number[][]; bass: number[]; melody: (number | null)[] }

// Notes MIDI. Chaque morceau : 4 accords d'une mesure, une basse par accord, une petite mélodie (croches).
const TRACKS: Track[] = [
  { bpm: 74, chords: [[62, 65, 69, 72], [60, 64, 67, 71], [57, 60, 64, 67], [55, 59, 62, 65]], bass: [38, 36, 33, 31],
    melody: [76, null, 74, null, 72, null, null, 69, 71, null, 72, null, 74, null, null, null, 72, null, 69, null, 67, null, 64, null, 65, null, 67, null, 69, null, null, null] },
  { bpm: 82, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 58, 62, 65], [52, 55, 59, 62]], bass: [33, 29, 31, 28],
    melody: [null, 72, null, 71, 69, null, 67, null, 69, null, null, null, 72, null, 74, null, 76, null, 74, 72, null, 71, null, null, 69, null, 67, null, 64, null, null, null] },
  { bpm: 70, chords: [[60, 63, 67, 70], [58, 62, 65, 69], [56, 60, 63, 67], [55, 58, 62, 65]], bass: [36, 34, 32, 31],
    melody: [75, null, null, 74, 72, null, 70, null, null, null, 67, null, 70, null, 72, null, 74, null, null, 72, 70, null, 67, null, 65, null, 63, null, 62, null, null, null] },
];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private step = 0;
  private track = 0;
  private level = 0.4;

  /** Volume de 0 à 1 (0 : musique arrêtée). */
  setVolume(v: number) {
    this.level = Math.max(0, Math.min(1, v));
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.level * 0.32, this.ctx.currentTime, 0.3);
    if (this.level === 0) this.stop(); else if (this.ctx) this.start();
  }
  /** À appeler après un geste de l'utilisateur (exigence des navigateurs). */
  unlock() {
    if (this.level === 0) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
      this.out = this.ctx.createGain(); this.out.gain.value = this.level * 0.32;
      this.out.connect(lp).connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
    this.start();
  }
  private start() {
    if (this.timer || !this.ctx) return;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }
  private stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  pause(hidden: boolean) { if (!this.ctx) return; if (hidden) { this.stop(); void this.ctx.suspend(); } else if (this.level > 0) { void this.ctx.resume(); this.start(); } }

  private schedule() {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + 0.4) {
      const t = TRACKS[this.track];
      const eighth = 60 / t.bpm / 2;
      const s = this.step % 32; // 4 mesures de 8 croches
      const bar = Math.floor(s / 8);
      const swing = s % 2 ? eighth * 0.16 : 0;
      const at = this.next + swing;
      if (s % 8 === 0) { this.chord(t.chords[bar], at, eighth * 8); this.bass(t.bass[bar], at, eighth * 3); }
      if (s % 8 === 5) this.bass(t.bass[bar] + 7, at, eighth * 1.5);
      if (s % 8 === 0 || s % 8 === 5) this.kick(at);
      if (s % 8 === 4) this.snare(at);
      this.hat(at, s % 2 ? 0.025 : 0.04);
      const m = t.melody[s];
      if (m != null && this.step % 64 >= 32) this.keys([m], at, eighth * 1.8, 0.05);
      if (Math.random() < 0.35) this.crackle(at + Math.random() * eighth);
      this.next += eighth;
      this.step++;
      if (this.step >= 32 * 4) { this.step = 0; this.track = (this.track + 1) % TRACKS.length; } // 16 mesures par morceau
    }
  }
  private keys(notes: number[], at: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    for (const n of notes) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(n); o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.03); g.gain.exponentialRampToValueAtTime(gain * 0.35, at + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        o.connect(g).connect(this.out!); o.start(at); o.stop(at + dur + 0.05);
      }
    }
  }
  private chord(notes: number[], at: number, dur: number) { this.keys(notes, at, dur, 0.035); }
  private bass(n: number, at: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(n);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.16, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.out!); o.start(at); o.stop(at + dur + 0.05);
  }
  private kick(at: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.32, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    o.connect(g).connect(this.out!); o.start(at); o.stop(at + 0.35);
  }
  private noiseHit(at: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.out!); src.start(at, Math.random()); src.stop(at + dur + 0.02);
  }
  private snare(at: number) { this.noiseHit(at, 0.18, 0.1, 'bandpass', 1700); }
  private hat(at: number, gain: number) { this.noiseHit(at, 0.04, gain, 'highpass', 7000); }
  private crackle(at: number) { this.noiseHit(at, 0.012, 0.03 + Math.random() * 0.04, 'highpass', 2500); }
}

export const music = new Music();
