#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "$(uname -m)" in x86_64) archive=supabase_linux_amd64.tar.gz ;; aarch64|arm64) archive=supabase_linux_arm64.tar.gz ;; *) echo 'Arquitetura não suportada por este instalador Linux.' >&2; exit 1 ;; esac
version=2.76.15
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
curl --fail --silent --show-error --location "https://github.com/supabase/cli/releases/download/v${version}/supabase_${version}_checksums.txt" -o "$workdir/checksums.txt"
curl --fail --silent --show-error --location "https://github.com/supabase/cli/releases/download/v${version}/$archive" -o "$workdir/$archive"
awk -v file="$archive" '$2 == file { print }' "$workdir/checksums.txt" > "$workdir/selected.sha256"
test -s "$workdir/selected.sha256"
(cd "$workdir" && sha256sum --check selected.sha256)
mkdir -p .tools
tar -xzf "$workdir/$archive" -C .tools supabase
.tools/supabase --version
