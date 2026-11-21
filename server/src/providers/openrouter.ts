import { config } from '../config.js';
import { parseSse } from '../lib/sse.js';
import { ModelInfo, Provider, ProviderError, StreamArgs, StreamResult } from '../types.js';

const BASE = 'https://openrouter.ai/api/v1';

interface OrModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: Record<string, string | number | undefined>;
  architecture?: { output_modalities?: string[] };
  supported_parameters?: string[];
}

/**
 * True only when OpenRouter reports prompt and completion prices AND every other pricing
 * field (request, image, web_search, internal_reasoning, …) as exactly 0.
 * Missing or unparseable values count as paid.
 */
export function isZeroPrice(p?: OrModel['pricing']): boolean {
  if (!p || p.prompt === undefined || p.completion === undefined) return false;
  return Object.values(p).every((v) => v !== undefined && v !== '' && Number(v) === 0);
}

/** Keeps only OpenRouter's genuinely free `:free` text models. */
export function filterFreeModels<T extends OrModel>(data: T[]): T[] {
  return data
    .filter((m) => m.id.endsWith(':free') && isZeroPrice(m.pricing)) // OpenRouter's $0 variants; excludes routers/previews
    .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes('text'));
}

export interface OpenRouterKeyInfo {
  label?: string;
  limit: number | null;
  usage: number;
  limit_remaining?: number | null;
  is_free_tier: boolean;
}

/** OpenRouter's documented reset for free-model daily limits is 00:00 UTC. */
export function nextUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

async function toProviderError(res: Response, model?: string): Promise<ProviderError> {
  let message = `${res.status} ${res.statusText}`;
  let raw = '';
  try {
    raw = await res.text();
    const j = JSON.parse(raw);
    message = j?.error?.metadata?.raw || j?.error?.message || message;
    // Drop OpenRouter's upsell ("add your own provider key / credits") — this app never uses paid options.
    message = String(message)
      .replace(/[,;]?\s*(or )?add your own provider key[\s\S]*$/i, '.')
      .replace(/\s*Add \d+ credits to unlock[\s\S]*$/i, '')
      .trim();
  } catch {
    if (raw) message = raw.slice(0, 300);
  }
  const resetHeader = res.headers.get('x-ratelimit-reset');
  const resetAt = resetHeader ? Number(resetHeader) : undefined;
  if (res.status === 401 || res.status === 403) return new ProviderError(`OpenRouter auth failed: ${message}`, 'auth', res.status);
  if (res.status === 402) return new ProviderError(`OpenRouter: ${message}`, 'daily_quota', res.status, nextUtcMidnight());
  if (res.status === 429) {
    const daily = /per-day|per day|daily/i.test(message);
    return new ProviderError(
      `${model ?? 'OpenRouter'} rate limited: ${message}`,
      daily ? 'daily_quota' : 'rate_limit',
      429,
      daily ? (resetAt && resetAt > Date.now() + 120_000 ? resetAt : nextUtcMidnight()) : resetAt || Date.now() + 60_000,
    );
  }
  if (res.status === 404 || res.status === 503 || res.status === 502) return new ProviderError(`${model ?? 'Model'} unavailable: ${message}`, 'unavailable', res.status);
  return new ProviderError(`OpenRouter error: ${message}`, 'other', res.status);
}

export class OpenRouterProvider implements Provider {
  id = 'openrouter' as const;
  label = 'OpenRouter (free models)';
  billing = 'free' as const;
  keyEnvVar = 'OPENROUTER_API_KEY';

  constructor(private fetchImpl: typeof fetch = fetch) {}

  isConfigured() {
    return !!config.openrouterKey();
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${config.openrouterKey()}`,
      'Content-Type': 'application/json',
      'X-Title': 'Model Arena',
    };
  }

  /** Public endpoint — lists models; we keep only those priced at exactly $0. */
  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetchImpl(`${BASE}/models`);
    if (!res.ok) throw await toProviderError(res);
    const json = (await res.json()) as { data: OrModel[] };
    return filterFreeModels(json.data).map((m) => ({
        id: `openrouter:${m.id}`,
        provider: 'openrouter' as const,
        providerModel: m.id,
        name: m.name.replace(/\s*\(free\)\s*$/i, ''),
        description: m.description?.slice(0, 280),
        contextLength: m.context_length,
        free: true,
        reasoning: !!m.supported_parameters?.includes('reasoning'),
        available: true,
      }));
  }

  async keyInfo(): Promise<OpenRouterKeyInfo> {
    const res = await this.fetchImpl(`${BASE}/key`, { headers: this.headers() });
    if (!res.ok) throw await toProviderError(res);
    const json = (await res.json()) as { data: OpenRouterKeyInfo };
    return json.data;
  }

  async stream(args: StreamArgs): Promise<StreamResult> {
    if (!this.isConfigured()) throw new ProviderError('OPENROUTER_API_KEY is not set', 'not_configured');
    const messages = [
      ...(args.system ? [{ role: 'system', content: args.system }] : []),
      { role: 'user', content: args.prompt },
    ];
    const res = await this.fetchImpl(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      signal: args.signal,
      body: JSON.stringify({
        model: args.model,
        messages,
        max_tokens: args.maxTokens,
        ...(args.reasoningEffort ? { reasoning: { effort: args.reasoningEffort } } : {}),
        stream: true,
        usage: { include: true },
      }),
    });
    if (!res.ok || !res.body) throw await toProviderError(res, args.model);

    let text = '';
    let outputTokens: number | undefined;
    let inputTokens: number | undefined;
    let finishReason: string | undefined;
    for await (const ev of parseSse(res.body)) {
      const chunk = ev.data as any;
      if (chunk?.error) {
        const code = Number(chunk.error.code);
        const msg = chunk.error.message ?? 'stream error';
        if (code === 429) throw new ProviderError(`${args.model} rate limited: ${msg}`, 'rate_limit', 429, Date.now() + 60_000);
        throw new ProviderError(`${args.model}: ${msg}`, 'other', code || undefined);
      }
      const choice = chunk?.choices?.[0];
      const delta = choice?.delta;
      if (delta?.reasoning) args.onReasoning?.(delta.reasoning);
      if (delta?.content) {
        text += delta.content;
        args.onDelta(delta.content);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk?.usage) {
        outputTokens = chunk.usage.completion_tokens;
        inputTokens = chunk.usage.prompt_tokens;
      }
    }
    if (finishReason === 'error') throw new ProviderError(`${args.model} ended with an upstream error`, 'unavailable');
    return { text, inputTokens, outputTokens, finishReason };
  }
}
