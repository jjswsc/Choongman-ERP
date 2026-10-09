# -*- coding: utf-8 -*-
"""One-off: scan kh/vi/ms blocks in lib/i18n.ts for posTour* keys count."""
import re
from pathlib import Path

text = Path("lib/i18n.ts").read_text(encoding="utf-8")


def block(name: str, nxt: str) -> str:
    s = text.find(f"  {name}: {{")
    e = text.find(f"  {nxt}: {{")
    if s < 0 or e < 0:
        raise SystemExit(f"missing {name} or {nxt}")
    return text[s:e]


for lang, nxt in [("kh", "vi"), ("vi", "ms"), ("ms", "} as const")]:
    b = block(lang, nxt)
    keys = re.findall(r"^\s{4}((?:posTour|posDemo|posMainTour)\w*):", b, re.M)
    print(lang, "chars", len(b), "demo_tour_keys", len(keys))
