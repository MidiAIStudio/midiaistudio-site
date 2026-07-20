from PIL import Image
import os
JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
OUT = r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_drop_crop_verify.png"
im = Image.open(JPG).convert("RGB")
# detected box: top 141, bottom ~290, left ~268, right ~842
boxes = {
    "tight": (268, 141, 842, 290),
    "with_url": (255, 95, 865, 302),
    "with_url2": (255, 108, 865, 298),
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
for name, box in boxes.items():
    c = im.crop(box)
    p = OUT.replace(".png", f"_{name}.png")
    c.save(p)
    print(name, box, c.size, p)
