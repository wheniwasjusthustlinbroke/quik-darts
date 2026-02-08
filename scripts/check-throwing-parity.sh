#!/usr/bin/env bash
# Drift Guard: Check client/server throwing module parity (logic-level)
#
# These modules must stay in sync. Only KNOWN intentional differences are normalized:
# - dartboardGeometry.ts: import paths (not imports themselves), Position type location
# - segmentMiss.ts: header comment block only (imports MUST match exactly)
#
# Any other difference = exit 1 (CI gate).

set -euo pipefail

# Resolve repo root
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "${ROOT}" ]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

CLIENT_GEOMETRY="${ROOT}/src/throwing/dartboardGeometry.ts"
SERVER_GEOMETRY="${ROOT}/functions/src/throwing/dartboardGeometry.ts"
CLIENT_MISS="${ROOT}/src/throwing/segmentMiss.ts"
SERVER_MISS="${ROOT}/functions/src/throwing/segmentMiss.ts"

echo "=== Drift Guard: Checking throwing module parity ==="
echo

for file in "$CLIENT_GEOMETRY" "$SERVER_GEOMETRY" "$CLIENT_MISS" "$SERVER_MISS"; do
  if [ ! -f "$file" ]; then
    echo "ERROR: Missing file: $file"
    exit 1
  fi
done

# Normalize dartboardGeometry.ts - keep imports but normalize paths
normalize_geometry() {
  local file="$1"
  awk '
    BEGIN { inImport=0; inPosInterface=0; }

    # ----- Import blocks: KEEP them, but normalize module source only -----
    /^import[[:space:]]/ {
      # Skip client-only type Position import (intentional diff)
      if ($0 ~ /^import[[:space:]]+type[[:space:]]*\{[[:space:]]*Position[[:space:]]*\}/) { next }
      inImport=1
    }

    inImport {
      line=$0
      gsub(/\(Server\)/, "", line)
      # Normalize import source path(s) only
      if (line ~ /from[[:space:]]+["'"'"'][^"'"'"']+["'"'"']/) {
        gsub(/from[[:space:]]+["'"'"'][^"'"'"']+["'"'"']/, "from \"__IMPORT__\"", line)
      }
      print line
      # End of import statement
      if ($0 ~ /;[[:space:]]*$/) { inImport=0 }
      next
    }

    # Skip export type { Position } line (client only)
    /^export[[:space:]]+type[[:space:]]+\{[[:space:]]*Position[[:space:]]*\}/ { next }

    # Skip export interface Position { ... } block (server only)
    /^[[:space:]]*export[[:space:]]+interface[[:space:]]+Position[[:space:]]*\{/ { inPosInterface=1; next }
    inPosInterface && /^[[:space:]]*\}[[:space:]]*$/ { inPosInterface=0; next }
    inPosInterface { next }

    # Skip sync note line
    /NOTE: This file must stay in sync/ { next }

    # Strip (Server) text and trailing whitespace
    {
      gsub(/\(Server\)/, "")
      sub(/[[:space:]]+$/, "")
      print
    }
  ' "$file"
}

# Normalize segmentMiss.ts - header comment block ONLY (imports must match!)
normalize_miss() {
  local file="$1"
  awk '
    BEGIN { inBlock=0; headerDone=0; }

    # Skip the first header comment block at the top of the file
    headerDone==0 && /^\/\*/ { inBlock=1; next }
    inBlock && /\*\// { inBlock=0; headerDone=1; next }
    inBlock { next }

    # Skip top-of-file // header lines until first code
    headerDone==0 && /^[[:space:]]*\/\// { next }

    # Skip sync note line
    /NOTE: This file must stay in sync/ { next }

    # Strip (Server) text
    { gsub(/\(Server\)/, ""); print }
  ' "$file"
}

diff_and_report() {
  local name="$1" normalizer="$2" a="$3" b="$4"
  echo "Checking ${name}..."
  local d
  d="$(diff -u <($normalizer "$a") <($normalizer "$b") || true)"
  if [ -n "$d" ]; then
    echo "ERROR: ${name} differs (logic drift detected):"
    echo "$d" | head -80
    echo
    return 1
  else
    echo "  ${name}: Logic matches"
    return 0
  fi
}

failed=0
diff_and_report "dartboardGeometry.ts" normalize_geometry "$CLIENT_GEOMETRY" "$SERVER_GEOMETRY" || failed=1
echo
diff_and_report "segmentMiss.ts" normalize_miss "$CLIENT_MISS" "$SERVER_MISS" || failed=1
echo

if [ "$failed" -eq 0 ]; then
  echo "=== Parity check PASSED ==="
else
  echo "=== Parity check FAILED ==="
fi

exit "$failed"
