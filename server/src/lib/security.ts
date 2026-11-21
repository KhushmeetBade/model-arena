import type { NextFunction, Request, Response } from 'express';

/**
 * Local-only access control. Model Arena runs on this computer only, so:
 *  - browsers may call the API only from a localhost page (blocks other websites from spending
 *    the free quota or changing settings — classic CSRF / drive-by requests), and
 *  - the Host header must be a loopback name (blocks DNS-rebinding attacks).
 */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;

export const isAllowedOrigin = (origin: string | undefined) => !origin || LOOPBACK_ORIGIN.test(origin);
export const isLoopbackHost = (host: string | undefined) => !!host && LOOPBACK_HOST.test(host);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function localOnly(req: Request, res: Response, next: NextFunction) {
  if (!isLoopbackHost(req.headers.host)) {
    return void res.status(403).json({ error: 'Model Arena only accepts requests addressed to localhost.' });
  }
  const origin = req.headers.origin;
  const crossSite = req.headers['sec-fetch-site'] === 'cross-site';
  if (!SAFE_METHODS.has(req.method) && (!isAllowedOrigin(origin) || crossSite)) {
    return void res.status(403).json({ error: 'Cross-site requests are not allowed.' });
  }
  if (!isAllowedOrigin(origin) && req.path.startsWith('/api/')) {
    // Reads from foreign pages are refused too, so they can't read race data or quota state.
    return void res.status(403).json({ error: 'Cross-site requests are not allowed.' });
  }
  next();
}
