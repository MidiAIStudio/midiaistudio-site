from PIL import Image
import os

PNG_PATH = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\audio-file-picker.png"
JPG_PATH = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
OUT_JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-drop-zone.jpg"
OUT_VERIFY = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_drop_crop_verify.png"

for label, p in [("PNG", PNG_PATH), ("JPG", JPG_PATH)]:
    if os.path.isfile(p):
        im = Image.open(p)
        print(f"{label} exists: size={im.size} mode={im.mode}")
    else:
        print(f"{label} MISSING: {p}")

# pick higher-res source
sources = []
for p in (PNG_PATH, JPG_PATH):
    if os.path.isfile(p):
        im = Image.open(p)
        sources.append((im.size[0]*im.size[1], p, im.size))
sources.sort(reverse=True)
source_path = sources[0][1]
source_size = sources[0][2]
print(f"Using source: {source_path} size={source_size}")

im = Image.open(source_path).convert("RGB")
w, h = im.size
px = im.load()

# Dashed border: gray-ish pixels (~140-200) with neighbors very different (dash gap)
def is_borderish(r,g,b):
    m = (r+g+b)/3
    return 120 <= m <= 210

def row_dash_score(y, x0, x1):
    count = 0
    for x in range(x0, x1):
        r,g,b = px[x,y]
        if not is_borderish(r,g,b):
            continue
        # check horizontal neighbor contrast for dash pattern
        if x+3 < x1:
            r2,g2,b2 = px[x+3,y]
            m1 = (r+g+b)/3
            m2 = (r2+g2+b2)/3
            if abs(m1-m2) > 25:
                count += 1
    return count

def col_dash_score(x, y0, y1):
    count = 0
    for y in range(y0, y1):
        r,g,b = px[x,y]
        if not is_borderish(r,g,b):
            continue
        if y+3 < y1:
            r2,g2,b2 = px[x,y+3]
            m1 = (r+g+b)/3
            m2 = (r2+g2+b2)/3
            if abs(m1-m2) > 25:
                count += 1
    return count

# Search in upper-left content area (exclude right panel ~65%+ width on 1280 layouts)
x_search0 = int(w * 0.15)
x_search1 = int(w * 0.68)
y_search0 = int(h * 0.08)
y_search1 = int(h * 0.55)

row_scores = [(row_dash_score(y, x_search0, x_search1), y) for y in range(y_search0, y_search1)]
row_scores.sort(reverse=True)
top_rows = sorted(set(y for _, y in row_scores[:8]))
print("Candidate top/bottom rows from dash scan:", top_rows[:6])

# Find top and bottom of box: cluster of high dash scores
strong_rows = [y for s,y in row_scores if s > (x_search1-x_search0)*0.08]
strong_rows.sort()
if len(strong_rows) >= 2:
    # group consecutive
    groups = []
    g = [strong_rows[0]]
    for y in strong_rows[1:]:
        if y - g[-1] <= 3:
            g.append(y)
        else:
            groups.append(g)
            g = [y]
    groups.append(g)
    # pick group in upper-middle with reasonable height below
    best_box = None
    for i, gtop in enumerate(groups):
        top = gtop[0]
        for j, gbot in enumerate(groups):
            if j <= i: continue
            bot = gbot[-1]
            height = bot - top
            if 40 <= height <= 220 and top < h*0.45:
                best_box = (top, bot)
                break
        if best_box: break
else:
    best_box = None

if not best_box:
    # fallback scaled from 1280x720 hint
    ref_w, ref_h = 1280, 720
    sx, sy = w/ref_w, h/ref_h
    top = int(155 * sy)
    bot = int(310 * sy)
    left = int(295 * sx)
    right = int(820 * sx)
    print("Using fallback approximate box")
else:
    top, bot = best_box
    # find left/right from vertical dash scores in band
    band_y0 = max(0, top-2)
    band_y1 = min(h, bot+2)
    col_scores = [(col_dash_score(x, band_y0, band_y1), x) for x in range(x_search0, x_search1)]
    col_scores.sort(reverse=True)
    strong_cols = sorted(x for s,x in col_scores if s > (band_y1-band_y0)*0.15)
    if len(strong_cols) >= 2:
        left = strong_cols[0]
        right = strong_cols[-1]
    else:
        sx, sy = w/1280, h/720
        left = int(295 * sx)
        right = int(820 * sx)

pad_x = int(w * 0.012)
pad_top = int(h * 0.008)
pad_bot = int(h * 0.012)
# extra top for YouTube row context
pad_top += int(h * 0.045)

left = max(0, left - pad_x)
right = min(w, right + pad_x)
top = max(0, top - pad_top)
bot = min(h, bot + pad_bot)

crop = (left, top, right, bot)
print(f"Crop box (L,T,R,B): {crop}")
print(f"Crop size: {right-left}x{bot-top}")

cropped = im.crop(crop)
os.makedirs(os.path.dirname(OUT_VERIFY), exist_ok=True)
cropped.save(OUT_VERIFY, "PNG")
print(f"Saved verify PNG: {OUT_VERIFY} size={cropped.size}")

target_w = 1280
scale = target_w / cropped.width
target_h = int(round(cropped.height * scale))
upscaled = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
upscaled.save(OUT_JPG, "JPEG", quality=90, optimize=True)
print(f"Saved JPG: {OUT_JPG} size={upscaled.size}")

# brightness check: center should be lighter drop zone, not list rows
cx, cy = cropped.width//2, cropped.height//2
r,g,b = cropped.getpixel((cx, cy))
print(f"Center pixel RGB at crop: ({r},{g},{b})")
