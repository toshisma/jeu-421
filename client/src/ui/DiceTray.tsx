import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { TrayScene, type Insets, type Quality } from '../three/TrayScene';
import { resolveAppearance, type Appearance } from '../../../shared/progress/catalog';
import { haptic } from '../audio/haptics';
import type { ThrowGesture } from '../physics/diceSim';
import { sound } from '../audio/sound';

export interface DiceTrayHandle {
  roll(values: number[], keep: boolean[], seed: number, gesture?: ThrowGesture, dramatic?: boolean): Promise<void>;
  setSwipeEnabled(on: boolean): void;
  showValues(values: number[]): void;
  setKept(mask: boolean[]): void;
  setInteractive(on: boolean): void;
  /** Dés d'un autre joueur (identifiant du catalogue), ou les miens (null). */
  setDiceSkin(id: string | null): void;
  /** Traînée de lancer (couleurs) ou aucune. */
  setTrail(colors: string[] | null, glow?: boolean): void;
}

interface Props {
  appearance: Appearance;
  quality: Quality;
  insets?: Insets;
  onDieClick?: (i: number) => void;
  onSwipe?: (g: ThrowGesture) => void;
  /** Lancer au gobelet (réglages). */
  cup?: boolean;
}

/** Composant React qui héberge la scène Three.js du bac. */
export const DiceTray = forwardRef<DiceTrayHandle, Props>(function DiceTray({ appearance, quality, insets, onDieClick, onSwipe, cup = false }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TrayScene | null>(null);
  const clickRef = useRef(onDieClick);
  clickRef.current = onDieClick;
  const swipeRef = useRef(onSwipe);
  swipeRef.current = onSwipe;

  useEffect(() => {
    const s = new TrayScene(host.current!, {
      appearance, quality,
      onImpact: (k, st, pan) => { sound.impact(k, st, pan); haptic(k, st); },
      onPickup: (n) => sound.pickup(n),
      onSwipe: (g) => swipeRef.current?.(g),
      onDieClick: (i) => clickRef.current?.(i),
      cup,
      onShake: () => sound.rattle(),
    });
    scene.current = s;
    return () => { s.dispose(); scene.current = null; };
    // La scène est créée une seule fois ; apparence et qualité sont mises à jour ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lookKey = JSON.stringify(appearance);
  useEffect(() => {
    scene.current?.setAppearance(appearance);
    const kind = resolveAppearance(appearance).rim.kind;
    sound.setRim(kind === 'marble' ? 'lacquer' : kind); // le marbre sonne comme une surface dure et lisse
  }, [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setQuality(quality); }, [quality]);
  useEffect(() => { scene.current?.setOptions({ cup }); }, [cup]);
  useEffect(() => { if (insets) scene.current?.setInsets(insets); }, [insets?.top, insets?.right, insets?.bottom, insets?.left]);

  useImperativeHandle(ref, () => ({
    roll: (v, k, s, g, d) => scene.current?.roll(v, k, s, g, d) ?? Promise.resolve(),
    setSwipeEnabled: (on) => scene.current?.setSwipeEnabled(on),
    showValues: (v) => scene.current?.showValues(v),
    setKept: (m) => scene.current?.setKept(m),
    setInteractive: (on) => scene.current?.setInteractive(on),
    setDiceSkin: (id) => scene.current?.setDiceSkin(id),
    setTrail: (c, g) => scene.current?.setTrail(c, g),
  }), []);

  return <div ref={host} className="tray-host" />;
});
