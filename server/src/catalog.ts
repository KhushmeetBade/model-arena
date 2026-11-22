import { QuotaManager } from './quota.js';
import { ModelInfo, Provider, ProviderId, Settings } from './types.js';

/** Preference order for default competitors (larger/more capable free models first). */
const PREFERRED = [/ultra/i, /gemma-4-31b/i, /super/i, /ernie/i, /ling/i, /gemma/i, /particle/i, /flint/i, /lightning/i];

export class Catalog {
  private cache: { at: number; models: ModelInfo[] } | null = null;
  private errors: Partial<Record<ProviderId, string>> = {};

  constructor(
    private providers: Provider[],
    private quota: QuotaManager,
    private getSettings: () => Settings,
    /** True when ALLOW_PAID_PROVIDERS is not "true" — paid providers can then never be used. */
    private paidLocked: () => boolean = () => true,
  ) {}

  provider(id: ProviderId) {
    return this.providers.find((p) => p.id === id);
  }

  allProviders() {
    return this.providers;
  }

  async list(force = false): Promise<ModelInfo[]> {
    if (!force && this.cache && Date.now() - this.cache.at < 10 * 60_000) return this.decorate(this.cache.models);
    const all: ModelInfo[] = [];
    await Promise.all(
      this.providers.map(async (p) => {
        // Never contact a paid provider while paid usage is locked by ALLOW_PAID_PROVIDERS.
        if (p.billing === 'paid' && this.paidLocked()) return;
        try {
          const models = await p.listModels();
          all.push(...models);
          delete this.errors[p.id];
        } catch (err) {
          this.errors[p.id] = err instanceof Error ? err.message : String(err);
          // keep previously cached models for this provider
          if (this.cache) all.push(...this.cache.models.filter((m) => m.provider === p.id));
        }
      }),
    );
    all.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    this.cache = { at: Date.now(), models: all };
    return this.decorate(all);
  }

  listErrors() {
    return { ...this.errors };
  }

  async get(id: string): Promise<ModelInfo | undefined> {
    return (await this.list()).find((m) => m.id === id);
  }

  /** Applies live availability: key presence, paid gate, quota/cooldowns. */
  private decorate(models: ModelInfo[]): ModelInfo[] {
    const settings = this.getSettings();
    return models.map((m) => {
      const p = this.provider(m.provider)!;
      let reason: string | undefined;
      if (!p.isConfigured())
        reason = process.env.VERCEL
          ? `Needs ${p.keyEnvVar} — the owner adds it in Vercel → Project → Settings → Environment Variables, then redeploys`
          : `Needs ${p.keyEnvVar} in the root .env — restart the server after adding it`;
      else if (p.billing === 'paid' && this.paidLocked()) reason = 'Paid API — locked off by ALLOW_PAID_PROVIDERS=false';
      else if (p.billing === 'paid' && !settings.allowPaid) reason = 'Paid API — enable in Settings to use your credits';
      else if (!m.free && p.billing === 'free') reason = 'Not a $0 model'; // defense in depth: free provider must only yield free models
      else reason = this.quota.check(m.provider, m.id) ?? undefined;
      return { ...m, available: !reason, unavailableReason: reason };
    });
  }
}

function rank(m: ModelInfo) {
  const providerRank = m.provider === 'openrouter' ? 0 : 1;
  const i = PREFERRED.findIndex((r) => r.test(m.providerModel));
  return providerRank * 100 + (i === -1 ? 50 : i);
}
