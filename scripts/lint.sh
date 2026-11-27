#!/usr/bin/env bash
# Local lint gate: bridge TypeScript (typescript-eslint) and the plain-JS plugin.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/bridge"
npx eslint --config eslint.config.js src test scripts
cd "$ROOT/plugin/opencode-buddy"
"$ROOT/bridge/node_modules/.bin/eslint" --config eslint.config.mjs .

# Plain-JS tooling: parse every .mjs file without executing it.
for file in "$ROOT"/scripts/*.mjs "$ROOT"/scripts/lib/*.mjs "$ROOT"/scripts/test/*.mjs; do
  [ -e "$file" ] || continue
  node --check "$file"
done
