#include <Arduino.h>
#include <Esp.h>
#include <esp_attr.h>
#include <esp_system.h>

#include "AnimationEngine.h"
#include "BuddyFace.h"
#include "Config.h"
#include "DisplayManager.h"
#include "MockScenario.h"
#include "PreferencesManager.h"
#include "ScreenManager.h"
#include "SerialManager.h"
#include "StateManager.h"
#include "TouchManager.h"

namespace {

buddy::DisplayManager gDisplay;
buddy::PreferencesManager gPreferences;
buddy::SerialManager gSerial;
buddy::StateManager gState;
buddy::TouchManager gTouch;
buddy::AnimationEngine gAnimation;
buddy::BuddyFace gFace;
buddy::ScreenManager gScreens;
buddy::MockScenario gMock;

uint32_t gLastLinkCheck = 0;
uint32_t gSetupStartUs = 0;
uint32_t gHeapBeforeCanvas = 0;
uint32_t gLastDiagnosticMs = 0;
uint32_t gLastPushCount = 0;

// Survives software resets, not power loss. A magic value distinguishes a real
// counter from uninitialised RTC memory on a cold boot.
RTC_NOINIT_ATTR uint32_t gBootMagic;
RTC_NOINIT_ATTR uint32_t gBootCount;
RTC_NOINIT_ATTR uint32_t gUnexpectedBoots;
constexpr uint32_t kBootMagicValue = 0xB0D1C0DEu;

const char* resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON:
      return "poweron";
    case ESP_RST_EXT:
      return "external";
    case ESP_RST_SW:
      return "software";
    case ESP_RST_PANIC:
      return "panic";
    case ESP_RST_INT_WDT:
      return "int_wdt";
    case ESP_RST_TASK_WDT:
      return "task_wdt";
    case ESP_RST_WDT:
      return "wdt";
    case ESP_RST_DEEPSLEEP:
      return "deepsleep";
    case ESP_RST_BROWNOUT:
      return "brownout";
    default:
      return "unknown";
  }
}

bool isUnexpected(esp_reset_reason_t reason) {
  return reason == ESP_RST_PANIC || reason == ESP_RST_INT_WDT ||
         reason == ESP_RST_TASK_WDT || reason == ESP_RST_WDT ||
         reason == ESP_RST_BROWNOUT;
}

void emitDiagnostic(uint32_t now, bool boot, uint32_t bootUs) {
#if defined(BUDDY_DIAGNOSTICS) && BUDDY_DIAGNOSTICS
  // Never let diagnostics block the animation loop when no host is reading.
  if (Serial.availableForWrite() < 220) {
    return;
  }

  const uint32_t window = now - gLastDiagnosticMs;
  uint32_t fps = 0;
  if (!boot && window > 0) {
    fps = (gScreens.pushCount() - gLastPushCount) * 1000u / window;
  }

  Serial.printf(
      "BUDDY-DIAG boot=%lu reset=%s unexpected=%lu heap=%lu min=%lu maxblk=%lu "
      "fps=%lu push=%lu render_avg_us=%lu render_max_us=%lu gesture_ms=%lu "
      "screen=%u state=%u\n",
      static_cast<unsigned long>(gBootCount), resetReasonName(esp_reset_reason()),
      static_cast<unsigned long>(gUnexpectedBoots),
      static_cast<unsigned long>(ESP.getFreeHeap()),
      static_cast<unsigned long>(ESP.getMinFreeHeap()),
      static_cast<unsigned long>(ESP.getMaxAllocHeap()),
      static_cast<unsigned long>(fps),
      static_cast<unsigned long>(gScreens.pushCount()),
      static_cast<unsigned long>(gScreens.renderAvgUs()),
      static_cast<unsigned long>(gScreens.renderMaxUs()),
      static_cast<unsigned long>(gTouch.lastLatencyMs()),
      static_cast<unsigned>(gScreens.screen()),
      static_cast<unsigned>(gState.state()));

  if (boot) {
    Serial.printf(
        "BUDDY-DIAG stage=canvas heap_before=%lu heap_after=%lu canvas_delta=%lu "
        "boot_us=%lu\n",
        static_cast<unsigned long>(gHeapBeforeCanvas),
        static_cast<unsigned long>(ESP.getFreeHeap()),
        static_cast<unsigned long>(gHeapBeforeCanvas - ESP.getFreeHeap()),
        static_cast<unsigned long>(bootUs));
  }

  gScreens.resetRenderStats();
  gLastPushCount = gScreens.pushCount();
  gLastDiagnosticMs = now;
#else
  (void)now;
  (void)boot;
  (void)bootUs;
#endif
}

void refreshLink(uint32_t now) {
  if (now - gLastLinkCheck < 500) {
    return;
  }
  gLastLinkCheck = now;

  // Phase 1 has no bridge and no protocol parser, so bridge and OpenCode stay
  // UNKNOWN rather than being optimistically reported as connected.
  gState.setLink(gSerial.hostConnected() ? buddy::LinkState::Connected
                                         : buddy::LinkState::Disconnected,
                 buddy::BridgeState::Unknown, buddy::OpenCodeState::Unknown);
}

}  // namespace

void setup() {
  gSetupStartUs = micros();

  const esp_reset_reason_t reason = esp_reset_reason();
  if (gBootMagic != kBootMagicValue) {
    gBootMagic = kBootMagicValue;
    gBootCount = 0;
    gUnexpectedBoots = 0;
  }
  ++gBootCount;
  if (isUnexpected(reason)) {
    ++gUnexpectedBoots;
  }

  gSerial.begin();
  gTouch.begin();
  gPreferences.begin();

  gHeapBeforeCanvas = ESP.getFreeHeap();
  if (!gDisplay.begin()) {
    // Without a canvas there is nothing safe to draw. The board stays alive and
    // reports the failure on the next diagnostic line.
    gState.begin(millis());
    gState.setDiagnostic("E_INTERNAL");
    emitDiagnostic(millis(), true, micros() - gSetupStartUs);
    return;
  }

  const uint32_t now = millis();
  gState.begin(now);
  gAnimation.begin(now);
  gScreens.begin(&gDisplay, &gState, &gPreferences, &gAnimation, &gFace);

  buddy::Versions versions;
  versions.protocol = 1;
  gState.setVersions(versions);
  gState.setModel("mock-deepseek");
  gState.setAgent("build");
  gState.setDiagnostic("--");

#if defined(BUDDY_MOCK_MODE) && BUDDY_MOCK_MODE
  gMock.begin(now, gState);
#endif

  refreshLink(now);
  gScreens.update(now);

  emitDiagnostic(millis(), true, micros() - gSetupStartUs);
}

void loop() {
  const uint32_t now = millis();

  gSerial.poll(now);

  const buddy::Gesture gesture = gTouch.poll(now);
  if (gesture != buddy::Gesture::None) {
    gScreens.onGesture(gesture, now);
  }

  refreshLink(now);

#if defined(BUDDY_BENCH_COMMANDS) && BUDDY_BENCH_COMMANDS
  if (gSerial.takeRestartRequest()) {
    Serial.printf("BUDDY-DIAG action=restart\n");
    Serial.flush();
    ESP.restart();
  }
  if (gSerial.takeDiagnosticRequest()) {
    emitDiagnostic(now, false, 0);
  }
#endif

#if defined(BUDDY_MOCK_MODE) && BUDDY_MOCK_MODE
  gMock.tick(now, gState);
#endif

  gState.tick(now);
  gAnimation.tick(now, gState.state(), gPreferences.quietMode());
  gScreens.update(now);

  if (now - gLastDiagnosticMs >= 5000) {
    emitDiagnostic(now, false, 0);
  }

  // Yield to the RTOS scheduler. This is not a timing mechanism: every interval
  // above is measured with millis().
  delay(1);
}
