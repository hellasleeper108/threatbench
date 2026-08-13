# THREATBENCH 1.3

Amiga Workbench–inspired threat-intel station. A four-color 1.3 desktop with an AmigaDOS CLI, a ranked APT-10 dossier, and a live watchlist of botnets and attack campaigns.

## What it shows

**APT-10** follows [CloudSEK's February 2026 ranking](https://www.cloudsek.com/knowledge-base/top-apt-groups-dominated) of the groups that dominated 2025:

1. Salt Typhoon · 2. Flax Typhoon · 3. Mustang Panda · 4. APT17  
5. APT28 · 6. APT29 · 7. Sandworm · 8. Lazarus · 9. Kimsuky · 10. APT42

Each card is a short, cited summary (MITRE ATT&CK, CISA, Trend Micro, DoJ, etc.). Ranking is curated; it is not computed from the live feeds.

**Watchlist** merges:

| Source | What | Auth |
| --- | --- | --- |
| [ThreatFox](https://threatfox.abuse.ch/export/json/recent/) recent export | malware families + IOCs | none |
| [Feodo Tracker](https://feodotracker.abuse.ch/downloads/ipblocklist.json) | botnet C2 hosts | none |
| [URLhaus](https://urlhaus.abuse.ch/downloads/json_recent/) recent | payload URLs / tags | none |
| [CISA KEV](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json) | known-exploited CVEs | none |
| `data/campaigns.json` | persistent APT/criminal campaigns | local |

Personal pins live in `localStorage` (`threatbench.pins`).

## Run locally

```bash
python3 server.py
# open http://127.0.0.1:1985/
```

Port override: `THREATBENCH_PORT=8080`. Cache TTL (seconds): `THREATBENCH_TTL=300`.

Stdlib only. First load warms the four public feeds in the background (5-minute cache under `/tmp` or `data/cache/`).

## Deploy (Vercel)

Workbench static files live in `public/`. Feed proxies are Python functions under `api/`.

```bash
npx vercel@latest --prod
```

After the first deploy, attach a custom domain in the Vercel project: Settings → Domains. The Workbench does not hard-code a hostname.

`refresh` and first-hit watchlist/KEV calls pull live feeds (up to ~8 MB). Responses are CDN-cached for five minutes (`s-maxage=300`).

## CLI

```
1> help
1> apts
1> show salt typhoon
1> watch
1> bots
1> iocs emotet
1> kev
1> search mozi
1> pin Flax Typhoon SOHO botnet
1> refresh
```

F1 help · F2 APT-10 · F3 watch · F4 KEV. Drag orange title bars. Double-click desktop icons.

## Notes

- Homage to Workbench 1.3 / Kickstart — not a Commodore product.
- Defensive intelligence display. No exploit code, no scanners, no C2 clients.
- ThreatFox's authenticated API is **not** required; the public JSON export is enough. If you later add an `Auth-Key`, the proxy can grow a `/api/threatfox` POST path without changing the UI.
