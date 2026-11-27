#pragma once

#include <cstdint>

namespace buddy::ui {

// Compact SI-style formatting for the display: integers below 1000, then one
// decimal with k/M/B. An unknown value is "--". Kept free of LovyanGFX so the
// host tests can execute every boundary.
void number(uint64_t value, bool known, char (&out)[24]);

}  // namespace buddy::ui
