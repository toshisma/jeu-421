/** Appels à l'API des comptes (même serveur que le multijoueur). */
import { SERVER_URL } from '../platform';
import { today } from '../../../shared/progress/quests';

const KEY = '421.compte';

export interface Session { token: string; username: string }

export function loadSession(): Session | null {
  try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function saveAccountSession(s: Session | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* */ }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T = Record<string, unknown>>(path: string, opts: { body?: object; token?: string | null; method?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${(SERVER_URL ?? '').replace(/\/$/, '')}/api${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        'X-Day': today(),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez votre connexion.', 0);
  }
  const data = await res.json().catch(() => ({ ok: false, error: 'Réponse invalide du serveur' }));
  if (!res.ok || data.ok === false) throw new ApiError(data.error ?? `Erreur ${res.status}`, res.status);
  return data as T;
}
