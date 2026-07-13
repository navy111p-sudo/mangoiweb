"""
망고아이 우주인 파이터 (카툰 스타일) — 5개 그린스크린 시트(각 3x2) -> astro-atlas.png (5x5, cell540x500, 22프레임)
그린스크린 키잉(despill은 키잉 후에만). 발끝 바닥접지 + 공중(날아차기)은 lift 로 띄움.
동작: idle(가드) / 주먹(대시 lunge) / 옆차기 / 날아차기 / 피격리액션 / 소멸 / 승리.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

D='C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'
OUT=D+'public/astro-atlas.png'

SHEETS={  # 전부 카툰 그린스크린 3x2 (원본은 game_image/ 보관)
 'react'    :D+'game_image/Gemini_Generated_Image_mzqyi3mzqyi3mzqy.png',  # 0 HighGuard,1 BodyFlinch,2 HeadSnap,3 Stagger,4 LowCover,5 Recover
 'sidekick' :D+'game_image/Gemini_Generated_Image_2z2h1m2z2h1m2z2h.png',  # 0 Chamber,1 HipLoad,2 Extend,3 Peak,4 Retract,5 Land
 'flykick'  :D+'game_image/Gemini_Generated_Image_io4m2yio4m2yio4m.png',  # 0 Crouch,1 Launch,2 Tuck,3 FlyExtend,4 Descend,5 Land
 'dash'     :D+'game_image/Gemini_Generated_Image_kj3x3jkj3x3jkj3x.png',  # 0 Lean,1 Push,2 Stride1,3 Stride2,4 Lunge,5 Brake
 'victory'  :D+'game_image/Gemini_Generated_Image_i1v0fvi1v0fvi1v0.png',  # 0 VSign,1 FistPump,2 Flag,3 ChestThump,4 Boast,5 Bow
}
GRID={'cols':3,'rows':2}
REFCELL={'react':5,'sidekick':5,'flykick':5,'dash':5,'victory':0}  # 서있는 가드 기준

# (sheet, cell, flip, lift)  lift=셀높이 대비 공중부양 비율
FRAMES=[
 ('react',5,False,0),    #0 idle guard A (Recover)
 ('sidekick',5,False,0), #1 idle guard B (Land&Reset)
 ('dash',4,False,0),     #2 punch strike (Lunge In)
 ('sidekick',0,False,0), #3 sidekick chamber
 ('sidekick',2,False,0), #4 sidekick extend
 ('sidekick',3,False,0), #5 sidekick peak
 ('sidekick',4,False,0), #6 sidekick retract
 ('flykick',0,False,0),      #7 flying crouch load
 ('flykick',1,False,0.16),   #8 flying launch (뜸)
 ('flykick',3,False,0.26),   #9 flying extend (제일 높이)
 ('flykick',4,False,0.12),   #10 flying descend
 ('flykick',5,False,0),      #11 flying land
 ('react',1,False,0),    #12 hit body flinch
 ('react',2,False,0),    #13 hit head snap
 ('react',3,False,0),    #14 death stagger
 ('dash',1,False,0),     #15 dash push off
 ('dash',2,False,0),     #16 dash stride1
 ('dash',3,False,0),     #17 dash stride2
 ('victory',1,False,0),  #18 victory fist pump
 ('victory',0,False,0),  #19 victory v-sign
 ('victory',3,False,0),  #20 victory chest thump
 ('react',0,False,0),    #21 high guard block
]
COLS_A,ROWS_A=5,5
CELL_W,CELL_H=540,500
STAND_FRAC=0.80
BASE_FRAC=0.975

def despill(rgb):
    out=rgb.copy(); mx=np.maximum(out[...,0],out[...,2])
    out[...,1]=np.minimum(out[...,1], mx+6)
    return out

def metal_enhance(rgb):
    """맑고 메탈릭하게: 언샵마스크(선명) + 약한 채도감소(은색 금속감) + S커브 콘트라스트(하이라이트 펀치).
       게임에서 tint 1.12배로 밝히며 뜨는 것을 상쇄해 뿌연 느낌 제거."""
    x=rgb/255.0
    blur=ndi.gaussian_filter(x,sigma=(1.5,1.5,0))
    x=np.clip(x+0.9*(x-blur),0,1)                      # unsharp mask
    l=(0.299*x[...,0]+0.587*x[...,1]+0.114*x[...,2])[...,None]
    x=np.clip(l+0.86*(x-l),0,1)                        # 채도 -14% → 실버 메탈톤
    x=np.clip(0.5+(x-0.5)*1.16,0,1)                    # 콘트라스트 +16%
    x=np.clip(x+0.10*np.maximum(x-0.72,0)/0.28,0,1)    # 하이라이트만 살짝 더 (금속 광택)
    return x*255.0

def largest8(mask):
    lbl,n=ndi.label(mask)
    if n==0: return mask
    sizes=ndi.sum(np.ones_like(lbl),lbl,range(1,n+1))
    return lbl==(1+int(np.argmax(sizes)))

def fill_small_holes(fig,maxarea):
    filled=ndi.binary_fill_holes(fig); holes=filled&~fig
    lbl,n=ndi.label(holes)
    if n==0: return fig
    out=fig.copy()
    for i in range(1,n+1):
        comp=(lbl==i)
        if comp.sum()<maxarea: out|=comp
    return out

def key_green(rgb):
    R,G,Bc=rgb[...,0],rgb[...,1],rgb[...,2]
    excess=G-np.maximum(R,Bc)
    bg=(excess>26)&(G>70)
    fig=~bg
    fig=largest8(fig)
    fig=fill_small_holes(fig,1600)
    fig=ndi.binary_opening(fig,iterations=1)
    fig=largest8(fig)
    fig=ndi.binary_erosion(fig,iterations=1)
    a=ndi.gaussian_filter(fig.astype(np.float32),0.6)
    a=np.clip((a-0.22)/0.56,0,1)   # 엣지 크리스프닝: 부연 번짐 제거(AA 1px만 남김) → 투명 경계 또렷
    return a

def cell_rgb(A,cell):
    H,W,_=A.shape
    c=cell%GRID['cols']; r=cell//GRID['cols']
    cw=W/GRID['cols']; ch=H/GRID['rows']
    x0,x1=int(c*cw),int((c+1)*cw); y0,y1=int(r*ch),int((r+1)*ch)
    ins=12
    return A[y0+ins:y1-ins, x0+ins:x1-ins].copy()

def piece(A,cell,flip):
    raw=cell_rgb(A,cell)
    a=key_green(raw); rgb=despill(raw)
    r=cell//GRID['cols']
    a[:32,:]=0
    if r==0: a[-40:,:]=0
    else:    a[-8:,:]=0
    ys,xs=np.where(a>0.2)
    if len(ys)==0: return None,None
    y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    crgb=rgb[y0:y1,x0:x1]; ca=a[y0:y1,x0:x1]
    if flip: crgb=crgb[:,::-1]; ca=ca[:,::-1]
    return crgb,ca

def main():
    imgs={k:np.asarray(Image.open(v).convert('RGB')).astype(np.float32) for k,v in SHEETS.items()}
    refh={}
    for sh in SHEETS:
        _,ca=piece(imgs[sh],REFCELL[sh],False); refh[sh]=ca.shape[0]
    target=CELL_H*STAND_FRAC
    atlas=Image.new('RGBA',(COLS_A*CELL_W,ROWS_A*CELL_H),(0,0,0,0))
    for idx,(sh,cell,flip,lift) in enumerate(FRAMES):
        crgb,ca=piece(imgs[sh],cell,flip)
        if crgb is None: continue
        scale=target/refh[sh]; ph,pw=ca.shape
        nw,nh=max(1,int(pw*scale)),max(1,int(ph*scale))
        rp=Image.fromarray(np.dstack([crgb,ca*255]).astype(np.uint8),'RGBA').resize((nw,nh),Image.LANCZOS)
        arr=np.asarray(rp).astype(np.float32)   # 원본이 저해상(~280px 키)이라 1.4x 확대 후 선명화해야 또렷 (확대 전 선명화는 다시 뭉개짐)
        erg=metal_enhance(arr[...,:3])
        eal=np.clip((arr[...,3]/255.0-0.16)/0.68,0,1)*255.0   # LANCZOS 확대로 재차 부드러워진 엣지 재크리스프닝
        rp=Image.fromarray(np.dstack([erg,eal]).astype(np.uint8),'RGBA')
        na=np.asarray(rp)[:,:,3]
        cut=int(nh*0.80); low=na[cut:]; yy,xx=np.where(low>40)
        ax=int(xx.mean()) if len(xx)>0 else nw//2
        yb=np.where(na.max(1)>40)[0]; foot=int(yb.max()) if len(yb)>0 else nh-1
        c=idx%COLS_A; r=idx//COLS_A
        cx=c*CELL_W+CELL_W//2; baseline=r*CELL_H+int(CELL_H*(BASE_FRAC-lift))
        atlas.alpha_composite(rp,(cx-ax, baseline-foot))
    atlas.save(OUT)
    print('wrote',OUT,atlas.size,'refh',{k:round(v) for k,v in refh.items()})
    prev=Image.new('RGBA',atlas.size,(20,22,40,255)); prev.alpha_composite(atlas)
    prev.convert('RGB').save(OUT.replace('.png','_preview.png'))

main()
