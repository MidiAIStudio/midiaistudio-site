from PIL import Image
import os

PNG_PATH = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\audio-file-picker.png"
JPG_PATH = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
OUT_JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-drop-zone.jpg"
OUT_VERIFY = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_drop_crop_verify.png"

print("=== Source sizes ===")
for label, p in [("PNG", PNG_PATH), ("JPG", JPG_PATH)]:
    if os.path.isfile(p):
        with Image.open(p) as im:
            print(f"{label}: {im.size[0]}x{im.size[1]} ({im.mode})")
    else:
        print(f"{label}: not found")

# Use JPG (only available; 1280x720)
source_path = JPG_PATH
source_size = Image.open(source_path).size
im = Image.open(source_path).convert("RGB")
w, h = source_size

# Dashed drop zone detected via border scan: top~141, bottom~290, left~268, right~842
# Modest padding + YouTube URL row context (dash activity ~y117); stop before search list (~y311+)
left, top, right, bottom = 255, 100, 865, 302
crop_box = (left, top, right, bottom)
print(f"\nSource used: {source_path} ({w}x{h})")
print(f"Crop box (L,T,R,B): {crop_box}")
print(f"Native crop size: {right-left}x{bottom-top}")

cropped = im.crop(crop_box)
os.makedirs(os.path.dirname(OUT_VERIFY), exist_ok=True)
cropped.save(OUT_VERIFY, "PNG")

target_w = 1280
scale = target_w / cropped.width
target_h = int(round(cropped.height * scale))
upscaled = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
upscaled.save(OUT_JPG, "JPEG", quality=90, optimize=True)

print(f"\nSaved verify PNG: {OUT_VERIFY} ({cropped.size[0]}x{cropped.size[1]})")
print(f"Saved JPG: {OUT_JPG} ({upscaled.size[0]}x{upscaled.size[1]})")

# Heuristic: label text band should be mid-upper third, not dominated by list rows
px = cropped.load()
text_rows = []
for y in range(cropped.height):
    bright = sum(1 for x in range(cropped.width) if sum(px[x,y]) > 55)
    if bright > cropped.width * 0.02:
        text_rows.append(y)
if text_rows:
    print(f"Primary text activity rows (crop coords): {min(text_rows)}-{max(text_rows)} (center ~{(min(text_rows)+max(text_rows))//2})")
else:
    print("Warning: no text activity detected")

# Compare: old wrong crop would start at y=259 in source (below drop label ~222)
print(f"Old wrong crop top y=259 vs drop label ~y=222: {'OK' if top < 222 < bottom and 259 > bottom else 'check'}")
print("Subject check: crop excludes search-list band (y>=311) and includes dashed box y=141-290.")
