import { config, RESTART_HINT } from './config.js';
import { createApp } from './app.js';

// ARENA_DEV_CLIENT is set only by `npm run dev`; it must point at a local dev server.
const devClient = process.env.ARENA_DEV_CLIENT?.trim();
const devClientUrl = devClient && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(devClient) ? devClient : undefined;
// Local-only by default: listen on the loopback interface so other devices on the network can't reach it.
const host = process.env.HOST?.trim() || '127.0.0.1';

const { app } = createApp({ serveClient: true, devClientUrl });
app.listen(config.port, host, () => {
  console.log(`🏁 Model Arena API on http://${host === '127.0.0.1' ? 'localhost' : host}:${config.port}${devClientUrl ? ` (pages → ${devClientUrl})` : ''}`);
  const keys = { OPENROUTER_API_KEY: config.openrouterKey(), ANTHROPIC_API_KEY: config.anthropicKey(), OPENAI_API_KEY: config.openaiKey() };
  for (const [k, v] of Object.entries(keys)) console.log(`   ${v ? '✔' : '✖'} ${k}${v ? '' : ' (not set)'}`);
  console.log(`   ${config.paidAllowedByEnv() ? '⚠ paid providers ALLOWED (ALLOW_PAID_PROVIDERS=true)' : '🔒 paid providers locked (ALLOW_PAID_PROVIDERS is not "true")'}`);
  if (!keys.OPENROUTER_API_KEY) console.log(`   → No racers without OPENROUTER_API_KEY. ${RESTART_HINT}`);
});
