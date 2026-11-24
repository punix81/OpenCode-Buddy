#include "BuddyFace.h"

#include <cmath>
#include <cstdio>

#include "Config.h"

namespace buddy {
namespace {

constexpr int kCx = kCanvasCenter;
constexpr int kCy = kCanvasCenter;
constexpr int kRingRadius = 96;
constexpr int kEyeY = 98;
constexpr int kEyeDx = 32;
constexpr int kMouthY = 140;
constexpr float kPi = 3.14159265f;

uint16_t stateColor(lgfx::LGFXBase& g, BuddyState state) {
  switch (state) {
    case BuddyState::Offline:
      return g.color565(128, 136, 144);
    case BuddyState::Idle:
      return g.color565(78, 161, 255);
    case BuddyState::Thinking:
      return g.color565(181, 140, 255);
    case BuddyState::Generating:
      return g.color565(78, 161, 255);
    case BuddyState::Working:
      return g.color565(78, 220, 255);
    case BuddyState::PermissionRequired:
    case BuddyState::UserInputRequired:
    case BuddyState::Retrying:
      return g.color565(255, 167, 51);
    case BuddyState::Success:
      return g.color565(70, 209, 122);
    case BuddyState::Error:
      return g.color565(255, 92, 92);
    case BuddyState::Compacting:
      return g.color565(181, 140, 255);
    case BuddyState::Interrupted:
      return g.color565(200, 176, 120);
    default:
      return g.color565(128, 136, 144);
  }
}

int ringThickness(BuddyState state, const MotionFrame& motion) {
  switch (state) {
    case BuddyState::PermissionRequired:
    case BuddyState::UserInputRequired: {
      const int pulse = motion.quiet ? (motion.pulse / 128) : (motion.pulse / 64);
      return 2 + pulse;
    }
    case BuddyState::Error:
      return 4;
    case BuddyState::Success:
      return 3;
    case BuddyState::Offline:
      return 1;
    default:
      return 2;
  }
}

void drawStar(lgfx::LGFX_Sprite& g, int x, int y, int radius, uint16_t color) {
  g.drawLine(x - radius, y, x + radius, y, color);
  g.drawLine(x, y - radius, x, y + radius, color);
  const int diagonal = radius / 2;
  g.drawLine(x - diagonal, y - diagonal, x + diagonal, y + diagonal, color);
  g.drawLine(x - diagonal, y + diagonal, x + diagonal, y - diagonal, color);
}

void drawSmile(lgfx::LGFX_Sprite& g, int cx, int y, int halfWidth, int depth, uint16_t color) {
  g.drawLine(cx - halfWidth, y, cx - halfWidth / 2, y + depth, color);
  g.drawLine(cx - halfWidth / 2, y + depth, cx + halfWidth / 2, y + depth, color);
  g.drawLine(cx + halfWidth / 2, y + depth, cx + halfWidth, y, color);
}

void drawFrown(lgfx::LGFX_Sprite& g, int cx, int y, int halfWidth, int depth, uint16_t color) {
  g.drawLine(cx - halfWidth, y + depth, cx - halfWidth / 2, y, color);
  g.drawLine(cx - halfWidth / 2, y, cx + halfWidth / 2, y, color);
  g.drawLine(cx + halfWidth / 2, y, cx + halfWidth, y + depth, color);
}

}  // namespace

void BuddyFace::draw(lgfx::LGFX_Sprite& g, BuddyState state, const BuddyMetrics& metrics,
                     const MotionFrame& motion) {
  const uint16_t color = stateColor(g, state);
  const uint16_t white = g.color565(255, 255, 255);
  const uint16_t black = g.color565(0, 0, 0);

  int shake = 0;
  if (state == BuddyState::Error && motion.elapsedMs % 900 < 300) {
    shake = (static_cast<int>(motion.elapsedMs) % 120 < 60) ? 3 : -3;
  }

  drawRing(g, state, color, motion);

  g.setTextDatum(lgfx::textdatum_t::middle_center);

  drawEyes(g, state, white, motion.blink, motion.elapsedMs);
  drawMouth(g, state, color);
  drawParticles(g, state, color, motion);
  drawBadge(g, state, color);

  // Success stars sit above the eyes and pop with the pulse.
  if (state == BuddyState::Success) {
    const int radius = 3 + (motion.quiet ? 0 : (motion.pulse / 64));
    drawStar(g, 52, 58, radius, color);
    drawStar(g, 110, 44, radius + 1, color);
    drawStar(g, 168, 58, radius, color);
  }

  if (state == BuddyState::Retrying) {
    char label[12];
    snprintf(label, sizeof(label), "RETRY %u", static_cast<unsigned>(metrics.retryAttempt));
    g.setFont(&lgfx::fonts::FreeSansBold9pt7b);
    g.setTextColor(color, black);
    g.drawString(label, kCx + shake, 40);
  }

  (void)metrics;
}

void BuddyFace::drawRing(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t color,
                         const MotionFrame& motion) const {
  if (state == BuddyState::Offline) {
    g.drawCircle(kCx, kCy, kRingRadius, g.color565(52, 58, 64));
    return;
  }

  const int thickness = ringThickness(state, motion);
  const uint16_t dim = g.color565(40, 46, 52);
  g.drawCircle(kCx, kCy, kRingRadius, dim);

  for (int i = 0; i < thickness; ++i) {
    g.drawCircle(kCx, kCy, kRingRadius - i, color);
  }

  if (motion.quiet && state != BuddyState::PermissionRequired &&
      state != BuddyState::UserInputRequired && state != BuddyState::Error) {
    return;
  }

  switch (state) {
    case BuddyState::Compacting: {
      // Four dots rotating on the ring, 0.6 Hz.
      const float base = (motion.elapsedMs % 1600) * (2.0f * kPi) / 1600.0f;
      for (int i = 0; i < 4; ++i) {
        const float angle = base + i * (kPi / 2.0f);
        const int x = kCx + static_cast<int>(cosf(angle) * kRingRadius);
        const int y = kCy + static_cast<int>(sinf(angle) * kRingRadius);
        g.fillCircle(x, y, 3, color);
      }
      break;
    }
    case BuddyState::Retrying: {
      const float base = (motion.elapsedMs % 2400) * (2.0f * kPi) / 2400.0f;
      for (int i = 0; i < 6; ++i) {
        const float angle = base + i * (kPi / 3.0f);
        const int x = kCx + static_cast<int>(cosf(angle) * kRingRadius);
        const int y = kCy + static_cast<int>(sinf(angle) * kRingRadius);
        g.fillCircle(x, y, 2, color);
      }
      break;
    }
    case BuddyState::Success: {
      // A short sweep that completes once, then rests.
      const uint32_t phase = motion.elapsedMs % 1200;
      const int dots = static_cast<int>((phase * 12) / 1200);
      for (int i = 0; i <= dots; ++i) {
        const float angle = -kPi / 2.0f + i * (2.0f * kPi) / 12.0f;
        const int x = kCx + static_cast<int>(cosf(angle) * kRingRadius);
        const int y = kCy + static_cast<int>(sinf(angle) * kRingRadius);
        g.fillCircle(x, y, 2, color);
      }
      break;
    }
    case BuddyState::Thinking: {
      const float angle = (motion.elapsedMs % 1800) * (2.0f * kPi) / 1800.0f;
      const int x = kCx + static_cast<int>(cosf(angle) * kRingRadius);
      const int y = kCy + static_cast<int>(sinf(angle) * kRingRadius);
      g.fillCircle(x, y, 3, color);
      break;
    }
    default:
      break;
  }
}

void BuddyFace::drawEyes(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t white, bool blink,
                         uint32_t elapsed) const {
  const int leftX = kCx - kEyeDx;
  const int rightX = kCx + kEyeDx;
  const uint16_t black = g.color565(0, 0, 0);

  if (state == BuddyState::Offline) {
    const uint16_t grey = g.color565(90, 98, 106);
    g.drawLine(leftX - 14, kEyeY, leftX + 14, kEyeY, grey);
    g.drawLine(rightX - 14, kEyeY, rightX + 14, kEyeY, grey);
    return;
  }

  if (state == BuddyState::Success) {
    g.drawLine(leftX - 12, kEyeY + 5, leftX, kEyeY - 7, white);
    g.drawLine(leftX, kEyeY - 7, leftX + 12, kEyeY + 5, white);
    g.drawLine(rightX - 12, kEyeY + 5, rightX, kEyeY - 7, white);
    g.drawLine(rightX, kEyeY - 7, rightX + 12, kEyeY + 5, white);
    return;
  }

  if (state == BuddyState::Error) {
    g.drawLine(leftX - 12, kEyeY - 12, leftX + 12, kEyeY + 12, white);
    g.drawLine(leftX - 12, kEyeY + 12, leftX + 12, kEyeY - 12, white);
    g.drawLine(rightX - 12, kEyeY - 12, rightX + 12, kEyeY + 12, white);
    g.drawLine(rightX - 12, kEyeY + 12, rightX + 12, kEyeY - 12, white);
    return;
  }

  if (blink) {
    g.drawLine(leftX - 13, kEyeY, leftX + 13, kEyeY, white);
    g.drawLine(rightX - 13, kEyeY, rightX + 13, kEyeY, white);
    return;
  }

  int rx = 14;
  int ry = 18;
  int pupilDx = 0;
  int pupilDy = 0;

  switch (state) {
    case BuddyState::Thinking:
      pupilDx = -5;
      pupilDy = -6;
      break;
    case BuddyState::Generating:
      ry = 15;
      pupilDy = 2;
      break;
    case BuddyState::Working:
      ry = 8;
      break;
    case BuddyState::PermissionRequired:
      rx = 16;
      ry = 21;
      break;
    case BuddyState::UserInputRequired:
      ry = 17;
      break;
    case BuddyState::Compacting:
      ry = 6;
      break;
    case BuddyState::Retrying:
      pupilDx = 6;
      break;
    case BuddyState::Interrupted:
      ry = 16;
      break;
    default:
      break;
  }

  const int rightY = state == BuddyState::UserInputRequired ? kEyeY - 4 : kEyeY;

  g.fillEllipse(leftX, kEyeY, rx, ry, white);
  g.fillEllipse(rightX, rightY, rx, ry, white);
  g.fillCircle(leftX + pupilDx, kEyeY + pupilDy, 5, black);
  g.fillCircle(rightX + pupilDx, rightY + pupilDy, 5, black);

  if (state == BuddyState::PermissionRequired) {
    // Raised brows make the surprise readable without colour.
    g.drawLine(leftX - 14, kEyeY - 30, leftX + 14, kEyeY - 33, white);
    g.drawLine(rightX - 14, kEyeY - 33, rightX + 14, kEyeY - 30, white);
  } else if (state == BuddyState::UserInputRequired) {
    // One raised brow is the question mark the eyes cannot draw.
    g.drawLine(rightX - 13, rightY - 28, rightX + 13, rightY - 28, white);
  }

  (void)elapsed;
}

void BuddyFace::drawMouth(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t color) const {
  switch (state) {
    case BuddyState::Offline:
      return;
    case BuddyState::Idle:
    case BuddyState::Interrupted:
      drawSmile(g, kCx, kMouthY - 2, 12, 5, color);
      return;
    case BuddyState::Success:
      drawSmile(g, kCx, kMouthY - 4, 20, 9, color);
      return;
    case BuddyState::Error:
      drawFrown(g, kCx, kMouthY - 2, 16, 7, color);
      return;
    case BuddyState::PermissionRequired:
      g.drawCircle(kCx, kMouthY, 6, color);
      return;
    case BuddyState::UserInputRequired:
      g.drawLine(kCx - 12, kMouthY + 3, kCx + 12, kMouthY - 2, color);
      return;
    case BuddyState::Generating:
      g.drawEllipse(kCx, kMouthY, 10, 5, color);
      return;
    default:
      g.drawLine(kCx - 10, kMouthY, kCx + 10, kMouthY, color);
      return;
  }
}

void BuddyFace::drawParticles(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t color,
                              const MotionFrame& motion) const {
  const bool animate = !motion.quiet;

  if (state == BuddyState::Thinking) {
    const float base = animate ? (motion.elapsedMs % 2100) * (2.0f * kPi) / 2100.0f : 0.0f;
    for (int i = 0; i < 3; ++i) {
      const float angle = base + i * (2.0f * kPi / 3.0f);
      const int x = kCx + static_cast<int>(cosf(angle) * 18);
      const int y = 60 + static_cast<int>(sinf(angle) * 8);
      g.fillCircle(x, y, 3, color);
    }
    return;
  }

  if (state == BuddyState::Generating) {
    for (int i = 0; i < 3; ++i) {
      const int offset = animate ? static_cast<int>((motion.elapsedMs / 6 + i * 34) % 102) : i * 34;
      const int x = 60 + offset;
      const int radius = i == 1 ? 3 : 2;
      g.fillCircle(x, 162, radius, color);
    }
    return;
  }

  if (state == BuddyState::Working) {
    g.setFont(&lgfx::fonts::FreeMonoBold9pt7b);
    g.setTextColor(color, g.color565(0, 0, 0));
    const int drift = animate ? static_cast<int>((motion.elapsedMs / 40) % 6) : 0;
    g.drawString("<", 40 + drift, 52);
    g.drawString(">", 176 - drift, 52);
    g.drawString("{", 34, 150 - drift);
    g.drawString("}", 182, 150 + drift);
    return;
  }

  (void)color;
}

void BuddyFace::drawBadge(lgfx::LGFX_Sprite& g, BuddyState state, uint16_t color) const {
  const char* glyph = nullptr;
  switch (state) {
    case BuddyState::PermissionRequired:
      glyph = "!";
      break;
    case BuddyState::UserInputRequired:
      glyph = "?";
      break;
    case BuddyState::Error:
      glyph = "x";
      break;
    default:
      return;
  }

  constexpr int badgeX = 168;
  constexpr int badgeY = 52;
  const uint16_t black = g.color565(0, 0, 0);
  g.fillCircle(badgeX, badgeY, 11, color);
  g.setFont(&lgfx::fonts::FreeSansBold12pt7b);
  g.setTextDatum(lgfx::textdatum_t::middle_center);
  g.setTextColor(black, color);
  g.drawString(glyph, badgeX, badgeY - 1);
}

}  // namespace buddy
