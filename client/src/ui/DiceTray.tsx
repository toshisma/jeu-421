import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Insets, Quality, TrayScene } from '../three/TrayScene';
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
  /** Traînée de lancer (identifiant de l'effet) ou aucune. */
  setTrail(id: string | null): void;
  /** Célébration du 4-2-1 / trois as dans le bac (effet équipé, ou célébration par défaut). */
  celebrate(id: string | null): void;
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

/**
 * Three.js et la physique (cannon-es) forment le plus gros morceau du jeu : ils sont chargés à part,
 * à la demande, pour que l'accueil s'affiche sans les attendre. Le chargement est partagé.
 */
let sceneModule: Promise<typeof import('../three/TrayScene')> | null = null;
export const loadTrayScene = () => (sceneModule ??= import('../three/TrayScene').catch((e) => { sceneModule = null; throw e; }));
/**
 * Construire la scène est une longue tâche (compilation des shaders) : on laisse d'abord le
 * navigateur afficher l'écran avec ses polices, puis on attend un moment de repos (court).
 */
const afterPaint = async () => {
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) await new Promise<void>((r) => w.requestIdleCallback!(() => r(), { timeout: 400 }));
};

type Pending = Partial<{ swipe: boolean; values: number[]; kept: boolean[]; interactive: boolean; skin: string | null; trail: string | null }>;

/** Composant React qui héberge la scène Three.js du bac. */
export const DiceTray = forwardRef<DiceTrayHandle, Props>(function DiceTray({ appearance, quality, insets, onDieClick, onSwipe, cup = false }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TrayScene | null>(null);
  const [ready, setReady] = useState(false);
  // Ordres reçus avant que la scène soit prête : rejoués dès sa création (seul le dernier compte).
  const pending = useRef<Pending>({});
  const waiters = useRef<(() => void)[]>([]);
  const clickRef = useRef(onDieClick);
  clickRef.current = onDieClick;
  const swipeRef = useRef(onSwipe);
  swipeRef.current = onSwipe;
  const latest = useRef({ appearance, quality, cup, insets });
  latest.current = { appearance, quality, cup, insets };

  useEffect(() => {
    let alive = true;
    let s: TrayScene | null = null;
    void (async () => {
      let mod: typeof import('../three/TrayScene');
      try { mod = await loadTrayScene(); } catch { return; }
      await afterPaint();
      if (!alive || !host.current) return;
      const l = latest.current;
      s = new mod.TrayScene(host.current, {
        appearance: l.appearance, quality: l.quality,
        onImpact: (k, st, pan) => { sound.impact(k, st, pan); haptic(k, st); },
        onPickup: (n) => sound.pickup(n),
        onSwipe: (g) => swipeRef.current?.(g),
        onDieClick: (i) => clickRef.current?.(i),
        cup: l.cup,
        onShake: () => sound.rattle(),
        onFx: (k, st) => sound.party(k, st),
      });
      scene.current = s;
      if (l.insets) s.setInsets(l.insets);
      const p = pending.current;
      pending.current = {};
      if (p.skin !== undefined) s.setDiceSkin(p.skin);
      if (p.trail !== undefined) s.setTrail(p.trail);
      if (p.values) s.showValues(p.values);
      if (p.kept) s.setKept(p.kept);
      if (p.interactive !== undefined) s.setInteractive(p.interactive);
      if (p.swipe !== undefined) s.setSwipeEnabled(p.swipe);
      setReady(true);
      for (const w of waiters.current.splice(0)) w();
    })();
    return () => { alive = false; s?.dispose(); scene.current = null; for (const w of waiters.current.splice(0)) w(); };
    // La scène est créée une seule fois ; apparence et qualité sont mises à jour ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lookKey = JSON.stringify(appearance);
  useEffect(() => {
    scene.current?.setAppearance(appearance);
    const kind = resolveAppearance(appearance).rim.kind;
    sound.setRim(kind === 'marble' ? 'lacquer' : kind); // le marbre sonne comme une surface dure et lisse
  }, [lookKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setQuality(quality); }, [quality, ready]);
  useEffect(() => { scene.current?.setOptions({ cup }); }, [cup, ready]);
  useEffect(() => { if (insets) scene.current?.setInsets(insets); }, [insets?.top, insets?.right, insets?.bottom, insets?.left, ready]);

  useImperativeHandle(ref, () => ({
    roll: async (v, k, s, g, d) => {
      if (!scene.current) await new Promise<void>((r) => waiters.current.push(r));
      return scene.current?.roll(v, k, s, g, d);
    },
    setSwipeEnabled: (on) => { if (scene.current) scene.current.setSwipeEnabled(on); else pending.current.swipe = on; },
    showValues: (v) => { if (scene.current) scene.current.showValues(v); else pending.current.values = v; },
    setKept: (m) => { if (scene.current) scene.current.setKept(m); else pending.current.kept = m; },
    setInteractive: (on) => { if (scene.current) scene.current.setInteractive(on); else pending.current.interactive = on; },
    setDiceSkin: (id) => { if (scene.current) scene.current.setDiceSkin(id); else pending.current.skin = id; },
    setTrail: (id) => { if (scene.current) scene.current.setTrail(id); else pending.current.trail = id; },
    celebrate: (id) => scene.current?.celebrate(id),
  }), []);

  return <div ref={host} className={`tray-host${ready ? '' : ' tray-loading'}`} />;
});
