#!/bin/zsh
# Builds the Chrome Web Store upload: dist/dark-mode-for-google-sheets-<version>.zip (extension folder contents only).
set -euo pipefail
cd "$(dirname "$0")/.."
v=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
mkdir -p dist
rm -f "dist/dark-mode-for-google-sheets-$v.zip"
(cd extension && zip -qr -X "../dist/dark-mode-for-google-sheets-$v.zip" . -x '.*' -x '__MACOSX/*')
echo "dist/dark-mode-for-google-sheets-$v.zip ($(du -h "dist/dark-mode-for-google-sheets-$v.zip" | cut -f1))"
cp "dist/dark-mode-for-google-sheets-$v.zip" site/dark-mode-for-google-sheets.zip   # the landing page serves the same file at /dark-mode-for-google-sheets.zip
echo "site/dark-mode-for-google-sheets.zip ($(stat -f%z site/dark-mode-for-google-sheets.zip) bytes)"
node scripts/site-data.mjs   # the site shows the version, zip size and engine colours of this build
