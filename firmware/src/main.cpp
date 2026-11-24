#include <Arduino.h>

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
  gSerial.begin();
  gTouch.begin();
  gPreferences.begin();

  if (!gDisplay.begin()) {
    // Without a canvas there is nothing safe to draw. The board stays alive and
    // the diagnostic is shown on the System screen if the canvas appears later.
    gState.begin(millis());
    gState.setDiagnostic("E_INTERNAL");
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
}

void loop() {
  const uint32_t now = millis();

  gSerial.poll(now);

  const buddy::Gesture gesture = gTouch.poll(now);
  if (gesture != buddy::Gesture::None) {
    gScreens.onGesture(gesture, now);
  }

  refreshLink(now);

#if defined(BUDDY_MOCK_MODE) && BUDDY_MOCK_MODE
  gMock.tick(now, gState);
#endif

  gState.tick(now);
  gAnimation.tick(now, gState.state(), gPreferences.quietMode());
  gScreens.update(now);

  // Yield to the RTOS scheduler. This is not a timing mechanism: every interval
  // above is measured with millis().
  delay(1);
}
