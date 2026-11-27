#!/usr/bin/env python3
"""Summarise cold-boot / reconnect handshakes from a bridge debug log.

Usage:
    python3 tools/qa/cold_boot_log.py /tmp/opencode/phase5-live.log
    python3 tools/qa/cold_boot_log.py --require-pass /tmp/opencode/phase5-live.log

Each `INFO bridge opening` starts a session. The report shows, per session, the
hello, both handshake ACKs, retries, device errors, invalid frames and resyncs.
A session is PASS only when ACK 1 and ACK 2 arrive without a reopen in between.
The log must be produced with `npm run live -- --log-level debug` or
`npm run mock -- --log-level debug`.
"""
import argparse
import re
import sys

LINE = re.compile(
    r'^(?P<ts>\S+) (?P<level>ERROR|WARN|INFO|DEBUG) '
    r'(?P<msg>.*)$'
)


class Session:
    def __init__(self, ts):
        self.start = ts
        self.hello = None
        self.ack1 = None
        self.ack2 = None
        self.retries = 0
        self.device_errors = 0
        self.invalid = 0
        self.resyncs = 0
        self.open_failed = 0
        self.ready = False
        self.state = False

    @property
    def passed(self):
        return self.ack1 is not None and self.ack2 is not None

    def summary(self):
        return (
            f"start={self.start} hello={'yes' if self.hello else 'no'} "
            f"ack1={'yes' if self.ack1 else 'no'} ack2={'yes' if self.ack2 else 'no'} "
            f"retries={self.retries} device_errors={self.device_errors} "
            f"invalid={self.invalid} resyncs={self.resyncs} "
            f"open_failed={self.open_failed} state={'yes' if self.state else 'no'} "
            f"{'PASS' if self.passed else 'FAIL'}"
        )


def parse(path):
    sessions = []
    current = None
    with open(path, 'r', encoding='utf-8', errors='replace') as handle:
        for raw in handle:
            match = LINE.match(raw.rstrip('\n'))
            if match is None:
                continue
            ts = match.group('ts')
            message = match.group('msg')
            if message == 'bridge opening':
                current = Session(ts)
                sessions.append(current)
                continue
            if current is None:
                continue
            if message.startswith('hello boot='):
                current.hello = message
            elif 'ack received ack=1 ' in message:
                current.ack1 = ts
            elif 'ack received ack=2 ' in message:
                current.ack2 = ts
            elif message.startswith('handshake retry'):
                current.retries += 1
            elif message.startswith('device error'):
                current.device_errors += 1
            elif message.startswith('invalid message'):
                current.invalid += 1
            elif message.startswith('device resync') or 'resync reason=' in message:
                current.resyncs += 1
            elif message.startswith('transport open failed'):
                current.open_failed += 1
            elif message.startswith('bridge ready'):
                current.ready = True
            elif message.startswith('state status='):
                current.state = True
    return sessions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('log')
    parser.add_argument('--require-pass', action='store_true',
                        help='exit 1 unless every session with a hello is PASS')
    args = parser.parse_args()
    sessions = parse(args.log)
    if not sessions:
        print('no bridge opening found in the log')
        return 2
    passed = 0
    for index, session in enumerate(sessions, 1):
        print(f'session {index}: {session.summary()}')
        if session.passed:
            passed += 1
    with_hello = sum(1 for session in sessions if session.hello)
    print(f'SUMMARY {passed}/{len(sessions)} sessions fully handshaken '
          f'({with_hello} with a hello)')
    if args.require_pass and passed != len(sessions):
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
