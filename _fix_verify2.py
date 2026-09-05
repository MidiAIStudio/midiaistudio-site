# -*- coding: utf-8 -*-
import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# Re-verify account still good
raw = Path("account.html").read_bytes()
text = raw.decode("utf-8")
print("account still valid UTF-8, ko=", len(re.findall(r"[\uac00-\ud7a3]", text)))
print("h1:", re.search(r"<h1>.*?</h1>", text).group())

with open("_fix_encoding_report.json", encoding="utf-8") as f:
    report = json.load(f)

# Byte-bump theme-44 -> theme-46 on already-bad files too (no decode roundtrip of Korean)
old, new = b"theme-light.css?v=theme-44", b"theme-light.css?v=theme-46"
extra = 0
still_bad = []
for x in report["already_bad"]:
    f = x["file"]
    data = Path(f).read_bytes()
    if old in data:
        data = data.replace(old, new)
        Path(f).write_bytes(data)
        extra += 1
    # classify remaining corruption
    try:
        t = data.decode("utf-8")
    except UnicodeDecodeError:
        still_bad.append((f, "invalid-utf8"))
        continue
    br = len(re.findall(r"\?</[a-z]+>", t))
    ko = len(re.findall(r"[\uac00-\ud7a3]", t))
    if br > 2 or ko <= 5:
        still_bad.append((f, f"ko={ko} broken={br}"))

print(f"Extra theme bumps on already-bad: {extra}")
print(f"Still corrupted (bad in HEAD too): {len(still_bad)}")
for f, note in still_bad:
    print(f"  {f}: {note}")

# theme-light Korean integrity vs HEAD
head = subprocess.check_output(["git", "cat-file", "-p", "HEAD:assets/css/theme-light.css"])
work = Path("assets/css/theme-light.css").read_bytes()
ht = head.decode("utf-8")
wt = work.decode("utf-8")
print("\ntheme-light.css headKo", len(re.findall(r"[\uac00-\ud7a3]", ht)), "workKo", len(re.findall(r"[\uac00-\ud7a3]", wt)))
print("theme-light size head", len(head), "work", len(work))

# Summarize git status for key paths
stat = subprocess.check_output(["git", "diff", "--stat", "HEAD", "--", "account.html", "index.html", "assets/css/theme-light.css", "assets/css/style.css", "assets/js/app.js"], text=True)
print("\nKey diffs:\n", stat)

# Confirm restored HTML only differ by cache query
sample = subprocess.check_output(["git", "diff", "HEAD", "--", "account.html"], text=True, encoding="utf-8", errors="replace")
print("account.html diff (should be cache only):")
print(sample)
