#pragma once

#include <cstddef>
#include <cstdint>

#include "Config.h"

namespace buddy {

// USB CDC transport with bounded, non-blocking line framing.
//
// It owns the port and the framing only; interpretation belongs to
// ProtocolParser. A line longer than kSerialLineMax is discarded up to the next
// newline and reported once through takeOverflow().
class SerialManager {
 public:
  void begin();

  // Returns one complete line (without CR/LF) when available. The caller must
  // provide a buffer of at least kSerialLineMax + 1 bytes. Non-blocking.
  bool readLine(char* out, size_t capacity, size_t& length);

  uint32_t linesReceived() const { return lines_; }
  uint32_t overflows() const { return overflows_; }
  bool hostConnected() const;

  // True once after an oversized line was discarded.
  bool takeOverflow();

 private:
  char line_[kSerialLineMax + 1] = {0};
  size_t length_ = 0;
  bool discard_ = false;
  bool overflowPending_ = false;
  uint32_t lines_ = 0;
  uint32_t overflows_ = 0;
};

}  // namespace buddy
