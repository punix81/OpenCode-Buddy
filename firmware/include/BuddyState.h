#pragma once

#include <cstdint>

#include "Config.h"

namespace buddy {

// The normalized vocabulary the firmware understands. It contains no OpenCode
// event names: the bridge is responsible for mapping OpenCode to this enum.
enum class BuddyState : uint8_t {
  Offline = 0,
  Idle,
  Thinking,
  Generating,
  Working,
  PermissionRequired,
  UserInputRequired,
  Success,
  Error,
  Compacting,
  Retrying,
  Interrupted,
  Count,
};

enum class ScreenId : uint8_t {
  Buddy = 0,
  Session,
  Tokens,
  Tools,
  Mcp,
  System,
  Count,
};

enum class LinkState : uint8_t { Disconnected = 0, Connected };
enum class BridgeState : uint8_t { Unknown = 0, Ready, Degraded };
enum class OpenCodeState : uint8_t { Unknown = 0, Connected, Offline };

enum class McpStatus : uint8_t {
  Unknown = 0,
  Connected,
  Pending,
  Disabled,
  Failed,
  NeedsAuth,
};

struct TokenUsage {
  bool inputKnown = false;
  bool outputKnown = false;
  bool totalKnown = false;
  uint32_t input = 0;
  uint32_t output = 0;
  uint64_t total = 0;
  bool contextAvailable = false;
  int16_t contextPercent = -1;
};

struct ToolUsage {
  // Success, failed, running, then read/edit/shell/search/MCP/other.
  uint16_t known = 0;
  uint32_t success = 0;
  uint32_t failed = 0;
  uint8_t running = 0;
  uint32_t read = 0;
  uint32_t edit = 0;
  uint32_t shell = 0;
  uint32_t search = 0;
  uint32_t mcp = 0;
  uint32_t other = 0;
};

struct McpEntry {
  char alias[kMcpAliasMax + 1] = {0};
  McpStatus status = McpStatus::Unknown;
};

struct McpSummary {
  bool known = false;
  bool mock = false;
  uint8_t online = 0;
  uint8_t total = 0;
  uint8_t count = 0;
  McpEntry entries[kMcpMaxEntries];
};

struct BuddyMetrics {
  bool sessionsKnown = false;
  bool elapsedKnown = false;
  uint16_t activeSessions = 0;
  uint32_t elapsedSeconds = 0;
  uint8_t pendingPermissions = 0;
  uint8_t pendingQuestions = 0;
  uint8_t notifications = 0;
  uint8_t retryAttempt = 0;
  TokenUsage tokens;
  ToolUsage tools;
  McpSummary mcp;
};

struct Versions {
  char firmware[17] = "0.1.0";
  char bridge[17] = "--";
  uint8_t protocol = 1;
  bool bridgeKnown = false;
};

}  // namespace buddy
