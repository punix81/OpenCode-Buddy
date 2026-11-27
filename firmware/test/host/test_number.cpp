// Boundary tests for the compact SI-style number formatting.
#include <cstdio>
#include <cstring>

#include "Format.h"

namespace {

int failures = 0;

void expect(uint64_t value, bool known, const char* expected) {
  char out[24] = {0};
  buddy::ui::number(value, known, out);
  if (strcmp(out, expected) != 0) {
    std::fprintf(stderr, "FAIL value=%llu known=%d expected=%s actual=%s\n",
                 static_cast<unsigned long long>(value), known ? 1 : 0, expected, out);
    ++failures;
  }
}

}  // namespace

int main() {
  expect(0, false, "--");
  expect(0, true, "0");
  expect(1, true, "1");
  expect(999, true, "999");
  expect(1000, true, "1.0k");
  expect(1049, true, "1.0k");
  expect(1050, true, "1.1k");
  expect(1499, true, "1.5k");
  expect(18400, true, "18.4k");
  expect(949999, true, "950.0k");
  expect(950000, true, "950.0k");
  expect(999949, true, "999.9k");
  expect(999950, true, "1.0M");
  expect(999999, true, "1.0M");
  expect(1000000, true, "1.0M");
  expect(4300000, true, "4.3M");
  expect(4294967295ULL, true, "4.3B");
  expect(8589934590ULL, true, "8.6B");
  expect(999999999999ULL, true, "1000.0B");
  if (failures != 0) {
    std::fprintf(stderr, "number tests: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("number formatting: PASS\n");
  return 0;
}
