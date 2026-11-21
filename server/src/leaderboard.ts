import { RaceRecord } from './types.js';

export interface LeaderboardRow {
  modelId: string;
  name: string;
  provider: string;
  races: number;
  wins: number;
  podiums: number;
  dnfs: number;
  avgScore: number;
  avgQuality: number | null;
  avgLatencyMs: number | null;
  bestLatencyMs: number | null;
  winRate: number;
}

export function buildLeaderboard(races: RaceRecord[]): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow & { _score: number; _q: number[]; _lat: number[] }>();
  for (const r of races) {
    if (r.status !== 'complete') continue;
    for (const c of r.competitors) {
      let row = rows.get(c.modelId);
      if (!row) {
        row = { modelId: c.modelId, name: c.name, provider: c.provider, races: 0, wins: 0, podiums: 0, dnfs: 0, avgScore: 0, avgQuality: null, avgLatencyMs: null, bestLatencyMs: null, winRate: 0, _score: 0, _q: [], _lat: [] };
        rows.set(c.modelId, row);
      }
      row.races++;
      if (r.championId === c.modelId) row.wins++;
      if (c.status === 'finished' && c.rank && c.rank <= 3) row.podiums++;
      if (c.status === 'dnf') row.dnfs++;
      row._score += c.scores?.total ?? 0;
      if (c.scores?.quality != null && c.status === 'finished') row._q.push(c.scores.quality);
      if (c.status === 'finished' && c.latencyMs != null) row._lat.push(c.latencyMs);
    }
  }
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
  return [...rows.values()]
    .map(({ _score, _q, _lat, ...row }) => ({
      ...row,
      avgScore: Math.round((_score / row.races) * 10) / 10,
      avgQuality: avg(_q),
      avgLatencyMs: avg(_lat),
      bestLatencyMs: _lat.length ? Math.min(..._lat) : null,
      winRate: Math.round((row.wins / row.races) * 100),
    }))
    .sort((a, b) => b.wins - a.wins || b.avgScore - a.avgScore);
}
