import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Trails } from '../client/src/three/trails';

// 0.45 : la traînée de lancer suivait 3 dés seulement ; avec les 6 dés du Courtisan elle plantait
// à chaque image (bac figé, dés invisibles) pour les joueurs qui ont une traînée équipée.
describe('traînées de lancer', () => {
  it('suivent 6 dés sans erreur', () => {
    const t = new Trails(false);
    t.set('fx-flammes');
    const dice = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(i, 0.5, 0));
    for (let f = 0; f < 30; f++) {
      dice.forEach((d) => d.add(new THREE.Vector3(0.2, 0, 0.1)));
      expect(() => t.step(1 / 60, dice, true)).not.toThrow();
    }
  });
});
