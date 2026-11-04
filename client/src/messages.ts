/**
 * Messages privés : une connexion Socket.IO légère (espace « /messages ») tant qu'un compte a le
 * jeu ouvert. Elle apporte les nouveaux messages en direct et le nombre de non-lus.
 */
import type { Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';
import { SERVER_URL } from './platform';
import { api } from './account/api';

export interface PmMessage { id: number; from: string; text: string; at: number; mine: boolean; read: boolean }
export type PmEvent =
  | { type: 'message'; with: string; message: PmMessage; unread?: number }
  | { type: 'read'; by: string }
  | { type: 'unread'; unread: number };

let socket: Socket | null = null;
let current: string | null = null;
let unread = 0;
const listeners = new Set<(e: PmEvent) => void>();
const emit = (e: PmEvent) => { if (e.type === 'unread') unread = e.unread; else if (e.type === 'message' && e.unread !== undefined) unread = e.unread; for (const f of listeners) f(e); };

/** Ouvre (ou ferme, sans jeton) la connexion des messages pour ce compte. */
export function connectMessages(token: string | null) {
  if (token === current) return;
  socket?.disconnect(); socket = null; current = token; unread = 0;
  emit({ type: 'unread', unread: 0 });
  if (!token) return;
  // Socket.IO est chargé à part : la connexion s'ouvre dès qu'il est là (si le compte n'a pas changé).
  import('socket.io-client').then(({ io }) => { if (current === token && !socket) openMessages(io, token); }, () => {});
}
function openMessages(io: typeof import('socket.io-client').io, token: string) {
  try {
    socket = io(`${(SERVER_URL ?? '').replace(/\/$/, '')}/messages`, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('pm:message', (d) => emit({ type: 'message', ...d }));
    socket.on('pm:read', (d) => emit({ type: 'read', by: d.by }));
    socket.on('pm:unread', (d) => emit({ type: 'unread', unread: d.unread }));
  } catch { socket = null; }
}

export function onPm(f: (e: PmEvent) => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export const setUnread = (n: number) => emit({ type: 'unread', unread: n });

/** Nombre de messages non lus, tenu à jour en direct (et relu de temps en temps, par sécurité). */
export function useUnread(token: string | null): number {
  const [n, setN] = useState(unread);
  useEffect(() => onPm(() => setN(unread)), []);
  useEffect(() => {
    if (!token) return;
    const load = () => { if (document.visibilityState === 'visible') api<{ unread: number }>('/messages-unread', { token }).then((r) => setUnread(r.unread)).catch(() => {}); };
    load(); const t = setInterval(load, 60_000); return () => clearInterval(t);
  }, [token]);
  return n;
}
