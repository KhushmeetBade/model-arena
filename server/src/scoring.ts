import { CompetitorResult, Settings } from './types.js';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Score each competitor (0–100):
 *  - quality: mean of the judge's four 0–10 criteria × 10 (null if no judge)
 *  - speed: fastest finisher latency ÷ this latency × 100
 *  - completion: 100 for a non-empty finished answer, 0 for DNF
 * total is the weighted mean; when no judge verdict exists the quality weight is dropped.
 * Ranks are assigned by total, tie-broken by lower latency.
 */
export function scoreCompetitors(competitors: CompetitorResult[], weights: Settings['weights']): CompetitorResult[] {
  const finished = competitors.filter((c) => c.status === 'finished' && c.text.trim() && c.latencyMs != null);
  const fastest = Math.min(...finished.map((c) => c.latencyMs!));

  const scored = competitors.map((c) => {
    const ok = finished.includes(c);
    if (!ok) return { ...c, scores: { quality: c.judge ? 0 : null, speed: 0, completion: 0, total: 0 } };
    const quality = c.judge
      ? clamp(((c.judge.accuracy + c.judge.helpfulness + c.judge.clarity + c.judge.completeness) / 4) * 10)
      : null;
    const speed = clamp((fastest / c.latencyMs!) * 100);
    const completion = 100;
    const parts: [number, number][] = [
      [weights.speed, speed],
      [weights.completion, completion],
    ];
    if (quality != null) parts.push([weights.quality, quality]);
    const wsum = parts.reduce((s, [w]) => s + w, 0) || 1;
    const total = parts.reduce((s, [w, v]) => s + w * v, 0) / wsum;
    return {
      ...c,
      scores: { quality: quality == null ? null : round1(quality), speed: round1(speed), completion, total: round1(total) },
    };
  });

  const order = [...scored].sort(
    (a, b) => b.scores!.total - a.scores!.total || (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity),
  );
  return scored.map((c) => ({ ...c, rank: order.indexOf(c) + 1 }));
}
