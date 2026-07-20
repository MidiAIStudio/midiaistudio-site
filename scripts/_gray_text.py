from PIL import Image
JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(JPG).convert("RGB")
px = im.load()
for y in range(130, 300, 5):
    count = 0
    for x in range(300, 820):
        r,g,b = px[x,y]
        # muted label text on dark UI
        if 100 <= r <= 180 and 100 <= g <= 180 and 100 <= b <= 180:
            count += 1
    if count > 80:
        print(f"y={y} gray_text_pixels={count}")
