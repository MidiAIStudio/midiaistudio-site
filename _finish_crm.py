from pathlib import Path
import re
import subprocess

# extract crm block from patch script if present
patch = Path("_patch_crm_css.py")
if patch.exists():
    t = patch.read_text(encoding="utf-8")
    a = t.find('new = r"""') + len('new = r"""')
    b = t.find('"""', a)
    Path("_crm_block.css").write_text(t[a:b].lstrip("\n"), encoding="utf-8", newline="\n")

block = Path("_crm_block.css").read_text(encoding="utf-8")
css_path = Path("assets/css/style.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* Admin CRM (users tab) */"
hub = "/* V33 Hub board unified layout */"
if marker in css and hub in css:
    css = css[: css.find(marker)] + css[css.find(hub) :]
elif marker in css:
    # remove from marker to next major section
    rest = css[css.find(marker) + len(marker) :]
    nxt = rest.find("\n/* ")
    if nxt >= 0:
        css = css[: css.find(marker)] + rest[nxt + 1 :]

if hub in css:
    css = css.replace(hub, block + "\n" + hub, 1)
else:
    # insert after admin media section end around line with admin-tab white-space
    anchor = ".admin-page .admin-tab{white-space:nowrap}}"
    if anchor in css:
        css = css.replace(anchor, anchor + "\n\n" + block, 1)
    else:
        css += "\n" + block

css_path.write_text(css, encoding="utf-8", newline="\n")

html = Path("admin.html")
t = html.read_text(encoding="utf-8")
t = re.sub(r"style\.css\?v=[^\"]+", "style.css?v=v95-crm-density", t)
t = re.sub(r"config\.js\?v=[^\"]+", "config.js?v=v95-crm-density", t)
t = re.sub(r"app\.js\?v=[^\"]+", "app.js?v=v95-crm-density", t)
html.write_text(t, encoding="utf-8", newline="\n")

print("size", css_path.stat().st_size)
print("has float", "admin-crm-float-save" in css)
print("has filter primary", "admin-crm-filter-primary" in css)
print("bump", t.count("v95-crm-density"))
r = subprocess.run(["node", "--check", "assets/js/app.js"], capture_output=True, text=True)
print("js", r.returncode, (r.stderr or "ok")[:120])

for f in ["_insert_crm.py", "_crm_block.css", "_patch_crm_css.py"]:
    Path(f).unlink(missing_ok=True)
