#include "ScreenManager.h"

#include <Arduino.h>

#include <cmath>
#include <cstdio>
#include <cstring>

#include "Config.h"
#include "Dashboard.h"

namespace buddy {
void ScreenManager::begin(DisplayManager* display, StateManager* state,
                          PreferencesManager* preferences, AnimationEngine* animation,
                          BuddyFace* face) {
  display_ = display;
  state_ = state;
  preferences_ = preferences;
  animation_ = animation;
  face_ = face;

  screen_ = static_cast<ScreenId>(preferences_->lastScreen());
  if (screen_ >= ScreenId::Count) {
    screen_ = ScreenId::Buddy;
  }
  lastInteraction_ = millis();
  dirty_ = true;
}

void ScreenManager::onGesture(Gesture gesture, uint32_t now) {
  if (gesture == Gesture::None || state_ == nullptr || preferences_ == nullptr) {
    return;
  }

  lastInteraction_ = now;

  switch (gesture) {
    case Gesture::Short: {
      const uint8_t next = (static_cast<uint8_t>(screen_) + 1) % static_cast<uint8_t>(ScreenId::Count);
      screen_ = static_cast<ScreenId>(next);
      preferences_->setLastScreen(next);
      dirty_ = true;
      break;
    }
    case Gesture::Double:
      screen_ = ScreenId::Buddy;
      preferences_->setLastScreen(0);
      dirty_ = true;
      break;
    case Gesture::Long: {
      const bool quiet = !preferences_->quietMode();
      preferences_->setQuietMode(quiet);
      snprintf(toast_, sizeof(toast_), "%s", quiet ? "QUIET" : "LOUD");
      toastUntil_ = now + 1500;
      dirty_ = true;
      break;
    }
    case Gesture::VeryLong:
      preferences_->reset();
      screen_ = ScreenId::Buddy;
      snprintf(toast_, sizeof(toast_), "%s", "RESET");
      toastUntil_ = now + 3000;
      dirty_ = true;
      break;
    default:
      break;
  }
}

void ScreenManager::update(uint32_t now) {
  if (display_ == nullptr || state_ == nullptr || preferences_ == nullptr ||
      animation_ == nullptr) {
    return;
  }
  if (!display_->ready()) {
    return;
  }

  const bool quiet = preferences_->quietMode();

  if (!quiet && screen_ != ScreenId::Buddy && now - lastInteraction_ >= kAutoReturnMs) {
    screen_ = ScreenId::Buddy;
    preferences_->setLastScreen(0);
    dirty_ = true;
    lastInteraction_ = now;
  }

  if (toast_[0] != '\0' && static_cast<int32_t>(now-toastUntil_) >= 0) {
    toast_[0] = '\0';
    dirty_ = true;
  }

  const uint32_t interval =
      screen_ == ScreenId::Buddy ? animation_->intervalMs(state_->state())
                                 : (quiet ? 500 : kDashboardIntervalMs);

  if (dirty_ || animation_->due(now, interval)) {
    render(now);
    animation_->markPushed(now);
    dirty_ = false;
  }
}

void ScreenManager::render(uint32_t now) {
  auto& g = display_->canvas();
  const uint32_t startUs = micros();
  ui::drawScreen(g, screen_, *state_, *face_, animation_->frame(), toast_, now-lastInteraction_);
  display_->push();

  const uint32_t elapsedUs = micros() - startUs;
  ++pushCount_;
  ++renderCount_;
  renderSumUs_ += elapsedUs;
  if (elapsedUs > renderMaxUs_) {
    renderMaxUs_ = elapsedUs;
  }
}

}  // namespace buddy
