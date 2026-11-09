import { useEffect, useMemo, useState } from 'react';
import { askConfirm } from './confirm';
import { useNavGuard } from './navGuard';
import { DEFAULT_CONFIG, type GameConfig } from '../../../shared/config';
import { evaluate } from '../../../shared/combos';
import { createGame, currentPlayerId, type GameState } from '../../../shared/engine';
import type { Appearance } from '../../../shared/progress/catalog';
import { sound } from '../audio/sound';
import { PartyController, refereeTurn } from '../game/party';
import type { Settings } from '../settings';
import { ConfigEditor } from './ConfigEditor';
import { GameScreen } from './GameScreen';
import { Icon } from './Icon';
import { MiniDie } from './MiniDie';
import { RoundTracker } from './RoundTracker';
import { BigAction, Choices, Section, Shell, Tile } from './kit';
import { tr, trServer } from '../i18n/lang';
import { botName, rich, trCombo, trn } from '../i18n/g421';

export type PartyKind = 'phone' | 'referee';

/** Préparation de la soirée : joueurs, type de partie, règles. */
export function PartySetup({ settings, onBack, onStart }: { settings: Settings; onBack: () => void; onStart: (kind: PartyKind, names: string[], cfg: GameConfig) => void }) {
  const [names, setNames] = useState<string[]>(() => [settings.name || tr('g421.pa.playerN', { n: 1 }), tr('g421.pa.playerN', { n: 2 }), tr('g421.pa.playerN', { n: 3 })]);
  const [kind, setKind] = useState<PartyKind>('phone');
  const [cfg, setCfg] = useState<GameConfig>({ ...DEFAULT_CONFIG, turnSeconds: 0 });
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const dup = new Set(clean).size !== clean.length;
  return (
    <Shell title={tr('g421.pa.title')} onBack={onBack} icon="cheers" wide sub={`${trn('g421.menu.players', clean.length)} · ${tr(kind === 'phone' ? 'g421.pa.onePhone' : 'g421.pa.realDice')}`}
      foot={<BigAction icon="cheers" tone="gold" disabled={clean.length < 2 || dup} onClick={() => { sound.unlock(); onStart(kind, clean, cfg); }}
        label={tr('g421.pa.start')} sub={dup ? tr('g421.pa.dup') : clean.length < 2 ? tr('g421.pa.two') : clean.join(', ')} />}>
      <div className="cols">
        <div>
          <Section title={tr('g421.pa.how')}>
            <Choices value={kind} onChange={setKind} options={[
              { v: 'phone', label: tr('g421.pa.screenDice'), hint: tr('g421.pa.passPhone'), icon: 'dice' },
              { v: 'referee', label: tr('g421.pa.realDiceCap'), hint: tr('g421.pa.appRef'), icon: 'rules' },
            ]} />
            <p className="k-hint">{tr(kind === 'phone' ? 'g421.pa.phoneHint' : 'g421.pa.refHint')}</p>
          </Section>
          <Section title={tr('g421.pa.players')} count={`${names.length}/6`}>
            <ol className="party-names">
              {names.map((n, i) => (
                <li key={i}>
                  <span className="ord">{i + 1}</span>
                  <input value={n} maxLength={16} aria-label={tr('g421.pa.playerN', { n: i + 1 })} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
                  {names.length > 2 && <button className="icon-btn" aria-label={tr('g421.on.removeA', { name: n || tr('g421.pa.playerN', { n: i + 1 }) })} onClick={() => setNames(names.filter((_, j) => j !== i))}><Icon name="close" size={18} /></button>}
                </li>
              ))}
            </ol>
            {names.length < 6 && <Tile icon="plus" label={tr('g421.pa.add')} onClick={() => setNames([...names, tr('g421.pa.playerN', { n: names.length + 1 })])} />}
            {dup && <p className="error">{tr('g421.pa.dupDot')}</p>}
          </Section>
        </div>
        <Section title={tr('g421.solo.rules')}>
          <ConfigEditor config={cfg} onChange={(c) => setCfg({ ...c, turnSeconds: kind === 'referee' ? 0 : c.turnSeconds })} />
        </Section>
      </div>
    </Shell>
  );
}

/** Dés à l'écran, un seul téléphone : écran de passage entre deux joueurs. */
export function PartyGame({ controller, settings, onSettings, onExit, appearance }: {
  controller: PartyController; settings: Settings; onSettings: (s: Settings) => void; onExit: () => void; appearance: Appearance;
}) {
  const [handoff, setHandoff] = useState<string | null>(() => currentPlayerId(controller.current()));
  useEffect(() => {
    let last = currentPlayerId(controller.current());
    const off = controller.subscribeEvents((e) => {
      const next = currentPlayerId(e.state);
      if (next && next !== last && e.state.phase !== 'fini') {
        last = next;
        setTimeout(() => setHandoff(next), e.type === 'roll' ? 2600 : 1400);
      }
    });
    return () => { off(); };
  }, [controller]);
  return (
    <>
      <GameScreen controller={controller} settings={{ ...settings, shake: false }} onSettings={onSettings} onExit={onExit} guestInvite={false} appearance={appearance} />
      {handoff && (
        <div className="handoff" role="dialog" aria-label={tr('g421.pa.passA')}>
          <div className="handoff-card">
            <span className="muted">{tr('g421.pa.passTo')}</span>
            <b>{botName(controller.nameOf(handoff))}</b>
            <button className="btn primary big wide" onClick={() => { sound.unlock(); setHandoff(null); }}>{tr('g421.pa.itsMe')}</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Mode arbitre : vrais dés, l'application tient les comptes. */
export function RefereeScreen({ names, config, onExit }: { names: string[]; config: GameConfig; onExit: () => void }) {
  const fresh = () => createGame(config, names.map((n, i) => ({ id: `j${i}`, name: n })), Math.floor(Math.random() * names.length));
  const [history, setHistory] = useState<GameState[]>(() => [fresh()]);
  const s = history[history.length - 1];
  const [dice, setDice] = useState<number[]>([0, 0, 0]);
  const [throws, setThrows] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const pid = currentPlayerId(s);
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? '?';
  const combo = dice.every((d) => d > 0) ? evaluate(dice, s.config.values) : null;
  useEffect(() => { setThrows(1); setDice([0, 0, 0]); setErr(null); }, [pid, s.version]);
  const points = s.config.variant === 'manches';
  const loser = s.phase === 'fini' ? (s.loserId ?? s.ranking[s.ranking.length - 1]) : null;

  const validate = () => {
    const next = structuredClone(s);
    const e = refereeTurn(next, dice, throws);
    if (e) { setErr(trServer(e)); return; }
    sound.validate();
    if (next.lastSummary && next.lastSummary.seq !== s.lastSummary?.seq && next.lastSummary.amount > 0) sound.chips(next.lastSummary.amount);
    setHistory([...history, next]);
  };
  const ranked = useMemo(() => [...s.players].sort((a, b) => (points ? b.score - a.score : a.tokens - b.tokens)), [s, points]);
  // Barre du bas : même confirmation que la flèche retour.
  useNavGuard({ ask: () => s.phase === 'fini' || askConfirm(tr('g421.pa.leave'), tr('g421.quit')) });

  return (
    <Shell title={tr('g421.pa.refT')} icon="rules" onBack={async () => { if (s.phase === 'fini' || await askConfirm(tr('g421.pa.leave'), tr('g421.quit'))) onExit(); }} wide>
      <div className="referee">
        <RoundTracker s={s} nameOf={nameOf} colorOf={() => undefined} />
        {s.lastSummary && <p className="ref-summary">{trServer(s.lastSummary.text)}</p>}
        <div className="cols">
          <section>
            {s.phase === 'fini' ? (
              <div className="ref-end">
                <h2>{loser ? tr('g421.pa.pays', { name: nameOf(loser) }) : tr('g421.over')}</h2>
                <button className="btn primary big" onClick={() => setHistory([fresh()])}>{tr('g421.pa.newGame')}</button>
              </div>
            ) : (
              <>
                <h2 className="ref-turn">{rich(tr('g421.pa.turn', { name: pid ? nameOf(pid) : '' }))}</h2>
                <p className="muted">{tr('g421.pa.rollReal')}</p>
                <div className="ref-dice">
                  {dice.map((d, i) => (
                    <div key={i} className="ref-slot">
                      <span className="muted small">{tr('g421.pa.die', { n: i + 1 })}</span>
                      <div className="ref-faces">
                        {[1, 2, 3, 4, 5, 6].map((v) => (
                          <button key={v} className={d === v ? 'on' : ''} aria-label={tr('g421.pa.dieV', { n: i + 1, v })} onClick={() => setDice(dice.map((x, j) => (j === i ? v : x)))}>
                            <MiniDie value={v} size={34} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {s.throwLimit > 1 && (
                  <div className="field">
                    <span>{tr('g421.pa.throwsUsed')}</span>
                    <div className="seg">
                      {Array.from({ length: s.throwLimit }, (_, i) => i + 1).map((n) => <button key={n} className={throws === n ? 'on' : ''} onClick={() => setThrows(n)}>{n}</button>)}
                    </div>
                  </div>
                )}
                {combo && <p className="combo-label ref-combo">{trCombo(combo.label)}<span>{tr('g421.pa.worth', { n: combo.value })}</span></p>}
                {err && <p className="error">{err}</p>}
                <div className="row left">
                  <button className="btn primary big" disabled={!combo} onClick={validate}>{tr('g421.pa.confirm')}</button>
                  {history.length > 1 && <button className="btn ghost" onClick={() => setHistory(history.slice(0, -1))}>{tr('g421.pa.undo')}</button>}
                </div>
              </>
            )}
          </section>
          <section>
            <h3>{tr(points ? 'g421.points' : 'g421.tokens')}</h3>
            <ol className="ranking">
              {ranked.map((p) => (
                <li key={p.id} className={p.id === pid ? 'me' : ''}>
                  <span className="nm">{p.name}{p.out ? ` ${tr('g421.pa.outParen')}` : ''}</span>
                  <span className="sc">{points ? trn('g421.pt', p.score) : trn('g421.tok', p.tokens)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </Shell>
  );
}
