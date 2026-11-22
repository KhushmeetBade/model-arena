import type { CarCustom, DemoSummary, RaceEvent, LeaderboardRow, LiveryMap, ModelInfo, ProvidersResponse, RacePlan, RaceRecord, RaceSummary, Settings } from './types';

const ACCESS_KEY = 'model-arena-access';
/** Owner access code for public deployments (kept only in this browser). */
export const accessCode = {
  get: () => {
    try {
      return localStorage.getItem(ACCESS_KEY) ?? '';
    } catch {
      return '';
    }
  },
  set: (v: string) => {
    try {
      if (v) localStorage.setItem(ACCESS_KEY, v);
      else localStorage.removeItem(ACCESS_KEY);
    } catch {
      /* private mode */
    }
  },
};

/** Error with the server's machine-readable code (e.g. 'access_required'). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

const headers = (extra?: HeadersInit): HeadersInit => {
  const code = accessCode.get();
  return { 'Content-Type': 'application/json', ...(code ? { 'x-arena-access': code } : {}), ...(extra ?? {}) };
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: headers(init?.headers) });
  } catch {
    throw new ApiError(navigator.onLine === false ? 'You are offline — reconnect to load live data.' : 'Could not reach the Model Arena server.', 0, 'network');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.code);
  return body as T;
}

/**
 * Runs a live race in ONE request and streams its events (Server-Sent Events over fetch, which works
 * on iPhone Safari and on serverless hosting). Resolves when the server reports the race is saved.
 */
export async function runRace(prompt: string, models: string[], onEvent: (ev: RaceEvent) => void, signal?: AbortSignal): Promise<{ id: string | null }> {
  let res: Response;
  try {
    res = await fetch('/api/races/run', { method: 'POST', headers: headers(), body: JSON.stringify({ prompt, models }), signal });
  } catch {
    throw new ApiError('Could not reach the race server — check your connection.', 0, 'network');
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.error ?? `Race request failed (${res.status})`, res.status, body?.code);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let savedId: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      let type = 'message';
      let data = '';
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data || type === 'end') continue;
      const parsed = JSON.parse(data);
      if (type === 'saved') savedId = parsed.id;
      else onEvent(parsed as RaceEvent);
    }
  }
  return { id: savedId };
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
  race: (id: string) => req<RaceRecord>(`/api/races/${encodeURIComponent(id)}`),
  /** Built-in DEMO races — simulated, never real inference. */
  demoRaces: () => req<{ races: DemoSummary[] }>('/api/demo/races'),
  demoRace: (id: string) => req<RaceRecord>(`/api/demo/races/${encodeURIComponent(id)}`),
  races: () => req<{ races: RaceSummary[] }>('/api/races'),
  leaderboard: () => req<{ rows: LeaderboardRow[] }>('/api/leaderboard'),
  liveries: () => req<{ liveries: LiveryMap }>('/api/liveries'),
  saveLivery: (modelId: string, custom: CarCustom) => req<{ modelId: string; livery: CarCustom | null }>('/api/liveries', { method: 'PUT', body: JSON.stringify({ modelId, ...custom }) }),
  resetLivery: (modelId: string) => req<{ ok: true }>(`/api/liveries?modelId=${encodeURIComponent(modelId)}`, { method: 'DELETE' }),
};

export const accessApi = {
  required: () => req<{ required: boolean }>('/api/access'),
  verify: () => req<{ ok: true }>('/api/access/verify', { method: 'POST' }),
};
