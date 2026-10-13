/**
 * Socket.IO client singleton + React hooks for real-time events.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

const defaultSocketUrl = typeof window !== 'undefined' && window.location.hostname
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : 'http://localhost:4000';

const SOCKET_URL = (import.meta.env.VITE_API_URL || defaultSocketUrl).replace(/\/+$/, '').trim();

let socket: Socket | null = null;

// ── Connect / Disconnect ──────────────────────────────────────────────────
export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token: getAccessToken() },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected:', socket?.id);
    // Join POS and KDS rooms for order/payment/kitchen events
    socket?.emit('join:pos');
    socket?.emit('join:kds');
    socket?.emit('join', 'pos');
    socket?.emit('join', 'kds');
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

// ── React hook: subscribe to a Socket.IO event ──────────────────────────
export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const s = socket;
    if (!s) return;

    const listener = (data: T) => handlerRef.current(data);
    s.on(event, listener);
    return () => { s.off(event, listener); };
  }, [event]);
}

// ── React hook: subscribe to multiple events, collect into state ────────
export function useSocketState<T>(
  event: string,
  initialState: T[],
  mode: 'append' | 'replace' = 'replace',
): T[] {
  const [state, setState] = useState<T[]>(initialState);

  useSocketEvent<T | T[]>(event, (data) => {
    if (mode === 'replace') {
      setState(Array.isArray(data) ? data : [data]);
    } else {
      setState((prev) => [...prev, ...(Array.isArray(data) ? data : [data])]);
    }
  });

  return state;
}

// ── React hook: poll-based data fetcher with Socket.IO live updates ─────
export function useLiveData<T>(
  fetchFn: () => Promise<T[]>,
  socketEvents: string[],
  deps: unknown[] = [],
): { data: T[]; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      console.error('useLiveData fetch error:', err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Refetch on socket events
  useEffect(() => {
    const s = socket;
    if (!s) return;

    const listener = () => refetch();
    socketEvents.forEach((ev) => s.on(ev, listener));
    return () => {
      socketEvents.forEach((ev) => s.off(ev, listener));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, ...socketEvents]);

  return { data, loading, refetch };
}
