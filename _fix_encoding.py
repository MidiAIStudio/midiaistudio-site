# -*- coding: utf-8 -*-
import subprocess, re, os, json, sys

sys.stdout.reconfigure(encoding="utf-8")

def git_show(path):
    return subprocess.check_output(["git", "cat-file", "-p", f"HEAD:{path}"])

def ko_count(t):
    return len(re.findall(r"[\uac00-\ud7a3]", t))

def broken_close(t):
    return len(re.findall(r"\?</[a-z]+>", t))

head = git_show("account.html").decode("utf-8")
work = open("account.html", encoding="utf-8", errors="replace").read()
print("HEAD title:", re.search(r"<title>.*?</title>", head).group())
print("HEAD h1:", re.search(r"<h1>.*?</h1>", head).group())
print("HEAD ko:", ko_count(head), "broken:", broken_close(head))
print("WORK title:", re.search(r"<title>.*?</title>", work).group())
print("WORK h1:", re.search(r"<h1>.*?</h1>", work).group())
print("WORK ko:", ko_count(work), "broken:", broken_close(work))
print("HEAD cache:")
for m in re.finditer(r'href="[^"]+(?:style|theme-light)\.css\?v=[^"]+"', head):
    print(" ", m.group())
print("WORK cache:")
for m in re.finditer(r'href="[^"]+(?:style|theme-light)\.css\?v=[^"]+"', work):
    print(" ", m.group())

files = subprocess.check_output(["git", "diff", "--name-only", "HEAD"], text=True).splitlines()
restore, already_bad, assets = [], [], []
for f in files:
    if f.startswith("assets/"):
        assets.append(f)
        continue
    if not f.endswith(".html"):
        continue
    try:
        h = git_show(f).decode("utf-8", errors="replace")
    except Exception:
        continue
    if not os.path.exists(f):
        continue
    w = open(f, encoding="utf-8", errors="replace").read()
    hk, wk = ko_count(h), ko_count(w)
    bh, bw = broken_close(h), broken_close(w)
    # Already bad in HEAD: many broken tags OR almost no Korean on pages that look Korean-site
    if bh > 2 or (hk <= 5 and broken_close(w) >= 0 and ("guides/articles" in f or "guides/midi-converter" in f)):
        if bh > 2 or hk <= 5:
            already_bad.append({"file": f, "headKo": hk, "workKo": wk, "brokenHead": bh, "brokenWork": bw})
            continue
    if bw > 0 or (hk > 20 and wk < hk * 0.85) or ("theme-4" in w):
        restore.append({"file": f, "headKo": hk, "workKo": wk, "brokenWork": bw})

print("\nRESTORE", len(restore))
for x in restore:
    print(f"  {x['file']} headKo={x['headKo']} workKo={x['workKo']} broken={x['brokenWork']}")
print("\nALREADY_BAD_IN_HEAD", len(already_bad))
for x in already_bad:
    print(f"  {x['file']} headKo={x['headKo']} brokenHead={x['brokenHead']}")
print("\nASSETS", assets)

with open("_fix_encoding_report.json", "w", encoding="utf-8") as out:
    json.dump({"restore": restore, "already_bad": already_bad, "assets": assets}, out, ensure_ascii=False, indent=2)

print("\nASSET integrity:")
for f in assets:
    h = git_show(f).decode("utf-8", errors="replace")
    w = open(f, encoding="utf-8", errors="replace").read()
    print(f, "headKo", ko_count(h), "workKo", ko_count(w), "fffd", w.count("\ufffd"), "broken", broken_close(w))
