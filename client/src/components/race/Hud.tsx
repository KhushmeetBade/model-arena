import { AnimatePresence, motion } from 'framer-motion';
import { fmtMs, lineupLiveries, providerLabel } from '../../lib/livery';
import { orderCars, type RaceView } from '../../lib/raceState';

const STATUS: Record<string, { label: string; cls: string }> = {
  grid: { label: 'ON GRID', cls: 'text-white/50' },
  waiting: { label: 'LAUNCHING', cls: 'text-neon-amber' },
  streaming: { label: 'RACING', cls: 'text-neon-cyan' },
  finished: { label: 'FINISHED', cls: 'text-neon-lime' },
  dnf: { label: 'DNF', cls: 'text-red-400' },
};

export function Hud({ view, clockMs, compact = false }: { view: RaceView; clockMs: number; compact?: boolean }) {
  const liveries = lineupLiveries(view.cars);
  const ordered = orderCars(view.cars);
  const maxTps = Math.max(80, ...view.cars.map((c) => c.tps));

  return (
    <>
      <div className={`pointer-events-none absolute inset-x-0 top-16 z-20 flex px-3 ${compact ? "justify-start" : "justify-center"}`}>
        <div className={`glass clip-angle flex items-center gap-4 md:gap-8 ${compact ? "px-3 py-1" : "px-5 py-2"}`}>
          <div>
            <div className="text-[9px] font-bold tracking-[0.3em] text-white/40">RACE TIME</div>
            <div className="font-mono text-xl font-bold tabular-nums text-white md:text-2xl">{(clockMs / 1000).toFixed(2)}s</div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div>
            <div className="text-[9px] font-bold tracking-[0.3em] text-white/40">STATUS</div>
            <div className="font-display text-sm font-bold tracking-widest text-neon-pink md:text-base">
              {view.phase === 'grid' && 'GRID'}
              {view.phase === 'racing' && 'LIVE'}
              {view.phase === 'judging' && 'JUDGING'}
              {view.phase === 'complete' && 'CHECKERED'}
              {view.phase === 'failed' && 'RED FLAG'}
            </div>
          </div>
          <div className="hidden h-8 w-px bg-white/10 md:block" />
          <div className="hidden md:block">
            <div className="text-[9px] font-bold tracking-[0.3em] text-white/40">FINISHED</div>
            <div className="font-display text-base font-bold">
              {view.cars.filter((c) => c.status === 'finished').length}/{view.cars.length}
            </div>
          </div>
        </div>
      </div>

      <div className={`pointer-events-none absolute z-20 ${compact ? 'inset-x-2 top-[7.6rem]' : 'left-3 top-36 w-[320px]'}`}>
        <div className={compact ? 'grid grid-cols-1 gap-1' : 'space-y-1.5'}>
          <AnimatePresence>
            {ordered.map((c, pos) => {
              const lv = liveries[view.cars.indexOf(c)];
              const st = STATUS[c.status];
              if (compact)
                return (
                  <motion.div layout key={c.modelId} className="glass flex items-center gap-2 px-2 py-0.5 text-[10px]" style={{ borderLeft: `3px solid ${lv.primary}` }}>
                    <span className="w-4 font-display font-black italic">{c.status === 'dnf' ? '–' : pos + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-display font-bold">{lv.callsign}</span>
                    <span className={`font-display text-[8px] font-bold ${st.cls}`}>{st.label}</span>
                    <span className="w-14 text-right font-mono tabular-nums text-white/70">{c.status === 'finished' ? fmtMs(c.latencyMs) : `${c.tps.toFixed(0)} t/s`}</span>
                  </motion.div>
                );
              return (
                <motion.div layout key={c.modelId} className="glass flex items-center gap-2 overflow-hidden px-2 py-1" style={{ borderLeft: `4px solid ${lv.primary}` }}>
                  <div className="w-6 text-center font-display text-sm font-black italic text-white/80">{c.status === 'dnf' ? '–' : pos + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-display text-[11px] font-bold tracking-wider">{lv.callsign}</div>
                      <div className={`shrink-0 font-display text-[9px] font-bold tracking-widest ${st.cls}`}>
                        {c.status === 'streaming' && c.phase === 'thinking' ? 'THINKING' : st.label}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (c.tps / maxTps) * 100)}%`, background: `linear-gradient(90deg, ${lv.primary}, ${lv.accent})` }} />
                      </div>
                      <div className="w-[92px] text-right font-mono text-[10px] tabular-nums text-white/70">
                        {c.status === 'finished' ? fmtMs(c.latencyMs) : `${c.tps.toFixed(1)} tok/s`}
                      </div>
                    </div>
                    {!compact && (
                      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-white/40">
                        <span className="truncate">{lv.callsign !== lv.modelName.toUpperCase() ? lv.modelName : providerLabel(c.provider)}</span>
                        <span>TTFT {fmtMs(c.ttftMs)} · {c.outputTokens ?? c.tokens} tok{c.tokensEstimated !== false && c.status !== 'finished' ? '~' : ''}</span>
                      </div>
                    )}
                    {c.status === 'dnf' && c.error && !compact && <div className="mt-0.5 truncate text-[10px] text-red-300/80" title={c.error}>{c.error}</div>}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        {view.judge && (
          <div className={`glass mt-2 px-3 text-xs ${compact ? "py-1" : "py-2"}`}>
            <div className="font-display text-[10px] font-bold tracking-[0.25em] text-neon-amber">RACE STEWARD</div>
            <div className="text-white/80">
              {view.judge.status === 'running' && <>Evaluating answers with <b>{view.judge.name}</b>…</>}
              {view.judge.status === 'done' && <>Verdict by <b>{view.judge.name}</b></>}
              {view.judge.status === 'failed' && <>{view.judge.name} failed: {view.judge.error}</>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
