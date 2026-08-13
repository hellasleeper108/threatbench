#!/usr/bin/env python3
"""THREATBENCH 1.3 — local Workbench station + threat-intel proxy.

Pulls public feeds (no API key):
  ThreatFox recent IOCs      https://threatfox.abuse.ch/export/json/recent/
  Feodo Tracker botnet C2    https://feodotracker.abuse.ch/downloads/ipblocklist.json
  URLhaus recent URLs        https://urlhaus.abuse.ch/downloads/json_recent/
  CISA KEV catalog           https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json

Curated APT-10 ranking is local JSON (CloudSEK 2026 list + public citations).
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = ROOT / "data"
CACHE = DATA / "cache"
CACHE.mkdir(parents=True, exist_ok=True)

PORT = int(os.environ.get("THREATBENCH_PORT", "1985"))
TTL = int(os.environ.get("THREATBENCH_TTL", "300"))
UA = "ThreatBench/1.3 (+research; local Amiga-inspired watchlist)"

FEEDS = {
    "threatfox": "https://threatfox.abuse.ch/export/json/recent/",
    "feodo": "https://feodotracker.abuse.ch/downloads/ipblocklist.json",
    "urlhaus": "https://urlhaus.abuse.ch/downloads/json_recent/",
    "kev": "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
}

_lock = threading.Lock()
_meta: dict[str, dict] = {}


def _now() -> float:
    return time.time()


def _read_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _write_json(path: Path, payload) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload), encoding="utf-8")
    tmp.replace(path)


def fetch_url(url: str, timeout: int = 25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        return json.loads(raw.decode("utf-8", "replace"))


def cached_feed(name: str, force: bool = False):
    path = CACHE / f"{name}.json"
    meta_path = CACHE / f"{name}.meta.json"
    with _lock:
        age = None
        if path.exists() and not force:
            age = _now() - path.stat().st_mtime
            if age < TTL:
                try:
                    return _read_json(path), {"source": name, "cached": True, "age_s": int(age), "ok": True}
                except (OSError, json.JSONDecodeError):
                    pass
        try:
            data = fetch_url(FEEDS[name])
            _write_json(path, data)
            info = {"source": name, "cached": False, "age_s": 0, "ok": True, "fetched_at": int(_now())}
            _write_json(meta_path, info)
            _meta[name] = info
            return data, info
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            if path.exists():
                try:
                    stale = _read_json(path)
                    age = int(_now() - path.stat().st_mtime)
                    info = {"source": name, "cached": True, "stale": True, "age_s": age, "ok": False, "error": str(exc)}
                    _meta[name] = info
                    return stale, info
                except (OSError, json.JSONDecodeError):
                    pass
            info = {"source": name, "ok": False, "error": str(exc)}
            _meta[name] = info
            return None, info


def _iter_threatfox(blob):
    if not isinstance(blob, dict):
        return
    for _id, rows in blob.items():
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict):
                    yield row
        elif isinstance(rows, dict):
            yield rows


def _iter_urlhaus(blob):
    if not isinstance(blob, dict):
        return
    for _id, rows in blob.items():
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict):
                    yield row
        elif isinstance(rows, dict):
            yield rows


def summarize_threatfox(blob, limit_iocs: int = 80):
    families: dict[str, dict] = {}
    iocs = []
    n = 0
    for row in _iter_threatfox(blob):
        n += 1
        fam = row.get("malware_printable") or row.get("malware") or "unknown"
        slot = families.setdefault(
            fam,
            {
                "name": fam,
                "malware": row.get("malware"),
                "count": 0,
                "threat_types": {},
                "latest": row.get("first_seen_utc") or "",
                "tags": set(),
                "aliases": row.get("malware_alias"),
            },
        )
        slot["count"] += 1
        tt = row.get("threat_type") or "unknown"
        slot["threat_types"][tt] = slot["threat_types"].get(tt, 0) + 1
        seen = row.get("first_seen_utc") or ""
        if seen > slot["latest"]:
            slot["latest"] = seen
        tags = row.get("tags") or ""
        if isinstance(tags, str) and tags:
            for t in tags.split(","):
                t = t.strip()
                if t:
                    slot["tags"].add(t)
        elif isinstance(tags, list):
            slot["tags"].update(str(t) for t in tags if t)
        if len(iocs) < limit_iocs:
            iocs.append(
                {
                    "ioc": row.get("ioc_value"),
                    "type": row.get("ioc_type"),
                    "threat": row.get("threat_type"),
                    "malware": fam,
                    "confidence": row.get("confidence_level"),
                    "first_seen": row.get("first_seen_utc"),
                    "tags": row.get("tags"),
                    "reporter": row.get("reporter"),
                }
            )
    out_fams = []
    for slot in families.values():
        slot["tags"] = sorted(slot["tags"])[:12]
        out_fams.append(slot)
    out_fams.sort(key=lambda x: (-x["count"], x["name"].lower()))
    return {"families": out_fams[:40], "iocs": iocs, "total": n}


def summarize_urlhaus(blob, limit: int = 40):
    tags: dict[str, dict] = {}
    recent = []
    n = 0
    online = 0
    for row in _iter_urlhaus(blob):
        n += 1
        if row.get("url_status") == "online":
            online += 1
        raw = row.get("tags") or []
        if isinstance(raw, str):
            raw = [t.strip() for t in raw.split(",") if t.strip()]
        if not raw:
            raw = ["untagged"]
        for tag in raw:
            slot = tags.setdefault(tag, {"name": tag, "count": 0, "online": 0, "latest": row.get("dateadded") or ""})
            slot["count"] += 1
            if row.get("url_status") == "online":
                slot["online"] += 1
            added = row.get("dateadded") or ""
            if added > slot["latest"]:
                slot["latest"] = added
        if len(recent) < limit:
            recent.append(
                {
                    "url": row.get("url"),
                    "status": row.get("url_status"),
                    "threat": row.get("threat"),
                    "tags": raw,
                    "dateadded": row.get("dateadded"),
                    "link": row.get("urlhaus_link"),
                }
            )
    ranked = sorted(tags.values(), key=lambda x: (-x["count"], x["name"].lower()))
    return {"tags": ranked[:40], "recent": recent, "total": n, "online": online}


def summarize_feodo(blob):
    if not isinstance(blob, list):
        return {"hosts": [], "total": 0, "online": 0, "families": []}
    fams: dict[str, int] = {}
    hosts = []
    online = 0
    for row in blob:
        if not isinstance(row, dict):
            continue
        mal = row.get("malware") or "unknown"
        fams[mal] = fams.get(mal, 0) + 1
        if (row.get("status") or "").lower() == "online":
            online += 1
        hosts.append(
            {
                "ip": row.get("ip_address"),
                "port": row.get("port"),
                "status": row.get("status"),
                "malware": mal,
                "country": row.get("country"),
                "as_name": row.get("as_name"),
                "first_seen": row.get("first_seen"),
                "last_online": row.get("last_online"),
            }
        )
    hosts.sort(key=lambda h: (0 if (h.get("status") or "").lower() == "online" else 1, h.get("last_online") or ""), reverse=True)
    families = [{"name": k, "count": v} for k, v in sorted(fams.items(), key=lambda kv: -kv[1])]
    return {"hosts": hosts[:80], "total": len(blob), "online": online, "families": families}


def summarize_kev(blob, limit: int = 24):
    if not isinstance(blob, dict):
        return {"items": [], "count": 0, "released": None}
    vulns = blob.get("vulnerabilities") or []
    vulns = sorted(vulns, key=lambda v: v.get("dateAdded") or "", reverse=True)
    items = []
    for v in vulns[:limit]:
        items.append(
            {
                "cve": v.get("cveID"),
                "vendor": v.get("vendorProject"),
                "product": v.get("product"),
                "name": v.get("vulnerabilityName"),
                "date_added": v.get("dateAdded"),
                "due": v.get("dueDate"),
                "ransomware": v.get("knownRansomwareCampaignUse"),
                "summary": (v.get("shortDescription") or "")[:280],
                "cwes": v.get("cwes") or [],
            }
        )
    return {
        "items": items,
        "count": blob.get("count") or len(vulns),
        "released": blob.get("dateReleased"),
        "catalog": blob.get("catalogVersion"),
    }


def load_apts():
    return _read_json(DATA / "apts.json")


def load_campaigns():
    return _read_json(DATA / "campaigns.json")


def build_watchlist():
    fox, fox_m = cached_feed("threatfox")
    feodo, feodo_m = cached_feed("feodo")
    haus, haus_m = cached_feed("urlhaus")
    fox_s = summarize_threatfox(fox or {})
    feodo_s = summarize_feodo(feodo or [])
    haus_s = summarize_urlhaus(haus or {})
    curated = load_campaigns()

    rows = []
    for c in curated.get("campaigns", []):
        rows.append(
            {
                "id": c["id"],
                "name": c["name"],
                "kind": c["kind"],
                "actor": c.get("actor"),
                "status": c.get("status", "active"),
                "severity": c.get("severity", "high"),
                "source": "curated",
                "count": None,
                "latest": c.get("first_seen"),
                "summary": c.get("summary"),
                "refs": c.get("refs") or [],
            }
        )
    for fam in fox_s["families"][:18]:
        threat = max(fam["threat_types"], key=fam["threat_types"].get) if fam["threat_types"] else "ioc"
        kind = "botnet" if "botnet" in threat else "malware-family"
        rows.append(
            {
                "id": f"tf-{fam['malware'] or fam['name']}",
                "name": fam["name"],
                "kind": kind,
                "actor": fam.get("aliases"),
                "status": "hot",
                "severity": "high" if fam["count"] >= 20 else "medium",
                "source": "threatfox",
                "count": fam["count"],
                "latest": fam["latest"],
                "summary": f"{fam['count']} recent IOCs · {threat}"
                + (f" · tags {', '.join(fam['tags'][:4])}" if fam["tags"] else ""),
                "refs": ["https://threatfox.abuse.ch/"],
            }
        )
    for tag in haus_s["tags"][:12]:
        if tag["name"] in {"untagged", "32-bit", "64-bit", "elf", "exe"}:
            continue
        rows.append(
            {
                "id": f"uh-{tag['name']}",
                "name": tag["name"],
                "kind": "payload",
                "actor": None,
                "status": "online" if tag["online"] else "seen",
                "severity": "high" if tag["online"] >= 5 else "medium",
                "source": "urlhaus",
                "count": tag["count"],
                "latest": tag["latest"],
                "summary": f"{tag['count']} recent URLs · {tag['online']} online",
                "refs": ["https://urlhaus.abuse.ch/"],
            }
        )
    for fam in feodo_s["families"]:
        rows.append(
            {
                "id": f"feodo-{fam['name']}",
                "name": f"{fam['name']} C2",
                "kind": "botnet",
                "actor": fam["name"],
                "status": "tracked",
                "severity": "high",
                "source": "feodo",
                "count": fam["count"],
                "latest": None,
                "summary": f"{fam['count']} Feodo Tracker C2 host(s)",
                "refs": ["https://feodotracker.abuse.ch/"],
            }
        )

    return {
        "generated_at": int(_now()),
        "ttl_s": TTL,
        "feeds": {"threatfox": fox_m, "feodo": feodo_m, "urlhaus": haus_m},
        "stats": {
            "threatfox_iocs": fox_s["total"],
            "urlhaus_urls": haus_s["total"],
            "urlhaus_online": haus_s["online"],
            "feodo_hosts": feodo_s["total"],
            "feodo_online": feodo_s["online"],
        },
        "rows": rows,
        "families": fox_s["families"][:20],
        "feodo_hosts": feodo_s["hosts"],
        "urlhaus_recent": haus_s["recent"][:20],
        "iocs": fox_s["iocs"][:50],
    }


def build_status():
    return {
        "name": "THREATBENCH",
        "version": "1.3",
        "port": PORT,
        "ttl_s": TTL,
        "feeds": FEEDS,
        "feed_state": {k: _meta.get(k, {"source": k, "ok": None}) for k in FEEDS},
        "now": int(_now()),
    }


def search_all(q: str, limit: int = 40):
    qn = (q or "").strip().lower()
    if not qn:
        return {"query": q, "hits": []}
    hits = []

    apts = load_apts()
    for a in apts.get("actors", []):
        blob = " ".join(
            [
                a.get("name", ""),
                a.get("id", ""),
                a.get("attribution", ""),
                a.get("mitre") or "",
                a.get("summary", ""),
                a.get("campaign", ""),
                " ".join(a.get("aliases") or []),
            ]
        ).lower()
        if qn in blob:
            hits.append({"kind": "apt", "id": a["id"], "name": a["name"], "rank": a["rank"], "detail": a["summary"]})

    for c in load_campaigns().get("campaigns", []):
        blob = " ".join([c.get("name", ""), c.get("actor") or "", c.get("summary", ""), c.get("id", "")]).lower()
        if qn in blob:
            hits.append({"kind": "campaign", "id": c["id"], "name": c["name"], "detail": c["summary"]})

    fox, _ = cached_feed("threatfox")
    for row in _iter_threatfox(fox or {}):
        ioc = str(row.get("ioc_value") or "")
        fam = str(row.get("malware_printable") or "")
        tags = str(row.get("tags") or "")
        if qn in ioc.lower() or qn in fam.lower() or qn in tags.lower():
            hits.append(
                {
                    "kind": "ioc",
                    "id": ioc,
                    "name": fam or ioc,
                    "detail": f"{row.get('ioc_type')} · {row.get('threat_type')} · {ioc}",
                }
            )
        if len(hits) >= limit:
            break

    haus, _ = cached_feed("urlhaus")
    if len(hits) < limit:
        for row in _iter_urlhaus(haus or {}):
            url = str(row.get("url") or "")
            tags = row.get("tags") or []
            tag_s = ",".join(tags) if isinstance(tags, list) else str(tags)
            if qn in url.lower() or qn in tag_s.lower():
                hits.append(
                    {
                        "kind": "url",
                        "id": url,
                        "name": tag_s or "urlhaus",
                        "detail": f"{row.get('url_status')} · {url[:160]}",
                    }
                )
            if len(hits) >= limit:
                break

    kev, _ = cached_feed("kev")
    if isinstance(kev, dict) and len(hits) < limit:
        for v in kev.get("vulnerabilities") or []:
            blob = " ".join(
                [
                    v.get("cveID") or "",
                    v.get("vendorProject") or "",
                    v.get("product") or "",
                    v.get("vulnerabilityName") or "",
                    v.get("shortDescription") or "",
                ]
            ).lower()
            if qn in blob:
                hits.append(
                    {
                        "kind": "kev",
                        "id": v.get("cveID"),
                        "name": v.get("vulnerabilityName") or v.get("cveID"),
                        "detail": (v.get("shortDescription") or "")[:200],
                    }
                )
            if len(hits) >= limit:
                break

    return {"query": q, "hits": hits[:limit]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def log_message(self, fmt, *args):
        sys_stderr = __import__("sys").stderr
        sys_stderr.write("[threatbench] " + (fmt % args) + "\n")

    def _json(self, payload, code=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _err(self, message, code=500):
        self._json({"error": message}, code)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        try:
            if path == "/api/status":
                return self._json(build_status())
            if path == "/api/apts":
                return self._json(load_apts())
            if path == "/api/campaigns":
                return self._json(load_campaigns())
            if path == "/api/watchlist":
                return self._json(build_watchlist())
            if path == "/api/kev":
                blob, meta = cached_feed("kev")
                out = summarize_kev(blob or {})
                out["feed"] = meta
                return self._json(out)
            if path == "/api/iocs":
                fox, meta = cached_feed("threatfox")
                family = (qs.get("family") or [""])[0].lower()
                limit = min(int((qs.get("limit") or ["60"])[0]), 200)
                rows = []
                for row in _iter_threatfox(fox or {}):
                    fam = (row.get("malware_printable") or row.get("malware") or "")
                    if family and family not in fam.lower() and family not in str(row.get("tags") or "").lower():
                        continue
                    rows.append(
                        {
                            "ioc": row.get("ioc_value"),
                            "type": row.get("ioc_type"),
                            "threat": row.get("threat_type"),
                            "malware": fam,
                            "confidence": row.get("confidence_level"),
                            "first_seen": row.get("first_seen_utc"),
                            "tags": row.get("tags"),
                        }
                    )
                    if len(rows) >= limit:
                        break
                return self._json({"feed": meta, "family": family, "iocs": rows})
            if path == "/api/search":
                q = (qs.get("q") or [""])[0]
                return self._json(search_all(q))
            if path in ("/", "/index.html"):
                self.path = "/index.html"
            return super().do_GET()
        except Exception as exc:  # noqa: BLE001 — surface to the Workbench CLI
            self._err(str(exc), 500)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/refresh":
            for name in FEEDS:
                cached_feed(name, force=True)
            return self._json({"ok": True, "status": build_status(), "watchlist": build_watchlist()})
        self._err("not found", 404)


def warm():
    def _run():
        for name in FEEDS:
            try:
                cached_feed(name)
            except Exception:
                pass

    threading.Thread(target=_run, daemon=True).start()


def main():
    warm()
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"THREATBENCH 1.3  http://127.0.0.1:{PORT}/")
    print("Feeds: ThreatFox · Feodo · URLhaus · CISA KEV")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nDF0: motor off")
        httpd.server_close()


if __name__ == "__main__":
    main()
