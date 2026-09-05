# -*- coding: utf-8 -*-
"""Restore already-bad-in-HEAD HTML from git (undo invalid-UTF8 worktree damage),
then byte-bump theme-44 -> theme-46."""
import json
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

with open("_fix_encoding_report.json", encoding="utf-8") as f:
    report = json.load(f)

files = [x["file"] for x in report["already_bad"]]
print(f"Restoring {len(files)} already-bad files from HEAD")
subprocess.check_call(["git", "checkout", "--"] + files)

old, new = b"theme-light.css?v=theme-44", b"theme-light.css?v=theme-46"
bumped = 0
invalid = 0
for f in files:
    data = Path(f).read_bytes()
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        print("Still invalid after checkout:", f)
        invalid += 1
        continue
    if old in data:
        data = data.replace(old, new)
        Path(f).write_bytes(data)
        bumped += 1

print(f"Bumped {bumped}, still invalid {invalid}")

# Final account check
acc = Path("account.html").read_bytes().decode("utf-8")
assert "\ub0b4 \uacc4\uc815" in acc
print("account.html still OK")
