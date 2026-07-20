import os
import numpy as np
from PIL import Image, ImageDraw

IMG_A = r"C:\Users\최정환\.cursor\projects\c-GitHub-midiaistudio-site\assets\c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_e0323bcecf2a2bb0891d20ed5fc1bf29_images_image-de498bcd-e7c8-4d77-b93c-7954e0461524.png"
IMG_B = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
OUT_DEBUG = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_focus_debug.jpg"
OUT_CROP = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-drop-zone.jpg"

def find_yellow_bbox(arr):
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    masks = [
        (r > 180) & (g > 160) & (b < 120),
        (r > 200) & (g > 180) & (b < 100),
        (r.astype(int) + g.astype(int) > 380) & (b < 130) & (r > g * 0.85),
        (r > 150) & (g > 130) & (b < 140) & (r > b + 40) & (g > b + 20),
    ]
    best = None
    best_area = 0
    for i, m in enumerate(masks):
        ys, xs = np.where(m)
        if len(xs) == 0:
            continue
        left, right = xs.min(), xs.max()
        top, bottom = ys.min(), ys.max()
        area = (right - left + 1) * (bottom - top + 1)
        if area > best_area and area > 100:
            best_area = area
            best = (left, top, right, bottom, i)
    return best

def ncc_match(template_gray, search_gray):
    th, tw = template_gray.shape
    sh, sw = search_gray.shape
    if th > sh or tw > sw:
        return None, -1
    t = template_gray.astype(np.float32)
    t -= t.mean()
    t_std = t.std() + 1e-6
    t /= t_std
    best_score = -2
    best_xy = None
    step = max(1, min(3, tw // 100))
    for y in range(0, sh - th + 1, step):
        for x in range(0, sw - tw + 1, step):
            patch = search_gray[y:y+th, x:x+tw].astype(np.float32)
            patch -= patch.mean()
            p_std = patch.std() + 1e-6
            score = float((t * patch).mean() / p_std)
            if score > best_score:
                best_score = score
                best_xy = (x, y)
    if best_xy is None:
        return None, best_score
    x0, y0 = best_xy
    for y in range(max(0, y0-10), min(sh - th + 1, y0+11)):
        for x in range(max(0, x0-10), min(sw - tw + 1, x0+11)):
            patch = search_gray[y:y+th, x:x+tw].astype(np.float32)
            patch -= patch.mean()
            p_std = patch.std() + 1e-6
            score = float((t * patch).mean() / p_std)
            if score > best_score:
                best_score = score
                best_xy = (x, y)
    return best_xy, best_score

def find_dashed_drop_zone(arr):
    h, w = arr.shape[:2]
    gray = (0.299*arr[:,:,0] + 0.587*arr[:,:,1] + 0.114*arr[:,:,2]).astype(np.uint8)
    y0, y1 = 150, 280
    x0, x1 = 120, 900
    roi = gray[y0:y1, x0:x1]
    rh, rw = roi.shape
    best = None
    best_score = -1
    def dash_score(row):
        if len(row) < 40:
            return 0
        dif = np.abs(np.diff(row.astype(int)))
        return float(dif.mean()) + float((row > 100).mean()) * 20
    for band_h in range(45, 95):
        for top_off in range(0, rh - band_h):
            band = roi[top_off:top_off+band_h, :]
            top_row = band[0, :]
            bot_row = band[-1, :]
            ds = dash_score(top_row) + dash_score(bot_row)
            inner = band[5:-5, 10:-10]
            inner_mean = inner.mean()
            if inner_mean > 90 or inner_mean < 25:
                continue
            inner_std = inner.std()
            score = ds - inner_std * 0.5
            if score > best_score:
                best_score = score
                best = (x0, y0 + top_off, x0 + rw - 1, y0 + top_off + band_h - 1)
    return best, best_score

a = Image.open(IMG_A).convert('RGB')
a_arr = np.array(a)
print(f"A size: {a.size[0]}x{a.size[1]} (W x H)")

yb = find_yellow_bbox(a_arr)
if yb is None:
    raise SystemExit('No yellow pixels found in A')
yl, yt, yr, yb_b, mask_idx = yb
print(f"Yellow bbox in A (mask {mask_idx}): left={yl}, top={yt}, right={yr}, bottom={yb_b}")
print(f"Yellow size: {yr-yl+1} x {yb_b-yt+1}")

b = Image.open(IMG_B).convert('RGB')
b_arr = np.array(b)
Bw, Bh = b.size
print(f"B size: {Bw}x{Bh}")

a_clean = a_arr.copy()
r,g,bb = a_clean[:,:,0], a_clean[:,:,1], a_clean[:,:,2]
yellow_m = (r > 150) & (g > 130) & (bb < 140) & (r > bb + 40)
# manual dilation 2px
ym = yellow_m.copy()
for dy in (-2,-1,0,1,2):
    for dx in (-2,-1,0,1,2):
        if dx==0 and dy==0: continue
        shifted = np.roll(np.roll(yellow_m, dy, axis=0), dx, axis=1)
        ym |= shifted
bg = a_arr[~yellow_m].mean(axis=0).astype(np.uint8) if (~yellow_m).any() else np.array([40,40,40], dtype=np.uint8)
a_clean[ym] = bg

b_gray = (0.299*b_arr[:,:,0] + 0.587*b_arr[:,:,1] + 0.114*b_arr[:,:,2]).astype(np.uint8)
a_gray = (0.299*a_clean[:,:,0] + 0.587*a_clean[:,:,1] + 0.114*a_clean[:,:,2]).astype(np.uint8)

match_xy, match_score = ncc_match(a_gray, b_gray)
print(f"Template match: xy={match_xy}, score={match_score:.4f}")

aw = yr - yl + 1
ah = yb_b - yt + 1
aspect = aw / ah

if match_xy and match_score > 0.35:
    mx, my = match_xy
    bl = mx + yl
    bt = my + yt
    br = mx + yr
    bb = my + yb_b
    method = 'template_match'
else:
    dz, dz_score = find_dashed_drop_zone(b_arr)
    print(f"Dashed zone detect: {dz}, score={dz_score:.2f}")
    if dz:
        bl, bt, br, bb = dz
        cw = br - bl + 1
        ch = bb - bt + 1
        target_h = int(cw / aspect)
        if 40 < target_h < ch:
            extra = ch - target_h
            bt += extra // 2
            bb -= extra - extra // 2
        method = 'dashed_detect'
    else:
        bl, bt, br, bb = 165, 178, 795, 248
        method = 'fallback_estimate'

pad = 4
bl = max(0, bl - pad)
bt = max(0, bt - pad)
br = min(Bw - 1, br + pad)
bb = min(Bh - 1, bb + pad)

print(f"Method: {method}")
print(f"Final box in B: left={bl}, top={bt}, right={br}, bottom={bb}")
print(f"Box size: {br-bl+1} x {bb-bt+1}")

os.makedirs(os.path.dirname(OUT_DEBUG), exist_ok=True)
debug = b.copy()
draw = ImageDraw.Draw(debug)
draw.rectangle([bl, bt, br, bb], outline=(0, 255, 255), width=3)
debug.save(OUT_DEBUG, quality=95)
print(f"Saved debug: {OUT_DEBUG}")

crop = b.crop((bl, bt, br + 1, bb + 1))
cw, ch = crop.size
scale = 1280 / cw
new_h = int(ch * scale)
crop_up = crop.resize((1280, new_h), Image.LANCZOS)
crop_up.save(OUT_CROP, quality=92)
print(f"Saved crop: {OUT_CROP} ({1280}x{new_h})")

l_pct = bl / 1280 * 100
t_pct = bt / 720 * 100
w_pct = (br - bl + 1) / 1280 * 100
h_pct = (bb - bt + 1) / 720 * 100
css = f'style="--l:{l_pct:.2f}%;--t:{t_pct:.2f}%;--w:{w_pct:.2f}%;--h:{h_pct:.2f}%"'
print(f"CSS: {css}")
