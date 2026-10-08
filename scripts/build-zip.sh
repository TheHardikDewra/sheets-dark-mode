#!/bin/zsh
# Builds the Chrome Web Store upload: dist/nightcell-<version>.zip (extension folder contents only).
set -euo pipefail
cd "$(dirname "$0")/.."
v=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
mkdir -p dist
rm -f "dist/nightcell-$v.zip"
(cd extension && zip -qr -X "../dist/nightcell-$v.zip" . -x '.*' -x '__MACOSX/*')
echo "dist/nightcell-$v.zip ($(du -h "dist/nightcell-$v.zip" | cut -f1))"
cp "dist/nightcell-$v.zip" site/nightcell.zip   # the landing page serves the same file at /nightcell.zip
echo "site/nightcell.zip ($(stat -f%z site/nightcell.zip) bytes)"
node scripts/site-data.mjs   # the site shows the version, zip size and engine colours of this build
