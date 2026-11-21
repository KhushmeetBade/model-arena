import { useEffect, useState } from 'react';
import { ProviderNotice } from '../components/ProviderNotice';
import { Badge, ErrorNote, PageHeader, Panel, Stat } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import type { ProviderStatus } from '../lib/types';

function countdown(to: number, now: number) {
  const s = Math.max(0, Math.round((to - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

const VALIDATION: Record<string, { label: string; tone: 'lime' | 'amber' | 'red' | 'gray' }> = {
  ok: { label: 'key verified', tone: 'lime' },
  missing_key: { label: 'no key', tone: 'gray' },
  invalid_key: { label: 'key rejected', tone: 'red' },
  error: { label: 'check failed', tone: 'amber' },
  unknown: { label: 'not checked', tone: 'gray' },
};

const SETUP: Record<string, string> = {
  openrouter:
    'Free account at openrouter.ai → Settings → Keys. Free (:free) models cost $0. Limits: 20 requests/min; 50 requests/day (1000/day once $10 of credits has ever been purchased). Resets 00:00 UTC.',
  anthropic:
    'Official Claude API (console.anthropic.com). Billed per token against your API credits — the Claude.ai app plan does not include API access. Locked off unless ALLOW_PAID_PROVIDERS=true is set in the root .env (then also enable it in Settings).',
  openai:
    'Official OpenAI API (platform.openai.com). Billed per token — a ChatGPT subscription does not include API access. Locked off unless ALLOW_PAID_PROVIDERS=true is set in the root .env (then also enable it in Settings).',
};

export function PitCrewPage() {
  const status = useAsync(() => api.providers(), [], 10_000);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function revalidate() {
    setBusy(true);
    try {
      await api.revalidate();
      await status.reload();
    } finally {
      setBusy(false);
    }
  }

  const cooldowns = Object.entries(status.data?.modelCooldowns ?? {});

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <PageHeader kicker="Pit crew" title="Providers & quotas">
        <button onClick={revalidate} disabled={busy} className="btn-race clip-angle px-5 py-2.5 text-xs font-black">
          {busy ? 'CHECKING…' : 'REVALIDATE NOW'}
        </button>
      </PageHeader>
      {status.error && <ErrorNote>Couldn't reach the race server: {status.error}. Is `npm run dev` running?</ErrorNote>}
      {status.data && <ProviderNotice data={status.data} showPitCrewLink={false} className="mb-5" />}
      {status.data && (
        <p className="mb-5 text-sm text-white/55">
          Daily counters reset in <b className="text-white">{countdown(status.data.nextDailyReset, now)}</b> (00:00 UTC). Providers are re-checked automatically whenever a known rate-limit or
          daily-quota window expires. Counts below are requests made by this app.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {status.data?.providers.map((p) => <ProviderCard key={p.id} p={p} now={now} />)}
      </div>

      <Panel className="mt-6">
        <div className="mb-2 font-display text-sm font-bold tracking-widest">MODEL COOLDOWNS</div>
        {cooldowns.length === 0 ? (
          <p className="text-sm text-white/50">No models are cooling down.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {cooldowns.map(([id, c]) => (
              <li key={id} className="flex justify-between gap-2">
                <span className="truncate font-mono text-xs">{id}</span>
                <span className="text-neon-amber">
                  {c.reason} · {countdown(c.until, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ProviderCard({ p, now }: { p: ProviderStatus; now: number }) {
  const q = p.quota;
  const v = VALIDATION[q?.validation ?? 'unknown'];
  const pct = q?.dailyLimit ? Math.min(100, (q.requestsToday / q.dailyLimit) * 100) : 0;
  return (
    <Panel>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-base font-bold">{p.label}</div>
          <div className="font-mono text-[11px] text-white/40">{p.keyEnvVar}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={p.billing === 'free' ? 'lime' : 'amber'}>{p.billing}</Badge>
          <Badge tone={v.tone}>{v.label}</Badge>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Status" value={p.enabled ? 'ONLINE' : p.locked ? 'LOCKED' : p.configured ? 'OFF' : 'NO KEY'} tone={p.enabled ? 'text-neon-lime' : 'text-white/50'} />
        <Stat label="Models" value={`${p.availableCount}/${p.modelCount}`} />
        <Stat label="Today" value={q?.requestsToday ?? 0} tone="text-neon-cyan" />
      </div>
      {q?.dailyLimit != null && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-white/50">
            <span>Daily free-model requests</span>
            <span>
              {q.requestsToday}/{q.dailyLimit}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-white/10">
            <div className={`h-full ${pct > 85 ? 'bg-red-400' : 'bg-gradient-to-r from-neon-lime to-neon-cyan'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      {q?.rpm != null && (
        <div className="mt-2 text-xs text-white/50">
          Last minute: {q.requestsLastMinute}/{q.rpm} requests
        </div>
      )}
      {q?.keyNote && <div className="mt-2 text-xs text-white/60">{q.keyNote}</div>}
      {q?.blockedUntil && (
        <div className="mt-3 rounded border border-neon-amber/40 bg-neon-amber/10 p-2 text-xs text-neon-amber">
          Paused ({q.blockedReason}) — auto-revalidates in {countdown(q.blockedUntil, now)}
        </div>
      )}
      {q?.lastError && (
        <div className="mt-3 text-xs text-red-300/80" title={q.lastError}>
          Last error{q.lastErrorAt ? ` (${new Date(q.lastErrorAt).toLocaleTimeString()})` : ''}: {q.lastError.slice(0, 160)}
        </div>
      )}
      {p.listError && <div className="mt-2 text-xs text-red-300/80">Catalog error: {p.listError}</div>}
      {p.locked && (
        <div className="mt-3 rounded border border-white/10 bg-white/5 p-2 text-xs text-white/60">
          🔒 Locked by ALLOW_PAID_PROVIDERS=false in the root .env — never contacted, and Settings cannot enable it.
        </div>
      )}
      {!p.configured && p.billing === 'free' && (
        <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
          Add <code>{p.keyEnvVar}=…</code> to the root .env, then restart the server (Ctrl+C, then <code>npm run dev</code>). Revalidate alone can’t pick up .env changes.
        </div>
      )}
      <p className="mt-4 border-t border-white/5 pt-3 text-xs leading-relaxed text-white/50">{SETUP[p.id]}</p>
    </Panel>
  );
}
