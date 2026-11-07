#!/bin/sh
# Makes a zip for Amplify's "Deploy without Git" upload. Not needed once the site deploys from GitHub.
# Run it from anywhere:  sh pantrypilot/build-zip.sh
set -e
cd "$(dirname "$0")"
sh build.sh
rm -f dist/pantrypilot-site.zip
(cd dist/stage && zip -q -r ../pantrypilot-site.zip . -x '*.DS_Store')
echo "Created $(pwd)/dist/pantrypilot-site.zip ($(du -h dist/pantrypilot-site.zip | cut -f1))"
