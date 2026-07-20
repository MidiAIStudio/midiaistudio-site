from PIL import Image, ImageDraw
import numpy as np
import os

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
out_dir = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames"
im = Image.open(path).convert("RGB")
W, H = im.size
gray = np.array(im.convert("L"), dtype=float)

top, bottom = 112, 156

# vertical edge scores
edges = []
for x in range(120, 700):
    col = gray[top:bottom+1, x]
    bg = np.median(col)
    on = np.abs(col - bg) > 6
    tr = int(np.abs(np.diff(on.astype(int))).sum())
    if tr >= 10:
        edges.append((tr, x))
edges.sort(reverse=True)
print("Left/mid vertical edge candidates:", edges[:25])

# Left border: smallest x with strong vertical dash among top candidates
left_cands = sorted([x for tr,x in edges if tr >= 12 and x < 400])
right_cands = sorted([x for tr,x in edges if tr >= 12 and x > 400], reverse=True)
print("left_cands sample:", left_cands[:15])
print("right_cands sample:", right_cands[:15])

# Use percentile: left edge ~ first x where column has elevated variance in zone
var_x = []
for x in range(120, 680):
    col = gray[top:bottom+1, x]
    var_x.append((col.std(), x))
var_x.sort(reverse=True)

# Left/right envelope from columns with std>8 in outer quartiles
strong = [x for s,x in var_x if s > 8]
l = min(strong) if strong else 167
r = max(strong) if strong else 619

# Refine l using top row 114 dashed span in input area
row = gray[114]
# dashed top often starts ~167
xs_top = [x for x in range(120, 650) if gray[114,x] > 28 or gray[113,x] > 28]
if xs_top:
    l = min(l, min(xs_top))
    # right from bottom row
xs_bot = [x for x in range(80, 650) if gray[155,x] > 28]
if xs_bot:
    r = max(r, max(xs_bot))

# But bottom row 155 might extend too far right - clip to where vertical edges cluster
if right_cands:
    r = min(r, max(right_cands[:3]))  # might be wrong

# Better approach: bottom row bright pixels in LEFT panel only (x<650)
xs_bot_left = [x for x in range(80, 650) if gray[155,x] > 28]
l = min(xs_bot_left)
r = max(xs_bot_left)

print(f"From bottom border left panel: l={l} r={r}")

# top from first dash cluster
for y in range(108, 125):
    tr = int(np.abs(np.diff((np.abs(gray[y,280:980]-np.median(gray[y,280:980]))>7).astype(int))).sum())
    if tr >= 40:
        top = y
        break

# Label rows: find compact text band
label_ys = []
for y in range(120, 155):
    band = gray[y, l+20:r-20]
    if ((band>100)&(band<230)).sum() > 50:
        label_ys.append(y)
print("Label rows:", label_ys)

debug = im.copy()
d = ImageDraw.Draw(debug)
d.rectangle([l, top, r, bottom], outline=(255,0,0), width=3)
# youtube field approx
d.rectangle([280, 76, 980, 104], outline=(0,255,255), width=2)
debug.save(os.path.join(out_dir, "_tmp_focus_debug.jpg"), quality=95)

pl, pt, pw, ph = 100*l/W, 100*top/H, 100*(r-l)/W, 100*(bottom-top)/H
print(f"Box: l={l} t={top} r={r} b={bottom} ({r-l}x{bottom-top})")
print(f'CSS: style="--l:{pl:.2f}%;--t:{pt:.2f}%;--w:{pw:.2f}%;--h:{ph:.2f}%"')

# mean brightness bands per user step 2
print("\nStep2 bands x=300-900:")
for y in range(100, 281, 10):
    band = gray[y,300:900]
    mid = ((band>=130)&(band<=210)).mean()
    if mid > 0.02 or band.mean()>25:
        print(f" y={y} mean={band.mean():.1f} mid_frac={mid:.4f}")
