import numpy as np
from PIL import Image, ImageDraw
import os

base = r"c:\GitHub\midiaistudio-site"
src = os.path.join(base, "assets", "images", "product", "audio-file-picker.jpg")
out_dir = os.path.join(base, "_vid_frames")
img = Image.open(src).convert("RGB")
W, H = img.size
arr = np.array(img)
gray = np.dot(arr[..., :3], [0.299, 0.587, 0.114]).astype(np.float32)

def row_dash_score(y, x0=200, x1=900):
    row = gray[y, x0:x1]
    d = np.abs(np.diff(row.astype(np.float32)))
    trans = (d > 12) & (d < 80)
    return float(trans.sum() / len(d))

for y in range(150, 250):
    s = row_dash_score(y)
    if s > 0.03:
        print(f"y={y} dash={s:.4f}")

# find bottom dash - look for second peak similar to top in y>160
scores = [(y, row_dash_score(y)) for y in range(150, 240)]
scores.sort(key=lambda t: t[1], reverse=True)
print("All peaks 150-240:", scores[:15])

top_y = 156
# bottom: highest score after top_y+15 excluding top border neighbors
bot_cands = [(y,s) for y,s in scores if y > top_y + 10 and s > 0.05]
print("Bottom cands:", bot_cands[:10])
