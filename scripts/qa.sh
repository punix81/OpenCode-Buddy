#!/usr/bin/env bash
# Single local quality gate for OpenCode Buddy (Phase 5).
#
#   scripts/qa.sh                 typecheck, unit/integration tests, protocol,
#                                 firmware host tests, preview
#   scripts/qa.sh --coverage      same, with Node's line/branch coverage report
#   scripts/qa.sh --firmware      also build the firmware release
#
# No network, no device, no GitHub. Every suite can still be run alone:
#   cd bridge && npm test
#   cd bridge && npm run test:plugin
#   cd bridge && npm run validate:protocol
#   bash firmware/test/host/run.sh
#   cd tools/ui-preview && python3 -m unittest -q test_preview.py
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COVERAGE=0
FIRMWARE=0
for arg in "$@"; do
  case "$arg" in
    --coverage) COVERAGE=1 ;;
    --firmware) FIRMWARE=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

pass() { printf '\n== %s: PASS\n' "$1"; }
fail() { printf '\n== %s: FAIL\n' "$1" >&2; exit 1; }

echo "HEAD $(git -C "$ROOT" rev-parse --short HEAD)"

cd "$ROOT/bridge"
echo "== typecheck"
npm run typecheck > /tmp/opencode-qa-typecheck.log 2>&1 || { tail -n 40 /tmp/opencode-qa-typecheck.log; fail typecheck; }
pass typecheck

echo "== lint"
bash "$ROOT/scripts/lint.sh" > /tmp/opencode-qa-lint.log 2>&1 || { tail -n 60 /tmp/opencode-qa-lint.log; fail lint; }
pass lint

echo "== bridge tests"
if [ "$COVERAGE" = 1 ]; then
  node --import tsx --test --experimental-test-coverage test/*.test.ts > /tmp/opencode-qa-bridge.log 2>&1 || { tail -n 60 /tmp/opencode-qa-bridge.log; fail bridge; }
  grep -E '^# (tests|pass|fail)|^ℹ (tests|pass|fail)|all files' /tmp/opencode-qa-bridge.log | tail -n 12 || true
else
  npm test > /tmp/opencode-qa-bridge.log 2>&1 || { tail -n 60 /tmp/opencode-qa-bridge.log; fail bridge; }
  grep -E '^ℹ (tests|pass|fail)' /tmp/opencode-qa-bridge.log || true
fi
pass bridge

echo "== plugin tests"
npm run test:plugin > /tmp/opencode-qa-plugin.log 2>&1 || { tail -n 60 /tmp/opencode-qa-plugin.log; fail plugin; }
grep -E '^ℹ (tests|pass|fail)' /tmp/opencode-qa-plugin.log || true
pass plugin

echo "== protocol validation"
npm run validate:protocol > /tmp/opencode-qa-protocol.log 2>&1 || { tail -n 40 /tmp/opencode-qa-protocol.log; fail protocol; }
tail -n 1 /tmp/opencode-qa-protocol.log
pass protocol

echo "== firmware host tests"
bash "$ROOT/firmware/test/host/run.sh" > /tmp/opencode-qa-host.log 2>&1 || { tail -n 60 /tmp/opencode-qa-host.log; fail "firmware host"; }
grep -E 'firmware .*: PASS' /tmp/opencode-qa-host.log || true
pass "firmware host"

echo "== preview tests"
(cd "$ROOT/tools/ui-preview" && python3 -m unittest -q test_preview.py) > /tmp/opencode-qa-preview.log 2>&1 || { tail -n 40 /tmp/opencode-qa-preview.log; fail preview; }
tail -n 3 /tmp/opencode-qa-preview.log
pass preview

if [ "$FIRMWARE" = 1 ]; then
  echo "== firmware release build"
  (cd "$ROOT/firmware" && "$ROOT/.venv/bin/pio" run -e supermini) > /tmp/opencode-qa-firmware.log 2>&1 || { tail -n 60 /tmp/opencode-qa-firmware.log; fail firmware; }
  grep -E '^(RAM|Flash):' /tmp/opencode-qa-firmware.log || true
  sha256sum "$ROOT/firmware/.pio/build/supermini/firmware.bin"
  pass firmware
fi

printf '\nQA PASS (coverage=%s firmware=%s)\n' "$COVERAGE" "$FIRMWARE"
