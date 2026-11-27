#!/usr/bin/env python3
"""Summarise a bridge log from the USB diagnostic runs.

The bridge logs the device's BUDDY-DIAG/BUDDY-DIAG2 telemetry at debug level, so
one file contains both sides of the handshake. Each `bridge opening` line starts
a run. The report shows the time to ready, the two handshake ACKs, the retries
and reconnects, and the device-side counters at the boundary.

Usage: python3 tools/usb-diag/analyze_diag.py <bridge.log>
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from datetime import datetime

LINE = re.compile(r"^(\S+) (\w+) (.*)$")
DIAG = re.compile(r"^(?:device diagnostic )?(BUDDY-DIAG2?) (.*)$")


def parse_fields(text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for token in text.split():
        key, sep, value = token.partition("=")
        if sep:
            fields[key] = value
    return fields


def epoch(stamp: str) -> float:
    return datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%S.%fZ").timestamp()


@dataclass
class Run:
    start: str
    start_epoch: float
    ready: str | None = None
    ready_epoch: float | None = None
    ack1: str | None = None
    ack1_epoch: float | None = None
    ack2: str | None = None
    ack2_epoch: float | None = None
    retries: int = 0
    reconnects: int = 0
    invalid: int = 0
    before_ready: list[dict[str, str]] = field(default_factory=list)
    after_ready: list[dict[str, str]] = field(default_factory=list)
    hello_boots: list[str] = field(default_factory=list)
    last: dict[str, str] = field(default_factory=dict)


def main(path: str) -> int:
    runs: list[Run] = []
    current: Run | None = None
    with open(path, encoding="utf-8", errors="replace") as handle:
        for raw in handle:
            match = LINE.match(raw.rstrip("\n"))
            if not match:
                continue
            stamp, level, message = match.groups()
            if message.startswith("bridge opening"):
                current = Run(stamp, epoch(stamp))
                runs.append(current)
                continue
            if current is None:
                continue
            if message.startswith("bridge status=ready") and current.ready is None:
                current.ready = stamp
                current.ready_epoch = epoch(stamp)
            elif "ack received ack=1 " in message and current.ack1 is None:
                current.ack1 = stamp
                current.ack1_epoch = epoch(stamp)
            elif "ack received ack=2 " in message and current.ack2 is None:
                current.ack2 = stamp
                current.ack2_epoch = epoch(stamp)
            elif message.startswith("handshake retry"):
                current.retries += 1
            elif message.startswith("bridge reconnecting"):
                current.reconnects += 1
            elif message.startswith("invalid message"):
                current.invalid += 1
            elif message.startswith("hello boot="):
                current.hello_boots.append(message)
            diag = DIAG.match(message)
            if diag:
                kind, body = diag.groups()
                fields = parse_fields(body)
                fields["_kind"] = kind
                if current.ready_epoch is None:
                    current.before_ready.append(fields)
                else:
                    current.after_ready.append(fields)
                current.last = fields

    for index, run in enumerate(runs, 1):
        ready = "—" if run.ready_epoch is None else f"{run.ready_epoch - run.start_epoch:.2f}s"
        ack = "—"
        if run.ack1_epoch is not None and run.ack2_epoch is not None:
            ack = f"{run.ack2_epoch - run.start_epoch:.2f}s"
        last = run.last
        print(f"run {index} open={run.start}")
        print(
            f"  ready={ready} both_acks={ack} retries={run.retries} "
            f"reconnects={run.reconnects} invalid={run.invalid}"
        )
        if run.hello_boots:
            print(f"  hellos={len(run.hello_boots)}")
        if last:
            keys = [
                "boot",
                "reset",
                "host_edges",
                "host",
                "rx_bytes",
                "rx_lines",
                "rx_drop",
                "rx_ovf",
                "framing",
                "ok",
                "err",
                "last",
                "len",
                "head",
                "hello",
                "hb",
            ]
            summary = " ".join(f"{key}={last[key]}" for key in keys if key in last)
            print(f"  device: {summary}")
        if run.before_ready:
            boundary = run.before_ready[-1]
            print(
                "  last before ready: "
                + " ".join(
                    f"{key}={boundary[key]}"
                    for key in ("host_edges", "rx_drop", "rx_ovf", "last", "head")
                    if key in boundary
                )
            )
        if run.after_ready:
            first = run.after_ready[0]
            print(
                "  first after ready: "
                + " ".join(
                    f"{key}={first[key]}"
                    for key in ("host_edges", "rx_drop", "rx_ovf", "last", "head")
                    if key in first
                )
            )
    if not runs:
        print("no bridge run found")
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
