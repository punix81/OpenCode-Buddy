#include <Arduino.h>
#include <Esp.h>
#include <esp_attr.h>
#include <esp_system.h>

#include "AnimationEngine.h"
#include "BuddyFace.h"
#include "Config.h"
#include "DisplayManager.h"
#include "FrameWriter.h"
#include "PreferencesManager.h"
#include "ProtocolParser.h"
#include "ScreenManager.h"
#include "SerialManager.h"
#include "TxBuffer.h"
#include "StateManager.h"
#include "TouchManager.h"

#if defined(BUDDY_MOCK_MODE) && BUDDY_MOCK_MODE
#include "MockScenario.h"
#endif

namespace {

buddy::DisplayManager gDisplay;
buddy::PreferencesManager gPreferences;
buddy::SerialManager gSerial;
buddy::StateManager gState;
buddy::TouchManager gTouch;
buddy::AnimationEngine gAnimation;
buddy::BuddyFace gFace;
buddy::ScreenManager gScreens;
buddy::ProtocolParser gProtocol;

#if defined(BUDDY_MOCK_MODE) && BUDDY_MOCK_MODE
buddy::MockScenario gMock;
#endif

char gLine[buddy::kSerialLineMax + 1];
char gOut[320];

// The serial driver, wrapped as a FrameSink for the bounded TX buffer.
class SerialSink : public buddy::FrameSink {
 public:
  int availableForWrite() override { return Serial.availableForWrite(); }
  size_t write(const char* data, size_t length) override {
    return Serial.write(reinterpret_cast<const uint8_t*>(data), length);
  }
};

SerialSink gSink;
constexpr size_t kTxCapacity = 2048;
char gTxStorage[kTxCapacity];
buddy::TxBuffer gTx(gTxStorage, sizeof(gTxStorage));
buddy::FrameWriter gWriter(gTx);

// Retries the bytes a previous partial Serial.write could not accept. One call
// per loop, bounded by Serial.availableForWrite(): never blocking.
void flushTx() { gTx.flush(gSink); }

uint32_t gLastLinkCheck = 0;
uint32_t gLastHeartbeat = 0;
uint32_t gLastHello = 0;
uint32_t gSetupStartUs = 0;
uint32_t gHeapBeforeCanvas = 0;
uint32_t gHeapAfterCanvas = 0;
uint32_t gBootUs = 0;
uint32_t gLastDiagnosticMs = 0;
uint32_t gLastPushCount = 0;
uint32_t gErrorWindowStart = 0;
uint8_t gErrorCount = 0;

RTC_NOINIT_ATTR uint32_t gBootMagic;
RTC_NOINIT_ATTR uint32_t gBootCount;
constexpr uint32_t kBootMagicValue = 0xB0D1C0DEu;

const char* resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "poweron";
    case ESP_RST_EXT: return "external";
    case ESP_RST_SW: return "software";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT: return "int_wdt";
    case ESP_RST_TASK_WDT: return "task_wdt";
    case ESP_RST_WDT: return "wdt";
    case ESP_RST_DEEPSLEEP: return "deepsleep";
    case ESP_RST_BROWNOUT: return "brownout";
    default: return "unknown";
  }
}

void sendEncoded(size_t length) {
  // The frame and its newline are copied atomically into the TX buffer; the
  // serial flush retries any partial write on the next loop.
  gWriter.send(gOut, length, sizeof(gOut));
}

void sendHello(uint32_t now) {
  gProtocol.resetSession();
  sendEncoded(gProtocol.encodeHello(gOut, sizeof(gOut)));
  gLastHeartbeat = now;
  gLastHello = now;
}

void sendHeartbeat(uint32_t now) {
  sendEncoded(gProtocol.encodeHeartbeat(gOut, sizeof(gOut)));
  gLastHeartbeat = now;
}

bool allowError(uint32_t now) {
  if (now - gErrorWindowStart > 10000) {
    gErrorWindowStart = now;
    gErrorCount = 0;
  }
  if (gErrorCount >= 5) {
    return false;
  }
  ++gErrorCount;
  return true;
}

void sendError(uint32_t now, const char* code, bool fatal, const char* detail) {
  if (!allowError(now)) {
    return;
  }
  sendEncoded(gProtocol.encodeError(gOut, sizeof(gOut), code, fatal, detail));
}

void flushProtocol(uint32_t now) {
  uint32_t ack = 0;
  if (gProtocol.takeAck(ack)) {
    const char* warning = nullptr;
    gProtocol.takeWarning(warning);
    sendEncoded(gProtocol.encodeAck(gOut, sizeof(gOut), ack, warning));
  }

  buddy::ProtocolConfig config;
  if (gProtocol.takeConfig(config) && config.valid) {
    if (config.languageSet) gPreferences.setLanguage(config.language);
    if (config.quietSet) gPreferences.setQuietMode(config.quiet);
    buddy::GestureTimings timings;
    timings.debounceMs = config.debounceMs;
    timings.doubleWindowMs = config.doublePressWindowMs;
    timings.longMs = config.longPressMs;
    timings.veryLongMs = config.veryLongPressMs;
    gTouch.setTimings(timings);
    gScreens.setAutoReturnSeconds(config.autoReturnSeconds);
    gState.setConfigMock(config.mock);
  }

  uint32_t expected = 0;
  uint32_t received = 0;
  if (gProtocol.takeResync(expected, received)) {
    sendEncoded(gProtocol.encodeResync(gOut, sizeof(gOut), "seq_gap", expected, received));
  }

  char code[12] = {0};
  char detail[49] = {0};
  bool fatal = false;
  if (gProtocol.takeError(code, sizeof(code), fatal, detail, sizeof(detail))) {
    sendError(now, code, fatal, detail);
  }
}

void refreshUsb(uint32_t now) {
  if (now - gLastLinkCheck < 500) {
    return;
  }
  gLastLinkCheck = now;

  const bool connected = gSerial.hostConnected();
  if (!connected) {
    gState.setLink(buddy::LinkState::Disconnected, buddy::BridgeState::Unknown,
                   buddy::OpenCodeState::Unknown);
    if (gState.state() != buddy::BuddyState::Offline) {
      gState.setState(buddy::BuddyState::Offline, now);
    }
    return;
  }
  gState.setLink(buddy::LinkState::Connected, gState.bridge(), gState.opencode());
}

void applyLinkTimeout(uint32_t now) {
  if (!gProtocol.linkReady()) {
    return;
  }
  if (now - gProtocol.lastRxMs() <= buddy::kLinkTimeoutMs) {
    return;
  }
  if (gState.bridge() != buddy::BridgeState::Degraded) {
    gState.setLink(gState.usb(), buddy::BridgeState::Degraded, buddy::OpenCodeState::Unknown);
    if (gState.state() != buddy::BuddyState::Offline) {
      gState.setState(buddy::BuddyState::Offline, now);
    }
  }
}

buddy::InteractionGesture mapGesture(buddy::Gesture gesture) {
  switch (gesture) {
    case buddy::Gesture::Short: return buddy::InteractionGesture::Short;
    case buddy::Gesture::Double: return buddy::InteractionGesture::Double;
    case buddy::Gesture::Long: return buddy::InteractionGesture::Long;
    case buddy::Gesture::VeryLong: return buddy::InteractionGesture::VeryLong;
    default: return buddy::InteractionGesture::Short;
  }
}

void emitDiagnostic(uint32_t now, bool boot, uint32_t bootUs) {
#if defined(BUDDY_DIAGNOSTICS) && BUDDY_DIAGNOSTICS
  if (Serial.availableForWrite() < 220) {
    return;
  }
  const uint32_t window = now - gLastDiagnosticMs;
  uint32_t fps = 0;
  if (!boot && window > 0) {
    fps = (gScreens.pushCount() - gLastPushCount) * 1000u / window;
  }
  Serial.printf(
      "BUDDY-DIAG boot=%lu reset=%s heap=%lu min=%lu maxblk=%lu fps=%lu push=%lu "
      "render_avg_us=%lu render_max_us=%lu gesture_ms=%lu touch_edges=%lu screen=%u state=%u "
      "dropped=%lu sent=%lu maxframe=%lu txfree=%d rxavail=%d\n",
      static_cast<unsigned long>(gBootCount), resetReasonName(esp_reset_reason()),
      static_cast<unsigned long>(ESP.getFreeHeap()),
      static_cast<unsigned long>(ESP.getMinFreeHeap()),
      static_cast<unsigned long>(ESP.getMaxAllocHeap()), static_cast<unsigned long>(fps),
      static_cast<unsigned long>(gScreens.pushCount()),
      static_cast<unsigned long>(gScreens.renderAvgUs()),
      static_cast<unsigned long>(gScreens.renderMaxUs()),
      static_cast<unsigned long>(gTouch.lastLatencyMs()),
      static_cast<unsigned long>(gTouch.rawEdges()),
      static_cast<unsigned>(gScreens.screen()), static_cast<unsigned>(gState.state()),
      static_cast<unsigned long>(gWriter.droppedNoSpace() + gWriter.droppedPartial() +
                                   gWriter.droppedTooLong()),
      static_cast<unsigned long>(gWriter.sent()), static_cast<unsigned long>(gWriter.maxFrame()),
      Serial.availableForWrite(), Serial.available());
  if (boot) {
    Serial.printf("BUDDY-DIAG stage=canvas heap_before=%lu heap_after=%lu canvas_delta=%lu boot_us=%lu\n",
                  static_cast<unsigned long>(gHeapBeforeCanvas),
                  static_cast<unsigned long>(gHeapAfterCanvas),
                  static_cast<unsigned long>(gHeapBeforeCanvas - gHeapAfterCanvas),
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

}  // namespace

void setup() {
  gSetupStartUs = micros();

  // The core allocates a 256-byte USB CDC RX queue. A full-screen render blocks
  // the loop for tens of milliseconds, which overflows that queue and loses
  // bytes mid-frame (observed on hardware as E_PARSE + resync). Enlarge it before
  // anything else runs.
  Serial.setRxBufferSize(1024);

  const esp_reset_reason_t reason = esp_reset_reason();
  if (gBootMagic != kBootMagicValue) {
    gBootMagic = kBootMagicValue;
    gBootCount = 0;
  }
  ++gBootCount;
  (void)reason;

  gSerial.begin();
  gTouch.begin();
  gPreferences.begin();

  gHeapBeforeCanvas = ESP.getFreeHeap();
  const bool displayReady = gDisplay.begin();
  gHeapAfterCanvas = ESP.getFreeHeap();
  if (!displayReady) {
    gState.begin(millis());
    gState.setDiagnostic("E_INTERNAL");
    return;
  }

  const uint32_t now = millis();
  gState.begin(now);
  gAnimation.begin(now);
  gScreens.begin(&gDisplay, &gState, &gPreferences, &gAnimation, &gFace);

  buddy::Versions versions;
  snprintf(versions.firmware, sizeof(versions.firmware), "%s", buddy::kFirmwareVersion);
  versions.protocol = buddy::kProtocolMajor;
  versions.bridgeKnown = false;
  gState.setVersions(versions);
  gState.setLink(buddy::LinkState::Disconnected, buddy::BridgeState::Unknown,
                 buddy::OpenCodeState::Unknown);
  gState.setState(buddy::BuddyState::Offline, now);

  gProtocol.begin(gBootCount, buddy::kFirmwareVersion);
  sendHello(now);

#if defined(BUDDY_MOCK_MODE) && BUDDY_MOCK_MODE
  gMock.begin(now, gState);
#endif

  gScreens.update(now);
  gBootUs = micros() - gSetupStartUs;
  emitDiagnostic(millis(), true, gBootUs);
}

void loop() {
  const uint32_t now = millis();

  if (gProtocol.fatalVersion()) {
    gState.tick(now);
    gAnimation.tick(now, gState.state(), gPreferences.quietMode());
    gScreens.update(now);
    delay(1);
    return;
  }

  // A device that boots before the host opens its port receives a fragment of
  // its own USB CDC transmission. Those bytes cannot come from a host, so drop
  // them instead of mixing them into the first ready/config line.
  if (!gSerial.hostConnected()) {
    gSerial.discardInput();
  }

  while (true) {
    size_t length = 0;
    if (!gSerial.readLine(gLine, sizeof(gLine), length)) {
      break;
    }

#if defined(BUDDY_BENCH_COMMANDS) && BUDDY_BENCH_COMMANDS
    if (strcmp(gLine, "BUDDY-RESTART") == 0) {
      Serial.flush();
      ESP.restart();
    }
    if (strcmp(gLine, "BUDDY-DIAG") == 0) {
      emitDiagnostic(now, true, gBootUs);
      continue;
    }
#endif

    const buddy::ParseCode code = gProtocol.handleLine(gLine, length, now, gState);
    switch (code) {
      case buddy::ParseCode::ParseError:
        sendError(now, "E_PARSE", false, "invalid message");
        break;
      case buddy::ParseCode::TooLong:
        sendError(now, "E_TOO_LONG", false, "line too long");
        break;
      case buddy::ParseCode::UnknownType:
        sendError(now, "E_UNKNOWN_TYPE", false, "unknown type");
        break;
      case buddy::ParseCode::VersionError:
        sendError(now, "E_VERSION", true, "unsupported protocol");
        gState.setDiagnostic("E_VERSION");
        break;
      case buddy::ParseCode::BoundsError:
        sendError(now, "E_BOUNDS", false, "value out of range");
        break;
      default:
        break;
    }
    flushProtocol(now);
  }

  if (gSerial.takeOverflow()) {
    sendError(now, "E_TOO_LONG", false, "line too long");
  }

  const bool bridgeAbsent =
      !gProtocol.linkReady() || now - gProtocol.lastRxMs() > buddy::kLinkTimeoutMs;
  if (bridgeAbsent && now - gLastHello >= buddy::kHelloIntervalMs) {
    sendHello(now);
  }

  if (now - gLastHeartbeat >= buddy::kHeartbeatMs) {
    sendHeartbeat(now);
  }

  const buddy::Gesture gesture = gTouch.poll(now);
  if (gesture != buddy::Gesture::None) {
    gScreens.onGesture(gesture, now);
    sendEncoded(gProtocol.encodeInteraction(gOut, sizeof(gOut), mapGesture(gesture),
                                            static_cast<uint8_t>(gScreens.screen())));
  }

  refreshUsb(now);
  applyLinkTimeout(now);

#if defined(BUDDY_MOCK_MODE) && BUDDY_MOCK_MODE
  gMock.tick(now, gState);
#endif

  gState.tick(now);
  gAnimation.tick(now, gState.state(), gPreferences.quietMode());
  gScreens.update(now);

  if (now - gLastDiagnosticMs >= 5000) {
    emitDiagnostic(now, false, 0);
  }

  flushTx();
  delay(1);
}
