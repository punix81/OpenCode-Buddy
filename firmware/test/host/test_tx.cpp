// Host tests for the bounded firmware TX staging buffer. No Arduino dependency.
#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>

#include "../../src/TxBuffer.h"

namespace {

class PartialSink : public buddy::FrameSink {
 public:
  PartialSink(size_t perCall, size_t reported)
      : perCall_(perCall), reported_(reported) {}
  int availableForWrite() override { return static_cast<int>(reported_); }
  size_t write(const char* data, size_t length) override {
    const size_t n = length < perCall_ ? length : perCall_;
    out_.append(data, n);
    return n;
  }
  const std::string& out() const { return out_; }

 private:
  size_t perCall_;
  size_t reported_;
  std::string out_;
};

}  // namespace

int main() {
  const char kFrameA[] = "{\"a\":1}\n";
  const char kFrameB[] = "{\"b\":2}\n";
  const size_t kLenA = sizeof(kFrameA) - 1;
  const size_t kLenB = sizeof(kFrameB) - 1;

  {
    char storage[64];
    buddy::TxBuffer tx(storage, sizeof(storage));
    PartialSink sink(7, 7);
    assert(tx.write(kFrameA, kLenA) == kLenA);
    assert(tx.write(kFrameB, kLenB) == kLenB);
    while (tx.pending() > 0) {
      const size_t n = tx.flush(sink);
      assert(n > 0);
    }
    assert(sink.out() == std::string(kFrameA) + kFrameB);
  }

  {
    // The driver accepts fewer bytes than it reported: the remainder is kept and
    // retried, never lost and never reordered.
    char storage[64];
    buddy::TxBuffer tx(storage, sizeof(storage));
    PartialSink lying(3, 64);
    assert(tx.write(kFrameA, kLenA) == kLenA);
    assert(tx.flush(lying) == 3);
    while (tx.pending() > 0) {
      tx.flush(lying);
    }
    assert(lying.out() == std::string(kFrameA));
  }

  {
    // A full buffer rejects the whole frame: no partial NDJSON line is staged.
    char storage[10];
    buddy::TxBuffer tx(storage, sizeof(storage));
    assert(tx.write(kFrameA, kLenA) == kLenA);
    assert(tx.write(kFrameB, kLenB) == 0);
    assert(tx.pending() == kLenA);
    PartialSink idle(4, 0);
    assert(tx.flush(idle) == 0);
    assert(tx.pending() == kLenA);
  }

  std::puts("firmware tx buffer tests: PASS");
  return 0;
}
