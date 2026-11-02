/** Générateur pseudo-aléatoire déterministe (mulberry32). Utilisé pour les trajectoires
 *  d'animation (pas pour les résultats officiels côté serveur, qui utilisent crypto). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tire une face de 1 à 6 avec la source aléatoire fournie. */
export const dieFrom = (rng: Rng) => () => 1 + Math.floor(rng() * 6);
