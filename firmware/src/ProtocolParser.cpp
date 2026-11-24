#include "ProtocolParser.h"

#include <ArduinoJson.h>

#include <cstdio>
#include <cstring>

namespace buddy {
namespace {

constexpr const char* kStatusNames[] = {
    "offline", "idle", "thinking", "generating", "working", "permission_required",
    "user_input_required", "success", "error", "compacting", "retrying", "interrupted",
};

constexpr const char* kErrorCodes[] = {
    "E_PARSE", "E_TOO_LONG", "E_UNKNOWN_TYPE", "E_VERSION", "E_BOUNDS", "E_SERIAL", "E_INTERNAL",
};

int statusIndex(const char* value) {
  for (size_t i = 0; i < sizeof(kStatusNames) / sizeof(kStatusNames[0]); ++i) {
    if (strcmp(value, kStatusNames[i]) == 0) {
      return static_cast<int>(i);
    }
  }
  return -1;
}

int errorCodeIndex(const char* value) {
  for (size_t i = 0; i < sizeof(kErrorCodes) / sizeof(kErrorCodes[0]); ++i) {
    if (strcmp(value, kErrorCodes[i]) == 0) {
      return static_cast<int>(i);
    }
  }
  return -1;
}

bool isMcpStatus(const char* value) {
  return strcmp(value, "connected") == 0 || strcmp(value, "pending") == 0 ||
         strcmp(value, "disabled") == 0 || strcmp(value, "failed") == 0 ||
         strcmp(value, "needs_auth") == 0;
}

McpStatus mcpStatusFrom(const char* value) {
  if (strcmp(value, "connected") == 0) return McpStatus::Connected;
  if (strcmp(value, "pending") == 0) return McpStatus::Pending;
  if (strcmp(value, "disabled") == 0) return McpStatus::Disabled;
  if (strcmp(value, "failed") == 0) return McpStatus::Failed;
  return McpStatus::NeedsAuth;
}

const char* gestureName(InteractionGesture gesture) {
  switch (gesture) {
    case InteractionGesture::Short: return "short";
    case InteractionGesture::Double: return "double";
    case InteractionGesture::Long: return "long";
    case InteractionGesture::VeryLong: return "very_long";
  }
  return "short";
}

template <size_t N>
bool onlyKeys(JsonObjectConst object, const char* const (&allowed)[N]) {
  for (JsonPairConst pair : object) {
    const char* key = pair.key().c_str();
    bool found = false;
    for (size_t i = 0; i < N; ++i) {
      if (strcmp(key, allowed[i]) == 0) {
        found = true;
        break;
      }
    }
    if (!found) {
      return false;
    }
  }
  return true;
}

bool readU32(JsonVariantConst value, uint32_t& out) {
  if (!value.is<uint32_t>()) {
    return false;
  }
  out = value.as<uint32_t>();
  return true;
}

bool readU8(JsonVariantConst value, uint8_t& out) {
  uint32_t parsed = 0;
  if (!readU32(value, parsed) || parsed > 255) {
    return false;
  }
  out = static_cast<uint8_t>(parsed);
  return true;
}

bool readString(JsonVariantConst value, char* out, size_t capacity) {
  if (!value.is<const char*>()) {
    return false;
  }
  const char* text = value.as<const char*>();
  if (text == nullptr) {
    return false;
  }
  const size_t length = strlen(text);
  if (length >= capacity) {
    return false;
  }
  memcpy(out, text, length + 1);
  return true;
}

uint32_t clampU32(uint32_t value, uint32_t low, uint32_t high, bool& clamped) {
  if (value < low) {
    clamped = true;
    return low;
  }
  if (value > high) {
    clamped = true;
    return high;
  }
  return value;
}

struct ParsedState {
  BuddyState status = BuddyState::Offline;
  char model[41] = "--";
  char agent[25] = "--";
  BuddyMetrics metrics;
  BridgeState bridge = BridgeState::Ready;
  OpenCodeState opencode = OpenCodeState::Unknown;
  Versions versions;
  bool mock = false;
  char diagnostic[12] = "--";
  bool diagnosticSet = false;
};

}  // namespace

void ProtocolParser::begin(uint32_t bootCount, const char* firmwareVersion) {
  outSeq_ = 0;
  lastPeerSeq_ = 0;
  awaitingSnapshot_ = false;
  ready_ = false;
  fatal_ = false;
  lastRxMs_ = 0;
  boot_ = bootCount;
  snprintf(firmware_, sizeof(firmware_), "%s", firmwareVersion != nullptr ? firmwareVersion : "0.0.0");

  ackPending_ = false;
  warningPending_ = false;
  warningCode_ = nullptr;
  configPending_ = false;
  resyncPending_ = false;
  errorPending_ = false;
}

void ProtocolParser::resetOutbound() { outSeq_ = 0; }

void ProtocolParser::resetSession() {
  outSeq_ = 0;
  lastPeerSeq_ = 0;
  awaitingSnapshot_ = false;
  ready_ = false;
}

uint32_t ProtocolParser::nextSeq() {
  ++outSeq_;
  if (outSeq_ == 0) {
    outSeq_ = 1;
  }
  return outSeq_;
}

bool ProtocolParser::takeAck(uint32_t& ack) {
  if (!ackPending_) {
    return false;
  }
  ack = ackValue_;
  ackPending_ = false;
  return true;
}

bool ProtocolParser::takeWarning(const char*& code) {
  if (!warningPending_) {
    return false;
  }
  code = warningCode_ != nullptr ? warningCode_ : "E_BOUNDS";
  warningPending_ = false;
  return true;
}

bool ProtocolParser::takeConfig(ProtocolConfig& config) {
  if (!configPending_) {
    return false;
  }
  config = config_;
  configPending_ = false;
  return true;
}

bool ProtocolParser::takeResync(uint32_t& expected, uint32_t& received) {
  if (!resyncPending_) {
    return false;
  }
  expected = resyncExpected_;
  received = resyncReceived_;
  resyncPending_ = false;
  return true;
}

bool ProtocolParser::takeError(char* code, size_t capacity, bool& fatal, char* detail,
                               size_t detailCapacity) {
  if (!errorPending_) {
    return false;
  }
  snprintf(code, capacity, "%s", errorCode_);
  snprintf(detail, detailCapacity, "%s", errorDetail_);
  fatal = errorFatal_;
  errorPending_ = false;
  return true;
}

ParseCode ProtocolParser::handleLine(const char* line, size_t length, uint32_t now,
                                     StateManager& state) {
  if (line == nullptr || length == 0) {
    return ParseCode::Ignored;
  }
  if (length > kSerialLineMax - 1) {
    return ParseCode::TooLong;
  }

  JsonDocument document;
  const DeserializationError error = deserializeJson(document, line, length);
  if (error) {
    return ParseCode::ParseError;
  }
  if (!document.is<JsonObjectConst>()) {
    return ParseCode::ParseError;
  }

  JsonObjectConst root = document.as<JsonObjectConst>();

  const int version = root["v"] | -1;
  if (version != kProtocolMajor) {
    fatal_ = true;
    return ParseCode::VersionError;
  }

  const char* type = root["type"] | "";
  if (type[0] == '\0') {
    return ParseCode::ParseError;
  }

  uint32_t seq = 0;
  if (!readU32(root["seq"], seq) || seq == 0) {
    return ParseCode::BoundsError;
  }

  lastRxMs_ = now;

  // A ready with seq 1 always starts a new bridge session.
  if (strcmp(type, "ready") == 0 && seq == 1 && lastPeerSeq_ != 0) {
    lastPeerSeq_ = 0;
    awaitingSnapshot_ = false;
    ready_ = false;
  }

  const bool isHeartbeat = strcmp(type, "heartbeat") == 0;
  JsonObjectConst data;
  if (!isHeartbeat) {
    if (!root["data"].is<JsonObjectConst>()) {
      return ParseCode::ParseError;
    }
    data = root["data"].as<JsonObjectConst>();
  } else if (!root["data"].isUnbound()) {
    return ParseCode::ParseError;
  }

  // Sequence handling.
  if (awaitingSnapshot_ && seq > lastPeerSeq_) {
    lastPeerSeq_ = seq - 1;
    awaitingSnapshot_ = false;
  }
  if (seq == lastPeerSeq_) {
    ackPending_ = true;
    ackValue_ = lastPeerSeq_;
    return ParseCode::Duplicate;
  }
  if (seq < lastPeerSeq_) {
    return ParseCode::Ignored;
  }
  if (seq > lastPeerSeq_ + 1) {
    resyncPending_ = true;
    resyncExpected_ = lastPeerSeq_ + 1;
    resyncReceived_ = seq;
    awaitingSnapshot_ = true;
    return ParseCode::Gap;
  }

  // Type dispatch. Every applied message except heartbeat and ack is acknowledged.
  if (strcmp(type, "ready") == 0) {
    static const char* const allowed[] = {"bridge", "proto", "run"};
    if (!onlyKeys(data, allowed)) return ParseCode::ParseError;
    char bridge[17];
    if (!readString(data["bridge"], bridge, sizeof(bridge))) return ParseCode::ParseError;
    uint8_t protocol = 0;
    if (!readU8(data["proto"], protocol)) return ParseCode::ParseError;
    if (protocol != kProtocolMajor) {
      fatal_ = true;
      return ParseCode::VersionError;
    }
    char run[9];
    if (!readString(data["run"], run, sizeof(run))) return ParseCode::ParseError;
    for (size_t i = 0; run[i] != '\0'; ++i) {
      const char c = run[i];
      if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) {
        return ParseCode::ParseError;
      }
    }
    Versions versions = state.versions();
    snprintf(versions.bridge, sizeof(versions.bridge), "%s", bridge);
    versions.bridgeKnown = true;
    versions.protocol = protocol;
    state.setVersions(versions);
    state.setLink(state.usb(), BridgeState::Ready, state.opencode());
    ready_ = true;
  } else if (strcmp(type, "config") == 0) {
    static const char* const allowed[] = {"language", "quietMode", "autoReturnSeconds", "gestures",
                                          "source"};
    if (!onlyKeys(data, allowed)) return ParseCode::ParseError;
    char language[3];
    if (!readString(data["language"], language, sizeof(language))) return ParseCode::ParseError;
    if (strcmp(language, "en") != 0 && strcmp(language, "fr") != 0 &&
        strcmp(language, "de") != 0) {
      return ParseCode::BoundsError;
    }
    if (!data["quietMode"].is<bool>()) return ParseCode::ParseError;
    uint32_t autoReturn = 0;
    if (!readU32(data["autoReturnSeconds"], autoReturn)) return ParseCode::ParseError;
    if (!data["gestures"].is<JsonObjectConst>()) return ParseCode::ParseError;
    JsonObjectConst gestures = data["gestures"].as<JsonObjectConst>();
    static const char* const gestureKeys[] = {"debounceMs", "doublePressWindowMs", "longPressMs",
                                              "veryLongPressMs"};
    if (!onlyKeys(gestures, gestureKeys)) return ParseCode::ParseError;
    uint32_t debounce = 0, doubleWindow = 0, longPress = 0, veryLong = 0;
    if (!readU32(gestures["debounceMs"], debounce) ||
        !readU32(gestures["doublePressWindowMs"], doubleWindow) ||
        !readU32(gestures["longPressMs"], longPress) ||
        !readU32(gestures["veryLongPressMs"], veryLong)) {
      return ParseCode::ParseError;
    }
    char source[5];
    if (!readString(data["source"], source, sizeof(source))) return ParseCode::ParseError;
    if (strcmp(source, "live") != 0 && strcmp(source, "mock") != 0) return ParseCode::BoundsError;

    bool clamped = false;
    config_.language = language[0] == 'f' ? 1 : (language[0] == 'd' ? 2 : 0);
    config_.quiet = data["quietMode"].as<bool>();
    config_.autoReturnSeconds = static_cast<uint16_t>(clampU32(autoReturn, 10, 600, clamped));
    config_.debounceMs = static_cast<uint16_t>(clampU32(debounce, 10, 200, clamped));
    config_.doublePressWindowMs =
        static_cast<uint16_t>(clampU32(doubleWindow, 150, 800, clamped));
    config_.longPressMs = static_cast<uint16_t>(clampU32(longPress, 800, 3000, clamped));
    config_.veryLongPressMs = static_cast<uint16_t>(clampU32(veryLong, 3000, 10000, clamped));
    config_.mock = strcmp(source, "mock") == 0;
    config_.valid = true;
    configPending_ = true;
    if (clamped) {
      warningPending_ = true;
      warningCode_ = "E_BOUNDS";
    }
  } else if (strcmp(type, "state") == 0) {
    static const char* const allowed[] = {
        "status", "model", "agent", "activeSessions", "elapsedSeconds", "pendingPermissions",
        "pendingQuestions", "notifications", "retryAttempt", "tokens", "tools", "mcp",
        "connection", "versions", "source", "diagnostic"};
    if (!onlyKeys(data, allowed)) return ParseCode::ParseError;

    ParsedState parsed;
    if (data["status"].isUnbound()) return ParseCode::ParseError;
    const char* status = data["status"] | "";
    const int statusValue = statusIndex(status);
    if (statusValue < 0) return ParseCode::BoundsError;
    parsed.status = static_cast<BuddyState>(statusValue);

    uint32_t activeSessions = 0;
    if (!readU32(data["activeSessions"], activeSessions)) return ParseCode::ParseError;
    bool clamped = false;
    parsed.metrics.activeSessions =
        static_cast<uint16_t>(clampU32(activeSessions, 0, 65535, clamped));

    if (!data["connection"].is<JsonObjectConst>()) return ParseCode::ParseError;
    JsonObjectConst connection = data["connection"].as<JsonObjectConst>();
    static const char* const connectionKeys[] = {"bridge", "opencode"};
    if (!onlyKeys(connection, connectionKeys)) return ParseCode::ParseError;
    if (connection["bridge"].isUnbound() || connection["opencode"].isUnbound()) {
      return ParseCode::ParseError;
    }
    const char* bridge = connection["bridge"] | "";
    const char* opencode = connection["opencode"] | "";
    if (strcmp(bridge, "ready") == 0) {
      parsed.bridge = BridgeState::Ready;
    } else if (strcmp(bridge, "degraded") == 0) {
      parsed.bridge = BridgeState::Degraded;
    } else {
      return ParseCode::BoundsError;
    }
    if (strcmp(opencode, "connected") == 0) {
      parsed.opencode = OpenCodeState::Connected;
    } else if (strcmp(opencode, "offline") == 0) {
      parsed.opencode = OpenCodeState::Offline;
    } else if (strcmp(opencode, "unknown") == 0) {
      parsed.opencode = OpenCodeState::Unknown;
    } else {
      return ParseCode::BoundsError;
    }

    if (!data["versions"].is<JsonObjectConst>()) return ParseCode::ParseError;
    JsonObjectConst versions = data["versions"].as<JsonObjectConst>();
    static const char* const versionKeys[] = {"bridge", "protocol"};
    if (!onlyKeys(versions, versionKeys)) return ParseCode::ParseError;
    if (!readString(versions["bridge"], parsed.versions.bridge, sizeof(parsed.versions.bridge))) {
      return ParseCode::ParseError;
    }
    uint8_t protocol = 0;
    if (!readU8(versions["protocol"], protocol)) return ParseCode::ParseError;
    parsed.versions.bridgeKnown = true;
    parsed.versions.protocol = protocol;

    if (data["source"].isUnbound()) return ParseCode::ParseError;
    const char* source = data["source"] | "";
    if (strcmp(source, "live") == 0) {
      parsed.mock = false;
    } else if (strcmp(source, "mock") == 0) {
      parsed.mock = true;
    } else {
      return ParseCode::BoundsError;
    }

    // Documented maxima: model 40 chars, agent 24 (protocol v1 §9). A value that
    // is not a string is a parse error; a string that is too long is out of
    // bounds, which is what the bridge validator reports as well.
    if (!data["model"].isUnbound()) {
      if (data["model"].isNull()) {
        snprintf(parsed.model, sizeof(parsed.model), "--");
      } else if (!data["model"].is<const char*>()) {
        return ParseCode::ParseError;
      } else if (strlen(data["model"].as<const char*>()) >= sizeof(parsed.model)) {
        return ParseCode::BoundsError;
      } else {
        snprintf(parsed.model, sizeof(parsed.model), "%s", data["model"].as<const char*>());
      }
    }
    if (!data["agent"].isUnbound()) {
      if (data["agent"].isNull()) {
        snprintf(parsed.agent, sizeof(parsed.agent), "--");
      } else if (!data["agent"].is<const char*>()) {
        return ParseCode::ParseError;
      } else if (strlen(data["agent"].as<const char*>()) >= sizeof(parsed.agent)) {
        return ParseCode::BoundsError;
      } else {
        snprintf(parsed.agent, sizeof(parsed.agent), "%s", data["agent"].as<const char*>());
      }
    }

    uint32_t value = 0;
    if (!data["elapsedSeconds"].isUnbound()) {
      if (!readU32(data["elapsedSeconds"], value)) return ParseCode::ParseError;
      parsed.metrics.elapsedSeconds = value;
    }
    if (!data["pendingPermissions"].isUnbound()) {
      if (!readU8(data["pendingPermissions"], parsed.metrics.pendingPermissions)) {
        return ParseCode::ParseError;
      }
    }
    if (!data["pendingQuestions"].isUnbound()) {
      if (!readU8(data["pendingQuestions"], parsed.metrics.pendingQuestions)) {
        return ParseCode::ParseError;
      }
    }
    if (!data["notifications"].isUnbound()) {
      if (!readU8(data["notifications"], parsed.metrics.notifications)) {
        return ParseCode::ParseError;
      }
      if (parsed.metrics.notifications > 99) parsed.metrics.notifications = 99;
    }
    if (!data["retryAttempt"].isUnbound()) {
      if (!readU8(data["retryAttempt"], parsed.metrics.retryAttempt)) {
        return ParseCode::ParseError;
      }
    }

    if (!data["tokens"].isUnbound()) {
      if (!data["tokens"].is<JsonObjectConst>()) return ParseCode::ParseError;
      JsonObjectConst tokens = data["tokens"].as<JsonObjectConst>();
      static const char* const tokenKeys[] = {"input", "output", "total", "contextPct"};
      if (!onlyKeys(tokens, tokenKeys)) return ParseCode::ParseError;
      bool hasInput = false, hasOutput = false, hasTotal = false;
      uint32_t input = 0, output = 0, total = 0;
      if (!tokens["input"].isUnbound() && !tokens["input"].isNull()) {
        if (!readU32(tokens["input"], input)) return ParseCode::ParseError;
        hasInput = true;
      }
      if (!tokens["output"].isUnbound() && !tokens["output"].isNull()) {
        if (!readU32(tokens["output"], output)) return ParseCode::ParseError;
        hasOutput = true;
      }
      if (!tokens["total"].isUnbound() && !tokens["total"].isNull()) {
        if (!readU32(tokens["total"], total)) return ParseCode::ParseError;
        hasTotal = true;
      }
      if (!hasTotal && hasInput && hasOutput) {
        total = input + output;
        hasTotal = true;
      }
      parsed.metrics.tokens.available = hasInput || hasOutput || hasTotal;
      parsed.metrics.tokens.input = hasInput ? input : 0;
      parsed.metrics.tokens.output = hasOutput ? output : 0;
      parsed.metrics.tokens.total = hasTotal ? total : 0;
      if (!tokens["contextPct"].isUnbound() && !tokens["contextPct"].isNull()) {
        if (!tokens["contextPct"].is<float>() && !tokens["contextPct"].is<int>()) {
          return ParseCode::ParseError;
        }
        const float percent = tokens["contextPct"].as<float>();
        if (percent < 0.0f || percent > 100.0f) return ParseCode::BoundsError;
        parsed.metrics.tokens.contextAvailable = true;
        parsed.metrics.tokens.contextPercent = static_cast<int16_t>(percent);
      }
    }

    if (!data["tools"].isUnbound()) {
      if (!data["tools"].is<JsonObjectConst>()) return ParseCode::ParseError;
      JsonObjectConst tools = data["tools"].as<JsonObjectConst>();
      static const char* const toolKeys[] = {"success", "failed", "running", "categories"};
      if (!onlyKeys(tools, toolKeys)) return ParseCode::ParseError;
      if (!tools["success"].isUnbound()) {
        if (!readU32(tools["success"], parsed.metrics.tools.success)) return ParseCode::ParseError;
      }
      if (!tools["failed"].isUnbound()) {
        if (!readU32(tools["failed"], parsed.metrics.tools.failed)) return ParseCode::ParseError;
      }
      if (!tools["running"].isUnbound()) {
        if (!readU8(tools["running"], parsed.metrics.tools.running)) return ParseCode::ParseError;
      }
      if (!tools["categories"].isUnbound()) {
        if (!tools["categories"].is<JsonObjectConst>()) return ParseCode::ParseError;
        JsonObjectConst categories = tools["categories"].as<JsonObjectConst>();
        static const char* const categoryKeys[] = {"read", "edit", "shell", "search", "mcp", "other"};
        if (!onlyKeys(categories, categoryKeys)) return ParseCode::ParseError;
        if (!categories["read"].isUnbound() &&
            !readU32(categories["read"], parsed.metrics.tools.read)) return ParseCode::ParseError;
        if (!categories["edit"].isUnbound() &&
            !readU32(categories["edit"], parsed.metrics.tools.edit)) return ParseCode::ParseError;
        if (!categories["shell"].isUnbound() &&
            !readU32(categories["shell"], parsed.metrics.tools.shell)) return ParseCode::ParseError;
        if (!categories["search"].isUnbound() &&
            !readU32(categories["search"], parsed.metrics.tools.search)) return ParseCode::ParseError;
        if (!categories["mcp"].isUnbound() &&
            !readU32(categories["mcp"], parsed.metrics.tools.mcp)) return ParseCode::ParseError;
        if (!categories["other"].isUnbound() &&
            !readU32(categories["other"], parsed.metrics.tools.other)) return ParseCode::ParseError;
      }
    }

    if (!data["mcp"].isUnbound()) {
      if (!data["mcp"].is<JsonObjectConst>()) return ParseCode::ParseError;
      JsonObjectConst mcp = data["mcp"].as<JsonObjectConst>();
      static const char* const mcpKeys[] = {"online", "total"};
      if (!onlyKeys(mcp, mcpKeys)) return ParseCode::ParseError;
      if (!readU8(mcp["online"], parsed.metrics.mcp.online)) return ParseCode::ParseError;
      if (!readU8(mcp["total"], parsed.metrics.mcp.total)) return ParseCode::ParseError;
    }

    if (!data["diagnostic"].isUnbound()) {
      if (!data["diagnostic"].is<JsonObjectConst>()) return ParseCode::ParseError;
      JsonObjectConst diagnostic = data["diagnostic"].as<JsonObjectConst>();
      static const char* const diagnosticKeys[] = {"code"};
      if (!onlyKeys(diagnostic, diagnosticKeys)) return ParseCode::ParseError;
      const char* code = diagnostic["code"] | "";
      if (errorCodeIndex(code) < 0) return ParseCode::BoundsError;
      snprintf(parsed.diagnostic, sizeof(parsed.diagnostic), "%s", code);
      parsed.diagnosticSet = true;
    }

    if (clamped) {
      warningPending_ = true;
      warningCode_ = "E_BOUNDS";
    }

    // Apply atomically.
    state.setModel(parsed.model);
    state.setAgent(parsed.agent);
    state.mutableMetrics() = parsed.metrics;
    state.setVersions(parsed.versions);
    state.setMock(parsed.mock);
    state.setDiagnostic(parsed.diagnosticSet ? parsed.diagnostic : "--");
    state.setLink(state.usb(), parsed.bridge, parsed.opencode);
    if (state.state() != parsed.status) {
      state.setState(parsed.status, now);
    }
    ready_ = true;
  } else if (strcmp(type, "mcp_status") == 0) {
    static const char* const allowed[] = {"online", "total", "servers", "source"};
    if (!onlyKeys(data, allowed)) return ParseCode::ParseError;
    uint8_t online = 0, total = 0;
    if (!readU8(data["online"], online)) return ParseCode::ParseError;
    if (!readU8(data["total"], total)) return ParseCode::ParseError;
    char source[5];
    if (!readString(data["source"], source, sizeof(source))) return ParseCode::ParseError;
    if (strcmp(source, "live") != 0 && strcmp(source, "mock") != 0) return ParseCode::BoundsError;
    if (!data["servers"].is<JsonArrayConst>()) return ParseCode::ParseError;
    JsonArrayConst servers = data["servers"].as<JsonArrayConst>();
    if (servers.size() > kMcpMaxEntries) return ParseCode::BoundsError;

    McpSummary summary;
    summary.online = online;
    summary.total = total;
    for (JsonVariantConst item : servers) {
      if (!item.is<JsonObjectConst>()) return ParseCode::ParseError;
      JsonObjectConst server = item.as<JsonObjectConst>();
      static const char* const serverKeys[] = {"alias", "status"};
      if (!onlyKeys(server, serverKeys)) return ParseCode::ParseError;
      if (summary.count >= kMcpMaxEntries) return ParseCode::BoundsError;
      McpEntry& entry = summary.entries[summary.count];
      if (!readString(server["alias"], entry.alias, sizeof(entry.alias))) {
        return ParseCode::ParseError;
      }
      const char* status = server["status"] | "";
      if (!isMcpStatus(status)) return ParseCode::BoundsError;
      entry.status = mcpStatusFrom(status);
      ++summary.count;
    }
    state.mutableMetrics().mcp = summary;
    state.setMock(strcmp(source, "mock") == 0);
  } else if (strcmp(type, "heartbeat") == 0) {
    // No payload; only liveness.
  } else if (strcmp(type, "ack") == 0) {
    static const char* const allowed[] = {"ack", "warning"};
    if (!onlyKeys(data, allowed)) return ParseCode::ParseError;
    uint32_t ack = 0;
    if (!readU32(data["ack"], ack) || ack == 0) return ParseCode::BoundsError;
    // Acks are advisory and never acknowledged.
    lastPeerSeq_ = seq;
    return ParseCode::Ok;
  } else if (strcmp(type, "error") == 0) {
    static const char* const allowed[] = {"code", "fatal", "detail"};
    if (!onlyKeys(data, allowed)) return ParseCode::ParseError;
    const char* code = data["code"] | "";
    if (errorCodeIndex(code) < 0) return ParseCode::BoundsError;
    if (!data["fatal"].is<bool>()) return ParseCode::ParseError;
    char detail[49] = "";
    if (!data["detail"].isUnbound() && !readString(data["detail"], detail, sizeof(detail))) {
      return ParseCode::ParseError;
    }
    state.setDiagnostic(code);
  } else {
    return ParseCode::UnknownType;
  }

  lastPeerSeq_ = seq;
  if (!isHeartbeat) {
    ackPending_ = true;
    ackValue_ = seq;
  }
  return ParseCode::Ok;
}

size_t ProtocolParser::encodeHello(char* out, size_t capacity) {
  const int written = snprintf(
      out, capacity,
      "{\"v\":1,\"type\":\"hello\",\"seq\":%lu,\"data\":{\"device\":\"opencode-buddy\","
      "\"fw\":\"%s\",\"proto\":[1],\"maxLine\":2048,\"boot\":%lu}}",
      static_cast<unsigned long>(nextSeq()), firmware_, static_cast<unsigned long>(boot_));
  return written > 0 && static_cast<size_t>(written) < capacity ? static_cast<size_t>(written) : 0;
}

size_t ProtocolParser::encodeHeartbeat(char* out, size_t capacity) {
  const int written = snprintf(out, capacity, "{\"v\":1,\"type\":\"heartbeat\",\"seq\":%lu}",
                               static_cast<unsigned long>(nextSeq()));
  return written > 0 && static_cast<size_t>(written) < capacity ? static_cast<size_t>(written) : 0;
}

size_t ProtocolParser::encodeAck(char* out, size_t capacity, uint32_t ack, const char* warning) {
  const int written = snprintf(
      out, capacity,
      "{\"v\":1,\"type\":\"ack\",\"seq\":%lu,\"data\":{\"ack\":%lu,\"warning\":%s%s%s}}",
      static_cast<unsigned long>(nextSeq()), static_cast<unsigned long>(ack),
      warning != nullptr ? "\"" : "", warning != nullptr ? warning : "null",
      warning != nullptr ? "\"" : "");
  return written > 0 && static_cast<size_t>(written) < capacity ? static_cast<size_t>(written) : 0;
}

size_t ProtocolParser::encodeInteraction(char* out, size_t capacity, InteractionGesture gesture,
                                         uint8_t screen) {
  const int written = snprintf(
      out, capacity,
      "{\"v\":1,\"type\":\"interaction\",\"seq\":%lu,\"data\":{\"gesture\":\"%s\",\"screen\":%u}}",
      static_cast<unsigned long>(nextSeq()), gestureName(gesture), static_cast<unsigned>(screen));
  return written > 0 && static_cast<size_t>(written) < capacity ? static_cast<size_t>(written) : 0;
}

size_t ProtocolParser::encodeResync(char* out, size_t capacity, const char* reason,
                                    uint32_t expected, uint32_t received) {
  const int written = snprintf(
      out, capacity,
      "{\"v\":1,\"type\":\"resync\",\"seq\":%lu,\"data\":{\"reason\":\"%s\","
      "\"expected\":%lu,\"received\":%lu}}",
      static_cast<unsigned long>(nextSeq()), reason, static_cast<unsigned long>(expected),
      static_cast<unsigned long>(received));
  return written > 0 && static_cast<size_t>(written) < capacity ? static_cast<size_t>(written) : 0;
}

size_t ProtocolParser::encodeError(char* out, size_t capacity, const char* code, bool fatal,
                                   const char* detail) {
  const int written = snprintf(
      out, capacity,
      "{\"v\":1,\"type\":\"error\",\"seq\":%lu,\"data\":{\"code\":\"%s\",\"fatal\":%s,"
      "\"detail\":\"%s\"}}",
      static_cast<unsigned long>(nextSeq()), code, fatal ? "true" : "false",
      detail != nullptr ? detail : "");
  return written > 0 && static_cast<size_t>(written) < capacity ? static_cast<size_t>(written) : 0;
}

}  // namespace buddy
