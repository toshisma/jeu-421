/** Partie contre le patron de la semaine : un ordinateur difficile, avec sa particularité. */
import { DEFAULT_CONFIG, sanitizeConfig } from '../../../shared/config';
import { bossDie, type BossDef } from '../../../shared/progress/boss';
import { LocalController } from './localController';
import { PERSONAS } from './personas';

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const roll6 = () => 1 + Math.floor(rnd() * 6);

export class BossController extends LocalController {
  readonly boss: BossDef;
  constructor(boss: BossDef, me: { name: string; avatar: string; photo?: string | null; account?: string; title?: string; accessory?: string }) {
    const main = PERSONAS.find((p) => p.id === boss.persona)!;
    const others = PERSONAS.filter((p) => p.id !== boss.persona).sort(() => rnd() - 0.5).slice(0, boss.sidekicks);
    super(sanitizeConfig({ ...DEFAULT_CONFIG, ...boss.config }), [
      { persona: main, difficulty: 'difficile' },
      ...others.map((persona) => ({ persona, difficulty: 'normal' as const })),
    ], me);
    this.boss = boss;
  }
  /** Les dés du patron (premier adversaire) reçoivent son coup de pouce. */
  protected dieSource(playerId: string, keep: boolean[]): () => number {
    if (playerId !== 'ia-0' || !this.boss.luck) return super.dieSource(playerId, keep);
    const s = this.state;
    const k = s.throwsUsed === 0 ? [false, false, false] : keep;
    const got: number[] = s.dice.filter((_, i) => k[i]);
    const idx = [0, 1, 2].filter((i) => !k[i]);
    let n = 0;
    return () => {
      const v = bossDie(this.boss.luck, idx[n++] ?? 0, roll6, rnd, got);
      got.push(v);
      return v;
    };
  }
}
