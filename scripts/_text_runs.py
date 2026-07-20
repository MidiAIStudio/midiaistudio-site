from PIL import Image
JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(JPG).convert("L")
for y in [180, 200, 215, 230, 250]:
    runs = []
    start = None
    for x in range(260, 860):
        v = im.getpixel((x,y))
        if 90 <= v <= 200:
            if start is None: start = x
        else:
            if start is not None:
                runs.append((start, x-start))
                start = None
    if start: runs.append((start, 860-start))
    long = [r for r in runs if r[1] > 20]
    print(f"y={y} long runs", long[:6])
