import type { Evaluation, RaceEvent } from './types';

export type CarStatus = 'grid' | 'waiting' | 'streaming' | 'finished' | 'dnf';

export interface CarState {
  lane: number;
  modelId: string;
  name: string;
  provider: string;
  status: CarStatus;
  tokens: number;
  answerChars: number;
  reasoningChars: number;
  tps: number;
  phase: 'thinking' | 'answering' | null;
  ttftMs?: number;
  latencyMs?: number;
  outputTokens?: number;
  tokensEstimated?: boolean;
  finishPos?: number;
  text: string;
  error?: string;
  /** Wall-clock (performance.now) timestamps used purely for animation. */
  launchedAtWall?: number;
  boostUntilWall: number;
}

export interface Standing {
  lane: number;
  modelId: string;
  rank: number;
  scores: { quality: number | null; speed: number; completion: number; total: number } | null;
  judge: { accuracy: number; helpfulness: number; clarity: number; completeness: number; comment: string } | null;
  latencyMs: number | null;
  status: string;
}

export interface RaceView {
  phase: 'grid' | 'racing' | 'judging' | 'complete' | 'failed';
  prompt: string;
  /** Race-clock time (ms) of the latest applied event */
  t: number;
  cars: CarState[];
  judge?: { name: string; status: 'running' | 'done' | 'failed'; error?: string };
  championId?: string | null;
  evaluation?: Evaluation;
  standings?: Standing[];
  error?: string;
}

export const emptyView = (): RaceView => ({ phase: 'grid', prompt: '', t: 0, cars: [] });

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function applyEvent(s: RaceView, ev: RaceEvent): RaceView {
  const d = ev.data ?? {};
  const upd = (lane: number, fn: (c: CarState) => Partial<CarState>): CarState[] =>
    s.cars.map((c) => (c.lane === lane ? { ...c, ...fn(c) } : c));
  const base = { ...s, t: Math.max(s.t, ev.t) };

  switch (ev.type) {
    case 'race.created':
      return {
        ...emptyView(),
        cars: (d.competitors as any[]).map((c) => ({
          lane: c.lane, modelId: c.modelId, name: c.name, provider: c.provider,
          status: 'grid', tokens: 0, answerChars: 0, reasoningChars: 0, tps: 0, phase: null, text: '', boostUntilWall: 0,
        })),
      };
    case 'race.start':
      return { ...base, phase: 'racing', prompt: d.prompt ?? s.prompt };
    case 'car.launch':
      return { ...base, cars: upd(d.lane, () => ({ status: 'waiting', launchedAtWall: now() })) };
    case 'car.first_token':
      return { ...base, cars: upd(d.lane, () => ({ status: 'streaming', ttftMs: d.ttftMs, boostUntilWall: now() + 1400 })) };
    case 'car.progress':
      return {
        ...base,
        cars: upd(d.lane, (c) => ({
          status: c.status === 'finished' || c.status === 'dnf' ? c.status : 'streaming',
          text: c.text + (d.append ?? ''),
          tokens: d.tokens,
          answerChars: d.answerChars,
          reasoningChars: d.reasoningChars,
          tps: d.tps,
          phase: d.phase,
          // Nitro when the token rate surges.
          boostUntilWall: d.tps > 0 && c.tps > 0 && d.tps > c.tps * 1.25 ? now() + 700 : c.boostUntilWall,
        })),
      };
    case 'car.finish':
      return {
        ...base,
        cars: upd(d.lane, () => ({
          status: 'finished', finishPos: d.position, latencyMs: d.latencyMs, ttftMs: d.ttftMs ?? undefined,
          outputTokens: d.outputTokens, tokensEstimated: d.tokensEstimated, tps: d.tps ?? 0, boostUntilWall: now() + 1600,
        })),
      };
    case 'car.dnf':
      return { ...base, cars: upd(d.lane, () => ({ status: 'dnf', error: d.error })) };
    case 'judge.start':
      return { ...base, phase: 'judging', judge: { name: d.judgeName, status: 'running' } };
    case 'judge.done':
      return { ...base, judge: s.judge ? { ...s.judge, status: 'done' } : undefined };
    case 'judge.failed':
      return { ...base, judge: s.judge ? { ...s.judge, status: 'failed', error: d.error } : undefined };
    case 'race.complete':
      return { ...base, phase: 'complete', championId: d.championId, evaluation: d.evaluation, standings: d.standings };
    case 'race.failed':
      return { ...base, phase: 'failed', error: d.error };
    default:
      return base;
  }
}

/** Visual progress along the track (0 = start line, 1 = finish line) driven by real stream data. */
export function targetProgress(c: CarState, wallNow: number, current: number): number {
  switch (c.status) {
    case 'grid':
      return 0;
    case 'waiting': {
      const secs = c.launchedAtWall ? (wallNow - c.launchedAtWall) / 1000 : 0;
      return Math.min(0.045, 0.015 * secs);
    }
    case 'streaming':
      return Math.max(current, 0.06 + 0.86 * (1 - Math.exp(-c.tokens / 220)));
    case 'finished':
      return 1.07;
    case 'dnf':
      return current;
  }
}

export function orderCars(cars: CarState[]): CarState[] {
  const score = (c: CarState) =>
    c.status === 'finished' ? 10_000 - (c.finishPos ?? 0) : c.status === 'dnf' ? -1 : c.tokens + (c.status === 'streaming' ? 1 : 0);
  return [...cars].sort((a, b) => score(b) - score(a));
}
