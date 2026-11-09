#!/usr/bin/env bash
# Start Wanderlusst Travel and open it in the browser.
# Double-click the "Wanderlusst Travel" launcher on your desktop to run this.

set -u

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR" || exit 1

PORT="${PORT:-5000}"
URL="http://127.0.0.1:${PORT}"

# If the server is already running, just bring up the browser.
if curl -fsS --max-time 1 "$URL" >/dev/null 2>&1; then
    echo "Wanderlusst Travel is already running at $URL"
    xdg-open "$URL" >/dev/null 2>&1 &
    read -r -p "Press Enter to close this window..."
    exit 0
fi

# Open the browser once the server has had a moment to start.
( sleep 2; xdg-open "$URL" >/dev/null 2>&1 ) &

echo "Starting Wanderlusst Travel..."
echo "Press Ctrl+C in this window to stop the server."
echo

.venv/bin/python app.py
status=$?

echo
if [ "$status" -ne 0 ] && [ "$status" -ne 130 ] && [ "$status" -ne 143 ]; then
    echo "Wanderlusst Travel stopped with exit code $status."
else
    echo "Wanderlusst Travel stopped."
fi
read -r -p "Press Enter to close this window..."
