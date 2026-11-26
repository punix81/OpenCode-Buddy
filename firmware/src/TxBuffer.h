#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>

#include "FrameWriter.h"

namespace buddy {

// Bounded staging buffer between FrameWriter and Serial.
//
// A complete frame is copied into RAM atomically, so a partial Serial.write can
// only remove the bytes the driver really accepted; the remainder stays in the
// buffer and the next flush() retries it. Nothing grows, nothing blocks, and a
// frame can never lose its newline on the wire.
class TxBuffer : public FrameSink {
 public:
  TxBuffer(char* storage, size_t capacity) : storage_(storage), capacity_(capacity) {}

  int availableForWrite() override {
    return static_cast<int>(capacity_ - size_);
  }

  size_t write(const char* data, size_t length) override {
    if (length == 0 || length > capacity_ - size_) {
      return 0;
    }
    if (head_ + size_ + length > capacity_) {
      if (size_ > 0) {
        memmove(storage_, storage_ + head_, size_);
      }
      head_ = 0;
    }
    memcpy(storage_ + head_ + size_, data, length);
    size_ += length;
    return length;
  }

  size_t pending() const { return size_; }
  size_t capacity() const { return capacity_; }

  // Writes at most what the sink reports it can accept right now, then returns
  // the number of bytes accepted. A zero return leaves the buffer unchanged.
  size_t flush(FrameSink& sink) {
    if (size_ == 0) {
      return 0;
    }
    const int free = sink.availableForWrite();
    if (free <= 0) {
      return 0;
    }
    const size_t request = size_ < static_cast<size_t>(free) ? size_ : static_cast<size_t>(free);
    const size_t written = sink.write(storage_ + head_, request);
    const size_t accepted = written > size_ ? size_ : written;
    head_ += accepted;
    size_ -= accepted;
    if (size_ == 0) {
      head_ = 0;
    }
    return accepted;
  }

 private:
  char* storage_;
  size_t capacity_;
  size_t head_ = 0;
  size_t size_ = 0;
};

}  // namespace buddy
