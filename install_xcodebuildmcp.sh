#!/bin/bash
# install_xcodebuildmcp.sh
# Adds XcodeBuildMCP to Claude Desktop's MCP config and restarts Claude.
# Run once from Terminal: bash ~/Documents/oms_root/install_xcodebuildmcp.sh
# (or wherever your oms_root lives)

set -e

CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

# Create config file if it doesn't exist
if [ ! -f "$CONFIG" ]; then
  echo '{"mcpServers":{}}' > "$CONFIG"
  echo "Created new config at $CONFIG"
fi

# Use Python to safely merge the new entry (handles existing servers cleanly)
python3 - <<'PYEOF'
import json, sys, os

config_path = os.path.expanduser(
    "~/Library/Application Support/Claude/claude_desktop_config.json"
)

with open(config_path, "r") as f:
    config = json.load(f)

config.setdefault("mcpServers", {})

if "XcodeBuildMCP" in config["mcpServers"]:
    print("✅ XcodeBuildMCP already configured — nothing to do.")
    sys.exit(0)

config["mcpServers"]["XcodeBuildMCP"] = {
    "command": "npx",
    "args": ["-y", "xcodebuildmcp@latest", "mcp"]
}

with open(config_path, "w") as f:
    json.dump(config, f, indent=2)

print("✅ XcodeBuildMCP added to Claude Desktop config.")
PYEOF

# Restart Claude Desktop so it picks up the new server
echo "🔄 Restarting Claude Desktop..."
osascript -e 'quit app "Claude"' 2>/dev/null || true
sleep 2
open -a Claude
echo "✅ Done. Claude Desktop is restarting — XcodeBuildMCP will be available in your next session."
