#pragma once

#include <cstddef>
#include <cstdint>

#include "BuddyState.h"

namespace buddy {

// The three languages the device renders. The numeric values are persisted in
// NVS and sent by the bridge (`config.language`), so they must stay stable.
enum class Language : uint8_t { English = 0, French = 1, German = 2 };

constexpr uint8_t kLanguageCount = 3;

Language languageFrom(uint8_t value);

// Every fixed label on the six screens, the toasts and the system values goes
// through this table. Product names (OpenCode, OpenCode Buddy, MCP, Shell) are
// never translated.
enum class TextId : uint8_t {
  TitleBuddy,
  TitleSession,
  TitleTokens,
  TitleTools,
  TitleMcp,
  TitleSystem,
  LastSnapshot,
  PermissionTitle,
  SessionTotal,
  TokenIn,
  TokenOut,
  CtxLabel,
  ToolDone,
  ToolFailed,
  ToolRunning,
  ToolRead,
  ToolEdit,
  ToolShell,
  ToolSearch,
  ToolMcp,
  ToolOther,
  McpUnknown,
  McpOnline,
  McpPending,
  McpDisabled,
  McpFailed,
  McpAuth,
  UsbHost,
  BridgeLabel,
  OpenCodeLabel,
  OpenCodeVersionLabel,
  FirmwareLabel,
  BridgeVersionLabel,
  ProtocolLabel,
  ValueReady,
  ValueDegraded,
  ValueOnline,
  ValueOffline,
  ValuePresent,
  ValueNoHost,
  SourceLive,
  SourceMock,
  SourceOffline,
  SourceStale,
  ToastQuiet,
  ToastLoud,
  ToastReset,
  DiagnosticLabel,
  SessionsOne,
  SessionsMany,
  Attempt,
  McpTotals,
  McpShown,
  Count,
};

const char* tr(Language language, TextId id);

// State vocabulary. Permission and user-input states are the only ones that
// carry a cross-session interaction count suffix; the count is rendered as
// "Label (2)" so a pending prompt cannot hide behind a plain activity label.
const char* stateLabel(Language language, BuddyState state);
const char* stateText(char (&out)[40], Language language, BuddyState state,
                      const BuddyMetrics& metrics);

const char* toolLabel(Language language, unsigned index);
const char* mcpStatusLabel(Language language, McpStatus status);

// The three strings below have language-specific singular/plural or word order,
// so they are formatted centrally rather than concatenated at the call site.
void formatSessionCount(char* out, size_t capacity, Language language, unsigned count);
void formatAttempt(char* out, size_t capacity, Language language, unsigned attempt);
void formatMcpTotals(char* out, size_t capacity, Language language, unsigned online,
                     unsigned total);
void formatMcpShown(char* out, size_t capacity, Language language, unsigned shown,
                    unsigned total);

}  // namespace buddy
