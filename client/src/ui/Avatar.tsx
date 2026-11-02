import { assetUrl } from '../platform';

/** Avatar rond : la photo du joueur s'il en a une, sinon son emoji. */
export function Avatar({ photo, emoji, size = 40, color, accessory, children }: { photo?: string | null; emoji?: string; size?: number; color?: string; accessory?: string; children?: React.ReactNode }) {
  const src = assetUrl(photo);
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.52, ['--pc' as string]: color }}>
      {src ? <img src={src} alt="" draggable={false} /> : <span>{emoji ?? '🎲'}</span>}
      {accessory && <span className="acc" style={{ fontSize: Math.max(12, size * 0.42) }} aria-hidden>{accessory}</span>}
      {children}
    </div>
  );
}
