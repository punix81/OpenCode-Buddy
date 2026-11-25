#pragma once
#include "BuddyFace.h"
#include "StateManager.h"

namespace buddy::ui {
void drawScreen(Canvas& g, ScreenId screen, const StateManager& data, const BuddyFace& face,
                const MotionFrame& motion, const char* toast, uint32_t pageAge);
}
