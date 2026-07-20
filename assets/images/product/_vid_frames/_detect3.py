from PIL import Image, ImageDraw
import numpy as np

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(path).convert("RGB")
arr = np.array(im)
gray = (0.299*arr[:,:,0] + 0.587*arr[:,:,1] + 0.114*arr[:,:,2])

# Content bbox: pixels brighter than 20
mask = gray > 25
ys, xs = np.where(mask)
print("Content bbox (gray>25):", xs.min(), ys.min(), xs.max(), ys.max())
print("Size:", xs.max()-xs.min(), ys.max()-ys.min())

# Brighter UI panel
mask2 = gray > 40
ys2, xs2 = np.where(mask2)
if len(xs2):
    print("BBox gray>40:", xs2.min(), ys2.min(), xs2.max(), ys2.max())

# Histogram of y where bright pixels exist in center column
for thresh in [30, 50, 100, 150]:
    counts = [(gray[y, 300:980] > thresh).sum() for y in range(gray.shape[0])]
    peak_y = int(np.argmax(counts))
    print(f"thresh>{thresh}: peak row y={peak_y} count={counts[peak_y]}")

# Full image: where is the left panel (input section)?
# Sum bright pixels per row for x=0-700 vs x=700-1280
for y in range(0, 720, 20):
    left = (gray[y, :640] > 30).sum()
    right = (gray[y, 640:] > 30).sum()
    if left > 50 or right > 50:
        print(f"y={y} left_bright={left} right_bright={right}")

# Save scaled preview of non-black region
x0,x1 = xs.min(), xs.max()
y0,y1 = ys.min(), ys.max()
crop = im.crop((max(0,x0-10), max(0,y0-10), min(1280,x1+10), min(720,y1+10)))
crop.save(r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_content_crop.jpg", quality=95)
print("Saved content crop", crop.size)

# Analyze left half only (input panel)
W, H = im.size
left_gray = gray[:, :700]
print("\nLeft panel row bright counts (>100):")
for y in range(50, 400):
    c = (left_gray[y] > 100).sum()
    if c > 30:
        print(f"  y={y} count={c}")

# Dashed box in left panel
def dash_row(y, x0, x1):
    row = gray[y, x0:x1]
    bg = np.percentile(row, 50)
    on = np.abs(row - bg) > 6
    return int(np.abs(np.diff(on.astype(int))).sum()), bg

print("\nLeft panel dash rows x=50-650:")
for y in range(60, 350):
    tr, bg = dash_row(y, 50, 650)
    if tr >= 30:
        print(f"  y={y} trans={tr} bg={bg:.1f}")

# Text rows left
for y in range(60, 350):
    band = gray[y, 100:600]
    if ((band > 100) & (band < 230)).sum() > 40:
        print(f"  TEXT y={y} mid_bright={( ((band>100)&(band<230)).sum() )}")

