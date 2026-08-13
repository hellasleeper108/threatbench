import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import handler_for, load_campaigns

handler = handler_for(lambda _req: load_campaigns(), cache=3600)
