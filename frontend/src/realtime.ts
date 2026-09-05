import { io, type Socket } from 'socket.io-client';
import { session } from './api';

type EventName = 'offer:new' | 'offer:accepted' | 'offer:rejected' | 'transaction:status_changed';
type Handler = () => void;

/** Realtime is additive: callers still refresh normally if this connection fails. */
export function connectRealtime(onChange: Handler): () => void {
  const token = session()?.access_token;
  if (!token) return () => undefined;
  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/v1';
  const socketUrl = apiUrl.replace(/\/v1\/?$/, '');
  const socket: Socket = io(socketUrl, { path: '/socket.io', auth: { token }, reconnection: true, transports: ['websocket', 'polling'] });
  const events: EventName[] = ['offer:new', 'offer:accepted', 'offer:rejected', 'transaction:status_changed'];
  events.forEach(event => socket.on(event, onChange));
  return () => { events.forEach(event => socket.off(event, onChange)); socket.disconnect(); };
}
