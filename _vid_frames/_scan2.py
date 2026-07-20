import numpy as np
from PIL import Image, ImageDraw
import os

base = r"c:\GitHub\midiaistudio-site"
img = Image.open(os.path.join(base,"assets","images","product","audio-file-picker.jpg")).convert("RGB")
W,H = img.size
gray = np.dot(np.array(img)[...,:3], [0.299,0.587,0.114]).astype(np.float32)

top_y = 156
x0,x1 = 220, 880
for y in range(top_y+1, 210):
    row = gray[y, x0:x1]
    print(f"y={y} mean={row.mean():.1f} std={row.std():.2f} min={row.min():.0f} max={row.max():.0f}")

def h_dash(y):
    row = gray[y, 200:900]
    d = np.abs(np.diff(row.astype(np.float32)))
    return float(((d>12)&(d<80)).sum()/len(d))

# Find bottom: first row after interior where dash score rises again
interior = []
for y in range(top_y+3, 220):
    interior.append((y, gray[y,x0:x1].std(), h_dash(y)))
print("\nLooking for bottom border spike:")
for t in interior:
    if t[2] > 0.035 or t[0] in range(190,200):
        print(t)
