#!/usr/bin/env bash
# Builds Model-Arena-AppFusion-2026.zip: deliverables + application source (exported from the current Git commit).
# Never includes .env, keys, node_modules, race/quota data, build output or caches. Missing items are reported, not faked.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=Model-Arena-AppFusion-2026
OUT="$PWD/$NAME.zip"
STAGE="$(mktemp -d)/$NAME"
mkdir -p "$STAGE"/{video,presentation,screenshots,documentation,source}
missing=()
copy() { if [ -f "$1" ]; then cp "$1" "$STAGE/$2"; else missing+=("$1"); fi; }
copy README.md README.md
copy SUBMISSION.md SUBMISSION.md
copy SUBMISSION.pdf SUBMISSION.pdf
copy video/Model-Arena-Demo.mp4 video/Model-Arena-Demo.mp4
copy video/SCRIPT.md video/SCRIPT.md
copy presentation/Model-Arena-Presentation.pptx presentation/Model-Arena-Presentation.pptx
copy presentation/Model-Arena-Presentation.pdf presentation/Model-Arena-Presentation.pdf
for s in 01-home 02-garage 03-race 04-replay 05-mobile; do copy "screenshots/$s.png" "screenshots/$s.png"; done
for d in architecture AI-integration security testing judge-QA rubric-mapping; do copy "documentation/$d.md" "documentation/$d.md"; done
# Application source: tracked files of the current commit only (so ignored files can never leak in).
git archive --format=tar HEAD | tar -x -C "$STAGE/source"
rm -rf "$STAGE/source/screenshots" "$STAGE/source/presentation" "$STAGE/source/SUBMISSION.pdf"   # already at top level
# Guards: no secrets, no env files, no private race content.
# (this script is excluded from its own scan: its guard patterns are literal text, not secrets)
if grep -rIlE --exclude=make-submission-zip.sh 'sk-or-v1-[0-9a-f]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|vercel_blob_rw_|ARENA_ACCESS_CODE=[^ ]{8,}' "$STAGE" >/dev/null 2>&1; then echo "SECRET DETECTED — aborting"; exit 1; fi
if find "$STAGE" \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' | grep -q .; then echo ".env FILE DETECTED — aborting"; exit 1; fi
if grep -rIl --exclude=make-submission-zip.sh 'FINAL AUTONOMOUS BUILD' "$STAGE" >/dev/null 2>&1; then echo "PRIVATE RACE CONTENT DETECTED — aborting"; exit 1; fi
rm -f "$OUT"
(cd "$(dirname "$STAGE")" && zip -qr -X "$OUT" "$NAME")
echo "Created $OUT"
if [ ${#missing[@]} -gt 0 ]; then echo "INCOMPLETE — missing: ${missing[*]}"; fi
