from PIL import Image, ImageDraw
import numpy as np

path = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(path).convert("RGB")
W,H = im.size
gray = np.array(im.convert("L"), dtype=float)

def dash_tr(y, x0, x1):
    row = gray[y, x0:x1]
    bg = np.median(row)
    on = np.abs(row-bg) > 7
    return int(np.abs(np.diff(on.astype(int))).sum()), bg

print("Center region x=280-980 dash transitions:")
for y in range(95, 220):
    tr, bg = dash_tr(y, 280, 980)
    if tr >= 20:
        print(f"  y={y} tr={tr} bg={bg:.1f}")

print("\nCenter text rows (140-220 gray 90-230):")
for y in range(100, 220):
    band = gray[y, 320:900]
    n = ((band>90)&(band<230)).sum()
    if n > 80:
        xs = np.where(((band>90)&(band<230)))[0]+320
        print(f"  y={y} n={n} x={xs.min()}-{xs.max()}")

# YouTube field - look for horizontal filled input (uniform mid row) y=70-110
print("\nUniform rows (low std) x=300-900 y=60-120:")
for y in range(60, 120):
    seg = gray[y, 300:900]
    if seg.std() < 8 and seg.mean() > 12:
        print(f"  y={y} mean={seg.mean():.1f} std={seg.std():.2f}")

# Save full width strip 100-170
im.crop((0,100,W,170)).save(r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_strip_input.jpg", quality=95)

# Try easyocr on strip B
try:
    import easyocr
    reader = easyocr.Reader(['ko','en'], gpu=False)
    crop = im.crop((0,100,W,170))
    import tempfile, os
    p = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_ocr.jpg"
    crop.save(p)
    res = reader.readtext(p)
    for item in res:
        print("OCR:", item)
except Exception as e:
    print("easyocr:", e)
