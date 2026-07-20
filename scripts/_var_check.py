from PIL import Image
import statistics, os
JPG = r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im = Image.open(JPG).convert("L")
w,h = im.size

def var_box(box):
    l,t,r,b = box
    vals = [im.getpixel((x,y)) for y in range(t,b,2) for x in range(l,r,2)]
    return statistics.pstdev(vals)

boxes = {
    "drop_detected": (268, 141, 842, 290),
    "with_url2": (255, 108, 865, 298),
    "wrong_old": (191, 259, 670, 528),
    "lower_list": (191, 310, 670, 528),
}
for k,v in boxes.items():
    print(k, var_box(v))

# find max variance horizontal strip 574x149 sliding in upper area
best=[]
for top in range(80, 200, 5):
    box = (268, top, 842, top+149)
    if box[3] > 310: break
    best.append((var_box(box), top))
best.sort(reverse=True)
print("best tops for drop-sized window", best[:8])
