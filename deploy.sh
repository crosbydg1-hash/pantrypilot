#!/bin/sh
# Publishes the site to GitHub Pages: builds it, then pushes the built files to the gh-pages branch.
# Live at https://crosbydg1-hash.github.io/pantrypilot/ a minute or two later.
# Run it from anywhere:  sh pantrypilot/deploy.sh
set -e
cd "$(dirname "$0")"
REPO_URL=$(git remote get-url origin)
sh build.sh
cd dist/stage
touch .nojekyll   # serve files as they are (no Jekyll processing)
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C ../.. config user.name)" -c user.email="$(git -C ../.. config user.email)" commit -q -m "Publish site $(date '+%Y-%m-%d %H:%M')"
git push -q -f "$REPO_URL" gh-pages
rm -rf .git
echo "Published. Live in a minute or two at https://crosbydg1-hash.github.io/pantrypilot/"
