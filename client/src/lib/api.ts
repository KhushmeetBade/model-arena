import type { LeaderboardRow, ModelInfo, ProvidersResponse, RacePlan, RaceRecord, RaceSummary, Settings } from './types';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  models: (refresh = false) => req<{ models: ModelInfo[]; errors: Record<string, string> }>(`/api/models${refresh ? '?refresh=1' : ''}`),
  providers: () => req<ProvidersResponse>('/api/providers'),
  /** Dry run: request budget + quota check for a lineup. Makes no AI requests. */
  preflight: (models: string[]) => req<RacePlan>('/api/races/preflight', { method: 'POST', body: JSON.stringify({ models }) }),
  revalidate: () => req<{ ok: true }>('/api/providers/revalidate', { method: 'POST' }),
  settings: () => req<Settings>('/api/settings'),
  saveSettings: (s: Partial<Settings>) => req<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  createRace: (prompt: string, models: string[]) => req<RaceRecord>('/api/races', { method: 'POST', body: JSON.stringify({ prompt, models }) }),
  startRace: (id: string) => req<RaceRecord>(`/api/races/${id}/start`, { method: 'POST' }),
  race: (id: string) => req<RaceRecord>(`/api/races/${id}`),
  races: () => req<{ races: RaceSummary[] }>('/api/races'),
  leaderboard: () => req<{ rows: LeaderboardRow[] }>('/api/leaderboard'),
};
