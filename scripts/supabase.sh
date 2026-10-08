#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${SUPABASE_CLI:-}" ]]; then cli="$SUPABASE_CLI"; elif [[ -x .tools/supabase ]]; then cli=.tools/supabase; else cli=supabase; fi
# Official Docker Hub images mirror the ECR images; registry is overridable.
export SUPABASE_INTERNAL_IMAGE_REGISTRY="${SUPABASE_INTERNAL_IMAGE_REGISTRY:-docker.io}"
exec "$cli" "$@"
