# Pass policy price consistency check (local seed / hardcodes).
# Does not mutate Firestore. Exit 1 on FAIL.
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "PASS_7D": 7900,
    "PASS_30D": 19900,
    "PASS_90D": 49900,
    "LIFETIME": 129000,
}
FAILS = []
WARNS = []


def fail(msg):
    FAILS.append(msg)


def warn(msg):
    WARNS.append(msg)


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


cat = read("assets/js/catalog-engine.js")
for pid, price in EXPECTED.items():
    m = re.search(rf"productId:\s*'{pid}'[\s\S]*?listPriceKrw:\s*(\d+)", cat)
    if not m:
        fail(f"catalog-engine.js missing seed {pid}")
    else:
        got = int(m.group(1))
        if got != price:
            fail(f"catalog-engine.js {pid} listPriceKrw={got} expected {price}")

for cid in ("CREDIT_5", "CREDIT_30", "CREDIT_100"):
    m = re.search(rf"productId:\s*'{cid}'[\s\S]*?status:\s*'(\w+)'", cat)
    if not m:
        fail(f"catalog-engine.js missing {cid}")
    elif m.group(1) != "paused":
        fail(f"catalog-engine.js {cid} status={m.group(1)} expected paused")

fc = read("functions/catalogEngine.js")
for pid, price in EXPECTED.items():
    m = re.search(rf"productId:\s*'{pid}'[\s\S]*?listPriceKrw:\s*(\d+)", fc)
    if not m:
        fail(f"functions/catalogEngine.js missing seed {pid}")
    else:
        got = int(m.group(1))
        if got != price:
            fail(f"functions/catalogEngine.js {pid} listPriceKrw={got} expected {price}")

cfg = read("assets/js/config.js")
if 'priceValueKr: "129000"' not in cfg and "priceValueKr: '129000'" not in cfg:
    fail("config.js priceValueKr is not 129000")
if "CREDIT_PURCHASE_ENABLED: false" not in cfg:
    fail("config.js CREDIT_PURCHASE_ENABLED should be false")

pr = read("assets/js/pricing.js")
if re.search(r"listPrice:\s*130000", pr):
    fail("pricing.js FALLBACK still has listPrice 130000")
if not re.search(r"listPrice:\s*129000", pr):
    fail("pricing.js FALLBACK missing listPrice 129000")

ph = read("purchase.html")
if '"price": "130000"' in ph:
    fail("purchase.html schema still 130000")
if '"price": "129000"' not in ph:
    fail("purchase.html schema missing 129000")
if "크레딧 또는 Lifetime" in ph:
    fail("purchase.html still has Credit sales hero copy")

app = read("assets/js/app.js")
if "unlimitedTitle:'UNLIMITED'" in app or 'unlimitedTitle:"UNLIMITED"' in app:
    fail("app.js Lifetime card still UNLIMITED")
if "Credit 충전 후 전체 변환 가능" in app:
    fail("app.js trial still says Credit 충전 후 전체 변환 가능")
if "['Credit 차감','없음']" in app or "['Credit 차감', '없음']" in app:
    fail("app.js Pass cardFeatures still has Credit 차감")
for hit in re.finditer(r"\b130000\b", app):
    start = max(0, hit.start() - 80)
    ctx = app[start : hit.end() + 40]
    if any(k in ctx.lower() for k in ("normalize", "legacy", "130000 →", "130000->")):
        continue
    fail(f"app.js leftover 130000 near: {ctx.strip()[:120]}")

if "130000" in cat and "129000" in cat and ("130000 →" in cat or "130000->" in cat or "=== 130000" in cat):
    fail("hydrateLegacyProduct still remaps 130000→129000 (conflicts with Admin SoT)")
elif "130000" in cat:
    warn("catalog-engine mentions 130000 (ok if not a force rewrite)")

adm = read("assets/js/pricing-admin.js")
if "기간 이용권 · ${days}일" in adm:
    fail("pricing-admin.js Pass line still uses 기간 이용권 · N일 (want N일 Full)")
if "${days}일 Full" not in adm:
    fail("pricing-admin.js missing ${days}일 Full label")
if "Credits 차감 없음" in adm:
    fail("pricing-admin.js preview still says Credits 차감 없음")

print("=== Pass policy consistency ===")
for w in WARNS:
    print("WARN:", w)
if FAILS:
    for f in FAILS:
        print("FAIL:", f)
    print(f"RESULT: FAIL ({len(FAILS)} issues)")
    sys.exit(1)
print("RESULT: PASS")
print("Expected prices:", EXPECTED)

# Live catalog probe (non-fatal network; FAIL if prices wrong when reachable)
try:
    import urllib.request
    import json as _json
    url = "https://us-central1-midiaistudio.cloudfunctions.net/getPublicCatalog"
    live = _json.loads(urllib.request.urlopen(url, timeout=15).read().decode())
    live_fails = []
    for p in live.get("passes") or []:
        pid = p.get("productId")
        if pid in EXPECTED and int(p.get("listPriceKrw") or 0) != EXPECTED[pid]:
            live_fails.append(f"live passes {pid}={p.get('listPriceKrw')}")
    life = live.get("lifetime") or {}
    if int(life.get("listPriceKrw") or life.get("krw") or 0) != 129000:
        live_fails.append(f"live lifetime={life.get('listPriceKrw') or life.get('krw')}")
    for p in live.get("products") or []:
        pid = p.get("productId")
        if pid in ("CREDIT_5", "CREDIT_30", "CREDIT_100") and str(p.get("status") or "") == "active":
            live_fails.append(f"live {pid} still status=active (need Firestore pause)")
    if live_fails:
        print("LIVE_FAIL:")
        for f in live_fails:
            print(" ", f)
        sys.exit(2)
    print("LIVE: PASS (prices + credit paused)")
except Exception as e:
    warn(f"live catalog unreachable: {e}")
    print("LIVE: SKIP")
sys.exit(0)
