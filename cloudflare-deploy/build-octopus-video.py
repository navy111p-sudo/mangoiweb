"""
망고아이 3D 배틀 문어 보스 — 그린스크린 클레이 문어(빨간 복싱글러브) 실사 영상 → public/octopus-boss.mp4
원본: game_image/hf_20260708_105407_*.mp4 (1280x720, 24fps, 10s). 문어가 링 안을 좌우로 배회(머리중심 410~841px)하며 복싱.
목표(사용자: "자연스럽게·부드럽게·실사에 가깝게"): 원본 클레이 모션(펀치/촉수/몸흔들)은 전부 살리고, 창피한 좌우
      '슬라이딩 배회'만 제거 → 매 프레임 **머리 중심 x·발 y 를 고정**해 '제자리 복싱' 으로 재정렬. 배경은 게임
      셰이더가 다시 키잉하므로 균일 그린 캔버스면 됨. 이음매 없는 루프는 합성후 프레임 유사도로 최적 (i,j) 구간 탐색.
출력 1120x740 / 24fps h264 yuv420p. 게임쪽 BOSS_SKINS.octopus 에 video/vw/vh/H0/feetFrac... 추가 + attachBossVideo(trex와 동일).
실행: pip install pillow numpy scipy + ffmpeg PATH.
"""
import numpy as np, glob, os, subprocess, tempfile
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

D='C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'
SRCVIDEO=D+'game_image/hf_20260708_105407_7a37f07c-ee52-4987-a906-0fd69ff88e6d.mp4'
OUT=D+'public/octopus-boss.mp4'
CW,CH=1120,740
CX=500              # 캔버스상 머리중심 목표 x (좌442/우538 펀치 여유: 좌500·우620)
FY=712             # 캔버스상 접지 발 목표 y (feetFrac=712/740=0.962)
GREEN=np.array([80,176,58],np.float32)   # 균일 크로마키 배경(게임 셰이더가 키잉)
FPS=24

def body_mask(rgb):
    """그린 키 → 바닥/그림자/스튜디오모서리 제거한 '문어 본체' 불리언 마스크."""
    R,G,B=rgb[...,0],rgb[...,1],rgb[...,2]
    ex=G-np.maximum(R,B)
    fig=ex<14                                        # not-green (문어+바닥+그림자)
    fig[:2,:]=0;fig[-2:,:]=0;fig[:,:2]=0;fig[:,-2:]=0
    er=ndi.binary_erosion(fig,iterations=6)          # 발↔바닥 얇은 연결 끊기
    lbl,n=ndi.label(er); best=-1;bi=0
    for k in range(1,n+1):
        ys,xs=np.where(lbl==k)
        if len(ys)==0:continue
        up=(ys<430).sum()                            # 상단(머리/몸통)에 질량 큰 덩어리=문어
        if up>best:best=up;bi=k
    body=ndi.binary_dilation(lbl==bi,iterations=7)&fig
    body=ndi.binary_fill_holes(ndi.binary_closing(body,iterations=3))
    return body

def matte(rgb,body):
    ex=rgb[...,1]-np.maximum(rgb[...,0],rgb[...,2])
    a=1.0-np.clip((ex-4)/22.0,0,1); a=a*body
    core=ndi.binary_erosion(body,iterations=3)        # 내부 초록반점 방지
    a=ndi.gaussian_filter(np.maximum(a,core.astype(np.float32)),0.6)
    return a

def anchors(fs):
    hx=[];fy=[]
    for f in fs:
        rgb=np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
        b=body_mask(rgb); ys,xs=np.where(b)
        if len(xs)<50: hx.append(np.nan);fy.append(np.nan);continue
        ymin,ymax=ys.min(),ys.max()
        band=ys<ymin+0.35*(ymax-ymin)                 # 상단35%=머리불룩
        hx.append(np.median(xs[band]) if band.sum()>20 else np.median(xs))
        fy.append(ymax)
    hx=np.array(hx);fy=np.array(fy)
    # nan 보간 + 가벼운 스무딩(매트 지터만 제거, 모션은 보존)
    def fill(a):
        idx=np.arange(len(a)); good=~np.isnan(a)
        a=np.interp(idx,idx[good],a[good]); return ndi.gaussian_filter1d(a,1.5)
    return fill(hx),fill(fy)

def compose(path,hx,fy):
    rgb=np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    body=body_mask(rgb); a=matte(rgb,body)
    dx=int(round(CX-hx)); dy=int(round(FY-fy))
    canvas=np.tile(GREEN,(CH,CW,1)); H,W,_=rgb.shape
    dsx0=max(0,dx);dsx1=min(CW,dx+W);ssx0=dsx0-dx;ssx1=ssx0+(dsx1-dsx0)
    dsy0=max(0,dy);dsy1=min(CH,dy+H);ssy0=dsy0-dy;ssy1=ssy0+(dsy1-dsy0)
    al=a[ssy0:ssy1,ssx0:ssx1][...,None]
    canvas[dsy0:dsy1,dsx0:dsx1]=rgb[ssy0:ssy1,ssx0:ssx1]*al+canvas[dsy0:dsy1,dsx0:dsx1]*(1-al)
    out=Image.fromarray(np.clip(canvas,0,255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(1.6,80,2))
    return np.asarray(out)

def main(preview_only=False):
    tmp=tempfile.mkdtemp(); src=os.path.join(tmp,'src')
    os.makedirs(src)
    subprocess.run(['ffmpeg','-y','-i',SRCVIDEO,os.path.join(src,'f_%03d.png')],check=True,
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    fs=sorted(glob.glob(src+'/*.png'))
    hx,fy=anchors(fs)
    comp=[compose(fs[i],hx[i],fy[i]) for i in range(len(fs))]
    print('composed',len(comp),'frames')

    if preview_only:
        # 미리보기 콘택트시트(합성결과 확인)
        idxs=list(range(0,len(comp),12))[:20]
        thumb=[]
        for i in idxs:
            t=Image.fromarray(comp[i]).resize((224,148))
            thumb.append(np.asarray(t))
        cols=5; rows=(len(thumb)+cols-1)//cols
        sheet=np.full((rows*148,cols*224,3),40,np.uint8)
        for k,t in enumerate(thumb):
            r,c=divmod(k,cols); sheet[r*148:r*148+148,c*224:c*224+224]=t
        Image.fromarray(sheet).save(D+'octopus-compose-sheet.png')
        print('wrote preview sheet')
        return

    # 이음매 없는 루프: 앞구간(0..40) vs 뒤구간(끝-40..끝) 매트 유사도로 (i,j) 최소차 탐색
    small=[np.asarray(Image.fromarray(c).convert('L').resize((80,53)),np.float32) for c in comp]
    N=len(small)
    best=(1e18,0,N-1)
    for i in range(0,40):
        for j in range(N-40,N):
            if j-i<N*0.55: continue                    # 루프가 너무 짧지 않게
            d=np.abs(small[i]-small[j]).mean()
            if d<best[0]: best=(d,i,j)
    _,i0,j0=best
    print('loop frames %d..%d (len %d) diff=%.2f'%(i0,j0,j0-i0,best[0]))
    dst=os.path.join(tmp,'out'); os.makedirs(dst)
    for k,idx in enumerate(range(i0,j0)):
        Image.fromarray(comp[idx]).save(os.path.join(dst,'p_%03d.png'%k))
    subprocess.run(['ffmpeg','-y','-framerate',str(FPS),'-i',os.path.join(dst,'p_%03d.png'),
                    '-c:v','libx264','-crf','27','-preset','veryslow','-tune','animation',
                    '-pix_fmt','yuv420p','-movflags','+faststart',OUT],
                   check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    print('wrote',OUT,j0-i0,'frames @',FPS,'fps')

if __name__=='__main__':
    import sys
    main(preview_only=('--preview' in sys.argv))
