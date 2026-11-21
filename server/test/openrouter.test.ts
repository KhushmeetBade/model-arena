import { describe, expect, it } from 'vitest';
import { OpenRouterProvider } from '../src/providers/openrouter.js';
import { ProviderError } from '../src/types.js';

/**
 * Test-only: a fake `fetch` that replays OpenRouter's documented wire formats (model list JSON,
 * SSE chat-completion chunks, and error bodies). Nothing here touches the network.
 */
type Call = { url: string; init?: RequestInit };

function sse(chunks: unknown[], tail = 'data: [DONE]\n\n') {
  const text = chunks.map((c) => (typeof c === 'string' ? c : `data: ${JSON.stringify(c)}\n\n`)).join('') + tail;
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      // split mid-event to exercise the parser's buffering
      ctrl.enqueue(bytes.slice(0, 37));
      ctrl.enqueue(bytes.slice(37));
      ctrl.close();
    },
  });
}

function fakeFetch(responder: (call: Call) => Response) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return responder(call);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const errorBody = (code: number, message: string) => JSON.stringify({ error: { code, message, metadata: {} } });

process.env.OPENROUTER_API_KEY ||= 'test-key-not-real';

describe('OpenRouter provider (recorded wire formats)', () => {
  it('lists only $0 :free text models and records reasoning support', async () => {
    const { fn, calls } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'acme/think:free', name: 'Acme: Think (free)', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens', 'reasoning'] },
              { id: 'acme/plain:free', name: 'Acme: Plain (free)', pricing: { prompt: '0', completion: '0', request: '0' }, supported_parameters: ['max_tokens'] },
              { id: 'acme/paid', name: 'Acme: Paid', pricing: { prompt: '0.000002', completion: '0.000004' } },
              { id: 'acme/sneaky:free', name: 'Acme: Sneaky', pricing: { prompt: '0', completion: '0', image: '0.01' } },
            ],
          }),
        ),
    );
    const models = await new OpenRouterProvider(fn).listModels();
    expect(models.map((m) => [m.providerModel, m.name, m.reasoning, m.free])).toEqual([
      ['acme/think:free', 'Acme: Think', true, true],
      ['acme/plain:free', 'Acme: Plain', false, true],
    ]);
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/models');
  });

  it('streams answer + reasoning deltas and usage, sending low reasoning effort when asked', async () => {
    const { fn, calls } = fakeFetch(
      () =>
        new Response(
          sse([
            ': OPENROUTER PROCESSING\n\n',
            { choices: [{ delta: { reasoning: 'Light scatters…' } }] },
            { choices: [{ delta: { content: 'The sky ' } }] },
            { choices: [{ delta: { content: 'is blue.' }, finish_reason: 'stop' }] },
            { choices: [], usage: { prompt_tokens: 20, completion_tokens: 9 } },
          ]),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const deltas: string[] = [];
    const reasoning: string[] = [];
    const res = await new OpenRouterProvider(fn).stream({
      model: 'acme/think:free',
      prompt: 'Why is the sky blue?',
      system: 'Be brief.',
      maxTokens: 1000,
      reasoningEffort: 'low',
      signal: new AbortController().signal,
      onDelta: (t) => deltas.push(t),
      onReasoning: (t) => reasoning.push(t),
    });
    expect(res).toMatchObject({ text: 'The sky is blue.', outputTokens: 9, inputTokens: 20, finishReason: 'stop' });
    expect(deltas).toEqual(['The sky ', 'is blue.']);
    expect(reasoning).toEqual(['Light scatters…']);

    const body = JSON.parse(String(calls[0].init?.body));
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(body).toMatchObject({ model: 'acme/think:free', max_tokens: 1000, stream: true, reasoning: { effort: 'low' } });
    expect(body.messages).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Why is the sky blue?' },
    ]);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer \S+$/);
  });

  it('omits the reasoning parameter for models that do not support it', async () => {
    const { fn, calls } = fakeFetch(() => new Response(sse([{ choices: [{ delta: { content: 'ok' } }] }])));
    await new OpenRouterProvider(fn).stream({ model: 'acme/plain:free', prompt: 'x', maxTokens: 50, signal: new AbortController().signal, onDelta: () => undefined });
    expect(JSON.parse(String(calls[0].init?.body))).not.toHaveProperty('reasoning');
  });

  const failWith = async (status: number, body: string) => {
    const { fn } = fakeFetch(() => new Response(body, { status }));
    return new OpenRouterProvider(fn)
      .stream({ model: 'acme/m:free', prompt: 'x', maxTokens: 10, signal: new AbortController().signal, onDelta: () => undefined })
      .then(() => null, (e) => e as ProviderError);
  };

  it('maps real OpenRouter error responses to the right quota behaviour', async () => {
    const daily = await failWith(429, errorBody(429, 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day'));
    expect(daily).toMatchObject({ kind: 'daily_quota', status: 429 });
    expect(daily!.resetAt).toBeGreaterThan(Date.now());

    const minute = await failWith(429, errorBody(429, 'Rate limit exceeded: free-models-per-min.'));
    expect(minute).toMatchObject({ kind: 'rate_limit', status: 429 });

    expect(await failWith(401, errorBody(401, 'No auth credentials found'))).toMatchObject({ kind: 'auth' });
    expect(await failWith(402, errorBody(402, 'Insufficient credits'))).toMatchObject({ kind: 'daily_quota' });
    expect(await failWith(404, errorBody(404, 'No endpoints found for acme/m:free.'))).toMatchObject({ kind: 'unavailable' });
    expect(await failWith(503, 'upstream overloaded')).toMatchObject({ kind: 'unavailable' });
  });

  it('turns a mid-stream error chunk into a rate-limit error', async () => {
    const { fn } = fakeFetch(() => new Response(sse([{ choices: [{ delta: { content: 'par' } }] }, { error: { code: 429, message: 'Provider returned error' } }])));
    const err = await new OpenRouterProvider(fn)
      .stream({ model: 'acme/m:free', prompt: 'x', maxTokens: 10, signal: new AbortController().signal, onDelta: () => undefined })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('rate_limit');
  });
});
