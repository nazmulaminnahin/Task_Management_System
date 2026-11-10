import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { tokenStore } from '@/lib/api';

let socket: Socket | null = null;

/**
 * One shared Socket.io connection per tab.
 * Auth is sent in the handshake payload (not the query string) and a fresh
 * token is picked up automatically on reconnect via the auth callback.
 * Dev is same-origin through the Vite proxy, so no explicit URL is needed.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: false,
      auth: (cb) => cb({ token: tokenStore.get() ?? '' }),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8_000,
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Subscribe to a socket event with a stable handler for the component lifetime. */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const s = connectSocket();
    const listener = (payload: T) => ref.current(payload);
    s.on(event, listener);
    return () => {
      s.off(event, listener);
    };
  }, [event]);
}

export function useSocketStatus(): { connected: boolean } {
  const socketRef = useRef(getSocket());
  const connected = useRef(socketRef.current.connected);
  // Re-render on connect/disconnect via a tiny subscription.
  const [, force] = useReducerTick();
  useEffect(() => {
    const s = connectSocket();
    const on = () => {
      connected.current = true;
      force();
    };
    const off = () => {
      connected.current = false;
      force();
    };
    s.on('connect', on);
    s.on('disconnect', off);
    force();
    return () => {
      s.off('connect', on);
      s.off('disconnect', off);
    };
  }, [force]);
  return { connected: connected.current };
}

import { useReducer } from 'react';
function useReducerTick(): [number, () => void] {
  const [tick, force] = useReducer((n: number) => n + 1, 0);
  return [tick, force];
}
