import { describe, expect, it } from 'vitest';
import { SONGS, barPrints, compose, parseChord, pickNext, songsFor } from '../client/src/audio/compose';
import { music } from '../client/src/audio/music';

describe('musique d\'ambiance', () => {
  it('au moins 6 morceaux pour l\'ambiance normale, un pour les cartes, titres uniques', () => {
    expect(songsFor('normal').length).toBeGreaterThanOrEqual(6);
    expect(songsFor('cartes').length).toBeGreaterThanOrEqual(1);
    expect(new Set(SONGS.map((s) => s.title)).size).toBe(SONGS.length);
    expect(new Set(SONGS.map((s) => `${s.bpm}/${s.meter}/${s.style}`)).size).toBe(SONGS.length);
    for (const s of SONGS) for (const sec of Object.values(s.sections)) for (const bar of sec.split('|')) for (const c of bar.trim().split(/\s+/)) expect(() => parseChord(c)).not.toThrow();
  });

  it('partition déterministe avec une graine, différente avec une autre', () => {
    for (const s of SONGS) {
      const a = compose(s.id, 1234), b = compose(s.id, 1234), c = compose(s.id, 99);
      expect(a.events).toEqual(b.events);
      expect(barPrints(a).join('/')).not.toBe(barPrints(c).join('/'));
    }
  });

  it('chaque morceau dure de 2 min 30 à 4 min, avec intro, sections et fin', () => {
    for (const s of SONGS) {
      const sc = compose(s.id, 7);
      expect(sc.duration).toBeGreaterThanOrEqual(150);
      expect(sc.duration).toBeLessThanOrEqual(240);
      const roles = new Set(sc.sections.map((x) => x.role));
      for (const r of ['intro', 'theme', 'solo', 'fin']) expect(roles.has(r as never)).toBe(true);
      expect(sc.events.every((e) => e.t >= 0 && e.t < sc.duration && e.d > 0 && e.v > 0 && e.v <= 1)).toBe(true);
    }
  });

  it('aucune répétition exacte de 4 mesures dans un morceau (plusieurs graines)', () => {
    for (const s of SONGS) {
      for (const seed of [1, 2, 3]) {
        const p = barPrints(compose(s.id, seed));
        const seen = new Set<string>();
        for (let i = 0; i + 4 <= p.length; i++) {
          const k = p.slice(i, i + 4).join('|');
          expect(seen.has(k), `${s.id} graine ${seed} mesure ${i}`).toBe(false);
          seen.add(k);
        }
      }
    }
  });

  it('enchaînement : jamais deux fois le même morceau de suite', () => {
    const pool = songsFor('normal').map((s) => s.id);
    let last: string | null = null;
    const played = new Set<string>();
    for (let k = 0; k < 200; k++) {
      const id = pickNext(pool, last);
      expect(id).not.toBe(last);
      played.add(id);
      last = id;
    }
    expect(played.size).toBe(pool.length);
    expect(pickNext(['seul'], 'seul')).toBe('seul');
  });

  it('peu de voix simultanées (léger sur téléphone)', () => {
    for (const s of SONGS) {
      const sc = compose(s.id, 5);
      let max = 0;
      const ends: number[] = [];
      for (const e of sc.events) {
        while (ends.length && ends[0] < e.t) ends.shift();
        ends.push(e.t + e.d + 0.3); ends.sort((a, b) => a - b);
        max = Math.max(max, ends.length);
      }
      expect(max, s.id).toBeLessThanOrEqual(32);
    }
  });

  it('aucune exception sans AudioContext', () => {
    expect(() => {
      music.setVolume(0.5);
      music.unlock();
      music.pause(true); music.pause(false);
      const before = music.info().id;
      music.next();
      expect(music.info().id).not.toBe(before);
      music.setMood('cartes');
      expect(songsFor('cartes').map((s) => s.id)).toContain(music.info().id);
      music.setMood('normal');
      expect(songsFor('normal').map((s) => s.id)).toContain(music.info().id);
      const off = music.subscribe(() => {}); off();
      music.setVolume(0);
    }).not.toThrow();
  });
});
