import OpenAI from 'openai';
import { config } from '../config.js';
import { ModelInfo, Provider, ProviderError, StreamArgs, StreamResult } from '../types.js';

function mapError(err: unknown, model?: string): unknown {
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError)
    return new ProviderError(`OpenAI auth failed: ${err.message}`, 'auth', err.status);
  if (err instanceof OpenAI.RateLimitError) {
    const quota = /quota/i.test(err.message);
    return new ProviderError(`${model ?? 'OpenAI'}: ${err.message}`, quota ? 'daily_quota' : 'rate_limit', 429, Date.now() + 60_000);
  }
  if (err instanceof OpenAI.NotFoundError) return new ProviderError(`${model} not found: ${err.message}`, 'unavailable', 404);
  if (err instanceof OpenAI.APIError) return new ProviderError(`OpenAI error: ${err.message}`, 'other', err.status);
  return err;
}

const CHAT_MODEL = /^(gpt-|o\d|chatgpt-)/;
const EXCLUDE = /(audio|realtime|transcribe|tts|image|search|embedding|moderation|instruct|codex)/;

/** Official OpenAI API. Billed per token — only used when paid usage is explicitly enabled. */
export class OpenAIProvider implements Provider {
  id = 'openai' as const;
  label = 'OpenAI (official API)';
  billing = 'paid' as const;
  keyEnvVar = 'OPENAI_API_KEY';
  private client?: OpenAI;

  isConfigured() {
    return !!config.openaiKey();
  }

  private api() {
    this.client ??= new OpenAI({ apiKey: config.openaiKey(), maxRetries: 0 });
    return this.client;
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.isConfigured()) return [];
    try {
      const out: ModelInfo[] = [];
      for await (const m of this.api().models.list()) {
        if (!CHAT_MODEL.test(m.id) || EXCLUDE.test(m.id) || /\d{4}-\d{2}-\d{2}/.test(m.id)) continue;
        out.push({ id: `openai:${m.id}`, provider: 'openai', providerModel: m.id, name: m.id.toUpperCase(), free: false, available: true });
      }
      return out.sort((a, b) => a.providerModel.localeCompare(b.providerModel));
    } catch (err) {
      throw mapError(err);
    }
  }

  async stream(args: StreamArgs): Promise<StreamResult> {
    if (!this.isConfigured()) throw new ProviderError('OPENAI_API_KEY is not set', 'not_configured');
    try {
      const stream = await this.api().chat.completions.create(
        {
          model: args.model,
          max_completion_tokens: args.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            ...(args.system ? [{ role: 'system' as const, content: args.system }] : []),
            { role: 'user' as const, content: args.prompt },
          ],
        },
        { signal: args.signal },
      );
      let text = '';
      let outputTokens: number | undefined;
      let inputTokens: number | undefined;
      let finishReason: string | undefined;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          text += delta;
          args.onDelta(delta);
        }
        if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
        if (chunk.usage) {
          outputTokens = chunk.usage.completion_tokens;
          inputTokens = chunk.usage.prompt_tokens;
        }
      }
      return { text, inputTokens, outputTokens, finishReason };
    } catch (err) {
      throw mapError(err, args.model);
    }
  }
}
