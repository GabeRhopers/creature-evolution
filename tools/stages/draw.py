import json, math
from render import frame_img
from PIL import Image
W,H=48,24
PAL=["#181425","#265c42","#3e8948","#63c74d","#aad678","#fee761","#ead4aa","#a22633","#f6757a",
     "#ffffff","#c0cbdc","#8b9bb4","#193c3e","#265c42"]
# 0 outline 1 dark green 2 green 3 light green 4 belly 5 eye 6 teeth/cream 7 red 8 pink
# 9 shell A shell shade B shell crack C adult dark scute D adult mid green
class G:
    def __init__(s): s.g=[['.']*W for _ in range(H)]
    def px(s,x,y,c):
        if 0<=x<W and 0<=y<H: s.g[y][x]=c
    def get(s,x,y): return s.g[y][x] if 0<=x<W and 0<=y<H else '.'
    def ell(s,cx,cy,rx,ry,c,cond=None):
        for y in range(H):
            for x in range(W):
                if ((x-cx)/rx)**2+((y-cy)/ry)**2<=1.0 and (cond is None or cond(x,y)): s.px(x,y,c)
    def rect(s,x0,y0,x1,y1,c):
        for y in range(y0,y1+1):
            for x in range(x0,x1+1): s.px(x,y,c)
    def outline(s):
        add=[]
        for y in range(H):
            for x in range(W):
                if s.g[y][x]=='.' and any(s.get(x+dx,y+dy) not in '.0' for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))): add.append((x,y))
        for x,y in add: s.g[y][x]='0'
    def s(s): return ''.join(''.join(r) for r in s.g)

# ---------------- stage 1: hatchling in its egg
def hatchling(step=0, blink=False, cap_tilt=0, tail_up=0, legs=0):
    g=G()
    # tail poking out of the left side of the egg, tip curling up
    for x in range(10,17): g.rect(x,16,x,17 if x>12 else 16,'2')
    g.rect(9,14-tail_up,9,16,'2'); g.px(10,15-tail_up,'2')
    # tiny legs out of the bottom
    for lx,off in ((19,legs),(28,-legs)):
        g.rect(lx+off,21,lx+1+off,22,'2'); g.px(lx+2+off,22,'2')
    # baby body showing above the broken shell
    g.ell(24,12,8,5,'2')
    for x in (19,22,25,28): g.px(x,9,'1')
    # big round head out of the front
    g.ell(36,11,6,3.6,'2')
    g.rect(40,10,44,13,'2'); g.px(44,10,'.')   # short rounded snout
    g.px(43,10,'1')                               # nostril
    for x in range(39,44,2): g.px(x,14,'6')       # little teeth
    g.rect(38,13,43,13,'2')
    # big baby eye on a dome
    g.ell(35,7,3.4,2.8,'2')
    if blink:
        g.rect(33,7,37,7,'0')
    else:
        g.rect(33,5,37,8,'5'); g.rect(36,6,37,8,'0'); g.px(33,5,'6'); g.px(34,5,'6'); g.px(33,8,'3')
    # egg shell: lower part with a jagged top edge
    jag=lambda x: 12 + (0 if x%3==0 else 1 if x%3==1 else 2)
    g.ell(24,15,10,7.5,'9', cond=lambda x,y: y>=jag(x))
    g.ell(24,15,10,7.5,'A', cond=lambda x,y: y>=19 and ((x-24)/10)**2+((y-15)/7.5)**2>0.55)
    for (x,y) in ((18,15),(19,16),(19,17),(20,18),(29,15),(30,16),(29,17)): g.px(x,y,'B')
    g.px(22,15,'6'); g.px(23,15,'6')
    # broken shell cap sitting on the head like a hat
    cy=1+cap_tilt
    g.rect(33,cy,37,cy,'9'); g.rect(32,cy+1,38,cy+1,'9'); g.px(38,cy+1,'A')
    for x in (32,34,36,38): g.px(x,cy+2,'9' if x<38 else 'A')
    g.outline()
    return g.s()

# ---------------- stage 2: juvenile (the son's crocodile, a little younger)
def juvenile(legs=0, tail_up=0, blink=False):
    g=G()
    # tail: tapers to the left and curls up at the tip
    g.rect(8,11,12,14,'2')
    g.rect(5,12,7,14,'2')
    g.rect(3,12,4,13,'2')
    g.rect(2,10-tail_up,2,13,'2'); g.px(1,9-tail_up,'2') if tail_up else g.px(2,9,'2')
    # body
    g.rect(11,10,34,15,'2')
    g.rect(14,14,32,15,'4')
    for x in range(13,33,3): g.px(x,10,'3')
    # legs
    for lx,off in ((15,legs),(28,-legs)):
        g.rect(lx+off,16,lx+2+off,18,'2'); g.px(lx+3+off,18,'2')
    # head with snout
    g.rect(33,9,40,15,'2')
    g.rect(40,11,46,14,'2')
    g.px(46,11,'1')
    for x in range(38,46,2): g.px(x,14,'6')
    # eye bump, a bit bigger than the adult's
    g.rect(34,6,38,9,'2')
    if blink: g.rect(34,8,37,8,'0')
    else: g.rect(34,7,37,8,'5'); g.px(37,7,'0'); g.px(37,8,'0')
    g.outline()
    return g.s()

# ---------------- stage 3: adult, armored
def adult(legs=0, tail_up=0, blink=False, jaw=0):
    g=G()
    # thick tail with ridge
    for x in range(1,10):
        top=13-(x//3); bot=14+(x//4)
        g.rect(x,top,x,bot,'D' if x<5 else '2')
    g.rect(1,11-tail_up,2,13,'D')
    # body
    g.rect(8,9,36,17,'2')
    g.rect(11,16,34,17,'4')
    g.rect(8,9,36,10,'1')
    # back scutes (ridge spikes)
    for x in range(4,35,4):
        y0 = 8 if x>=8 else 10
        g.px(x,y0,'C'); g.px(x+1,y0,'C'); g.px(x,y0-1,'C')
    for x in range(11,35,4): g.px(x,12,'1'); g.px(x+1,13,'1')
    # legs with claws
    for lx,off in ((12,legs),(29,-legs)):
        g.rect(lx+off,18,lx+3+off,20,'2'); g.rect(lx+off,21,lx+4+off,21,'1'); g.px(lx+5+off,21,'6')
    # big head, heavy jaws
    g.rect(35,9,42,17,'2')
    g.rect(42,10,46,13,'2')
    g.rect(42,14+jaw,46,17,'2')
    if jaw: g.rect(42,14,46,14+jaw-1,'7')
    for x in range(40,47,2): g.px(x,13,'6')
    for x in range(41,47,2): g.px(x,14+jaw,'6')
    g.px(46,10,'1')
    # eye with a heavy brow
    g.rect(37,6,41,9,'2'); g.rect(37,6,41,6,'C')
    if blink: g.rect(38,8,40,8,'0')
    else: g.rect(38,7,40,8,'5'); g.px(40,7,'0'); g.px(40,8,'0')
    g.outline()
    return g.s()

def project(name, poses):
    return {"name":name,"w":W,"h":H,"palette":PAL,"poses":[{"name":n,"fps":f,"frames":fr} for n,f,fr in poses],"updatedAt":"2026-11-21T08:45:00.000Z"}

stages = {
 "croc-hatchling": project("Crocodile 1: Hatchling", [
   ("idle",3,[hatchling(), hatchling(tail_up=1), hatchling(blink=True)]),
   ("move",6,[hatchling(legs=1), hatchling(legs=-1, tail_up=1)]),
   ("attack",8,[]),("damage",6,[]),("celebrate",6,[hatchling(cap_tilt=-1), hatchling()]),("rest",2,[])]),
 "croc-juvenile": project("Crocodile 2: Juvenile", [
   ("idle",3,[juvenile(), juvenile(tail_up=1), juvenile(blink=True)]),
   ("move",6,[juvenile(legs=1), juvenile(legs=-1, tail_up=1)]),
   ("attack",8,[]),("damage",6,[]),("celebrate",6,[]),("rest",2,[])]),
 "croc-adult": project("Crocodile 3: Adult", [
   ("idle",3,[adult(), adult(tail_up=1), adult(blink=True)]),
   ("move",6,[adult(legs=1), adult(legs=-1, tail_up=1)]),
   ("attack",8,[adult(jaw=2)]),("damage",6,[]),("celebrate",6,[]),("rest",2,[])]),
}
for k,v in stages.items(): json.dump(v, open(k+'.json','w'))
# preview: idle frame of each stage side by side, at relative sizes
ims=[frame_img(v, v['poses'][0]['frames'][0], k=10) for v in stages.values()]
sheet=Image.new('RGB',(sum(i.width for i in ims)+40, ims[0].height),(10,20,30)); x=0
for i in ims: sheet.paste(i,(x,0)); x+=i.width+20
sheet.save('stages.png')
