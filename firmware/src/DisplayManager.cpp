#include "DisplayManager.h"

namespace buddy {

bool DisplayManager::begin() {
  panel_.init();
  panel_.setRotation(0);
  panel_.fillScreen(0);

  canvas_.setColorDepth(8);
  if (canvas_.createSprite(kCanvasSize, kCanvasSize) == nullptr) {
    ready_ = false;
    return false;
  }

  canvas_.fillScreen(0);
  ready_ = true;
  push();
  return true;
}

void DisplayManager::push() {
  if (ready_) {
    canvas_.pushSprite(kCanvasX, kCanvasY);
  }
}

}  // namespace buddy
