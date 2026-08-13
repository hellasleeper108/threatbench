import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import refresh_all, send_json


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            send_json(self, refresh_all(), cache=0)
        except Exception as exc:  # noqa: BLE001
            send_json(self, {"error": str(exc)}, code=500, cache=0)

    def do_GET(self):
        send_json(self, {"error": "POST only"}, code=405, cache=0)
