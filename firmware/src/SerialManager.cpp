#include "SerialManager.h"

#include <Arduino.h>

#include <cstring>

namespace buddy {

namespace {
constexpr char kRestartCommand[] = "BUDDY-RESTART";
constexpr char kDiagnosticCommand[] = "BUDDY-DIAG";
}  // namespace

void SerialManager::begin() {
  // Matches the reference firmware: 1024-byte driver buffer, 115 200 baud.
  // The ESP32-C3 native USB CDC ignores the baud rate, but the host expects one.
  Serial.setRxBufferSize(1024);
  Serial.begin(115200);
}

void SerialManager::poll(uint32_t /*now*/) {
  while (Serial.available() > 0) {
    const int value = Serial.read();
    if (value < 0) {
      return;
    }
    const char byte = static_cast<char>(value);

    if (byte == '\n') {
      if (!discard_ && length_ > 0) {
        ++lines_;
        if (length_ == sizeof(kRestartCommand) - 1 &&
            memcmp(line_, kRestartCommand, length_) == 0) {
          restartRequested_ = true;
        } else if (length_ == sizeof(kDiagnosticCommand) - 1 &&
                   memcmp(line_, kDiagnosticCommand, length_) == 0) {
          diagnosticRequested_ = true;
        }
      }
      length_ = 0;
      discard_ = false;
    } else if (byte != '\r' && !discard_) {
      if (length_ >= sizeof(line_)) {
        discard_ = true;
        ++overflows_;
      } else {
        line_[length_++] = byte;
      }
    }
  }
}

bool SerialManager::hostConnected() const {
  // The CDC object reports whether a host has the port open. This is the only
  // USB property the firmware can observe; cable speed and DTR state are not
  // exposed and are therefore never displayed.
  return static_cast<bool>(Serial);
}

bool SerialManager::takeRestartRequest() {
  const bool requested = restartRequested_;
  restartRequested_ = false;
  return requested;
}

bool SerialManager::takeDiagnosticRequest() {
  const bool requested = diagnosticRequested_;
  diagnosticRequested_ = false;
  return requested;
}

}  // namespace buddy
