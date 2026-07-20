from PIL import Image
import os
JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(JPG).convert("RGB")
px = im.load()
w,h = im.size

def avg_box(box):
    l,t,r,b = box
    rs=gs=bs=n=0
    for y in range(t,b,2):
        for x in range(l,r,2):
            R,G,B = px[x,y]
            rs+=R; gs+=G; bs+=B; n+=1
    return (rs/n, gs/n, bs/n)

candidates = {
    "wrong_old": (191, 259, 670, 528),
    "hint": (280, 140, 850, 340),
    "hint_pad": (260, 115, 870, 355),
    "upper_mid": (250, 120, 820, 320),
    "scan_160_300": (200, 160, 900, 300),
}
for name, box in candidates.items():
    print(name, box, "avg", tuple(int(x) for x in avg_box(box)))

# find lightest horizontal band in left 70% between y 100-250
best = None
for y0 in range(100, 250, 5):
    for y1 in range(y0+60, y0+200, 10):
        box = (270, y0, 830, y1)
        avg = sum(avg_box(box))/3
        if best is None or avg > best[0]:
            best = (avg, box)
print("lightest band", best)

# edge density per row in x 270-830
for y in range(100, 380, 20):
    diffs=0
    for x in range(271, 829):
        r1,g1,b1=px[x,y]
        r2,g2,b2=px[x+1,y]
        diffs += abs(r1-r2)+abs(g1-g2)+abs(b1-b2)
    print(f"y={y} edge_sum={diffs}")
