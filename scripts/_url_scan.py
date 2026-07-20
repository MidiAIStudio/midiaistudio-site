from PIL import Image
JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(JPG).convert("RGB")
px = im.load()

def dash_h(y, x0, x1):
    c=0
    for x in range(x0, x1-6):
        r,g,b = px[x,y]
        m = (r+g+b)/3
        if not (80 <= m <= 180):
            continue
        r2,g2,b2 = px[x+6,y]
        m2 = (r2+g2+b2)/3
        if abs(m-m2) > 35:
            c += 1
    return c

for y in range(90, 145):
    s = dash_h(y, 300, 800)
    if s > 10:
        print(f"y={y} dash={s}")
