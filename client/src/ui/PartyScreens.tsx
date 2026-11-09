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

export type PartyKind = 'phone' | 'referee';

/** Préparation de la soirée : joueurs, type de partie, règles. */
export function PartySetup({ settings, onBack, onStart }: { settings: Settings; onBack: () => void; onStart: (kind: PartyKind, names: string[], cfg: GameConfig) => void }) {
  const [names, setNames] = useState<string[]>(() => [settings.name || 'Joueur 1', 'Joueur 2', 'Joueur 3']);
  const [kind, setKind] = useState<PartyKind>('phone');
  const [cfg, setCfg] = useState<GameConfig>({ ...DEFAULT_CONFIG, turnSeconds: 0 });
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const dup = new Set(clean).size !== clean.length;
  return (
    <Shell title="Soirée entre amis" onBack={onBack} icon="cheers" wide sub={`${clean.length} joueur${clean.length > 1 ? 's' : ''} · ${kind === 'phone' ? 'un seul téléphone' : 'vrais dés'}`}
      foot={<BigAction icon="cheers" tone="gold" disabled={clean.length < 2 || dup} onClick={() => { sound.unlock(); onStart(kind, clean, cfg); }}
        label="Commencer la soirée" sub={dup ? 'Deux joueurs ont le même nom' : clean.length < 2 ? 'Il faut au moins deux joueurs' : clean.join(', ')} />}>
      <div className="cols">
        <div>
          <Section title="Comment jouer ?">
            <Choices value={kind} onChange={setKind} options={[
              { v: 'phone', label: "Dés à l'écran", hint: 'On se passe le téléphone', icon: 'dice' },
              { v: 'referee', label: 'Vrais dés', hint: "L'appli arbitre", icon: 'rules' },
            ]} />
            <p className="k-hint">{kind === 'phone'
              ? 'Chacun lance à son tour, puis passe le téléphone au suivant.'
              : 'Sortez vos dés et votre piste : chacun indique ses trois dés et son nombre de lancers, l’application s’occupe des jetons, des manches et des barrages.'}</p>
          </Section>
          <Section title="Joueurs" count={`${names.length}/6`}>
            <ol className="party-names">
              {names.map((n, i) => (
                <li key={i}>
                  <span className="ord">{i + 1}</span>
                  <input value={n} maxLength={16} aria-label={`Joueur ${i + 1}`} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
                  {names.length > 2 && <button className="icon-btn" aria-label={`Retirer ${n || `le joueur ${i + 1}`}`} onClick={() => setNames(names.filter((_, j) => j !== i))}><Icon name="close" size={18} /></button>}
                </li>
              ))}
            </ol>
            {names.length < 6 && <Tile icon="plus" label="Ajouter un joueur" onClick={() => setNames([...names, `Joueur ${names.length + 1}`])} />}
            {dup && <p className="error">Deux joueurs ont le même nom.</p>}
          </Section>
        </div>
        <Section title="Règles">
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
        <div className="handoff" role="dialog" aria-label="Passer le téléphone">
          <div className="handoff-card">
            <span className="muted">Passez le téléphone à</span>
            <b>{controller.nameOf(handoff)}</b>
            <button className="btn primary big wide" onClick={() => { sound.unlock(); setHandoff(null); }}>C'est moi, je joue</button>
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
    if (e) { setErr(e); return; }
    sound.validate();
    if (next.lastSummary && next.lastSummary.seq !== s.lastSummary?.seq && next.lastSummary.amount > 0) sound.chips(next.lastSummary.amount);
    setHistory([...history, next]);
  };
  const ranked = useMemo(() => [...s.players].sort((a, b) => (points ? b.score - a.score : a.tokens - b.tokens)), [s, points]);
  // Barre du bas : même confirmation que la flèche retour.
  useNavGuard({ ask: () => s.phase === 'fini' || askConfirm('Quitter la soirée ?', 'Quitter') });

  return (
    <Shell title="Soirée : l'arbitre" icon="rules" onBack={async () => { if (s.phase === 'fini' || await askConfirm('Quitter la soirée ?', 'Quitter')) onExit(); }} wide>
      <div className="referee">
        <RoundTracker s={s} nameOf={nameOf} colorOf={() => undefined} />
        {s.lastSummary && <p className="ref-summary">{s.lastSummary.text}</p>}
        <div className="cols">
          <section>
            {s.phase === 'fini' ? (
              <div className="ref-end">
                <h2>{loser ? `${nameOf(loser)} paie la tournée !` : 'Partie terminée'}</h2>
                <button className="btn primary big" onClick={() => setHistory([fresh()])}>Nouvelle partie</button>
              </div>
            ) : (
              <>
                <h2 className="ref-turn">À <b>{pid && nameOf(pid)}</b> de jouer</h2>
                <p className="muted">Lancez vos vrais dés, puis indiquez le résultat final de votre tour.</p>
                <div className="ref-dice">
                  {dice.map((d, i) => (
                    <div key={i} className="ref-slot">
                      <span className="muted small">Dé {i + 1}</span>
                      <div className="ref-faces">
                        {[1, 2, 3, 4, 5, 6].map((v) => (
                          <button key={v} className={d === v ? 'on' : ''} aria-label={`Dé ${i + 1} : ${v}`} onClick={() => setDice(dice.map((x, j) => (j === i ? v : x)))}>
                            <MiniDie value={v} size={34} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {s.throwLimit > 1 && (
                  <div className="field">
                    <span>Nombre de lancers utilisés</span>
                    <div className="seg">
                      {Array.from({ length: s.throwLimit }, (_, i) => i + 1).map((n) => <button key={n} className={throws === n ? 'on' : ''} onClick={() => setThrows(n)}>{n}</button>)}
                    </div>
                  </div>
                )}
                {combo && <p className="combo-label ref-combo">{combo.label}<span>vaut {combo.value}</span></p>}
                {err && <p className="error">{err}</p>}
                <div className="row left">
                  <button className="btn primary big" disabled={!combo} onClick={validate}>Valider le coup</button>
                  {history.length > 1 && <button className="btn ghost" onClick={() => setHistory(history.slice(0, -1))}>Annuler le dernier coup</button>}
                </div>
              </>
            )}
          </section>
          <section>
            <h3>{points ? 'Points' : 'Jetons'}</h3>
            <ol className="ranking">
              {ranked.map((p) => (
                <li key={p.id} className={p.id === pid ? 'me' : ''}>
                  <span className="nm">{p.name}{p.out ? ' (sorti)' : ''}</span>
                  <span className="sc">{points ? `${p.score} pt${p.score > 1 ? 's' : ''}` : `${p.tokens} jeton${p.tokens > 1 ? 's' : ''}`}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </Shell>
  );
}
