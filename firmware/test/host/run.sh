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

# Deterministic parser fuzz corpus. ASan/UBSan are used when the host compiler
# supports them; otherwise the same corpus runs unsanitized and says so.
SAN_FLAGS=""
if g++ -std=c++17 -fsanitize=address,undefined -x c++ -o /dev/null - >/dev/null 2>&1 <<<'int main(){return 0;}'; then
  SAN_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer -g"
else
  echo "note: this compiler does not support ASan/UBSan; fuzz runs unsanitized" >&2
fi
g++ -std=c++17 -O1 -Wall -Wextra $SAN_FLAGS \
  -I "$ROOT/firmware/include" \
  -I "$ROOT/firmware/src" \
  -I "$ARDUINOJSON" \
  "$ROOT/firmware/src/ProtocolParser.cpp" \
  "$ROOT/firmware/src/StateManager.cpp" \
  "$HERE/test_fuzz.cpp" \
  -o "$OUT-fuzz"
ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$OUT-fuzz"

# Compact number formatting (pure C++, no LovyanGFX).
g++ -std=c++17 -O2 -Wall -Wextra \
  -I "$ROOT/firmware/src" \
  "$ROOT/firmware/src/Format.cpp" \
  "$HERE/test_number.cpp" \
  -o "$OUT-number"
"$OUT-number"
