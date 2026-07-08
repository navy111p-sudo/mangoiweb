"""
망고아이 3D 배틀 티라노 보스 — 그린스크린 원본 → public/trex-walk.mp4 (다양한 동작 인플레이스 루프)
원본: game_image/hf_20260708_094451_*.mp4 (1280x720, 24fps, 왼쪽으로 걸어 지나감 = 화면 가로질러 이동)

문제(구버전): 전체 몸(머리~꼬리)이 다 보이는 구간이 두 군데뿐이라 그중 한 구간(228~240)만 써서 앞뒤로 핑퐁 →
      실제로는 '반보 걷다 되감기'라 동작이 단조롭고 한 방향만 하는 것처럼 보임(사용자 지적).

해결(현버전): 원본에는 서로 다른 '풀바디 동작' 구간이 2개 있다 —
      · WIN_WALK 224~240 : 입 다물고 성큼 걷기(공룡이 크게·가까이)
      · WIN_ROAR 106~118 : 입 크게 벌려 포효하며 걷기(공룡이 작게·멀리)
      두 구간은 카메라 거리가 달라 크기가 다르므로, **프레임마다 몸 폭을 TARGET_W로 등비정규화**하고
      코끝(snout)+발(feet)을 캔버스 고정좌표에 맞춰 얹으면 둘 다 '같은 크기·같은 자리 제자리 동작'이 된다.
      시퀀스 = 걷기 → (크로스페이드) → 포효 → (크로스페이드) → 걷기 로 이어 **한 방향 전진 루프**(핑퐁 아님).
      이음매는 짧은 디졸브로 가려 매끄럽게 반복. → 걷기+포효 두 동작이 번갈아 나와 훨씬 생동감 있음.

폭을 정확히 TARGET_W(=CW*dinoWFrac)로 정규화하므로 게임쪽 dinoWFrac 가드가 실측과 일치 → 넓은 화면서
      꼬리가 잘리던 문제도 해소. 배경은 게임 셰이더가 다시 키잉하므로 균일 그린이면 됨.
출력 1260x470 / ffmpeg 14fps h264 yuv420p. 게임쪽 BOSS_SKINS.trex(vw1260,vh470,H0,feetFrac,dinoWFrac,dinoHFrac) + attachBossVideo.
실행 전: pip install pillow numpy scipy + ffmpeg PATH.
"""
import numpy as np, glob, os, subprocess, tempfile
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

D='C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'
SRCVIDEO=D+'game_image/hf_20260708_094451_8898775f-c38d-48fb-b1f5-09da60290a02.mp4'
OUT=D+'public/trex-walk.mp4'
CW,CH=1260,470
SNOUT_X=56           # 캔버스상 코끝 목표 x
FEET_Y=452           # 캔버스상 접지 발 목표 y (feetFrac=452/470=0.962)
TARGET_W=1150        # 정규화된 공룡 몸 폭(머리~꼬리). dinoWFrac=1150/1260=0.913 과 일치
GREEN=np.array([80,176,58],np.float32)   # 균일 크로마키 배경
PAD=6
WIN_WALK=list(range(224,241))   # 입 다물고 걷기(풀바디)
WIN_ROAR=list(range(106,119))   # 입 벌려 포효하며 걷기(풀바디)
XF=0                            # 하드컷. 걷기(입다뭄)↔포효(입벌림) 포즈차가 커서 크로스페이드 시 이중상 고스트 → 0으로 안섞음(액션 전환처럼 스냅)

def body_and_matte(rgb):
    R,G,B=rgb[...,0],rgb[...,1],rgb[...,2]
    ex=G-np.maximum(R,B)
    figure=ex<10                                     # not-green (공룡+바닥+그림자)
    figure[:2,:]=0;figure[-2:,:]=0;figure[:,:2]=0;figure[:,-2:]=0
    er=ndi.binary_erosion(figure,iterations=7)       # 발↔바닥 얇은 연결 끊기
    lbl,n=ndi.label(er); best=-1;bi=0
    for k in range(1,n+1):
        ys,_=np.where(lbl==k)
        if len(ys)==0:continue
        up=(ys<430).sum()                            # 상단(등/머리)에 질량 큰 덩어리=공룡(바닥은 하단만)
        if up>best:best=up;bi=k
    body=ndi.binary_dilation(lbl==bi,iterations=8)&figure
    body=ndi.binary_fill_holes(ndi.binary_closing(body,iterations=3))
    a=1.0-np.clip((ex-4)/22.0,0,1); a=a*body
    core=ndi.binary_erosion(body,iterations=3)        # 배(belly) 내부 초록 반점 방지: 확실 내부는 불투명
    a=ndi.gaussian_filter(np.maximum(a,core.astype(np.float32)),0.6)
    return body,a

def compose(path):
    """한 프레임: 공룡 폭을 TARGET_W로 등비정규화 + 코끝·발 고정좌표에 얹어 균일 그린 캔버스 반환."""
    rgb=np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    body,a=body_and_matte(rgb); ys,xs=np.where(body)
    x0,x1,y0,y1=int(xs.min()),int(xs.max()),int(ys.min()),int(ys.max())
    sc=TARGET_W/float(x1-x0)                           # 몸 폭 → TARGET_W 등비스케일
    # 공룡 영역만 잘라(패드 포함) 알파와 함께 스케일
    cx0=max(0,x0-PAD);cy0=max(0,y0-PAD);cx1=min(rgb.shape[1],x1+PAD);cy1=min(rgb.shape[0],y1+PAD)
    fg=Image.fromarray(np.clip(rgb[cy0:cy1,cx0:cx1],0,255).astype(np.uint8))
    al=Image.fromarray(np.clip(a[cy0:cy1,cx0:cx1]*255,0,255).astype(np.uint8))
    nw,nh=max(1,round((cx1-cx0)*sc)),max(1,round((cy1-cy0)*sc))
    fg=fg.resize((nw,nh),Image.LANCZOS); al=al.resize((nw,nh),Image.LANCZOS)
    # 붙일 위치: (원본 코끝 x0)*sc → SNOUT_X, (원본 발 y1)*sc → FEET_Y  (크롭 오프셋 보정)
    px=int(round(SNOUT_X-(x0-cx0)*sc)); py=int(round(FEET_Y-(y1-cy0)*sc))
    canvas=Image.fromarray(np.tile(GREEN,(CH,CW,1)).astype(np.uint8))
    canvas.paste(fg,(px,py),al)
    out=canvas.filter(ImageFilter.UnsharpMask(1.6,90,2))
    return np.asarray(out).astype(np.float32)

def main():
    tmp=tempfile.mkdtemp(); src=os.path.join(tmp,'src'); dst=os.path.join(tmp,'out')
    os.makedirs(src);os.makedirs(dst)
    subprocess.run(['ffmpeg','-y','-i',SRCVIDEO,os.path.join(src,'f_%03d.png')],check=True)
    fs=sorted(glob.glob(src+'/*.png'))
    walk=[compose(fs[i]) for i in WIN_WALK]
    roar=[compose(fs[i]) for i in WIN_ROAR]
    def xfade(a,b,n):                                  # a→b 선형 디졸브 n프레임(양끝 제외)
        return [a*(1-t)+b*t for t in np.linspace(0,1,n+2)[1:-1]]
    # 한 방향 전진 루프: 걷기 → 포효 → (다시 걷기 시작으로) . 이음매는 크로스페이드로 매끄럽게.
    seq=walk + xfade(walk[-1],roar[0],XF) + roar + xfade(roar[-1],walk[0],XF)
    hmax=0
    for i,fr in enumerate(seq):
        img=np.clip(fr,0,255).astype(np.uint8)
        # 동작 높이 실측(dinoHFrac 산출용): 초록 아닌 픽셀의 세로 범위
        ex=img[...,1].astype(int)-np.maximum(img[...,0],img[...,2]).astype(int)
        yy=np.where((ex<10).any(axis=1))[0]
        if len(yy): hmax=max(hmax,yy.max()-yy.min())
        Image.fromarray(img).save(os.path.join(dst,'p_%03d.png'%i))
    subprocess.run(['ffmpeg','-y','-framerate','14','-i',os.path.join(dst,'p_%03d.png'),
                    '-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',OUT],check=True)
    print('wrote',OUT,len(seq),'frames  dinoHFrac~=%.3f'%(hmax/float(CH)))

if __name__=='__main__':
    main()
