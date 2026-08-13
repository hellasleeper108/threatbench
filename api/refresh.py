import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import handler_for, refresh_all

handler = handler_for(lambda _req: refresh_all(), cache=0, methods=("POST",))
