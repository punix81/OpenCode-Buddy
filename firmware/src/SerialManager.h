#pragma once

#include <cstddef>
#include <cstdint>

#include "Config.h"

namespace buddy {

// USB CDC transport with bounded, non-blocking line framing.
//
// Phase 1 scope: this class owns the port and the framing only. It deliberately
// does not interpret messages — protocol handlers are Phase 2 work. Lines are
// counted and discarded so a future parser can be added without changing the
// buffering or overflow behaviour. Nothing here claims to understand JSON.
class SerialManager {
 public:
  void begin();
  void poll(uint32_t now);

  uint32_t linesReceived() const { return lines_; }
  uint32_t overflows() const { return overflows_; }
  bool hostConnected() const;

 private:
  char line_[kSerialLineMax] = {0};
  size_t length_ = 0;
  bool discard_ = false;
  uint32_t lines_ = 0;
  uint32_t overflows_ = 0;
};

}  // namespace buddy
