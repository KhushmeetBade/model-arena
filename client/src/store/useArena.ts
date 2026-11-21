import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ArenaStore {
  lineup: string[];
  toggle: (id: string) => void;
  setLineup: (ids: string[]) => void;
  lastPrompt: string;
  setLastPrompt: (p: string) => void;
}

export const MAX_LINEUP = 5;

export const useArena = create<ArenaStore>()(
  persist(
    (set) => ({
      lineup: [],
      toggle: (id) =>
        set((s) => ({
          lineup: s.lineup.includes(id) ? s.lineup.filter((x) => x !== id) : s.lineup.length >= MAX_LINEUP ? s.lineup : [...s.lineup, id],
        })),
      setLineup: (ids) => set({ lineup: ids.slice(0, MAX_LINEUP) }),
      lastPrompt: '',
      setLastPrompt: (p) => set({ lastPrompt: p }),
    }),
    { name: 'model-arena' },
  ),
);
