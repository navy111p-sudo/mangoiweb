"""
망고아이 문어 보스(클레이) — 그린스크린 시트 20+프레임 '전부' 사용 → boss-atlas.png (5x5, cell680x600, 21프레임)
battle-3d.html attachBossSprite 상태머신용. 풍부한 idle(팔 흔들+다리 벌림/스텝) + 공격/피격/소멸.
개선점(사용자 요청):
 - 팔/다리 안 잘리게: 셀 크게 + 침식(erosion) 제거로 얇은 촉수 보존 + 여유 스케일
 - 또렷하게: UnsharpMask 샤프닝
 - 장갑 글러브: 분홍→진한 빨강(입체감 위해 원래 명암은 유지)
"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

D='C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'
SRC=D+'Gemini_Generated_Image_nbs417nbs417nbs4.png'
OUT=D+'public/boss-atlas.png'

IMGW,IMGH=880,1188
ROWH=IMGH/5.0
NCOLS=[5,4,4,4,4]      # 1줄=5칸, 2~5줄=4칸
INS=16

# 21셀 전부 읽기 순서: (row,col). idx = 순서.
CELLS=[]
for row in range(5):
    for col in range(NCOLS[row]):
        CELLS.append((row,col))
# idx map:
# 0-4  R1C0-4 idle(정면, 다리 벌림 미세변화)
# 5-8  R2C0-3 스텝/3-4뷰, 한팔 뻗음(다리 스텝)
# 9-12 R3C0-3 정면 넓은 스탠스(다리 크게 벌림)
# 13-16 R4C0-3 양팔 위로(팔 흔들)
# 17-20 R5C0-3 팔올림→몸말기→공(소멸)

COLS_A,ROWS_A=5,5
CELL_W,CELL_H=680,600
STAND_FRAC=0.62        # idle 기준(팔 올린 프레임이 커도 셀 안에 다 들어오게 여유)
BASE_FRAC=0.965

def despill(rgb):
    out=rgb.copy(); mx=np.maximum(out[...,0],out[...,2])
    out[...,1]=np.minimum(out[...,1], mx+8)
    return out

def red_gloves(rgb):
    """분홍 글러브 → 진한 빨강. 원래 픽셀 명암(luminance)을 유지해 입체감 보존."""
    x=rgb.copy()
    R,G,B=x[...,0],x[...,1],x[...,2]
    # 분홍/살구빛: 붉은기 뚜렷(R>G,R>B) & 초록몸통 아님 & 눈(무채색) 아님 & 너무 어둡지 않음
    pink=(R>G+18)&(R>B-4)&(R>105)&(G>55)&(B>45)&(R.astype(np.float32)-G>14)
    L=(0.30*R+0.59*G+0.11*B)/255.0          # 0..1 원래 밝기
    L=np.clip(L*1.12,0,1)
    newR=np.clip(L*1.15+0.14,0,1)*255.0      # 하이라이트=밝은 빨강
    newG=np.clip(L*0.24,0,1)*255.0           # 그림자=짙은 빨강
    newB=np.clip(L*0.20,0,1)*255.0
    out=x.copy()
    out[...,0]=np.where(pink,newR,x[...,0])
    out[...,1]=np.where(pink,newG,x[...,1])
    out[...,2]=np.where(pink,newB,x[...,2])
    return out

def punch(rgb):
    x=np.clip(rgb,0,255)/255.0
    lum=(0.299*x[...,0]+0.587*x[...,1]+0.114*x[...,2])[...,None]
    x=lum+(x-lum)*1.16           # 채도↑
    x=(x-0.5)*1.08+0.5           # 대비↑
    return np.clip(x,0,1)*255.0

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
    bg=(excess>66)&(G>148)               # 순수 스크린 초록만
    fig=~bg
    fig=largest8(fig)
    fig=ndi.binary_dilation(fig,iterations=1)   # 얇은 촉수 끝 살림(끊김 방지)
    fig=ndi.binary_fill_holes(fig)              # 몸통 초록비늘 구멍 완전 메움
    fig=fill_small_holes(fig,8000)
    fig=largest8(fig)
    # 침식 없음 — 얇은 팔/다리 보존. 약한 feather만.
    a=ndi.gaussian_filter(fig.astype(np.float32),0.55)
    return np.clip(a,0,1)

def cell_rgb(row,col):
    ncol=NCOLS[row]; cw=IMGW/ncol
    x0=int(col*cw); x1=int((col+1)*cw); y0=int(row*ROWH); y1=int((row+1)*ROWH)
    return IMG[y0+INS:y1-INS, x0+INS:x1-INS].copy()

def piece(row,col):
    raw=cell_rgb(row,col)
    a=key_green(raw)
    rgb=punch(red_gloves(despill(raw)))
    a[:5,:]=0; a[-5:,:]=0; a[:,:5]=0; a[:,-5:]=0
    ys,xs=np.where(a>0.2)
    if len(ys)==0: return None,None
    y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    return rgb[y0:y1,x0:x1], a[y0:y1,x0:x1]

def main():
    global IMG
    IMG=np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
    _,ca0=piece(*CELLS[0]); refh=ca0.shape[0]
    scale=(CELL_H*STAND_FRAC)/refh
    atlas=Image.new('RGBA',(COLS_A*CELL_W,ROWS_A*CELL_H),(0,0,0,0))
    for idx,(row,col) in enumerate(CELLS):
        crgb,ca=piece(row,col)
        if crgb is None: continue
        ph,pw=ca.shape
        nw,nh=max(1,int(pw*scale)),max(1,int(ph*scale))
        rp=Image.fromarray(np.dstack([crgb,ca*255]).astype(np.uint8),'RGBA').resize((nw,nh),Image.LANCZOS)
        rp=rp.filter(ImageFilter.UnsharpMask(radius=2.4, percent=145, threshold=2))   # 또렷하게
        na=np.asarray(rp)[:,:,3]
        cut=int(nh*0.80); low=na[cut:]; yy,xx=np.where(low>40)
        ax=int(xx.mean()) if len(xx)>0 else nw//2
        yb=np.where(na.max(1)>40)[0]; foot=int(yb.max()) if len(yb)>0 else nh-1
        c=idx%COLS_A; r=idx//COLS_A
        cx=c*CELL_W+CELL_W//2; baseline=r*CELL_H+int(CELL_H*BASE_FRAC)
        # 셀 밖으로 삐져나가면 안쪽으로 클램프(팔 잘림 방지)
        px=cx-ax; py=baseline-foot
        px=max(c*CELL_W+4, min(px, (c+1)*CELL_W-nw-4))
        py=max(r*CELL_H+4, min(py, (r+1)*CELL_H-nh-4))
        atlas.alpha_composite(rp,(px, py))
    atlas.save(OUT)
    print('wrote',OUT,atlas.size,'refh',round(refh),'scale',round(scale,3),'frames',len(CELLS))
    prev=Image.new('RGBA',atlas.size,(30,26,54,255)); prev.alpha_composite(atlas)
    prev.convert('RGB').save(OUT.replace('.png','_preview.png'))

main()
