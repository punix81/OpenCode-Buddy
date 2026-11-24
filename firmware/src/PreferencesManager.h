#pragma once

#include <cstdint>

#include <Preferences.h>

namespace buddy {

// Persists display preferences in NVS. Session data is never stored here.
class PreferencesManager {
 public:
  bool begin();

  uint8_t language() const { return language_; }
  bool quietMode() const { return quiet_; }
  uint8_t lastScreen() const { return lastScreen_; }

  void setLanguage(uint8_t value);
  void setQuietMode(bool value);
  void setLastScreen(uint8_t value);

  // Restores the defaults used by the very-long-press gesture.
  void reset();

 private:
  Preferences prefs_;
  bool ready_ = false;
  uint8_t language_ = 0;   // 0 = en, 1 = fr, 2 = de (rendering arrives in Phase 4)
  bool quiet_ = false;
  uint8_t lastScreen_ = 0;
};

}  // namespace buddy
