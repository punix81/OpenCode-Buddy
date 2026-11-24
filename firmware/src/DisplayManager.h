#pragma once

#include <LovyanGFX.hpp>

#include "Config.h"
#include "DisplayPanel.h"

namespace buddy {

// Owns the panel and the single 8-bit canvas.
//
// One 220 x 220 canvas (48 400 bytes) is used instead of a 16-bit double buffer
// (115 200 bytes). The canvas covers the whole visible disc, so a frame is one
// contiguous push with no tearing; dashboards are pushed only when they change.
class DisplayManager {
 public:
  bool begin();

  lgfx::LGFX_Sprite& canvas() { return canvas_; }
  lgfx::LovyanGFX& panel() { return panel_; }

  void push();
  bool ready() const { return ready_; }

 private:
  DisplayPanel panel_;
  lgfx::LGFX_Sprite canvas_{&panel_};
  bool ready_ = false;
};

}  // namespace buddy
