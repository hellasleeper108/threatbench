import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import build_watchlist, handler_for

handler = handler_for(lambda _req: build_watchlist(), cache=300)
