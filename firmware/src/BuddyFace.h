#pragma once

#include <LovyanGFX.hpp>

#include "BuddyState.h"
#include "AnimationEngine.h"

namespace buddy {

// Procedural face. All expressions share the same eye positions and geometry so
// the character stays recognisable; states differ by shape, label and motion,
// never by colour alone.
class BuddyFace {
 public:
  void draw(lgfx::LGFX_Sprite& g, BuddyState state, const BuddyMetrics& metrics,
            const MotionFrame& motion);

 private:
  void drawRing(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t color,
                const MotionFrame& motion) const;
  void drawEyes(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t color, bool blink,
                uint32_t elapsed) const;
  void drawMouth(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t color) const;
  void drawParticles(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t color,
                     const MotionFrame& motion) const;
  void drawBadge(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t color) const;
};

}  // namespace buddy
