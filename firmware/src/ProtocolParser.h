#pragma once

#include <cstddef>
#include <cstdint>

#include "BuddyState.h"
#include "Config.h"
#include "StateManager.h"

namespace buddy {

enum class ParseCode : uint8_t {
  Ok = 0,
  Ignored,
  Duplicate,
  Gap,
  ParseError,
  TooLong,
  UnknownType,
  VersionError,
  BoundsError,
  InternalError,
};

enum class InteractionGesture : uint8_t { Short = 0, Double, Long, VeryLong };

struct ProtocolConfig {
  bool valid = false;
  // Absent fields mean "keep the device preference": the host does not own the
  // quiet mode or the language unless it explicitly overrides them.
  bool languageSet = false;
  bool quietSet = false;
  uint8_t language = 0;
  bool quiet = false;
  uint16_t autoReturnSeconds = 60;
  uint16_t debounceMs = kDebounceMs;
  uint16_t doublePressWindowMs = kDoublePressWindowMs;
  uint16_t longPressMs = kLongPressMs;
  uint16_t veryLongPressMs = kVeryLongPressMs;
  bool mock = false;
};

// NDJSON protocol parser and encoder.
//
// This class has no Arduino dependency: it parses into a temporary structure,
// validates everything, then applies the result atomically. An invalid message
// therefore never corrupts the current state. Serial I/O stays in
// SerialManager and main.
class ProtocolParser {
 public:
  void begin(uint32_t bootCount, const char* firmwareVersion);
  void resetOutbound();
  // Starts a new bridge-link session from the device side: the outbound
  // sequence restarts at 1 and the next peer message may legitimately be 1.
  void resetSession();

  ParseCode handleLine(const char* line, size_t length, uint32_t now, StateManager& state);

  bool linkReady() const { return ready_; }
  bool fatalVersion() const { return fatal_; }
  uint32_t lastRxMs() const { return lastRxMs_; }
  uint32_t bootCount() const { return boot_; }
  // Frames recovered after an invalid prefix (USB CDC self-reception at boot).
  uint32_t framingResyncs() const { return framingResyncs_; }

  bool takeAck(uint32_t& ack);
  bool takeWarning(const char*& code);
  bool takeConfig(ProtocolConfig& config);
  bool takeResync(uint32_t& expected, uint32_t& received);
  bool takeError(char* code, size_t capacity, bool& fatal, char* detail, size_t detailCapacity);

  size_t encodeHello(char* out, size_t capacity);
  size_t encodeHeartbeat(char* out, size_t capacity);
  size_t encodeAck(char* out, size_t capacity, uint32_t ack, const char* warning);
  size_t encodeInteraction(char* out, size_t capacity, InteractionGesture gesture, uint8_t screen);
  size_t encodeResync(char* out, size_t capacity, const char* reason, uint32_t expected,
                      uint32_t received);
  size_t encodeError(char* out, size_t capacity, const char* code, bool fatal, const char* detail);

 private:
  uint32_t nextSeq();

  uint32_t outSeq_ = 0;
  uint32_t lastPeerSeq_ = 0;
  bool awaitingSnapshot_ = false;
  bool ready_ = false;
  bool fatal_ = false;
  uint32_t lastRxMs_ = 0;
  uint32_t boot_ = 0;
  uint32_t framingResyncs_ = 0;
  char firmware_[16] = "0.2.0";

  bool ackPending_ = false;
  uint32_t ackValue_ = 0;
  bool warningPending_ = false;
  const char* warningCode_ = nullptr;

  bool configPending_ = false;
  ProtocolConfig config_;

  bool resyncPending_ = false;
  uint32_t resyncExpected_ = 0;
  uint32_t resyncReceived_ = 0;

  bool errorPending_ = false;
  char errorCode_[12] = {0};
  bool errorFatal_ = false;
  char errorDetail_[49] = {0};
};

}  // namespace buddy
