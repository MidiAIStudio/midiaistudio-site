# -*- coding: utf-8 -*-
import re, sys, subprocess, os, json

sys.stdout.reconfigure(encoding="utf-8")

account = open("account.html", encoding="utf-8").read()
print("account broken matches:")
for m in re.finditer(r".{0,30}\?</[a-z]+>.{0,15}", account):
    print(repr(m.group()))

diff = subprocess.check_output(
    ["git", "diff", "--stat", "HEAD"], text=True, encoding="utf-8", errors="replace"
)
print("\n=== git diff --stat ===")
print(diff)

with open("_fix_encoding_report.json", encoding="utf-8") as f:
    report = json.load(f)

print("Already-bad-in-HEAD remaining (sample):")
for x in report["already_bad"][:8]:
    fpath = x["file"]
    t = open(fpath, encoding="utf-8", errors="replace").read()
    ko = len(re.findall(r"[\uac00-\ud7a3]", t))
    br = len(re.findall(r"\?</[a-z]+>", t))
    m = re.search(r'theme-light\.css\?v=[^"]+', t)
    print(fpath, "ko", ko, "broken", br, "theme", m.group() if m else "n/a")

print("\nHistory for guides/articles/audio-to-midi-ai.html:")
log = subprocess.check_output(
    ["git", "log", "--oneline", "-10", "--", "guides/articles/audio-to-midi-ai.html"],
    text=True,
)
print(log)
for line in log.splitlines()[:6]:
    sha = line.split()[0]
    try:
        blob = subprocess.check_output(
            ["git", "cat-file", "-p", f"{sha}:guides/articles/audio-to-midi-ai.html"]
        )
        t = blob.decode("utf-8", "replace")
        ko = len(re.findall(r"[\uac00-\ud7a3]", t))
        br = len(re.findall(r"\?</[a-z]+>", t))
        print(f"  {sha}: ko={ko} broken={br}")
    except Exception as e:
        print("  fail", sha, e)

# Also check if already-bad files need theme bump (still theme-44 or theme-46?)
print("\nTheme version on already-bad files:")
theme44 = theme46 = other = 0
for x in report["already_bad"]:
    t = open(x["file"], encoding="utf-8", errors="replace").read()
    if "theme-46" in t:
        theme46 += 1
    elif "theme-44" in t:
        theme44 += 1
    else:
        other += 1
print(f"  theme-46={theme46} theme-44={theme44} other={other}")

# False-positive check: HEAD account also had broken=1
head = subprocess.check_output(["git", "cat-file", "-p", "HEAD:account.html"]).decode("utf-8")
print("\nHEAD account broken matches:")
for m in re.finditer(r".{0,30}\?</[a-z]+>.{0,15}", head):
    print(repr(m.group()))
