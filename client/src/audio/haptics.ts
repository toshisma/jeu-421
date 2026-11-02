/**
 * Vibrations du téléphone sur les impacts forts (Android ; iOS ne permet pas la vibration depuis
 * une page web). Courtes et espacées : on sent le dé tomber sans que le téléphone « bourdonne ».
 */
import type { ImpactKind } from '../physics/diceSim';

let enabled = true;
let last = 0;
export function setHaptics(on: boolean) { enabled = on; }

export function haptic(kind: ImpactKind, strength: number) {
  if (!enabled || typeof navigator.vibrate !== 'function') return;
  if (kind === 'de' || strength < 5) return;
  const now = performance.now();
  if (now - last < 70) return;
  last = now;
  try { navigator.vibrate(Math.round(Math.min(32, 6 + strength * 1.6))); } catch { /* refusé */ }
}
