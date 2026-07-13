"""
망고아이 우주 강아지 파이터 (카툰) — 5개 그린스크린 시트(각 3x2) -> dog-atlas.png (5x5, cell540x500, 22프레임)
astro-atlas 와 '동일한 22프레임 레이아웃'으로 구워 battle-3d.html 의 attachSpriteBillboard 상태머신을 그대로 재사용.
그린스크린 키잉(despill은 키잉 후에만). 발끝 바닥접지 + 공중(날아차기)은 lift 로 띄움. 시트별 방향 불일치 → 프레임별 flip 으로 전부 오른쪽(보스) 향하게 통일.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

D='C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'
OUT=D+'public/dog-atlas.png'

# 셀 인덱스 = row*3 + col  (0~2 윗줄, 3~5 아랫줄)
SHEETS={  # 원본은 game_image/ 보관
 'combatB':D+'game_image/Gemini_Generated_Image_8kx3v48kx3v48kx3.png',  # 0 AggressiveStance,1 ReadyToLunge,2 KickingGuard,3 HighBlock,4 Dodge&Counter,5 HeavyStrike
 'combatA':D+'game_image/Gemini_Generated_Image_unat1junat1junat.png',  # 0 AggressiveStance,1 ReadyToLunge,2 KickingGuard,3 HighBlock,4 Dodge&Counter,5 Stagger&Collapse
 'kick'   :D+'game_image/Gemini_Generated_Image_urt8tburt8tburt8.png',  # 0 VSign,1 FistPump,2 Flag,3 ChestThump,4 FrontKickStance,5 RoundhouseKickImpact
 'vkick'  :D+'game_image/Gemini_Generated_Image_ovuzwwovuzwwovuz.png',  # 0 VSign,1 FistPump,2 Flag,3 ChestThump,4 FrontKickImpact,5 TrophyTriumph
 'victory':D+'game_image/Gemini_Generated_Image_ktnsg5ktnsg5ktns.png',  # 0 VSign,1 FistPump,2 Flag,3 ChestThump,4 Explorer'sBoast,5 FinalBow
}
GRID={'cols':3,'rows':2}
REFCELL={'combatB':3,'combatA':3,'kick':0,'vkick':0,'victory':0}  # 서있는 기준(HighBlock/VSign)

# (sheet, cell, flip, lift)  flip=True 면 좌우반전. 전부 오른쪽(보스) 향하게 통일.
# 원본 자연방향: Aggressive=우, HeavyStrike=좌, KickingGuard=우, HighBlock=좌, FrontKick=좌, Roundhouse=우, Lunge=우, Dodge=우, Stagger=우, 승리=정면
FRAMES=[
 ('combatB',0,False,0),    #0 idle guard A (AggressiveStance) → 우
 ('combatA',0,False,0),    #1 idle guard B (AggressiveStance 미세변주) → 우
 ('combatB',5,True ,0),    #2 punch strike (HeavyStrike) 좌→우
 ('combatB',2,False,0),    #3 kick chamber (KickingGuard) → 우
 ('kick',4,True ,0),       #4 kick extend (FrontKickStance) 좌→우
 ('kick',5,False,0),       #5 kick peak (RoundhouseKickImpact) → 우
 ('combatA',2,False,0),    #6 kick retract (KickingGuard) → 우
 ('combatB',1,False,0),    #7 flying crouch load (ReadyToLunge) → 우
 ('combatA',1,False,0.15), #8 flying launch (ReadyToLunge, 뜸)
 ('kick',5,False,0.25),    #9 flying extend (RoundhouseKick, 제일 높이)
 ('kick',4,True ,0.11),    #10 flying descend (FrontKick) 좌→우
 ('combatA',0,False,0),    #11 flying land (AggressiveStance) → 우
 ('combatB',4,False,0),    #12 hit body flinch (Dodge&Counter) → 우
 ('combatA',4,False,0),    #13 hit head snap (Dodge&Counter) → 우
 ('combatA',5,False,0),    #14 death stagger (Stagger&Collapse) → 우
 ('combatB',1,False,0),    #15 dash push off (ReadyToLunge) → 우
 ('combatA',1,False,0),    #16 dash stride (ReadyToLunge) → 우
 ('combatB',5,True ,0),    #17 dash strike (HeavyStrike) 좌→우
 ('victory',1,False,0),    #18 victory fist pump (FistPump)
 ('victory',0,False,0),    #19 victory v-sign (VSign)
 ('vkick',5,False,0),      #20 victory trophy (TrophyTriumph 트로피 세리머니)
 ('combatB',3,True ,0),    #21 high guard block (HighBlock) 좌→우
]
COLS_A,ROWS_A=5,5
CELL_W,CELL_H=540,500
STAND_FRAC=0.80
BASE_FRAC=0.975

def despill(rgb):
    out=rgb.copy(); mx=np.maximum(out[...,0],out[...,2])
    out[...,1]=np.minimum(out[...,1], mx+6)
    return out

def metalize(rgb):
    """우주복을 '메탈(강철)' 느낌으로 — 대비 강화(그림자 깊게)+살짝 어둡게(너무 하얌 방지)+차가운 스틸 색조+약한 채도감소(브러시드 메탈)."""
    x=np.clip(rgb,0,255)/255.0
    x=(x-0.5)*1.30+0.5            # 대비↑ → 갑옷 굴곡/그림자 뚜렷(플라스틱→금속)
    x=x-0.045                     # 전체 살짝 다운 → 하얀 느낌 제거
    x=np.clip(x,0,1)
    lum=(0.299*x[...,0]+0.587*x[...,1]+0.114*x[...,2])[...,None]
    x=lum+(x-lum)*0.86            # 채도 살짝↓ → 무채색 스틸
    x=x*np.array([0.955,0.985,1.075],np.float32)   # 차가운 청록빛 스틸 색조
    return np.clip(x,0,1)*255.0

def clarity(rgb):
    """확대 후 선명화: 언샵마스크 + 하이라이트 광택(스펙큘러 펀치). 저해상 원본 1.4x 확대로 생긴 뿌연 느낌 제거."""
    x=np.clip(rgb,0,255)/255.0
    blur=ndi.gaussian_filter(x,sigma=(1.5,1.5,0))
    x=np.clip(x+0.9*(x-blur),0,1)                      # unsharp mask
    x=np.clip(x+0.12*np.maximum(x-0.70,0)/0.30,0,1)    # 밝은 부분만 광택↑ → 금속 반사감
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
    fig=fill_small_holes(fig,2200)
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
    ins=14
    return A[y0+ins:y1-ins, x0+ins:x1-ins].copy()

def piece(A,cell,flip):
    raw=cell_rgb(A,cell)
    a=key_green(raw); rgb=metalize(despill(raw))   # 키잉은 원본으로, 색보정(메탈)은 despill 후 rgb에만
    a[:66,:]=0    # 상단 라벨 텍스트 제거(강아지 시트 라벨이 큼)
    a[-8:,:]=0
    a[:,:6]=0; a[:,-6:]=0
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
        arr=np.asarray(rp).astype(np.float32)   # 확대 후 선명화(확대 전은 다시 뭉개짐)
        erg=clarity(arr[...,:3])
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
