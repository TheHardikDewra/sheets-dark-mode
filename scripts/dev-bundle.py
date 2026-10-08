"""Builds a single paste-able dev snippet (font + engine + ui.css + bridge safety-net, no chrome.* APIs)
for testing Nightcell live in a Google Sheets tab via the DevTools console. Usage: python3 scripts/dev-bundle.py out.js"""
import sys, json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
engine = (root / "extension/src/font.js").read_text() + "\n" + (root / "extension/src/engine.js").read_text()
css = (root / "extension/src/ui.css").read_text()
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S); css = re.sub(r"\s+", " ", css); css = re.sub(r"\s*([{};:,>])\s*", r"\1", css)
bridge = (root / "extension/src/bridge.js").read_text()
sweep = bridge[bridge.index("  // ---------- safety net"): bridge.index("  // ---------- wiring")]
dev = ("\n;(() => { let st = document.getElementById('nc-dev-css'); if (!st) { st = document.createElement('style'); st.id = 'nc-dev-css';"
       " document.documentElement.appendChild(st); } st.textContent = " + json.dumps(css) + "; })();\n"
       ";(() => { const current = { on: true };\n" + sweep + "\n  if (document.body) watch(); })();\n")
pathlib.Path(sys.argv[1]).write_text(engine + dev)
print("wrote", sys.argv[1], len(engine + dev), "chars")
