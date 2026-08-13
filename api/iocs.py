import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import build_iocs, handler_for, qs

handler = handler_for(
    lambda req: build_iocs((qs(req).get("family") or [""])[0], int((qs(req).get("limit") or ["60"])[0])),
    cache=180,
)
