from PIL import Image, ImageDraw
import numpy as np

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(path).convert("RGB")
gray = np.array(im.convert("L"), dtype=float)

# Top border row analysis
for y in [113, 114, 115]:
    seg = gray[y, 150:550]
    xs = [150+i for i,v in enumerate(seg) if v > 28]
    print(f"y={y} xs>28 in 150-550: min={min(xs) if xs else None} max={max(xs) if xs else None} n={len(xs)}")
    # print segments
    if xs:
        spans=[]; s=[xs[0]]
        for x in xs[1:]:
            if x-s[-1]<=2: s.append(x)
            else: spans.append(s); s=[x]
        spans.append(s)
        print("  spans:", [(a[0],a[-1],len(a)) for a in spans if len(a)>5])

# Bottom at 155
y=155
seg = gray[y, 80:620]
xs = [80+i for i,v in enumerate(seg) if v > 28]
print(f"y=155 span {min(xs)}-{max(xs)} n={len(xs)}")

# Find consistent rectangle: intersection of top and bottom x spans
top_xs = set(i for i in range(150,550) if gray[114,i] > 28)
bot_xs = set(i for i in range(80,620) if gray[155,i] > 28)
# for dashed line the x coverage might be sparse - use hull
l = min(min(top_xs) if top_xs else 167, min(bot_xs) if bot_xs else 80)
r = max(max(top_xs) if top_xs else 540, max(bot_xs) if bot_xs else 540)
print(f"Combined l={l} r={r}")

# Text center for label rows 141-148
for y in range(140, 149):
    row = gray[y, l:r]
    tx = [l+i for i,v in enumerate(row) if 100 < v < 230]
    if tx:
        print(f"y={y} text x {min(tx)}-{max(tx)}")

t, b = 112, 156
W,H = im.size
debug = im.copy()
d = ImageDraw.Draw(debug)
d.rectangle([l,t,r,b], outline=(255,0,0), width=3)
debug.save(r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_focus_debug.jpg")

pl, pt, pw, ph = 100*l/W, 100*t/H, 100*(r-l)/W, 100*(b-t)/H
print(f'CSS: style="--l:{pl:.2f}%;--t:{pt:.2f}%;--w:{pw:.2f}%;--h:{ph:.2f}%"')
print(f"Pixel box: ({l},{t})-({r},{b}) size {r-l}x{b-t}")
