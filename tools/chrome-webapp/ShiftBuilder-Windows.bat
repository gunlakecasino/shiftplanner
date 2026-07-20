@echo off
REM ============================================================================
REM  ShiftBuilder - Chrome web app launcher (Windows)
REM
REM  Double-click this file in File Explorer to open ShiftBuilder in a
REM  standalone Chrome window (no tabs, no address bar).
REM
REM  Uses your DEFAULT Chrome profile on purpose, so your ops session/PIN
REM  carries over instead of asking you to log in on every launch.
REM
REM  To point at a different environment, edit APP_URL below.
REM  Tip: right-click -> "Send to" -> "Desktop (create shortcut)" for a
REM  shortcut you can rename and give the ShiftBuilder icon.
REM ============================================================================

set "APP_URL=https://zds.glcrops.cloud/shiftbuilder"

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if not defined CHROME (
  echo Google Chrome was not found in the usual install locations.
  echo Install Chrome, or edit this file and set CHROME to your chrome.exe path.
  pause
  exit /b 1
)

REM start "" detaches so the console window closes immediately.
start "" "%CHROME%" --app="%APP_URL%"
exit /b 0
