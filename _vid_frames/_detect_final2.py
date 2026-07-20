import numpy as np
from PIL import Image, ImageDraw
import os

base = r"c:\GitHub\midiaistudio-site"
src = os.path.join(base, "assets", "images", "product", "audio-file-picker.jpg")
out_dir = os.path.join(base, "_vid_frames")
img = Image.open(src).convert("RGB")
W, H = img.size
arr = np.array(img)
gray = np.dot(arr[..., :3], [0.299, 0.587, 0.114]).astype(np.float32)

img.crop((0, 100, W, 200)).save(os.path.join(out_dir, "_tmp_band.jpg"), quality=95)

def row_dash_score(y, x0=200, x1=900):
    row = gray[y, x0:x1]
    d = np.abs(np.diff(row.astype(np.float32)))
    return float(((d > 12) & (d < 80)).sum() / len(d))

def refine_h(y0, rng=3):
    best, bs = y0, 0
    for y in range(y0 - rng, y0 + rng + 1):
        row = gray[y, 200:900]
        d = np.abs(np.diff(row))
        sc = int(((d > 10) & (d < 60)).sum())
        if sc > bs:
            bs, best = sc, y
    return best

top_y = refine_h(156)
# bottom: best dash peak after top, prefer 120-200
bot_scores = [(y, row_dash_score(y)) for y in range(top_y + 15, 201)]
bot_scores.sort(key=lambda t: t[1], reverse=True)
bot_y = refine_h(bot_scores[0][0])
y_t, y_b = min(top_y, bot_y), max(top_y, bot_y)

yt, yb = y_t + 5, y_b - 5
crop = gray[yt:yb, 200:900]
vgrad = np.abs(np.diff(crop, axis=0)).sum(axis=0)
xs = np.arange(200, 900)
vgrad_s = np.convolve(vgrad, np.ones(11)/11, mode="same")
pt = max(vgrad_s.max() * 0.25, np.percentile(vgrad_s, 90))
left_x, right_x = 200, 900
for i, x in enumerate(xs):
    if vgrad_s[i] >= pt:
        left_x = int(x)
        break
for i in range(len(xs)-1, -1, -1):
    if vgrad_s[i] >= pt:
        right_x = int(xs[i])
        break

# Refine L/R using top dashed row extent
top_row = gray[y_t, 200:900]
d = np.abs(np.diff(top_row.astype(np.float32)))
idx = np.where((d > 10) & (d < 60))[0]
if len(idx) > 10:
    dash_left = 200 + int(idx[0])
    dash_right = 200 + int(idx[-1]) + 2
    left_x = min(left_x, dash_left)
    right_x = max(right_x, dash_right)

pad = 6
l, t, r, b = max(0, left_x - pad), max(0, y_t - pad), min(W, right_x + pad), min(H, y_b + pad)

debug = img.copy()
ImageDraw.Draw(debug).rectangle([l, t, r, b], outline=(0, 255, 255), width=3)
debug.save(os.path.join(out_dir, "_tmp_focus_debug.jpg"), quality=95)

crop = img.crop((l, t, r, b))
crop_up = crop.resize((1280, int(crop.size[1] * 1280 / crop.size[0])), Image.LANCZOS)
crop_up.save(os.path.join(base, "assets", "images", "product", "audio-file-drop-zone.jpg"), quality=92)

print(f"top_y={top_y} bot_y={bot_y} bot_peak={bot_scores[0]}")
print(f"Box: l={l} t={t} r={r} b={b} w={r-l} h={b-t}")
print(f'style="--l:{100*l/W:.2f}%;--t:{100*t/H:.2f}%;--w:{100*(r-l)/W:.2f}%;--h:{100*(b-t)/H:.2f}%"')
yt_overlap = not (r <= 220 or l >= 880 or b <= 108 or t >= 125)
print(f"YouTube placeholder inside final box: {'YES' if yt_overlap else 'NO'} (should be NO)")
drop_in = t < (y_t + y_b)//2 < b and l < 500 < r
print(f"Drop text region inside final box: {'YES' if drop_in else 'NO'} (should be YES)")
