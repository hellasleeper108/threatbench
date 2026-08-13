import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import build_iocs, qs, send_json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            args = qs(self)
            send_json(
                self,
                build_iocs((args.get("family") or [""])[0], int((args.get("limit") or ["60"])[0])),
                cache=180,
            )
        except Exception as exc:  # noqa: BLE001
            send_json(self, {"error": str(exc)}, code=500, cache=0)
