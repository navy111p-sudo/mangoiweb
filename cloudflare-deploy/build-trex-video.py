"""
망고아이 3D 배틀 티라노 보스 — 그린스크린 원본 → public/trex-walk.mp4 (제자리 다동작 루프, 걷기+포효)
원본: game_image/hf_20260708_094451_*.mp4 (1280x720, 24fps, 왼쪽으로 걸어 지나감)

⚠️ 매트(초록 제거) 정본 — 예전 버전은 침식+연결성분 기반 바닥제거가 공룡 아래쪽(턱·배·다리·발)을
   거칠게 깎아먹고 초록 스필도 안 지워서, 게임 셰이더가 그 초록끼를 다시 키잉→아래가 잘려보였음.
   실측: ex=G-max(R,B) 가 배경/바닥초록=63~88, 공룡=음수(-8~-16) 로 **깔끔히 분리**됨(바닥도 초록이라 같이 제거).
   그래서 침식 없이 **부드러운 ex 그린키 + 최대덩어리(코너/주름 제거) + 작은구멍만 메움 + 디스필**만 하면
   다리 사이 틈은 살리고 실루엣(발톱·턱·배)은 온전한 깨끗한 매트가 나온다.

풀바디(머리~꼬리·발 전부 프레임 안) 구간 2곳만 사용 → 프레임별 몸폭을 TARGET_W로 정규화 + 코끝·발 고정 →
  둘 다 같은 크기·제자리. 걷기(224~240)→포효(106~118) 하드컷 전진루프(XF=0; 포즈차 커서 크로스페이드는 고스트).
출력 1260x470 / ffmpeg 14fps h264 yuv420p. 게임 BOSS_SKINS.trex(vw/vh/H0/feetFrac/dinoWFrac/dinoHFrac) + attachBossVideo 투영fit.
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
TARGET_W=1150        # 정규화 목표 몸 폭(머리~꼬리). dinoWFrac=1150/1260=0.913
TARGET_H=405         # 정규화 목표 높이 상한 — 포효(머리치켜듦+입벌림)가 커서 폭기준만 쓰면 머리가 캔버스 위로 잘림 → 높이도 제한(발452, 위 top≈47)
GREEN=np.array([80,176,58],np.float32)   # 균일 크로마키 배경
PAD=10
WIN_WALK=list(range(224,241))   # 걷기(풀바디)
WIN_ROAR=list(range(106,119))   # 포효(풀바디, 원경이라 작음→폭정규화로 맞춤)
XF=0                            # 하드컷

def largest(mask):
    lbl,n=ndi.label(mask)
    if n==0: return mask
    sz=ndi.sum(np.ones_like(lbl),lbl,range(1,n+1))
    return lbl==(1+int(np.argmax(sz)))

def fill_small(mask,maxa):
    filled=ndi.binary_fill_holes(mask); holes=filled&~mask
    lbl,n=ndi.label(holes); out=mask.copy()
    for i in range(1,n+1):
        c=lbl==i
        if c.sum()<maxa: out|=c   # 작은 내부 구멍(스펙클)만 메움 — 다리 사이 큰 틈은 유지
    return out

def matte(rgb):
    """깨끗한 알파: 초록(배경+바닥)만 제거, 공룡 실루엣(발·턱·배) 온전. 침식 안 함.
    ⚠️임계값 실측 근거: 배경/바닥 초록 ex=63~88(밝음), 공룡은 그늘진 다리가 바닥 초록 반사광을 받아도 ex<=27(어두움)
    → 갭(27~63) 한가운데 32~58 소프트키면 그늘다리 안 갉히고 배경만 제거. (예전 16~44는 그늘다리 ex19~27이 걸려 반투명=잘려보임)"""
    R,G,B=rgb[...,0],rgb[...,1],rgb[...,2]
    ex=G-np.maximum(R,B)
    lo,hi=32.0,58.0                     # ex<=32 공룡(불투명), ex>=58 초록(투명), 사이 부드럽게
    a=1.0-np.clip((ex-lo)/(hi-lo),0,1)
    a[:2,:]=0;a[-2:,:]=0;a[:,:2]=0;a[:,-2:]=0
    solid=largest(a>0.5)                # 최대 덩어리=공룡 (초록 코너/천주름/바닥 다 떨어져나감)
    solid=fill_small(solid,4000)
    a=a*ndi.binary_dilation(solid,iterations=3)   # 본체 주변만 남겨 멀리 있는 잔조각 제거(부드러운 가장자리 보존)
    a=ndi.gaussian_filter(a,0.6)
    return a,solid

def compose(path, tw=None):
    """한 프레임: 몸폭 tw(기본 TARGET_W) 정규화 + 코끝·발 고정 + 초록스필 제거(디스필) → 균일 그린 캔버스.
    tw 인자: 포효 세그먼트를 걷기와 '몸 크기'가 이어지게 축소할 때 사용(컷에서 덩치 점프 제거)."""
    if tw is None: tw=TARGET_W
    rgb=np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    a,solid=matte(rgb); ys,xs=np.where(solid)
    x0,x1,y0,y1=int(xs.min()),int(xs.max()),int(ys.min()),int(ys.max())
    sc=min(tw/float(x1-x0), TARGET_H/float(y1-y0))   # 폭·높이 둘 다 안 넘게(포효 머리 안 잘림)
    R,G,B=rgb[...,0],rgb[...,1],rgb[...,2]
    Gd=np.minimum(G,np.maximum(R,B)+12.0)          # 디스필: 공룡 초록끼 제거. +12 → 최종 ex<=12(게임 keyLo ex≈25.5 미만)라 게임 셰이더가 절대 못 깎음(그늘다리 반투명 방지)
    rgbd=np.dstack([R,Gd,B])
    cx0=max(0,x0-PAD);cy0=max(0,y0-PAD);cx1=min(rgb.shape[1],x1+PAD);cy1=min(rgb.shape[0],y1+PAD)
    nw,nh=max(1,round((cx1-cx0)*sc)),max(1,round((cy1-cy0)*sc))
    fg=Image.fromarray(np.clip(rgbd[cy0:cy1,cx0:cx1],0,255).astype(np.uint8)).resize((nw,nh),Image.LANCZOS)
    al=Image.fromarray(np.clip(a[cy0:cy1,cx0:cx1]*255,0,255).astype(np.uint8)).resize((nw,nh),Image.LANCZOS)
    px=int(round(SNOUT_X-(x0-cx0)*sc)); py=int(round(FEET_Y-(y1-cy0)*sc))
    canvas=Image.fromarray(np.tile(GREEN,(CH,CW,1)).astype(np.uint8))
    canvas.paste(fg,(px,py),al)
    return np.asarray(canvas.filter(ImageFilter.UnsharpMask(1.4,80,2))).astype(np.float32)

def solidmask(fr):
    """게임 셰이더 기준 불투명 실루엣(포즈 비교용)."""
    ex=(fr[...,1]-np.maximum(fr[...,0],fr[...,2]))/255.0
    t=np.clip((ex-0.10)/(0.34-0.10),0,1)
    return (1-(t*t*(3-2*t)))>0.5

def iou(a,b):
    i=(a&b).sum(); u=(a|b).sum()
    return i/float(u) if u else 0.0

def interp42(tmp,name,frames,fps=14):
    """프레임 리스트 → 42fps 모션보간 mp4(무손실 중간본). 세그먼트 내부만 보간."""
    d=os.path.join(tmp,name); os.makedirs(d,exist_ok=True)
    for i,fr in enumerate(frames):
        Image.fromarray(np.clip(fr,0,255).astype(np.uint8)).save(os.path.join(d,'p_%03d.png'%i))
    raw=os.path.join(tmp,name+'_raw.mp4'); out=os.path.join(tmp,name+'_42.mp4')
    subprocess.run(['ffmpeg','-y','-framerate',str(fps),'-i',os.path.join(d,'p_%03d.png'),
                    '-c:v','libx264','-qp','0','-pix_fmt','yuv444p',raw],check=True)
    subprocess.run(['ffmpeg','-y','-i',raw,'-vf',"minterpolate=fps=42:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
                    '-c:v','libx264','-qp','0','-pix_fmt','yuv444p',out],check=True)
    return out

def dur(p):
    r=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',p],capture_output=True,text=True)
    s=r.stdout.strip()
    if s and s!='N/A':
        try: return float(s)
        except: pass
    # 일부 무손실 중간본은 duration=N/A → 프레임 수/42 로 계산
    r=subprocess.run(['ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','csv=p=0',p],capture_output=True,text=True)
    return int(r.stdout.strip())/42.0

def main():
    tmp=tempfile.mkdtemp(); src=os.path.join(tmp,'src'); os.makedirs(src)
    subprocess.run(['ffmpeg','-y','-i',SRCVIDEO,os.path.join(src,'f_%03d.png')],check=True)
    fs=sorted(glob.glob(src+'/*.png'))
    walk=[compose(fs[i]) for i in WIN_WALK]
    wm=[solidmask(f) for f in walk]
    # 🎚️ 크기 매칭: 포효 구간은 원본서 공룡이 멀리(작게) 찍혀 폭정규화하면 걷기보다 덩치가 커짐 →
    #    컷에서 몸이 훅 커지며 '머리 들 때 부자연' 유발. 포효 스케일 s를 걷기 끝프레임과 실루엣 IoU 최대로 탐색.
    best=(0,1.0,len(walk)-1)
    for s in [0.70,0.74,0.78,0.82,0.86,0.90,0.94,0.98,1.02]:
        r0=solidmask(compose(fs[WIN_ROAR[0]],TARGET_W*s))
        for i in range(max(0,len(walk)-6),len(walk)):
            v=iou(wm[i],r0)
            if v>best[0]: best=(v,s,i)
    bestIoU,S_ROAR,wi=best
    roar=[compose(fs[i],TARGET_W*S_ROAR) for i in WIN_ROAR]
    rm=[solidmask(f) for f in roar]
    rj=max(range(max(0,len(roar)-6),len(roar)), key=lambda j:iou(rm[j],wm[0]))
    walk=walk[:wi+1]; roar=roar[:rj+1]
    print('scale-matched: roar x%.2f  cut walk@%d(IoU %.2f) roar@%d(IoU %.2f)'%(S_ROAR,wi,bestIoU,rj,iou(rm[rj],wm[0])))
    # 🌉 모프 브릿지: A끝2+B첫2 '문맥 4프레임'을 14fps로 보간해 가운데 구간(1/14~2/14s) 프레임만 추출 = ~50ms 고속 전환.
    #    ⚠️2프레임만 입력하면 minterpolate가 빈 영상을 뱉음(concat서 조용히 빠져 v8 초기버그). 문맥 4프레임이 정답.
    #    브릿지 프레임은 내부 반투명(고스트) 검사 통과 시에만 포함 — 실패하면 자동으로 하드컷 유지.
    def bridge(name,A2,A1,B1,B2):
        p=interp42(tmp,name,[A2,A1,B1,B2])
        d=os.path.join(tmp,name+'_x'); os.makedirs(d,exist_ok=True)
        subprocess.run(['ffmpeg','-y','-i',p,os.path.join(d,'b_%03d.png')],check=True)
        bfs=sorted(glob.glob(d+'/b_*.png'))
        out=[]
        for k in range(4,6):                          # t=4/42,5/42 = A1(3/42)~B1(6/42) 사이 보간 프레임 2장
            if k>=len(bfs): break
            fr=np.asarray(Image.open(bfs[k]).convert('RGB')).astype(np.float32)
            m=solidmask(fr); core=ndi.binary_erosion(m,iterations=4)
            ex=(fr[...,1]-np.maximum(fr[...,0],fr[...,2]))/255.0
            t=np.clip((ex-0.10)/(0.34-0.10),0,1); alpha=1-(t*t*(3-2*t))
            if int((core&(alpha<0.9)).sum())>80:      # 고스트 → 브릿지 포기
                print('  bridge %s frame%d ghost -> skip bridge'%(name,k)); return []
            out.append(fr)
        print('  bridge %s: %d frames ok'%(name,len(out)))
        return out
    bA=bridge('bA',walk[-2],walk[-1],roar[0],roar[1])
    bB=bridge('bB',roar[-2],roar[-1],walk[0],walk[1])
    segs=[('walk',walk)]+([('bA',bA)] if bA else [])+[('roar',roar)]+([('bB',bB)] if bB else [])
    parts=[]
    for name,seg in segs:
        parts.append(interp42(tmp,name+'_seg',seg) if name in ('walk','roar') else None)
        if parts[-1] is None:   # 브릿지: 이미 42fps 프레임이라 보간 없이 무손실 인코딩만
            d=os.path.join(tmp,name+'_enc'); os.makedirs(d,exist_ok=True)
            for i,fr in enumerate(seg): Image.fromarray(np.clip(fr,0,255).astype(np.uint8)).save(os.path.join(d,'p_%03d.png'%i))
            pv=os.path.join(tmp,name+'_42.mp4')
            subprocess.run(['ffmpeg','-y','-framerate','42','-i',os.path.join(d,'p_%03d.png'),'-c:v','libx264','-qp','0','-pix_fmt','yuv444p',pv],check=True)
            parts[-1]=pv
    lst=os.path.join(tmp,'concat.txt')
    open(lst,'w').write(''.join("file '%s'\n"%p.replace('\\','/') for p in parts))
    subprocess.run(['ffmpeg','-y','-f','concat','-safe','0','-i',lst,
                    '-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',OUT],check=True)
    roarAt=dur(parts[0])+(len(bA)/42.0 if bA else 0.0)   # 게임 cfg.roarAt: 포효 세그먼트 시작 시각(초)
    hmax=0
    for fr in walk+roar:
        img=np.clip(fr,0,255).astype(np.uint8)
        ex=img[...,1].astype(int)-np.maximum(img[...,0],img[...,2]).astype(int)
        yy=np.where((ex<20).any(axis=1))[0]
        if len(yy): hmax=max(hmax,yy.max()-yy.min())
    print('wrote',OUT,' roarAt=%.3fs total=%.2fs dinoHFrac~=%.3f'%(roarAt,dur(OUT),hmax/float(CH)))

if __name__=='__main__':
    main()
