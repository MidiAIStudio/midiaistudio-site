from PIL import Image, ImageDraw
import numpy as np
import os

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
out_dir = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames"
im = Image.open(path).convert("RGB")
W, H = im.size
arr = np.array(im)
gray = (0.299*arr[:,:,0] + 0.587*arr[:,:,1] + 0.114*arr[:,:,2])

# Focus left input column x=40-680
X0, X1 = 40, 680

def row_features(y):
    row = gray[y, X0:X1]
    bg = np.percentile(row, 40)
    diff = np.abs(row - bg)
    border = diff > 8
    trans = int(np.abs(np.diff(border.astype(int))).sum())
    text = int(((row > bg + 15) & (row < 240)).sum())
    light = int((row > 100).sum())
    return bg, trans, text, light

print("Left column features y=60-200:")
for y in range(60, 201):
    bg, tr, tx, lt = row_features(y)
    if tr >= 20 or tx >= 25 or lt >= 40:
        print(f"  y={y:3d} bg={bg:5.1f} dash_tr={tr:3d} text_px={tx:3d} light={lt:3d}")

# Find paired horizontal borders (top and bottom of box)
strong = []
for y in range(60, 220):
    bg, tr, tx, lt = row_features(y)
    if tr >= 28:
        strong.append((tr, y))
strong.sort(reverse=True)
print("\nTop dash rows:", strong[:20])

# Pick drop zone: first pair of horizontal dash clusters after y=80, before y=220
clusters = []
cur = []
for y in range(60, 220):
    _, tr, _, _ = row_features(y)
    if tr >= 24:
        if not cur or y - cur[-1] <= 2:
            cur.append(y)
        else:
            if cur:
                clusters.append(cur)
            cur = [y]
if cur:
    clusters.append(cur)
print("Dash clusters:", clusters)

# Search UI starts ~y=226 teal on right - drop zone should end before ~y=210
# User: under YouTube URL - likely clusters in 100-170 range
drop_clusters = [c for c in clusters if c[0] >= 90 and c[-1] <= 210]
print("Drop zone candidate clusters:", drop_clusters)

if len(drop_clusters) >= 2:
    top = drop_clusters[0][0]
    bottom = drop_clusters[1][-1]
elif drop_clusters:
    top = drop_clusters[0][0]
    bottom = drop_clusters[0][-1] + 48
else:
    top, bottom = 112, 168

# Refine top/bottom: use min/max transition in first two clusters in range
cands = [c for c in clusters if 100 <= c[0] <= 180]
if len(cands) >= 2:
    top = min(cands[0])
    bottom = max(cands[1])
elif len(cands) == 1:
    top = min(cands[0])
    bottom = max(cands[0]) + 50

print(f"\nInitial top/bottom: {top} {bottom}")

# X bounds: scan vertical border columns between top and bottom
ym = (top + bottom) // 2
left, right = X0, X1
for x in range(X0, X1):
    col = gray[top:bottom+1, x]
    if col.std() > 12 and np.abs(col - np.median(col)).max() > 10:
        left = min(left, x)
        right = max(right, x)

# Better: at top row find contiguous border pixels
row = gray[top, X0:X1]
bg = np.median(row)
xs = [X0 + i for i,v in enumerate(row) if abs(v - bg) > 5 or (100 < v < 230)]
if xs:
    # take largest contiguous span in center
    xs.sort()
    spans = []
    s = [xs[0]]
    for x in xs[1:]:
        if x - s[-1] <= 3:
            s.append(x)
        else:
            spans.append(s)
            s = [x]
    spans.append(s)
    best = max(spans, key=len)
    l, r = best[0]-1, best[-1]+1
else:
    l, r = 120, 560

# Expand vertically to include full dashed bottom
for y in range(top, bottom+30):
    _, tr, _, _ = row_features(y)
    if tr >= 24 and y <= 220:
        bottom = max(bottom, y)

print(f"Box pixels: l={l} t={top} r={r} b={bottom} w={r-l} h={bottom-top}")

# Save focused crops
for name, y0, y1 in [("E", 90, 130), ("F", 130, 180), ("G", 180, 230)]:
    im.crop((0, y0, W, y1)).save(os.path.join(out_dir, f"_tmp_strip_{name}.jpg"), quality=95)

debug = im.copy()
draw = ImageDraw.Draw(debug)
draw.rectangle([l, top, r, bottom], outline=(255,0,0), width=3)
# also mark search teal zone
draw.rectangle([828, 226, 1190, 252], outline=(0,255,0), width=2)
debug.save(os.path.join(out_dir, "_tmp_focus_debug.jpg"), quality=95)

pl, pt, pw, ph = 100*l/W, 100*top/H, 100*(r-l)/W, 100*(bottom-top)/H
print(f'CSS: style="--l:{pl:.2f}%;--t:{pt:.2f}%;--w:{pw:.2f}%;--h:{ph:.2f}%"')

# Sample RGB at center of box
cy = (top+bottom)//2
cx = (l+r)//2
print(f"Center pixel ({cx},{cy}):", arr[cy,cx].tolist())
