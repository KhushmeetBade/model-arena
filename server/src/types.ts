export type ProviderId = 'openrouter' | 'anthropic' | 'openai';

export interface ModelInfo {
  /** Globally unique id: `${provider}:${providerModel}` */
  id: string;
  provider: ProviderId;
  providerModel: string;
  name: string;
  description?: string;
  contextLength?: number;
  /** True when the provider bills $0 for this model. */
  free: boolean;
  /** Model accepts OpenRouter's `reasoning` parameter (it may "think" before answering). */
  reasoning?: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface StreamArgs {
  model: string;
  prompt: string;
  system?: string;
  maxTokens: number;
  /** Ask reasoning models to think briefly so the token budget is left for the actual answer. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  signal: AbortSignal;
  onDelta: (text: string) => void;
  /** Reasoning/thinking tokens streamed by some models (not part of the answer). */
  onReasoning?: (text: string) => void;
}

export interface StreamResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
}

export type ProviderErrorKind = 'rate_limit' | 'daily_quota' | 'auth' | 'not_configured' | 'unavailable' | 'timeout' | 'other';

export class ProviderError extends Error {
  constructor(
    message: string,
    public kind: ProviderErrorKind,
    public status?: number,
    /** Absolute epoch ms at which the limit is expected to reset (if known). */
    public resetAt?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface Provider {
  id: ProviderId;
  label: string;
  /** Paid providers are never used unless the user explicitly enables paid usage. */
  billing: 'free' | 'paid';
  isConfigured(): boolean;
  keyEnvVar: string;
  listModels(): Promise<ModelInfo[]>;
  stream(args: StreamArgs): Promise<StreamResult>;
}

export interface Settings {
  judgeModel: string; // 'auto' or model id
  weights: { quality: number; speed: number; completion: number };
  maxTokens: number;
  timeoutMs: number;
  allowPaid: boolean;
  systemPrompt: string;
}

export type CompetitorStatus = 'queued' | 'waiting' | 'streaming' | 'finished' | 'dnf';

export interface JudgeScore {
  accuracy: number;
  helpfulness: number;
  clarity: number;
  completeness: number;
  comment: string;
}

export interface CompetitorResult {
  modelId: string;
  name: string;
  provider: ProviderId;
  lane: number;
  status: CompetitorStatus;
  text: string;
  reasoningChars: number;
  ttftMs?: number;
  latencyMs?: number;
  outputTokens?: number;
  tokensEstimated: boolean;
  tokensPerSec?: number;
  error?: string;
  judge?: JudgeScore;
  scores?: { quality: number | null; speed: number; completion: number; total: number };
  rank?: number;
}

export type RaceStatus = 'ready' | 'running' | 'judging' | 'complete' | 'failed';

export interface RaceEvent {
  /** ms since race start */
  t: number;
  type: string;
  data: Record<string, unknown>;
}

export interface Evaluation {
  method: 'llm-judge' | 'unavailable';
  judgeModel?: string;
  judgeName?: string;
  note?: string;
  summary?: string;
}

export interface RaceRecord {
  id: string;
  prompt: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: RaceStatus;
  competitors: CompetitorResult[];
  evaluation?: Evaluation;
  championId?: string;
  weights: Settings['weights'];
  events: RaceEvent[];
}
