import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { applyEvent, emptyView, type RaceView } from './raceState';
import type { RaceEvent, RaceRecord } from './types';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, reload, setData };
}

/** Subscribes to a live race over SSE and reduces events into a RaceView. */
export function useLiveRace(raceId: string | null) {
  const [view, setView] = useState<RaceView>(emptyView);
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  useEffect(() => {
    if (!raceId) return;
    setView(emptyView());
    setConnError(null);
    const es = new EventSource(`/api/races/${raceId}/stream`);
    let ended = false;
    const handler = (e: MessageEvent) => {
      const ev = JSON.parse(e.data) as RaceEvent;
      setView((v) => applyEvent(v, ev));
    };
    const types = ['race.created', 'race.start', 'car.launch', 'car.first_token', 'car.progress', 'car.finish', 'car.dnf', 'judge.start', 'judge.done', 'judge.failed', 'race.complete', 'race.failed'];
    types.forEach((t) => es.addEventListener(t, handler as EventListener));
    es.addEventListener('end', () => {
      ended = true;
      es.close();
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => {
      if (ended) return;
      setConnError('Lost connection to the race server — retrying…');
    };
    return () => es.close();
  }, [raceId]);

  return { view, connected, connError };
}

/** Re-plays a recorded race using the original event timings. */
export function useReplay(record: RaceRecord | null, speed: number, playing: boolean, restartKey: number) {
  const [view, setView] = useState<RaceView>(emptyView);
  const [clock, setClock] = useState(0);
  const st = useRef({ idx: 0, t: 0 });

  useEffect(() => {
    st.current = { idx: 0, t: 0 };
    setView(emptyView());
    setClock(0);
  }, [record, restartKey]);

  useEffect(() => {
    if (!record || !playing) return;
    let raf = 0;
    let last = performance.now();
    const events = record.events;
    const tick = (now: number) => {
      // Clamp so a stalled frame (e.g. WebGL shader compile on first render) can't skip ahead.
      const dt = Math.min(now - last, 100) * speed;
      last = now;
      const s = st.current;
      s.t += dt;
      let v: RaceView | null = null;
      while (s.idx < events.length && events[s.idx].t <= s.t) {
        const ev = events[s.idx++];
        v = applyEvent(v ?? viewRef.current, ev);
      }
      if (v) {
        viewRef.current = v;
        setView(v);
      }
      setClock(s.t);
      if (s.idx < events.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [record, speed, playing, restartKey]);

  const viewRef = useRef(view);
  viewRef.current = view;
  const duration = record?.events.at(-1)?.t ?? 0;
  return { view, clock, duration, done: !!record && st.current.idx >= record.events.length };
}

export function useRaceClock(running: boolean) {
  const [ms, setMs] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;
    start.current ??= performance.now();
    let raf = 0;
    const tick = () => {
      setMs(performance.now() - start.current!);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  const reset = () => {
    start.current = null;
    setMs(0);
  };
  return { ms, reset };
}

export function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const on = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return m;
}
