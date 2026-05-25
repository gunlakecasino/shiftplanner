#!/bin/bash
# fix_nesting.sh — Run ONCE from the opsApp repo root to rescue the project structure.
# After this script, the project opens cleanly as opsApp/opsApp.xcodeproj.
#
# PREREQUISITES: Xcode must be CLOSED before running this.
#
# Usage: cd /Users/briankillian/oms_root/opsApp && bash fix_nesting.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Working in: $ROOT"

# Sanity check
if [ ! -d "$ROOT/opsApp/opsApp/opsApp.xcodeproj" ]; then
    echo "ERROR: Expected opsApp/opsApp/opsApp.xcodeproj — wrong directory or already fixed."
    exit 1
fi

echo ""
echo "Step 1: Remove supabase-swift-main local copy (replaced by SPM)..."
rm -rf "$ROOT/opsApp/opsApp/opsApp/supabase-swift-main"
echo "Done."

echo ""
echo "Step 2: Move xcodeproj up to opsApp/ root..."
cp -r "$ROOT/opsApp/opsApp/opsApp.xcodeproj" "$ROOT/opsApp.xcodeproj"
echo "Copied."

echo ""
echo "Step 3: Move source files from opsApp/opsApp/opsApp/opsApp/ → opsApp/opsApp/ ..."
# Use ditto to merge correctly
ditto "$ROOT/opsApp/opsApp/opsApp/opsApp/" "$ROOT/opsApp/"
echo "Source files merged."

echo ""
echo "Step 4: Remove old nested shell..."
rm -rf "$ROOT/opsApp/opsApp/opsApp.xcodeproj"
rm -rf "$ROOT/opsApp/opsApp/opsApp"
# Remove the now-empty opsApp/opsApp if it only has .DS_Store/Resources
if [ -z "$(ls -A "$ROOT/opsApp/opsApp" 2>/dev/null | grep -v '.DS_Store' | grep -v 'Resources')" ]; then
    rm -rf "$ROOT/opsApp/opsApp"
fi
echo "Done."

echo ""
echo "=== Final structure ==="
find "$ROOT" -maxdepth 4 \
    -not -path "*/.git/*" \
    -not -name "*.DS_Store" \
    -not -path "*/xcuserdata/*" \
    | sort

echo ""
echo "SUCCESS. Open opsApp.xcodeproj, then:"
echo "  1. File → Add Package Dependencies → https://github.com/supabase/supabase-swift"
echo "  2. Copy Secrets.plist.example → Secrets.plist and fill in credentials"
echo "  3. Cmd+B — should build clean"
