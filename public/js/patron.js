/* Quiet sysop kettle. After ten minutes, once in a while. */
(() => {
  const HREF = "https://www.buymeacoffee.com/jaramie";
  const DELAY = 10 * 60 * 1000;
  const SNOOZE = 21 * 24 * 60 * 60 * 1000;
  const KEY = "patron.coffee";

  function until() {
    try { return Number(localStorage.getItem(KEY) || 0); } catch { return 0; }
  }
  function snooze(ms) {
    try { localStorage.setItem(KEY, String(Date.now() + ms)); } catch { /* ignore */ }
  }
  if (Date.now() < until()) return;

  function skin() {
    if (document.getElementById("start-btn") || document.getElementById("taskbar")) return "win95";
    if (document.getElementById("tv")) return "ceefax";
    if (document.getElementById("node") && document.getElementById("banner")) return "scif";
    if (document.getElementById("bezel") || document.getElementById("crt")) return "diskmag";
    if (document.getElementById("workbench") || document.querySelector(".win .titlebar")) return "wb";
    return "plain";
  }

  function dismiss(ok) {
    snooze(ok ? 180 * 24 * 60 * 60 * 1000 : SNOOZE);
    document.getElementById("patron-root")?.remove();
    if (ok) window.open(HREF, "_blank", "noopener");
  }

  function box(html, extraCss) {
    const root = document.createElement("div");
    root.id = "patron-root";
    root.innerHTML = `<style>
      #patron-root{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;pointer-events:none}
      #patron-root .dim{position:absolute;inset:0;background:rgba(0,0,0,.25);pointer-events:auto}
      #patron-card{position:relative;pointer-events:auto;max-width:360px;width:calc(100% - 32px)}
      ${extraCss || ""}
    </style>
    <div class="dim" data-later></div>
    ${html}`;
    document.body.appendChild(root);
    root.querySelector("[data-coffee]")?.addEventListener("click", () => dismiss(true));
    root.querySelectorAll("[data-later]").forEach((el) => el.addEventListener("click", () => dismiss(false)));
  }

  function show() {
    if (document.getElementById("patron-root")) return;
    const s = skin();
    if (s === "win95") {
      box(
        `<div id="patron-card" class="p-win">
          <div class="p-tb"><span>HALL 95</span><button type="button" data-later>×</button></div>
          <div class="p-bd">
            <p>This program has been running a while.</p>
            <p>Would you like to support the creator?</p>
            <div class="p-btns">
              <button type="button" data-coffee>Yes</button>
              <button type="button" data-later>Later</button>
            </div>
          </div>
        </div>`,
        `#patron-root .p-win{background:#c0c0c0;color:#000;font:11px/14px Tahoma,sans-serif;border:2px solid;border-color:#fff #000 #000 #fff;box-shadow:1px 1px 0 #808080 inset,-1px -1px 0 #808080 inset}
         #patron-root .p-tb{background:#000080;color:#fff;font-weight:700;display:flex;justify-content:space-between;padding:2px 4px;margin:2px}
         #patron-root .p-tb button{width:16px;height:14px;padding:0;background:#c0c0c0;border:1px solid #fff #000 #000 #fff}
         #patron-root .p-bd{padding:12px}
         #patron-root .p-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
         #patron-root .p-btns button{background:#c0c0c0;border:2px solid;border-color:#fff #000 #000 #fff;padding:2px 14px}`
      );
      return;
    }
    if (s === "ceefax") {
      box(
        `<div id="patron-card" class="p-cx">
          <p>888 SUPPORT</p>
          <p>THE AUTHOR HAS BEEN ON AIR FOR TEN MINUTES.</p>
          <p><button type="button" data-coffee>RED COFFEE</button> <button type="button" data-later>HOLD</button></p>
        </div>`,
        `#patron-root .p-cx{background:#000;color:#fff;font:16px/20px monospace;padding:12px;border:4px solid #ff0}
         #patron-root .p-cx button{background:#d00;color:#fff;border:0;padding:4px 10px;font:inherit}
         #patron-root .p-cx button[data-later]{background:#00a}`
      );
      return;
    }
    if (s === "scif") {
      box(
        `<div id="patron-card" class="p-sc">
          <p>UNSOLICITED CABLE</p>
          <p>The sysop's kettle has been on. Support is voluntary. The text stays public.</p>
          <p><button type="button" data-coffee>ACKNOWLEDGE</button> <button type="button" data-later>FILE</button></p>
        </div>`,
        `#patron-root .p-sc{background:#0a0a00;color:#ffb000;font:14px/18px "Courier New",monospace;padding:12px;border:1px solid #ffb000}
         #patron-root .p-sc button{background:#000;color:#ffb000;border:1px solid #ffb000;padding:4px 10px;font:inherit}`
      );
      return;
    }
    if (s === "diskmag") {
      box(
        `<div id="patron-card" class="p-dm">
          <pre>THE EDITOR DRINKS COFFEE.
PRESS C FOR CONTRIBUTION
PRESS L FOR LATER</pre>
        </div>`,
        `#patron-root .p-dm{background:#000;color:#5f5;font:16px/18px monospace;padding:12px;border:4px solid #5f5}`
      );
      document.addEventListener("keydown", function once(e) {
        if (e.key.toLowerCase() === "c") { dismiss(true); document.removeEventListener("keydown", once); }
        if (e.key.toLowerCase() === "l" || e.key === "Escape") { dismiss(false); document.removeEventListener("keydown", once); }
      });
      return;
    }
    if (s === "wb") {
      box(
        `<div id="patron-card" class="p-wb">
          <div class="p-tb">SYS:Kettle</div>
          <div class="p-bd">
            <p>The sysop's been on this node a while.</p>
            <p>Buy the creator a coffee?</p>
            <div class="p-btns">
              <button type="button" data-coffee>COFFEE</button>
              <button type="button" data-later>LATER</button>
            </div>
          </div>
        </div>`,
        `#patron-root .p-wb{background:#fff;color:#000;font:16px/16px TopazPlus,Tahoma,monospace;border:2px solid;border-color:#fff #000 #000 #fff;box-shadow:2px 2px 0 #000}
         #patron-root .p-tb{background:#ff8800;padding:2px 8px;border-bottom:2px solid #000}
         #patron-root .p-bd{padding:10px}
         #patron-root .p-btns{display:flex;gap:8px;margin-top:10px}
         #patron-root .p-btns button{background:#fff;border:2px solid;border-color:#fff #000 #000 #fff;padding:2px 10px;font:inherit;cursor:none}`
      );
      return;
    }
    box(
      `<div id="patron-card" class="p-pl">
        <p>Still here? If this was useful, you can buy Jaramie a coffee.</p>
        <p><button type="button" data-coffee>Buy me a coffee</button> <button type="button" data-later>Later</button></p>
      </div>`,
      `#patron-root .p-pl{background:#111;color:#eee;font:15px/1.4 system-ui,sans-serif;padding:16px 18px;border:1px solid #444;border-radius:8px}
       #patron-root .p-pl button{margin-right:8px;padding:6px 12px}`
    );
  }

  const quick = /(?:\?|&)kettle=1(?:&|$)/.test(location.search);
  setTimeout(show, quick ? 600 : DELAY);
})();
