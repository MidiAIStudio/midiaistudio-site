from PIL import Image
JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(JPG).convert("RGB")
px = im.load()
for y in range(200, 225):
    row = [px[x,y] for x in range(400, 700, 10)]
    print(y, row[:5], '...', row[-3:])
print('--- sample 555,215 neighbors ---')
for dy in range(-2,3):
    for dx in range(-2,3):
        print((555+dx,215+dy), px[555+dx,215+dy])
