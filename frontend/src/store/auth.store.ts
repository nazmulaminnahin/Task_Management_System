import { create } from 'zustand';
import type { User } from '@/types';
import { authApi, tokenStore } from '@/lib/api';

interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'authenticated' | 'anonymous';
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  /** Called once on app boot: trades the http-only refresh cookie for an access token. */
  bootstrap: async () => {
    set({ status: 'loading' });
    try {
      const { accessToken, user } = await authApi.refresh();
      tokenStore.set(accessToken);
      set({ user, status: 'authenticated' });
    } catch {
      tokenStore.set(null);
      set({ user: null, status: 'anonymous' });
    }
  },

  login: async (email, password) => {
    const { accessToken, user } = await authApi.login(email, password);
    tokenStore.set(accessToken);
    set({ user, status: 'authenticated' });
    return user;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      tokenStore.set(null);
      set({ user: null, status: 'anonymous' });
    }
  },

  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
}));

// Global 401 handler wired by <ApiBootstrap/>: any hard auth failure logs out cleanly.
tokenStore.setUnauthorizedHandler(() => {
  useAuthStore.setState({ user: null, status: 'anonymous' });
  tokenStore.set(null);
});
