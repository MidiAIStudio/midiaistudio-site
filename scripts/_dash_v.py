from PIL import Image
JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(JPG).convert("RGB")
px = im.load()

def dash_v(x, y0, y1):
    c=0
    for y in range(y0, y1-6):
        r,g,b = px[x,y]
        m = (r+g+b)/3
        if not (80 <= m <= 180):
            continue
        r2,g2,b2 = px[x,y+6]
        m2 = (r2+g2+b2)/3
        if abs(m-m2) > 35:
            c += 1
    return c

for x in range(250, 900):
    s = dash_v(x, 135, 300)
    if s > 12:
        print(f"x={x} dash_v={s}")
