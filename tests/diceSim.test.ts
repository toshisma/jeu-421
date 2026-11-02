import { describe, expect, it } from 'vitest';
import { Quaternion } from 'three';
import { simulateThrow, restingLayout, topFace, TRAY, type DiePose } from '../client/src/physics/diceSim';
import { getShape, insideShape } from '../client/src/physics/trayShapes';

/** Orientation visuelle finale = orientation du corps * rotation de maillage. */
function visibleValues(poses: DiePose[], offsets: Quaternion[]): number[] {
  return poses.map((p, i) => topFace(new Quaternion(...p.q).multiply(offsets[i])).value);
}

describe('simulation physique des dés', () => {
  it('chaque lancer aboutit exactement aux valeurs officielles, dés à plat et dans le bac', () => {
    let poses = restingLayout();
    let offsets = [new Quaternion(), new Quaternion(), new Quaternion()];
    let corrected = 0;
    let totalFrames = 0;
    let attempts = 0;
    const N = 150;
    for (let n = 0; n < N; n++) {
      const values = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6));
      // Un lancer sur deux est une relance partielle (dés conservés).
      const keep = n % 2 === 0 ? [false, false, false] : [Math.random() < 0.4, Math.random() < 0.4, false];
      const before = visibleValues(poses, offsets);
      const target = values.map((v, i) => (keep[i] ? before[i] : v));
      const r = simulateThrow(poses, keep, target, (n * 2654435761) >>> 0);
      totalFrames += r.frameCount;
      attempts += r.attempts;
      if (r.corrected) corrected++;
      // Les dés conservés ne bougent pas d'un millimètre.
      keep.forEach((k, i) => {
        if (k) expect(r.finalPoses[i].p).toEqual(poses[i].p.map((x) => Math.fround(x)));
      });
      offsets = offsets.map((o, i) => (r.offsets[i] ? new Quaternion(...r.offsets[i]!) : o));
      poses = r.finalPoses;
      expect(visibleValues(poses, offsets)).toEqual(target);
      for (const p of poses) {
        expect(Math.abs(p.p[0])).toBeLessThan(TRAY.width / 2 - 0.95);
        expect(Math.abs(p.p[2])).toBeLessThan(TRAY.depth / 2 - 0.95);
        expect(p.p[1]).toBeLessThan(0.65);
        expect(topFace(new Quaternion(...p.q)).upness).toBeGreaterThan(0.98);
      }
    }
    console.log(`durée moyenne ${(totalFrames / N / 60).toFixed(2)} s, essais moyens ${(attempts / N).toFixed(2)}, corrections ${corrected}/${N}`);
    expect(corrected).toBeLessThan(N * 0.05);
  });
});

describe('fluidité du lancer', () => {
  it('aucun à-coup de vitesse au lâcher, et le geste reste dans le bac', () => {
    const P = 27; // images de prélude
    let worstJump = 0, worstSpinJump = 0, typicalSpeed = 0;
    for (let n = 0; n < 60; n++) {
      const r = simulateThrow(restingLayout(n), [false, false, false], [1, 2, 3], n * 977);
      const F = r.frames;
      const pos = (f: number, d: number) => [0, 1, 2].map((k) => F[f * 21 + d * 7 + k]);
      const quat = (f: number, d: number) => new Quaternion(...[3, 4, 5, 6].map((k) => F[f * 21 + d * 7 + k]) as [number, number, number, number]);
      const vel = (f: number, d: number) => pos(f + 1, d).map((x, k) => (x - pos(f, d)[k]) * 60);
      const angSpeed = (f: number, d: number) => 2 * Math.acos(Math.min(1, Math.abs(quat(f, d).dot(quat(f + 1, d))))) * 60;
      for (let d = 0; d < 3; d++) {
        // Saut de vitesse entre la dernière image du geste et la première image physique,
        // comparé au changement de vitesse dû à la seule gravité (48 / 60 = 0,8).
        const a = vel(P - 2, d), b = vel(P - 1, d);
        worstJump = Math.max(worstJump, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
        worstSpinJump = Math.max(worstSpinJump, Math.abs(angSpeed(P - 2, d) - angSpeed(P - 1, d)));
        typicalSpeed = Math.max(typicalSpeed, Math.hypot(...b));
        for (let f = 0; f < P; f++) {
          const [x, , z] = pos(f, d);
          expect(Math.abs(x)).toBeLessThan(TRAY.width / 2 - 0.45);
          expect(Math.abs(z)).toBeLessThan(TRAY.depth / 2 - 0.45);
        }
      }
    }
    console.log(`saut de vitesse max au lâcher ${worstJump.toFixed(2)} (vitesse ~${typicalSpeed.toFixed(1)}), saut de rotation max ${worstSpinJump.toFixed(2)} rad/s`);
    expect(worstJump).toBeLessThan(2.5);
    expect(worstSpinJump).toBeLessThan(6);
  });
});

describe('formes de plateau', () => {
  for (const id of ['rectangle', 'octogone', 'hexagone', 'rond', 'ovale', 'stade'] as const) {
    it(`${id} : résultats exacts, dés lisibles, rien ne sort pendant le geste`, () => {
      const shape = getShape(id);
      let poses = restingLayout(3);
      let offsets = [new Quaternion(), new Quaternion(), new Quaternion()];
      let corrected = 0, attempts = 0;
      const N = 60;
      for (let n = 0; n < N; n++) {
        const values = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6));
        const keep = n % 3 === 2 ? [true, false, false] : [false, false, false];
        const before = visibleValues(poses, offsets);
        const target = values.map((v, i) => (keep[i] ? before[i] : v));
        const r = simulateThrow(poses, keep, target, n * 7717 + id.length, id);
        attempts += r.attempts;
        if (r.corrected) corrected++;
        for (let f = 0; f < r.frameCount; f++)
          for (let d = 0; d < 3; d++)
            expect(insideShape(shape, r.frames[f * 21 + d * 7], r.frames[f * 21 + d * 7 + 2], 0.4)).toBe(true);
        offsets = offsets.map((o, i) => (r.offsets[i] ? new Quaternion(...r.offsets[i]!) : o));
        poses = r.finalPoses;
        expect(visibleValues(poses, offsets)).toEqual(target);
        for (const p of poses) expect(insideShape(shape, p.p[0], p.p[2], 0.95)).toBe(true);
      }
      console.log(`${id} : essais moyens ${(attempts / N).toFixed(2)}, corrections ${corrected}/${N}`);
      expect(corrected).toBeLessThan(N * 0.05);
    });
  }
});

describe('lancer au geste', () => {
  it('toutes formes, toutes directions, faible et forte puissance : bon sens, bon résultat', () => {
    let corrected = 0, total = 0;
    for (const id of ['rectangle', 'octogone', 'hexagone', 'rond', 'ovale', 'stade'] as const) {
      const shape = getShape(id);
      let poses = restingLayout(5);
      for (let n = 0; n < 24; n++) {
        const angle = (n / 24) * Math.PI * 2;
        const power = n % 2 ? 1.4 : 0.5;
        const values = [1 + (n % 6), 1 + ((n * 5) % 6), 1 + ((n * 7) % 6)];
        const r = simulateThrow(poses, [false, false, false], values, n * 31 + 7, id, { angle, power });
        total++;
        if (r.corrected) corrected++;
        // Les dés partent dans la direction du geste.
        const P = 27;
        let along = 0;
        for (let d = 0; d < 3; d++) {
          const a = P * 21 + d * 7, b = (P + 12) * 21 + d * 7;
          along += (r.frames[b] - r.frames[a]) * Math.cos(angle) + (r.frames[b + 2] - r.frames[a + 2]) * Math.sin(angle);
        }
        expect(along).toBeGreaterThan(0);
        const offs = r.offsets.map((o) => new Quaternion(...o!));
        expect(visibleValues(r.finalPoses, offs)).toEqual(values);
        for (const p of r.finalPoses) expect(insideShape(shape, p.p[0], p.p[2], 0.95)).toBe(true);
        poses = r.finalPoses;
      }
    }
    console.log(`gestes : corrections ${corrected}/${total}`);
    expect(corrected).toBeLessThan(total * 0.05);
  });
});

import { parkPoses } from '../client/src/physics/diceSim';
describe('dés gardés au bord du bac', () => {
  it('au bord, sans chevauchement, même face visible, déterministe ; la relance part de là', () => {
    for (const id of ['rectangle', 'octogone', 'hexagone', 'rond', 'ovale', 'stade'] as const) {
      const shape = getShape(id);
      let poses = restingLayout(9);
      let offsets = [new Quaternion(), new Quaternion(), new Quaternion()];
      for (let n = 0; n < 12; n++) {
        const keep = [[true, false, false], [true, true, false], [false, true, true], [false, false, true]][n % 4];
        const parked = parkPoses(poses, keep, id);
        expect(parkPoses(poses, keep, id)).toEqual(parked); // déterministe
        const before = visibleValues(poses, offsets);
        expect(visibleValues(parked, offsets)).toEqual(before); // les gardés ne changent pas de face
        parked.forEach((p, i) => {
          expect(insideShape(shape, p.p[0], p.p[2], 0.5)).toBe(true);
          if (keep[i]) expect(insideShape(shape, p.p[0], p.p[2], 1.0)).toBe(false); // vraiment au bord
          parked.forEach((o, j) => { if (j > i) expect(Math.hypot(p.p[0] - o.p[0], p.p[2] - o.p[2])).toBeGreaterThan(1.05); });
        });
        const target = before.map((v, i) => (keep[i] ? v : 1 + ((n + i) % 6)));
        const r = simulateThrow(parked, keep, target, n * 13 + 1, id);
        keep.forEach((k, i) => { if (k) expect(r.finalPoses[i].p).toEqual(parked[i].p.map((x) => Math.fround(x))); });
        offsets = offsets.map((o, i) => (r.offsets[i] ? new Quaternion(...r.offsets[i]!) : o));
        poses = r.finalPoses;
        expect(visibleValues(poses, offsets)).toEqual(target);
      }
    }
  });
});
