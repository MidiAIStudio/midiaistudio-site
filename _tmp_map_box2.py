import numpy as np
from PIL import Image, ImageDraw

IMG_A = r"C:\Users\최정환\.cursor\projects\c-GitHub-midiaistudio-site\assets\c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_e0323bcecf2a2bb0891d20ed5fc1bf29_images_image-de498bcd-e7c8-4d77-b93c-7954e0461524.png"
IMG_B = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
OUT_DEBUG = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_focus_debug.jpg"
OUT_CROP = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-drop-zone.jpg"

a = np.array(Image.open(IMG_A).convert("RGB"))
b = np.array(Image.open(IMG_B).convert("RGB"))
Bw, Bh = b.shape[1], b.shape[0]

r, g, bb = a[:, :, 0], a[:, :, 1], a[:, :, 2]
ym = (r > 150) & (g > 130) & (bb < 140) & (r > bb + 40)
ys, xs = np.where(ym)
yl, yt, yr, yb = xs.min(), ys.min(), xs.max(), ys.max()
print(f"A size: {a.shape[1]}x{a.shape[0]}")
print(f"Yellow bbox in A: left={yl}, top={yt}, right={yr}, bottom={yb}")
print(f"Yellow size: {yr - yl + 1} x {yb - yt + 1}")

gray = (0.299 * b[:, :, 0] + 0.587 * b[:, :, 1] + 0.114 * b[:, :, 2]).astype(np.float32)
inner = a[yt + 4 : yb - 4, yl + 4 : yr - 4]

def to_gray(img):
    return (0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]).astype(np.float32)

def ncc_at(t, search, x, y):
    th, tw = t.shape
    patch = search[y : y + th, x : x + tw]
    if patch.shape[0] != th or patch.shape[1] != tw:
        return -9.0
    t0 = t - t.mean()
    p0 = patch - patch.mean()
    return float((t0 * p0).mean() / (t0.std() * p0.std() + 1e-6))

bg = to_gray(b)
best = (-9.0, None)
for scale in (0.86, 0.88, 0.90, 0.92, 0.94, 0.96, 0.98, 1.0):
    nh = max(8, int(inner.shape[0] * scale))
    nw = max(8, int(inner.shape[1] * scale))
    t = to_gray(np.array(Image.fromarray(inner).resize((nw, nh), Image.LANCZOS)))
    th, tw = t.shape
    y0, y1 = 130, 280
    x0, x1 = 100, 900
    region = bg[y0:y1, x0:x1]
    if th >= region.shape[0] or tw >= region.shape[1]:
        continue
    for y in range(0, region.shape[0] - th, 2):
        for x in range(0, region.shape[1] - tw, 2):
            s = ncc_at(t, region, x, y)
            if s > best[0]:
                best = (s, (scale, x0 + x, y0 + y, tw, th))
print(f"Inner multiscale match: score={best[0]:.4f}, meta={best[1]}")

method = "dashed_detect"
if best[1] and best[0] > 0.45:
    scale, mx, my, tw, th = best[1]
    sx = tw / (yr - yl + 1)
    sy = th / (yb - yt + 1)
    bl = int(mx - yl * sx)
    bt = int(my - yt * sy)
    br = int(bl + (yr - yl) * sx)
    bb = int(bt + (yb - yt) * sy)
    method = "template_match_scaled"
else:
    target_h = int((yb - yt + 1) * 0.55)
    best_pair = None
    best_score = -1
    for top in range(165, 215):
        for bot in range(top + 45, top + 95):
            rt = gray[top, 150:800]
            rb = gray[bot, 150:800]
            dt = (np.abs(np.diff(rt)) > 10).sum()
            db = (np.abs(np.diff(rb)) > 10).sum()
            if dt < 120 or db < 120:
                continue
            col_l = gray[top:bot, 155]
            col_r = gray[top:bot, 795]
            dl = (np.abs(np.diff(col_l)) > 10).sum()
            dr = (np.abs(np.diff(col_r)) > 10).sum()
            h = bot - top
            score = dt + db + dl + dr - abs(h - target_h) * 2
            if score > best_score:
                best_score = score
                best_pair = (155, top, 795, bot)
    if best_pair:
        bl, bt, br, bb = best_pair
    else:
        bl, bt, br, bb = 165, 178, 795, 248

pad = 4
bl = max(0, int(bl) - pad)
bt = max(0, int(bt) - pad)
br = min(Bw - 1, int(br) + pad)
bb = min(Bh - 1, int(bb) + pad)

print(f"Method: {method}")
print(f"Final box in B: left={bl}, top={bt}, right={br}, bottom={bb}")
print(f"Box size: {br - bl + 1} x {bb - bt + 1}")

img = Image.fromarray(b)
draw = ImageDraw.Draw(img)
draw.rectangle([bl, bt, br, bb], outline=(0, 255, 255), width=3)
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
css = 'style="--l:%.2f%%;--t:%.2f%%;--w:%.2f%%;--h:%.2f%%"' % (l_pct, t_pct, w_pct, h_pct)
print("CSS:", css)
