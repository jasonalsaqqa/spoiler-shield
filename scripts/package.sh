#!/usr/bin/env bash
# Builds dist/spoiler-shield-<version>.zip with manifest.json at the root of the zip,
# which is the layout the Chrome Web Store expects.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./extension/manifest.json').version")
OUT="dist/spoiler-shield-${VERSION}.zip"

rm -rf dist && mkdir -p dist
(cd extension && zip -rqX "../${OUT}" . -x '.*' -x '__MACOSX/*')
echo "$OUT"
