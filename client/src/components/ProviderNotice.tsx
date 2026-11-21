import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { setupGuidance } from '../lib/lineup';
import type { ProvidersResponse } from '../lib/types';

/**
 * Explains the one setup problem blocking free racing (missing/rejected key, stale .env,
 * exhausted free quota) with concrete fix steps. Renders nothing when racing is possible.
 * Pass `data` to reuse an existing /api/providers response; otherwise it polls on its own.
 */
export function ProviderNotice({ data, showPitCrewLink = true, className = '' }: { data?: ProvidersResponse | null; showPitCrewLink?: boolean; className?: string }) {
  const self = data === undefined;
  const own = useAsync(() => (self ? api.providers() : Promise.resolve(null)), [self], self ? 15_000 : undefined);
  const g = setupGuidance(self ? own.data : data);
  if (!g) return null;
  const tone = g.tone === 'red' ? 'border-red-500/50 bg-red-500/10 text-red-100' : 'border-neon-amber/50 bg-neon-amber/10 text-neon-amber';
  return (
    <div role="alert" className={`rounded border p-3 text-sm ${tone} ${className}`}>
      <div className="font-display text-xs font-black tracking-widest">{g.title.toUpperCase()}</div>
      <p className="mt-1 text-white/80">{g.body}</p>
      {g.steps && (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 font-mono text-[11px] text-white/70">
          {g.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {showPitCrewLink && (
        <Link to="/pit-crew" className="mt-2 inline-block text-xs font-bold text-neon-cyan underline">
          Open Pit Crew →
        </Link>
      )}
    </div>
  );
}
