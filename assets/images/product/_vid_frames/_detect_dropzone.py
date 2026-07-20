import os
from PIL import Image, ImageDraw
import numpy as np

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
out_dir = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames"
os.makedirs(out_dir, exist_ok=True)

im = Image.open(path).convert("RGB")
W, H = im.size
print("1. IMAGE SIZE:", W, "x", H)

arr = np.array(im)
gray = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]).astype(np.float32)

print("\n2. BAND ANALYSIS (y, mean_bright, mid_bright_frac 140-200):")
for y in range(100, 281, 5):
    band = gray[y, 300:900]
    mean_b = band.mean()
    mid_frac = ((band >= 140) & (band <= 200)).mean()
    print(f"  y={y:3d} mean={mean_b:6.1f} mid_frac={mid_frac:.4f}")

best_y = None
best_score = 0
for y in range(100, 281):
    band = gray[y, 350:850]
    mid = ((band >= 130) & (band <= 210)).sum()
    if mid > best_score:
        best_score = mid
        best_y = y
print(f"\n   Peak mid-bright row (text cluster): y={best_y} score={best_score}")

text_rows = []
for y in range(100, 281):
    band = gray[y, 350:850]
    mid_frac = ((band >= 130) & (band <= 210)).mean()
    if mid_frac > 0.08:
        text_rows.append(y)
if text_rows:
    print(f"   Text-like rows (mid_frac>0.08): y={min(text_rows)}-{max(text_rows)}")


def dashed_score(row_gray, x0, x1):
    seg = row_gray[x0:x1]
    if len(seg) < 100:
        return 0
    on = (seg > 180) & (seg < 240)
    trans = np.abs(np.diff(on.astype(int))).sum()
    return int(trans)


teal_mask = (
    (arr[:, :, 0] < 100)
    & (arr[:, :, 1] > 120)
    & (arr[:, :, 2] > 120)
    & (arr[:, :, 1] > arr[:, :, 0] + 30)
)
search_y_min = 9999
search_regions = []
for y in range(180, min(400, H)):
    row = teal_mask[y, W // 2 :]
    if row.sum() > 50:
        xs = np.where(row)[0] + W // 2
        if len(xs) > 0:
            search_regions.append((y, int(xs.min()), int(xs.max()), int(row.sum())))
            search_y_min = min(search_y_min, y)

if search_regions:
    best = max(search_regions, key=lambda t: t[3])
    print(f"\n3. TEAL SEARCH UI hint: y={best[0]} x={best[1]}-{best[2]} pixels={best[3]}")
    print(f"   First teal row below y=180: y={search_y_min}")
else:
    search_y_min = 280
    print("\n3. No strong teal found; using y=280 as search start estimate")

print("\n   Dashed line scores above search (sample every 10px):")
dash_best = (0, 0)
for y in range(120, min(search_y_min - 10, 250)):
    sc_c = dashed_score(gray[y], 300, 900)
    if sc_c > dash_best[0]:
        dash_best = (sc_c, y)
    if y % 10 == 0:
        sc_t = dashed_score(gray[y], 200, W - 200)
        print(f"   y={y} dash_trans center={sc_c} wide={sc_t}")

print(f"   Best dash row (center): y={dash_best[1]} score={dash_best[0]}")

dash_rows = []
for y in range(100, min(search_y_min, 320)):
    sc = dashed_score(gray[y], 250, W - 250)
    if sc >= 15:
        dash_rows.append((sc, y))
dash_rows.sort(reverse=True)
print(f"\n   Strong dash rows (trans>=15, x=250-{W - 250}):")
for sc, y in dash_rows[:15]:
    print(f"     y={y} trans={sc}")

strips = [(120, 160, "A"), (160, 200, "B"), (200, 240, "C"), (240, 280, "D")]
for y0, y1, letter in strips:
    crop = im.crop((0, y0, W, y1))
    out = os.path.join(out_dir, f"_tmp_strip_{letter}.jpg")
    crop.save(out, quality=95)
    print(f"4. Saved strip {letter}: y={y0}-{y1} -> {out}")

strong = sorted(set(y for sc, y in dash_rows if sc >= 18))
print(f"\n5. Strong dash y values (>=18): {strong}")

t = None
for y in range(130, 220):
    sc = dashed_score(gray[y], 280, W - 280)
    if sc >= 18:
        t = y
        break
b = None
for y in range(min(search_y_min - 5, 280), 150, -1):
    sc = dashed_score(gray[y], 280, W - 280)
    if sc >= 18:
        b = y
        break
if t is None:
    t = 168 if text_rows else 155
if b is None:
    b = max(text_rows) + 20 if text_rows else 218

l, r = 280, W - 280
for y in range(t, b + 1):
    row = gray[y]
    for x in range(250, W // 2):
        if 160 < row[x] < 220:
            l = min(l, x)
    for x in range(W // 2, W - 250):
        if 160 < row[x] < 220:
            r = max(r, x)

row = gray[t]
active = [x for x in range(250, W - 250) if 175 < row[x] < 235]
if len(active) > 100:
    l = min(active) - 1
    r = max(active) + 1

print(f"\n   REFINED box: left={l} top={t} right={r} bottom={b} w={r - l} h={b - t}")

try:
    import pytesseract
    crop_text = im.crop((l, t, r, b))
    ocr = pytesseract.image_to_string(crop_text, lang="kor+eng")
    print(f"   OCR on box: {ocr.strip()!r}")
except Exception as e:
    print(f"   OCR skipped: {e}")

debug = im.copy()
draw = ImageDraw.Draw(debug)
draw.rectangle([l, t, r, b], outline=(255, 0, 0), width=3)
debug_path = os.path.join(out_dir, "_tmp_focus_debug.jpg")
debug.save(debug_path, quality=95)
print(f"\n6. Saved debug: {debug_path}")

pl = 100 * l / W
pt = 100 * t / H
pw = 100 * (r - l) / W
ph = 100 * (b - t) / H
print(f'\n7. CSS: style="--l:{pl:.2f}%;--t:{pt:.2f}%;--w:{pw:.2f}%;--h:{ph:.2f}%"')
