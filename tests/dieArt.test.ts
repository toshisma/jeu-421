import { describe, expect, it } from 'vitest';
import { pitHeight, PIPS, pipRadius } from '../client/src/three/dieArt';

describe('points gravés des dés', () => {
  it('le creux descend du bord vers le centre, sans marche', () => {
    expect(pitHeight(0)).toBeCloseTo(-1, 5);
    expect(pitHeight(1.1)).toBe(0);
    let prev = pitHeight(0);
    for (let t = 0.02; t <= 1.1; t += 0.02) {
      const h = pitHeight(t);
      expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(h - prev).toBeLessThan(0.2);
      prev = h;
    }
  });
  it('les creux ne se touchent pas et restent dans la face', () => {
    for (let v = 1; v <= 6; v++) {
      const r = pipRadius(v, 1) * 1.1 * 1.06;
      for (const [x, y] of PIPS[v]) {
        expect(Math.min(x, y, 1 - x, 1 - y)).toBeGreaterThan(r + 0.06);
        for (const [x2, y2] of PIPS[v]) if (x2 !== x || y2 !== y) expect(Math.hypot(x2 - x, y2 - y)).toBeGreaterThan(2 * r);
      }
    }
  });
});

import { ITEMS } from '../shared/progress/catalog';
import { contrast } from '../shared/progress/dice-collection';
import { BED } from '../client/src/three/dieArt';
import { lookFinish } from '../client/src/three/dieLooks';

describe('dés de collection : matières et lisibilité', () => {
  it('le motif ne passe jamais sous un point : lit uni assez large, contrasté avec le point', () => {
    expect(BED).toBeGreaterThanOrEqual(1.3);
    for (const it of ITEMS) if (it.category === 'dice' && it.rarity) expect(contrast(it.pip, it.body2), it.id).toBeGreaterThanOrEqual(4);
  });
  it('hiérarchie des raretés : effets animés réservés aux épiques et légendaires, éclat pour tous les brillants', () => {
    for (const it of ITEMS) if (it.category === 'dice' && it.rarity) {
      const f = lookFinish({ ...it });
      if (it.shiny) expect(f.holo, it.id).toBeGreaterThan(0);
      else expect(f.holo, it.id).toBe(0);
      if (!it.shiny && (it.rarity === 'commun' || it.rarity === 'rare')) { expect(f.pulse[1], it.id).toBe(0); expect(f.glint[1], it.id).toBe(0); }
    }
  });
});
