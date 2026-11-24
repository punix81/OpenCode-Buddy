#include "StateManager.h"

#include <cstdio>
#include <cstring>

#include "Config.h"

namespace buddy {
namespace {

// Bounded copy with control characters removed. Strings displayed on the device
// never come from raw event payloads, but they are still sanitized here as the
// last line of defence.
void copySanitized(char* destination, size_t capacity, const char* source) {
  if (capacity == 0) {
    return;
  }
  if (source == nullptr) {
    snprintf(destination, capacity, "--");
    return;
  }

  size_t written = 0;
  for (size_t i = 0; source[i] != '\0' && written + 1 < capacity; ++i) {
    const unsigned char c = static_cast<unsigned char>(source[i]);
    if (c < 0x20 || c == 0x7F) {
      continue;
    }
    destination[written++] = static_cast<char>(c);
  }
  if (written == 0) {
    snprintf(destination, capacity, "--");
    return;
  }
  destination[written] = '\0';
}

}  // namespace

void StateManager::begin(uint32_t now) {
  state_ = BuddyState::Offline;
  stateSince_ = now;
  usb_ = LinkState::Disconnected;
  bridge_ = BridgeState::Unknown;
  opencode_ = OpenCodeState::Unknown;
  copySanitized(model_, sizeof(model_), "--");
  copySanitized(agent_, sizeof(agent_), "--");
  copySanitized(diagnostic_, sizeof(diagnostic_), "--");
}

void StateManager::setState(BuddyState value, uint32_t now) {
  if (value >= BuddyState::Count) {
    value = BuddyState::Offline;
  }
  state_ = value;
  stateSince_ = now;
}

void StateManager::setModel(const char* value) {
  copySanitized(model_, sizeof(model_), value);
}

void StateManager::setAgent(const char* value) {
  copySanitized(agent_, sizeof(agent_), value);
}

void StateManager::setLink(LinkState usb, BridgeState bridge, OpenCodeState opencode) {
  usb_ = usb;
  bridge_ = bridge;
  opencode_ = opencode;
}

void StateManager::setDiagnostic(const char* code) {
  copySanitized(diagnostic_, sizeof(diagnostic_), code);
}

bool StateManager::isTerminal() const {
  return state_ == BuddyState::Success || state_ == BuddyState::Error ||
         state_ == BuddyState::Interrupted;
}

void StateManager::tick(uint32_t now) {
  if (!isTerminal()) {
    return;
  }

  uint32_t ttl = kSuccessTtlMs;
  if (state_ == BuddyState::Error) {
    ttl = kErrorTtlMs;
  } else if (state_ == BuddyState::Interrupted) {
    ttl = kInterruptedTtlMs;
  }

  if (now - stateSince_ >= ttl) {
    state_ = BuddyState::Idle;
    stateSince_ = now;
  }
}

}  // namespace buddy
