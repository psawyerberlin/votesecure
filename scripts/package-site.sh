#!/usr/bin/env bash
# Package the static votesecure.net site into ./site-dist (and site-dist.zip)
# for manual upload to the web host (Strato).
#
# The site has no build step: every page is plain HTML/CSS/JS, and the
# prototype loads the CKB libraries from a CDN. This script only copies the
# files the live site needs and nothing else (no docs, no Python, no notes).
#
# Usage, from the repository root:
#   bash scripts/package-site.sh
#
# Then upload the CONTENTS of site-dist/ to the web root of votesecure.net.

set -euo pipefail
cd "$(dirname "$0")/.."

OUT=site-dist
rm -rf "$OUT" site-dist.zip
mkdir -p "$OUT/assets/fonts" "$OUT/web" "$OUT/src"

# Front page = prototype landing (index.html); project page = about.html
cp index.html about.html charter.html impressum.html datenschutz.html favicon.svg "$OUT/"
cp assets/site.css "$OUT/assets/"
cp assets/fonts/*.woff2 assets/fonts/Public-Sans-OFL.txt "$OUT/assets/fonts/"

# Prototype dApp pages
cp web/*.html web/*.css web/*.js "$OUT/web/"
cp src/*.js "$OUT/src/"

# The prototype's wallet connector asks for <site>/logo.png
cp src/logo.png "$OUT/logo.png"

# Sanity checks: the charter page must match CHARTER.md, and nothing on the
# page may still reference files that are not in the package.
if command -v node >/dev/null 2>&1; then
  node scripts/build-charter.mjs --check
fi

missing=0
while IFS= read -r ref; do
  case "$ref" in
    /*) path="$OUT$ref" ;;
    *)  continue ;;
  esac
  [ -e "$path" ] || { echo "MISSING: $ref"; missing=1; }
done < <(grep -rhoE '(src|href)="/[^"#?]+' "$OUT" --include='*.html' | sed -E 's/^(src|href)="//' | sort -u)
[ "$missing" -eq 0 ] || { echo "Package incomplete."; exit 1; }

if command -v zip >/dev/null 2>&1; then
  (cd "$OUT" && zip -qr ../site-dist.zip .)
fi

echo "Packaged $(find "$OUT" -type f | wc -l) files into $OUT/"
find "$OUT" -type f | sort
