from PIL import Image
import numpy as np

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
gray = np.array(Image.open(path).convert("L"), dtype=float)

l,t,r,b = 92, 113, 649, 156
roi = gray[t:b, l:r]
print("ROI stats", roi.min(), roi.max(), roi.mean(), roi.std())

for y in range(t, b):
    row = gray[y, l:r]
    for lo, hi in [(40,100),(60,120),(80,140),(100,180)]:
        n = ((row>lo)&(row<hi)).sum()
        if n>30:
            xs = np.where((row>lo)&(row<hi))[0]+l
            print(f"y={y} range {lo}-{hi}: n={n} x={xs.min()}-{xs.max()}")

# Check if 167-310 top dash is separate small box vs full 92-649
for y in [130, 140, 150]:
    seg = gray[y, 92:650]
    xs = [92+i for i,v in enumerate(seg) if v>35]
    print(f"y={y} bright>35 span: {min(xs) if xs else None}-{max(xs) if xs else None}")

# Compare wrong zone 243-294
for y in [243,260,280]:
    band = gray[y,300:900]
    print(f"WRONG zone y={y} mean={band.mean():.1f} bright>100={( band>100).sum()}")
