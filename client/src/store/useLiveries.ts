import { create } from 'zustand';
import { api } from '../lib/api';
import type { CarCustom, LiveryMap } from '../lib/types';

interface LiveryStore {
  /** Saved per-model customizations from the server (shared by every page and replay). */
  map: LiveryMap;
  /** Bumped on every change so 3D scenes can re-memoize their liveries. */
  version: number;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (modelId: string, custom: CarCustom) => Promise<void>;
  reset: (modelId: string) => Promise<void>;
}

export const useLiveries = create<LiveryStore>((set, get) => ({
  map: {},
  version: 0,
  loaded: false,
  error: null,
  load: async () => {
    try {
      const { liveries } = await api.liveries();
      // avoid needless re-renders when nothing changed
      if (JSON.stringify(liveries) !== JSON.stringify(get().map)) set((s) => ({ map: liveries, version: s.version + 1 }));
      set({ loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },
  save: async (modelId, custom) => {
    const res = await api.saveLivery(modelId, custom);
    set((s) => {
      const map = { ...s.map };
      if (res.livery) map[modelId] = res.livery;
      else delete map[modelId];
      return { map, version: s.version + 1 };
    });
  },
  reset: async (modelId) => {
    await api.resetLivery(modelId);
    set((s) => {
      const map = { ...s.map };
      delete map[modelId];
      return { map, version: s.version + 1 };
    });
  },
}));

/** Subscribe a component to customization changes (re-renders it when any car is customized). */
export const useLiveryVersion = () => useLiveries((s) => s.version);
