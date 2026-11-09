import { useEffect, useState } from 'react';
import type { GameState } from '../../../shared/engine';
import type { ProfileApi } from '../account/useProfile';
import { coachMessage, type TutorialController } from '../game/tutorial';
import type { Settings } from '../settings';
import type { Appearance } from '../../../shared/progress/catalog';
import { GameScreen } from './GameScreen';
import { tr } from '../i18n/lang';

/** Partie guidée : la vraie table de jeu, avec un guide qui commente chaque étape. */
export function TutorialScreen({ controller, settings, onSettings, onExit, appearance, pa }: {
  controller: TutorialController; settings: Settings; onSettings: (s: Settings) => void; onExit: () => void; appearance: Appearance; pa: ProfileApi;
}) {
  const [state, setState] = useState<GameState | null>(null);
  const [rewarded, setRewarded] = useState(false);
  // Le guide suit l'état avec un léger retard, le temps que les dés retombent.
  useEffect(() => {
    const off = controller.subscribeEvents((e) => {
      const st = e.state;
      setTimeout(() => setState(st), e.type === 'roll' ? 2600 : 600);
    });
    return () => { off(); };
  }, [controller]);
  const msg = coachMessage(state, controller.meId);
  return (
    <>
      <GameScreen controller={controller} settings={settings} onSettings={onSettings} onExit={onExit} appearance={appearance} pa={pa} early={false}
        tableExit={{ label: tr('g421.tut.finish'), note: () => tr(pa.profile.tutorial && rewarded ? 'g421.tut.bonus' : 'g421.tut.done') }}
        onGameEnd={async () => {
          if (!pa.profile.tutorial) { const err = await pa.finishTutorial(); if (!err) setRewarded(true); }
          return null;
        }} />
      {msg && state?.phase !== 'fini' && (
        <aside className="coach" role="status" aria-live="polite">
          <span className="coach-who">🧔</span>
          <p>{msg}</p>
        </aside>
      )}
    </>
  );
}
