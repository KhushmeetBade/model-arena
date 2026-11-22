import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Access control.
 *  - Locally Model Arena is local-only: the Host must be a loopback name (blocks DNS rebinding) and
 *    browsers may call the API only from a localhost page (blocks other websites from spending the
 *    free quota or changing settings).
 *  - When deployed, the deployment's own hostnames are added to the allow-list, so only pages served
 *    by the app itself can call its API. Quota-spending and settings routes additionally require the
 *    owner's access code (see `requireAccessCode`).
 */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;

const norm = (h: string) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

export function makeHostRules(extraHosts: string[] = []) {
  const extra = new Set(extraHosts.map(norm).filter(Boolean));
  const isAllowedHost = (host: string | undefined) => !!host && (LOOPBACK_HOST.test(host) || extra.has(norm(host)));
  const isAllowedOrigin = (origin: string | undefined) => {
    if (!origin) return true; // same-origin navigation / non-browser clients
    if (LOOPBACK_ORIGIN.test(origin)) return true;
    const m = origin.match(/^https:\/\/([^/]+)$/i);
    return !!m && extra.has(norm(m[1]));
  };
  return { isAllowedHost, isAllowedOrigin };
}

/** Hostnames Vercel assigns to this deployment, plus ARENA_ALLOWED_HOSTS (comma-separated). */
export function deploymentHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  return [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL, ...(env.ARENA_ALLOWED_HOSTS ?? '').split(',')].filter((x): x is string => !!x && !!x.trim());
}

const local = makeHostRules();
export const isAllowedOrigin = local.isAllowedOrigin;
export const isLoopbackHost = (host: string | undefined) => !!host && LOOPBACK_HOST.test(host);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function hostGuard(rules = local) {
  return function guard(req: Request, res: Response, next: NextFunction) {
    if (!rules.isAllowedHost(req.headers.host)) {
      return void res.status(403).json({ error: 'This Model Arena server does not accept requests for that host.' });
    }
    const origin = req.headers.origin;
    const crossSite = req.headers['sec-fetch-site'] === 'cross-site';
    if (!SAFE_METHODS.has(req.method) && (!rules.isAllowedOrigin(origin) || crossSite)) {
      return void res.status(403).json({ error: 'Cross-site requests are not allowed.' });
    }
    if (!rules.isAllowedOrigin(origin) && req.path.startsWith('/api/')) {
      return void res.status(403).json({ error: 'Cross-site requests are not allowed.' });
    }
    next();
  };
}

/** Back-compat: the local-only guard. */
export const localOnly = hostGuard(local);

/** Constant-time comparison of the supplied access code with the configured one. */
export function accessCodeMatches(supplied: unknown, expected: string): boolean {
  if (typeof supplied !== 'string' || !expected) return false;
  const a = crypto.createHash('sha256').update(supplied).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Requires the owner's access code (header `x-arena-access`) when one is configured.
 * Wrong codes are rate-limited per client IP to slow down guessing.
 */
export function requireAccessCode(getCode: () => string | undefined, opts: { maxFailures?: number; windowMs?: number } = {}) {
  const failures = new Map<string, { n: number; since: number }>();
  const maxFailures = opts.maxFailures ?? 8;
  const windowMs = opts.windowMs ?? 15 * 60_000;
  return function access(req: Request, res: Response, next: NextFunction) {
    const code = getCode();
    if (!code) return next(); // no code configured → local mode, protected by hostGuard
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0].trim();
    const f = failures.get(ip);
    if (f && Date.now() - f.since < windowMs && f.n >= maxFailures) {
      return void res.status(429).json({ error: 'Too many wrong access codes. Try again in a few minutes.', code: 'access_locked' });
    }
    if (accessCodeMatches(req.headers['x-arena-access'], code)) {
      failures.delete(ip);
      return next();
    }
    const cur = f && Date.now() - f.since < windowMs ? f : { n: 0, since: Date.now() };
    cur.n++;
    failures.set(ip, cur);
    res.status(401).json({ error: 'Owner access code required: live AI races and settings changes are restricted on this public deployment. Demo races are open to everyone.', code: 'access_required' });
  };
}
