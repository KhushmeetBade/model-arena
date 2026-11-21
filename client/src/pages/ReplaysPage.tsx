import { useState } from 'react';
import { useLiveryVersion } from '../store/useLiveries';
import { Link, useParams } from 'react-router-dom';
import { ChampionReveal } from '../components/race/ChampionReveal';
import { Hud } from '../components/race/Hud';
import { Telemetry } from '../components/race/Telemetry';
import { Icon } from '../components/Icons';
import { Badge, EmptyState, ErrorNote, PageHeader, SkeletonRows } from '../components/ui';
import { api } from '../lib/api';
import { useAsync, useIsMobile, useReplay } from '../lib/hooks';
import { fitName, fmtMs, livery } from '../lib/livery';
import { RaceScene } from '../three/RaceScene';

export function ReplaysPage() {
  useLiveryVersion(); // re-render when a car is customized
  const races = useAsync(() => api.races(), [], 5_000);
  const list = races.data?.races ?? [];
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <PageHeader kicker="Race archive" title="Replays" />
      {races.error && <ErrorNote>Couldn't load replays: {races.error}. Retrying automatically…</ErrorNote>}
      {!list.length && !races.loading && !races.error && (
        <EmptyState
          icon={<Icon.replay />}
          title="No replays yet"
          body="Every race is saved with its real event timeline — every token, finish and verdict — so you can rewatch it exactly as it happened."
          cta={{ to: '/race', label: 'START A RACE' }}
        />
      )}
      {races.loading && !list.length && <SkeletonRows rows={3} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => {
          const champ = r.competitors.find((c) => c.modelId === r.championId);
          return (
            <Link key={r.id} to={`/replays/${r.id}`} className="glass clip-angle block min-w-0 p-4 transition hover:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/45">{new Date(r.createdAt).toLocaleString()}</span>
                <Badge tone={r.status === 'complete' ? 'lime' : 'red'}>{r.status}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-white/85">{r.prompt}</p>
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
              {champ && (
                <div className="mt-3 text-sm">
                  🏆 <b style={{ color: livery(champ.modelId, champ.name).primary }}>{livery(champ.modelId, champ.name).callsign}</b> <span className="text-white/50">· {champ.scores?.total} pts · {fmtMs(champ.latencyMs)}</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ReplayPlayerPage() {
  useLiveryVersion(); // re-render when a car is customized
  const { id } = useParams();
  const mobile = useIsMobile();
  const race = useAsync(() => api.race(id!), [id]);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [restartKey, setRestartKey] = useState(0);
  const [showReveal, setShowReveal] = useState(true);
  const [showRadio, setShowRadio] = useState(!mobile);
  const { view, clock, duration } = useReplay(race.data, speed, playing, restartKey);

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

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-void">
      <div className="absolute inset-0">
        <RaceScene view={view} lowPower={mobile} />
      </div>
      <Hud view={view} clockMs={Math.min(clock, duration)} compact={mobile} />
      {showRadio && <Telemetry view={view} className={mobile ? 'absolute inset-x-2 bottom-[124px] z-20 h-[28dvh]' : 'absolute bottom-24 right-4 z-20 h-[280px] w-[440px]'} />}

      <div className={`glass absolute z-30 flex items-center gap-3 px-4 py-2 ${mobile ? 'inset-x-2 bottom-[64px]' : 'bottom-5 left-1/2 w-[560px] -translate-x-1/2'}`}>
        <span className="font-display text-[10px] font-bold tracking-[0.3em] text-neon-pink">REPLAY</span>
        <button onClick={() => setPlaying((p) => !p)} className="w-16 rounded bg-white/10 px-2 py-1 font-display text-[10px] font-bold">
          {playing ? 'PAUSE' : 'PLAY'}
        </button>
        <button
          onClick={() => {
            setRestartKey((k) => k + 1);
            setPlaying(true);
            setShowReveal(true);
          }}
          className="rounded bg-white/10 px-2 py-1 font-display text-[10px] font-bold"
        >
          RESTART
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-white/10">
          <div className="h-full bg-gradient-to-r from-neon-pink to-neon-cyan" style={{ width: `${duration ? Math.min(100, (clock / duration) * 100) : 0}%` }} />
        </div>
        {[1, 2, 4].map((s) => (
          <button key={s} onClick={() => setSpeed(s)} className={`rounded px-1.5 py-1 font-mono text-[10px] ${speed === s ? 'bg-neon-violet text-white' : 'text-white/50'}`}>
            {s}x
          </button>
        ))}
        <button onClick={() => setShowRadio((x) => !x)} className="hidden rounded px-1.5 py-1 font-display text-[10px] text-white/60 md:block">
          RADIO
        </button>
      </div>

      {view.phase === 'complete' && showReveal && (
        <ChampionReveal
          view={view}
          onClose={() => setShowReveal(false)}
          actions={
            <Link to="/replays" className="clip-tab bg-neon-violet/30 px-4 py-2 font-display text-[11px] font-bold tracking-widest hover:bg-neon-violet/50">
              ALL REPLAYS
            </Link>
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
