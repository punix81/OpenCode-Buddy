#pragma once

#include <cstdint>

#include "BuddyState.h"

namespace buddy {

// Time-derived animation inputs. Everything is computed from the monotonic
// millisecond counter, so there is no per-frame allocation and no state drift.
struct MotionFrame {
  uint32_t elapsedMs = 0;
  uint16_t cycleMs = 0;   // 0..999
  uint8_t pulse = 0;      // 0..255 triangle wave, 1 Hz
  uint8_t lid = 0;
  uint32_t age = 0;
  BuddyState previous = BuddyState::Offline;
  bool quiet = false;
};

class AnimationEngine {
 public:
  void begin(uint32_t now);
  void tick(uint32_t now, BuddyState state, bool quiet);

  const MotionFrame& frame() const { return frame_; }

  uint32_t intervalMs(BuddyState state) const;
  bool due(uint32_t now, uint32_t interval) const;
  void markPushed(uint32_t now);

 private:
  BuddyState current_ = BuddyState::Offline;
  uint32_t entered_ = 0;
  uint32_t start_ = 0;
  uint32_t lastPush_ = 0;
  MotionFrame frame_;
};

}  // namespace buddy
