#!/bin/bash
# Double-click this file in Finder to start the Tablecraft studio
# (which includes the local chat) and open it in your browser.

cd "$(dirname "$0")" || exit 1

# Make sure Ollama is running (it serves the local models).
if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "Starting Ollama…"
  (ollama serve >/tmp/ollama-serve.log 2>&1 &)
  for i in {1..20}; do
    curl -s http://localhost:11434/api/tags >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

URL="http://127.0.0.1:8787"
if curl -s "${URL}/api/health" >/dev/null 2>&1; then
  echo "Tablecraft already running at ${URL}"
  open "${URL}"
  exit 0
fi

echo "Starting Tablecraft on ${URL} …"
TABLECRAFT_NO_BROWSER=1 python3 run.py &
SERVER_PID=$!

for i in {1..40}; do
  curl -s "${URL}/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done

open "${URL}"

echo ""
echo "Tablecraft is running (PID ${SERVER_PID})."
echo "Close this window or press Ctrl+C to stop it."
wait ${SERVER_PID}
