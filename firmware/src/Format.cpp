#include "Format.h"

#include <cstdio>
#include <cstring>

namespace buddy::ui {

void number(uint64_t value, bool known, char (&out)[24]) {
  if (!known) {
    strcpy(out, "--");
    return;
  }
  const char suffix[] = " kMB";
  unsigned unit = 0;
  uint64_t scale = 1;
  while (unit < 3 && value >= 1000 * scale - scale / 20) {
    scale *= 1000;
    ++unit;
  }
  if (!unit) {
    snprintf(out, sizeof(out), "%u", static_cast<unsigned>(value));
    return;
  }
  const unsigned tenths = static_cast<unsigned>((10 * value + scale / 2) / scale);
  snprintf(out, sizeof(out), "%u.%u%c", tenths / 10, tenths % 10, suffix[unit]);
}

}  // namespace buddy::ui
