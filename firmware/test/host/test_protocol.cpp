#include <ArduinoJson.h>

#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "ProtocolParser.h"
#include "StateManager.h"

namespace {

int failures = 0;

void check(bool condition, const std::string& message) {
  if (!condition) {
    std::cerr << "FAIL " << message << "\n";
    ++failures;
  }
}

const char* codeName(buddy::ParseCode code) {
  switch (code) {
    case buddy::ParseCode::Ok: return "Ok";
    case buddy::ParseCode::Ignored: return "Ignored";
    case buddy::ParseCode::Duplicate: return "Duplicate";
    case buddy::ParseCode::Gap: return "Gap";
    case buddy::ParseCode::ParseError: return "ParseError";
    case buddy::ParseCode::TooLong: return "TooLong";
    case buddy::ParseCode::UnknownType: return "UnknownType";
    case buddy::ParseCode::VersionError: return "VersionError";
    case buddy::ParseCode::BoundsError: return "BoundsError";
    case buddy::ParseCode::InternalError: return "InternalError";
  }
  return "?";
}

buddy::ParseCode expectedCode(const char* name) {
  if (strcmp(name, "E_PARSE") == 0) return buddy::ParseCode::ParseError;
  if (strcmp(name, "E_TOO_LONG") == 0) return buddy::ParseCode::TooLong;
  if (strcmp(name, "E_UNKNOWN_TYPE") == 0) return buddy::ParseCode::UnknownType;
  if (strcmp(name, "E_VERSION") == 0) return buddy::ParseCode::VersionError;
  if (strcmp(name, "E_BOUNDS") == 0) return buddy::ParseCode::BoundsError;
  return buddy::ParseCode::InternalError;
}

std::string serializeVariant(JsonVariantConst value) {
  char buffer[2048];
  const size_t length = serializeJson(value, buffer, sizeof(buffer));
  return std::string(buffer, length);
}

// Advances the peer sequence with valid heartbeats so a standalone vector with
// seq=N is tested as a message that follows seq 1..N-1.
void alignSequence(buddy::ProtocolParser& parser, buddy::StateManager& state, uint32_t seq,
                   uint32_t now = 1000) {
  for (uint32_t i = 1; i < seq; ++i) {
    const std::string heartbeat =
        std::string("{\"v\":1,\"type\":\"heartbeat\",\"seq\":") + std::to_string(i) + "}";
    parser.handleLine(heartbeat.c_str(), heartbeat.size(), now, state);
  }
}

bool isDeviceInbound(const char* type) {
  return strcmp(type, "ready") == 0 || strcmp(type, "config") == 0 ||
         strcmp(type, "state") == 0 || strcmp(type, "mcp_status") == 0 ||
         strcmp(type, "heartbeat") == 0 || strcmp(type, "ack") == 0 ||
         strcmp(type, "error") == 0;
}

buddy::ParseCode feed(buddy::ProtocolParser& parser, buddy::StateManager& state,
                      const std::string& line, uint32_t now = 1000) {
  return parser.handleLine(line.c_str(), line.size(), now, state);
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "usage: test_protocol <messages.json>\n";
    return 2;
  }
  std::ifstream input(argv[1]);
  if (!input) {
    std::cerr << "cannot read " << argv[1] << "\n";
    return 2;
  }
  std::stringstream buffer;
  buffer << input.rdbuf();
  const std::string text = buffer.str();

  JsonDocument document;
  if (deserializeJson(document, text.c_str(), text.size()) != DeserializationError::Ok) {
    std::cerr << "vectors are not valid JSON\n";
    return 2;
  }

  JsonArrayConst valid = document["valid"].as<JsonArrayConst>();
  for (JsonVariantConst item : valid) {
    const char* name = item["name"] | "";
    const std::string line = serializeVariant(item["message"]);
    const char* type = item["message"]["type"] | "";

    buddy::ProtocolParser parser;
    buddy::StateManager state;
    parser.begin(1, "0.2.0");
    state.begin(0);
    const uint32_t seq = item["message"]["seq"] | 0;
    alignSequence(parser, state, seq);
    const buddy::ParseCode code = feed(parser, state, line);
    const buddy::ParseCode expected =
        isDeviceInbound(type) ? buddy::ParseCode::Ok : buddy::ParseCode::UnknownType;
    check(code == expected,
          std::string(name) + " expected=" + codeName(expected) + " actual=" + codeName(code));
  }

  JsonArrayConst invalid = document["invalid"].as<JsonArrayConst>();
  for (JsonVariantConst item : invalid) {
    const char* name = item["name"] | "";
    std::string line;
    const char* raw = nullptr;
    if (item["line"].is<const char*>()) {
      raw = item["line"].as<const char*>();
    }
    if (raw != nullptr) {
      line = raw;
    } else {
      line = serializeVariant(item["message"]);
    }
    const char* type = item["message"]["type"] | "";

    buddy::ProtocolParser parser;
    buddy::StateManager state;
    parser.begin(1, "0.2.0");
    state.begin(0);
    const uint32_t seq = item["message"]["seq"] | 0;
    alignSequence(parser, state, seq);
    const buddy::ParseCode code = feed(parser, state, line);
    buddy::ParseCode expected = expectedCode(item["error"] | "");
    // Device-side parser rejects messages that only flow device -> bridge,
    // even if their payload is otherwise valid.
    if (strcmp(type, "hello") == 0 || strcmp(type, "interaction") == 0 ||
        strcmp(type, "resync") == 0) {
      expected = buddy::ParseCode::UnknownType;
    }
    check(code == expected,
          std::string(name) + " expected=" + codeName(expected) + " actual=" + codeName(code));
  }

  // Sequence handling and ACK.
  {
    buddy::ProtocolParser parser;
    buddy::StateManager state;
    parser.begin(1, "0.2.0");
    state.begin(0);
    const std::string ready =
        "{\"v\":1,\"type\":\"ready\",\"seq\":1,\"data\":{\"bridge\":\"0.2.0\",\"proto\":1,\"run\":\"abcd1234\"}}";
    const std::string config =
        "{\"v\":1,\"type\":\"config\",\"seq\":2,\"data\":{\"language\":\"en\",\"quietMode\":true,"
        "\"autoReturnSeconds\":60,\"gestures\":{\"debounceMs\":35,\"doublePressWindowMs\":350,"
        "\"longPressMs\":1500,\"veryLongPressMs\":5000},\"source\":\"live\"}}";
    const std::string stateLine =
        "{\"v\":1,\"type\":\"state\",\"seq\":3,\"data\":{\"status\":\"working\",\"activeSessions\":1,"
        "\"connection\":{\"bridge\":\"ready\",\"opencode\":\"connected\"},"
        "\"versions\":{\"bridge\":\"0.2.0\",\"protocol\":1},\"source\":\"live\"}}";

    check(feed(parser, state, ready) == buddy::ParseCode::Ok, "sequence ready");
    check(feed(parser, state, config) == buddy::ParseCode::Ok, "sequence config");
    check(feed(parser, state, stateLine) == buddy::ParseCode::Ok, "sequence state");

    uint32_t ack = 0;
    check(parser.takeAck(ack) && ack == 3, "ack value");
    check(feed(parser, state, stateLine) == buddy::ParseCode::Duplicate, "duplicate");
    check(feed(parser, state, config) == buddy::ParseCode::Ignored, "stale");
    check(feed(parser, state,
               "{\"v\":1,\"type\":\"heartbeat\",\"seq\":6}") == buddy::ParseCode::Gap,
          "gap");

    uint32_t expected = 0, received = 0;
    check(parser.takeResync(expected, received) && expected == 4 && received == 6, "resync values");

    const std::string state6 =
        "{\"v\":1,\"type\":\"state\",\"seq\":6,\"data\":{\"status\":\"idle\",\"activeSessions\":0,"
        "\"connection\":{\"bridge\":\"ready\",\"opencode\":\"unknown\"},"
        "\"versions\":{\"bridge\":\"0.2.0\",\"protocol\":1},\"source\":\"live\"}}";
    check(feed(parser, state, state6) == buddy::ParseCode::Ok, "state after resync");
    check(state.state() == buddy::BuddyState::Idle, "state applied after resync");
  }

  // Invalid input must not corrupt the last valid state.
  {
    buddy::ProtocolParser parser;
    buddy::StateManager state;
    parser.begin(1, "0.2.0");
    state.begin(0);
    const std::string working =
        "{\"v\":1,\"type\":\"state\",\"seq\":1,\"data\":{\"status\":\"working\",\"activeSessions\":1,"
        "\"connection\":{\"bridge\":\"ready\",\"opencode\":\"connected\"},"
        "\"versions\":{\"bridge\":\"0.2.0\",\"protocol\":1},\"source\":\"live\"}}";
    check(feed(parser, state, working) == buddy::ParseCode::Ok, "working state");
    const std::string bad =
        "{\"v\":1,\"type\":\"state\",\"seq\":2,\"data\":{\"status\":\"nope\",\"activeSessions\":1,"
        "\"connection\":{\"bridge\":\"ready\",\"opencode\":\"connected\"},"
        "\"versions\":{\"bridge\":\"0.2.0\",\"protocol\":1},\"source\":\"live\"}}";
    check(feed(parser, state, bad) == buddy::ParseCode::BoundsError, "bad status rejected");
    check(state.state() == buddy::BuddyState::Working, "state preserved after invalid input");
  }

  // Tokens total is computed when absent, and mock source is propagated.
  {
    buddy::ProtocolParser parser;
    buddy::StateManager state;
    parser.begin(1, "0.2.0");
    state.begin(0);
    const std::string line =
        "{\"v\":1,\"type\":\"state\",\"seq\":1,\"data\":{\"status\":\"idle\",\"activeSessions\":0,"
        "\"tokens\":{\"input\":10,\"output\":5,\"contextPct\":null},"
        "\"connection\":{\"bridge\":\"ready\",\"opencode\":\"unknown\"},"
        "\"versions\":{\"bridge\":\"0.2.0\",\"protocol\":1},\"source\":\"mock\"}}";
    check(feed(parser, state, line) == buddy::ParseCode::Ok, "tokens state");
    check(state.metrics().tokens.total == 15, "tokens total");
    check(state.mockSource(), "mock source");
  }

  // Config is exposed to the caller and clamped values are reported.
  {
    buddy::ProtocolParser parser;
    buddy::StateManager state;
    parser.begin(1, "0.2.0");
    state.begin(0);
    const std::string config =
        "{\"v\":1,\"type\":\"config\",\"seq\":1,\"data\":{\"language\":\"fr\",\"quietMode\":true,"
        "\"autoReturnSeconds\":60,\"gestures\":{\"debounceMs\":5,\"doublePressWindowMs\":350,"
        "\"longPressMs\":1500,\"veryLongPressMs\":5000},\"source\":\"mock\"}}";
    check(feed(parser, state, config) == buddy::ParseCode::Ok, "config accepted");
    buddy::ProtocolConfig applied;
    check(parser.takeConfig(applied) && applied.valid, "config pending");
    check(applied.language == 1 && applied.quiet && applied.mock, "config values");
    check(applied.debounceMs == 10, "config clamp");
    const char* warning = nullptr;
    check(parser.takeWarning(warning) && strcmp(warning, "E_BOUNDS") == 0, "config warning");
  }

  // Line boundary: 2047 bytes accepted, 2048 rejected.
  {
    const std::string base = "{\"v\":1,\"type\":\"heartbeat\",\"seq\":1}";
    std::string maxLine = base;
    maxLine.append(2047 - base.size(), ' ');
    buddy::ProtocolParser parser;
    buddy::StateManager state;
    parser.begin(1, "0.2.0");
    state.begin(0);
    check(feed(parser, state, maxLine) == buddy::ParseCode::Ok, "2047-byte line");

    std::string overLine = base;
    overLine.append(2048 - base.size(), ' ');
    check(feed(parser, state, overLine) == buddy::ParseCode::TooLong, "2048-byte line rejected");
  }

  if (failures == 0) {
    std::cout << "firmware protocol tests: PASS\n";
    return 0;
  }
  std::cerr << "firmware protocol tests: FAIL (" << failures << ")\n";
  return 1;
}
