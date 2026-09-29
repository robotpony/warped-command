#!/usr/bin/env bash
# PreToolUse hook (Bash) — blocks a `git commit` when the *staged* diff
# changes plugin source vs HEAD but package.json/manifest.json's "version"
# field hasn't moved in the staged content either.
#
# Advisory-at-commit-time companion to scripts/check-version-bump.mjs, which
# checks the working tree against HEAD at `npm run build` time instead —
# see that script's own header comment. This one catches it earlier, right
# at the commit itself, against what's actually staged (not the whole
# working tree, which could include unrelated unstaged edits).
#
# Deliberately does NOT auto-bump or guess patch/minor/major — that's a
# human/Claude judgment call per CLAUDE.md's Versioning section ("Pick the
# segment by what the change *is*, not by habit"). This only enforces that
# *some* bump happened.
#
# Fails open: not a git repo, no HEAD yet, nothing staged, unreadable
# version files, or any other unexpected condition all exit 0 (allow) —
# never block a commit for a reason unrelated to the version check.

set -uo pipefail

INPUT="$(cat)"

COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[[ -z "$COMMAND" ]] && exit 0
case "$COMMAND" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

git rev-parse --git-dir >/dev/null 2>&1 || exit 0
git rev-parse HEAD >/dev/null 2>&1 || exit 0

SUBSTANTIVE_RE='^(src/.*\.(ts|tsx)|main\.ts|main\.js|styles\.css)$'
TEST_RE='/__tests__/'

STAGED="$(git diff --cached --name-only 2>/dev/null)"
[[ -z "$STAGED" ]] && exit 0

SUBSTANTIVE=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if [[ "$f" =~ $SUBSTANTIVE_RE && ! "$f" =~ $TEST_RE ]]; then
    SUBSTANTIVE+=("$f")
  fi
done <<< "$STAGED"

[[ ${#SUBSTANTIVE[@]} -eq 0 ]] && exit 0

version_at() {
  # $1: git ref for HEAD's blob, or "" for the staged (index) blob via ":path"
  local ref="$1" file="$2" spec
  if [[ -z "$ref" ]]; then spec=":${file}"; else spec="${ref}:${file}"; fi
  git show "$spec" 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      try {
        const v = JSON.parse(s).version;
        if (v) process.stdout.write(v);
      } catch {}
    });
  ' 2>/dev/null
}

HEAD_PKG="$(version_at HEAD package.json)"
STAGED_PKG="$(version_at "" package.json)"
HEAD_MANIFEST="$(version_at HEAD manifest.json)"
STAGED_MANIFEST="$(version_at "" manifest.json)"

[[ -z "$HEAD_PKG" || -z "$STAGED_PKG" ]] && exit 0

if [[ "$STAGED_PKG" != "$HEAD_PKG" || "$STAGED_MANIFEST" != "$HEAD_MANIFEST" ]]; then
  exit 0 # already bumped
fi

FILE_LIST=""
for f in "${SUBSTANTIVE[@]}"; do
  FILE_LIST="${FILE_LIST}  ${f}"$'\n'
done

REASON="Version wasn't bumped (still ${STAGED_PKG}) but this commit stages plugin source changes:
${FILE_LIST}
CLAUDE.md's release checklist: bump package.json + manifest.json, and add a CHANGELOG.md entry."

jq -n --arg reason "$REASON" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}'
exit 0
