/**
 * Geste de lancer : direction dans le plan du bac (radians, 0 = vers +x) et force (0,5 à 1,4).
 * Sans geste (bouton « Lancer »), le lancer part d'un petit côté avec une force normale.
 */
export interface ThrowGesture { angle: number; power: number }
export function sanitizeGesture(g: unknown): ThrowGesture | undefined {
  if (!g || typeof g !== 'object') return undefined;
  const { angle, power } = g as Record<string, unknown>;
  if (typeof angle !== 'number' || typeof power !== 'number' || !Number.isFinite(angle) || !Number.isFinite(power)) return undefined;
  return { angle: Math.atan2(Math.sin(angle), Math.cos(angle)), power: Math.min(1.4, Math.max(0.5, power)) };
}
