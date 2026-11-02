import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import {
  CATEGORY_LABELS, getItem, itemsOf, type Appearance, type Category, type Item,
} from '../../../shared/progress/catalog';
import { canBuy, levelInfo, type Profile } from '../../../shared/progress/profile';
import { TRAY_SHAPES } from '../physics/trayShapes';
import { sound } from '../audio/sound';
import type { Settings } from '../settings';
import { DiceTray, type DiceTrayHandle } from './DiceTray';
import { MiniDie } from './MiniDie';
import { ProfileChip } from './Screens';
import { Avatar } from './Avatar';
import { activeEvent, eventEnd, shortDate } from '../../../shared/progress/events';
import { today } from '../../../shared/progress/quests';

const CATS: Category[] = ['decor', 'felt', 'rim', 'shape', 'dice', 'accessoire'];

/** Vignette d'un objet (couleurs, forme ou dé miniature). */
function Swatch({ item }: { item: Item }) {
  switch (item.category) {
    case 'decor':
      return <span className="sw" style={{ background: `linear-gradient(160deg, ${item.background} 0 45%, ${item.table.base} 45% 100%)`, boxShadow: `inset 0 0 0 3px ${item.accent}55` }} />;
    case 'felt':
      return <span className={`sw felt${item.pattern ? ` pat-${item.pattern}` : ''}`} style={{ backgroundColor: item.color }} />;
    case 'rim':
      return <span className="sw" style={{ background: `linear-gradient(180deg, ${item.cap} 0 18%, ${item.base} 18% 75%, ${item.dark} 100%)` }} />;
    case 'shape': {
      const sh = TRAY_SHAPES[item.shape];
      const k = 36 / Math.max(sh.halfX, sh.halfZ);
      const pts = sh.verts.map(([x, z]) => `${50 + x * k},${50 + z * k}`).join(' ');
      return (
        <svg className="sw" viewBox="0 0 100 100">
          {sh.circleRadius ? <circle cx="50" cy="50" r={sh.circleRadius * k} /> : <polygon points={pts} />}
        </svg>
      );
    }
    case 'dice':
      return <span className="sw dice"><MiniDie value={5} size={40} body={item.body} pip={item.pip} /></span>;
    case 'accessoire':
      return <span className="sw acc-sw">{item.emoji || '–'}</span>;
  }
}

interface Props {
  profile: Profile;
  settings: Settings;
  onBuy: (id: string) => Promise<string | null>;
  onEquip: (id: string) => Promise<string | null>;
  onBack: () => void;
}

export function ShopScreen({ profile, settings, onBuy, onEquip, onBack }: Props) {
  const [cat, setCat] = useState<Category>('decor');
  const [selected, setSelected] = useState<string>(profile.equipped.decor);
  const [msg, setMsg] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const tray = useRef<DiceTrayHandle>(null);
  const level = levelInfo(profile.xp).level;

  // Changer d'onglet sélectionne l'objet équipé de cette catégorie.
  useEffect(() => { setSelected(profile.equipped[cat]); setMsg(null); }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const item = getItem(selected)!;
  // Aperçu : l'apparence équipée, avec l'objet sélectionné essayé par-dessus.
  const preview: Appearance = useMemo(() => ({ ...profile.equipped, [item.category]: item.id }), [profile.equipped, item]);
  const owned = profile.owned.includes(item.id);
  const equipped = profile.equipped[item.category] === item.id;
  const day = today();
  const event = activeEvent(day);
  const check = canBuy(profile, item, day);
  // Objets d'événement visibles pendant l'événement (ou s'ils sont possédés) ; objets du pass si possédés.
  const visible = (it: Item) => !(it.category === 'dice' && it.rarity) && (profile.owned.includes(it.id) || (it.event ? it.event === event?.id : !it.pass));

  const [busy, setBusy] = useState(false);
  const doBuy = async () => {
    sound.unlock();
    setBusy(true);
    const err = await onBuy(item.id);
    setBusy(false);
    if (err) { setMsg(err); return; }
    sound.chips(4);
    setMsg(`${item.name} acheté et installé !`);
  };
  const doEquip = async () => {
    sound.unlock();
    setBusy(true);
    const err = await onEquip(item.id);
    setBusy(false);
    if (err) { setMsg(err); return; }
    sound.click();
    setMsg(`${item.name} installé.`);
  };
  const tryRoll = async () => {
    if (rolling) return;
    sound.unlock();
    setRolling(true);
    const r = crypto.getRandomValues(new Uint32Array(4));
    await tray.current?.roll([1 + (r[0] % 6), 1 + (r[1] % 6), 1 + (r[2] % 6)], [false, false, false], r[3] >>> 1);
    setRolling(false);
  };

  return (
    <div className="shop">
      <header className="shop-head">
        <button className="icon-btn" onClick={onBack} aria-label="Retour"><Icon name="back" /></button>
        <h2>Personnaliser</h2>
        <ProfileChip profile={profile} />
      </header>

      <div className="shop-body">
        <section className="shop-preview">
          <DiceTray ref={tray} appearance={preview} quality={settings.quality} cup={settings.cup} insets={{ top: 8, bottom: 64, left: 0, right: 0 }} />
          {cat === 'accessoire' && (
            <div className="acc-preview"><Avatar emoji={settings.avatar} size={140} accessory={item.category === 'accessoire' ? item.emoji : undefined} /></div>
          )}
          <button className="btn small preview-roll" disabled={rolling} onClick={tryRoll}>Lancer pour essayer</button>
        </section>

        <section className="shop-side">
          <nav className="tabs">
            {CATS.map((c) => <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{CATEGORY_LABELS[c]}</button>)}
          </nav>
          <div className="items">
            {itemsOf(cat).filter(visible).map((it) => {
              const own = profile.owned.includes(it.id);
              const eq = profile.equipped[cat] === it.id;
              const locked = !own && level < it.level;
              return (
                <button key={it.id} className={`item${it.id === selected ? ' sel' : ''}${locked ? ' locked' : ''}`} onClick={() => { setSelected(it.id); setMsg(null); }}>
                  <Swatch item={it} />
                  <span className="it-name">{it.name}</span>
                  <span className="it-state">
                    {eq ? 'Installé' : own ? 'Possédé' : locked ? `Niveau ${it.level}` : it.price === 0 ? 'Gratuit' : `${it.price} pièces`}
                  </span>
                  <span className="it-tag">
                    {it.event && !own ? `Jusqu'au ${shortDate(eventEnd(event!, day))}` : it.pass ? 'Pass de saison' : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="item-detail">
            <div>
              <b>{item.name}</b>
              {item.description && <p className="muted small">{item.description}</p>}
              {msg && <p className="ok small">{msg}</p>}
            </div>
            {equipped ? <button className="btn" disabled>✓ Installé</button>
              : owned ? <button className="btn primary" disabled={busy} onClick={doEquip}>Installer</button>
                : check.ok ? <button className="btn primary" disabled={busy} onClick={doBuy}>Acheter pour {item.price} pièces</button>
                  : <button className="btn" disabled>
                    {check.reason === 'level' ? `Niveau ${item.level} requis` : check.reason === 'pass' ? 'Se gagne avec le pass' : check.reason === 'event' ? 'Événement terminé' : `Il manque ${item.price - profile.coins} pièces`}
                  </button>}
          </div>
          <p className="muted small shop-note">Les pièces se gagnent en jouant (victoires, 4-2-1, niveaux). Elles ne s'achètent pas et ne valent rien hors du jeu.</p>
        </section>
      </div>
    </div>
  );
}
