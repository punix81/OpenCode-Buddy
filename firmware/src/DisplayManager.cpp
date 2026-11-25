#include "DisplayManager.h"
#include "Theme.h"

namespace buddy {

bool DisplayManager::begin() {
  panel_.init();
  panel_.setRotation(kDisplayRotation);
  panel_.fillScreen(panel_.color565(8,14,25));

  if (!ui::initCanvas(canvas_)) {
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
