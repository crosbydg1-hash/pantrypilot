#!/bin/sh
# Builds the website into dist/stage. deploy.sh runs this, then publishes to GitHub Pages;
# build-zip.sh runs it too when you want a zip for a manual upload.
# SITE_URL is used in the recipe pages and sitemap. On Amplify it defaults to this branch's address.
set -e
cd "$(dirname "$0")"
if [ -z "$SITE_URL" ]; then
  if [ -n "$GITHUB_REPOSITORY" ]; then SITE_URL="https://${GITHUB_REPOSITORY_OWNER}.github.io/${GITHUB_REPOSITORY#*/}"
  elif [ -n "$AWS_BRANCH" ] && [ -n "$AWS_APP_ID" ]; then SITE_URL="https://$(echo "$AWS_BRANCH" | tr '/' '-').$AWS_APP_ID.amplifyapp.com"
  else SITE_URL="https://crosbydg1-hash.github.io/pantrypilot"; fi
fi

if grep -q "SUPPORT_EMAIL" privacy.html; then
  echo "Note: privacy.html still says SUPPORT_EMAIL. Add a real contact email before applying for AdSense."
fi

STAGE=dist/stage
mkdir -p "$STAGE"
find "$STAGE" -mindepth 1 -delete

# A fresh version number on every build, so phones and browsers load the new files.
VERSION=$(date +%Y%m%d%H%M%S)
sed "s/?v=dev/?v=$VERSION/g" index.html > "$STAGE/index.html"
sed "s/const VERSION = 'dev';/const VERSION = '$VERSION';/" sw.js > "$STAGE/sw.js"
cp privacy.html app.js backend.js config.js recipes.js nutrition.js manifest.webmanifest "$STAGE/"
cp -R img "$STAGE/img"
cp -R icons "$STAGE/icons"
# ads.txt proves to Google that you own the site. Create it once AdSense gives you your line.
if [ -f ads.txt ]; then cp ads.txt "$STAGE/"; fi

# One web page per recipe for Google, plus the sitemap.
python3 -I tools/build_pages.py "$STAGE" "$SITE_URL"
echo "Built site version $VERSION in $(pwd)/$STAGE for $SITE_URL"
