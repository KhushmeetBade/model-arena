import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { ModelInfo, Provider, ProviderError, StreamArgs, StreamResult } from '../types.js';

function mapError(err: unknown, model?: string): unknown {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new ProviderError(`Anthropic auth failed: ${err.message}`, 'auth', err.status);
  if (err instanceof Anthropic.RateLimitError) {
    const retry = Number(err.headers?.get?.('retry-after') ?? 60);
    return new ProviderError(`${model ?? 'Anthropic'} rate limited: ${err.message}`, 'rate_limit', 429, Date.now() + retry * 1000);
  }
  if (err instanceof Anthropic.NotFoundError) return new ProviderError(`${model} not found: ${err.message}`, 'unavailable', 404);
  if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message))
    return new ProviderError(`Anthropic credits exhausted: ${err.message}`, 'daily_quota', 400);
  if (err instanceof Anthropic.APIError) return new ProviderError(`Anthropic error: ${err.message}`, 'other', err.status);
  return err;
}

/** Official Anthropic API. Billed per token — only used when paid usage is explicitly enabled. */
export class AnthropicProvider implements Provider {
  id = 'anthropic' as const;
  label = 'Anthropic (official API)';
  billing = 'paid' as const;
  keyEnvVar = 'ANTHROPIC_API_KEY';
  private client?: Anthropic;

  isConfigured() {
    return !!config.anthropicKey();
  }

  private api() {
    this.client ??= new Anthropic({ apiKey: config.anthropicKey(), maxRetries: 0 });
    return this.client;
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.isConfigured()) return [];
    try {
      const out: ModelInfo[] = [];
      for await (const m of this.api().models.list({ limit: 50 })) {
        out.push({
          id: `anthropic:${m.id}`,
          provider: 'anthropic',
          providerModel: m.id,
          name: m.display_name,
          free: false,
          available: true,
        });
      }
      return out;
    } catch (err) {
      throw mapError(err);
    }
  }

  async stream(args: StreamArgs): Promise<StreamResult> {
    if (!this.isConfigured()) throw new ProviderError('ANTHROPIC_API_KEY is not set', 'not_configured');
    try {
      const stream = this.api().messages.stream(
        {
          model: args.model,
          max_tokens: args.maxTokens,
          ...(args.system ? { system: args.system } : {}),
          messages: [{ role: 'user', content: args.prompt }],
        },
        { signal: args.signal },
      );
      stream.on('text', (delta) => args.onDelta(delta));
      const msg = await stream.finalMessage();
      const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      if (msg.stop_reason === 'refusal') throw new ProviderError(`${args.model} declined the prompt`, 'other');
      return { text, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, finishReason: msg.stop_reason ?? undefined };
    } catch (err) {
      throw mapError(err, args.model);
    }
  }
}
