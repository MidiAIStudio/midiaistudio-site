import os
from PIL import Image, ImageDraw
import numpy as np

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
out_dir = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames"
im = Image.open(path).convert("RGB")
W, H = im.size
arr = np.array(im)
gray = (0.299*arr[:,:,0] + 0.587*arr[:,:,1] + 0.114*arr[:,:,2])

print("Global gray stats:", gray.min(), gray.max(), gray.mean())

# Bright text on dark UI
print("\nBRIGHT TEXT bands (pixels 120-255 in center x=300-900):")
for y in range(80, 320, 4):
    band = gray[y, 300:900]
    bright_frac = (band >= 120).mean()
    bright_mid = ((band >= 140) & (band <= 220)).mean()
    if bright_frac > 0.01 or bright_mid > 0.02:
        print(f"  y={y:3d} bright_frac={bright_frac:.4f} mid={bright_mid:.4f} mean={band.mean():.1f}")

# Teal search button - broader criteria
print("\nTeal/cyan rows (right half):")
for y in range(180, 350, 2):
    slice_r = arr[y, W//2:, :]
    g, b = slice_r[:,1].astype(float), slice_r[:,2].astype(float)
    r = slice_r[:,0].astype(float)
    teal = (g > 100) & (b > 100) & (g > r+20) & (b > r+20)
    if teal.sum() > 80:
        xs = np.where(teal)[0] + W//2
        print(f"  y={y} teal_px={teal.sum()} x={xs.min()}-{xs.max()}")

# Dashed border on dark: look for local max variance in horizontal rows
print("\nRow variance x=250-1030 (border/text activity):")
var_rows = []
for y in range(90, 280):
    row = gray[y, 250:1030]
    v = row.std()
    var_rows.append((v, y))
var_rows.sort(reverse=True)
for v, y in var_rows[:25]:
    print(f"  y={y} std={v:.2f}")

# Find drop zone: cluster of high-variance rows between y=100-220
candidates = [y for v,y in var_rows if v > 25 and 100 <= y <= 220]
print("\nHigh var rows 100-220:", sorted(set(candidates))[:30])

# Edge detection for dashed: gradient magnitude along x
def dash_transitions(y, x0, x1, thresh=15):
    row = gray[y, x0:x1]
    # for dark theme dashed line is slightly brighter than bg
    bg = np.median(row)
    on = np.abs(row - bg) > thresh
    return int(np.abs(np.diff(on.astype(int))).sum()), float(bg)

print("\nDash transitions (adaptive thresh) y=100-220:")
pairs = []
for y in range(100, 221):
    tr, bg = dash_transitions(y, 280, W-280, 12)
    if tr >= 20:
        pairs.append((tr, y, bg))
        print(f"  y={y} trans={tr} bg={bg:.1f}")
pairs.sort(reverse=True)

# Sample pixels at y=124, 155, 141
for y in [120, 124, 130, 140, 150, 155, 160, 200, 230, 250]:
    row = gray[y, 400:880]
    print(f"\nRow y={y} sample every 40px:", [int(row[i]) for i in range(0, len(row), 40)])

# Find rectangular dashed box: top/bottom with high transitions spanning width
def find_box_adaptive():
    tops, bots = [], []
    for y in range(95, 230):
        tr, bg = dash_transitions(y, 300, 900, 10)
        if tr >= 24:
            tops.append(y)
    for y in range(95, 230):
        tr, bg = dash_transitions(y, 300, 900, 8)
        if tr >= 16:
            bots.append(y)
    # group consecutive
    def clusters(ys):
        if not ys: return []
        ys = sorted(ys)
        groups = [[ys[0]]]
        for v in ys[1:]:
            if v - groups[-1][-1] <= 3:
                groups[-1].append(v)
            else:
                groups.append([v])
        return groups
    top_groups = clusters(tops)
    bot_groups = clusters(tops)  # same for now
    print("\nTop transition clusters:", top_groups)
    
    # pick first group as top border, second distinct as bottom
    if len(top_groups) >= 2:
        t = top_groups[0][0]
        b = top_groups[1][-1]
    elif top_groups:
        t = top_groups[0][0]
        b = top_groups[0][-1] + 50
    else:
        t, b = 118, 168
    
    # x bounds: at mid height find left/right where border gray differs
    ym = (t + b) // 2
    col_var = []
    for x in range(250, W-250):
        col = gray[t:b+1, x]
        col_var.append((col.std(), x))
    col_var.sort(reverse=True)
    edge_xs = sorted([x for s,x in col_var[:40] if s > 8])
    if edge_xs:
        l = min(edge_xs)
        r = max(edge_xs)
    else:
        l, r = 300, 900
    return l, t, r, b

l,t,r,b = find_box_adaptive()
print(f"\nAdaptive box: {l},{t},{r},{b} w={r-l} h={b-t}")

# Refine with manual inspection logic: Korean label centered
# Scan for brightest text row in 110-180
text_scores = []
for y in range(110, 190):
    band = gray[y, 350:850]
    score = ((band >= 150) & (band <= 240)).sum()
    text_scores.append((score, y))
text_scores.sort(reverse=True)
print("\nText score top rows:", text_scores[:8])

# Use y=124 cluster from first run + extend
# Re-detect full rectangle using Canny-like horizontal lines
top = None
bottom = None
for y in range(100, 200):
    tr, _ = dash_transitions(y, 320, 880, 8)
    if tr >= 28 and top is None:
        top = y
    if tr >= 28:
        bottom = y  # keep updating to get last strong line in zone
        
# separate top and bottom: first and last strong lines before y=220
strong_ys = []
for y in range(100, 220):
    tr, _ = dash_transitions(y, 320, 880, 8)
    if tr >= 26:
        strong_ys.append(y)
print("Strong ys 320-880:", strong_ys)

if strong_ys:
    # group
    groups = []
    g = [strong_ys[0]]
    for v in strong_ys[1:]:
        if v - g[-1] <= 4:
            g.append(v)
        else:
            groups.append(g)
            g = [v]
    groups.append(g)
    print("Groups:", groups)
    if len(groups) >= 2:
        top = groups[0][len(groups[0])//2]
        bottom = groups[1][len(groups[1])//2]
    else:
        top = groups[0][0]
        bottom = groups[0][-1] + 45

# left/right at top
row = gray[top]
bg = np.median(row[320:880])
xs = []
for x in range(280, W-280):
    if abs(row[x]-bg) > 8:
        xs.append(x)
if xs:
    l = min(xs)-2
    r = max(xs)+2
else:
    l, r = 318, 962

print(f"\nFINAL: l={l} t={top} r={r} b={bottom} w={r-l} h={bottom-top}")

debug = im.copy()
draw = ImageDraw.Draw(debug)
draw.rectangle([l, top, r, bottom], outline=(255,0,0), width=3)
debug.save(os.path.join(out_dir, "_tmp_focus_debug.jpg"), quality=95)

pl, pt, pw, ph = 100*l/W, 100*top/H, 100*(r-l)/W, 100*(bottom-top)/H
print(f'CSS: style="--l:{pl:.2f}%;--t:{pt:.2f}%;--w:{pw:.2f}%;--h:{ph:.2f}%"')
