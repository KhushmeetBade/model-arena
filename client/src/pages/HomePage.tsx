import { motion } from 'framer-motion';
import { useLiveryVersion } from '../store/useLiveries';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ProviderNotice } from '../components/ProviderNotice';
import { Badge, ErrorNote } from '../components/ui';
import { livery } from '../lib/livery';
import { api } from '../lib/api';
import { useAsync, useIsMobile } from '../lib/hooks';
import { emptyView, type RaceView } from '../lib/raceState';
import { RaceScene } from '../three/RaceScene';

export function HomePage() {
  useLiveryVersion(); // re-render when a car is customized
  const mobile = useIsMobile();
  const models = useAsync(() => api.models(), [], 30_000);
  const providers = useAsync(() => api.providers(), [], 10_000);
  const races = useAsync(() => api.races(), [], 5_000);
  const board = useAsync(() => api.leaderboard(), [], 5_000);

  const showcase: RaceView = useMemo(() => {
    const ms = (models.data?.models ?? []).slice(0, 3);
    const fallback = ['showcase:a', 'showcase:b', 'showcase:c'].map((id, i) => ({ id, name: ['Vortex', 'Spectre', 'Halcyon'][i], provider: 'openrouter' }));
    const src = ms.length ? ms : fallback;
    return {
      ...emptyView(),
      cars: src.map((m, lane) => ({ lane, modelId: m.id, name: m.name, provider: m.provider, status: 'grid' as const, tokens: 0, answerChars: 0, reasoningChars: 0, tps: 0, phase: null, text: '', boostUntilWall: 0 })),
    };
  }, [models.data]);

  const free = (models.data?.models ?? []).filter((m) => m.free);
  const lastChamp = races.data?.races.find((r) => r.championId);
  const champC = lastChamp?.competitors.find((c) => c.modelId === lastChamp.championId);
  const champName = champC ? livery(champC.modelId, champC.name).callsign : undefined;
  const leader = board.data?.rows[0];
  const recent = (races.data?.races ?? []).slice(0, 3);
  const serverError = models.error ?? providers.error ?? races.error ?? board.error;

  return (
    <div>
      <section className="relative h-[78vh] min-h-[520px] overflow-hidden">
        <div className="absolute inset-0">
          <RaceScene view={showcase} mode="showcase" lowPower={mobile} />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void via-void/70 to-void/10 md:via-void/20 md:to-transparent" />
        <div className="pointer-events-none relative mx-auto flex h-full max-w-[1600px] flex-col justify-end px-5 pb-12">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="font-display text-xs font-bold tracking-[0.5em] text-neon-cyan">AI CHAMPIONSHIP · SEASON 1</div>
            <h1 className="mt-2 font-display text-5xl font-black italic leading-[0.95] md:text-8xl">
              MODEL
              <br />
              <span className="bg-gradient-to-r from-neon-pink via-neon-violet to-neon-cyan bg-clip-text text-transparent">ARENA</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/75">
              Pit real AI models against each other on the same prompt. Every car is driven by live token streams, every lap time is measured latency, and a neutral AI
              steward judges the answers.
            </p>
            <div className="pointer-events-auto mt-6 flex flex-wrap gap-3">
              <Link to="/race" className="btn-race clip-angle px-8 py-4 text-sm font-black">
                START A RACE
              </Link>
              <Link to="/garage" className="clip-angle border border-white/20 bg-white/5 px-8 py-4 font-display text-sm font-bold tracking-widest backdrop-blur hover:bg-white/10">
                ENTER GARAGE
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-5">
        {serverError && (
          <div className="mb-6">
            <ErrorNote>Can't reach the race server ({serverError}). Start it with `npm run dev` in ~/projects/model-arena — this page reconnects automatically.</ErrorNote>
          </div>
        )}
        <ProviderNotice data={providers.data} className="mb-6" />
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { k: 'FREE COMPETITORS', v: free.length, tone: 'text-neon-lime' },
            { k: 'RACES RUN', v: races.data?.races.filter((r) => r.status === 'complete').length ?? 0, tone: 'text-neon-cyan' },
            { k: 'LAST CHAMPION', v: champName ?? 'No races yet', tone: champName ? 'text-neon-amber' : 'text-white/35' },
            { k: 'SEASON LEADER', v: leader ? `${livery(leader.modelId, leader.name).callsign} · ${leader.wins}W` : 'Awaiting first win', tone: leader ? 'text-neon-pink' : 'text-white/35' },
          ].map((s) => (
            <div key={s.k} className="glass clip-angle min-w-0 p-5">
              <div className="text-[10px] font-bold tracking-[0.3em] text-white/40">{s.k}</div>
              <div className={`mt-1 truncate font-display text-xl font-black ${s.tone}`}>{s.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { n: '01', t: 'Build your grid', d: 'Pick up to five verified free ($0) OpenRouter models in the Garage, then give each car its own colour, racing number, body style and nickname.' },
            { n: '02', t: 'Drop the flag', d: 'The same prompt goes to every car at the same instant. Cars launch on their first real token and accelerate with their stream.' },
            { n: '03', t: 'Steward’s verdict', d: 'A neutral free model grades every answer blind. Quality, measured speed and completion decide the champion.' },
          ].map((s) => (
            <div key={s.n} className="glass clip-angle p-6">
              <div className="font-display text-4xl font-black italic text-white/10">{s.n}</div>
              <div className="font-display text-lg font-bold">{s.t}</div>
              <p className="mt-1 text-white/65">{s.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold tracking-widest">RECENT RACES</h2>
            {recent.length > 0 && (
              <Link to="/replays" className="text-xs font-bold text-neon-cyan hover:underline">
                All replays →
              </Link>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="glass clip-angle flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-white/60">No races on record yet — the first checkered flag will appear here.</p>
              <Link to="/race" className="btn-race clip-angle px-5 py-2 text-xs font-black">
                RUN THE FIRST RACE
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {recent.map((r) => {
                const champ = r.competitors.find((c) => c.modelId === r.championId);
                return (
                  <Link key={r.id} to={`/replays/${r.id}`} className="glass clip-angle block min-w-0 p-4 transition hover:bg-white/5">
                    <div className="flex items-center justify-between text-xs text-white/45">
                      <span>{new Date(r.createdAt).toLocaleString()}</span>
                      <Badge tone={r.status === 'complete' ? 'lime' : 'red'}>{r.status}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-white/85">{r.prompt}</p>
                    <div className="mt-2 text-sm">{champ ? <>🏆 <b style={{ color: livery(champ.modelId, champ.name).primary }}>{livery(champ.modelId, champ.name).callsign}</b></> : <span className="text-white/45">No champion</span>}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-2 pb-6 text-sm text-white/50">
          Providers:
          {providers.data?.providers.map((p) => (
            <Badge key={p.id} tone={p.enabled ? 'lime' : p.locked ? 'gray' : p.configured ? 'amber' : 'gray'}>
              {p.label} · {p.enabled ? 'online' : p.locked ? 'locked (free-only)' : p.configured ? 'disabled' : 'no key'}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
