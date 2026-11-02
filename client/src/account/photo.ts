/**
 * Photo de profil : recadrée en carré et réduite à 256 × 256 sur l'appareil avant tout envoi
 * (moins de données, et les métadonnées de la photo d'origine — position GPS… — disparaissent).
 */
export async function photoToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une image.');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('Image illisible.'); });
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close?.();
  for (const q of [0.85, 0.7, 0.55]) {
    const url = c.toDataURL('image/jpeg', q);
    if (url.length < 150_000) return url;
  }
  throw new Error('Image trop lourde.');
}

/** Photo d'un joueur invité : gardée sur l'appareil uniquement. */
const KEY = '421.photo';
export const loadGuestPhoto = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const saveGuestPhoto = (d: string | null) => { try { if (d) localStorage.setItem(KEY, d); else localStorage.removeItem(KEY); } catch { /* */ } };
