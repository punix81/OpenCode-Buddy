#include "SerialManager.h"

#include <Arduino.h>

namespace buddy {

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

}  // namespace buddy
