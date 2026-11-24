#!/usr/bin/env bash
# Product Owner only: agents must not execute this script (AGENTS.md §8).
# Create the seven phase issues in the OpenCode Buddy repository.
#
# Idempotent: issues are matched by exact title and skipped when they already exist.
#
# Usage:
#   scripts/create-issues.sh --dry-run      # show what would be created
#   scripts/create-issues.sh                # create missing issues
#
# Authentication, in order of preference:
#   1. GitHub CLI (`gh`) authenticated for the repository.
#   2. `GITHUB_TOKEN` environment variable with issue write permission.
#
# The script never prints a token and never force-writes anything.

set -euo pipefail

REPO="${BUDDY_GITHUB_REPO:-punix81/OpenCode-Buddy}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ISSUE_DIR="$ROOT/.github/issues"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 64
      ;;
  esac
done

TITLES=(
  "Phase 0 — Hardware and OpenCode v2 compatibility audit"
  "Phase 1 — Firmware core and animated Buddy"
  "Phase 2 — USB protocol, bridge and simulator"
  "Phase 3 — OpenCode v2 integration"
  "Phase 4 — Developer dashboard"
  "Phase 5 — Quality, privacy and stability"
  "Phase 6 — Packaging and team pilot"
)

FILES=(
  "$ISSUE_DIR/phase-0.md"
  "$ISSUE_DIR/phase-1.md"
  "$ISSUE_DIR/phase-2.md"
  "$ISSUE_DIR/phase-3.md"
  "$ISSUE_DIR/phase-4.md"
  "$ISSUE_DIR/phase-5.md"
  "$ISSUE_DIR/phase-6.md"
)

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "BLOCKER: missing issue body: $f" >&2
    exit 66
  fi
done

have_gh=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  have_gh=1
fi

if [[ "$have_gh" -eq 0 && -z "${GITHUB_TOKEN:-}" ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "NOTE: no GitHub credential; existing issues cannot be checked."
    for i in "${!TITLES[@]}"; do
      echo "WOULD  ${TITLES[$i]}  <- ${FILES[$i]#$ROOT/}"
    done
    echo
    echo "Dry run only. Re-run with gh auth or GITHUB_TOKEN to create them."
    exit 0
  fi

  cat >&2 <<EOF
BLOCKER: no GitHub write credential available.

Neither an authenticated GitHub CLI nor GITHUB_TOKEN is present, so issues cannot be created
from this environment. Nothing was changed.

To proceed:
  gh auth login            # then re-run: scripts/create-issues.sh
  # or
  export GITHUB_TOKEN=...  # token with 'issues: write' on $REPO

Bodies are ready in .github/issues/phase-0.md ... phase-6.md.
EOF
  exit 69
fi

if [[ "$have_gh" -eq 1 ]]; then
  mapfile -t EXISTING < <(gh issue list --repo "$REPO" --state all --limit 200 --json title --jq '.[].title')
else
  mapfile -t EXISTING < <(
    curl -fsS \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$REPO/issues?state=all&per_page=100" \
      | python3 -c 'import json,sys; [print(i["title"]) for i in json.load(sys.stdin)]'
  )
fi

contains() {
  local needle="$1"; shift
  local item
  for item in "$@"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

created=0
skipped=0

for i in "${!TITLES[@]}"; do
  title="${TITLES[$i]}"
  body="${FILES[$i]}"

  if contains "$title" "${EXISTING[@]:-}"; then
    echo "SKIP   $title"
    skipped=$((skipped + 1))
    continue
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "WOULD  $title  <- ${body#$ROOT/}"
    continue
  fi

  echo "CREATE $title"
  if [[ "$have_gh" -eq 1 ]]; then
    gh issue create --repo "$REPO" --title "$title" --body-file "$body" >/dev/null
  else
    python3 - "$REPO" "$title" "$body" <<'PY'
import json, os, sys, urllib.request
repo, title, body_path = sys.argv[1], sys.argv[2], sys.argv[3]
body = open(body_path, encoding="utf-8").read()
req = urllib.request.Request(
    f"https://api.github.com/repos/{repo}/issues",
    data=json.dumps({"title": title, "body": body}).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    },
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    data = json.load(resp)
    print(f"       -> #{data['number']} {data['html_url']}")
PY
  fi
  created=$((created + 1))
done

echo
echo "Summary: created=$created skipped=$skipped dry_run=$DRY_RUN repo=$REPO"
if [[ "$DRY_RUN" -eq 0 && "$created" -eq 0 ]]; then
  echo "Nothing to create; all phase issues already exist."
fi
