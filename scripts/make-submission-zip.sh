#!/usr/bin/env bash
# Builds Model-Arena-AppFusion-2026.zip with exactly the required submission files.
# Never includes .env, keys, node_modules, data or build caches. Missing items are reported, not faked.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=Model-Arena-AppFusion-2026
OUT="$PWD/$NAME.zip"
STAGE="$(mktemp -d)/$NAME"
mkdir -p "$STAGE"/{video,presentation,screenshots,documentation}
missing=()
copy() { if [ -f "$1" ]; then cp "$1" "$STAGE/$2"; else missing+=("$1"); fi; }
copy README.md README.md
copy SUBMISSION.md SUBMISSION.md
copy SUBMISSION.pdf SUBMISSION.pdf
copy video/Model-Arena-Demo.mp4 video/Model-Arena-Demo.mp4
copy presentation/Model-Arena-Presentation.pptx presentation/Model-Arena-Presentation.pptx
copy presentation/Model-Arena-Presentation.pdf presentation/Model-Arena-Presentation.pdf
for s in 01-home 02-garage 03-race 04-replay 05-champions; do copy "screenshots/$s.png" "screenshots/$s.png"; done
for d in architecture AI-integration security testing judge-QA rubric-mapping; do copy "documentation/$d.md" "documentation/$d.md"; done
# secret guard: refuse to package anything that looks like a key or the owner code
if grep -rIlE 'sk-or-v1-[0-9a-f]{20,}|sk-ant-|ARENA_ACCESS_CODE=[^ ]{8,}' "$STAGE" >/dev/null 2>&1; then echo "SECRET DETECTED — aborting"; exit 1; fi
rm -f "$OUT"
(cd "$(dirname "$STAGE")" && zip -qr -X "$OUT" "$NAME")
echo "Created $OUT"
if [ ${#missing[@]} -gt 0 ]; then echo "INCOMPLETE — missing: ${missing[*]}"; fi
