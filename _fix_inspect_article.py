# -*- coding: utf-8 -*-
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
t = subprocess.check_output(
    ["git", "cat-file", "-p", "HEAD:guides/articles/audio-to-midi-ai.html"]
).decode("utf-8")
print("title:", re.search(r"<title>.*?</title>", t).group()[:150])
print("broken:")
for m in re.finditer(r".{0,40}\?</[a-z]+>.{0,20}", t):
    print(" ", repr(m.group()))
# Is body English?
body = re.search(r"<article[\s\S]*?</article>|<main[\s\S]*?</main>", t)
sample = (body.group() if body else t)[:500]
print("body sample:", sample[:300].replace("\n", " "))
