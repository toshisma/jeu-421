import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getItem, type DiceItem } from '../../../shared/progress/catalog';
import {
  COLLECTION, CRAFT_COST, RARITIES, RARITY_COLOR, RARITY_LABEL, RARITY_ODDS, SHINY_ODDS, SHINY_SUFFIX, collectionDie, isShiny, type Rarity,
} from '../../../shared/progress/dice-collection';
import { BAG_PITY, collectionCount, type BagResult } from '../../../shared/progress/profile';
import type { ProfileApi } from '../account/useProfile';
import { faceImage } from '../three/dieArt';
import { sound } from '../audio/sound';
import { Shell } from './Screens';

const diceItem = (id: string): DiceItem | undefined => { const it = getItem(id); return it && it.category === 'dice' ? it : undefined; };
const pct = (x: number) => `${Math.round(x * 1000) / 10} %`.replace('.', ',');

/** Dé en volume (CSS 3D) avec les mêmes faces que dans le bac. */
export function DieCube({ id, size = 64, spin = false, locked = false }: { id: string; size?: number; spin?: boolean; locked?: boolean }) {
  const it = diceItem(id);
  if (!it || locked) {
    return <span className="die-cube locked" style={{ '--s': `${size}px` } as CSSProperties} aria-hidden><span className="q">?</span></span>;
  }
  const art = { body: it.body, body2: it.body2, pip: it.pip, accent: it.accent, pattern: it.pattern, glow: it.glow, seed: it.id };
  const faces: [string, number][] = [['f', 1], ['r', 3], ['t', 2], ['b', 6], ['l', 4], ['d', 5]];
  return (
    <span className={`die-cube${spin ? ' spin' : ''}${it.shiny ? ' shiny' : ''}${it.glow ? ' glow' : ''}`} style={{ '--s': `${size}px` } as CSSProperties} role="img" aria-label={it.name}>
      <span className="cube">
        {faces.map(([k, v]) => <i key={k} className={`fc ${k}`} style={{ backgroundImage: `url(${faceImage(v, art, size > 90 ? 192 : 112)})` }} />)}
      </span>
    </span>
  );
}

/** Petit badge de rareté. */
export function RarityTag({ rarity, shiny }: { rarity: Rarity; shiny?: boolean }) {
  return <span className={`rarity-tag r-${rarity}`} style={{ '--rc': RARITY_COLOR[rarity] } as CSSProperties}>{RARITY_LABEL[rarity]}{shiny ? ' ✦ brillant' : ''}</span>;
}

/** Ouverture d'un sac : le sac s'agite, s'ouvre, le dé apparaît dans la couleur de sa rareté. */
function BagOpening({ pa, onClose }: { pa: ProfileApi; onClose: () => void }) {
  const [phase, setPhase] = useState<'shake' | 'reveal' | 'error'>('shake');
  const [res, setRes] = useState<BagResult | null>(null);
  const [err, setErr] = useState('');
  const go = async () => {
    setPhase('shake'); setRes(null);
    sound.unlock(); sound.rattle();
    const [r] = await Promise.all([pa.openBag(), new Promise((ok) => setTimeout(ok, 1300))]);
    if (r.error || !r.result) { setErr(r.error ?? 'Ouverture impossible.'); setPhase('error'); return; }
    setRes(r.result); setPhase('reveal');
    if (r.result.rarity === 'legendaire' || r.result.shiny) sound.win(); else sound.validate();
  };
  const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; void go(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const it = res ? diceItem(res.id) : undefined;
  const left = pa.profile.bags ?? 0;
  return (
    <div className="bag-open" role="dialog" aria-label="Ouverture d'un sac de dés" style={res ? ({ '--rc': RARITY_COLOR[res.rarity] } as CSSProperties) : undefined}>
      <div className={`bag-stage ${phase}${res ? ` r-${res.rarity}` : ''}${res?.shiny ? ' is-shiny' : ''}`}>
        {phase === 'shake' && <div className="bag" aria-hidden>🎒</div>}
        {phase === 'error' && <p className="error">{err}</p>}
        {phase === 'reveal' && res && it && (
          <>
            <div className="burst" aria-hidden />
            <DieCube id={res.id} size={150} spin />
            <RarityTag rarity={res.rarity} shiny={res.shiny} />
            <h2>{it.name}</h2>
            <p className="muted">{collectionDie(res.id)?.flavor}</p>
            <p className="bag-note">{res.duplicate ? `Déjà dans votre collection : +${res.shards} éclats` : res.shiny ? 'Un dé brillant ! Seul 1 sac sur 150 en contient un.' : 'Nouveau dans votre collection !'}</p>
          </>
        )}
      </div>
      <div className="bag-actions">
        {phase === 'reveal' && res && !res.duplicate && (
          <button className="btn secondary" onClick={() => { void pa.equipItem(res.id); onClose(); }}>Jouer avec</button>
        )}
        {phase !== 'shake' && left > 0 && <button className="btn primary" onClick={() => void go()}>Ouvrir le suivant ({left})</button>}
        {phase !== 'shake' && <button className="btn ghost" onClick={onClose}>Fermer</button>}
      </div>
    </div>
  );
}

/** Fiche d'un dé : aperçu, rareté, histoire, actions. */
function DieSheet({ pa, id, onClose }: { pa: ProfileApi; id: string; onClose: () => void }) {
  const c = collectionDie(id)!;
  const it = diceItem(id)!;
  const p = pa.profile;
  const owned = p.owned.includes(id);
  const equipped = p.equipped.dice === id;
  const show = p.showcase ?? [];
  const inShow = show.includes(id);
  const cost = CRAFT_COST[c.rarity];
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<string | null>) => { setErr(await f()); };
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet die-sheet" role="dialog" aria-label={it.name} onClick={(e) => e.stopPropagation()} style={{ '--rc': RARITY_COLOR[c.rarity] } as CSSProperties}>
        <DieCube id={id} size={130} spin locked={!owned && isShiny(id)} />
        <RarityTag rarity={c.rarity} shiny={isShiny(id)} />
        <h2>{it.name}</h2>
        <p className="muted">{c.flavor}</p>
        {owned ? (
          <div className="row">
            <button className="btn primary" disabled={equipped} onClick={() => void run(() => pa.equipItem(id))}>{equipped ? 'Vos dés actuels' : 'Jouer avec'}</button>
            <button className="btn secondary" disabled={!inShow && show.length >= 3}
              onClick={() => void run(() => pa.setVitrine(inShow ? show.filter((x) => x !== id) : [...show, id]))}>
              {inShow ? 'Retirer de la vitrine' : show.length >= 3 ? 'Vitrine pleine (3)' : 'Mettre en vitrine'}
            </button>
          </div>
        ) : isShiny(id) ? (
          <p className="muted">Les dés brillants ne se fabriquent pas : on les trouve seulement dans les sacs.</p>
        ) : (
          <div className="row">
            <button className="btn primary" disabled={(p.shards ?? 0) < cost || !pa.isAccount} onClick={() => void run(() => pa.craft(id))}>Fabriquer pour {cost} éclats</button>
            <span className="muted small">Vous avez {p.shards ?? 0} éclats.</span>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        <button className="btn ghost" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

export function CollectionScreen({ pa, onBack, onAccount }: { pa: ProfileApi; onBack: () => void; onAccount: () => void }) {
  const p = pa.profile;
  const [filter, setFilter] = useState<Rarity | 'tous'>('tous');
  const [open, setOpen] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const count = collectionCount(p);
  const bags = p.bags ?? 0;
  // Les dés possédés d'abord (du plus rare au plus commun), puis ceux qui restent à trouver.
  const list = useMemo(() => {
    const rank = (c: (typeof COLLECTION)[number]) => (p.owned.includes(c.id) || p.owned.includes(c.id + SHINY_SUFFIX) ? 0 : 10) + (3 - RARITIES.indexOf(c.rarity));
    return COLLECTION.filter((c) => filter === 'tous' || c.rarity === filter).map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
  }, [filter, p.owned]);
  const owns = (id: string) => p.owned.includes(id);
  return (
    <Shell title="Collection de dés" onBack={onBack} wide>
      <section className="coll-head">
        <div className="bag-box">
          <span className="bag-ico" aria-hidden>🎒</span>
          <div>
            <b>{bags} sac{bags > 1 ? 's' : ''} à ouvrir</b>
            <small>On en trouve en jouant : environ 1 partie gagnée sur 5, et au plus tard toutes les {BAG_PITY} parties. Aussi au 7e jour de la série et contre le patron de la semaine.</small>
          </div>
          {pa.isAccount
            ? <button className="btn primary" disabled={bags < 1} onClick={() => setOpening(true)}>Ouvrir un sac</button>
            : <button className="btn primary" onClick={onAccount}>Créer un compte pour ouvrir</button>}
        </div>
        <div className="coll-stats">
          <span><b>{count.owned}</b>/{count.total} dés</span>
          <span><b>{count.shiny}</b> brillant{count.shiny > 1 ? 's' : ''}</span>
          <span><b>{p.shards ?? 0}</b> éclats</span>
        </div>
        {!pa.isAccount && <p className="note">Vos sacs sont gardés. Avec un compte gratuit, vous les ouvrez, vos dés sont sauvegardés, et les autres joueurs les voient quand vous lancez.</p>}
      </section>

      <div className="seg wide-seg coll-filter">
        <button className={filter === 'tous' ? 'on' : ''} onClick={() => setFilter('tous')}>Tous</button>
        {RARITIES.map((r) => <button key={r} className={filter === r ? 'on' : ''} onClick={() => setFilter(r)} style={{ '--rc': RARITY_COLOR[r] } as CSSProperties}>{RARITY_LABEL[r]}</button>)}
      </div>

      <ul className="coll-grid">
        {list.map((c) => {
          const has = owns(c.id), shiny = owns(c.id + SHINY_SUFFIX);
          return (
            <li key={c.id}>
              <button className={`coll-card r-${c.rarity}${has ? '' : ' missing'}${p.equipped.dice === c.id || p.equipped.dice === c.id + SHINY_SUFFIX ? ' equipped' : ''}`}
                style={{ '--rc': RARITY_COLOR[c.rarity] } as CSSProperties} onClick={() => setOpen(shiny && !has ? c.id + SHINY_SUFFIX : c.id)}>
                <DieCube id={c.id} size={56} locked={!has} />
                <b>{has ? c.name : '???'}</b>
                <RarityTag rarity={c.rarity} />
                {shiny && <span className="shiny-badge" title="Version brillante possédée" onClick={(e) => { e.stopPropagation(); setOpen(c.id + SHINY_SUFFIX); }}>✦</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <details className="odds">
        <summary>Chances dans un sac</summary>
        <p>{RARITIES.map((r) => `${RARITY_LABEL[r]} : ${pct(RARITY_ODDS[r])}`).join(' ; ')}. Version brillante : 1 sur {Math.round(1 / SHINY_ODDS)}.</p>
        <p>Un doublon se transforme en éclats, qui servent à fabriquer le dé de votre choix. Les sacs ne s'achètent pas : ils se gagnent seulement en jouant. Les dés de collection sont purement décoratifs, ils ne changent jamais le hasard des lancers.</p>
      </details>

      {open && <DieSheet pa={pa} id={open} onClose={() => setOpen(null)} />}
      {opening && <BagOpening pa={pa} onClose={() => setOpening(false)} />}
    </Shell>
  );
}

/** Carte de l'accueil : « Collectionne des dés super rares ! » */
export function CollectionPromo({ pa, onOpen }: { pa: ProfileApi; onOpen: () => void }) {
  const bags = pa.profile.bags ?? 0;
  const count = collectionCount(pa.profile);
  return (
    <button className="coll-promo" onClick={onOpen}>
      <span className="promo-dice" aria-hidden>
        <DieCube id="dc-paillettes" size={44} spin />
        <DieCube id="dc-dragon" size={58} spin />
        <DieCube id="dc-galaxie" size={44} spin />
      </span>
      <span className="promo-text">
        <b>Collectionne des dés super rares !</b>
        <span>{count.owned > 0 ? `${count.owned}/${count.total} dés dans votre collection.` : '25 dés à trouver, du commun au légendaire, et leurs versions brillantes.'} Les autres les voient quand vous lancez.</span>
      </span>
      {bags > 0 && <span className="promo-bags">🎒 {bags} sac{bags > 1 ? 's' : ''} à ouvrir</span>}
    </button>
  );
}

/** Vitrine d'un joueur (profil). */
export function Showcase({ ids, count }: { ids: string[]; count?: { owned: number; total: number; shiny: number } }) {
  if (!ids.length && !count?.owned) return null;
  return (
    <div className="showcase">
      <div className="showcase-dice">
        {ids.map((id) => { const c = collectionDie(id); return c ? (
          <figure key={id} style={{ '--rc': RARITY_COLOR[c.rarity] } as CSSProperties}>
            <DieCube id={id} size={56} spin={c.rarity === 'legendaire' || isShiny(id)} />
            <figcaption>{diceItem(id)?.name}</figcaption>
          </figure>
        ) : null; })}
      </div>
      {count && <small className="muted">Collection : {count.owned}/{count.total} dés{count.shiny ? `, ${count.shiny} brillant${count.shiny > 1 ? 's' : ''}` : ''}</small>}
    </div>
  );
}
