#!/usr/bin/env bash
# Copies the genuine local race history (and car liveries) into the production deployment.
# - Never calls an AI model; uses the owner-only /api/admin/import endpoint.
# - The access code is read with hidden input and is never printed or saved.
# - Demo races are rejected by the server; private records listed in EXCLUDE are skipped.
# Usage: scripts/import-races.sh [base-url]        (add DRY_RUN=1 to only show what would be sent)
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-https://model-arena-lake.vercel.app}"
# c25d9535: its prompt is the owner's private project-handover text, not a demo prompt — keep it off the public site.
EXCLUDE="c25d9535"
PAYLOAD="$(mktemp)"
trap 'rm -f "$PAYLOAD"' EXIT
EXCLUDE="$EXCLUDE" node -e '
const fs = require("fs");
const ex = process.env.EXCLUDE.split(",").filter(Boolean);
const races = JSON.parse(fs.readFileSync("server/data/races.json", "utf8"))
  .filter((r) => !r.demo && !ex.some((p) => r.id.startsWith(p)));
let liveries = {};
try { liveries = JSON.parse(fs.readFileSync("server/data/liveries.json", "utf8")); } catch {}
fs.writeFileSync(process.argv[1], JSON.stringify({ races, liveries }));
for (const r of races) console.error("  " + r.id.slice(0, 8) + "  " + JSON.stringify(r.prompt.slice(0, 50)));
console.error(races.length + " genuine race(s), " + Object.keys(liveries).length + " livery entr(ies) prepared");
' "$PAYLOAD"
if [ "${DRY_RUN:-0}" = 1 ]; then echo "Dry run — nothing sent."; exit 0; fi
read -r -s -p "Owner access code for $BASE (hidden): " CODE; echo
STATUS=$(curl -s -o /dev/stderr -w "%{http_code}" -X POST "$BASE/api/admin/import" \
  -H "content-type: application/json" -H "x-arena-access: $CODE" --data-binary "@$PAYLOAD") || true
unset CODE
echo; echo "HTTP $STATUS"
[ "$STATUS" = 200 ] && echo "Import complete." || { echo "Import failed (nothing was changed unless HTTP 200)."; exit 1; }
