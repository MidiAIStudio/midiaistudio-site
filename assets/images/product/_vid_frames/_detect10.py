from PIL import Image, ImageDraw
import numpy as np

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(path)
W,H = im.size
gray = np.array(im.convert("L"), dtype=float)

t, b = 112, 156

# find left/right x where vertical dash pattern exists between t and b
scores=[]
for x in range(150, 580):
    col = gray[t:b+1, x]
    tr = int(np.abs(np.diff((np.abs(col-np.median(col))>5).astype(int))).sum())
    bright = (col>35).sum()
    scores.append((tr, bright, x))
scores.sort(reverse=True)
print("Top vertical columns:", scores[:15])

# left edge = min x with bright column sum > 5 across height
left = None
for x in range(150, 400):
    col = gray[t:b+1, x]
    if (col>30).sum() >= 8:
        left = x if left is None else min(left, x)
print("left from bright cols:", left)

# right edge
right = None
for x in range(400, 580):
    col = gray[t:b+1, x]
    if (col>30).sum() >= 8:
        right = x if right is None else max(right, x)
print("right from bright cols:", right)

# use text span at y=145
row = gray[145]
tx = [x for x in range(150,580) if 40 < row[x] < 120]
if tx:
    l2, r2 = min(tx)-8, max(tx)+8
    print(f"text envelope y=145: {l2}-{r2}")

l, r = 160, 548
for y in [113,114,155,156]:
    xs = [x for x in range(120,620) if gray[y,x]>28]
    print(f"y={y} dash xs {min(xs)}-{max(xs)}")

# final tuned box
l, r = 165, 545
debug = im.copy()
d = ImageDraw.Draw(debug)
d.rectangle([l,t,r,b], outline=(255,0,0), width=3)
debug.save(r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_focus_debug.jpg")

pl, pt, pw, ph = 100*l/W, 100*t/H, 100*(r-l)/W, 100*(b-t)/H
print(f"FINAL tuned: ({l},{t})-({r},{b}) {r-l}x{b-t}")
print(f'CSS: style="--l:{pl:.2f}%;--t:{pt:.2f}%;--w:{pw:.2f}%;--h:{ph:.2f}%"')
