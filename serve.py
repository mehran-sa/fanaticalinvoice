#!/usr/bin/env python3
"""
Serves SA Invoice Generator on this computer only, then opens it in the browser.

    python3 serve.py            (port 8000, or the next free port)
    python3 serve.py 8123       (a specific port)
    python3 serve.py --no-browser

Uses only the Python standard library. Files are sent with
"Cache-Control: no-cache", so after updating the app the browser always picks up
the new files instead of mixing old cached scripts with new ones.
"""

import functools
import http.server
import socket
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".otf": "font/otf"}

    def end_headers(self):
        # Revalidate on every load; unchanged files still answer 304 quickly.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet


def free_port(start):
    for port in range(start, start + 50):
        with socket.socket() as s:
            # Same option the server itself uses, so a port that was just
            # released (TIME_WAIT) counts as free and a restart keeps its port.
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    raise SystemExit("No free port found.")


def main():
    numbers = [a for a in sys.argv[1:] if a.isdigit()]
    requested = int(numbers[0]) if numbers else 8000
    port = free_port(requested)
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer((HOST, port), handler) as httpd:
        url = f"http://localhost:{port}/index.html"
        print(f"SA Invoice Generator is running at {url}")
        print("Only this computer can reach it. Press Ctrl+C to stop.")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
