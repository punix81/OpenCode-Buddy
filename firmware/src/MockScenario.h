#pragma once

#include <cstdint>

#include "BuddyState.h"
#include "StateManager.h"

namespace buddy {

// Bench-only state driver. It is compiled only when BUDDY_MOCK_MODE is defined
// and is labelled MOCK on the screen. It never claims a bridge or OpenCode
// connection: those stay UNKNOWN in Phase 1.
class MockScenario {
 public:
  void begin(uint32_t now, StateManager& state);
  void tick(uint32_t now, StateManager& state);

 private:
  void enter(uint8_t index, uint32_t now, StateManager& state);

  uint8_t index_ = 0;
  uint32_t stepStart_ = 0;
  uint32_t start_ = 0;
};

}  // namespace buddy
