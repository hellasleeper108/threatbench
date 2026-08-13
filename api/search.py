import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import handler_for, qs, search_all

handler = handler_for(lambda req: search_all((qs(req).get("q") or [""])[0]), cache=60)
