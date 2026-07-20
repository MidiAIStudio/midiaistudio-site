import numpy as np
from PIL import Image, ImageDraw
import os

base = r"c:\GitHub\midiaistudio-site"
src = os.path.join(base, "assets", "images", "product", "audio-file-picker.jpg")
out_dir = os.path.join(base, "_vid_frames")
os.makedirs(out_dir, exist_ok=True)

img = Image.open(src).convert("RGB")
W, H = img.size
arr = np.array(img)
gray = np.dot(arr[..., :3], [0.299, 0.587, 0.114]).astype(np.float32)

# 1 band
band = img.crop((0, 100, W, 200))
band.save(os.path.join(out_dir, "_tmp_band.jpg"), quality=95)

def row_dash_score(y, x0=200, x1=900):
    row = gray[y, x0:x1]
    d = np.abs(np.diff(row.astype(np.float32)))
    return float(((d > 12) & (d < 80)).sum() / len(d))

scores = [(y, row_dash_score(y)) for y in range(120, 191)]
scores.sort(key=lambda t: t[1], reverse=True)

# Top: strongest dash below YouTube (below y=135)
top_y = max([y for y, s in scores if y >= 135 and s > 0.2], default=156)

# Bottom: strongest dash in 120-190 after top+20
bot_cands = [(y, s) for y, s in scores if y > top_y + 20]
bot_cands.sort(key=lambda t: t[1], reverse=True)
bot_y = bot_cands[0][0] if bot_cands and bot_cands[0][1] > 0.03 else None
if bot_y is None:
    # extend search slightly past 190 for bottom border
    ext = [(y, row_dash_score(y)) for y in range(191, 205)]
    ext.sort(key=lambda t: t[1], reverse=True)
    bot_y = ext[0][0]

def refine_h(y0, rng=3):
    best, bs = y0, 0
    for y in range(y0 - rng, y0 + rng + 1):
        row = gray[y, 200:900]
        d = np.abs(np.diff(row))
        sc = int(((d > 10) & (d < 60)).sum())
        if sc > bs:
            bs, best = sc, y
    return best

top_y = refine_h(top_y)
bot_y = refine_h(bot_y)
y_t, y_b = min(top_y, bot_y), max(top_y, bot_y)

# Left/right: vertical gradient sum in inner band
yt, yb = y_t + 4, y_b - 4
crop = gray[yt:yb, 180:920]
vgrad = np.abs(np.diff(crop, axis=0)).sum(axis=0)
xs = np.arange(180, 920)
vgrad_s = np.convolve(vgrad, np.ones(11)/11, mode="same")
pt = max(vgrad_s.max() * 0.28, np.percentile(vgrad_s, 92))

left_x = 180
for i, x in enumerate(xs):
    if vgrad_s[i] >= pt:
        left_x = int(x)
        break
right_x = 920
for i in range(len(xs)-1, -1, -1):
    if vgrad_s[i] >= pt:
        right_x = int(xs[i])
        break

# Cross-check with top row dash extent
row = gray[y_t, left_x:right_x]
d = np.abs(np.diff(row.astype(np.float32)))
# expand to where dashes exist on top row
idx = np.where((d > 10) & (d < 60))[0]
if len(idx):
    left_x = max(left_x, left_x + int(idx[0]) - 2)
    right_x = min(right_x, left_x + int(idx[-1]) + 4)

pad = 6
l = max(0, left_x - pad)
t = max(0, y_t - pad)
r = min(W, right_x + pad)
b = min(H, y_b + pad)

debug = img.copy()
dr = ImageDraw.Draw(debug)
dr.rectangle([l, t, r, b], outline=(0, 255, 255), width=3)
dr.rectangle([220, 108, 880, 125], outline=(255, 0, 0), width=2)
debug.save(os.path.join(out_dir, "_tmp_focus_debug.jpg"), quality=95)

crop = img.crop((l, t, r, b))
crop_up = crop.resize((1280, int(crop.size[1] * 1280 / crop.size[0])), Image.LANCZOS)
crop_up.save(os.path.join(base, "assets", "images", "product", "audio-file-drop-zone.jpg"), quality=92)

l_pct, t_pct = 100 * l / W, 100 * t / H
w_pct, h_pct = 100 * (r - l) / W, 100 * (b - t) / H
print(f"Image: {W}x{H}")
print(f"Detected top dash y={top_y}, bottom dash y={bot_y}")
print(f"Box px: l={l} t={t} r={r} b={b} (w={r-l} h={b-t})")
print(f'style=\"--l:{l_pct:.2f}%;--t:{t_pct:.2f}%;--w:{w_pct:.2f}%;--h:{h_pct:.2f}%;\"')
yt_box = (220, 108, 880, 125)
yt_overlap = not (r <= yt_box[0] or l >= yt_box[2] or b <= yt_box[1] or t >= yt_box[3])
print(f"YouTube placeholder region inside final box: {'YES' if yt_overlap else 'NO'} (should be NO)")
# drop text band ~ center interior
drop_y0, drop_y1 = y_t + 8, y_b - 8
drop_in = t <= drop_y0 and b >= drop_y1 and l <= 400 <= r
print(f"Drop text region inside final box: {'YES' if drop_in else 'NO'} (should be YES)")
