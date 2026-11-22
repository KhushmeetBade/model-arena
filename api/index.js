// Vercel serverless entry for Model Arena (Express on Vercel Functions with Fluid compute).
// The React app is served as static files from client/dist; every /api/* request lands here.
//
// Production configuration (Vercel → Project → Settings → Environment Variables):
//   OPENROUTER_API_KEY            free OpenRouter key (server-side only; never sent to the browser)
//   ARENA_ACCESS_CODE             owner code required for live races and settings changes
//   BLOB_READ_WRITE_TOKEN         added automatically when a private Blob store is connected
//   ALLOW_PAID_PROVIDERS          leave unset or "false" (paid providers stay locked)
//   ARENA_MAX_LIVE_RACES_PER_DAY  optional, default 5
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/dist/app.js';
import { BlobPersistence, FilePersistence, mergeRaces } from '../server/dist/lib/persistence.js';
import { deploymentHosts } from '../server/dist/lib/security.js';

const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const accessCode = process.env.ARENA_ACCESS_CODE?.trim();

const { app } = createApp({
  serverless: true,
  serveClient: false,
  allowedHosts: deploymentHosts(),
  // Durable, private storage; without it live races are refused rather than silently lost.
  persistence: hasBlob
    ? new BlobPersistence({ ttlMs: 60_000, merge: { 'races.json': mergeRaces } })
    : new FilePersistence(path.join(os.tmpdir(), 'model-arena')),
  liveRacesDisabled: !hasBlob
    ? 'Live races are disabled on this deployment until durable storage (Vercel Blob) is connected. Demo races and replays still work.'
    : !accessCode
      ? 'Live races are disabled on this public deployment until the owner sets ARENA_ACCESS_CODE.'
      : undefined,
  accessCode: () => accessCode || undefined,
  maxLiveRacesPerDay: Number(process.env.ARENA_MAX_LIVE_RACES_PER_DAY ?? 5) || 5,
});

export default app;
