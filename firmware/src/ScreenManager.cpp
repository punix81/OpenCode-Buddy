#include "ScreenManager.h"

#include <Arduino.h>

#include <cmath>
#include <cstdio>
#include <cstring>

#include "Config.h"

namespace buddy {
namespace {

constexpr float kPi = 3.14159265f;
constexpr int kCx = kCanvasCenter;
constexpr int kPageY = 212;

struct Palette {
  uint16_t bg;
  uint16_t text;
  uint16_t muted;
  uint16_t accent;
  uint16_t ok;
  uint16_t warn;
  uint16_t error;
  uint16_t grid;
  uint16_t surface;

  explicit Palette(lgfx::LGFXBase& g)
      : bg(g.color565(0, 0, 0)),
        text(g.color565(255, 255, 255)),
        muted(g.color565(154, 164, 174)),
        accent(g.color565(78, 161, 255)),
        ok(g.color565(70, 209, 122)),
        warn(g.color565(255, 167, 51)),
        error(g.color565(255, 92, 92)),
        grid(g.color565(30, 37, 44)),
        surface(g.color565(16, 20, 24)) {}
};

const char* stateLabel(BuddyState state) {
  switch (state) {
    case BuddyState::Offline:
      return "OFFLINE";
    case BuddyState::Idle:
      return "IDLE";
    case BuddyState::Thinking:
      return "THINKING";
    case BuddyState::Generating:
      return "GENERATING";
    case BuddyState::Working:
      return "WORKING";
    case BuddyState::PermissionRequired:
      return "PERMISSION";
    case BuddyState::UserInputRequired:
      return "QUESTION";
    case BuddyState::Success:
      return "DONE";
    case BuddyState::Error:
      return "ERROR";
    case BuddyState::Compacting:
      return "COMPACTING";
    case BuddyState::Retrying:
      return "RETRY";
    case BuddyState::Interrupted:
      return "INTERRUPTED";
    default:
      return "OFFLINE";
  }
}

uint16_t stateColor(lgfx::LGFXBase& g, BuddyState state) {
  const Palette p(g);
  switch (state) {
    case BuddyState::Offline:
    case BuddyState::Interrupted:
      return p.muted;
    case BuddyState::Thinking:
    case BuddyState::Compacting:
      return g.color565(181, 140, 255);
    case BuddyState::Working:
      return g.color565(78, 220, 255);
    case BuddyState::PermissionRequired:
    case BuddyState::UserInputRequired:
    case BuddyState::Retrying:
      return p.warn;
    case BuddyState::Success:
      return p.ok;
    case BuddyState::Error:
      return p.error;
    default:
      return p.accent;
  }
}

const char* mcpLabel(McpStatus status) {
  switch (status) {
    case McpStatus::Connected:
      return "CONN";
    case McpStatus::Pending:
      return "PEND";
    case McpStatus::Disabled:
      return "OFF";
    case McpStatus::Failed:
      return "FAIL";
    case McpStatus::NeedsAuth:
      return "AUTH";
    default:
      return "--";
  }
}

uint16_t mcpColor(lgfx::LGFXBase& g, McpStatus status) {
  const Palette p(g);
  switch (status) {
    case McpStatus::Connected:
      return p.ok;
    case McpStatus::Pending:
    case McpStatus::NeedsAuth:
      return p.warn;
    case McpStatus::Failed:
      return p.error;
    default:
      return p.grid;
  }
}

void formatDuration(uint32_t seconds, char* out, size_t capacity) {
  if (seconds >= 3600) {
    snprintf(out, capacity, "%u:%02u:%02u", static_cast<unsigned>(seconds / 3600),
             static_cast<unsigned>((seconds / 60) % 60), static_cast<unsigned>(seconds % 60));
  } else {
    snprintf(out, capacity, "%02u:%02u", static_cast<unsigned>(seconds / 60),
             static_cast<unsigned>(seconds % 60));
  }
}

void formatNumber(uint32_t value, char* out, size_t capacity) {
  if (value < 1000) {
    snprintf(out, capacity, "%u", static_cast<unsigned>(value));
    return;
  }
  char digits[16];
  snprintf(digits, sizeof(digits), "%u", static_cast<unsigned>(value));
  const int length = static_cast<int>(strlen(digits));
  size_t written = 0;
  for (int i = 0; i < length && written + 2 < capacity; ++i) {
    if (i > 0 && (length - i) % 3 == 0) {
      out[written++] = ',';
    }
    out[written++] = digits[i];
  }
  out[written] = '\0';
}

void drawText(lgfx::LGFX_Sprite& g, const char* text, int x, int y, const lgfx::IFont* font,
              uint16_t color, uint16_t background,
              lgfx::textdatum_t datum = lgfx::textdatum_t::middle_center) {
  g.setFont(font);
  g.setTextDatum(datum);
  g.setTextColor(color, background);
  g.drawString(text, x, y);
}

}  // namespace

void ScreenManager::begin(DisplayManager* display, StateManager* state,
                          PreferencesManager* preferences, AnimationEngine* animation,
                          BuddyFace* face) {
  display_ = display;
  state_ = state;
  preferences_ = preferences;
  animation_ = animation;
  face_ = face;

  screen_ = static_cast<ScreenId>(preferences_->lastScreen());
  if (screen_ >= ScreenId::Count) {
    screen_ = ScreenId::Buddy;
  }
  lastInteraction_ = millis();
  dirty_ = true;
}

void ScreenManager::onGesture(Gesture gesture, uint32_t now) {
  if (gesture == Gesture::None || state_ == nullptr || preferences_ == nullptr) {
    return;
  }

  lastInteraction_ = now;

  switch (gesture) {
    case Gesture::Short: {
      const uint8_t next = (static_cast<uint8_t>(screen_) + 1) % static_cast<uint8_t>(ScreenId::Count);
      screen_ = static_cast<ScreenId>(next);
      preferences_->setLastScreen(next);
      dirty_ = true;
      break;
    }
    case Gesture::Double:
      screen_ = ScreenId::Buddy;
      preferences_->setLastScreen(0);
      dirty_ = true;
      break;
    case Gesture::Long: {
      const bool quiet = !preferences_->quietMode();
      preferences_->setQuietMode(quiet);
      snprintf(toast_, sizeof(toast_), "%s", quiet ? "QUIET" : "LOUD");
      toastUntil_ = now + 1500;
      dirty_ = true;
      break;
    }
    case Gesture::VeryLong:
      preferences_->reset();
      screen_ = ScreenId::Buddy;
      snprintf(toast_, sizeof(toast_), "%s", "RESET");
      toastUntil_ = now + 3000;
      dirty_ = true;
      break;
    default:
      break;
  }
}

void ScreenManager::update(uint32_t now) {
  if (display_ == nullptr || state_ == nullptr || preferences_ == nullptr ||
      animation_ == nullptr) {
    return;
  }
  if (!display_->ready()) {
    return;
  }

  const bool quiet = preferences_->quietMode();

  if (!quiet && screen_ != ScreenId::Buddy && now - lastInteraction_ >= kAutoReturnMs) {
    screen_ = ScreenId::Buddy;
    preferences_->setLastScreen(0);
    dirty_ = true;
    lastInteraction_ = now;
  }

  if (toast_[0] != '\0' && now >= toastUntil_) {
    toast_[0] = '\0';
    dirty_ = true;
  }

  const uint32_t interval =
      screen_ == ScreenId::Buddy ? animation_->intervalMs(state_->state())
                                 : (quiet ? 500 : kDashboardIntervalMs);

  if (dirty_ || animation_->due(now, interval)) {
    render(now);
    animation_->markPushed(now);
    dirty_ = false;
  }
}

void ScreenManager::render(uint32_t now) {
  auto& g = display_->canvas();
  const Palette palette(g);
  const uint32_t startUs = micros();
  g.fillScreen(palette.bg);

  switch (screen_) {
    case ScreenId::Buddy:
      drawBuddy(now);
      break;
    case ScreenId::Session:
      drawSession(now);
      break;
    case ScreenId::Tokens:
      drawTokens(now);
      break;
    case ScreenId::Tools:
      drawTools(now);
      break;
    case ScreenId::Mcp:
      drawMcp(now);
      break;
    case ScreenId::System:
      drawSystem(now);
      break;
    default:
      drawBuddy(now);
      break;
  }

  drawToast(g, now);
  display_->push();

  const uint32_t elapsedUs = micros() - startUs;
  ++pushCount_;
  ++renderCount_;
  renderSumUs_ += elapsedUs;
  if (elapsedUs > renderMaxUs_) {
    renderMaxUs_ = elapsedUs;
  }
}

void ScreenManager::drawChrome(lgfx::LGFX_Sprite& g, const char* title, uint16_t accent) {
  const Palette p(g);
  drawText(g, title, kCx, 26, &lgfx::fonts::FreeSansBold9pt7b, p.muted, p.bg);
  g.drawFastHLine(kCx - 22, 36, 44, accent);

  constexpr int dashes = static_cast<int>(ScreenId::Count);
  constexpr int width = 9;
  constexpr int gap = 5;
  constexpr int total = dashes * width + (dashes - 1) * gap;
  const int start = kCx - total / 2;
  for (int i = 0; i < dashes; ++i) {
    const uint16_t color = i == static_cast<int>(screen_) ? accent : p.grid;
    g.fillRect(start + i * (width + gap), kPageY, width, 3, color);
  }
}

void ScreenManager::drawRow(lgfx::LGFX_Sprite& g, int y, const char* label, const char* value,
                            uint16_t valueColor) {
  const Palette p(g);
  drawText(g, label, 34, y, &lgfx::fonts::FreeSans9pt7b, p.muted, p.bg,
           lgfx::textdatum_t::middle_left);
  drawText(g, value, 186, y, &lgfx::fonts::FreeSansBold9pt7b, valueColor, p.bg,
           lgfx::textdatum_t::middle_right);
}

void ScreenManager::drawBuddy(uint32_t now) {
  auto& g = display_->canvas();
  const Palette p(g);
  const BuddyState state = state_->state();
  const BuddyMetrics& metrics = state_->metrics();
  const MotionFrame& motion = animation_->frame();

  if (face_ != nullptr) {
    face_->draw(g, state, metrics, motion);
  }

  const uint16_t accent = stateColor(g, state);
  drawText(g, stateLabel(state), kCx, 26, &lgfx::fonts::FreeSansBold9pt7b, accent, p.bg);
  drawText(g, state_->model(), kCx, 186, &lgfx::fonts::FreeSans9pt7b, p.muted, p.bg);

  g.fillCircle(28, 26, 4, state_->usb() == LinkState::Connected ? p.ok : p.error);

  if (metrics.notifications > 0) {
    char badge[8];
    snprintf(badge, sizeof(badge), "%u", static_cast<unsigned>(metrics.notifications));
    g.fillCircle(192, 26, 9, p.warn);
    drawText(g, badge, 192, 26, &lgfx::fonts::FreeSansBold9pt7b, p.bg, p.warn);
  }

#if defined(BUDDY_MOCK_MODE) && BUDDY_MOCK_MODE
  drawText(g, "MOCK", 34, 200, &lgfx::fonts::FreeSans9pt7b, p.warn, p.bg,
           lgfx::textdatum_t::middle_left);
#endif

  if (preferences_->quietMode()) {
    drawText(g, "QUIET", 186, 200, &lgfx::fonts::FreeSans9pt7b, p.muted, p.bg,
             lgfx::textdatum_t::middle_right);
  }

  drawChrome(g, "", accent);
  (void)now;
}

void ScreenManager::drawSession(uint32_t now) {
  auto& g = display_->canvas();
  const Palette p(g);
  const BuddyState state = state_->state();
  const BuddyMetrics& metrics = state_->metrics();

  drawChrome(g, "SESSION", p.accent);

  const char* model = state_->model();
  const lgfx::IFont* modelFont = &lgfx::fonts::FreeSansBold9pt7b;
  g.setFont(modelFont);
  if (g.textWidth(model) > 176) {
    modelFont = &lgfx::fonts::FreeSans9pt7b;
  }
  drawText(g, model, kCx, 56, modelFont, p.text, p.bg);

  g.fillRect(62, 70, 96, 18, p.surface);
  drawText(g, state_->agent(), kCx, 79, &lgfx::fonts::FreeSans9pt7b, p.accent, p.surface);

  char duration[12];
  formatDuration(metrics.elapsedSeconds, duration, sizeof(duration));
  drawText(g, duration, kCx, 112, &lgfx::fonts::FreeSansBold24pt7b, p.text, p.bg);

  char sessions[16];
  snprintf(sessions, sizeof(sessions), "SESSIONS %u", static_cast<unsigned>(metrics.activeSessions));
  drawText(g, sessions, kCx, 144, &lgfx::fonts::FreeSans9pt7b, p.muted, p.bg);

  drawText(g, stateLabel(state), kCx, 168, &lgfx::fonts::FreeSansBold9pt7b,
           stateColor(g, state), p.bg);
  (void)now;
}

void ScreenManager::drawTokens(uint32_t now) {
  auto& g = display_->canvas();
  const Palette p(g);
  const TokenUsage& tokens = state_->metrics().tokens;

  drawChrome(g, "TOKENS", p.accent);

  char total[20];
  if (tokens.available) {
    formatNumber(tokens.total != 0 ? tokens.total : tokens.input + tokens.output, total,
                 sizeof(total));
    drawText(g, total, kCx, 68, &lgfx::fonts::FreeSansBold24pt7b, p.text, p.bg);
  } else {
    drawText(g, "--", kCx, 68, &lgfx::fonts::FreeSansBold24pt7b, p.muted, p.bg);
  }

  char input[20];
  char output[20];
  if (tokens.available) {
    formatNumber(tokens.input, input, sizeof(input));
    formatNumber(tokens.output, output, sizeof(output));
  } else {
    snprintf(input, sizeof(input), "--");
    snprintf(output, sizeof(output), "--");
  }
  drawRow(g, 100, "IN", input, p.text);
  drawRow(g, 122, "OUT", output, p.text);

  constexpr int dots = 30;
  constexpr int radius = 30;
  const int centerY = 164;
  const int filled = tokens.contextAvailable
                         ? (tokens.contextPercent * dots) / 100
                         : 0;
  for (int i = 0; i < dots; ++i) {
    const float angle = (135.0f + i * (270.0f / (dots - 1))) * kPi / 180.0f;
    const int x = kCx + static_cast<int>(cosf(angle) * radius);
    const int y = centerY + static_cast<int>(sinf(angle) * radius);
    const bool active = tokens.contextAvailable && i < filled;
    g.fillCircle(x, y, active ? 2 : 1, active ? p.accent : p.grid);
  }

  char context[16];
  if (tokens.contextAvailable) {
    snprintf(context, sizeof(context), "CTX %d%%", static_cast<int>(tokens.contextPercent));
    drawText(g, context, kCx, centerY, &lgfx::fonts::FreeSansBold9pt7b, p.accent, p.bg);
  } else {
    drawText(g, "CTX --", kCx, centerY, &lgfx::fonts::FreeSansBold9pt7b, p.muted, p.bg);
    drawText(g, "limit unavailable", kCx, centerY + 16, &lgfx::fonts::FreeSans9pt7b, p.muted,
             p.bg);
  }
  (void)now;
}

void ScreenManager::drawTools(uint32_t now) {
  auto& g = display_->canvas();
  const Palette p(g);
  const ToolUsage& tools = state_->metrics().tools;

  drawChrome(g, "TOOLS", p.accent);

  const int xs[3] = {58, 110, 162};
  const char* labels[3] = {"OK", "FAIL", "RUN"};
  const uint32_t values[3] = {tools.success, tools.failed, tools.running};
  const uint16_t colors[3] = {p.ok, p.error, p.accent};

  for (int i = 0; i < 3; ++i) {
    char value[16];
    if (i == 2) {
      snprintf(value, sizeof(value), "%u", static_cast<unsigned>(values[i]));
    } else {
      formatNumber(values[i], value, sizeof(value));
    }
    drawText(g, labels[i], xs[i], 50, &lgfx::fonts::FreeSans9pt7b, p.muted, p.bg);
    drawText(g, value, xs[i], 68, &lgfx::fonts::FreeSansBold12pt7b, colors[i], p.bg);
  }

  const char* names[6] = {"READ", "EDIT", "SHELL", "SEARCH", "MCP", "OTHER"};
  const uint32_t counts[6] = {tools.read, tools.edit, tools.shell,
                              tools.search, tools.mcp, tools.other};
  uint32_t maximum = 1;
  for (uint32_t count : counts) {
    if (count > maximum) {
      maximum = count;
    }
  }

  int y = 96;
  for (int i = 0; i < 6; ++i) {
    drawText(g, names[i], 34, y, &lgfx::fonts::FreeSans9pt7b, p.muted, p.bg,
             lgfx::textdatum_t::middle_left);
    g.drawRect(92, y - 4, 98, 9, p.grid);
    const int width = static_cast<int>((counts[i] * 94) / maximum);
    if (width > 0) {
      g.fillRect(94, y - 2, width, 5, i == 4 ? p.warn : p.accent);
    }
    char value[12];
    snprintf(value, sizeof(value), "%u", static_cast<unsigned>(counts[i]));
    drawText(g, value, 202, y, &lgfx::fonts::FreeMonoBold9pt7b, p.text, p.bg,
             lgfx::textdatum_t::middle_right);
    y += 17;
  }

  if (tools.running > 0 && !animation_->frame().quiet) {
    const int pulse = animation_->frame().pulse / 64;
    g.drawCircle(162, 68, 14 + pulse, p.grid);
  }
  (void)now;
}

void ScreenManager::drawMcp(uint32_t now) {
  auto& g = display_->canvas();
  const Palette p(g);
  const BuddyMetrics& metrics = state_->metrics();
  const McpSummary& mcp = metrics.mcp;

  drawChrome(g, "MCP", p.accent);

  constexpr int radarY = 100;
  constexpr int orbitInner = 34;
  constexpr int orbitOuter = 56;
  g.drawCircle(kCx, radarY, orbitInner, p.grid);
  g.drawCircle(kCx, radarY, orbitOuter, p.grid);

  const uint32_t period = 2400;
  const bool animate = !animation_->frame().quiet;
  const float sweep = animate ? (now % period) * (2.0f * kPi) / period : 0.0f;
  for (int i = 0; i < 4; ++i) {
    const float angle = sweep - i * 0.12f;
    const uint16_t color = i == 0 ? p.accent : p.grid;
    g.drawLine(kCx, radarY, kCx + static_cast<int>(cosf(angle) * orbitOuter),
               radarY + static_cast<int>(sinf(angle) * orbitOuter), color);
  }

  for (int i = 0; i < mcp.count && i < static_cast<int>(kMcpMaxEntries); ++i) {
    const float angle = (i * (2.0f * kPi)) / (mcp.count > 0 ? mcp.count : 1) - kPi / 2.0f;
    const bool healthy = mcp.entries[i].status == McpStatus::Connected;
    const int radius = healthy ? orbitInner : orbitOuter;
    const int x = kCx + static_cast<int>(cosf(angle) * radius);
    const int y = radarY + static_cast<int>(sinf(angle) * radius);
    g.fillCircle(x, y, 3, mcpColor(g, mcp.entries[i].status));
  }

  char summary[20];
  snprintf(summary, sizeof(summary), "%u/%u ONLINE", static_cast<unsigned>(mcp.online),
           static_cast<unsigned>(mcp.total));
  drawText(g, summary, kCx, 164, &lgfx::fonts::FreeSansBold9pt7b,
           mcp.online > 0 ? p.ok : p.muted, p.bg);

  int y = 182;
  int shown = 0;
  for (int i = 0; i < mcp.count && shown < 2; ++i, ++shown) {
    char line[28];
    snprintf(line, sizeof(line), "%s %s", mcp.entries[i].alias, mcpLabel(mcp.entries[i].status));
    drawText(g, line, kCx, y, &lgfx::fonts::FreeSans9pt7b,
             mcpColor(g, mcp.entries[i].status), p.bg);
    y += 12;
  }
  if (mcp.count > 2) {
    char more[16];
    snprintf(more, sizeof(more), "+%u MORE", static_cast<unsigned>(mcp.count - 2));
    drawText(g, more, kCx, 204, &lgfx::fonts::FreeSans9pt7b, p.muted, p.bg);
  }
  (void)now;
}

void ScreenManager::drawSystem(uint32_t now) {
  auto& g = display_->canvas();
  const Palette p(g);
  const Versions& versions = state_->versions();

  drawChrome(g, "SYSTEM", p.accent);

  drawRow(g, 58, "USB", state_->usb() == LinkState::Connected ? "CONNECTED" : "NO LINK",
          state_->usb() == LinkState::Connected ? p.ok : p.error);

  const char* bridge = versions.bridgeKnown ? versions.bridge : "--";
  uint16_t bridgeColor = p.muted;
  if (state_->bridge() == BridgeState::Ready) {
    bridgeColor = p.ok;
  } else if (state_->bridge() == BridgeState::Degraded) {
    bridgeColor = p.warn;
  }
  drawRow(g, 78, "BRIDGE", bridge, bridgeColor);

  const char* opencode = state_->opencode() == OpenCodeState::Connected ? "CONNECTED" : "OFFLINE";
  const uint16_t opencodeColor =
      state_->opencode() == OpenCodeState::Connected ? p.ok : p.error;
  drawRow(g, 98, "OPENCODE", opencode, opencodeColor);

  drawRow(g, 118, "FW", versions.firmware, p.text);

  char protocol[12];
  snprintf(protocol, sizeof(protocol), "v%u", static_cast<unsigned>(versions.protocol));
  drawRow(g, 138, "PROTO", protocol, p.text);

  char diagnostic[28];
  snprintf(diagnostic, sizeof(diagnostic), "DIAG %s", state_->diagnostic());
  drawText(g, diagnostic, kCx, 164, &lgfx::fonts::FreeSans9pt7b, p.muted, p.bg);

#if defined(BUDDY_MOCK_MODE) && BUDDY_MOCK_MODE
  drawText(g, "MOCK DATA", kCx, 186, &lgfx::fonts::FreeSans9pt7b, p.warn, p.bg);
#endif

  drawText(g, "OPENCODE BUDDY", kCx, 206, &lgfx::fonts::FreeSans9pt7b, p.grid, p.bg);
  (void)now;
}

void ScreenManager::drawToast(lgfx::LGFX_Sprite& g, uint32_t now) {
  if (toast_[0] == '\0' || now >= toastUntil_) {
    return;
  }
  const Palette p(g);
  g.fillRect(58, 100, 104, 26, p.surface);
  g.drawRect(58, 100, 104, 26, p.accent);
  drawText(g, toast_, kCx, 113, &lgfx::fonts::FreeSansBold9pt7b, p.accent, p.surface);
}

}  // namespace buddy
