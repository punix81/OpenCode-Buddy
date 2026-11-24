#include "SerialManager.h"

#include <Arduino.h>

#include <cstring>

namespace buddy {

void SerialManager::begin() {
  // Native USB CDC: the host expects a baud rate, the peripheral ignores it.
  Serial.setRxBufferSize(1024);
  Serial.begin(115200);
}

bool SerialManager::readLine(char* out, size_t capacity, size_t& length) {
  if (out == nullptr || capacity < kSerialLineMax + 1) {
    return false;
  }

  while (Serial.available() > 0) {
    const int value = Serial.read();
    if (value < 0) {
      return false;
    }
    const char byte = static_cast<char>(value);

    if (byte == '\n') {
      if (discard_) {
        discard_ = false;
        length_ = 0;
        overflowPending_ = true;
        continue;
      }
      if (length_ == 0) {
        continue;
      }
      memcpy(out, line_, length_);
      out[length_] = '\0';
      length = length_;
      length_ = 0;
      ++lines_;
      return true;
    }

    if (byte == '\r' || discard_) {
      continue;
    }

    if (length_ >= kSerialLineMax - 1) {
      discard_ = true;
      ++overflows_;
      continue;
    }
    line_[length_++] = byte;
  }
  return false;
}

bool SerialManager::hostConnected() const {
  // The CDC object reports whether a host has the port open. This is the only
  // USB property the firmware can observe; cable speed and DTR state are not
  // exposed and are therefore never displayed.
  return static_cast<bool>(Serial);
}

bool SerialManager::takeOverflow() {
  const bool pending = overflowPending_;
  overflowPending_ = false;
  return pending;
}

}  // namespace buddy
