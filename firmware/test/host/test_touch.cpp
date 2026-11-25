#include "TouchManager.h"
#include "Arduino.h"
#include <cassert>
#include <cstdio>

namespace {
int mockLevel = 0;
}

int digitalRead(int pin) {
  assert(pin == buddy::kTouchPin);
  return mockLevel;
}

void pinMode(int pin, int mode) {
  assert(pin == buddy::kTouchPin && mode == INPUT_PULLDOWN);
}

int main() {
  using buddy::Gesture;
  buddy::TouchManager touch;
  touch.begin();
  auto edge = [&](int level, unsigned at) {
    mockLevel = level;
    assert(touch.poll(at) == Gesture::None);
    return touch.poll(at + buddy::kDebounceMs);
  };
  assert(edge(1, 100) == Gesture::None);
  assert(edge(0, 180) == Gesture::None);
  assert(touch.poll(566) == Gesture::Short);
  assert(edge(1, 700) == Gesture::None);
  assert(edge(0, 800) == Gesture::None);
  assert(edge(1, 900) == Gesture::None);
  assert(edge(0, 1000) == Gesture::Double);
  assert(edge(1, 1500) == Gesture::None);
  assert(edge(0, 3200) == Gesture::Long);
  assert(edge(1, 4000) == Gesture::None);
  assert(touch.poll(9035) == Gesture::VeryLong);
  assert(edge(0, 9200) == Gesture::None);
  assert(touch.poll(10000) == Gesture::None);
  puts("firmware gestures with mock GPIO: PASS");
}
