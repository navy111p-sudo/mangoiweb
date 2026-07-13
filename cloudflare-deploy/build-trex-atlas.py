"""
망고아이 티라노사우루스 보스 — 2개 그린스크린 시트 → trex-atlas.png (5x4, cell820x560, 16프레임)
 - walk 시트(ljfujr, 880x1188, 5줄 5/4/4/4/4): 걷기·달리기·도약·물기·일어섬
 - death 시트(gv6bm3, 1936x544, 3줄x7칸): 쓰러지는 사망(웅크림→무릎꺾임→누움)
원본 오른쪽 향함 → 게임에서 flip=true(왼쪽 히어로 보게). 여기선 미러 안 굽고 그대로.
프레임: 0~4 걷기(idle) · 5~8 달리기(돌진) · 9~10 도약 · 11 물기 · 12 일어섬(피격) · 13~15 사망(웅크림→무릎→누움)
갈색 공룡 on 초록 → 키 쉬움. 시트별 공통스케일(서있는 걷기 기준). 얇은 발/꼬리 보존+UnsharpMask.
"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

D='C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'
OUT=D+'public/trex-atlas.png'

SHEETS={
 # ⚠공룡이 셀 가장자리까지 꽉 차게 그려짐(주둥이·꼬리가 x=0/x=끝에 닿음) → ins 크게 자르면 잘림. ins 최소로 두고 검은 격자선은 키(near-black)로 제거.
 'walk' : {'path':D+'game_image/Gemini_Generated_Image_ljfujrljfujrljfu.png', 'ncols':[5,4,4,4,4], 'ins':2},
 'death': {'path':D+'game_image/Gemini_Generated_Image_gv6bm3gv6bm3gv6b.png', 'ncols':[7,7,7],     'ins':4},
}
# (sheet,row,col) 읽기 매핑
FRAMES=[
 ('walk',0,0),('walk',0,1),('walk',0,2),('walk',0,3),('walk',0,4),   # 0~4 걷기(idle)
 ('walk',1,0),('walk',1,1),('walk',1,2),('walk',1,3),                 # 5~8 달리기(돌진)
 ('walk',2,0),('walk',2,2),                                           # 9~10 도약
 ('walk',3,0),                                                        # 11 물기(bite, 원본 frame15)
 ('walk',3,1),                                                        # 12 일어섬(rear, 원본 frame16, 피격)
 ('death',2,4),('death',2,5),('death',2,6),                           # 13~15 사망: 웅크림→무릎꺾임→누움
]
REFCELL={'walk':('walk',0,0), 'death':('death',2,0)}   # 각 시트의 '서있는 걷기' 기준

COLS_A,ROWS_A=5,4
CELL_W,CELL_H=820,600
STAND_FRAC=0.62   # 공룡 크게(셀 높이의 62%) — H(빌보드)와 곱해 화면에서 크게. 머리/꼬리 여유는 유지
BASE_FRAC=0.955

IMGS={}
def load():
    for k,v in SHEETS.items():
        IMGS[k]=np.asarray(Image.open(v['path']).convert('RGB')).astype(np.float32)

def despill(rgb):
    out=rgb.copy(); mx=np.maximum(out[...,0],out[...,2])
    out[...,1]=np.minimum(out[...,1], mx+8)
    return out

def punch(rgb):
    x=np.clip(rgb,0,255)/255.0
    lum=(0.299*x[...,0]+0.587*x[...,1]+0.114*x[...,2])[...,None]
    x=lum+(x-lum)*1.22           # 채도↑ (진하게)
    x=(x-0.5)*1.14+0.5           # 대비↑
    x=x-0.035                    # 살짝 어둡게 → 깊은 갈색
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
    mx=np.maximum(np.maximum(R,G),Bc)
    green=(excess>50)&(G>118)
    h,w=mx.shape; bt,bs=13,5
    edge=np.zeros((h,w),bool); edge[:bt,:]=True; edge[-bs:,:]=True; edge[:,:bs]=True; edge[:,-bs:]=True   # 위 격자선은 달리기 프레임 머리와 붙어 잘 안 지워져 밴드 넉넉히(13px)
    border=edge & (mx<52)                  # ⚠어두운 격자선만 제거 — 공룡 주둥이/꼬리/발/머리는 색이 있어(mx≥52) 가장자리에 닿아도 보존
    bg=green | (mx<20) | border
    fig=~bg
    fig=largest8(fig)                      # 팽창 없이 largest 먼저 — 격자선 조각이 머리에 붙어 딸려오지 않게(위쪽 검은 바 방지)
    fig=ndi.binary_fill_holes(fig)
    fig=fill_small_holes(fig,9000)
    fig=largest8(fig)
    a=ndi.gaussian_filter(fig.astype(np.float32),0.55)
    return np.clip(a,0,1)

def cell_rgb(sheet,row,col):
    A=IMGS[sheet]; H,W,_=A.shape
    spec=SHEETS[sheet]; nrows=len(spec['ncols']); ncol=spec['ncols'][row]; ins=spec['ins']
    cw=W/ncol; rh=H/nrows
    x0=int(col*cw); x1=int((col+1)*cw); y0=int(row*rh); y1=int((row+1)*rh)
    return A[y0+ins:y1-ins, x0+ins:x1-ins].copy()

def piece(sheet,row,col):
    raw=cell_rgb(sheet,row,col)
    a=key_green(raw); rgb=punch(despill(raw))
    m=largest8(a>0.3); a=a*m               # ⚠최종적으로 가장 큰 덩어리(공룡)만 남김 → 위쪽 떠있는 격자선/먼지줄/흰점 확실히 제거
    a[:3,:]=0; a[-3:,:]=0; a[:,:3]=0; a[:,-3:]=0
    ys,xs=np.where(a>0.2)
    if len(ys)==0: return None,None
    y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    return rgb[y0:y1,x0:x1], a[y0:y1,x0:x1]

def main():
    load()
    refh={}
    for k,(s,r,c) in REFCELL.items():
        _,ca=piece(s,r,c); refh[k]=ca.shape[0]
    target=CELL_H*STAND_FRAC
    atlas=Image.new('RGBA',(COLS_A*CELL_W,ROWS_A*CELL_H),(0,0,0,0))
    maxw=0
    for idx,(sheet,row,col) in enumerate(FRAMES):
        crgb,ca=piece(sheet,row,col)
        if crgb is None: continue
        scale=target/refh[sheet]; ph,pw=ca.shape
        nw,nh=max(1,int(pw*scale)),max(1,int(ph*scale)); maxw=max(maxw,nw)
        rp=Image.fromarray(np.dstack([crgb,ca*255]).astype(np.uint8),'RGBA').resize((nw,nh),Image.LANCZOS)
        rp=rp.filter(ImageFilter.UnsharpMask(radius=2.2, percent=140, threshold=2))
        na=np.asarray(rp)[:,:,3]
        ax=nw//2   # ⚠걷기 프레임 흔들림 방지 = 실루엣 bbox 가로중앙 앵커(발 무게중심 아님). 몸통이 제자리 유지 → 잔상/점프 없음
        yb=np.where(na.max(1)>40)[0]; foot=int(yb.max()) if len(yb)>0 else nh-1
        c=idx%COLS_A; r=idx//COLS_A
        cx=c*CELL_W+CELL_W//2; baseline=r*CELL_H+int(CELL_H*BASE_FRAC)
        px=cx-ax; py=baseline-foot
        px=max(c*CELL_W+4, min(px, (c+1)*CELL_W-nw-4))
        py=max(r*CELL_H+4, min(py, (r+1)*CELL_H-nh-4))
        atlas.alpha_composite(rp,(px, py))
    atlas.save(OUT)
    print('wrote',OUT,atlas.size,'refh',{k:round(v) for k,v in refh.items()},'maxframe_w',maxw,'cellW',CELL_W)
    prev=Image.new('RGBA',atlas.size,(30,26,54,255)); prev.alpha_composite(atlas)
    prev.convert('RGB').save(OUT.replace('.png','_preview.png'))

main()
