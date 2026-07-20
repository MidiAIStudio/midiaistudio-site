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

r, g, bb = a[:, :, 0], a[:, :, 1], a[:, :, 2]
ym = (r > 150) & (g > 130) & (bb < 140) & (r > bb + 40)
yl, yt, yr, yb = np.where(ym)[1].min(), np.where(ym)[0].min(), np.where(ym)[1].max(), np.where(ym)[0].max()
print(f"A size: {a.shape[1]}x{a.shape[0]}")
print(f"Yellow bbox in A: left={yl}, top={yt}, right={yr}, bottom={yb}")

# remove yellow stroke for matching
ac = a.copy()
ac[ym] = ac[~ym].mean(axis=0).astype(np.uint8)

def score_origin(ox, oy, sx, sy):
    # sample grid points inside yellow region in A, compare to B
    total = 0.0
    n = 0
    for ay in range(yt + 10, yb - 10, 12):
        for ax in range(yl + 10, yr - 10, 20):
            bx = int(ox + ax * sx)
            by = int(oy + ay * sy)
            if bx < 0 or by < 0 or bx >= Bw or by >= Bh:
                return 1e9
            pa = ac[ay, ax].astype(float)
            pb = b[by, bx].astype(float)
            total += ((pa - pb) ** 2).mean()
            n += 1
    return total / max(n, 1)

best = (1e9, None)
for sx100 in range(840, 930, 2):
    sx = sx100 / 1000.0
    sy = sx * 0.615  # keep near ratio from yellow->fallback mapping
    for oy in range(145, 175, 1):
        for ox in range(100, 145, 2):
            s = score_origin(ox, oy, sx, sy)
            if s < best[0]:
                best = (s, (ox, oy, sx, sy))
print(f"Best origin/scale: mse={best[0]:.2f}, meta={best[1]}")

ox, oy, sx, sy = best[1]
bl = int(round(ox + yl * sx))
bt = int(round(oy + yt * sy))
br = int(round(ox + yr * sx))
bb = int(round(oy + yb * sy))

pad = 4
bl = max(0, bl - pad)
bt = max(0, bt - pad)
br = min(Bw - 1, br + pad)
bb = min(Bh - 1, bb + pad)

print(f"Mapped yellow to B: left={bl}, top={bt}, right={br}, bottom={bb}")
print(f"Box size: {br - bl + 1} x {bb - bt + 1}")

img = Image.fromarray(b)
draw = ImageDraw.Draw(img)
draw.rectangle([bl, bt, br, bb], outline=(0, 255, 255), width=3)
os.makedirs(os.path.dirname(OUT_DEBUG), exist_ok=True)
img.save(OUT_DEBUG, quality=95)

crop = img.crop((bl, bt, br + 1, bb + 1))
cw, ch = crop.size
crop = crop.resize((1280, int(ch * 1280 / cw)), Image.LANCZOS)
crop.save(OUT_CROP, quality=92)

l_pct = bl / 1280 * 100
t_pct = bt / 720 * 100
w_pct = (br - bl + 1) / 1280 * 100
h_pct = (bb - bt + 1) / 720 * 100
css = "style=\"--l:%.2f%%;--t:%.2f%%;--w:%.2f%%;--h:%.2f%%\"" % (l_pct, t_pct, w_pct, h_pct)
print("CSS:", css)
