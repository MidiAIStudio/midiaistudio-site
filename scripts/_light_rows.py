from PIL import Image
JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(JPG).convert("RGB")
px = im.load()
for y in range(130, 300, 3):
    count = 0
    for x in range(300, 820):
        r,g,b = px[x,y]
        if r+g+b > 180:  # any lighter pixel
            count += 1
    if count > 100:
        print(f"y={y} light_pixels={count}")
