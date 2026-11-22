export type ProviderId = 'openrouter' | 'anthropic' | 'openai';

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  providerModel: string;
  name: string;
  description?: string;
  contextLength?: number;
  free: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface JudgeScore { accuracy: number; helpfulness: number; clarity: number; completeness: number; comment: string }
export interface Scores { quality: number | null; speed: number; completion: number; total: number }

export interface CompetitorResult {
  modelId: string;
  name: string;
  /** 'demo' = fictional racer in a simulated demo race */
  provider: ProviderId | 'demo';
  lane: number;
  status: 'queued' | 'waiting' | 'streaming' | 'finished' | 'dnf';
  text: string;
  ttftMs?: number;
  latencyMs?: number;
  outputTokens?: number;
  tokensEstimated?: boolean;
  tokensPerSec?: number;
  error?: string;
  judge?: JudgeScore;
  scores?: Scores;
  rank?: number;
}

export interface RaceEvent { t: number; type: string; data: any }

export interface Evaluation { method: 'llm-judge' | 'unavailable'; judgeModel?: string; judgeName?: string; note?: string; summary?: string }

export interface RaceRecord {
  id: string;
  prompt: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: 'ready' | 'running' | 'judging' | 'complete' | 'failed';
  competitors: CompetitorResult[];
  evaluation?: Evaluation;
  championId?: string;
  weights: { quality: number; speed: number; completion: number };
  events: RaceEvent[];
  /** Only on built-in DEMO races (simulated results, no AI called). */
  demo?: DemoInfo;
}

export interface DemoInfo { title: string; blurb: string; durationLabel: string }

export type RaceSummary = Omit<RaceRecord, 'events' | 'competitors' | 'weights'> & {
  competitors: Pick<CompetitorResult, 'modelId' | 'name' | 'provider' | 'lane' | 'rank' | 'status' | 'latencyMs' | 'scores'>[];
};

export type DemoSummary = RaceSummary & { demo: DemoInfo; durationMs: number };

export interface Settings {
  judgeModel: string;
  weights: { quality: number; speed: number; completion: number };
  maxTokens: number;
  timeoutMs: number;
  allowPaid: boolean;
  systemPrompt: string;
  /** Read-only from the server: true when ALLOW_PAID_PROVIDERS is not "true". */
  paidLocked?: boolean;
}

/** Per-model car customization; unset fields fall back to the model's default livery. */
export interface CarCustom {
  color?: string;
  number?: number;
  chassis?: 0 | 1 | 2;
  nickname?: string;
  updatedAt?: number;
}
export type LiveryMap = Record<string, CarCustom>;

export interface ProvidersResponse {
  env?: { paidLocked: boolean; envChangedSinceStart: boolean; restartHint: string };
  providers: ProviderStatus[];
  modelCooldowns: Record<string, { until: number; reason: string }>;
  nextDailyReset: number;
}

export interface RacePlan {
  needs: Partial<Record<ProviderId, number>>;
  competitorRequests: number;
  judgeRequests: number;
  judges: { id: string; name: string }[];
  preflight: {
    ok: boolean;
    reason: string | null;
    providers: Partial<Record<ProviderId, { needed: number; remainingToday: number | null; dailyLimit: number | null; remainingMinute: number | null; rpm: number | null }>>;
  };
}

export interface ProviderQuota {
  requestsToday: number;
  successesToday: number;
  failuresToday: number;
  requestsLastMinute: number;
  dailyLimit: number | null;
  rpm: number | null;
  blockedUntil: number | null;
  blockedReason: string | null;
  lastError: string | null;
  lastErrorAt: number | null;
  lastValidatedAt: number | null;
  validation: 'unknown' | 'ok' | 'missing_key' | 'invalid_key' | 'error';
  keyNote?: string;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  billing: 'free' | 'paid';
  configured: boolean;
  keyEnvVar: string;
  /** Paid provider hard-locked off by ALLOW_PAID_PROVIDERS. */
  locked?: boolean;
  enabled: boolean;
  modelCount: number;
  availableCount: number;
  quota: ProviderQuota | null;
  listError: string | null;
}

export interface LeaderboardRow {
  modelId: string;
  name: string;
  provider: string;
  races: number;
  wins: number;
  podiums: number;
  dnfs: number;
  avgScore: number;
  avgQuality: number | null;
  avgLatencyMs: number | null;
  bestLatencyMs: number | null;
  winRate: number;
}
