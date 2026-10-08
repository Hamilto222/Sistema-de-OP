#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(docker info --format '{{.Driver}}')" != vfs ]]; then echo 'Compactação desnecessária neste driver Docker.'; exit 0; fi
if docker image inspect supabase/postgres:17.6.1.088 >/dev/null 2>&1; then echo 'Imagem PostgreSQL já disponível.'; exit 0; fi
case "$(uname -m)" in x86_64) archive=go-containerregistry_Linux_x86_64.tar.gz ;; aarch64|arm64) archive=go-containerregistry_Linux_arm64.tar.gz ;; *) exit 1 ;; esac
version=0.20.3
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
curl --fail --silent --show-error --location "https://github.com/google/go-containerregistry/releases/download/v${version}/checksums.txt" -o "$workdir/checksums.txt"
curl --fail --silent --show-error --location "https://github.com/google/go-containerregistry/releases/download/v${version}/$archive" -o "$workdir/$archive"
awk -v file="$archive" '$2 == file { print }' "$workdir/checksums.txt" > "$workdir/selected.sha256"
test -s "$workdir/selected.sha256"
(cd "$workdir" && sha256sum --check selected.sha256)
mkdir -p .tools
tar -xzf "$workdir/$archive" -C .tools crane
node scripts/compact-postgres.mjs
