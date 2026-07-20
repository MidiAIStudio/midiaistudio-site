from PIL import Image, ImageDraw
import numpy as np
path=r"c:\GitHub\midiaistudio-site\assets\images\product\audio-file-picker.jpg"
im=Image.open(path); gray=np.array(im.convert("L"),float); W,H=im.size
for y in range(145,158):
    xs=[x for x in range(160,560) if gray[y,x]>25]
    seg=gray[y,165:545]
    tr=int(np.abs(np.diff((np.abs(seg-np.median(seg))>6).astype(int))).sum())
    print(y, "tr", tr, "span", (min(xs),max(xs)) if xs else None, "count", len(xs))
best=None
for y in range(145,157):
    seg=gray[y,165:545]
    xs=[165+i for i,v in enumerate(seg) if v>25]
    tr=int(np.abs(np.diff((np.abs(seg-np.median(seg))>6).astype(int))).sum())
    if xs and (max(xs)-min(xs))>200 and tr>=10:
        best=y
print("bottom candidate", best)
l,t,r,b=165,112,545,best or 156
d=ImageDraw.Draw(im)
d.rectangle([l,t,r,b],outline=(255,0,0),width=3)
im.save(r"c:\GitHub\midiaistudio-site\assets\images\product\_vid_frames\_tmp_focus_debug.jpg")
print("box", l,t,r,b)
css='style="--l:{:.2f}%;--t:{:.2f}%;--w:{:.2f}%;--h:{:.2f}%"'.format(100*l/W,100*t/H,100*(r-l)/W,100*(b-t)/H)
print("CSS:", css)
