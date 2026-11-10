/** Personnages des adversaires spéciaux (Saint-Nicolas, Père Fouettard, Père Noël) : bienveillants, répliques traduites. */
import type { MessageKey } from '../../../shared/i18n';
import type { Persona } from '../game/personas';
import { tr } from '../i18n/lang';

const LOOK: Record<string, Pick<Persona, 'avatar' | 'color' | 'tempo' | 'style' | 'dice'>> = {
  'saint-nicolas': { avatar: '📖', color: '#b3161d', tempo: 1300, style: { caution: 0.01 }, dice: 'dice-saint-nicolas' },
  fouettard: { avatar: '🧺', color: '#5b4a8a', tempo: 1000, style: { caution: 0.02 }, dice: 'dice-mandarine' },
  'pere-noel': { avatar: '🎅', color: '#c8202a', tempo: 1200, style: { caution: 0 }, dice: 'dice-champagne' },
};

/** Personnages dans la langue du moment (créés au lancement de la partie). */
export function fetePersonas(ids: string[]): Persona[] {
  return ids.filter((id) => LOOK[id]).map((id) => {
    const t = (k: string) => tr(`fet.p.${id}.${k}` as MessageKey);
    return {
      id: `fete-${id}`, name: t('name'), tagline: t('tag'), ...LOOK[id],
      lines: { big: [t('big1'), t('big2')], good: [t('good')], bad: [t('bad')], think: [t('think')] },
    };
  });
}
export const feteAvatar = (id: string) => LOOK[id]?.avatar ?? '🎁';
