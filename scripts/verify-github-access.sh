#!/usr/bin/env bash
# Verify GitHub access for the OpenCode Buddy repository without changing anything.
#
# Checks:
#   1. Remote readability (git ls-remote).
#   2. Whether write credentials are usable (git push --dry-run, no objects sent).
#   3. Whether the GitHub API is reachable and how many issues exist.
#   4. Whether `gh` or GITHUB_TOKEN is available for issue creation.
#
# Exits non-zero when a write path is missing, so it can gate automation.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${BUDDY_GITHUB_REPO:-punix81/OpenCode-Buddy}"
status=0

echo "Repository: $REPO"

if git -C "$ROOT" remote get-url origin >/dev/null 2>&1; then
  echo "PASS  origin: $(git -C "$ROOT" remote get-url origin)"
else
  echo "FAIL  no origin remote"; status=1
fi

if timeout 30 git -C "$ROOT" ls-remote --heads origin >/dev/null 2>&1; then
  echo "PASS  remote is readable (anonymous or cached credentials)"
else
  echo "FAIL  remote is not readable"; status=1
fi

if timeout 30 git -C "$ROOT" push --dry-run origin HEAD >/dev/null 2>&1; then
  echo "PASS  push credentials available (dry run)"
  push_ok=1
else
  echo "BLOCKER push credentials unavailable: git push --dry-run failed"
  push_ok=0
fi

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    echo "PASS  gh is authenticated"
    gh_ok=1
  else
    echo "BLOCKER gh is installed but not authenticated"
    gh_ok=0
  fi
else
  echo "INFO  gh not installed"
  gh_ok=0
fi

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  echo "PASS  GITHUB_TOKEN is set (value not printed)"
  token_ok=1
else
  echo "INFO  GITHUB_TOKEN is not set"
  token_ok=0
fi

if [[ "$push_ok" -eq 0 && "$gh_ok" -eq 0 && "$token_ok" -eq 0 ]]; then
  status=1
fi

api_json="$(curl -fsS --max-time 25 "https://api.github.com/repos/$REPO" 2>/dev/null || true)"
if [[ -n "$api_json" ]]; then
  visibility="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("visibility", d.get("private")))' <<<"$api_json" 2>/dev/null || echo unknown)"
  echo "PASS  GitHub API reachable (visibility: $visibility)"
else
  echo "INFO  GitHub API not reachable from this network"
fi

issues_json="$(curl -fsS --max-time 25 "https://api.github.com/repos/$REPO/issues?state=all&per_page=100" 2>/dev/null || true)"
if [[ -n "$issues_json" ]]; then
  count="$(python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' <<<"$issues_json" 2>/dev/null || echo unknown)"
  echo "INFO  existing issues (first page): $count"
fi

echo
if [[ "$status" -eq 0 ]]; then
  echo "Result: write path available."
else
  echo "Result: write path unavailable. Provide gh auth or GITHUB_TOKEN; nothing was modified."
fi
exit "$status"
