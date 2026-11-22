import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChampionReveal } from '../components/race/ChampionReveal';
import { Hud } from '../components/race/Hud';
import { Telemetry } from '../components/race/Telemetry';
import { Icon } from '../components/Icons';
import { Badge, DemoBadge, EmptyState, ErrorNote, PageHeader, SkeletonRows } from '../components/ui';
import { api } from '../lib/api';
import { useAsync, useIsMobile, useReplay } from '../lib/hooks';
import { fitName, fmtMs, livery } from '../lib/livery';
import type { DemoSummary, RaceSummary } from '../lib/types';
import { useLiveryVersion } from '../store/useLiveries';
import { RaceScene } from '../three/RaceScene';

const clockLabel = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function RaceCard({ r, to, demo }: { r: RaceSummary | DemoSummary; to: string; demo?: DemoSummary['demo'] }) {
  const champ = r.competitors.find((c) => c.modelId === r.championId);
  const champLv = champ ? livery(champ.modelId, champ.name) : null;
  return (
    <Link to={to} className={`glass clip-angle block min-w-0 p-4 transition hover:bg-white/5 ${demo ? 'border border-neon-amber/30' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {demo ? <DemoBadge /> : <span className="text-xs text-white/45">{new Date(r.createdAt).toLocaleString()}</span>}
        {demo ? (
          <span className="font-mono text-[11px] text-white/50">{demo.durationLabel}</span>
        ) : (
          <Badge tone={r.status === 'complete' ? 'lime' : 'red'}>{r.status === 'complete' ? 'real AI · complete' : r.status}</Badge>
        )}
      </div>
      {demo && <div className="mt-2 font-display text-lg font-black italic">{demo.title}</div>}
      {demo && <p className="mt-1 text-xs text-white/55">{demo.blurb}</p>}
      <p className={`mt-2 line-clamp-2 ${demo ? 'text-sm text-white/70' : 'text-white/85'}`}>
        {demo && <span className="text-white/40">Prompt: </span>}
        {r.prompt}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...r.competitors]
          .sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9))
          .map((c) => {
            const lv = livery(c.modelId, c.name);
            return (
              <span key={c.modelId} className="rounded bg-black/40 px-1.5 py-0.5 font-display text-[10px] font-bold" style={{ color: lv.primary }}>
                {c.status === 'dnf' ? 'DNF' : `P${c.rank ?? '?'}`} {fitName(lv.callsign, 18)}
              </span>
            );
          })}
      </div>
      {champ && champLv && (
        <div className="mt-3 text-sm">
          🏆 <b style={{ color: champLv.primary }}>{champLv.callsign}</b>{' '}
          <span className="text-white/50">
            · {champ.scores?.total} pts · {fmtMs(champ.latencyMs)}
          </span>
        </div>
      )}
    </Link>
  );
}

export function ReplaysPage() {
  useLiveryVersion(); // re-render when a car is customized
  const races = useAsync(() => api.races(), [], 5_000);
  const demos = useAsync(() => api.demoRaces(), []);
  const list = races.data?.races ?? [];
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <PageHeader kicker="Race archive" title="Replays" />

      <section aria-labelledby="real-races">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 id="real-races" className="font-display text-sm font-bold tracking-[0.2em]">
            REAL AI RACES <span className="text-white/40">({list.length})</span>
          </h2>
          <span className="text-[11px] text-white/40">Live OpenRouter inference · counts toward Champions</span>
        </div>
        {races.error && <ErrorNote>Couldn't load replays: {races.error}. Retrying automatically…</ErrorNote>}
        {!list.length && !races.loading && !races.error && (
          <EmptyState
            icon={<Icon.replay />}
            title="No real races yet"
            body="Every real race is saved with its genuine event timeline — every token, finish and verdict — so you can rewatch it exactly as it happened. Try a demo race below in the meantime."
            cta={{ to: '/race', label: 'START A RACE' }}
          />
        )}
        {races.loading && !list.length && <SkeletonRows rows={2} />}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <RaceCard key={r.id} r={r} to={`/replays/${r.id}`} />
          ))}
        </div>
      </section>

      <section aria-labelledby="demo-races" className="mt-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="demo-races" className="font-display text-sm font-bold tracking-[0.2em] text-neon-amber">
            DEMO RACES
          </h2>
          <span className="text-[11px] text-white/40">Scripted for exploring the app · no AI requests · never counted in Champions</span>
        </div>
        {demos.loading && !demos.data && <SkeletonRows rows={1} />}
        {demos.error && <ErrorNote>Couldn't load the demo races: {demos.error}</ErrorNote>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {demos.data?.races.map((r) => (
            <RaceCard key={r.id} r={r} to={`/replays/demo/${r.id}`} demo={r.demo} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function ReplayPlayerPage({ demo = false }: { demo?: boolean }) {
  useLiveryVersion(); // re-render when a car is customized
  const { id } = useParams();
  const mobile = useIsMobile();
  const race = useAsync(() => (demo ? api.demoRace(id!) : api.race(id!)), [id, demo]);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [restartKey, setRestartKey] = useState(0);
  const [showReveal, setShowReveal] = useState(true);
  const [showRadio, setShowRadio] = useState(!mobile);
  const { view, clock, duration, done } = useReplay(race.data, speed, playing, restartKey);
  const isDemo = demo || !!race.data?.demo;

  const restart = () => {
    setRestartKey((k) => k + 1);
    setPlaying(true);
    setShowReveal(true);
  };

  if (race.error)
    return (
      <div className="mx-auto max-w-xl px-4 pt-24">
        <ErrorNote>Couldn't load this replay: {race.error}</ErrorNote>
        <Link to="/replays" className="mt-4 inline-block text-sm text-neon-cyan underline">
          Back to all replays
        </Link>
      </div>
    );
  if (!race.data || !view.cars.length)
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-white/55">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-neon-pink" />
        <div className="font-display text-xs tracking-[0.3em]">LOADING REPLAY</div>
      </div>
    );

  const btn = 'flex h-10 min-w-10 items-center justify-center rounded bg-white/10 px-3 font-display text-[10px] font-bold tracking-widest hover:bg-white/20';
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-void">
      <div className="absolute inset-0">
        <RaceScene view={view} lowPower={mobile} />
      </div>
      <Hud view={view} clockMs={Math.min(clock, duration)} compact={mobile} />
      {isDemo && (
        <div className={`pointer-events-none absolute z-30 ${mobile ? 'inset-x-2 top-[6.7rem]' : 'right-4 top-20'}`}>
          <DemoBadge size="lg" className={mobile ? 'w-full justify-center' : ''} />
        </div>
      )}
      {showRadio && <Telemetry view={view} className={mobile ? 'absolute inset-x-2 bottom-[132px] z-20 h-[26dvh]' : 'absolute bottom-24 right-4 z-20 h-[280px] w-[440px]'} />}

      <div
        className={`glass absolute z-30 flex items-center gap-2 px-2 py-1.5 ${mobile ? 'inset-x-2 bottom-[68px] flex-wrap' : 'bottom-5 left-1/2 w-[640px] -translate-x-1/2'}`}
        role="group"
        aria-label="Replay controls"
      >
        <button onClick={() => (done ? restart() : setPlaying((p) => !p))} className={`${btn} w-20 bg-neon-pink/30`} aria-label={done ? 'Replay again' : playing ? 'Pause' : 'Play'}>
          {done ? '↺ AGAIN' : playing ? '❚❚ PAUSE' : '▶ PLAY'}
        </button>
        <button onClick={restart} className={btn} aria-label="Restart replay">
          ⟲
        </button>
        <div className="flex min-w-[120px] flex-1 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(duration / 1000)} aria-valuenow={Math.round(Math.min(clock, duration) / 1000)} aria-label="Replay progress">
            <div className="h-full bg-gradient-to-r from-neon-pink to-neon-cyan" style={{ width: `${duration ? Math.min(100, (clock / duration) * 100) : 0}%` }} />
          </div>
          <span className="w-[74px] text-right font-mono text-[11px] tabular-nums text-white/70">
            {clockLabel(Math.min(clock, duration))} / {clockLabel(duration)}
          </span>
        </div>
        {[1, 2, 4].map((s) => (
          <button key={s} onClick={() => setSpeed(s)} aria-pressed={speed === s} className={`${btn} px-2 font-mono ${speed === s ? 'bg-neon-violet text-white' : 'text-white/60'}`}>
            {s}×
          </button>
        ))}
        <button onClick={() => setShowRadio((x) => !x)} aria-pressed={showRadio} className={`${btn} text-white/70`}>
          RADIO
        </button>
      </div>

      {view.phase === 'complete' && showReveal && (
        <ChampionReveal
          view={view}
          demo={isDemo}
          onClose={() => setShowReveal(false)}
          actions={
            <>
              <button onClick={restart} className="clip-tab bg-white/10 px-4 py-2 font-display text-[11px] font-bold tracking-widest hover:bg-white/20">
                WATCH AGAIN
              </button>
              <Link to="/replays" className="clip-tab bg-neon-violet/30 px-4 py-2 font-display text-[11px] font-bold tracking-widest hover:bg-neon-violet/50">
                ALL REPLAYS
              </Link>
            </>
          }
        />
      )}
      {view.phase === 'failed' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/70 p-4">
          <div className="glass clip-angle max-w-md p-6 text-center">
            <div className="font-display text-2xl font-black text-red-300">RED FLAG</div>
            <p className="mt-2 text-white/70">{view.error}</p>
            <Link to="/replays" className="btn-race clip-angle mt-4 inline-block px-6 py-2 text-sm font-black">
              ALL REPLAYS
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
