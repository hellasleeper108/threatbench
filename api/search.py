import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import qs, search_all, send_json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            send_json(self, search_all((qs(self).get("q") or [""])[0]), cache=60)
        except Exception as exc:  # noqa: BLE001
            send_json(self, {"error": str(exc)}, code=500, cache=0)
