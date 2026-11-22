import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { JsonStore } from './store.js';

/** Synchronous key/value view used by the race engine, quota manager and settings. */
export interface SyncStore<T> {
  read(): T;
  write(value: T): void;
}

/**
 * Where Model Arena keeps its state.
 *  - FilePersistence: JSON files in server/data (local `npm run dev` / `npm start`).
 *  - BlobPersistence: ONE private Vercel Blob document (serverless production).
 * Both expose synchronous stores backed by an in-memory copy; `refresh()` pulls newer state and
 * `flush()` makes sure pending writes are durable before a serverless response ends.
 */
export interface Persistence {
  kind: 'file' | 'blob';
  store<T>(name: string, fallback: () => T): SyncStore<T>;
  refresh(force?: boolean): Promise<boolean>;
  flush(): Promise<void>;
}

export class FilePersistence implements Persistence {
  kind = 'file' as const;
  constructor(private dir: string) {}
  store<T>(name: string, fallback: () => T): SyncStore<T> {
    return new JsonStore<T>(this.dir, name, fallback);
  }
  async refresh() {
    return false;
  }
  async flush() {}
}

type Doc = Record<string, unknown>;

/** Merge rule used when another instance wrote the document since we last read it. */
export type MergeFn = (remote: unknown, local: unknown) => unknown;

export interface BlobApi {
  get: typeof get;
  put: typeof put;
}

/**
 * All state in a single private blob (`model-arena/state.json`) to stay far inside the Vercel Blob
 * Hobby allowance (2,000 advanced ops/month): one read per instance per `ttlMs`, one write per change
 * burst (debounced), optimistic concurrency via ETag with read-merge-retry.
 */
export class BlobPersistence implements Persistence {
  kind = 'blob' as const;
  private doc: Doc = {};
  private etag: string | null = null;
  private loadedAt = 0;
  private dirty = new Set<string>();
  private pending: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private opts: { pathname?: string; ttlMs?: number; token?: string; merge?: Record<string, MergeFn>; api?: BlobApi } = {}) {}

  private get path() {
    return this.opts.pathname ?? 'model-arena/state.json';
  }
  private get api(): BlobApi {
    return this.opts.api ?? { get, put };
  }

  store<T>(name: string, fallback: () => T): SyncStore<T> {
    return {
      read: () => (name in this.doc ? (this.doc[name] as T) : fallback()),
      write: (value: T) => {
        this.doc[name] = value;
        this.dirty.add(name);
        this.schedule();
      },
    };
  }

  private async fetchRemote(): Promise<{ doc: Doc; etag: string | null } | 'unchanged'> {
    const res = await this.api.get(this.path, { access: 'private', useCache: false, ifNoneMatch: this.etag ?? undefined, token: this.opts.token });
    if (!res) return { doc: {}, etag: null }; // not created yet
    if (res.statusCode === 304) return 'unchanged';
    const text = await new Response(res.stream).text();
    return { doc: text ? (JSON.parse(text) as Doc) : {}, etag: res.blob.etag };
  }

  /** Pull newer state from Blob at most every ttlMs (never overwrites unsaved local changes). */
  async refresh(force = false): Promise<boolean> {
    if (!force && this.loadedAt && Date.now() - this.loadedAt < (this.opts.ttlMs ?? 120_000)) return false;
    if (this.pending) await this.pending;
    const remote = await this.fetchRemote();
    this.loadedAt = Date.now();
    if (remote === 'unchanged') return false;
    for (const [k, v] of Object.entries(remote.doc)) if (!this.dirty.has(k)) this.doc[k] = v;
    this.etag = remote.etag;
    return true;
  }

  /** Take remote values for keys we haven't changed; merge the ones we have (where a rule exists). */
  private async mergeFromRemote() {
    const remote = await this.fetchRemote();
    if (remote === 'unchanged') return;
    for (const [k, v] of Object.entries(remote.doc)) {
      if (!this.dirty.has(k)) this.doc[k] = v;
      else if (this.opts.merge?.[k]) this.doc[k] = this.opts.merge[k](v, this.doc[k]);
    }
    this.etag = remote.etag;
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch((e) => console.error('[persistence] flush failed', e));
    }, 250);
    this.timer.unref?.();
  }

  /** Write pending changes; on a concurrent write, re-read, merge and retry. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending) await this.pending;
    if (!this.dirty.size) return;
    this.pending = (async () => {
      // Without an ETag we can't write conditionally (e.g. the document didn't exist when we last
      // looked): re-read and merge first, so a concurrent first write is never silently overwritten.
      if (this.etag === null) await this.mergeFromRemote();
      for (let attempt = 0; attempt < 4; attempt++) {
        const names = [...this.dirty];
        try {
          const res = await this.api.put(this.path, JSON.stringify(this.doc), {
            access: 'private',
            allowOverwrite: true,
            addRandomSuffix: false,
            contentType: 'application/json',
            cacheControlMaxAge: 60,
            ifMatch: this.etag ?? undefined,
            token: this.opts.token,
          });
          this.etag = (res as { etag?: string }).etag ?? this.etag;
          names.forEach((n) => this.dirty.delete(n));
          this.loadedAt = Date.now();
          return;
        } catch (e) {
          if (!(e instanceof BlobPreconditionFailedError) || attempt === 3) throw e;
          // another instance wrote first: merge its state with ours and try again
          await this.mergeFromRemote();
        }
      }
    })();
    try {
      await this.pending;
    } finally {
      this.pending = null;
    }
  }
}

/** Union of race histories by id; the more complete (later-finished) copy wins. Newest first, capped. */
export function mergeRaces(remote: unknown, local: unknown, max = 200): unknown {
  type R = { id: string; createdAt: number; finishedAt?: number };
  const byId = new Map<string, R>();
  for (const r of [...((remote as R[]) ?? []), ...((local as R[]) ?? [])]) {
    const prev = byId.get(r.id);
    if (!prev || (r.finishedAt ?? 0) >= (prev.finishedAt ?? 0)) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
}
