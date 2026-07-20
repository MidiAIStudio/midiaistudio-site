import numpy as np
from PIL import Image, ImageDraw
import os

IMG_A = r"C:\Users\최정환\.cursor\projects\c-GitHub-midiaistudio-site\assets\c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_e0323bcecf2a2bb0891d20ed5fc1bf29_images_image-de498bcd-e7c8-4d77-b93c-7954e0461524.png"
IMG_B = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
OUT_DEBUG = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_focus_debug.jpg"
OUT_CROP = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-drop-zone.jpg"

a = np.array(Image.open(IMG_A).convert("RGB"))
b = np.array(Image.open(IMG_B).convert("RGB"))
Bw, Bh = b.shape[1], b.shape[0]
yl, yt, yr, yb = 47, 30, 760, 172
inner = a[yt + 4 : yb - 4, yl + 4 : yr - 4]
YaW, YaH = yr - yl + 1, yb - yt + 1
print(f"A size: {a.shape[1]}x{a.shape[0]}")
print(f"Yellow bbox in A: left={yl}, top={yt}, right={yr}, bottom={yb}")

def mse(patch, templ):
    if patch.shape != templ.shape:
        return 1e9
    d = patch.astype(float) - templ.astype(float)
    return float((d * d).mean())

best = (1e9, None)
for scale1000 in range(820, 980, 5):
    scale = scale1000 / 1000.0
    nh, nw = max(8, int(inner.shape[0] * scale)), max(8, int(inner.shape[1] * scale))
    t = np.array(Image.fromarray(inner).resize((nw, nh), Image.LANCZOS))
    for y in range(165, 215):
        for x in range(130, 210, 2):
            p = b[y : y + nh, x : x + nw]
            if p.shape[0] != nh or p.shape[1] != nw:
                continue
            m = mse(p, t)
            if m < best[0]:
                best = (m, (scale, x, y, nw, nh))
print(f"Constrained MSE best: mse={best[0]:.2f}, meta={best[1]}")

m, (scale, x, y, nw, nh) = best
sx = nw / YaW
sy = nh / YaH
bl = int(round(x - yl * sx))
bt = int(round(y - yt * sy))
br = int(round(bl + (YaW - 1) * sx))
bb = int(round(bt + (YaH - 1) * sy))

pad = 4
bl = max(0, bl - pad)
bt = max(0, bt - pad)
br = min(Bw - 1, br + pad)
bb = min(Bh - 1, bb + pad)

print(f"Method: mse_map_yellow")
print(f"Final box in B: left={bl}, top={bt}, right={br}, bottom={bb}")
print(f"Box size: {br - bl + 1} x {bb - bt + 1}")

img = Image.fromarray(b)
draw = ImageDraw.Draw(img)
draw.rectangle([bl, bt, br, bb], outline=(0, 255, 255), width=3)
os.makedirs(os.path.dirname(OUT_DEBUG), exist_ok=True)
img.save(OUT_DEBUG, quality=95)
print(f"Saved debug: {OUT_DEBUG}")

crop = img.crop((bl, bt, br + 1, bb + 1))
cw, ch = crop.size
crop = crop.resize((1280, int(ch * 1280 / cw)), Image.LANCZOS)
crop.save(OUT_CROP, quality=92)
print(f"Saved crop: {OUT_CROP} ({crop.size[0]}x{crop.size[1]})")

l_pct = bl / 1280 * 100
t_pct = bt / 720 * 100
w_pct = (br - bl + 1) / 1280 * 100
h_pct = (bb - bt + 1) / 720 * 100
css = "style=\"--l:%.2f%%;--t:%.2f%%;--w:%.2f%%;--h:%.2f%%\"" % (l_pct, t_pct, w_pct, h_pct)
print("CSS:", css)
