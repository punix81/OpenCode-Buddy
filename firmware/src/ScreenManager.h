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

  ScreenId screen() const { return screen_; }

 private:
  void render(uint32_t now);
  void drawBuddy(uint32_t now);
  void drawSession(uint32_t now);
  void drawTokens(uint32_t now);
  void drawTools(uint32_t now);
  void drawMcp(uint32_t now);
  void drawSystem(uint32_t now);

  void drawChrome(lgfx::LGFX_Sprite& g, const char* title, uint16_t accent);
  void drawRow(lgfx::LGFX_Sprite& g, int y, const char* label, const char* value,
               uint16_t valueColor);
  void drawToast(lgfx::LGFX_Sprite& g, uint32_t now);

  DisplayManager* display_ = nullptr;
  StateManager* state_ = nullptr;
  PreferencesManager* preferences_ = nullptr;
  AnimationEngine* animation_ = nullptr;
  BuddyFace* face_ = nullptr;

  ScreenId screen_ = ScreenId::Buddy;
  uint32_t lastInteraction_ = 0;
  bool dirty_ = true;

  char toast_[16] = {0};
  uint32_t toastUntil_ = 0;
};

}  // namespace buddy
