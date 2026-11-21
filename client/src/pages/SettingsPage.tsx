import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader, Panel } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { providerLabel } from '../lib/livery';
import type { Settings } from '../lib/types';

export function SettingsPage() {
  const remote = useAsync(() => api.settings(), []);
  const models = useAsync(() => api.models(), []);
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (remote.data) setS(remote.data);
  }, [remote.data]);
  if (!s) return <div className="pt-20 text-center text-white/50">Loading settings…</div>;

  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const wsum = s.weights.quality + s.weights.speed + s.weights.completion || 1;

  async function save() {
    setErr(null);
    try {
      const next = await api.saveSettings(s!);
      setS(next);
      setSaved('Saved');
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function togglePaid(on: boolean) {
    if (on && !confirm('Enabling paid providers lets races use your Anthropic/OpenAI API keys, which bills your account per token. Continue?')) return;
    set({ allowPaid: on });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PageHeader kicker="Race direction" title="Settings">
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-neon-lime">{saved}</span>}
          <button onClick={save} className="btn-race clip-angle px-6 py-2.5 text-xs font-black">
            SAVE
          </button>
        </div>
      </PageHeader>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="space-y-4">
        <Panel>
          <div className="font-display text-sm font-bold tracking-widest">SCORING WEIGHTS</div>
          <p className="mt-1 text-sm text-white/55">How the champion is decided. Weights are normalized; if the judge is unavailable, quality is excluded.</p>
          {(['quality', 'speed', 'completion'] as const).map((k) => (
            <label key={k} className="mt-3 block">
              <div className="flex justify-between text-sm">
                <span className="capitalize">{k}</span>
                <span className="font-mono text-white/60">
                  {s.weights[k]} ({Math.round((s.weights[k] / wsum) * 100)}%)
                </span>
              </div>
              <input type="range" min={0} max={100} value={s.weights[k]} onChange={(e) => set({ weights: { ...s.weights, [k]: Number(e.target.value) } })} className="w-full" />
            </label>
          ))}
        </Panel>

        <Panel>
          <div className="font-display text-sm font-bold tracking-widest">RACE STEWARD (JUDGE)</div>
          <p className="mt-1 text-sm text-white/55">Auto picks a free model that is not competing, so no car judges itself.</p>
          <select value={s.judgeModel} onChange={(e) => set({ judgeModel: e.target.value })} className="mt-2 w-full rounded border border-white/15 bg-black/40 p-2">
            <option value="auto">Auto (neutral free model)</option>
            {(models.data?.models ?? []).map((m) => (
              <option key={m.id} value={m.id} disabled={!m.available}>
                {m.name} · {providerLabel(m.provider)}
                {m.free ? ' · free' : ' · paid'}
                {m.available ? '' : ' (unavailable)'}
              </option>
            ))}
          </select>
        </Panel>

        <Panel>
          <div className="font-display text-sm font-bold tracking-widest">RACE RULES</div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              Max output tokens per car
              <input type="number" min={64} max={4000} value={s.maxTokens} onChange={(e) => set({ maxTokens: Number(e.target.value) })} className="mt-1 w-full rounded border border-white/15 bg-black/40 p-2 font-mono" />
            </label>
            <label className="block text-sm">
              DNF timeout (seconds)
              <input
                type="number"
                min={10}
                max={300}
                value={Math.round(s.timeoutMs / 1000)}
                onChange={(e) => set({ timeoutMs: Number(e.target.value) * 1000 })}
                className="mt-1 w-full rounded border border-white/15 bg-black/40 p-2 font-mono"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm">
            System prompt (sent to every competitor)
            <textarea value={s.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} rows={3} className="mt-1 w-full rounded border border-white/15 bg-black/40 p-2 font-mono text-sm" />
          </label>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-display text-sm font-bold tracking-widest text-neon-amber">PAID PROVIDERS</div>
              <p className="mt-1 text-sm text-white/55">
                Off by default. When on, Claude (Anthropic API) and OpenAI models with configured keys can race. They bill your API account per token; free Claude.ai and ChatGPT
                app plans do not grant API access.
              </p>
              {s.paidLocked && (
                <p className="mt-2 text-sm font-bold text-white/70">
                  🔒 Locked off by <code>ALLOW_PAID_PROVIDERS=false</code> in the root .env. The server rejects this switch while locked — only free OpenRouter models can race.
                </p>
              )}
            </div>
            <label className={`relative inline-flex items-center ${s.paidLocked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`} title={s.paidLocked ? 'Locked by ALLOW_PAID_PROVIDERS=false' : undefined}>
              <input
                type="checkbox"
                className="peer sr-only"
                checked={s.allowPaid && !s.paidLocked}
                disabled={!!s.paidLocked}
                aria-label="Allow paid providers"
                onChange={(e) => togglePaid(e.target.checked)}
              />
              <div className="h-7 w-12 rounded-full bg-white/15 transition peer-checked:bg-neon-amber" />
              <div className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
            </label>
          </div>
        </Panel>
      </div>
    </div>
  );
}
