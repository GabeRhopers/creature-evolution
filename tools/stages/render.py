import json,sys
from PIL import Image
ALPH='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
def frame_img(p, s, k=8, bg=(30,90,140)):
    w,h=p['w'],p['h']; im=Image.new('RGB',(w*k,h*k),bg); px=im.load()
    for i,c in enumerate(s):
        if c=='.': continue
        col=p['palette'][ALPH.index(c)]; rgb=tuple(int(col[j:j+2],16) for j in (1,3,5))
        x,y=i%w,i//w
        for a in range(k):
            for b in range(k): px[x*k+a,y*k+b]=rgb
    return im
if __name__=='__main__':
    p=json.load(open(sys.argv[1])); out=sys.argv[2]
    ims=[frame_img(p,f) for po in p['poses'] for f in po['frames']]
    W=max(i.width for i in ims); H=sum(i.height+8 for i in ims)
    sheet=Image.new('RGB',(W,H),(10,20,30)); y=0
    for i in ims: sheet.paste(i,(0,y)); y+=i.height+8
    sheet.save(out)
