import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BoardViewMode = 'board' | 'list' | 'calendar';

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  viewMode: BoardViewMode;
  setViewMode: (mode: BoardViewMode) => void;

  /** Task drawer is global so it can be opened from any route (?task= deep link). */
  openTaskId: string | null;
  openTask: (id: string) => void;
  closeTask: () => void;

  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;

  activeProjectFilter: string | null;
  setActiveProjectFilter: (id: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

      viewMode: 'board',
      setViewMode: (viewMode) => set({ viewMode }),

      openTaskId: null,
      openTask: (openTaskId) => set({ openTaskId }),
      closeTask: () => set({ openTaskId: null }),

      notificationsOpen: false,
      setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),

      activeProjectFilter: null,
      setActiveProjectFilter: (activeProjectFilter) => set({ activeProjectFilter }),
    }),
    {
      name: 'taskforge:ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, viewMode: s.viewMode }),
    },
  ),
);
