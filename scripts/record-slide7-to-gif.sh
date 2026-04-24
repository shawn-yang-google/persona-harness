#!/usr/bin/env bash
# Record slide 7's terminal animation to docs/demo.gif and docs/demo.mp4.
# Requires: bun (with puppeteer installed), ffmpeg.
# Usage: scripts/record-slide7-to-gif.sh
set -euo pipefail
cd "$(dirname "$0")/.."

FRAMES=/tmp/persona-frames
mkdir -p "$FRAMES" docs
rm -f "$FRAMES"/*.png 2>/dev/null || true

echo "==> capturing frames with puppeteer (~25s)"
bun run scripts/record-slide7.ts

echo "==> building palette"
ffmpeg -y -framerate 10 -i "$FRAMES/frame-%04d.png" \
  -vf "scale=1024:-1:flags=lanczos,palettegen=stats_mode=diff" \
  /tmp/persona-palette.png > /dev/null 2>&1

echo "==> building docs/demo.gif"
ffmpeg -y -framerate 10 -i "$FRAMES/frame-%04d.png" -i /tmp/persona-palette.png \
  -filter_complex "scale=1024:-1:flags=lanczos[s];[s][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 docs/demo.gif > /dev/null 2>&1

echo "==> building docs/demo.mp4"
ffmpeg -y -framerate 10 -i "$FRAMES/frame-%04d.png" \
  -vf "scale=1024:-2:flags=lanczos" \
  -c:v libx264 -pix_fmt yuv420p -crf 22 -movflags +faststart \
  docs/demo.mp4 > /dev/null 2>&1

ls -lh docs/demo.gif docs/demo.mp4
