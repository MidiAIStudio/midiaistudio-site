from PIL import Image, ImageDraw
import numpy as np
import os

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
out_dir = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames"
im = Image.open(path).convert("RGB")
W, H = im.size
arr = np.array(im)
gray = (0.299*arr[:,:,0] + 0.587*arr[:,:,1] + 0.114*arr[:,:,2])

for y in [112, 114, 116, 141, 146, 155, 156]:
    row = gray[y, :]
    # find runs where value > 30 (visible on dark bg)
    bright = row > 30
    xs = np.where(bright)[0]
    if len(xs):
        print(f"y={y} bright>30: {xs.min()}-{xs.max()} count={len(xs)}")
    # specifically left panel
    seg = row[80:620]
    bright2 = seg > 25
    xs2 = np.where(bright2)[0] + 80
    if len(xs2):
        print(f"      left80-620: {xs2.min()}-{xs2.max()} count={len(xs2)}")

# For dashed top at y=114, find left/right by scanning for columns with vertical dash pattern
top, bottom = 112, 156

def vertical_dash_strength(x, y0, y1):
    col = gray[y0:y1+1, x]
    bg = np.median(col)
    on = np.abs(col - bg) > 6
    return int(np.abs(np.diff(on.astype(int))).sum())

print("\nVertical dash strength at x (top=112,bottom=156):")
vscores = []
for x in range(80, 620):
    s = vertical_dash_strength(x, top, bottom)
    if s >= 8:
        vscores.append((s, x))
vscores.sort(reverse=True)
print("Top x scores:", vscores[:20])

left_x = min(x for s,x in vscores) if vscores else 120
right_x = max(x for s,x in vscores) if vscores else 560
print(f"From vertical dashes: {left_x}-{right_x}")

# Alternative: at mid-y, find leftmost/rightmost gray border pixels
ym = 134
row = gray[ym]
# UI panel background ~15-20, border dashes ~40-80, text ~150+
border_xs = [x for x in range(80, 620) if 35 < row[x] < 120]
if border_xs:
    print(f"ym={ym} border_xs span {min(border_xs)}-{max(border_xs)} count={len(border_xs)}")

# Use connected component on binary image of drop zone interior
# Between y=113-155, pixels that are part of dashed rect border
region = gray[top:bottom+1, 80:620]
mask = (region > 28) & (region < 200)
# project
col_sum = mask.sum(axis=0)
active_cols = np.where(col_sum > 3)[0] + 80
if len(active_cols):
    l, r = int(active_cols.min()), int(active_cols.max())
    print(f"Column projection l={l} r={r}")

# row projection for top/bottom refine
row_sum = mask.sum(axis=1)
active_rows = np.where(row_sum > 20)[0] + top
if len(active_rows):
    t2, b2 = int(active_rows.min()), int(active_rows.max())
    print(f"Row projection t={t2} b={b2}")

l, t, r, b = l, top, r, bottom
# expand 1px outward
l -= 2; t -= 1; r += 2; b += 1

print(f"\nFINAL BOX: l={l} t={t} r={r} b={b} w={r-l} h={b-t}")

# Save zoom crop
im.crop((l-20, t-20, r+20, b+20)).save(os.path.join(out_dir, "_tmp_drop_zoom.jpg"), quality=95)

debug = im.copy()
draw = ImageDraw.Draw(debug)
draw.rectangle([l, t, r, b], outline=(255,0,0), width=3)
debug.save(os.path.join(out_dir, "_tmp_focus_debug.jpg"), quality=95)

pl, pt, pw, ph = 100*l/W, 100*t/H, 100*(r-l)/W, 100*(b-t)/H
print(f'CSS: style="--l:{pl:.2f}%;--t:{pt:.2f}%;--w:{pw:.2f}%;--h:{ph:.2f}%"')

# Also regenerate strips A-D as requested
for y0, y1, letter in [(120,160,'A'),(160,200,'B'),(200,240,'C'),(240,280,'D')]:
    im.crop((0,y0,W,y1)).save(os.path.join(out_dir, f"_tmp_strip_{letter}.jpg"), quality=95)
