/**
 * Musique d'ambiance, composée et jouée en direct (Web Audio) : aucun fichier à télécharger.
 *
 * `compose.ts` écrit la partition d'un morceau (avec une graine tirée à chaque écoute) ; ici on la
 * joue avec de petits instruments synthétisés (piano électrique, accordéon, guitares, orgue, saxo,
 * violon, clarinette, flûte, vibraphone, nappes, contrebasse, batterie aux balais), une réverbération
 * de salle, des craquements de vinyle et, pour certains morceaux, la pluie contre la vitrine.
 * Les morceaux s'enchaînent avec un fondu, dans un ordre au hasard sans répéter le même deux fois.
 *
 * Léger sur téléphone : on ne programme que 0,5 s à l'avance, chaque note libère ses nœuds en
 * fin de vie, le nombre de voix est plafonné, et le contexte audio est suspendu quand la musique
 * est coupée ou l'onglet caché.
 */
import { compose, pickNext, songsFor, SONGS, type Ev, type Inst, type Mood, type Score } from './compose';

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const LOOKAHEAD = 0.5;
const MAX_VOICES = 56;

/** Réglages de mélange : volume, place dans la stéréo, part de réverbération. */
const MIX: Record<Inst, { g: number; pan: number; rev: number }> = {
  ep: { g: 0.5, pan: -0.15, rev: 0.35 }, acc: { g: 0.3, pan: 0.1, rev: 0.3 }, gtr: { g: 0.36, pan: 0.25, rev: 0.2 },
  nyl: { g: 0.5, pan: -0.2, rev: 0.3 }, bass: { g: 0.9, pan: 0, rev: 0.05 }, organ: { g: 0.36, pan: -0.1, rev: 0.3 },
  sax: { g: 0.32, pan: 0.15, rev: 0.45 }, viol: { g: 0.3, pan: 0.2, rev: 0.45 }, clar: { g: 0.26, pan: 0.15, rev: 0.4 },
  flute: { g: 0.42, pan: 0.2, rev: 0.45 }, vib: { g: 0.46, pan: 0.2, rev: 0.45 }, pad: { g: 0.26, pan: 0, rev: 0.6 },
  pizz: { g: 0.6, pan: -0.1, rev: 0.25 }, kick: { g: 0.8, pan: 0, rev: 0.02 }, snare: { g: 0.5, pan: 0.05, rev: 0.25 },
  brush: { g: 0.5, pan: 0.05, rev: 0.2 }, hat: { g: 0.36, pan: 0.3, rev: 0.1 }, rim: { g: 0.45, pan: -0.1, rev: 0.25 },
  shaker: { g: 0.3, pan: 0.35, rev: 0.1 }, tom: { g: 0.6, pan: -0.15, rev: 0.25 },
};

export interface Channels { bus: GainNode; chans: Map<Inst, AudioNode> }

/** Les instruments et la chaîne de sortie, utilisables aussi avec un OfflineAudioContext. */
export class MusicEngine {
  readonly input: GainNode;
  private rev: GainNode;
  private noise: AudioBuffer;
  private voices = 0;

  constructor(readonly ctx: BaseAudioContext, dest: AudioNode) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.input = ctx.createGain();
    this.input.connect(lp).connect(comp).connect(dest);
    // Réverbération de salle de bistrot (réponse impulsionnelle synthétique, 1,8 s)
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6 * (i < 200 ? i / 200 : 1);
    }
    conv.buffer = ir;
    this.rev = ctx.createGain(); this.rev.gain.value = 0.55;
    const revLp = ctx.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 3200;
    this.rev.connect(revLp).connect(conv).connect(this.input);
    const nlen = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  }

  /** Une tranche de mélange par morceau (pour les fondus). */
  channels(): Channels {
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.connect(this.input);
    const send = ctx.createGain(); send.gain.value = 1; send.connect(this.rev);
    const chans = new Map<Inst, AudioNode>();
    for (const [i, m] of Object.entries(MIX) as [Inst, (typeof MIX)[Inst]][]) {
      const g = ctx.createGain(); g.gain.value = m.g;
      let node: AudioNode = g;
      if (typeof ctx.createStereoPanner === 'function') { const p = ctx.createStereoPanner(); p.pan.value = m.pan; g.connect(p); node = p; }
      node.connect(bus);
      const s = ctx.createGain(); s.gain.value = m.rev; node.connect(s).connect(send);
      chans.set(i, g);
    }
    return { bus, chans };
  }

  /** Bruits d'ambiance continus (pluie, souffle du vinyle) ; renvoie les sources à arrêter. */
  ambience(amb: { rain: number; vinyl: number }, at: number, dest: AudioNode): AudioScheduledSourceNode[] {
    const ctx = this.ctx;
    const out: AudioScheduledSourceNode[] = [];
    const loop = (gain: number, type: BiquadFilterType, freq: number, q: number, rate: number) => {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = rate;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 3);
      src.connect(f).connect(g).connect(dest); src.start(at, Math.random() * 2);
      out.push(src);
    };
    if (amb.rain > 0) {
      loop(0.028 * amb.rain, 'bandpass', 1400, 0.4, 1);
      loop(0.022 * amb.rain, 'lowpass', 380, 0.5, 0.7);
    }
    if (amb.vinyl > 0) loop(0.006 * amb.vinyl, 'highpass', 5500, 0.5, 1);
    return out;
  }

  /** Petits bruits aléatoires : craquements du disque, gouttes sur la vitrine. */
  speck(at: number, kind: 'crackle' | 'drop', amount: number, dest: AudioNode) {
    if (kind === 'crackle') this.noiseHit(dest, at, 0.012, (0.04 + Math.random() * 0.06) * amount, 'highpass', 2500, 1);
    else this.noiseHit(dest, at, 0.03, (0.03 + Math.random() * 0.05) * amount, 'bandpass', 2500 + Math.random() * 3000, 4);
  }

  private track(last: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.voices++;
    last.onended = () => { this.voices--; for (const n of nodes) n.disconnect(); };
  }

  /** Joue un événement de la partition à l'instant `at` (temps du contexte audio). */
  play(e: Ev, at: number, ch: Channels) {
    const dest = ch.chans.get(e.i);
    if (!dest) return;
    const lowPriority = e.i === 'hat' || e.i === 'shaker' || e.i === 'pad' || e.i === 'ep' || e.i === 'gtr' || e.i === 'nyl' || e.i === 'acc';
    if (this.voices > MAX_VOICES && lowPriority) return;
    const ctx = this.ctx;
    const v = e.v, d = e.d, f = hz(e.n);
    const osc = (type: OscillatorType, freq: number, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det; return o; };
    const gain = (x = 0) => { const g = ctx.createGain(); g.gain.value = x; return g; };
    const filt = (type: BiquadFilterType, freq: number, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; b.Q.value = q; return b; };
    const vibrato = (targets: OscillatorNode[], rate: number, cents: number, end: number) => {
      const l = osc('sine', rate); const lg = gain(0);
      lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(cents, at + Math.min(0.5, d * 0.6) + 0.05);
      l.connect(lg); for (const t of targets) lg.connect(t.detune);
      l.start(at); l.stop(end);
      return [l, lg] as const;
    };

    switch (e.i) {
      case 'ep': {
        // Piano électrique : synthèse FM douce (la « lame » qui tinte à l'attaque)
        const c = osc('sine', f), m = osc('sine', f), mg = gain(0), g = gain(0);
        mg.gain.setValueAtTime(f * 1.6 * v, at); mg.gain.setTargetAtTime(f * 0.15, at, 0.12);
        m.connect(mg).connect(c.frequency);
        const pk = 0.22 * v, end = at + d;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(pk, at + 0.006);
        g.gain.setTargetAtTime(pk * 0.3, at + 0.01, 0.7); g.gain.setTargetAtTime(0, end, 0.12);
        c.connect(g).connect(dest);
        m.start(at); c.start(at); m.stop(end + 0.7); c.stop(end + 0.7);
        this.track(c, [m, mg, c, g]);
        break;
      }
      case 'acc': case 'organ': case 'pad': {
        const acc = e.i === 'acc', pad = e.i === 'pad';
        const type: OscillatorType = acc ? 'sawtooth' : pad ? 'sawtooth' : 'sine';
        const a = osc(type, f, acc ? -9 : pad ? -7 : 0), b = acc || pad ? osc(type, f, acc ? 9 : 7) : osc('triangle', f * 2);
        const lp = filt('lowpass', acc ? 2300 : pad ? 900 : 3000, acc ? 0.8 : 0.5);
        const g = gain(0), bg = gain(acc || pad ? 1 : 0.35);
        const pk = (acc ? 0.11 : pad ? 0.09 : 0.13) * v, atk = acc ? 0.035 : pad ? Math.min(0.9, d * 0.4) : 0.015, end = at + d;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(pk, at + atk);
        if (!pad) g.gain.setTargetAtTime(pk * 0.8, at + atk, 0.4);
        g.gain.setTargetAtTime(0, end, pad ? 0.5 : acc ? 0.05 : 0.08);
        a.connect(lp); b.connect(bg).connect(lp); lp.connect(g).connect(dest);
        const stop = end + (pad ? 2.5 : 0.5);
        a.start(at); b.start(at); a.stop(stop); b.stop(stop);
        this.track(a, [a, b, bg, lp, g]);
        break;
      }
      case 'gtr': case 'nyl': case 'pizz': {
        // Cordes pincées : onde filtrée dont le filtre se referme vite
        const nyl = e.i === 'nyl', piz = e.i === 'pizz';
        const o = osc(nyl || piz ? 'triangle' : 'sawtooth', f);
        const lp = filt('lowpass', 0, nyl ? 1 : 2);
        const top = nyl ? 2600 : piz ? 1800 : 4200, bottom = nyl ? 600 : piz ? 400 : 900;
        lp.frequency.setValueAtTime(top, at); lp.frequency.setTargetAtTime(bottom, at, nyl ? 0.25 : 0.08);
        const g = gain(0), pk = (nyl ? 0.2 : piz ? 0.24 : 0.12) * v, end = at + d;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(pk, at + 0.004);
        g.gain.setTargetAtTime(0, at + 0.005, nyl ? 0.55 : piz ? 0.14 : d > 0.4 ? 0.35 : 0.09); g.gain.setTargetAtTime(0, end, 0.05);
        o.connect(lp).connect(g).connect(dest);
        o.start(at); o.stop(end + 0.4);
        this.track(o, [o, lp, g]);
        break;
      }
      case 'bass': {
        // Contrebasse : triangle + harmoniques filtrées (audible sur un petit haut-parleur)
        const a = osc('triangle', f), b = osc('sawtooth', f), lp = filt('lowpass', 700, 1), bg = gain(0.35), g = gain(0);
        const pk = 0.3 * v, end = at + d;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(pk, at + 0.012);
        g.gain.setTargetAtTime(pk * 0.45, at + 0.015, 0.3); g.gain.setTargetAtTime(0, end, 0.05);
        a.connect(g); b.connect(bg).connect(lp).connect(g); g.connect(dest);
        a.start(at); b.start(at); a.stop(end + 0.3); b.stop(end + 0.3);
        this.track(a, [a, b, bg, lp, g]);
        break;
      }
      case 'sax': case 'clar': case 'viol': case 'flute': {
        // Instruments à vent / archet : souffle de l'attaque, vibrato qui arrive après
        const type: OscillatorType = e.i === 'clar' ? 'square' : e.i === 'flute' ? 'sine' : 'sawtooth';
        const o = osc(type, f);
        const lp = filt('lowpass', 0, e.i === 'sax' ? 2.2 : 0.7);
        const bright = e.i === 'sax' ? 1900 : e.i === 'viol' ? 2800 : e.i === 'clar' ? 1500 : 4000;
        lp.frequency.setValueAtTime(bright * 0.45, at); lp.frequency.linearRampToValueAtTime(bright, at + 0.08);
        const g = gain(0), pk = (e.i === 'flute' ? 0.2 : e.i === 'clar' ? 0.07 : 0.1) * v;
        const atk = e.i === 'viol' ? 0.09 : e.i === 'flute' ? 0.05 : 0.035, end = at + d;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(pk, at + atk);
        g.gain.setTargetAtTime(pk * 0.75, at + atk, 0.3); g.gain.setTargetAtTime(0, end, 0.07);
        o.connect(lp).connect(g).connect(dest);
        const stop = end + 0.4;
        const extra: AudioNode[] = [];
        if (d > 0.3) extra.push(...vibrato([o], e.i === 'flute' ? 4.6 : 5.4, e.i === 'viol' ? 14 : 9, stop));
        o.start(at); o.stop(stop);
        this.track(o, [o, lp, g, ...extra]);
        break;
      }
      case 'vib': {
        const a = osc('sine', f), b = osc('sine', f * 4), bg = gain(0), g = gain(0);
        const pk = 0.2 * v, end = at + d;
        bg.gain.setValueAtTime(0.25, at); bg.gain.setTargetAtTime(0, at, 0.05);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(pk, at + 0.003);
        g.gain.setTargetAtTime(0, at + 0.005, 0.9); g.gain.setTargetAtTime(0, end, 0.3);
        a.connect(g); b.connect(bg).connect(g); g.connect(dest);
        a.start(at); b.start(at); a.stop(end + 1.2); b.stop(at + 0.3);
        this.track(a, [a, b, bg, g]);
        break;
      }
      case 'kick': case 'tom': {
        const o = osc('sine', 0), g = gain(0);
        const f0 = e.i === 'kick' ? 115 : [210, 165, 125][e.n] ?? 150, f1 = e.i === 'kick' ? 44 : f0 * 0.65;
        o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + (e.i === 'kick' ? 0.14 : 0.2));
        g.gain.setValueAtTime(0.5 * v, at); g.gain.setTargetAtTime(0, at + 0.01, e.i === 'kick' ? 0.09 : 0.14);
        o.connect(g).connect(dest); o.start(at); o.stop(at + 0.6);
        this.track(o, [o, g]);
        break;
      }
      case 'snare': this.noiseHit(dest, at, 0.16, 0.35 * v, 'bandpass', 1900, 0.7); break;
      case 'brush': {
        // Balai qui frotte la caisse : souffle lent
        const src = ctx.createBufferSource(); src.buffer = this.noise;
        const bp = filt('bandpass', 3200, 0.6), g = gain(0), pk = 0.16 * v;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(pk, at + Math.min(0.25, d * 0.3)); g.gain.setTargetAtTime(0, at + Math.min(0.25, d * 0.3), d * 0.3);
        src.connect(bp).connect(g).connect(dest); src.start(at, Math.random() * 2); src.stop(at + d + 0.3);
        this.track(src, [src, bp, g]);
        break;
      }
      case 'hat': this.noiseHit(dest, at, 0.035, 0.22 * v, 'highpass', 7500, 0.7); break;
      case 'shaker': this.noiseHit(dest, at, 0.05, 0.16 * v, 'highpass', 5200, 0.7, 0.012); break;
      case 'rim': {
        const o = osc('triangle', 820), g = gain(0);
        g.gain.setValueAtTime(0.3 * v, at); g.gain.setTargetAtTime(0, at, 0.018);
        o.connect(g).connect(dest); o.start(at); o.stop(at + 0.12);
        this.track(o, [o, g]);
        this.noiseHit(dest, at, 0.02, 0.18 * v, 'bandpass', 2600, 1.5);
        break;
      }
    }
  }

  private noiseHit(dest: AudioNode, at: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q: number, atk = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(atk ? 0 : peak, at);
    if (atk) g.gain.linearRampToValueAtTime(peak, at + atk);
    g.gain.setTargetAtTime(0, at + atk, dur / 3);
    src.connect(fl).connect(g).connect(dest); src.start(at, Math.random() * 2.5); src.stop(at + atk + dur * 2 + 0.02);
    this.track(src, [src, fl, g]);
  }
}

// ---------------------------------------------------------------------------------------------
// Lecteur : enchaînement des morceaux, fondus, pause, ambiance « cartes »

interface Playing { score: Score; ch: Channels; start: number; idx: number; amb: AudioScheduledSourceNode[] }
export interface TrackInfo { id: string; title: string; mood: string }

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private engine: MusicEngine | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cur: Playing | null = null;
  private level = 0.4;
  private mood: Mood = 'normal';
  private upcoming: string = pickNext(songsFor('normal').map((s) => s.id), null);
  private stoppedAt = 0;
  private listeners = new Set<() => void>();

  /** Volume de 0 à 1 (0 : musique arrêtée). */
  setVolume(v: number) {
    this.level = Math.max(0, Math.min(1, v));
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.level * 0.5, this.ctx.currentTime, 0.3);
    if (this.level === 0) { this.stop(); if (this.ctx) void this.ctx.suspend().catch(() => {}); }
    else if (this.ctx) { void this.ctx.resume().catch(() => {}); this.start(); }
  }

  /** À appeler après un geste de l'utilisateur (exigence des navigateurs). */
  unlock() {
    if (this.level === 0) return;
    if (!this.ctx) {
      if (typeof window === 'undefined') return;
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.out = this.ctx.createGain(); this.out.gain.value = this.level * 0.5;
        this.out.connect(this.ctx.destination);
        this.engine = new MusicEngine(this.ctx, this.out);
      } catch { this.ctx = null; return; }
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    this.start();
  }

  /** Onglet caché : on suspend tout ; au retour, on reprend là où on en était. */
  pause(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) { this.stop(); void this.ctx.suspend().catch(() => {}); }
    else if (this.level > 0) { void this.ctx.resume().catch(() => {}); this.start(); }
  }

  /** Morceau en cours (ou celui qui va commencer). */
  info(): TrackInfo {
    const s = this.cur?.score ?? SONGS.find((x) => x.id === this.upcoming)!;
    return { id: s.id, title: s.title, mood: s.mood };
  }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  /** Passe au morceau suivant, avec un fondu. */
  next() {
    if (this.ctx && this.cur && this.timer) this.begin(this.ctx.currentTime + 0.6, 1.2);
    else {
      this.upcoming = pickNext(songsFor(this.mood).map((s) => s.id), this.cur?.score.id ?? this.upcoming);
      if (this.cur) this.retire(0.3);
      this.emit();
    }
  }

  /** Ambiance : « cartes » (Coups Fourrés, plus tendue) ou « normal ». */
  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    const pool = songsFor(mood).map((s) => s.id);
    if (this.cur && pool.includes(this.cur.score.id)) return; // le morceau en cours convient déjà
    this.upcoming = pickNext(pool, this.cur?.score.id ?? null);
    if (this.ctx && this.cur && this.timer) this.begin(this.ctx.currentTime + 0.8, 2);
    else { if (this.cur) this.retire(0.3); this.emit(); }
  }

  private emit() { for (const fn of this.listeners) { try { fn(); } catch { /* écouteur fautif ignoré */ } } }

  private start() {
    if (this.timer || !this.ctx) return;
    // Reprise : on recale le morceau sur l'horloge (si elle a avancé pendant l'arrêt).
    if (this.cur) this.cur.start += Math.max(0, this.ctx.currentTime - this.stoppedAt);
    this.timer = setInterval(() => this.tick(), 120);
    this.tick();
  }
  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) this.stoppedAt = this.ctx.currentTime;
  }

  private retire(fade: number) {
    const p = this.cur;
    if (!p || !this.ctx) { this.cur = null; return; }
    this.cur = null;
    const now = this.ctx.currentTime;
    p.ch.bus.gain.cancelScheduledValues(now);
    p.ch.bus.gain.setValueAtTime(p.ch.bus.gain.value, now);
    p.ch.bus.gain.setTargetAtTime(0, now, fade / 3);
    for (const s of p.amb) { try { s.stop(now + fade + 0.2); } catch { /* déjà arrêtée */ } }
    setTimeout(() => { try { p.ch.bus.disconnect(); } catch { /* déjà débranché */ } }, (fade + 4) * 1000);
  }

  /** Lance le morceau prévu à l'instant `at` ; l'ancien s'éteint en `fade` secondes. */
  private begin(at: number, fade: number) {
    if (!this.ctx || !this.engine) return;
    const id = this.upcoming;
    const lastId = this.cur?.score.id ?? null;
    if (this.cur) this.retire(fade);
    const score = compose(id === lastId ? pickNext(songsFor(this.mood).map((s) => s.id), lastId) : id, newSeed());
    const ch = this.engine.channels();
    if (fade > 0.5 && lastId) { ch.bus.gain.setValueAtTime(0.0001, at - 0.3); ch.bus.gain.exponentialRampToValueAtTime(1, at + 1.2); }
    const amb = this.engine.ambience(score.ambience, at, ch.bus);
    this.cur = { score, ch, start: at, idx: 0, amb };
    this.upcoming = pickNext(songsFor(this.mood).map((s) => s.id), score.id);
    this.emit();
  }

  private tick() {
    const ctx = this.ctx, eng = this.engine;
    if (!ctx || !eng || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (!this.cur) this.begin(now + 0.15, 0);
    const p = this.cur!;
    const ev = p.score.events;
    while (p.idx < ev.length) {
      const e = ev[p.idx];
      const at = p.start + e.t;
      if (at > now + LOOKAHEAD) break;
      if (at >= now - 0.05) eng.play(e, Math.max(at, now), p.ch); // une note en retard est sautée, pas empilée
      p.idx++;
    }
    // Craquements du vinyle, gouttes de pluie
    const a = p.score.ambience;
    if (a.vinyl > 0 && Math.random() < 0.45 * a.vinyl) eng.speck(now + LOOKAHEAD * Math.random(), 'crackle', 1, p.ch.bus);
    if (a.rain > 0 && Math.random() < 0.5 * a.rain) eng.speck(now + LOOKAHEAD * Math.random(), 'drop', a.rain, p.ch.bus);
    // Fin du morceau : le suivant démarre pendant que la dernière note résonne.
    if (p.idx >= ev.length && now > p.start + p.score.duration - 2) this.begin(now + 0.3, 3);
  }
}

export const music = new Music();
