from PIL import Image
import os
base = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames"
for fn in os.listdir(base):
    if fn.startswith("_tmp_drop_crop_verify"):
        im = Image.open(os.path.join(base, fn)).convert("RGB")
        w,h = im.size
        bright = 0
        total = 0
        for y in range(h//3, 2*h//3):
            for x in range(w//4, 3*w//4):
                r,g,b = im.getpixel((x,y))
                total += 1
                if r > 140 or g > 140 or b > 140:
                    bright += 1
        print(fn, "bright_ratio", round(bright/total, 3))
