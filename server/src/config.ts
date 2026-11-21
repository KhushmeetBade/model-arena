import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root .env (loaded once by `node --env-file-if-exists=../.env` at process start). */
const envFile = path.resolve(here, '../../.env');

/** mtime of the root .env, or null if it does not exist. Never reads the file's contents. */
function envFileMtime(): number | null {
  try {
    return fs.statSync(envFile).mtimeMs;
  } catch {
    return null;
  }
}
const envMtimeAtStart = envFileMtime();

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: process.env.DATA_DIR ?? path.resolve(here, '../data'),
  clientDist: path.resolve(here, '../../client/dist'),
  openrouterKey: () => process.env.OPENROUTER_API_KEY?.trim() || '',
  anthropicKey: () => process.env.ANTHROPIC_API_KEY?.trim() || '',
  openaiKey: () => process.env.OPENAI_API_KEY?.trim() || '',
  /**
   * Paid providers are hard-locked off unless ALLOW_PAID_PROVIDERS is exactly "true".
   * The Settings page can never override this lock.
   */
  paidAllowedByEnv: () => process.env.ALLOW_PAID_PROVIDERS?.trim() === 'true',
  maxCompetitors: 5,
  /**
   * True when the root .env was created or edited after this server process started.
   * Node reads --env-file only at startup, so the running server cannot see those changes.
   */
  envChangedSinceStart: () => {
    const now = envFileMtime();
    if (now === null) return false;
    return envMtimeAtStart === null || now > envMtimeAtStart + 1;
  },
};

export const RESTART_HINT =
  'Add it to the root .env file, then restart the server (stop and re-run `npm run dev`) — the server only reads .env at startup.';
