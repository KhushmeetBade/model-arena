import { config, RESTART_HINT } from './config.js';
import { createApp } from './app.js';

const { app } = createApp({ serveClient: true });
app.listen(config.port, () => {
  console.log(`🏁 Model Arena API on http://localhost:${config.port}`);
  const keys = { OPENROUTER_API_KEY: config.openrouterKey(), ANTHROPIC_API_KEY: config.anthropicKey(), OPENAI_API_KEY: config.openaiKey() };
  for (const [k, v] of Object.entries(keys)) console.log(`   ${v ? '✔' : '✖'} ${k}${v ? '' : ' (not set)'}`);
  console.log(`   ${config.paidAllowedByEnv() ? '⚠ paid providers ALLOWED (ALLOW_PAID_PROVIDERS=true)' : '🔒 paid providers locked (ALLOW_PAID_PROVIDERS is not "true")'}`);
  if (!keys.OPENROUTER_API_KEY) console.log(`   → No racers without OPENROUTER_API_KEY. ${RESTART_HINT}`);
});
