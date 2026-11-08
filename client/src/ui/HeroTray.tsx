import { useEffect, useRef } from 'react';
import type { ProfileApi } from '../account/useProfile';
import type { Settings } from '../settings';
import { sound } from '../audio/sound';
import { DiceTray, type DiceTrayHandle } from './DiceTray';

/** Vitrine 3D : le vrai bac du joueur (ses dés, son tapis) ; on peut le toucher pour lancer. */
export function HeroTray({ pa, settings, dice = 3 }: { pa: ProfileApi; settings: Settings; dice?: number }) {
  const tray = useRef<DiceTrayHandle>(null);
  const rolling = useRef(false);
  const roll = async () => {
    if (rolling.current) return;
    rolling.current = true; sound.unlock();
    const r = crypto.getRandomValues(new Uint32Array(dice + 1));
    await tray.current?.roll(Array.from({ length: dice }, (_, i) => 1 + (r[i] % 6)), Array(dice).fill(false), r[dice] >>> 1);
    rolling.current = false;
  };
  useEffect(() => { tray.current?.setSwipeEnabled(true); }, []);
  return (
    <div className="hero-tray" onClick={() => void roll()}>
      <DiceTray ref={tray} appearance={pa.profile.equipped} quality={settings.quality} insets={{ top: 0, bottom: 40, left: 0, right: 0 }} onSwipe={() => void roll()} />
    </div>
  );
}
