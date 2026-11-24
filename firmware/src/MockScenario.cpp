#include "MockScenario.h"

#include <cstdio>

namespace buddy {
namespace {

struct Step {
  BuddyState state;
  uint16_t durationMs;
};

// One full cycle through every state, about 45 seconds. Durations are long
// enough to read the label and see the motion on a real panel.
constexpr Step kSteps[] = {
    {BuddyState::Offline, 3000},
    {BuddyState::Idle, 4000},
    {BuddyState::Thinking, 3500},
    {BuddyState::Generating, 4000},
    {BuddyState::Working, 5000},
    {BuddyState::PermissionRequired, 5000},
    {BuddyState::UserInputRequired, 4000},
    {BuddyState::Success, 3000},
    {BuddyState::Error, 3000},
    {BuddyState::Compacting, 3000},
    {BuddyState::Retrying, 3000},
    {BuddyState::Interrupted, 3000},
};

constexpr uint8_t kStepCount = sizeof(kSteps) / sizeof(kSteps[0]);

void seedMcp(McpSummary& mcp) {
  mcp.total = 8;
  mcp.online = 6;
  mcp.count = 8;

  const McpStatus statuses[8] = {
      McpStatus::Connected, McpStatus::Connected, McpStatus::Connected,
      McpStatus::Connected, McpStatus::Connected, McpStatus::Connected,
      McpStatus::Pending,   McpStatus::Failed,
  };

  for (uint8_t i = 0; i < mcp.count; ++i) {
    snprintf(mcp.entries[i].alias, sizeof(mcp.entries[i].alias), "MCP-%u",
             static_cast<unsigned>(i + 1));
    mcp.entries[i].status = statuses[i];
  }
}

}  // namespace

void MockScenario::begin(uint32_t now, StateManager& state) {
  start_ = now;
  index_ = 0;
  stepStart_ = now;

  BuddyMetrics& metrics = state.mutableMetrics();
  metrics = BuddyMetrics{};
  seedMcp(metrics.mcp);
  metrics.activeSessions = 0;
  metrics.tokens.available = true;
  metrics.tokens.contextAvailable = false;
  state.setModel("mock-deepseek");
  state.setAgent("build");
  enter(0, now, state);
}

void MockScenario::tick(uint32_t now, StateManager& state) {
  BuddyMetrics& metrics = state.mutableMetrics();
  metrics.elapsedSeconds = (now - start_) / 1000;

  if (now - stepStart_ >= kSteps[index_].durationMs) {
    index_ = static_cast<uint8_t>((index_ + 1) % kStepCount);
    stepStart_ = now;
    enter(index_, now, state);
  }
}

void MockScenario::enter(uint8_t index, uint32_t now, StateManager& state) {
  const Step& step = kSteps[index];
  BuddyMetrics& metrics = state.mutableMetrics();

  metrics.pendingPermissions = 0;
  metrics.pendingQuestions = 0;
  metrics.notifications = 0;
  metrics.retryAttempt = 0;
  metrics.tools.running = 0;

  switch (step.state) {
    case BuddyState::Offline:
      metrics.activeSessions = 0;
      break;
    case BuddyState::Working:
      metrics.activeSessions = 2;
      metrics.tools.running = 1;
      metrics.tools.success += 2;
      metrics.tools.read += 1;
      metrics.tools.edit += 1;
      metrics.tokens.input += 1400;
      metrics.tokens.output += 300;
      break;
    case BuddyState::Generating:
      metrics.activeSessions = 2;
      metrics.tokens.input += 1800;
      metrics.tokens.output += 600;
      metrics.tools.success += 1;
      metrics.tools.shell += 1;
      break;
    case BuddyState::Thinking:
      metrics.activeSessions = 1;
      metrics.tokens.input += 900;
      metrics.tools.success += 1;
      metrics.tools.other += 1;
      break;
    case BuddyState::PermissionRequired:
      metrics.activeSessions = 1;
      metrics.pendingPermissions = 1;
      break;
    case BuddyState::UserInputRequired:
      metrics.activeSessions = 1;
      metrics.pendingQuestions = 1;
      break;
    case BuddyState::Success:
      metrics.activeSessions = 1;
      metrics.notifications = 1;
      metrics.tools.success += 1;
      metrics.tools.mcp += 1;
      metrics.tokens.output += 700;
      break;
    case BuddyState::Error:
      metrics.activeSessions = 1;
      metrics.tools.failed += 1;
      break;
    case BuddyState::Retrying:
      metrics.activeSessions = 1;
      metrics.retryAttempt = 2;
      break;
    case BuddyState::Compacting:
      metrics.activeSessions = 1;
      metrics.tokens.input += 400;
      break;
    case BuddyState::Interrupted:
      metrics.activeSessions = 1;
      break;
    default:
      metrics.activeSessions = 1;
      break;
  }

  metrics.tokens.total = metrics.tokens.input + metrics.tokens.output;
  state.setState(step.state, now);
}

}  // namespace buddy
