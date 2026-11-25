#pragma once
#include "AnimationEngine.h"
#include "Theme.h"

namespace buddy {
class BuddyFace {
 public:
  void draw(ui::Canvas& g, BuddyState state, const BuddyMetrics& metrics,
            const MotionFrame& motion) const;
};
}
