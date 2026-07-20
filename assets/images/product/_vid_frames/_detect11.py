from PIL import Image, ImageDraw
import numpy as np

gray = np.array(Image.open(r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg").convert("L"), dtype=float)
W=1280

def dash(y,x0,x1):
    row=gray[y,x0:x1]; bg=np.median(row); on=np.abs(row-bg)>7
    return int(np.abs(np.diff(on.astype(int))).sum())

for y in range(160, 225):
    tr = dash(y, 160, 560)
    if tr>=15:
        xs=[160+i for i,v in enumerate(gray[y,160:560]) if v>28]
        span=f"{min(xs)}-{max(xs)}" if xs else "-"
        print(f"y={y} tr={tr} span={span}")

# Is there a box 165-210?
print("\nText mid-gray 50-120 in x=200-520:")
for y in range(160,215):
    band=gray[y,200:520]
    n=((band>50)&(band<120)).sum()
    if n>100:
        print(f" y={y} n={n}")
