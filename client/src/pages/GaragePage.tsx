import { useEffect, useState } from 'react';
import { PaintShop } from '../components/PaintShop';
import { useLiveries, useLiveryVersion } from '../store/useLiveries';
import { Link } from 'react-router-dom';
import { Badge, ErrorNote, PageHeader, Stat } from '../components/ui';
import { api } from '../lib/api';
import { ProviderNotice } from '../components/ProviderNotice';
import { useAsync } from '../lib/hooks';
import { resolveLineup } from '../lib/lineup';
import { fmtMs, livery, providerLabel, shortName } from '../lib/livery';
import type { CarCustom, ModelInfo } from '../lib/types';
import { MAX_LINEUP, useArena } from '../store/useArena';
import { GarageScene } from '../three/GarageScene';

export function GaragePage() {
  useLiveryVersion(); // re-render when a car is customized
  const { lineup, toggle } = useArena();
  const models = useAsync(() => api.models(), [], 15_000);
  const board = useAsync(() => api.leaderboard(), [], 10_000);
  const [focus, setFocus] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'free' | 'available'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function refreshCatalog() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await api.models(true);
      models.setData(fresh);
      void board.reload();
      const errs = Object.entries(fresh.errors ?? {});
      if (errs.length) setRefreshError(`Catalog partly refreshed — ${errs.map(([p, e]) => `${p}: ${e}`).join('; ')}`);
    } catch (e) {
      setRefreshError(`Couldn't refresh the catalog: ${e instanceof Error ? e.message : String(e)}. Showing the last known list.`);
    } finally {
      setRefreshing(false);
    }
  }

  const all = models.data?.models ?? [];
  useEffect(() => {
    if (!focus && all.length) setFocus(lineup[0] ?? all[0].id);
  }, [all.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const focused = all.find((m) => m.id === focus) ?? all[0];
  // Paint-shop draft: starts from the saved customization and previews live on the 3D car.
  const saved = useLiveries((s) => (focused ? s.map[focused.id] : undefined));
  const [draft, setDraft] = useState<CarCustom>({});
  const savedKey = JSON.stringify(saved ?? {});
  useEffect(() => setDraft(saved ? { ...saved } : {}), [focused?.id, savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lv = focused ? livery(focused.id, focused.name, draft) : null;
  const stats = board.data?.rows.find((r) => r.modelId === focused?.id);
  const grid = resolveLineup(lineup, models.data ? all : []);
  const shown = all.filter((m) => (filter === 'free' ? m.free : filter === 'available' ? m.available : true));

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <PageHeader kicker="Team garage" title="Choose your racers">
        <div className="flex items-center gap-3">
          <span className="font-display text-sm text-white/60">
            GRID {lineup.length}/{MAX_LINEUP}
          </span>
          <Link to="/race" className={`btn-race clip-angle px-6 py-3 text-xs font-black ${lineup.length ? '' : 'pointer-events-none opacity-40'}`}>
            RACE THIS LINEUP
          </Link>
        </div>
      </PageHeader>
      {models.error && <ErrorNote>Couldn't load the model catalog: {models.error}. Is the server running on :8787?</ErrorNote>}
      <ProviderNotice className="mb-4" />
      {grid.blocked.length > 0 && (
        <div className="mb-4 rounded border border-neon-amber/40 bg-neon-amber/10 px-3 py-2 text-sm text-neon-amber">
          {grid.blocked.length} car{grid.blocked.length === 1 ? ' on your grid is' : 's on your grid are'} unavailable right now and will stay on the grid until you remove{' '}
          {grid.blocked.length === 1 ? 'it' : 'them'}: {grid.blocked.map((s) => `${s.model?.name ?? s.id} (${s.reason})`).join(' · ')}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        {focused && lv && (
          <div className="glass clip-angle overflow-hidden lg:sticky lg:top-20 lg:self-start">
            <div className="relative h-[240px] md:h-[400px]">
              <GarageScene livery={lv} />
              <div className="pointer-events-none absolute left-4 top-4 right-4">
                <div className="font-display text-[10px] font-bold tracking-[0.3em] text-white/50">
                  #{lv.number} · {lv.chassisName} CHASSIS
                </div>
                <div className="truncate font-display text-2xl font-black italic" style={{ color: lv.primary, textShadow: `0 0 24px ${lv.primary}` }}>
                  {lv.callsign}
                </div>
                {lv.callsign !== lv.modelName.toUpperCase() && <div className="text-xs text-white/60">driven by {lv.modelName}</div>}
              </div>
              <div className="pointer-events-none absolute bottom-3 right-4 text-[11px] text-white/40">Drag to rotate</div>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <Badge tone="cyan">{providerLabel(focused.provider)}</Badge>
                <Badge tone={focused.free ? 'lime' : 'amber'}>{focused.free ? 'free · $0' : 'paid api'}</Badge>
                <Badge tone={focused.available ? 'lime' : 'red'}>{focused.available ? 'ready' : 'unavailable'}</Badge>
              </div>
              {!focused.available && <p className="text-sm text-neon-amber">{focused.unavailableReason}</p>}
              {focused.description && <p className="text-sm text-white/65">{focused.description}</p>}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="Context" value={!focused.contextLength ? '—' : focused.contextLength >= 1e6 ? `${+(focused.contextLength / 1e6).toFixed(1)}M` : `${Math.round(focused.contextLength / 1000)}K`} />
                <Stat label="Wins" value={stats?.wins ?? 0} tone="text-neon-amber" />
                <Stat label="Avg score" value={stats?.avgScore ?? '—'} tone="text-neon-cyan" />
                <Stat label="Best lap" value={fmtMs(stats?.bestLatencyMs)} tone="text-neon-lime" />
              </div>
              <div className="font-mono text-[11px] text-white/35">{focused.providerModel}</div>
              <button
                onClick={() => toggle(focused.id)}
                disabled={!lineup.includes(focused.id) && (lineup.length >= MAX_LINEUP || !focused.available)}
                className={`clip-angle w-full py-3 font-display text-sm font-black tracking-widest disabled:opacity-40 ${lineup.includes(focused.id) ? 'bg-white/10 text-white hover:bg-red-500/30' : 'btn-race'}`}
              >
                {lineup.includes(focused.id) ? 'REMOVE FROM GRID' : lineup.length >= MAX_LINEUP ? 'GRID FULL (5)' : focused.available ? 'ADD TO GRID' : 'UNAVAILABLE'}
              </button>
              <PaintShop model={focused} draft={draft} onDraft={setDraft} />
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {(['all', 'free', 'available'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`clip-tab px-4 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest ${filter === f ? 'bg-neon-violet/60' : 'bg-white/5 text-white/60'}`}
              >
                {f}
              </button>
            ))}
            <button onClick={() => void refreshCatalog()} disabled={refreshing} className="ml-auto text-xs text-neon-cyan hover:underline disabled:opacity-50">
              {refreshing ? 'Refreshing…' : 'Refresh catalog'}
            </button>
          </div>
          {refreshError && <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{refreshError}</div>}
          {models.loading && <div className="text-white/50">Loading verified models…</div>}
          <div className="grid gap-2 sm:grid-cols-2">
            {shown.map((m) => (
              <ModelCard key={m.id} m={m} selected={lineup.includes(m.id)} focused={m.id === focused?.id} onFocus={() => setFocus(m.id)} onToggle={() => toggle(m.id)} full={lineup.length >= MAX_LINEUP} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelCard({ m, selected, focused, onFocus, onToggle, full }: { m: ModelInfo; selected: boolean; focused: boolean; onFocus: () => void; onToggle: () => void; full: boolean }) {
  const lv = livery(m.id, m.name);
  return (
    <div
      onClick={onFocus}
      className={`glass relative cursor-pointer overflow-hidden p-3 transition hover:translate-x-0.5 ${focused ? 'ring-1 ring-neon-cyan' : ''} ${m.available ? '' : 'opacity-60'}`}
      style={{ borderLeft: `4px solid ${lv.primary}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">{lv.maker}</div>
          {lv.callsign !== lv.modelName.toUpperCase() ? (
            <>
              <div className="truncate font-display text-sm font-bold" style={{ color: lv.primary }}>{lv.callsign}</div>
              <div className="truncate text-[11px] text-white/55">{shortName(m.name)}</div>
            </>
          ) : (
            <div className="truncate font-display text-sm font-bold">{shortName(m.name)}</div>
          )}
        </div>
        <div className="font-display text-xl font-black italic" style={{ color: lv.accent }}>
          #{lv.number}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <Badge tone={m.free ? 'lime' : 'amber'}>{m.free ? 'free' : 'paid'}</Badge>
        <Badge tone="gray">{providerLabel(m.provider)}</Badge>
        {!m.available && <Badge tone="red">offline</Badge>}
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            onToggle();
          }}
          disabled={!selected && (full || !m.available)}
          className={`ml-auto rounded px-2 py-1 font-display text-[10px] font-bold tracking-widest disabled:opacity-30 ${selected ? 'bg-neon-pink text-white' : 'border border-white/20 text-white/70 hover:border-neon-pink'}`}
        >
          {selected ? 'ON GRID' : '+ GRID'}
        </button>
      </div>
      {!m.available && (
        <div className="mt-1 truncate text-[11px] text-neon-amber/80" title={m.unavailableReason}>
          {m.unavailableReason}
        </div>
      )}
    </div>
  );
}
