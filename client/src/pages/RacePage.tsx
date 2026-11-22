import { AnimatePresence, motion } from 'framer-motion';
import { useLiveryVersion } from '../store/useLiveries';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChampionReveal } from '../components/race/ChampionReveal';
import { Countdown } from '../components/race/Countdown';
import { Hud } from '../components/race/Hud';
import { Telemetry } from '../components/race/Telemetry';
import { Badge } from '../components/ui';
import { api } from '../lib/api';
import { useAsync, useIsMobile } from '../lib/hooks';
import { accessApi, accessCode, ApiError, runRace } from '../lib/api';
import { applyEvent } from '../lib/raceState';
import { lineupLiveries, providerLabel } from '../lib/livery';
import { emptyView, type RaceView } from '../lib/raceState';
import { autoFillLineup, budgetLabel, resolveLineup } from '../lib/lineup';
import type { ModelInfo, RacePlan } from '../lib/types';
import { ProviderNotice } from '../components/ProviderNotice';
import { MAX_LINEUP, useArena } from '../store/useArena';
import { RaceScene } from '../three/RaceScene';

const PRESETS = [
  'Explain why the sky is blue to a 10-year-old in under 120 words.',
  'Write a Python function that returns the n-th Fibonacci number in O(log n) time, with a short explanation.',
  'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Show your reasoning.',
  'Give three concrete, non-obvious tips for reducing latency in a Node.js web API.',
];

function gridView(models: ModelInfo[]): RaceView {
  return {
    ...emptyView(),
    cars: models.map((m, lane) => ({
      lane, modelId: m.id, name: m.name, provider: m.provider, status: 'grid', tokens: 0, answerChars: 0, reasoningChars: 0, tps: 0, phase: null, text: '', boostUntilWall: 0,
    })),
  };
}

export function RacePage() {
  useLiveryVersion(); // re-render when a car is customized
  const mobile = useIsMobile();
  const { lineup, toggle, setLineup, lastPrompt, setLastPrompt } = useArena();
  const models = useAsync(() => api.models(), [], 15_000);
  const [prompt, setPrompt] = useState(lastPrompt || PRESETS[0]);
  // raceId: a local id for the race on screen; savedId: the server's id once the race is saved
  const [raceId, setRaceId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [liveView, setLiveView] = useState<RaceView>(emptyView);
  const [connError, setConnError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const access = useAsync(() => accessApi.required(), []);
  const [code, setCode] = useState(accessCode.get());
  const [codeInput, setCodeInput] = useState('');
  const needsCode = !!access.data?.required && !code;
  const [countdown, setCountdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showReveal, setShowReveal] = useState(true);
  const [showRadio, setShowRadio] = useState(!mobile);

  const all = models.data?.models ?? [];
  const available = all.filter((m) => m.available);
  // Auto-fill only an EMPTY lineup. Cars the user picked are never removed automatically —
  // unavailable ones (cooldown, quota, missing key) stay on the grid, flagged below.
  useEffect(() => {
    if (!models.data) return;
    const fill = autoFillLineup(lineup, all);
    if (fill) setLineup(fill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models.data]);

  const grid = resolveLineup(lineup, models.data ? all : []);
  const selected = grid.slots.map((s) => s.model).filter(Boolean) as ModelInfo[];
  const lineupKey = lineup.join('|');

  // Dry-run budget check whenever the (fully available) lineup changes. Makes no AI requests.
  const [plan, setPlan] = useState<RacePlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const planKey = useRef('');
  useEffect(() => {
    // Only clear the shown budget when the lineup itself changes, not on background data refreshes.
    if (planKey.current !== lineupKey || grid.blocked.length) {
      setPlan(null);
      setPlanError(null);
    }
    planKey.current = lineupKey;
    if (!models.data || !lineup.length || grid.blocked.length || raceId) return;
    let cancelled = false;
    api.preflight(lineup).then(
      (p) => !cancelled && setPlan(p),
      (e) => !cancelled && setPlanError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupKey, models.data]);
  const blockedReason = grid.blocked.length
    ? `${grid.blocked.length === 1 ? 'A car on your grid is' : `${grid.blocked.length} cars on your grid are`} unavailable — remove ${grid.blocked.length === 1 ? 'it' : 'them'} or wait until ready.`
    : plan && !plan.preflight.ok
      ? plan.preflight.reason
      : null;
  const preview = useMemo(() => gridView(selected), [selected.map((m) => m.id).join('|')]);
  const view = raceId && liveView.cars.length ? liveView : preview;
  const liveries = lineupLiveries(view.cars);

  // race clock
  const [clock, setClock] = useState(0);
  const startWall = useRef<number | null>(null);
  useEffect(() => {
    if (view.phase === 'racing' && startWall.current == null) startWall.current = performance.now();
    if (view.phase !== 'racing' && view.phase !== 'judging') return;
    let raf = 0;
    const tick = () => {
      setClock(performance.now() - (startWall.current ?? performance.now()));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [view.phase]);
  const finishedTimes = view.cars.map((c) => c.latencyMs ?? 0);
  const displayClock = view.phase === 'complete' || view.phase === 'failed' ? Math.max(...finishedTimes, view.t) : clock;

  function start() {
    if (raceId) return; // no duplicate submissions while a race is on screen
    setError(null);
    setConnError(null);
    setSavedId(null);
    setLastPrompt(prompt);
    startWall.current = null;
    setClock(0);
    setShowReveal(true);
    setLiveView(emptyView());
    setRaceId(`local-${Date.now()}`);
    setCountdown(true);
  }

  /** Lights out: one request validates, runs, judges, saves and streams the whole race. */
  async function go() {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let gotEvents = false;
    try {
      const { id } = await runRace(prompt, lineup, (ev) => {
        gotEvents = true;
        setLiveView((v) => applyEvent(v, ev));
      }, ctrl.signal);
      setSavedId(id);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e), 0);
      if (err.code === 'access_required') {
        accessCode.set('');
        setCode('');
      }
      if (!gotEvents) {
        // rejected before the race started (validation, quota, access): back to the setup panel
        setRaceId(null);
        setError(err.message);
      } else {
        setConnError('Connection lost mid-race. The race keeps running on the server and will appear in Replays when it finishes.');
      }
    } finally {
      setCreating(false);
      void models.reload();
    }
  }

  function reset() {
    abortRef.current?.abort();
    setRaceId(null);
    setSavedId(null);
    setConnError(null);
    setCountdown(false);
    setLiveView(emptyView());
    startWall.current = null;
    setClock(0);
    void models.reload();
  }

  async function saveCode() {
    const v = codeInput.trim();
    if (!v) return;
    accessCode.set(v);
    try {
      await accessApi.verify();
      setCode(v);
      setCodeInput('');
      setError(null);
    } catch (e) {
      accessCode.set('');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const inRace = !!raceId;
  const racing = inRace && (view.phase === 'racing' || view.phase === 'judging' || countdown);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-void">
      <div className="absolute inset-0">
        {view.cars.length > 0 ? (
          <RaceScene view={view} mode={inRace ? 'race' : 'showcase'} lowPower={mobile} />
        ) : (
          <div className="grid-floor h-full w-full opacity-40" />
        )}
      </div>

      {inRace && <Hud view={view} clockMs={displayClock} compact={mobile} />}
      {countdown && <Countdown key={raceId} onGo={() => { setCountdown(false); void go(); }} />}

      {/* setup panel */}
      <AnimatePresence>
        {!inRace && (
          <motion.div
            initial={{ x: mobile ? 0 : 60, y: mobile ? 60 : 0, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{ opacity: 0, y: 30 }}
            className={`absolute z-30 ${mobile ? 'inset-x-0 bottom-[60px] max-h-[58dvh] overflow-y-auto p-3' : 'right-5 top-20 bottom-5 w-[440px] overflow-y-auto'}`}
          >
            <div className="glass clip-angle p-5">
              <div className="font-display text-[11px] font-bold tracking-[0.35em] text-neon-cyan">RACE CONTROL</div>
              <h1 className="font-display text-2xl font-black italic">SET THE CHALLENGE</h1>
              <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-white/50">Prompt (sent identically to every car)</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={mobile ? 3 : 4}
                maxLength={8000}
                className="mt-1 w-full resize-none rounded border border-white/15 bg-black/40 p-3 font-mono text-sm outline-none focus:border-neon-pink"
                placeholder="Ask anything…"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((p, i) => (
                  <button key={i} onClick={() => setPrompt(p)} className="min-h-10 rounded border border-white/10 px-3 py-2 text-xs text-white/60 hover:border-neon-cyan hover:text-white">
                    Preset {i + 1}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-white/50">Starting grid ({lineup.length}/{MAX_LINEUP})</div>
                <Link to="/garage" className="text-xs font-bold text-neon-cyan hover:underline">Open garage →</Link>
              </div>
              <div className="mt-2 space-y-1.5">
                {grid.slots.map((slot, i) => {
                  const li = slot.model ? selected.indexOf(slot.model) : -1;
                  const lv = li >= 0 ? liveries[li] : undefined;
                  const ok = slot.state === 'ready';
                  return (
                    <div key={slot.id} className={`rounded bg-black/30 px-2 py-1.5 ${ok ? '' : 'opacity-80 ring-1 ring-neon-amber/40'}`} style={{ borderLeft: `3px solid ${lv?.primary ?? '#666'}` }}>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xs font-black italic text-white/50">L{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate" title={lv?.modelName}>
                          <span className="font-display text-xs font-bold">{lv ? `#${lv.number} ${lv.callsign}` : slot.id}</span>
                          {lv && lv.callsign !== lv.modelName.toUpperCase() && <span className="ml-1.5 text-[11px] text-white/45">{lv.modelName}</span>}
                        </span>
                        {slot.model && <Badge tone={slot.model.free ? 'lime' : 'amber'}>{slot.model.free ? 'free' : 'paid'}</Badge>}
                        {!ok && <Badge tone="amber">{slot.state === 'unlisted' ? 'unlisted' : 'offline'}</Badge>}
                        <button onClick={() => toggle(slot.id)} className="flex h-10 w-10 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-red-300" aria-label={`Remove ${slot.model?.name ?? slot.id}`}>✕</button>
                      </div>
                      {!ok && <div className="mt-0.5 truncate pl-6 text-[11px] text-neon-amber/90" title={slot.reason}>{slot.reason}</div>}
                    </div>
                  );
                })}
                {lineup.length < MAX_LINEUP && available.filter((m) => !lineup.includes(m.id)).length > 0 && (
                  <select
                    value=""
                    onChange={(e) => e.target.value && toggle(e.target.value)}
                    className="w-full rounded border border-dashed border-white/20 bg-black/30 px-2 py-2 text-sm text-white/70 outline-none"
                  >
                    <option value="">+ Add competitor…</option>
                    {available.filter((m) => !lineup.includes(m.id)).map((m) => (
                      <option key={m.id} value={m.id}>{m.name} · {providerLabel(m.provider)}{m.free ? ' · free' : ''}</option>
                    ))}
                  </select>
                )}
              </div>

              {models.error && (
                <div className="mt-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">Couldn't reach the race server: {models.error}</div>
              )}
              <ProviderNotice className="mt-4" />
              {models.data && available.length === 0 && (
                <div className="mt-3 rounded border border-neon-amber/40 bg-neon-amber/10 p-3 text-sm text-neon-amber">
                  No competitors are available right now. {all[0]?.unavailableReason ?? 'The model catalog is empty.'} —{' '}
                  <Link to="/pit-crew" className="underline">see Pit Crew</Link> for setup and quota status.
                </div>
              )}
              {blockedReason && <div className="mt-3 rounded border border-neon-amber/40 bg-neon-amber/10 p-3 text-sm text-neon-amber">{blockedReason}</div>}
              {planError && <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">Couldn't check the request budget: {planError}</div>}
              {error && <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

              {needsCode && (
                <div className="mt-3 rounded border border-neon-cyan/40 bg-neon-cyan/10 p-3 text-sm">
                  <label htmlFor="access-code" className="font-display text-[11px] font-bold tracking-widest text-neon-cyan">
                    OWNER ACCESS CODE
                  </label>
                  <p className="mt-1 text-xs text-white/65">
                    Live races use the owner's free OpenRouter quota, so they are locked on this public site. Everyone can watch the{' '}
                    <Link to="/replays" className="underline">demo races and real race replays</Link>.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="access-code"
                      type="password"
                      autoComplete="current-password"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void saveCode()}
                      className="h-11 min-w-0 flex-1 rounded border border-white/20 bg-black/40 px-3 font-mono text-sm outline-none focus:border-neon-cyan"
                      placeholder="Enter code"
                    />
                    <button onClick={() => void saveCode()} className="h-11 rounded bg-neon-cyan/80 px-4 font-display text-xs font-black text-black">
                      UNLOCK
                    </button>
                  </div>
                </div>
              )}
              {/* Pinned to the bottom of the panel so START is always reachable on small screens */}
              <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 bg-gradient-to-t from-[#0b0820] via-[#0b0820]/95 to-transparent px-5 pb-4 pt-3">
                <button
                  onClick={start}
                  disabled={creating || !!raceId || needsCode || !prompt.trim() || grid.ready.length === 0 || !!blockedReason || !plan}
                  className="btn-race clip-angle w-full py-4 text-base font-black text-white disabled:opacity-50"
                >
                  {creating ? 'PREPARING GRID…' : !plan && !blockedReason && grid.ready.length ? 'CHECKING QUOTA…' : 'START RACE'}
                </button>
                {plan?.preflight.ok && <p className="mt-2 text-center text-[11px] text-neon-lime/80">{budgetLabel(plan)}</p>}
                <p className="mt-1 text-center text-[11px] text-white/40">Cars move only on real streamed tokens. Speed bars show measured tokens/second.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* team radio */}
      {inRace && !mobile && showRadio && <Telemetry view={view} className="absolute bottom-4 right-4 z-20 h-[300px] w-[460px]" />}
      {inRace && mobile && showRadio && <Telemetry view={view} className="absolute inset-x-2 bottom-[64px] z-20 h-[34dvh]" />}
      {inRace && (
        <div className={`absolute z-30 flex gap-2 ${mobile ? 'right-2 top-[4.2rem]' : 'right-4 top-20'}`}>
          <button onClick={() => setShowRadio((x) => !x)} className="glass px-3 py-1.5 font-display text-[10px] font-bold tracking-widest">
            {showRadio ? 'HIDE RADIO' : 'TEAM RADIO'}
          </button>
          {!racing && (
            <button onClick={reset} className="glass px-3 py-1.5 font-display text-[10px] font-bold tracking-widest text-neon-cyan">NEW RACE</button>
          )}
        </div>
      )}
      {connError && view.phase !== 'complete' && <div className="absolute left-1/2 top-32 z-30 -translate-x-1/2 rounded bg-red-500/20 px-3 py-1 text-xs text-red-200">{connError}</div>}

      {inRace && view.phase === 'failed' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/70 p-4">
          <div className="glass clip-angle max-w-md p-6 text-center">
            <div className="font-display text-2xl font-black text-red-300">RED FLAG</div>
            <p className="mt-2 text-white/70">{view.error}</p>
            <button onClick={reset} className="btn-race clip-angle mt-4 px-6 py-2 text-sm font-black">BACK TO GRID</button>
          </div>
        </div>
      )}

      {inRace && view.phase === 'complete' && showReveal && (
        <ChampionReveal
          view={view}
          onClose={() => setShowReveal(false)}
          actions={
            <>
              <button onClick={reset} className="btn-race clip-tab px-4 py-2 text-[11px] font-black">RACE AGAIN</button>
              <Link to={savedId ? `/replays/${savedId}` : '/replays'} className="clip-tab bg-neon-violet/30 px-4 py-2 font-display text-[11px] font-bold tracking-widest hover:bg-neon-violet/50">WATCH REPLAY</Link>
            </>
          }
        />
      )}
      {inRace && view.phase === 'complete' && !showReveal && (
        <button onClick={() => setShowReveal(true)} className="btn-race clip-angle absolute bottom-20 left-1/2 z-30 -translate-x-1/2 px-6 py-3 text-sm font-black md:bottom-6">
          SHOW RESULTS
        </button>
      )}
    </div>
  );
}
