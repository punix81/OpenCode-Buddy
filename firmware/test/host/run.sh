#!/usr/bin/env bash
# Host tests for the firmware protocol parser.
#
# The parser has no Arduino dependency, so it is compiled with the host g++ and
# the cached ArduinoJson headers. It consumes the same vectors as the TypeScript
# tests.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
REFERENCE="${REFERENCE:-$ROOT/../Codex-Quota-Mini}"
# Prefer this repository's own cached dependency; the reference project is an
# optional fallback for a fresh clone that never ran a build.
ARDUINOJSON="${ARDUINOJSON:-$ROOT/firmware/.pio/libdeps/supermini/ArduinoJson/src}"
if [ ! -f "$ARDUINOJSON/ArduinoJson.h" ]; then
  ARDUINOJSON="$REFERENCE/.pio/libdeps/supermini/ArduinoJson/src"
fi
OUT="${OUT:-/tmp/opencode/buddy-protocol-test}"

if [ ! -f "$ARDUINOJSON/ArduinoJson.h" ]; then
  echo "ArduinoJson headers not found at $ARDUINOJSON" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUT")"
g++ -std=c++17 -O2 -Wall -Wextra \
  -I "$ROOT/firmware/include" \
  -I "$ROOT/firmware/src" \
  -I "$ARDUINOJSON" \
  "$ROOT/firmware/src/ProtocolParser.cpp" \
  "$ROOT/firmware/src/StateManager.cpp" \
  "$HERE/test_protocol.cpp" \
  -o "$OUT"

"$OUT" "$ROOT/protocol/test-vectors/messages.json"

g++ -std=c++17 -O2 -Wall -Wextra \
  -I "$ROOT/firmware/include" \
  -I "$ROOT/firmware/src" \
  "$ROOT/firmware/src/Localization.cpp" \
  "$HERE/test_localization.cpp" \
  -o "$OUT-localization"

"$OUT-localization"

g++ -std=c++17 -O2 -Wall -Wextra \
  -I "$HERE/mock" -I "$ROOT/firmware/include" -I "$ROOT/firmware/src" \
  "$ROOT/firmware/src/TouchManager.cpp" "$HERE/test_touch.cpp" -o "$OUT-touch"

g++ -std=c++17 -O2 -Wall -Wextra \
  -I "$ROOT/firmware/include" \
  -I "$ROOT/firmware/src" \
  "$HERE/test_tx.cpp" \
  -o "$OUT-tx"

"$OUT-touch"
"$OUT-tx"
