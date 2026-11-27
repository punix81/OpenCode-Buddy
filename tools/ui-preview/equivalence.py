#!/usr/bin/env python3
"""Generate and compare the 288-image renderer equivalence matrix.

The matrix is the one used for the Phase 5 Checkpoint B and RC evidence:

  6 screens x 3 languages x 7 profiles x 2 quiet modes = 252
  12 states x 3 languages                               =  36

Usage:
  python3 equivalence.py --generate /tmp/render-after
  python3 equivalence.py --before /tmp/render-before --after /tmp/render-after

The comparison is RGB-exact; it exits 1 on the first count that is not 288/288.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops

from preview import frame

SCREENS = range(6)
LANGUAGES = range(3)
PROFILES = range(7)
QUIET = range(2)
STATES = range(12)


def name_screen(screen: int, language: int, profile: int, quiet: int) -> str:
    return f"s{screen}-l{language}-p{profile}-q{quiet}.png"


def name_expression(state: int, language: int) -> str:
    return f"expr-{state}-l{language}.png"


def generate(destination: Path) -> int:
    destination.mkdir(parents=True, exist_ok=True)
    count = 0
    for screen in SCREENS:
        for language in LANGUAGES:
            for profile in PROFILES:
                for quiet in QUIET:
                    frame(screen, 2, profile, quiet, 960, 960, 1, 960, language).save(
                        destination / name_screen(screen, language, profile, quiet)
                    )
                    count += 1
    for state in STATES:
        for language in LANGUAGES:
            frame(0, state, 0, 0, 960, 960, 1, 960, language).save(
                destination / name_expression(state, language)
            )
            count += 1
    print(f"generated {count} images in {destination}")
    return count


def compare(before: Path, after: Path) -> int:
    files = sorted(path.name for path in before.glob("*.png"))
    if len(files) != 288:
        print(f"expected 288 reference images, found {len(files)}", file=sys.stderr)
        return 2
    identical = 0
    differing: list[str] = []
    for name in files:
        left = Image.open(before / name).convert("RGB")
        right = Image.open(after / name).convert("RGB")
        if ImageChops.difference(left, right).getbbox() is None:
            identical += 1
        else:
            differing.append(name)
    print(f"files={len(files)} identical={identical} differing={len(differing)}")
    if differing:
        print("differing:", " ".join(differing[:10]))
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate", type=Path)
    parser.add_argument("--before", type=Path)
    parser.add_argument("--after", type=Path)
    args = parser.parse_args()
    if args.generate is not None:
        return 0 if generate(args.generate) == 288 else 1
    if args.before is not None and args.after is not None:
        return compare(args.before, args.after)
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
