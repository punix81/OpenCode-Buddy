#!/usr/bin/env python3
"""Monitor a running bridge for a soak and print a JSON summary.

Usage:
    # start the bridge in another terminal first, with debug logging:
    #   cd bridge && npm run live -- --log-level debug > /tmp/opencode/soak.log 2>&1 &
    python3 tools/qa/soak_monitor.py --log /tmp/opencode/soak.log \
        --pid "$(pgrep -f 'src/cli/live.ts' | tail -n 1)" --seconds 3600

The script never starts, stops or reconfigures the bridge. It samples RSS/CPU
from /proc and counts the log patterns that matter for the endurance gate. It
does not fabricate a result: if the bridge exits, the run is reported as
interrupted.
"""
import argparse
import json
import os
import re
import sys
import time

PATTERNS = {
    'tx_frames': re.compile(r'protocol out type='),
    'rx_frames': re.compile(r'protocol in type='),
    'acks': re.compile(r'ack received ack='),
    'ack_timeouts': re.compile(r'ack timeout seq='),
    'handshake_retries': re.compile(r'handshake retry'),
    'device_errors': re.compile(r'device error'),
    'resyncs': re.compile(r'resync reason=|device resync'),
    'invalid_frames': re.compile(r'invalid message'),
    'open_failures': re.compile(r'transport open failed'),
    'reconnects': re.compile(r'bridge status=reconnecting'),
    'states': re.compile(r'state status='),
    'mcp': re.compile(r'mcp_status'),
}


def read_proc(pid):
    rss = None
    cpu = None
    try:
        with open(f'/proc/{pid}/status', 'r', encoding='utf-8') as handle:
            for line in handle:
                if line.startswith('VmRSS:'):
                    rss = int(line.split()[1]) * 1024
                    break
        with open(f'/proc/{pid}/stat', 'r', encoding='utf-8') as handle:
            fields = handle.read().split()
        cpu = (int(fields[13]) + int(fields[14])) / os.sysconf('SC_CLK_TCK')
    except (OSError, IndexError, ValueError):
        return None, None
    return rss, cpu


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--log', required=True)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--seconds', type=int, default=3600)
    parser.add_argument('--interval', type=int, default=60)
    args = parser.parse_args()

    counts = {name: 0 for name in PATTERNS}
    partial = ''
    rss_samples = []
    cpu_first = None
    started = time.time()
    last_report = started
    interrupted = False
    print(f'soak monitor start={time.strftime("%Y-%m-%dT%H:%M:%S%z")} '
          f'pid={args.pid} target={args.seconds}s', flush=True)

    with open(args.log, 'r', encoding='utf-8', errors='replace') as handle:
        while True:
            chunk = handle.read()
            if chunk:
                text = partial + chunk
                lines = text.split('\n')
                partial = lines.pop()
                for line in lines:
                    for name, pattern in PATTERNS.items():
                        if pattern.search(line):
                            counts[name] += 1
            now = time.time()
            if now - last_report >= args.interval:
                last_report = now
                rss, cpu = read_proc(args.pid)
                if rss is None:
                    interrupted = True
                    print('bridge process is gone', flush=True)
                    break
                rss_samples.append(rss)
                if cpu_first is None:
                    cpu_first = cpu
                print(f'elapsed={int(now-started)}s rss={rss//1024}KiB '
                      f'cpu={cpu:.1f}s acks={counts["acks"]} '
                      f'states={counts["states"]} errors={counts["device_errors"]} '
                      f'resyncs={counts["resyncs"]} timeouts={counts["ack_timeouts"]}',
                      flush=True)
            if now - started >= args.seconds:
                break
            time.sleep(1.0)

    elapsed = int(time.time() - started)
    rss, cpu = read_proc(args.pid)
    if rss is not None:
        rss_samples.append(rss)
    summary = {
        'started': time.strftime('%Y-%m-%dT%H:%M:%S%z', time.localtime(started)),
        'duration_requested_s': args.seconds,
        'duration_actual_s': elapsed,
        'completed': elapsed >= args.seconds and not interrupted,
        'interrupted': interrupted,
        'counts': counts,
        'rss_first_bytes': rss_samples[0] if rss_samples else None,
        'rss_last_bytes': rss_samples[-1] if rss_samples else None,
        'rss_min_bytes': min(rss_samples) if rss_samples else None,
        'rss_max_bytes': max(rss_samples) if rss_samples else None,
        'cpu_seconds_total': cpu,
    }
    print(json.dumps(summary, indent=2), flush=True)
    return 0 if summary['completed'] else 1


if __name__ == '__main__':
    sys.exit(main())
