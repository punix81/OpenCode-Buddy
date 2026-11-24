#include "TouchManager.h"

#include <Arduino.h>

namespace buddy {
namespace {

uint32_t clampValue(uint32_t value, uint32_t low, uint32_t high) {
  if (value < low) {
    return low;
  }
  return value > high ? high : value;
}

}  // namespace

void TouchManager::begin() {
  // Verified in the reference firmware: GPIO6, active HIGH, internal pulldown.
  pinMode(kTouchPin, INPUT_PULLDOWN);
}

void TouchManager::setTimings(const GestureTimings& value) {
  timings_.debounceMs = clampValue(value.debounceMs, 10, 200);
  timings_.doubleWindowMs = clampValue(value.doubleWindowMs, 150, 800);
  timings_.longMs = clampValue(value.longMs, 800, 3000);
  timings_.veryLongMs = clampValue(value.veryLongMs, 3000, 10000);

  if (timings_.veryLongMs <= timings_.longMs) {
    timings_.veryLongMs = timings_.longMs + 1000;
  }
}

Gesture TouchManager::poll(uint32_t now) {
  const bool reading = digitalRead(kTouchPin) == HIGH;

  if (reading != raw_) {
    raw_ = reading;
    lastRawChange_ = now;
    ++rawEdges_;
  }

  if (raw_ != stable_ && now - lastRawChange_ >= timings_.debounceMs) {
    stable_ = raw_;
    if (stable_) {
      pressStart_ = now;
      veryLongFired_ = false;
    } else {
      const uint32_t held = now - pressStart_;
      lastRelease_ = now;

      if (veryLongFired_) {
        // Already reported; suppress Long and Short on release.
        veryLongFired_ = false;
      } else if (held >= timings_.longMs) {
        // A long press is not part of a double press: discard any pending short.
        shortPending_ = false;
        lastLatencyMs_ = held;
        return Gesture::Long;
      } else if (shortPending_ && now - shortPendingAt_ <= timings_.doubleWindowMs) {
        shortPending_ = false;
        lastLatencyMs_ = now - lastRelease_;
        return Gesture::Double;
      } else {
        shortPending_ = true;
        shortPendingAt_ = now;
      }
    }
  }

  if (stable_ && !veryLongFired_ && now - pressStart_ >= timings_.veryLongMs) {
    veryLongFired_ = true;
    shortPending_ = false;
    lastLatencyMs_ = now - pressStart_;
    return Gesture::VeryLong;
  }

  if (!stable_ && shortPending_ && now - shortPendingAt_ > timings_.doubleWindowMs) {
    shortPending_ = false;
    lastLatencyMs_ = now - lastRelease_;
    return Gesture::Short;
  }

  return Gesture::None;
}

}  // namespace buddy
