#pragma once

#include <cstdint>

#include "AnimationEngine.h"
#include "BuddyFace.h"
#include "BuddyState.h"
#include "DisplayManager.h"
#include "PreferencesManager.h"
#include "StateManager.h"
#include "TouchManager.h"

namespace buddy {

class ScreenManager {
 public:
  void begin(DisplayManager* display, StateManager* state, PreferencesManager* preferences,
             AnimationEngine* animation, BuddyFace* face);

  void onGesture(Gesture gesture, uint32_t now);
  void update(uint32_t now);

#if defined(BUDDY_BENCH_COMMANDS) && BUDDY_BENCH_COMMANDS
  // Bench-only navigation for the diagnostic MOCK image: no gesture, no NVS
  // write, no auto-return side effect beyond the normal timer.
  void setScreenForBench(uint8_t screen, uint32_t now) {
    if (screen < static_cast<uint8_t>(ScreenId::Count)) {
      screen_ = static_cast<ScreenId>(screen);
      lastInteraction_ = now;
      dirty_ = true;
    }
  }
#endif

  // Host-configurable return to the Buddy screen. The protocol parser clamps the
  // value to 10..600 s; the device keeps 60 s when no host is present.
  void setAutoReturnSeconds(uint16_t seconds) { autoReturnMs_ = uint32_t(seconds) * 1000u; }

  ScreenId screen() const { return screen_; }

  // Instrumentation counters (Phase 1 validation).
  uint32_t pushCount() const { return pushCount_; }
  uint32_t renderAvgUs() const {
    return renderCount_ == 0 ? 0 : renderSumUs_ / renderCount_;
  }
  uint32_t renderMaxUs() const { return renderMaxUs_; }
  void resetRenderStats() {
    renderCount_ = 0;
    renderSumUs_ = 0;
    renderMaxUs_ = 0;
#if defined(BUDDY_DIAGNOSTICS) && BUDDY_DIAGNOSTICS
    for (uint16_t& bin : renderHistogram_) bin = 0;
    renderHistogramCount_ = 0;
#endif
  }

#if defined(BUDDY_DIAGNOSTICS) && BUDDY_DIAGNOSTICS
  // Exact percentile from a 1 ms histogram (0..255 ms). Diagnostic only: the
  // release build keeps the mean and max and pays no RAM for the bins.
  uint32_t renderPercentileUs(uint8_t percent) const;
#endif

 private:
  void render(uint32_t now);
  DisplayManager* display_ = nullptr;
  StateManager* state_ = nullptr;
  PreferencesManager* preferences_ = nullptr;
  AnimationEngine* animation_ = nullptr;
  BuddyFace* face_ = nullptr;

  ScreenId screen_ = ScreenId::Buddy;
  uint32_t lastInteraction_ = 0;
  bool dirty_ = true;
  uint8_t renderedLanguage_ = 0;
  uint32_t autoReturnMs_ = kAutoReturnMs;

  char toast_[16] = {0};
  uint32_t toastUntil_ = 0;

  uint32_t pushCount_ = 0;
  uint32_t renderCount_ = 0;
  uint32_t renderSumUs_ = 0;
  uint32_t renderMaxUs_ = 0;
#if defined(BUDDY_DIAGNOSTICS) && BUDDY_DIAGNOSTICS
  static constexpr uint16_t kRenderBins = 256;
  uint16_t renderHistogram_[kRenderBins] = {0};
  uint32_t renderHistogramCount_ = 0;
#endif
};

}  // namespace buddy
