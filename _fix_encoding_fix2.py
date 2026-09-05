# -*- coding: utf-8 -*-
"""Strict UTF-8 restore + ASCII-only cache bump (byte-safe)."""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

NAE_GYEJEONG = "\ub0b4 \uacc4\uc815"  # ? ??

with open("_fix_encoding_report.json", encoding="utf-8") as f:
    report = json.load(f)

restore_files = [x["file"] for x in report["restore"]]
print(f"git checkout -- {len(restore_files)} files")
subprocess.check_call(["git", "checkout", "--"] + restore_files)

raw = Path("account.html").read_bytes()
try:
    text = raw.decode("utf-8")
except UnicodeDecodeError as e:
    raise SystemExit(f"FATAL: account.html invalid UTF-8 right after checkout: {e}")

print("After checkout title:", re.search(r"<title>.*?</title>", text).group())
print("After checkout h1:", re.search(r"<h1>.*?</h1>", text).group())
assert NAE_GYEJEONG in text, "missing Korean after checkout"

replacements = [
    (b"theme-light.css?v=theme-44", b"theme-light.css?v=theme-46"),
]
account_only = [
    (b"style.css?v=nav-icons-1", b"style.css?v=account-credit-1"),
]

bumped = []
for f in restore_files:
    path = Path(f)
    data = path.read_bytes()
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as e:
        print(f"SKIP corrupt after checkout: {f}: {e}")
        continue
    orig = data
    for a, b in replacements:
        data = data.replace(a, b)
    if f.replace("\\", "/") == "account.html":
        for a, b in account_only:
            data = data.replace(a, b)
    if data != orig:
        data.decode("utf-8")
        path.write_bytes(data)
        bumped.append(f)

print(f"Bumped {len(bumped)} files")

raw = Path("account.html").read_bytes()
text = raw.decode("utf-8")
print("\nFINAL account.html:")
print("  title:", re.search(r"<title>.*?</title>", text).group())
print("  h1:", re.search(r"<h1>.*?</h1>", text).group())
print("  ko:", len(re.findall(r"[\uac00-\ud7a3]", text)))
print("  style:", re.search(r'style\.css\?v=[^"]+', text).group())
print("  theme:", re.search(r'theme-light\.css\?v=[^"]+', text).group())
checks = [
    ("nae gyejeong", NAE_GYEJEONG),
    ("yiyong yaggwan", "\uc774\uc6a9\uc57d\uad00"),
    ("gaein", "\uac1c\uc778\uc815\ubcf4"),
    ("gogaek", "\uace0\uac1d\uc13c\ud130"),
    ("yiyonggwon", "\uc774\uc6a9\uad8c"),
    ("license", "\ub77c\uc774\uc120\uc2a4"),
]
for label, s in checks:
    print(f"  {label}:", s in text)

idx = Path("index.html").read_bytes().decode("utf-8")
print("\nindex.html ko:", len(re.findall(r"[\uac00-\ud7a3]", idx)))
print("index theme:", re.search(r'theme-light\.css\?v=[^"]+', idx).group())

# Confirm assets still have intentional changes
app = Path("assets/js/app.js").read_text(encoding="utf-8")
style = Path("assets/css/style.css").read_text(encoding="utf-8")
theme = Path("assets/css/theme-light.css").read_text(encoding="utf-8")
print("\nIntentional assets preserved:")
print("  accountCreditCardHtml:", "accountCreditCardHtml" in app)
print("  account-panel-full:", "account-panel-full" in app)
print("  account-credit-body:", "account-credit-body" in style)
print("  raised-card count:", theme.count("raised-card"))
