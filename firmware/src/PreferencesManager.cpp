#include "PreferencesManager.h"

#include "BuddyState.h"

namespace buddy {
namespace {

// NVS namespace. The "buddy" prefix keeps keys out of any other application's
// namespace on the same device.
constexpr char kNamespace[] = "buddy";
constexpr char kKeyLanguage[] = "lang";
constexpr char kKeyQuiet[] = "quiet";
constexpr char kKeyScreen[] = "screen";

uint8_t screenCount() { return static_cast<uint8_t>(ScreenId::Count); }

}  // namespace

bool PreferencesManager::begin() {
  ready_ = prefs_.begin(kNamespace, false);
  if (!ready_) {
    return false;
  }

  language_ = prefs_.getUChar(kKeyLanguage, 0);
  if (language_ > 2) {
    language_ = 0;
  }
  quiet_ = prefs_.getBool(kKeyQuiet, false);

  lastScreen_ = prefs_.getUChar(kKeyScreen, 0);
  if (lastScreen_ >= screenCount()) {
    lastScreen_ = 0;
  }
  return true;
}

void PreferencesManager::setLanguage(uint8_t value) {
  language_ = value > 2 ? 0 : value;
  if (ready_) {
    prefs_.putUChar(kKeyLanguage, language_);
  }
}

void PreferencesManager::setQuietMode(bool value) {
  quiet_ = value;
  if (ready_) {
    prefs_.putBool(kKeyQuiet, quiet_);
  }
}

void PreferencesManager::setLastScreen(uint8_t value) {
  lastScreen_ = value >= screenCount() ? 0 : value;
  if (ready_) {
    prefs_.putUChar(kKeyScreen, lastScreen_);
  }
}

void PreferencesManager::reset() {
  language_ = 0;
  quiet_ = false;
  lastScreen_ = 0;
  if (ready_) {
    prefs_.remove(kKeyLanguage);
    prefs_.remove(kKeyQuiet);
    prefs_.remove(kKeyScreen);
  }
}

}  // namespace buddy
