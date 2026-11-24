#pragma once

#include <cstdint>

#include "BuddyState.h"

namespace buddy {

// Holds the normalized device model. Connection state and execution state are
// deliberately separate fields: a connected device can be idle, and an offline
// device must not pretend to know what OpenCode is doing.
class StateManager {
 public:
  void begin(uint32_t now);

  BuddyState state() const { return state_; }
  uint32_t stateSince() const { return stateSince_; }

  void setState(BuddyState value, uint32_t now);

  const BuddyMetrics& metrics() const { return metrics_; }
  BuddyMetrics& mutableMetrics() { return metrics_; }

  void setModel(const char* value);
  void setAgent(const char* value);
  const char* model() const { return model_; }
  const char* agent() const { return agent_; }

  void setLink(LinkState usb, BridgeState bridge, OpenCodeState opencode);
  LinkState usb() const { return usb_; }
  BridgeState bridge() const { return bridge_; }
  OpenCodeState opencode() const { return opencode_; }

  void setVersions(const Versions& value) { versions_ = value; }
  const Versions& versions() const { return versions_; }

  void setMock(bool value) { mock_ = value; }
  bool mockSource() const { return mock_; }

  void setDiagnostic(const char* code);
  const char* diagnostic() const { return diagnostic_; }

  // Expires terminal notifications. Permission and question prompts are not
  // timed here: they disappear only when the bridge reports they were resolved.
  void tick(uint32_t now);

  bool isTerminal() const;

 private:
  BuddyState state_ = BuddyState::Offline;
  uint32_t stateSince_ = 0;
  BuddyMetrics metrics_;
  Versions versions_;
  bool mock_ = false;
  char model_[24] = "--";
  char agent_[16] = "--";
  char diagnostic_[12] = "--";
  LinkState usb_ = LinkState::Disconnected;
  BridgeState bridge_ = BridgeState::Unknown;
  OpenCodeState opencode_ = OpenCodeState::Unknown;
};

}  // namespace buddy
