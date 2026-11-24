#pragma once

#include <cstddef>
#include <cstdint>

namespace buddy {

// Verified hardware facts — docs/hardware-audit.md §1.2.
constexpr uint8_t kTouchPin = 6;
constexpr uint32_t kDebounceMs = 35;

// Default gesture timings — docs/ui-design.md §5, protocol config message bounds.
constexpr uint32_t kDoublePressWindowMs = 350;
constexpr uint32_t kLongPressMs = 1500;
constexpr uint32_t kVeryLongPressMs = 5000;
constexpr uint32_t kAutoReturnMs = 60000;

// Display geometry. The visible area is a circle of radius 108 inside 240 x 240.
// The canvas is 220 x 220 so the whole visible disc fits in one 8-bit sprite
// (48 400 bytes) while leaving 10 px of untouchable border on each side.
constexpr int kScreenWidth = 240;
constexpr int kScreenHeight = 240;
constexpr int kCanvasSize = 220;
constexpr int kCanvasX = (kScreenWidth - kCanvasSize) / 2;
constexpr int kCanvasY = (kScreenHeight - kCanvasSize) / 2;
constexpr int kCanvasCenter = kCanvasSize / 2;

// Frame budgets. 25 FPS active, 15 FPS idle; dashboards refresh slowly because
// only the radar and tool bars animate there.
constexpr uint32_t kFrameIntervalActiveMs = 40;
constexpr uint32_t kFrameIntervalIdleMs = 66;
constexpr uint32_t kDashboardIntervalMs = 120;
constexpr uint32_t kTextRefreshMs = 1000;

// Protocol line bound — protocol/protocol-v1.md §2.
constexpr size_t kSerialLineMax = 2048;
constexpr char kFirmwareVersion[] = "0.2.0";
constexpr uint8_t kProtocolMajor = 1;
constexpr uint32_t kHeartbeatMs = 2000;
constexpr uint32_t kLinkTimeoutMs = 6000;
// While no bridge session is established the device re-announces itself with
// `hello`, so a bridge started after the device boot can still handshake.
constexpr uint32_t kHelloIntervalMs = 3000;
constexpr size_t kTextMax = 32;

// Terminal-state visibility — docs/architecture.md §4.
constexpr uint32_t kSuccessTtlMs = 4000;
constexpr uint32_t kErrorTtlMs = 30000;
constexpr uint32_t kInterruptedTtlMs = 10000;

constexpr size_t kMcpMaxEntries = 8;
constexpr size_t kMcpAliasMax = 12;

}  // namespace buddy
