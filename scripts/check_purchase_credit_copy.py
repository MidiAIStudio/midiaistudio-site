# Scan purchase.html + purchase UI copy in app.js for user-visible Credit wording.
# Intentionally ignores code identifiers (CREDIT_*, confirmCredits, wallet APIs).
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
app = (ROOT / "assets/js/app.js").read_text(encoding="utf-8")

# Strict user-copy patterns (do NOT match English word "Unlimited")
USER_PAT = re.compile(
    r"(?<![A-Za-z])Credits?(?![A-Za-z])|크레딧|クレジット|"
    r"Credit\s*차감|크레딧\s*차감|Credit\s*충전|クレジット\s*購入|"
    r"クレジット消費|クレジット付与|Credit\s*Deduction|No Credit",
    re.I,
)

# Purchase UI functions only (stop before account/wallet helpers)
START = app.find("function pointCopy")
END_MARKERS = [
    "function paymentId(",
    "function makeKakaoPaymentId(",
    "function requirePurchaseAuth(",
    "function emptyCreditState(",
    "function resetCreditAccountState(",
]
end = len(app)
for m in END_MARKERS:
    i = app.find(m, START)
    if i > START:
        end = min(end, i)
# Also include purchaseLocaleText + updatePurchaseI18n which sit after applyPurchaseLifetimeGate
loc = app.find("function purchaseLocaleText")
upd = app.find("function updatePurchaseI18n")
pay = app.find("async function requestKakaoPayPointPayment")
slices = [app[START:end]]
if loc >= 0:
    loc_end = app.find("\nfunction ", loc + 10)
    slices.append(app[loc : loc_end if loc_end > 0 else loc + 8000])
if upd >= 0:
    upd_end = app.find("\nfunction ", upd + 10)
    slices.append(app[upd : upd_end if upd_end > 0 else upd + 4000])
if pay >= 0:
    pay_end = app.find("\nasync function ", pay + 10)
    if pay_end < 0:
        pay_end = app.find("\nfunction ", pay + 10)
    slices.append(app[pay : pay_end if pay_end > 0 else pay + 6000])

# PayPal disabled message near purchase
for marker in ["이 상품의 PayPal", "PayPal checkout is not available for this product"]:
    i = app.find(marker)
    if i >= 0:
        slices.append(app[max(0, i - 120) : i + 160])

purchase_js = "\n".join(slices)


def string_literals(line: str):
    return re.findall(r"'([^'\\]*(?:\\.[^'\\]*)*)'|\"([^\"\\]*(?:\\.[^\"\\]*)*)\"", line)


# Identifiers allowed even inside string literals (query keys / product ids / URL aliases)
ALLOW_LIT = re.compile(
    r"^(credits|credit|points|point|CREDIT_[0-9]+|UNLIMITED|CREDIT_|#credit)?$",
    re.I,
)

print("=== HTML ===")
html_fail = 0
for rel in ["purchase.html", "en/purchase.html", "ja/purchase.html"]:
    p = ROOT / rel
    if not p.exists():
        continue
    t = p.read_text(encoding="utf-8")
    hits = list(USER_PAT.finditer(t))
    # filter Unlimited false positives already handled by pattern
    print(f"{rel}: {len(hits)} hits")
    for m in hits:
        html_fail += 1
        print(" FAIL:", t[max(0, m.start() - 40) : m.end() + 40].replace("\n", " "))

print("=== purchase UI JS string literals ===")
js_fail = 0
for line_no, line in enumerate(purchase_js.splitlines(), 1):
    for a, b in string_literals(line):
        s = a if a is not None else b
        if not s:
            continue
        if not USER_PAT.search(s):
            continue
        # allow pure technical tokens
        if ALLOW_LIT.match(s.strip()):
            continue
        if s.strip() in {"credits", "credit", "points", "CREDIT_30", "CREDIT_5", "CREDIT_100", "UNLIMITED"}:
            continue
        if s.startswith("CREDIT_") or s in {"createCreditPurchaseQuote", "getCreditBalance"}:
            continue
        js_fail += 1
        print(" FAIL:", line.strip()[:220])
        print("   lit:", s[:160])

print("=== unlimitedTitle check ===")
title_fail = 0
for m in re.finditer(r"unlimitedTitle\s*:\s*'([^']*)'", purchase_js):
    if m.group(1).upper() == "UNLIMITED":
        title_fail += 1
        print(" FAIL unlimitedTitle:", m.group(1))
if title_fail == 0:
    print("unlimitedTitle: OK (not UNLIMITED)")

print("=== summary ===")
print(f"HTML FAIL: {html_fail}")
print(f"JS user-copy FAIL: {js_fail}")
print(f"unlimitedTitle FAIL: {title_fail}")
ok = html_fail == 0 and js_fail == 0 and title_fail == 0
print("RESULT:", "PASS" if ok else "FAIL")
raise SystemExit(0 if ok else 1)
