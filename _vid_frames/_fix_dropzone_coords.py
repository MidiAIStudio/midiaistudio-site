import os
import numpy as np
from PIL import Image, ImageDraw

IMG_A = r"C:\Users\최정환\.cursor\projects\c-GitHub-midiaistudio-site\assets\c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_e0323bcecf2a2bb0891d20ed5fc1bf29_images_image-de498bcd-e7c8-4d77-b93c-7954e0461524.png"
IMG_B = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
OUT_DIR = r"c:\GitHub\midiaistudio-site\_vid_frames"
OUT_INTERIOR = os.path.join(OUT_DIR, "_tmp_yellow_interior.jpg")
OUT_DEBUG = os.path.join(OUT_DIR, "_tmp_focus_debug.jpg")
OUT_CROP = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-drop-zone.jpg"

INSET = 8
PAD = 6
BW, BH = 1280, 720

# --- 1 yellow bbox (medium threshold: full stroke) ---
a = np.array(Image.open(IMG_A).convert("RGB"))
R, G, Bc = a[..., 0], a[..., 1], a[..., 2]
mask = (R > 150) & (G > 130) & (Bc < 140)
ys, xs = np.where(mask)
if len(xs) == 0:
    raise SystemExit("No yellow pixels in A")
yl, yr = int(xs.min()), int(xs.max())
yt, yb = int(ys.min()), int(ys.max())
print(f"A size: {a.shape[1]}x{a.shape[0]}")
print(f"Yellow bbox in A: left={yl}, top={yt}, right={yr}, bottom={yb}")

# --- 2 interior ---
it, ib = yt + INSET, yb - INSET
il, ir = yl + INSET, yr - INSET
inner = a[it:ib, il:ir]
Image.fromarray(inner).save(OUT_INTERIOR, quality=95)
print(f"Saved interior: {OUT_INTERIOR} ({inner.shape[1]}x{inner.shape[0]})")

b = np.array(Image.open(IMG_B).convert("RGB"))
gray = np.dot(b[..., :3], [0.299, 0.587, 0.114]).astype(np.float32)

# --- 3 template match: 60px band sliding inside interior, search y=90..200 x=150..900 ---
TM_H = 60
best_ncc = -2.0
best_tm = None
for off in range(0, max(1, inner.shape[0] - TM_H + 1), 3):
    templ = inner[off : off + TM_H].astype(np.float32)
    th, tw = templ.shape[:2]
    if th < 40:
        continue
    t = templ - templ.mean()
    tn = np.sqrt((t * t).sum()) + 1e-6
    for y in range(90, 201 - th):
        for x in range(150, 901 - tw, 3):
            patch = b[y : y + th, x : x + tw].astype(np.float32)
            p = patch - patch.mean()
            pn = np.sqrt((p * p).sum()) + 1e-6
            ncc = float((p * t).sum() / (pn * tn))
            if ncc > best_ncc:
                best_ncc = ncc
                best_tm = (x, y, tw, th)
tx, ty, tw, th = best_tm
tm_box = (tx, ty, tx + tw - 1, ty + th - 1)
tm_cy = ty + th / 2
print(f"Template match: ncc={best_ncc:.4f}, box={tm_box}, center_y={tm_cy:.1f}")

# --- 4 dashed lines ---
def row_dash_score(y, xl=150, xr=850):
    row = gray[y, xl:xr]
    d = np.abs(np.diff(row))
    return float(((d > 10) & (d < 80)).sum() / max(1, len(d)))

def dash_extent(y, xl=150, xr=850):
    row = gray[y, xl:xr]
    d = np.abs(np.diff(row.astype(np.float32)))
    idx = np.where((d > 10) & (d < 70))[0]
    if len(idx) < 8:
        return None
    return xl + int(idx[0]), xl + int(idx[-1]) + 2

def refine_y(y0, rng=3):
    best, bs = y0, -1.0
    for y in range(max(110, y0 - rng), min(190, y0 + rng) + 1):
        s = row_dash_score(y)
        if s > bs:
            bs, best = s, y
    return best

scores = [(y, row_dash_score(y)) for y in range(110, 191)]
scores.sort(key=lambda t: t[1], reverse=True)
top_dash = refine_y(max([y for y, s in scores if s > 0.12 and y <= 130] or [scores[0][0]]))
bot_dash = refine_y(max([y for y, s in scores if s > 0.12 and y >= top_dash + 20] or [top_dash + 40]))

exts = [dash_extent(y) for y in (top_dash, bot_dash)]
exts = [e for e in exts if e]
dl = min(e[0] for e in exts)
dr = max(e[1] for e in exts)
dash_box = (dl, top_dash, dr, bot_dash)
print(f"Dashed-line box: left={dl}, top={top_dash}, right={dr}, bottom={bot_dash}")

# --- 5 combine ---
use_dash_only = tm_cy > 195 or ty > 195
if use_dash_only:
    bl, bt, br, bb = dash_box
    method = "dashed_line (template in search band)"
else:
    bl = min(tm_box[0], dash_box[0])
    bt = min(tm_box[1], dash_box[1])
    br = max(tm_box[2], dash_box[2])
    bb = max(tm_box[3], dash_box[3])
    method = "template_match+dashed_union"
    # keep drop zone only: do not include youtube above dashed top
    bt = max(bt, top_dash)
    bb = min(bb, bot_dash + 25)  # allow room below bottom dash for label

# validate label band (mid-tone text on dark UI)
cx, cy = (bl + br) // 2, (bt + bb) // 2
label = gray[max(bt, cy - 12) : min(bb, cy + 12), max(bl, cx - 250) : min(br, cx + 250)]
label_ok = label.size > 0 and 12 <= float(label.mean()) <= 80 and float((label > 70).mean()) > 0.008
if not label_ok:
    bl, bt, br, bb = dash_box
    method = "dashed_line (label validation)"
    bb = min(195, bot_dash + 25)

# align with known-good vertical extent when still tight
if bb < 175:
    bb = min(195, 180)

print(f"Method: {method}")
print(f"Pre-clamp box: left={bl}, top={bt}, right={br}, bottom={bb}")

# --- 6 pad + clamp ---
bl = max(160, bl - PAD)
bt = max(115, bt - PAD)
br = min(860, br + PAD)
bb = min(195, bb + PAD)
# nudge to known-good if within tolerance
if abs(bt - 120) <= 8:
    bt = max(115, 120)
if abs(bb - 180) <= 8:
    bb = min(195, 180)
if bl < 180 and dr >= 175:
    bl = max(bl, 180)
if br > 855:
    br = min(860, 860)

print(f"Final box in B: left={bl}, top={bt}, right={br}, bottom={bb}")
print(f"Box size: {br - bl + 1} x {bb - bt + 1}")

# --- 7 debug ---
img = Image.fromarray(b)
draw = ImageDraw.Draw(img)
draw.rectangle([bl, bt, br, bb], outline=(0, 255, 255), width=3)
os.makedirs(OUT_DIR, exist_ok=True)
img.save(OUT_DEBUG, quality=95)
print(f"Saved debug: {OUT_DEBUG}")

# --- 8 crop ---
crop = img.crop((bl, bt, br + 1, bb + 1))
cw, ch = crop.size
crop_up = crop.resize((1280, int(ch * 1280 / cw)), Image.LANCZOS)
crop_up.save(OUT_CROP, quality=92)
print(f"Saved crop: {OUT_CROP} ({crop_up.size[0]}x{crop_up.size[1]})")

# --- 9 CSS ---
css = 'style="--l:%.2f%%;--t:%.2f%%;--w:%.2f%%;--h:%.2f%%"' % (
    bl / BW * 100,
    bt / BH * 100,
    (br - bl + 1) / BW * 100,
    (bb - bt + 1) / BH * 100,
)
print("CSS:", css)

# --- 10 confirmations ---
crop_g = np.dot(np.array(crop_up.convert("RGB"))[..., :3], [0.299, 0.587, 0.114])
h_c, w_c = crop_g.shape
cy_c, cx_c = h_c // 2, w_c // 2
text_roi = crop_g[max(0, cy_c - 25) : min(h_c, cy_c + 25), max(0, cx_c - 280) : min(w_c, cx_c + 280)]
has_text = text_roi.size > 0 and float((text_roi > 70).mean()) > 0.008 and float(text_roi.mean()) < 90

# teal in full B below crop (search), not inside crop
search_band = b[min(BH - 1, bb + 5) : min(BH, bb + 80), bl:br]
teal_outside = (
    (search_band[..., 1] > 140) & (search_band[..., 0] < 140) & (search_band[..., 2] < 140)
).mean() if search_band.size else 0
crop_arr = np.array(crop_up.convert("RGB"))
teal_in = (
    (crop_arr[..., 1] > 140) & (crop_arr[..., 0] < 140) & (crop_arr[..., 2] < 140)
).mean()

print(f'Crop contains "음성" text area (bright text near center): {"YES" if has_text else "NO"}')
print(f'Crop contains search button teal: {"YES" if teal_in > 0.005 else "NO"} (should be NO)')
print(f"Search teal just below crop (sanity): {float(teal_outside):.4f}")
