#!/bin/bash
#
# Builds "ShiftBuilder.app" — a double-clickable macOS launcher that opens
# ShiftBuilder in a standalone Chrome app window (no tabs, no address bar).
#
# It deliberately uses your DEFAULT Chrome profile, so your ops session/PIN
# cookie carries over and you are not asked to re-authenticate every launch.
#
# Usage:
#   ./build-macos-app.sh                      # builds to ~/Desktop
#   ./build-macos-app.sh /Applications        # builds to /Applications
#   APP_URL=http://localhost:3000/shiftbuilder ./build-macos-app.sh   # point at local dev
#
set -euo pipefail

APP_NAME="${APP_NAME:-ShiftBuilder}"
APP_URL="${APP_URL:-https://zds.glcrops.cloud/shiftbuilder}"
DEST_DIR="${1:-$HOME/Desktop}"
BUNDLE_ID="${BUNDLE_ID:-cloud.glcrops.zds.shiftbuilder}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_ICON="${SOURCE_ICON:-$REPO_ROOT/public/icons/icon-1024.png}"

APP_PATH="$DEST_DIR/$APP_NAME.app"

echo "Building $APP_PATH"
echo "  URL: $APP_URL"

rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"

# ── Launcher executable ──────────────────────────────────────────────────────
# Resolves Chrome across the usual install locations, then hands off with
# --app= so Chrome opens a chromeless standalone window.
cat > "$APP_PATH/Contents/MacOS/$APP_NAME" <<LAUNCHER
#!/bin/bash
set -euo pipefail

URL="$APP_URL"

CANDIDATES=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "\$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta"
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
)

CHROME=""
for candidate in "\${CANDIDATES[@]}"; do
  if [ -x "\$candidate" ]; then CHROME="\$candidate"; break; fi
done

if [ -z "\$CHROME" ]; then
  osascript -e 'display alert "Google Chrome not found" message "Install Google Chrome, then launch ShiftBuilder again." as critical'
  exit 1
fi

# --app= gives the standalone window. No --user-data-dir on purpose: that would
# create an isolated profile and force a fresh PIN login every time.
exec "\$CHROME" --app="\$URL"
LAUNCHER

chmod +x "$APP_PATH/Contents/MacOS/$APP_NAME"

# ── Icon ─────────────────────────────────────────────────────────────────────
if [ -f "$SOURCE_ICON" ]; then
  ICONSET="$(mktemp -d)/$APP_NAME.iconset"
  mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$SOURCE_ICON" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1
    double=$((size * 2))
    sips -z $double $double "$SOURCE_ICON" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null 2>&1
  done
  iconutil -c icns "$ICONSET" -o "$APP_PATH/Contents/Resources/AppIcon.icns"
  rm -rf "$(dirname "$ICONSET")"
  echo "  icon: embedded from $(basename "$SOURCE_ICON")"
else
  echo "  icon: skipped (no source icon at $SOURCE_ICON)"
fi

# ── Info.plist ───────────────────────────────────────────────────────────────
cat > "$APP_PATH/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHighResolutionCapable</key><true/>
  <!-- Launcher exits immediately after handing off to Chrome; keep it out of the Dock. -->
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

# Refresh Finder's icon cache so the new icon shows immediately.
touch "$APP_PATH"

echo "Done. Double-click $APP_PATH (or drag it to /Applications or the Dock)."
