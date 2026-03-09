#!/bin/bash
# Post-build script for Tauri static export
# Creates SPA-like fallback pages for dynamic routes
# Tauri serves files from the embedded out/ directory — when navigating to
# /projects/{uuid}/, it needs an index.html to serve. We copy the placeholder
# page so any project/report ID resolves to the same client-side rendered page.

OUT_DIR="out"

if [ ! -d "$OUT_DIR" ]; then
  echo "Error: $OUT_DIR directory not found. Run 'npm run build:static' first."
  exit 1
fi

echo "Setting up SPA fallback for dynamic routes..."

# Create a __fallback directory marker for projects
# The client-page reads the ID from the URL pathname at runtime
if [ -f "$OUT_DIR/projects/_/index.html" ]; then
  # Copy the placeholder page's Next.js data files too
  cp -r "$OUT_DIR/projects/_/" "$OUT_DIR/projects/__fallback/"
  echo "  Projects fallback ready"
fi

# Same for reports
if [ -f "$OUT_DIR/reports/_/index.html" ]; then
  cp -r "$OUT_DIR/reports/_/" "$OUT_DIR/reports/__fallback/"
  echo "  Reports fallback ready"
fi

# Also copy the 404 page as a root fallback
if [ -f "$OUT_DIR/404.html" ]; then
  echo "  404 fallback exists"
fi

echo "Post-build complete!"
