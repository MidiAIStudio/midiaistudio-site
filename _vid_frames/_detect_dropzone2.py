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

def row_dash_score(y, x0=200, x1=900):
    row = gray[y, x0:x1]
    d = np.abs(np.diff(row.astype(np.float32)))
    # dashed horizontal: many transitions, not too dark overall
    trans = (d > 12) & (d < 80)
    return float(trans.sum() / len(d)), float(d.mean())

print("Row dash scores y=120-190:")
scores = []
for y in range(120, 191):
    s, dm = row_dash_score(y)
    scores.append((y, s, dm))
    if s > 0.05 or y in (128,143,145,156,168,170):
        print(f"  y={y} score={s:.4f} diff_mean={dm:.2f}")

# YouTube row: high text variance around y=110-125
for y in range(105, 135):
    row = gray[y, 250:800]
    print(f"  yt-candidate y={y} std={row.std():.2f} mean={row.mean():.1f}")

# Find top/bottom: two highest scores with y separation >= 30, top below y=135
scores.sort(key=lambda t: t[1], reverse=True)
print("\nTop scores:", scores[:8])

# Strongest is likely top border of drop zone
top_candidates = [t for t in scores if t[1] > 0.08 and t[0] >= 135]
top_y = top_candidates[0][0] if top_candidates else 156
print("Selected top_y:", top_y)

# Bottom: next significant peak below top+20
bot_y = None
for y, s, _ in sorted(scores, key=lambda t: t[1], reverse=True):
    if y > top_y + 20 and s > 0.015:
        bot_y = y
        break
if bot_y is None:
    # scan for second horizontal dash band
    for y in range(top_y + 40, 200):
        s, _ = row_dash_score(y)
        if s > 0.02:
            bot_y = y
            break
if bot_y is None:
    bot_y = top_y + 55
print("Selected bot_y:", bot_y)

def refine_h(y0, rng=4):
    best, bs = y0, 0
    for y in range(y0-rng, y0+rng+1):
        row = gray[y, 200:900]
        d = np.abs(np.diff(row))
        sc = int(((d>10)&(d<60)).sum())
        if sc > bs:
            bs = sc; best = y
    return best

top_y = refine_h(top_y)
bot_y = refine_h(bot_y)
print("Refined:", top_y, bot_y)

y_t, y_b = min(top_y, bot_y), max(top_y, bot_y)

def col_edge(x, yt, yb):
    col = gray[yt:yb, x]
    d = np.abs(np.diff(col.astype(np.float32)))
    return float(((d>12)&(d<80)).sum() / max(len(d),1))

# left/right on full height of box
best_l, best_r = 200, 900
col_sc = [(x, col_edge(x, y_t+1, y_b-1)) for x in range(180, 920)]
col_sc.sort(key=lambda t: t[1], reverse=True)
print("Top vertical cols:", col_sc[:6])

crop_g = gray[y_t:y_b+1, 180:920]
vgrad = np.abs(np.diff(crop_g, axis=0)).sum(axis=0)
xs = np.arange(180, 920)
vgrad_s = np.convolve(vgrad, np.ones(9)/9, mode="same")
pt = vgrad_s.max() * 0.25
left_x = 180
for i,x in enumerate(xs):
    if vgrad_s[i] > pt:
        left_x = int(x); break
right_x = 920
for i in range(len(xs)-1,-1,-1):
    if vgrad_s[i] > pt:
        right_x = int(xs[i]); break

# Also find left/right from horizontal scan at mid-y
mid_y = (y_t + y_b) // 2
row = gray[mid_y, 180:920]
d = np.abs(np.diff(row.astype(np.float32)))
# first sustained dash region from left
left_x2 = left_x
for x in range(180, 920):
    if col_edge(x, y_t, y_b) > 0.04:
        left_x2 = min(left_x2, x)
        break
right_x2 = right_x
for x in range(919, 179, -1):
    if col_edge(x, y_t, y_b) > 0.04:
        right_x2 = max(right_x2, x)
        break

left_x = min(left_x, left_x2)
right_x = max(right_x, right_x2)
print(f"Edges: L={left_x} T={y_t} R={right_x} B={y_b} h={y_b-y_t}")

pad = 6
l,t,r,b = max(0,left_x-pad), max(0,y_t-pad), min(W,right_x+pad), min(H,y_b+pad)

debug = img.copy()
ImageDraw.Draw(debug).rectangle([l,t,r,b], outline=(0,255,255), width=3)
# also draw youtube zone in red for debug
ImageDraw.Draw(debug).rectangle([200,108,880,128], outline=(255,0,0), width=2)
debug.save(os.path.join(out_dir,"_tmp_focus_debug.jpg"), quality=95)

crop = img.crop((l,t,r,b))
crop_up = crop.resize((1280, int(crop.size[1]*1280/crop.size[0])), Image.LANCZOS)
crop_up.save(os.path.join(base,"assets","images","product","audio-file-drop-zone.jpg"), quality=92)

l_pct,t_pct,w_pct,h_pct = 100*l/W,100*t/H,100*(r-l)/W,100*(b-t)/H
print(f'style="--l:{l_pct:.2f}%;--t:{t_pct:.2f}%;--w:{w_pct:.2f}%;--h:{h_pct:.2f}%"')
yt_in = not (b <= 108 or t >= 128) and l < 700 and r > 250
yt_in = t < 128  # top of box above bottom of youtube text band
print(f"YouTube inside: {'YES' if yt_in else 'NO'} (should NO)")
drop_in = t <= (t+b)//2 <= b
print(f"Drop text inside: {'YES' if drop_in else 'NO'} (should YES)")
print(f"Final: l={l} t={t} r={r} b={b} w={r-l} h={b-t}")
