import type { ModelInfo, ProvidersResponse, RacePlan } from './types';

export type SlotState = 'ready' | 'unavailable' | 'unlisted';

export interface LineupSlot {
  id: string;
  model?: ModelInfo;
  state: SlotState;
  reason?: string;
}

/**
 * Resolves the saved lineup against the live catalog WITHOUT dropping anything:
 * cars that are cooling down, rate-limited or missing a key stay on the grid, flagged.
 */
export function resolveLineup(lineup: string[], models: ModelInfo[]): { slots: LineupSlot[]; ready: string[]; blocked: LineupSlot[] } {
  const slots = lineup.map((id): LineupSlot => {
    const model = models.find((m) => m.id === id);
    if (!model) return { id, state: 'unlisted', reason: 'No longer in the model catalog — remove it or refresh the catalog' };
    if (!model.available) return { id, model, state: 'unavailable', reason: model.unavailableReason ?? 'Unavailable' };
    return { id, model, state: 'ready' };
  });
  return { slots, ready: slots.filter((s) => s.state === 'ready').map((s) => s.id), blocked: slots.filter((s) => s.state !== 'ready') };
}

/** Auto-fill only an EMPTY lineup with the first available free models. Never edits a user's picks. */
export function autoFillLineup(lineup: string[], models: ModelInfo[], count = 4): string[] | null {
  if (lineup.length > 0) return null;
  const picks = models.filter((m) => m.available && m.free).slice(0, count).map((m) => m.id);
  return picks.length ? picks : null;
}

export interface Guidance {
  tone: 'red' | 'amber';
  title: string;
  body: string;
  /** Steps the user can follow; shown as a list. */
  steps?: string[];
}

const RESTART_STEPS = ['Stop the running dev server (Ctrl+C in its terminal)', 'cd ~/projects/model-arena && npm run dev'];

/** The single most important setup problem blocking free racing, or null when racing is possible. */
export function setupGuidance(p: ProvidersResponse | null | undefined): Guidance | null {
  if (!p) return null;
  const or = p.providers.find((x) => x.id === 'openrouter');
  const q = or?.quota;
  if (p.env?.envChangedSinceStart) {
    return {
      tone: 'amber',
      title: '.env changed since the server started',
      body: 'The server only reads the root .env at startup, so your latest edits (for example a new OPENROUTER_API_KEY) are not active yet. Restart the server.',
      steps: RESTART_STEPS,
    };
  }
  if (or && !or.configured) {
    return {
      tone: 'red',
      title: 'OPENROUTER_API_KEY is not loaded',
      body: 'Free racing needs an OpenRouter key. Put OPENROUTER_API_KEY=… in the root .env (~/projects/model-arena/.env), then restart the server — it reads .env only at startup. Free keys: openrouter.ai/settings/keys.',
      steps: RESTART_STEPS,
    };
  }
  if (q?.validation === 'invalid_key') {
    return {
      tone: 'red',
      title: 'OpenRouter rejected the API key',
      body: 'Check OPENROUTER_API_KEY in the root .env (no quotes or spaces), restart the server, then press Revalidate on Pit Crew.',
      steps: RESTART_STEPS,
    };
  }
  if (q?.blockedUntil && q.blockedReason === 'daily_quota') {
    return {
      tone: 'amber',
      title: 'Free daily quota used up',
      body: `OpenRouter's free-model limit is reached. Racing resumes automatically after the reset (00:00 UTC — ${new Date(q.blockedUntil).toLocaleString()}). No paid fallback is ever used.`,
    };
  }
  if (q?.validation === 'error') {
    return {
      tone: 'amber',
      title: 'Could not verify the OpenRouter key',
      body: `The key check failed${q.lastError ? `: ${q.lastError.slice(0, 160)}` : ''}. Check your connection, then press Revalidate on Pit Crew.`,
    };
  }
  return null;
}

/** "Uses up to N requests (cars + judge) · M/L left today" for a race plan. */
export function budgetLabel(plan: RacePlan): string {
  const total = Object.values(plan.needs).reduce<number>((s, n) => s + (n ?? 0), 0);
  const or = plan.preflight.providers.openrouter;
  const left = or?.remainingToday != null ? ` · ${or.remainingToday}/${or.dailyLimit} free requests left today` : '';
  const cars = `${plan.competitorRequests} car${plan.competitorRequests === 1 ? '' : 's'}`;
  return `Uses up to ${total} free request${total === 1 ? '' : 's'} (${cars} + ${plan.judgeRequests} judge)${left}`;
}
