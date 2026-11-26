#pragma once
#include <LovyanGFX.hpp>
#include "BuddyState.h"

namespace buddy::ui {
using Canvas = lgfx::LGFX_Sprite;
enum Ink : uint8_t { Night, Surface, Raised, Border, Muted, White, Mint, Blue, Cyan,
                     Violet, Amber, Coral, Orange, Aqua, Slate, Lilac, Sand, InkCount };
constexpr uint32_t colors[] = {0x080e19,0x101827,0x182334,0x324055,0x9cabbd,0xf1f5f9,
  0x34d399,0x60a5fa,0x38bdf8,0xa78bfa,0xfbbf24,0xf87171,0xfb923c,0x22d3ee,
  0x768ca5,0xceabff,0xe4bd85};
constexpr int center = kCanvasCenter;
constexpr int safeRadius = 106;
constexpr uint8_t halo(Ink ink) { return InkCount + ink; }
constexpr uint8_t light(Ink ink) { return 2 * InkCount + ink; }
bool initCanvas(Canvas& g);
Ink accent(BuddyState state);
enum class Type { Small, Body, Title, Metric };
void text(Canvas& g, const char* value, int x, int y, Type type, uint8_t ink,
          int maxWidth = 212);
void arc(Canvas& g, int radius, int width, int start, int length, uint8_t ink);
void number(uint64_t value, bool known, char (&out)[24]);
}
