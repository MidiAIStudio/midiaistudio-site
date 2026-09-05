# -*- coding: utf-8 -*-
"""Restore corrupted HTML from HEAD, then UTF-8-safe cache bumps."""
import json
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

with open("_fix_encoding_report.json", encoding="utf-8") as f:
    report = json.load(f)

restore_files = [x["file"] for x in report["restore"]]
# Also restore already-bad-in-HEAD files that still got worse? Skip - HEAD already bad.
# But still bump cache on them if we leave them? Better restore to at least undo extra damage
# for files where work is worse than head (lost Korean). For headKo=1 workKo=1, restore is no-op for content
# but resets any other edits. Include files that only had theme bump corruption on top of already-bad.
already_bad = [x["file"] for x in report["already_bad"]]

print(f"Restoring {len(restore_files)} HTML files from HEAD...")
# git checkout -- files (batch)
# Use checkout to restore
subprocess.check_call(["git", "checkout", "--"] + restore_files)
print("Restore done.")

# Verify account.html
account = open("account.html", encoding="utf-8").read()
assert "내 계정" in account, "account.html missing 내 계정 after restore"
broken = len(re.findall(r"\?</[a-z]+>", account))
assert broken <= 1, f"still broken: {broken}"
print("account.html OK after restore:", re.search(r"<h1>.*?</h1>", account).group())

# Capture intended cache versions from intentional work (we know them)
STYLE_BUMP_ACCOUNT = ("style.css?v=nav-icons-1", "style.css?v=account-credit-1")
# Also possible other style versions
THEME_BUMP = ("theme-light.css?v=theme-44", "theme-light.css?v=theme-46")

# All HTML that reference theme-44 should become theme-46
# Also account.html needs style bump

utf8 = __import__("codecs")  # noqa
from pathlib import Path

def write_utf8(path: str, text: str):
    # UTF-8 without BOM
    data = text.encode("utf-8")
    Path(path).write_bytes(data)

bumped = []
# Walk all html in restore list + any tracked html with theme-44
candidates = set(restore_files)
# include already_bad that might have theme-44 in HEAD - after we don't restore them,
# their working copies may still have theme-46. Check both.
all_html = subprocess.check_output(["git", "ls-files", "*.html"], text=True).splitlines()
for f in all_html:
    if not os.path.exists(f):
        continue
    text = open(f, encoding="utf-8", errors="replace").read()
    orig = text
    if THEME_BUMP[0] in text:
        text = text.replace(THEME_BUMP[0], THEME_BUMP[1])
    # account-specific style bump
    if f.replace("\\", "/") == "account.html":
        if STYLE_BUMP_ACCOUNT[0] in text:
            text = text.replace(STYLE_BUMP_ACCOUNT[0], STYLE_BUMP_ACCOUNT[1])
        # if already has account-credit-1, fine
    if text != orig:
        write_utf8(f, text)
        bumped.append(f)

print(f"Cache-bumped {len(bumped)} files to theme-46 (and account style).")
for f in bumped:
    print(" ", f)

# Re-verify account
account = open("account.html", encoding="utf-8").read()
print("\nVERIFY account.html:")
print("  h1:", re.search(r"<h1>.*?</h1>", account).group())
print("  title:", re.search(r"<title>.*?</title>", account).group())
print("  ko:", len(re.findall(r"[\uac00-\ud7a3]", account)))
print("  broken closes:", len(re.findall(r"\?</[a-z]+>", account)))
print("  style cache:", re.search(r'style\.css\?v=[^"]+', account).group())
print("  theme cache:", re.search(r'theme-light\.css\?v=[^"]+', account).group())
# footer Korean
for label in ["이용약관", "개인정보", "고객센터", "내 계정", "이용권"]:
    print(f"  has '{label}':", label in account)

# Spot-check a few other restored files
for f in ["index.html", "purchase.html", "support.html"]:
    t = open(f, encoding="utf-8").read()
    ko = len(re.findall(r"[\uac00-\ud7a3]", t))
    br = len(re.findall(r"\?</[a-z]+>", t))
    m = re.search(r'theme-light\.css\?v=[^"]+', t)
    print(f"\n{f}: ko={ko} broken={br} theme={m.group() if m else 'n/a'}")
