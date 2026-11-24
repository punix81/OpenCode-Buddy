#pragma once

#include <cstddef>
#include <cstdint>

namespace buddy {

// Destination of one complete NDJSON line. Implemented over Serial on the
// device and over a fake in the host tests.
class FrameSink {
 public:
  virtual ~FrameSink() = default;
  // Bytes that can be accepted right now, or -1 when the sink cannot tell.
  virtual int availableForWrite() = 0;
  virtual size_t write(const char* data, size_t length) = 0;
};

enum class SendResult : uint8_t { Sent, DroppedNoSpace, DroppedPartial, DroppedTooLong };

// Writes one NDJSON frame with its terminating newline in a single call.
//
// The frame is never split into two writes, so a short write cannot leave a
// payload without its newline and no later frame can be glued onto it. A frame
// is only started when the sink reports room for all of it, which is what keeps
// the caller from ever blocking on a full buffer.
class FrameWriter {
 public:
  explicit FrameWriter(FrameSink& sink) : sink_(sink) {}

  // `buffer` must be able to hold `length + 1` bytes; the newline is written
  // into `buffer[length]`.
  SendResult send(char* buffer, size_t length, size_t capacity) {
    if (length == 0 || length + 1 > capacity) {
      ++droppedTooLong_;
      return SendResult::DroppedTooLong;
    }
    buffer[length] = '\n';
    const int freeBytes = sink_.availableForWrite();
    if (freeBytes >= 0 && static_cast<size_t>(freeBytes) < length + 1) {
      ++droppedNoSpace_;
      return SendResult::DroppedNoSpace;
    }
    const size_t written = sink_.write(buffer, length + 1);
    if (written != length + 1) {
      ++droppedPartial_;
      return SendResult::DroppedPartial;
    }
    ++sent_;
    if (length > maxFrame_) {
      maxFrame_ = length;
    }
    return SendResult::Sent;
  }

  uint32_t sent() const { return sent_; }
  uint32_t droppedNoSpace() const { return droppedNoSpace_; }
  uint32_t droppedPartial() const { return droppedPartial_; }
  uint32_t droppedTooLong() const { return droppedTooLong_; }
  size_t maxFrame() const { return maxFrame_; }

 private:
  FrameSink& sink_;
  uint32_t sent_ = 0;
  uint32_t droppedNoSpace_ = 0;
  uint32_t droppedPartial_ = 0;
  uint32_t droppedTooLong_ = 0;
  size_t maxFrame_ = 0;
};

}  // namespace buddy
