#include "Theme.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace buddy::ui {
bool initCanvas(Canvas& g) {
  g.setColorDepth(lgfx::color_depth_t::palette_8bit);
  if (!g.createSprite(kCanvasSize, kCanvasSize) || !g.getPalette()) return false;
  for (int i = 0; i < InkCount; ++i) {
    const uint32_t rgb = colors[i];
    const uint8_t r = rgb >> 16, green = rgb >> 8, b = rgb;
    g.setPaletteColor(i, r, green, b);
    g.setPaletteColor(halo(static_cast<Ink>(i)), 10+r/5, 16+green/5, 25+b/5);
    g.setPaletteColor(light(static_cast<Ink>(i)), 132+r/3, 145+green/3, 160+b/3);
  }
  return true;
}
Ink accent(BuddyState s) {
  constexpr Ink inks[] = {Slate,Mint,Blue,Cyan,Violet,Amber,Lilac,Mint,Coral,Aqua,Orange,Sand};
  return inks[static_cast<unsigned>(s)];
}
const char* label(BuddyState s) {
  constexpr const char* names[] = {"Offline","Idle","Thinking","Generating","Working","Permission",
    "Input needed","Success","Error","Compacting","Retrying","Interrupted"};
  return names[static_cast<unsigned>(s)];
}

void text(Canvas& g, const char* value, int x, int y, Type type, uint8_t ink, int maxWidth) {
  const lgfx::IFont* fonts[] = {&lgfx::fonts::Font2, &lgfx::fonts::FreeSans9pt7b,
                                 &lgfx::fonts::FreeSansBold12pt7b,&lgfx::fonts::FreeSansBold24pt7b};
  int level = static_cast<int>(type);
  int width;
  do {
    g.setFont(fonts[level]);
    const int dy = std::abs(y-center) + (g.fontHeight()+1)/2;
    if (dy >= safeRadius) { width = 0; continue; }
    const int chord = static_cast<int>(sqrtf(safeRadius*safeRadius-dy*dy));
    width = std::min(maxWidth, 2*(chord-std::abs(x-center)));
  } while (g.textWidth(value) > width && level-- > 0);
  if (width <= 0) return;
  char fitted[80];
  if (g.textWidth(value) > width) {
    snprintf(fitted, sizeof(fitted), "%s", value);
    size_t n = std::min(strlen(fitted), sizeof(fitted)-4);
    do {
      if (n == 0) return;
      --n;
      while (n && (static_cast<unsigned char>(fitted[n]) & 0xc0) == 0x80) --n;
      memcpy(fitted+n, "...", 4);
    } while (g.textWidth(fitted) > width);
    value = fitted;
  }
  g.setTextDatum(lgfx::textdatum_t::middle_center);
  g.setTextColor(ink);
  g.drawString(value,x,y);
}

void arc(Canvas& g, int r, int w, int start, int length, uint8_t ink) {
  if (length <= 0) return;
  g.fillArc(center,center,r,r-w+1,start%360,(start+length)%360,ink);
}

void number(uint64_t value, bool known, char (&out)[24]) {
  if (!known) { strcpy(out,"--"); return; }
  const char suffix[] = " kMB";
  unsigned unit = 0;
  uint64_t scale = 1;
  while (unit < 3 && value >= 1000*scale-scale/20) { scale *= 1000; ++unit; }
  if (!unit) { snprintf(out,sizeof(out),"%u",static_cast<unsigned>(value)); return; }
  const unsigned tenths = static_cast<unsigned>((10*value+scale/2)/scale);
  snprintf(out,sizeof(out),"%u.%u%c",tenths/10,tenths%10,suffix[unit]);
}
}
