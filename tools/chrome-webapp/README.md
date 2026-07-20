# ShiftBuilder — Chrome web app launchers

Double-clickable launchers that open ShiftBuilder in a **standalone Chrome
window** (no tabs, no address bar) instead of a browser tab.

Both launchers use your **default Chrome profile** on purpose — your ops
session/PIN cookie carries over, so you are not asked to re-authenticate on
every launch. (Passing `--user-data-dir` would create an isolated profile and
force a fresh PIN login each time.)

Default target: `https://zds.glcrops.cloud/shiftbuilder`

## macOS

```bash
./build-macos-app.sh                 # builds ShiftBuilder.app to ~/Desktop
./build-macos-app.sh /Applications   # or straight into /Applications
```

Produces a real `.app` bundle with the ShiftForge icon, so it works from
Finder, Spotlight, Launchpad, and can be kept in the Dock.

Point it somewhere else with env vars:

```bash
APP_URL=http://localhost:3000/shiftbuilder ./build-macos-app.sh   # local dev
APP_NAME="ShiftBuilder Dev" APP_URL=http://localhost:3001/shiftbuilder ./build-macos-app.sh
```

Re-run the script any time to rebuild (it replaces the existing bundle).

## Windows

Copy `ShiftBuilder-Windows.bat` anywhere (Desktop works) and double-click it
from File Explorer.

To change environment, edit the `APP_URL` line at the top.

For a nicer shortcut: right-click the `.bat` → **Send to** → **Desktop (create
shortcut)**, then rename it and set its icon to `public/icons/icon-512.png`
(converted to `.ico`).

## Notes

- Chrome remembers each app window's size and position per URL, so the window
  reopens where you left it.
- If Chrome is already running, the launcher opens a new app window in the
  existing Chrome process — it does not start a second copy.
- Chrome's built-in **Install ShiftBuilder** (⋮ → Cast, save and share →
  Install page as app) achieves a similar result via the PWA manifest; these
  scripts exist so the app can be launched from a file the way any other
  desktop shortcut is, and so the target URL is version-controlled.
- The launchers fall back to Chrome Beta / Chromium / Edge if Chrome is not
  found, and show a clear error if no Chromium browser is installed.
