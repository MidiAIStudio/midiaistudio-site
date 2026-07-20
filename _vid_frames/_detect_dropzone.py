import numpy as np
from PIL import Image, ImageDraw
import os

base = r"c:\GitHub\midiaistudio-site"
src = os.path.join(base, "assets", "images", "product", "audio-file-picker.jpg")
out_dir = os.path.join(base, "_vid_frames")
os.makedirs(out_dir, exist_ok=True)

img = Image.open(src).convert("RGB")
W, H = img.size
print(f"Image size: {W}x{H}")
arr = np.array(img)

band = img.crop((0, 100, W, 200))
band_path = os.path.join(out_dir, "_tmp_band.jpg")
band.save(band_path, quality=95)
print(f"Saved band: {band_path}")

gray = np.dot(arr[..., :3], [0.299, 0.587, 0.114]).astype(np.float32)

def row_dash_metric(y_abs):
    row = gray[y_abs, 200:900]
    d = np.abs(np.diff(row.astype(np.float32)))
    trans = (d > 12) & (d < 80)
    return trans.sum() / len(d)

def col_dash_metric(x_abs, y_top, y_bot):
    col = gray[y_top:y_bot, x_abs]
    d = np.abs(np.diff(col.astype(np.float32)))
    trans = (d > 12) & (d < 80)
    return trans.sum() / max(len(d), 1)

metrics = [(y, row_dash_metric(y)) for y in range(120, 191)]
thresh = float(np.percentile([m[1] for m in metrics], 75))
print(f"Dash threshold: {thresh:.4f}")

ys = np.array([m[0] for m in metrics])
ms = np.array([m[1] for m in metrics])
ms_smooth = np.convolve(ms, np.ones(5)/5, mode="same")

local_max = []
for i in range(1, len(metrics)-1):
    if ms_smooth[i] >= ms_smooth[i-1] and ms_smooth[i] >= ms_smooth[i+1] and ms_smooth[i] > thresh * 0.6:
        local_max.append((int(ys[i]), float(ms_smooth[i])))
local_max.sort(key=lambda t: t[1], reverse=True)
print("Local maxima:", local_max[:12])

top_y = None
for y, sc in sorted(local_max, key=lambda t: t[0]):
    if y >= 130 and sc > thresh * 0.65:
        top_y = y
        break

bot_y = None
for y, sc in sorted(local_max, key=lambda t: t[1], reverse=True):
    if top_y and y > top_y + 25:
        bot_y = y
        break

print(f"Initial top_y={top_y}, bot_y={bot_y}")

def refine_horizontal_border(y_approx, search_range=5):
    best_y, best_score = y_approx, 0
    for y in range(max(0, y_approx - search_range), min(H, y_approx + search_range + 1)):
        row = gray[y, 200:900]
        d = np.abs(np.diff(row))
        score = int(((d > 10) & (d < 60)).sum())
        if score > best_score:
            best_score = score
            best_y = y
    return best_y

if top_y:
    top_y = refine_horizontal_border(top_y)
if bot_y:
    bot_y = refine_horizontal_border(bot_y)
print(f"Refined top_y={top_y}, bot_y={bot_y}")

y_t, y_b = min(top_y, bot_y), max(top_y, bot_y)
col_scores = [(x, col_dash_metric(x, y_t+2, y_b-2)) for x in range(150, 950)]
mid_x = 550
left_candidates = [x for x, s in col_scores if x < mid_x and s > 0.05]
right_candidates = [x for x, s in col_scores if x > mid_x and s > 0.05]
left_x = min(left_candidates) if left_candidates else 200
right_x = max(right_candidates) if right_candidates else 900
crop_g = gray[y_t:y_b+1, 150:950]
vgrad = np.abs(np.diff(crop_g, axis=0)).sum(axis=0)
xs = np.arange(150, 950)
vgrad_s = np.convolve(vgrad, np.ones(7)/7, mode="same")
peak_thresh = vgrad_s.max() * 0.3
left_x2 = 150
for i, x in enumerate(xs):
    if vgrad_s[i] > peak_thresh:
        left_x2 = int(x)
        break
right_x2 = 950
for i in range(len(xs)-1, -1, -1):
    if vgrad_s[i] > peak_thresh:
        right_x2 = int(xs[i])
        break
left_x = min(left_x, left_x2)
right_x = max(right_x, right_x2)
print(f"Bounds before padding: L={left_x} T={y_t} R={right_x} B={y_b}")

pad = 6
l = max(0, left_x - pad)
t = max(0, y_t - pad)
r = min(W, right_x + pad)
b = min(H, y_b + pad)

debug = img.copy()
ImageDraw.Draw(debug).rectangle([l, t, r, b], outline=(0, 255, 255), width=3)
debug_path = os.path.join(out_dir, "_tmp_focus_debug.jpg")
debug.save(debug_path, quality=95)
print(f"Saved debug: {debug_path}")

crop = img.crop((l, t, r, b))
cw, ch = crop.size
crop_up = crop.resize((1280, int(ch * 1280 / cw)), Image.LANCZOS)
out_crop = os.path.join(base, "assets", "images", "product", "audio-file-drop-zone.jpg")
crop_up.save(out_crop, quality=92)
print(f"Saved crop: {out_crop} size={crop_up.size}")

l_pct = 100 * l / W
t_pct = 100 * t / H
w_pct = 100 * (r - l) / W
h_pct = 100 * (b - t) / H
css = f'style="--l:{l_pct:.2f}%;--t:{t_pct:.2f}%;--w:{w_pct:.2f}%;--h:{h_pct:.2f}%"'
print(css)

yt_in = t < 128
print(f"YouTube placeholder inside final box: {'YES' if yt_in else 'NO'} (should be NO)")
drop_mid_y = (t + b) // 2
drop_in = t <= drop_mid_y <= b and l <= 400 <= r
print(f"Drop text region inside final box: {'YES' if drop_in else 'NO'} (should be YES)")
print(f"Final box: l={l} t={t} r={r} b={b} w={r-l} h={b-t}")
