#pragma once

// Mock GPIO surface for the host gesture test.
constexpr int HIGH = 1;
constexpr int INPUT_PULLDOWN = 0;
int digitalRead(int pin);
void pinMode(int pin, int mode);
