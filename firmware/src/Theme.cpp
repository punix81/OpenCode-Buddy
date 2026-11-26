#include "Theme.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace buddy::ui {
namespace {

// The bundled fonts cover ASCII 0x20-0x7E only. French and German need a small
// set of Latin-1 letters, so the renderer composes them from the existing base
// glyph plus an accent mark taken from the same font. The typography, metrics
// and flash footprint stay those of the pinned fonts; no extra font file is
// introduced.
enum class Mark : uint8_t { None, Acute, Grave, Circumflex, Diaeresis, Cedilla, Tilde };

struct Accented {
  uint16_t code;
  char base;
  char second;
  Mark mark;
};

constexpr Accented kAccents[] = {
    {0x00c0, 'A', 0, Mark::Grave},      {0x00c1, 'A', 0, Mark::Acute},
    {0x00c2, 'A', 0, Mark::Circumflex}, {0x00c3, 'A', 0, Mark::Tilde},
    {0x00c4, 'A', 0, Mark::Diaeresis},  {0x00c7, 'C', 0, Mark::Cedilla},
    {0x00c8, 'E', 0, Mark::Grave},      {0x00c9, 'E', 0, Mark::Acute},
    {0x00ca, 'E', 0, Mark::Circumflex}, {0x00cb, 'E', 0, Mark::Diaeresis},
    {0x00cc, 'I', 0, Mark::Grave},      {0x00cd, 'I', 0, Mark::Acute},
    {0x00ce, 'I', 0, Mark::Circumflex}, {0x00cf, 'I', 0, Mark::Diaeresis},
    {0x00d1, 'N', 0, Mark::Tilde},      {0x00d2, 'O', 0, Mark::Grave},
    {0x00d3, 'O', 0, Mark::Acute},      {0x00d4, 'O', 0, Mark::Circumflex},
    {0x00d5, 'O', 0, Mark::Tilde},      {0x00d6, 'O', 0, Mark::Diaeresis},
    {0x00d9, 'U', 0, Mark::Grave},      {0x00da, 'U', 0, Mark::Acute},
    {0x00db, 'U', 0, Mark::Circumflex}, {0x00dc, 'U', 0, Mark::Diaeresis},
    {0x00dd, 'Y', 0, Mark::Acute},      {0x00df, 's', 's', Mark::None},
    {0x00e0, 'a', 0, Mark::Grave},      {0x00e1, 'a', 0, Mark::Acute},
    {0x00e2, 'a', 0, Mark::Circumflex}, {0x00e3, 'a', 0, Mark::Tilde},
    {0x00e4, 'a', 0, Mark::Diaeresis},  {0x00e7, 'c', 0, Mark::Cedilla},
    {0x00e8, 'e', 0, Mark::Grave},      {0x00e9, 'e', 0, Mark::Acute},
    {0x00ea, 'e', 0, Mark::Circumflex}, {0x00eb, 'e', 0, Mark::Diaeresis},
    {0x00ec, 'i', 0, Mark::Grave},      {0x00ed, 'i', 0, Mark::Acute},
    {0x00ee, 'i', 0, Mark::Circumflex}, {0x00ef, 'i', 0, Mark::Diaeresis},
    {0x00f1, 'n', 0, Mark::Tilde},      {0x00f2, 'o', 0, Mark::Grave},
    {0x00f3, 'o', 0, Mark::Acute},      {0x00f4, 'o', 0, Mark::Circumflex},
    {0x00f5, 'o', 0, Mark::Tilde},      {0x00f6, 'o', 0, Mark::Diaeresis},
    {0x00f9, 'u', 0, Mark::Grave},      {0x00fa, 'u', 0, Mark::Acute},
    {0x00fb, 'u', 0, Mark::Circumflex}, {0x00fc, 'u', 0, Mark::Diaeresis},
    {0x00fd, 'y', 0, Mark::Acute},      {0x00ff, 'y', 0, Mark::Diaeresis},
    {0x00c6, 'A', 'E', Mark::None},     {0x00e6, 'a', 'e', Mark::None},
    {0x0152, 'O', 'E', Mark::None},     {0x0153, 'o', 'e', Mark::None},
};

struct Decoded {
  char base;
  char second;
  Mark mark;
};

bool continuation(unsigned char value) { return (value & 0xc0) == 0x80; }

uint32_t nextCodepoint(const char*& cursor) {
  const unsigned char lead = static_cast<unsigned char>(*cursor);
  if (lead < 0x80) {
    ++cursor;
    return lead;
  }
  if ((lead & 0xe0) == 0xc0) {
    const unsigned char b1 = static_cast<unsigned char>(cursor[1]);
    if (continuation(b1)) {
      cursor += 2;
      return ((lead & 0x1fu) << 6) | (b1 & 0x3fu);
    }
  } else if ((lead & 0xf0) == 0xe0) {
    const unsigned char b1 = static_cast<unsigned char>(cursor[1]);
    const unsigned char b2 = static_cast<unsigned char>(cursor[2]);
    if (continuation(b1) && continuation(b2)) {
      cursor += 3;
      return ((lead & 0x0fu) << 12) | ((b1 & 0x3fu) << 6) | (b2 & 0x3fu);
    }
  }
  ++cursor;
  return 0xfffd;
}

Decoded decodeChar(const char*& cursor) {
  const uint32_t code = nextCodepoint(cursor);
  if (code >= 0x20 && code <= 0x7e) {
    return {static_cast<char>(code), 0, Mark::None};
  }
  for (const auto& entry : kAccents) {
    if (entry.code == code) return {entry.base, entry.second, entry.mark};
  }
  return {'?', 0, Mark::None};
}

bool hasNonAscii(const char* value) {
  for (const unsigned char* p = reinterpret_cast<const unsigned char*>(value); *p; ++p) {
    if (*p >= 0x80) return true;
  }
  return false;
}

size_t previousCodepoint(const char* value, size_t length) {
  if (length == 0) return 0;
  size_t index = length - 1;
  while (index > 0 && (static_cast<unsigned char>(value[index]) & 0xc0) == 0x80) {
    --index;
  }
  return index;
}

int measure(Canvas& g, const char* value) {
  int width = 0;
  const char* cursor = value;
  char one[2] = {0, 0};
  while (*cursor) {
    const Decoded decoded = decodeChar(cursor);
    one[0] = decoded.base;
    width += g.textWidth(one);
    if (decoded.second != 0) {
      one[0] = decoded.second;
      width += g.textWidth(one);
    }
  }
  return width;
}

bool upperCase(char value) { return value >= 'A' && value <= 'Z'; }

// Accent marks are drawn as primitives instead of borrowed punctuation: the
// borrowed glyph carries its own top-of-cell offset, which at 24 pt floated far
// above the letter. The marks below scale with the font box and sit on the
// measured cap height (upper case) or x-height (lower case).
void drawMark(Canvas& g, Mark mark, int cx, int top, int height, uint8_t ink) {
  const int width = std::max(3, height / 5);
  const int depth = std::max(2, height / 6);
  const int thickness = height >= 24 ? 2 : 1;
  const int half = width / 2;
  auto line = [&](int x0, int y0, int x1, int y1) {
    for (int i = 0; i < thickness; ++i) g.drawLine(x0, y0 + i, x1, y1 + i, ink);
  };
  switch (mark) {
    case Mark::Acute:
      line(cx - half, top, cx + half, top - depth);
      break;
    case Mark::Grave:
      line(cx - half, top - depth, cx + half, top);
      break;
    case Mark::Circumflex:
      line(cx - half, top, cx, top - depth);
      line(cx, top - depth, cx + half, top);
      break;
    case Mark::Tilde:
      line(cx - half, top, cx - half / 2, top - depth);
      line(cx - half / 2, top - depth, cx + half / 2, top);
      line(cx + half / 2, top, cx + half, top - depth);
      break;
    case Mark::Diaeresis: {
      const int dot = std::max(1, height / 12);
      // Keep a visible gap even at 8 px, where a symmetric split would round
      // both dots onto the same pixel.
      g.fillRect(cx - dot - 1, top - depth, dot, dot, ink);
      g.fillRect(cx + 1, top - depth, dot, dot, ink);
      break;
    }
    case Mark::Cedilla: {
      const int stem = std::max(2, height / 8);
      g.fillRect(cx, top, std::max(1, thickness), stem, ink);
      g.drawLine(cx, top + stem, cx - std::max(2, width / 2), top + stem + 1, ink);
      break;
    }
    default:
      break;
  }
}

void drawComposed(Canvas& g, const char* value, int x, int y, uint8_t ink) {
  const int width = measure(g, value);
  int cursorX = x - width / 2;
  const char* cursor = value;
  char one[2] = {0, 0};
  lgfx::FontMetrics metrics;
  g.getFont()->getDefaultMetric(&metrics);
  const int lineTop = y - metrics.height / 2;
  const int baseline = lineTop + metrics.baseline;
  const int capHeight = metrics.height * 59 / 100;
  const int xHeight = metrics.height * 41 / 100;
  g.setTextDatum(lgfx::textdatum_t::middle_left);
  while (*cursor) {
    const Decoded decoded = decodeChar(cursor);
    one[0] = decoded.base;
    const int baseWidth = g.textWidth(one);
    g.drawString(one, cursorX, y);
    int advance = baseWidth;
    if (decoded.second != 0) {
      one[0] = decoded.second;
      g.drawString(one, cursorX + baseWidth, y);
      advance += g.textWidth(one);
    }
    if (decoded.mark != Mark::None) {
      const int cx = cursorX + baseWidth / 2;
      if (decoded.mark == Mark::Cedilla) {
        drawMark(g, decoded.mark, cx, baseline + 1, metrics.height, ink);
      } else {
        const int top = baseline - (upperCase(decoded.base) ? capHeight : xHeight) - 2;
        drawMark(g, decoded.mark, cx, top, metrics.height, ink);
      }
    }
    cursorX += advance;
  }
}

}  // namespace

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
  } while (measure(g, value) > width && level-- > 0);
  if (width <= 0) return;
  char fitted[96];
  if (measure(g, value) > width) {
    snprintf(fitted, sizeof(fitted), "%s", value);
    size_t n = std::min(strlen(fitted), sizeof(fitted)-4);
    do {
      if (n == 0) return;
      n = previousCodepoint(fitted, n);
      memcpy(fitted+n, "...", 4);
    } while (measure(g, fitted) > width);
    value = fitted;
  }
  g.setTextColor(ink);
  if (hasNonAscii(value)) {
    drawComposed(g, value, x, y, ink);
    return;
  }
  g.setTextDatum(lgfx::textdatum_t::middle_center);
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
}  // namespace buddy::ui
