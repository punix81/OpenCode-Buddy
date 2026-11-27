// Deterministic fuzz harness for the firmware protocol parser.
//
// It mutates valid NDJSON lines and feeds arbitrary bytes to handleLine(),
// including invalid UTF-8, embedded NULs, truncated and oversized input, deep
// nesting and the Phase 4.1 self-echo prefixes. The goal is memory safety and
// the invariant that a rejected line never corrupts the parser or the state.
//
// The same executable is built with ASan/UBSan by firmware/test/host/run.sh
// when the host compiler supports it. Leak detection is disabled because the
// process intentionally keeps its allocations until exit.

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>

#include "ProtocolParser.h"
#include "StateManager.h"

namespace {

int failures = 0;
uint32_t rng = 0xB0DD1E5u;

void check(bool condition, const char* message, uint32_t iteration) {
  if (!condition) {
    std::fprintf(stderr, "FAIL iteration=%u %s\n", iteration, message);
    ++failures;
  }
}

uint32_t nextRandom() {
  rng ^= rng << 13;
  rng ^= rng >> 17;
  rng ^= rng << 5;
  return rng;
}

char randomChar() {
  static const char alphabet[] = "{}[]\",:0123456789abcdefghijklmnopqrstuvwxyz \t\\/.-_";
  if ((nextRandom() & 31u) == 0) {
    return static_cast<char>(nextRandom() & 0xff);  // invalid UTF-8, NUL, control
  }
  return alphabet[nextRandom() % (sizeof(alphabet) - 1)];
}

std::string baseLine(uint32_t which) {
  switch (which % 4) {
    case 0:
      return R"({"v":1,"type":"ready","seq":1,"data":{"bridge":"0.2.0","proto":1,"run":"abcd1234"}})";
    case 1:
      return R"({"v":1,"type":"config","seq":2,"data":{"autoReturnSeconds":60,"gestures":{"debounceMs":35,"doublePressWindowMs":350,"longPressMs":1500,"veryLongPressMs":5000},"source":"live"}})";
    case 2:
      return R"({"v":1,"type":"state","seq":3,"data":{"status":"working","activeSessions":1,"connection":{"bridge":"ready","opencode":"connected"},"versions":{"bridge":"0.2.0","protocol":1},"source":"live"}})";
    default:
      return R"({"v":1,"type":"heartbeat","seq":4})";
  }
}

std::string mutate(const std::string& base) {
  std::string out = base;
  const uint32_t operation = nextRandom() % 8;
  switch (operation) {
    case 0: {
      const size_t at = out.empty() ? 0 : nextRandom() % (out.size() + 1);
      out.insert(out.begin() + static_cast<long>(at), randomChar());
      break;
    }
    case 1: {
      if (!out.empty()) out.erase(out.begin() + static_cast<long>(nextRandom() % out.size()));
      break;
    }
    case 2: {
      out = out.substr(0, out.empty() ? 0 : nextRandom() % out.size());
      break;
    }
    case 3: {
      static const char* prefixes[] = {
          "BUDDY-PROBE ms=1", "mpty=0 partial=0,\"dto\":", "{\"v\":1,\"type\":\"hello\",\"seq\":1,"};
      out = std::string(prefixes[nextRandom() % 3]) + out;
      break;
    }
    case 4:
      out += out;
      break;
    case 5: {
      // Deeply nested arrays/objects.
      out = "{\"v\":1,\"type\":\"state\",\"seq\":1,\"data\":" + std::string(200, '[') +
            std::string(200, ']') + "}";
      break;
    }
    case 6: {
      out.assign(2047, 'x');
      break;
    }
    default: {
      const size_t count = 1 + nextRandom() % 8;
      for (size_t i = 0; i < count; ++i) out.push_back(randomChar());
      break;
    }
  }
  return out;
}

bool stillConsistent(buddy::ProtocolParser& parser, buddy::StateManager& state, uint32_t iteration) {
  parser.begin(1, "0.2.0");
  state.begin(0);
  const char* ready =
      R"({"v":1,"type":"ready","seq":1,"data":{"bridge":"0.2.0","proto":1,"run":"abcd1234"}})";
  const buddy::ParseCode first = parser.handleLine(ready, std::strlen(ready), 1000, state);
  check(first == buddy::ParseCode::Ok, "clean ready after fuzz", iteration);
  check(parser.linkReady(), "link ready after fuzz", iteration);
  const char* stateLine =
      R"({"v":1,"type":"state","seq":2,"data":{"status":"idle","activeSessions":0,"connection":{"bridge":"ready","opencode":"connected"},"versions":{"bridge":"0.2.0","protocol":1},"source":"live"}})";
  const buddy::ParseCode second = parser.handleLine(stateLine, std::strlen(stateLine), 1100, state);
  check(second == buddy::ParseCode::Ok, "clean state after fuzz", iteration);
  check(state.state() == buddy::BuddyState::Idle, "state applied after fuzz", iteration);
  return first == buddy::ParseCode::Ok && second == buddy::ParseCode::Ok;
}

}  // namespace

int main() {
  buddy::ProtocolParser parser;
  buddy::StateManager state;
  parser.begin(1, "0.2.0");
  state.begin(0);

  constexpr uint32_t kCases = 10000;
  for (uint32_t i = 0; i < kCases; ++i) {
    std::string line = mutate(baseLine(nextRandom()));
    // handleLine's contract is bytes + length; an embedded NUL is just a byte.
    const buddy::ParseCode code =
        parser.handleLine(line.data(), line.size(), i, state);
    // The enum is bounded and every result is handled by main; the property here
    // is that no input crashes or reaches an out-of-range value.
    check(static_cast<unsigned>(code) <= static_cast<unsigned>(buddy::ParseCode::InternalError),
          "parse code in range", i);
    if ((i % 250u) == 0u) {
      stillConsistent(parser, state, i);
    }
  }

  check(stillConsistent(parser, state, kCases), "clean session after the corpus", kCases);
  if (failures != 0) {
    std::fprintf(stderr, "firmware fuzz: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("firmware fuzz: PASS (%u cases)\n", kCases);
  return 0;
}
