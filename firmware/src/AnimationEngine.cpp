#include "AnimationEngine.h"

#include "Config.h"

namespace buddy {
namespace {

constexpr uint32_t kBlinkPeriodMs = 4200;
constexpr uint32_t kBlinkClosedMs = 110;

}  // namespace

void AnimationEngine::begin(uint32_t now) {
  start_ = now;
  lastPush_ = now - kFrameIntervalActiveMs;
  frame_ = MotionFrame{};
}

void AnimationEngine::tick(uint32_t now, BuddyState state, bool quiet) {
  frame_.elapsedMs = now - start_;
  frame_.cycleMs = static_cast<uint16_t>(frame_.elapsedMs % 1000);

  const uint32_t triangle = frame_.elapsedMs % 1000;
  frame_.pulse = static_cast<uint8_t>(triangle < 500 ? (triangle * 255) / 500
                                                     : ((1000 - triangle) * 255) / 500);

  // Quiet mode suspends ambient blinking but keeps alert motion available.
  frame_.quiet = quiet;
  frame_.blink = !quiet && (frame_.elapsedMs % kBlinkPeriodMs) < kBlinkClosedMs;

  (void)state;
}

uint32_t AnimationEngine::intervalMs(BuddyState state) const {
  if (frame_.quiet) {
    // Alerts still pulse; everything else is deliberately calm.
    if (state == BuddyState::PermissionRequired || state == BuddyState::UserInputRequired ||
        state == BuddyState::Error) {
      return kFrameIntervalActiveMs * 2;
    }
    return 250;
  }

  switch (state) {
    case BuddyState::Offline:
      return kFrameIntervalIdleMs * 2;
    case BuddyState::Idle:
      return kFrameIntervalIdleMs;
    case BuddyState::Compacting:
    case BuddyState::Retrying:
      return kFrameIntervalIdleMs;
    default:
      return kFrameIntervalActiveMs;
  }
}

bool AnimationEngine::due(uint32_t now, uint32_t interval) const {
  return now - lastPush_ >= interval;
}

void AnimationEngine::markPushed(uint32_t now) { lastPush_ = now; }

}  // namespace buddy
