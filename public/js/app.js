/* THREATBENCH 1.3 — Workbench shell + AmigaDOS intel CLI */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const state = {
    apts: null,
    watch: null,
    kev: null,
    pins: loadPins(),
    history: [],
    histIdx: -1,
    z: 20,
    filter: "all",
    busy: 0,
    selectedApt: null,
  };

  function loadPins() {
    try { return JSON.parse(localStorage.getItem("threatbench.pins") || "[]"); }
    catch { return []; }
  }
  function savePins() {
    localStorage.setItem("threatbench.pins", JSON.stringify(state.pins));
  }

  /* ── chrome ── */
  const pointer = $("#pointer");
  document.addEventListener("pointermove", (e) => {
    pointer.style.left = e.clientX + "px";
    pointer.style.top = e.clientY + "px";
  });

  function busy(on) {
    state.busy += on ? 1 : -1;
    if (state.busy < 0) state.busy = 0;
    document.body.classList.toggle("is-busy", state.busy > 0);
    $("#led").classList.toggle("on", state.busy > 0);
  }

  async function api(path, opts) {
    busy(true);
    try {
      const r = await fetch(path, opts);
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return await r.json();
    } finally {
      busy(false);
    }
  }

  function clock() {
    const d = new Date();
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pad = (n) => String(n).padStart(2, "0");
    $("#clock").textContent =
      `${days[d.getDay()]} ${pad(d.getDate())}-${mon[d.getMonth()]}-${String(d.getFullYear()).slice(2)}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  setInterval(clock, 1000);
  clock();

  /* ── boot ── */
  const bootLines = [
    "THREATBENCH KICKSTART  1.3  (40.068)",
    "A1200-class intel station",
    "",
    "Copyright 2026  local disk  SYS:ThreatBench",
    "Not affiliated with Commodore-Amiga, Inc.",
    "",
    "Memory test ........ 8192K OK",
    "ROM checksum ....... OK",
    "CIA / custom chips .. OK",
    "",
    "Insert Workbench disk in DF0:",
    "Reading  THREATBENCH.OS",
    "Mounting NET:",
    "Mounting APT-10:",
    "Mounting WATCH:",
  ];

  function typeBoot() {
    return new Promise((resolve) => {
      const rom = $("#boot .rom");
      const bar = $("#boot .bar > i");
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        rom.textContent = bootLines.join("\n");
        bar.style.width = "100%";
        return resolve();
      }
      let i = 0;
      let acc = "";
      const tick = () => {
        if (i >= bootLines.length) return resolve();
        acc += bootLines[i] + "\n";
        rom.textContent = acc;
        bar.style.width = Math.round(((i + 1) / bootLines.length) * 100) + "%";
        i += 1;
        setTimeout(tick, i < 6 ? 70 : 110);
      };
      tick();
    });
  }

  async function finishBoot() {
    if ($("#boot").dataset.done) return;
    $("#boot").dataset.done = "1";
    $("#boot").style.display = "none";
    $("#workbench").classList.add("on");
    openWin("cli");
    openWin("watch");
    openWin("apts");
    termPrint(banner(), "ora");
    termPrint("Type  help  — or click the desktop icons.", "dim");
    $("#cmdline").focus();
    try {
      await refreshAll();
    } catch (err) {
      termPrint("NET: " + err.message, "err");
    }
  }

  /* ── windows ── */
  const wins = {};

  function openWin(id) {
    const el = document.getElementById("win-" + id);
    if (!el) return;
    el.hidden = false;
    focusWin(el);
    wins[id] = el;
    if (id === "cli") setTimeout(() => $("#cmdline").focus(), 0);
  }
  function closeWin(el) {
    el.hidden = true;
  }
  function focusWin(el) {
    $$(".win").forEach((w) => w.classList.remove("active"));
    el.classList.add("active");
    el.style.zIndex = String(++state.z);
  }

  function wireWindows() {
    $$(".win").forEach((win) => {
      win.addEventListener("pointerdown", () => focusWin(win));
      const bar = $(".titlebar", win);
      let drag = null;
      bar.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".gadget")) return;
        const r = win.getBoundingClientRect();
        drag = { x: e.clientX - r.left, y: e.clientY - r.top };
        bar.setPointerCapture(e.pointerId);
      });
      bar.addEventListener("pointermove", (e) => {
        if (!drag) return;
        win.style.left = Math.max(0, e.clientX - drag.x) + "px";
        win.style.top = Math.max(20, e.clientY - drag.y) + "px";
      });
      bar.addEventListener("pointerup", () => { drag = null; });
      $(".gadget.close", win)?.addEventListener("click", () => closeWin(win));
      $(".gadget.depth", win)?.addEventListener("click", () => {
        win.style.zIndex = "1";
        win.classList.remove("active");
      });
      $(".gadget.zoom", win)?.addEventListener("click", () => {
        if (win.dataset.zoomed) {
          win.style.left = win.dataset.l;
          win.style.top = win.dataset.t;
          win.style.width = win.dataset.w;
          win.style.height = win.dataset.h;
          delete win.dataset.zoomed;
        } else {
          win.dataset.l = win.style.left;
          win.dataset.t = win.style.top;
          win.dataset.w = win.style.width;
          win.dataset.h = win.style.height;
          win.dataset.zoomed = "1";
          win.style.left = "8px";
          win.style.top = "28px";
          win.style.width = "calc(100% - 16px)";
          win.style.height = "calc(100% - 50px)";
        }
      });
      const rz = $(".resize", win);
      if (rz) {
        let rs = null;
        rz.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          const r = win.getBoundingClientRect();
          rs = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
          rz.setPointerCapture(e.pointerId);
        });
        rz.addEventListener("pointermove", (e) => {
          if (!rs) return;
          win.style.width = Math.max(280, rs.w + (e.clientX - rs.x)) + "px";
          win.style.height = Math.max(160, rs.h + (e.clientY - rs.y)) + "px";
        });
        rz.addEventListener("pointerup", () => { rs = null; });
      }
    });
  }

  $$(".icon").forEach((ic) => {
    ic.addEventListener("click", () => {
      $$(".icon").forEach((x) => x.classList.remove("selected"));
      ic.classList.add("selected");
    });
    ic.addEventListener("dblclick", () => openWin(ic.dataset.open));
    ic.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openWin(ic.dataset.open);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "F1") { e.preventDefault(); openWin("cli"); termExec("help"); }
    if (e.key === "F2") { e.preventDefault(); openWin("apts"); }
    if (e.key === "F3") { e.preventDefault(); openWin("watch"); }
    if (e.key === "F4") { e.preventDefault(); openWin("kev"); }
    if (e.key === "Escape") {
      const top = [...$$(".win")].filter((w) => !w.hidden).sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0))[0];
      if (top && document.activeElement?.id !== "cmdline") closeWin(top);
    }
  });

  /* ── APT infograph ── */
  function sevWidth(s) {
    return { critical: 100, high: 78, medium: 52, low: 30 }[s] || 50;
  }

  function renderApts() {
    const box = $("#apt-list");
    if (!state.apts) {
      box.innerHTML = "<p class='dim'>Mounting APT-10: …</p>";
      return;
    }
    const src = state.apts.ranking_source || {};
    $("#apt-src").innerHTML =
      `Ranking: <a href="${src.url}" target="_blank" rel="noopener">${esc(src.name)}</a> · ${esc(src.published || "")}`;
    box.innerHTML = "";
    state.apts.actors.forEach((a, i) => {
      const row = document.createElement("div");
      row.className = "apt-row" + (state.selectedApt === a.id ? " on" : "");
      row.tabIndex = 0;
      row.innerHTML = `
        <div class="rk">${String(a.rank).padStart(2, "0")}</div>
        <div class="who">
          <div class="nm">${esc(a.name)}</div>
          <div class="sub">${esc(a.motivation)}${a.mitre ? " · " + esc(a.mitre) : ""}</div>
        </div>
        <div class="attr">${esc(a.attribution)}</div>
        <div class="meter"><i style="width:${sevWidth(a.severity)}%;--w:${sevWidth(a.severity)}%"></i></div>`;
      row.addEventListener("click", () => selectApt(a.id));
      row.addEventListener("keydown", (e) => { if (e.key === "Enter") selectApt(a.id); });
      box.appendChild(row);
      requestAnimationFrame(() => {
        setTimeout(() => { row.querySelector(".meter > i").style.width = sevWidth(a.severity) + "%"; }, 80 * i);
      });
    });
    if (state.selectedApt) renderDossier(state.selectedApt);
  }

  function selectApt(id) {
    state.selectedApt = id;
    renderApts();
    renderDossier(id);
    openWin("apts");
  }

  function renderDossier(id) {
    const a = state.apts?.actors.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase()
      || (x.aliases || []).some((al) => al.toLowerCase() === id.toLowerCase())
      || String(x.rank) === String(id)
      || (x.mitre && x.mitre.toLowerCase() === id.toLowerCase()));
    const box = $("#dossier");
    if (!a) { box.classList.remove("open"); box.innerHTML = ""; return; }
    box.classList.add("open");
    box.innerHTML = `
      <h3>${String(a.rank).padStart(2, "0")}  ${esc(a.name)}</h3>
      <div class="meta">
        <span>${esc(a.attribution)}</span>
        <span>${esc(a.severity)}</span>
        ${a.mitre ? `<span>${esc(a.mitre)}</span>` : ""}
        <span>since ${esc(a.first_seen)}</span>
      </div>
      <p>${esc(a.summary)}</p>
      <p><b>NOW</b>  ${esc(a.campaign)}</p>
      <p><b>AKA</b>  ${esc((a.aliases || []).join(" · "))}</p>
      <p>${(a.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join("  ·  ")}</p>`;
  }

  function findApt(q) {
    if (!state.apts) return null;
    const n = q.toLowerCase();
    return state.apts.actors.find((x) =>
      x.id === n ||
      x.name.toLowerCase() === n ||
      x.name.toLowerCase().includes(n) ||
      String(x.rank) === n ||
      (x.mitre && x.mitre.toLowerCase() === n) ||
      (x.aliases || []).some((al) => al.toLowerCase().includes(n))
    );
  }

  /* ── watchlist ── */
  function renderWatch() {
    const box = $("#watch-body");
    if (!state.watch) { box.innerHTML = "Mounting WATCH: …"; return; }
    const s = state.watch.stats || {};
    $("#watch-stats").innerHTML = `
      <div class="statline">
        <span>ThreatFox <b>${s.threatfox_iocs ?? "—"}</b></span>
        <span>URLhaus <b>${s.urlhaus_urls ?? "—"}</b> / ${s.urlhaus_online ?? 0} up</span>
        <span>Feodo <b>${s.feodo_hosts ?? "—"}</b> / ${s.feodo_online ?? 0} up</span>
        <span>pins <b>${state.pins.length}</b></span>
      </div>`;
    let rows = state.watch.rows || [];
    if (state.filter === "pin") {
      rows = rows.filter((r) => state.pins.includes(r.id) || state.pins.includes(r.name));
    } else if (state.filter !== "all") {
      rows = rows.filter((r) => r.source === state.filter || r.kind === state.filter);
    }
    box.innerHTML = `
      <table class="wb">
        <thead><tr><th></th><th>NAME</th><th>KIND</th><th>SRC</th><th>N</th><th>STATUS</th><th>NOTE</th></tr></thead>
        <tbody>
          ${rows.map((r) => {
            const pinned = state.pins.includes(r.id) || state.pins.includes(r.name);
            return `<tr data-id="${esc(r.id)}" class="${pinned ? "pin" : ""}">
              <td><button class="pinbtn" data-id="${esc(r.id)}" data-name="${esc(r.name)}">${pinned ? "*" : "+"}</button></td>
              <td>${esc(r.name)}</td>
              <td>${esc(r.kind)}</td>
              <td>${esc(r.source)}</td>
              <td>${r.count ?? "—"}</td>
              <td><span class="pill ${esc(r.status)}">${esc(r.status)}</span></td>
              <td>${esc(r.summary || "")}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
    box.querySelectorAll(".pinbtn").forEach((b) => {
      b.addEventListener("click", () => {
        togglePin(b.dataset.id, b.dataset.name);
      });
    });
  }

  function togglePin(id, name) {
    const key = id || name;
    const i = state.pins.indexOf(key);
    if (i >= 0) state.pins.splice(i, 1);
    else state.pins.push(key);
    savePins();
    renderWatch();
  }

  $$("[data-filter]").forEach((b) => {
    b.addEventListener("click", () => {
      state.filter = b.dataset.filter;
      $$("[data-filter]").forEach((x) => x.classList.toggle("on", x === b));
      renderWatch();
    });
  });

  /* ── KEV ── */
  function renderKev() {
    const box = $("#kev-body");
    if (!state.kev) { box.innerHTML = "Mounting KEV: …"; return; }
    $("#kev-meta").textContent =
      `CISA KEV ${state.kev.catalog || ""} · released ${fmtDate(state.kev.released)} · ${state.kev.count} known exploited`;
    box.innerHTML = (state.kev.items || []).map((v) => `
      <div class="kev-item">
        <div><span class="cve">${esc(v.cve)}</span>
          ${v.ransomware === "Known" ? "<span class='ran'>RANSOM</span>" : ""}
          ${esc(v.vendor)} / ${esc(v.product)}</div>
        <div>${esc(v.name || "")}</div>
        <div>${esc(v.summary || "")}</div>
        <div>added ${esc(v.date_added)} · due ${esc(v.due)}</div>
      </div>`).join("");
  }

  /* ── CLI ── */
  const term = $("#term-log");
  const cmd = $("#cmdline");

  function banner() {
    return [
      "THREATBENCH 1.3  CLI",
      "SYS:ThreatTerm  NET:ThreatFox,Feodo,URLhaus,CISA-KEV",
      "",
    ].join("\n");
  }

  function termPrint(text, cls) {
    const d = document.createElement("div");
    d.className = "out" + (cls ? " " + cls : "");
    d.textContent = text;
    term.appendChild(d);
    const body = $("#win-cli .body");
    body.scrollTop = body.scrollHeight;
  }

  function termHTML(html) {
    const d = document.createElement("div");
    d.className = "out";
    d.innerHTML = html;
    term.appendChild(d);
    const body = $("#win-cli .body");
    body.scrollTop = body.scrollHeight;
  }

  cmd.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const line = cmd.value;
      cmd.value = "";
      if (line.trim()) {
        state.history.push(line);
        state.histIdx = state.history.length;
      }
      termExec(line);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!state.history.length) return;
      state.histIdx = Math.max(0, state.histIdx - 1);
      cmd.value = state.history[state.histIdx];
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      state.histIdx = Math.min(state.history.length, state.histIdx + 1);
      cmd.value = state.history[state.histIdx] || "";
    }
  });

  function termExec(line) {
    const raw = line.trim();
    termPrint("1> " + raw, "ora");
    if (!raw) return;
    const [verb, ...rest] = raw.split(/\s+/);
    const arg = rest.join(" ");
    const fn = commands[verb.toLowerCase()] || commands[aliases[verb.toLowerCase()]];
    if (!fn) {
      termPrint(`Unknown command "${verb}".  help  for the binder.`, "err");
      return;
    }
    Promise.resolve(fn(arg)).catch((err) => termPrint(String(err.message || err), "err"));
  }

  const aliases = {
    ls: "list", "?": "help", man: "help", dir: "list",
    cat: "show", type: "show", info: "show",
    w: "watch", wl: "watch",
    q: "search", find: "search",
    r: "refresh",
  };

  const HELP = `THREATBENCH 1.3 command binder

  help                 this text
  apts | list          top 10 current APTs
  show <name|#|Gxxxx>  open a dossier
  watch [filter]       campaign / botnet watchlist
  bots                 live malware-family rollup (ThreatFox)
  iocs [family]        recent indicators
  kev                  CISA Known Exploited Vulnerabilities
  search <term>        APTs + IOCs + KEV
  pin <name>           add to personal watchlist
  unpin <name>
  pins                 show personal watchlist
  refresh              re-pull public feeds
  sources              feed URLs and cache state
  status               station health
  open <apts|watch|cli|kev>
  clear
  about

  F1 help   F2 APT-10   F3 watch   F4 KEV
  Double-click desktop icons.  Drag orange title bars.`;

  const commands = {
    help() { termPrint(HELP); },
    about() {
      termPrint(
        "THREATBENCH 1.3 — Amiga Workbench-inspired threat station.\n" +
        "APT-10 ranking: CloudSEK, Feb 2026 (groups that dominated 2025).\n" +
        "Live watchlist: ThreatFox, Feodo Tracker, URLhaus, CISA KEV.\n" +
        "Homage only — not a Commodore product. Defensive intel, not tooling."
      );
    },
    clear() { term.innerHTML = ""; },
    open(arg) {
      const map = { apts: "apts", apt: "apts", "apt-10": "apts", watch: "watch", cli: "cli", kev: "kev", term: "cli" };
      const id = map[(arg || "").toLowerCase()];
      if (!id) return termPrint("open apts | watch | cli | kev", "err");
      openWin(id);
    },
    async list() {
      if (!state.apts) await refreshAll();
      const lines = state.apts.actors.map((a) =>
        `${String(a.rank).padStart(2, "0")}  ${a.name.padEnd(16)}  ${a.attribution.padEnd(8)}  ${a.mitre || "—"}  ${a.summary.slice(0, 70)}…`
      );
      termPrint(lines.join("\n"));
      openWin("apts");
    },
    apts(arg) { return commands.list(arg); },
    show(arg) {
      if (!arg) return termPrint("show <name|#|mitre>");
      const a = findApt(arg);
      if (!a) return termPrint("No dossier for " + arg, "err");
      selectApt(a.id);
      termPrint(
        [
          `${a.name}  [${a.attribution}]  ${a.mitre || "no MITRE"}  ${a.severity}`,
          `aka  ${(a.aliases || []).join(", ")}`,
          "",
          a.summary,
          "",
          "NOW  " + a.campaign,
          "WHY  " + a.motivation,
          "WHO  " + a.targets,
          "TTP  " + (a.ttps || []).join(" · "),
        ].join("\n")
      );
    },
    async watch(arg) {
      if (!state.watch) await refreshAll();
      openWin("watch");
      if (arg) {
        state.filter = arg;
        $$("[data-filter]").forEach((x) => x.classList.toggle("on", x.dataset.filter === arg));
        renderWatch();
      }
      const rows = (state.watch.rows || []).slice(0, 18);
      termPrint(rows.map((r) =>
        `${(r.source || "").padEnd(9)} ${(r.name || "").slice(0, 28).padEnd(28)} ${(r.status || "").padEnd(8)} ${r.count ?? "—"}`
      ).join("\n"));
    },
    async bots() {
      if (!state.watch) await refreshAll();
      const fams = state.watch.families || [];
      termPrint("ThreatFox families (recent export)\n" +
        fams.slice(0, 16).map((f) => `${String(f.count).padStart(4)}  ${f.name}  ${f.latest || ""}`).join("\n"));
    },
    async iocs(arg) {
      const data = await api("/api/iocs?limit=24" + (arg ? "&family=" + encodeURIComponent(arg) : ""));
      if (!data.iocs?.length) return termPrint("No IOCs" + (arg ? " for " + arg : "") + ".", "dim");
      termPrint(data.iocs.map((i) =>
        `${(i.first_seen || "").slice(0, 16).padEnd(17)} ${(i.malware || "").padEnd(16)} ${(i.type || "").padEnd(10)} ${i.ioc}`
      ).join("\n"));
    },
    async kev() {
      if (!state.kev) state.kev = await api("/api/kev");
      renderKev();
      openWin("kev");
      termPrint((state.kev.items || []).slice(0, 10).map((v) =>
        `${v.date_added}  ${v.cve}  ${v.vendor} ${v.product}`
      ).join("\n"));
    },
    async search(arg) {
      if (!arg) return termPrint("search <term>");
      const data = await api("/api/search?q=" + encodeURIComponent(arg));
      if (!data.hits?.length) return termPrint("No hits for " + arg, "dim");
      termPrint(data.hits.map((h) => `[${h.kind}] ${h.name}\n      ${h.detail}`).join("\n"));
    },
    pin(arg) {
      if (!arg) return termPrint("pin <name>");
      if (!state.pins.includes(arg)) state.pins.push(arg);
      savePins();
      renderWatch();
      termPrint("Pinned " + arg, "ok");
    },
    unpin(arg) {
      state.pins = state.pins.filter((p) => p.toLowerCase() !== arg.toLowerCase());
      savePins();
      renderWatch();
      termPrint("Dropped " + arg);
    },
    pins() {
      termPrint(state.pins.length ? state.pins.map((p) => "* " + p).join("\n") : "(empty personal watchlist)");
    },
    async refresh() {
      termPrint("Motor on DF0:  re-reading NET: …", "dim");
      await api("/api/refresh", { method: "POST" });
      await refreshAll();
      termPrint("Feeds refreshed.", "ok");
    },
    async sources() {
      const st = await api("/api/status");
      const lines = Object.entries(st.feeds).map(([k, url]) => {
        const m = st.feed_state[k] || {};
        return `${k.padEnd(10)} ${m.ok === false ? "FAIL" : "OK  "}  ${url}`;
      });
      termPrint(lines.join("\n") + `\ncache ttl ${st.ttl_s}s`);
    },
    async status() {
      const st = await api("/api/status");
      termPrint(
        `THREATBENCH ${st.version}  port ${st.port}  ttl ${st.ttl_s}s\n` +
        `APT-10 loaded: ${state.apts ? "yes" : "no"}  watch rows: ${state.watch?.rows?.length ?? 0}\n` +
        `pins: ${state.pins.length}`
      );
    },
    time() { termPrint(new Date().toUTCString()); },
  };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }
  function fmtDate(s) {
    if (!s) return "—";
    return String(s).replace("T", " ").replace(/\.\d+Z$/, " UTC");
  }

  async function refreshAll() {
    const [apts, watch, kev] = await Promise.all([
      api("/api/apts"),
      api("/api/watchlist"),
      api("/api/kev"),
    ]);
    state.apts = apts;
    state.watch = watch;
    state.kev = kev;
    if (!state.selectedApt && apts.actors?.[0]) state.selectedApt = apts.actors[0].id;
    renderApts();
    renderWatch();
    renderKev();
    const fails = Object.entries(watch.feeds || {}).filter(([, m]) => m && m.ok === false);
    if (fails.length) {
      termPrint("Feed warnings: " + fails.map(([k, m]) => k + " " + (m.error || "stale")).join(" · "), "err");
    } else {
      termPrint(
        `NET: ThreatFox ${watch.stats.threatfox_iocs} IOCs · URLhaus ${watch.stats.urlhaus_urls} · Feodo ${watch.stats.feodo_hosts} · KEV ${kev.count}`,
        "ok"
      );
    }
  }

  /* ── go ── */
  wireWindows();
  $("#skip").addEventListener("click", finishBoot);
  document.addEventListener("keydown", (e) => {
    if (!$("#boot").dataset.done && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      finishBoot();
    }
  });
  typeBoot().then(() => setTimeout(finishBoot, 450));
})();
