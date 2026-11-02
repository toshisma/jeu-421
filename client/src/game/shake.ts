/**
 * « Secouer le téléphone pour lancer » (accéléromètre).
 * On attend quelques secousses franches, puis un court arrêt : c'est le moment du lâcher.
 * La force du lancer dépend de la vigueur des secousses.
 * iPhone : l'accès aux capteurs doit être autorisé lors d'un geste de l'utilisateur
 * (voir requestMotionPermission, appelé au premier toucher de l'écran de jeu).
 */
import { useEffect, useRef } from 'react';
import type { ThrowGesture } from '../../../shared/gesture';

type PermissionFn = () => Promise<'granted' | 'denied'>;
let permission: 'unknown' | 'granted' | 'denied' =
  typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as unknown as { requestPermission?: PermissionFn }).requestPermission === 'function'
    ? 'unknown' : 'granted';

export function needsMotionPermission() { return permission === 'unknown'; }

export async function requestMotionPermission(): Promise<boolean> {
  if (permission !== 'unknown') return permission === 'granted';
  try {
    permission = await (DeviceMotionEvent as unknown as { requestPermission: PermissionFn }).requestPermission();
  } catch { permission = 'denied'; }
  return permission === 'granted';
}

export function useShakeToThrow(enabled: boolean, onThrow: (g: ThrowGesture) => void) {
  const cb = useRef(onThrow);
  cb.current = onThrow;
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
    let peaks: number[] = [];
    let maxForce = 0;
    let lastPeak = 0;
    let lastThrow = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      const g = e.accelerationIncludingGravity;
      // Sans gravité si possible ; sinon on retire approximativement 9,81.
      const m = a && a.x != null ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0)
        : g && g.x != null ? Math.abs(Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0) - 9.81) : 0;
      const now = performance.now();
      if (now - lastThrow < 1800) return;
      if (m > 13 && now - lastPeak > 90) {
        lastPeak = now;
        peaks = [...peaks.filter((t) => now - t < 1200), now];
        maxForce = Math.max(maxForce, m);
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          // Au moins 3 secousses en 1,2 s, puis le geste s'arrête : on lâche les dés.
          if (peaks.length >= 3) {
            lastThrow = performance.now();
            const power = Math.min(1.35, Math.max(0.7, 0.55 + (maxForce - 13) / 25));
            cb.current({ angle: Math.random() * Math.PI * 2, power });
          }
          peaks = [];
          maxForce = 0;
        }, 260);
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => { window.removeEventListener('devicemotion', onMotion); if (settleTimer) clearTimeout(settleTimer); };
  }, [enabled]);
}
