#!/usr/bin/env bash
# Builds the local API server into web/src-tauri/resources/server-runtime/ so it can be
# bundled with the desktop app and spawned automatically on launch. Run from web/ (this is
# wired into tauri.conf.json's beforeBuildCommand so `tauri build` does it automatically).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/../../server"
OUT_DIR="$SCRIPT_DIR/resources/server-runtime"

echo "[prepare-server-resource] building server..."
(cd "$SERVER_DIR" && npm run build)

echo "[prepare-server-resource] staging runtime at $OUT_DIR..."
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -r "$SERVER_DIR/dist" "$OUT_DIR/dist"
cp "$SERVER_DIR/package.json" "$OUT_DIR/package.json"

echo "[prepare-server-resource] installing production dependencies..."
(cd "$OUT_DIR" && npm install --omit=dev --no-audit --no-fund)

# better-sqlite3 ships prebuilt native binaries for every OS/arch/libc combination it
# supports. linuxdeploy (the AppImage packaging tool) walks every .node file it finds and
# tries to resolve its dynamic dependencies — including the musl-libc build, which fails
# outright on a glibc system with no musl installed. Keep only the prebuild this machine
# actually runs, both to fix that and to avoid bundling ~7 unused native binaries.
PREBUILDS_DIR="$OUT_DIR/node_modules/better-sqlite3/prebuilds"
if [ -d "$PREBUILDS_DIR" ]; then
  KEEP="linux-x64.node"
  echo "[prepare-server-resource] pruning better-sqlite3 prebuilds to $KEEP..."
  find "$PREBUILDS_DIR" -type f -name "*.node" ! -name "$KEEP" -delete
fi

echo "[prepare-server-resource] done."
