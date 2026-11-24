#pragma once

#include <cstdint>

#include "Config.h"

namespace buddy {

enum class Gesture : uint8_t { None = 0, Short, Double, Long, VeryLong };

struct GestureTimings {
  uint32_t debounceMs = kDebounceMs;
  uint32_t doubleWindowMs = kDoublePressWindowMs;
  uint32_t longMs = kLongPressMs;
  uint32_t veryLongMs = kVeryLongPressMs;
};

// Non-blocking TTP223 gesture recogniser.
//
// Classification is exclusive: a very long press fires only VeryLong and never
// also Long or Short. A short press is only reported after the double-press
// window expires, so a double press is never seen as two short presses.
class TouchManager {
 public:
  void begin();
  Gesture poll(uint32_t now);

  const GestureTimings& timings() const { return timings_; }

  // Values outside the protocol bounds are clamped, never rejected silently.
  void setTimings(const GestureTimings& value);

  uint32_t lastLatencyMs() const { return lastLatencyMs_; }

 private:
  GestureTimings timings_;

  bool raw_ = false;
  bool stable_ = false;
  bool veryLongFired_ = false;
  bool shortPending_ = false;

  uint32_t lastRawChange_ = 0;
  uint32_t pressStart_ = 0;
  uint32_t shortPendingAt_ = 0;
  uint32_t lastRelease_ = 0;
  uint32_t lastLatencyMs_ = 0;
};

}  // namespace buddy
