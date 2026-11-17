from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = os.getenv("TABLECRAFT_HOST", "127.0.0.1")
PORT = int(os.getenv("TABLECRAFT_PORT", "8787"))
URL = f"http://{HOST}:{PORT}"


def open_browser() -> None:
    time.sleep(1.4)
    webbrowser.open(URL)


def main() -> None:
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host",
        HOST,
        "--port",
        str(PORT),
    ]
    if "--reload" in sys.argv:
        command.append("--reload")

    if not os.getenv("TABLECRAFT_NO_BROWSER"):
        threading.Thread(target=open_browser, daemon=True).start()

    # Make sure Ollama is running (it serves the local models).
    try:
        import urllib.request

        urllib.request.urlopen("http://localhost:11434/api/tags", timeout=2)
    except Exception:
        print("Starting Ollama…")
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(20):
            try:
                urllib.request.urlopen("http://localhost:11434/api/tags", timeout=2)
                break
            except Exception:
                time.sleep(0.5)

    print(f"Tablecraft studio · {URL}")
    process = subprocess.Popen(command, cwd=ROOT)

    def stop(signum, frame) -> None:  # type: ignore[no-untyped-def]
        if process.poll() is None:
            process.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    try:
        process.wait()
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
