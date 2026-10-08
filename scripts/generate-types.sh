#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
output=$(mktemp)
trap 'rm -f "$output"' EXIT
bash scripts/supabase.sh gen types typescript --local > "$output"
test -s "$output"
cp "$output" src/types/database.ts
