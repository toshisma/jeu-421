/**
 * Synthèse des bruits de dés (WebAudio), sans fichier audio.
 *
 * Chaque impact superpose trois couches, dosées selon la surface touchée et la force réelle
 * de la collision simulée :
 *  - un « thump » grave (sinus dont la hauteur chute rapidement) : le poids, le côté « gras » ;
 *  - le corps : bruit filtré + modes de résonance de la matière (bois, cuir, laque, métal, dé) ;
 *  - un petit claquement aigu : l'arête du dé qui touche.
 * Le tout passe par une courte réverbération (le bac et la salle) et un compresseur (le punch).
 *
 * Les fonctions prennent un contexte quelconque : elles servent au jeu (AudioContext) et
 * à la génération des démos sonores (OfflineAudioContext).
 */
export type Surface = 'feutre' | 'paroi' | 'de';
export type RimKind = 'wood' | 'leather' | 'lacquer' | 'metal';

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = ctx.sampleRate;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Réponse impulsionnelle synthétique : petite pièce, queue courte et sombre. */
function makeRoom(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.45);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      lp += 0.25 * ((Math.random() * 2 - 1) - lp); // bruit adouci
      d[i] = lp * Math.exp(-t * 11) * (i < 60 ? i / 60 : 1);
    }
  }
  return b;
}

/**
 * Chaîne d'effets : entrée → (sec + réverbération) → compresseur → sortie.
 * Renvoie le nœud où brancher les sons, et celui à relier à la destination.
 */
export function createFx(ctx: BaseAudioContext): { input: GainNode; output: GainNode } {
  const input = ctx.createGain();
  const room = ctx.createConvolver();
  room.buffer = makeRoom(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.1;
  // Limiteur final : même un lancer très violent ne sature jamais.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  const trim = ctx.createGain();
  trim.gain.value = 0.42; // niveau d'entrée des impacts
  input.connect(trim);
  trim.connect(comp);
  trim.connect(room).connect(wet).connect(comp);
  comp.connect(makeup).connect(limiter);
  const output = ctx.createGain();
  limiter.connect(output);
  return { input, output };
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Sinus amorti, avec chute de hauteur optionnelle. */
function mode(ctx: BaseAudioContext, out: AudioNode, t: number, f0: number, f1: number, gain: number, decay: number, attack = 0.002) {
  if (gain < 0.002) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.7);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + decay + 0.02);
}

/** Bruit filtré bref. */
function burst(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number, type: BiquadFilterType, freq: number, q: number, gain: number, decay: number) {
  if (gain < 0.002) return;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.7, decay + 0.02);
}

/**
 * Un impact. `strength` = vitesse d'impact simulée (≈ 1 léger … 15 très fort).
 * Renvoie la durée du son (pour libérer la voix).
 */
export function impact(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number, kind: Surface, strength: number, rim: RimKind = 'wood'): number {
  // Courbe de force : les petits rebonds restent discrets, les gros impacts claquent.
  const a = Math.min(1.15, Math.pow(Math.max(0, strength) / 11, 1.25));
  if (a < 0.015) return 0;
  const p = rnd(0.93, 1.07); // chaque impact sonne un peu différemment

  if (kind === 'feutre') {
    // Le dé tombe sur la feutrine posée sur bois : gros « toc » sourd et mat.
    mode(ctx, out, t, (120 + strength * 5) * p, 46 * p, 0.95 * a, 0.17, 0.003);
    mode(ctx, out, t, 230 * p, 170 * p, 0.28 * a, 0.07);
    burst(ctx, out, noise, t, 'lowpass', 650 + strength * 45, 0.8, 0.55 * a, 0.075);
    burst(ctx, out, noise, t, 'highpass', 2600, 0.7, 0.09 * a, 0.012);
    return 0.2;
  }

  if (kind === 'de') {
    // Dé contre dé : claquement sec de résine, petite résonance aiguë.
    burst(ctx, out, noise, t, 'bandpass', 3600 * p, 3, 0.4 * a, 0.03);
    mode(ctx, out, t, 2250 * p, 2250 * p, 0.14 * a, 0.06);
    mode(ctx, out, t, 5100 * p, 5100 * p, 0.07 * a, 0.035);
    mode(ctx, out, t, 320 * p, 160 * p, 0.22 * a, 0.045);
    return 0.08;
  }

  // Paroi : le son dépend du rebord choisi dans la boutique.
  switch (rim) {
    case 'wood': {
      const f = 205 * p;
      mode(ctx, out, t, 130 * p, 58 * p, 0.75 * a, 0.14, 0.002);
      mode(ctx, out, t, f, f * 0.97, 0.5 * a, 0.13);
      mode(ctx, out, t, f * 2.63, f * 2.6, 0.24 * a, 0.075);
      mode(ctx, out, t, f * 4.1, f * 4.1, 0.1 * a, 0.04);
      burst(ctx, out, noise, t, 'bandpass', 1400, 1.4, 0.42 * a, 0.035);
      burst(ctx, out, noise, t, 'highpass', 3200, 0.7, 0.2 * a, 0.01);
      return 0.16;
    }
    case 'lacquer': {
      const f = 270 * p;
      mode(ctx, out, t, 140 * p, 62 * p, 0.6 * a, 0.12);
      mode(ctx, out, t, f, f, 0.45 * a, 0.1);
      mode(ctx, out, t, f * 2.9, f * 2.9, 0.22 * a, 0.06);
      burst(ctx, out, noise, t, 'bandpass', 2100, 1.8, 0.4 * a, 0.03);
      burst(ctx, out, noise, t, 'highpass', 4000, 0.7, 0.28 * a, 0.012);
      return 0.14;
    }
    case 'leather': {
      // Cuir rembourré : un coup étouffé, presque sans résonance.
      mode(ctx, out, t, 105 * p, 44 * p, 0.85 * a, 0.15, 0.004);
      burst(ctx, out, noise, t, 'lowpass', 520, 0.9, 0.55 * a, 0.06);
      burst(ctx, out, noise, t, 'bandpass', 1800, 1, 0.08 * a, 0.015);
      return 0.17;
    }
    case 'metal': {
      // Acier : « tong » métallique, partiels inharmoniques qui tintent.
      const f = 610 * p;
      mode(ctx, out, t, 140 * p, 70 * p, 0.45 * a, 0.1);
      mode(ctx, out, t, f, f, 0.2 * a, 0.55);
      mode(ctx, out, t, f * 2.57, f * 2.57, 0.13 * a, 0.38);
      mode(ctx, out, t, f * 4.83, f * 4.83, 0.08 * a, 0.25);
      mode(ctx, out, t, f * 6.9, f * 6.9, 0.05 * a, 0.16);
      burst(ctx, out, noise, t, 'highpass', 3500, 0.7, 0.3 * a, 0.015);
      return 0.6;
    }
  }
}

/** Les dés ramassés et secoués dans la main avant le lancer. */
export function pickup(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number, dice: number) {
  const n = 3 + dice * 2;
  for (let k = 0; k < n; k++) {
    const dt = 0.05 + (k / n) * 0.32 + rnd(-0.02, 0.02);
    impact(ctx, out, noise, t + dt, 'de', rnd(2.5, 5.5));
  }
  // frottement des dés dans la paume
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(900, t);
  f.frequency.linearRampToValueAtTime(1800, t + 0.38);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.15);
  g.gain.linearRampToValueAtTime(0.0001, t + 0.42);
  s.connect(f).connect(g).connect(out);
  s.start(t, 0, 0.45);
}
