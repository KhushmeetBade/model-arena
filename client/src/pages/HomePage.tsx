import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui';
import { api } from '../lib/api';
import { useAsync, useIsMobile } from '../lib/hooks';
import { emptyView, type RaceView } from '../lib/raceState';
import { RaceScene } from '../three/RaceScene';

export function HomePage() {
  const mobile = useIsMobile();
  const models = useAsync(() => api.models(), []);
  const providers = useAsync(() => api.providers(), []);
  const races = useAsync(() => api.races(), []);
  const board = useAsync(() => api.leaderboard(), []);

  const showcase: RaceView = useMemo(() => {
    const ms = (models.data?.models ?? []).slice(0, 3);
    const fallback = ['showcase:a', 'showcase:b', 'showcase:c'].map((id, i) => ({ id, name: ['Vortex', 'Spectre', 'Halcyon'][i], provider: 'openrouter' }));
    const src = ms.length ? ms : fallback;
    return {
      ...emptyView(),
      cars: src.map((m, lane) => ({ lane, modelId: m.id, name: m.name, provider: m.provider, status: 'grid' as const, tokens: 0, answerChars: 0, reasoningChars: 0, tps: 0, phase: null, text: '', boostUntilWall: 0 })),
    };
  }, [models.data]);

  const or = providers.data?.providers.find((p) => p.id === 'openrouter');
  const free = (models.data?.models ?? []).filter((m) => m.free);
  const lastChamp = races.data?.races.find((r) => r.championId);
  const champName = lastChamp?.competitors.find((c) => c.modelId === lastChamp.championId)?.name;
  const leader = board.data?.rows[0];

  return (
    <div>
      <section className="relative h-[78vh] min-h-[520px] overflow-hidden">
        <div className="absolute inset-0">
          <RaceScene view={showcase} mode="showcase" lowPower={mobile} />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void via-void/20 to-transparent" />
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
        {or && !or.configured && (
          <div className="glass clip-angle mb-6 p-5">
            <div className="font-display text-sm font-bold tracking-widest text-neon-amber">ENGINE NOT STARTED — API KEY NEEDED</div>
            <p className="mt-1 text-white/75">
              {free.length} verified free models were found on OpenRouter, but racing needs a free OpenRouter key. Create one at{' '}
              <a className="text-neon-cyan underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
                openrouter.ai/settings/keys
              </a>
              , put <code className="rounded bg-black/40 px-1 font-mono">OPENROUTER_API_KEY=…</code> in <code className="rounded bg-black/40 px-1 font-mono">model-arena/.env</code>,
              and restart the server.
            </p>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { k: 'FREE COMPETITORS', v: free.length, tone: 'text-neon-lime' },
            { k: 'RACES RUN', v: races.data?.races.filter((r) => r.status === 'complete').length ?? 0, tone: 'text-neon-cyan' },
            { k: 'LAST CHAMPION', v: champName ?? '—', tone: 'text-neon-amber' },
            { k: 'SEASON LEADER', v: leader ? `${leader.name} (${leader.wins}W)` : '—', tone: 'text-neon-pink' },
          ].map((s) => (
            <div key={s.k} className="glass clip-angle p-5">
              <div className="text-[10px] font-bold tracking-[0.3em] text-white/40">{s.k}</div>
              <div className={`mt-1 truncate font-display text-xl font-black ${s.tone}`}>{s.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { n: '01', t: 'Build your grid', d: 'Pick up to five models in the Garage. Free OpenRouter models are the default; official Claude and OpenAI APIs are optional.' },
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

        <div className="mt-10 flex flex-wrap items-center gap-2 text-sm text-white/50">
          Providers:
          {providers.data?.providers.map((p) => (
            <Badge key={p.id} tone={p.enabled ? 'lime' : p.configured ? 'amber' : 'gray'}>
              {p.label} · {p.enabled ? 'online' : p.configured ? 'disabled' : 'no key'}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
