"""Build a registered eye/brow atlas for an image actor (blink + brow lift).
Arguments: name original_portrait half_closed.png closed.png brows_up.png preview_dir
Like replace-viseme-patch.py, each generated portrait is SIFT/RANSAC-registered to the
shipped portrait and only two feathered eye+brow ellipses are composited; every pixel
outside them stays the original. Atlas columns: 0 half-closed, 1 closed, 2 brows up.
The rect printed here must match EYES in cloudflare-deploy/public/js/mango-avatar.js.
"""
import json,sys
from pathlib import Path
import cv2,numpy as np
from PIL import Image
# (cx,cy,rx,ry) per eye+brow, in the base portrait's own pixels.
# emma's portrait is 512x640 (emma-v2-rest.webp); the others are 640x800. Keep this on ONE line:
# test-harness/avatar_living_face_harness.mjs reads it with a single-line pattern.
ELLIPSES={'lily':[(276,246,44,36),(378,246,44,36)],'noah':[(252,284,54,40),(392,284,54,40)],'emma':[(203,214,46,34),(312,214,46,34)],'mei':[(262,262,50,36),(386,262,50,36)],'long':[(266,257,50,37),(378,257,50,37)]}
PAD=6
name,basepath=sys.argv[1:3];poses=sys.argv[3:6];preview=Path(sys.argv[6])
ells=ELLIPSES[name];base=cv2.imread(basepath,cv2.IMREAD_COLOR);h,w=base.shape[:2]
x0=min(cx-rx for cx,cy,rx,ry in ells)-PAD;y0=min(cy-ry for cx,cy,rx,ry in ells)-PAD
x1=max(cx+rx for cx,cy,rx,ry in ells)+PAD;y1=max(cy+ry for cx,cy,rx,ry in ells)+PAD
mask=np.full((h,w),255,np.uint8);alpha=np.zeros((h,w),np.float32)
for cx,cy,rx,ry in ells:
  cv2.ellipse(mask,(cx,cy),(rx*2,ry*2),0,0,360,0,-1);cv2.ellipse(alpha,(cx,cy),(rx,ry),0,0,360,1,-1)
alpha=cv2.GaussianBlur(alpha,(0,0),3);alpha[alpha<.005]=0
rgba=np.array(Image.open(basepath).convert('RGBA'))
mask[rgba[:,:,3]<200]=0  # transparent background carries no registration signal
sift=cv2.SIFT_create();kb,db=sift.detectAndCompute(base,mask)
tiles,report=[],{'rect':[x0,y0,x1-x0,y1-y0],'poses':[]}
gray=cv2.cvtColor(base,cv2.COLOR_BGR2GRAY)
ring=(alpha>.02)&(alpha<.5)
ecc_mask=np.where((mask>0)&(np.arange(h)[:,None]<h*0.62),255,0).astype(np.uint8)  # face/hair, eyes excluded
def ring_err(m,source):
  warped=cv2.warpAffine(source,m,(w,h)).astype(np.float32)
  return float(np.mean(np.abs(cv2.cvtColor(warped.astype(np.uint8),cv2.COLOR_BGR2GRAY)[ring].astype(np.float32)-gray[ring])))
def ecc_refine(m,source):
  # ECC wants template(x) ~ input(W(x)); W maps base -> source, i.e. the inverse of m.
  inv=cv2.invertAffineTransform(m).astype(np.float32)
  try:
    _,inv=cv2.findTransformECC(gray,cv2.cvtColor(source,cv2.COLOR_BGR2GRAY),inv,cv2.MOTION_AFFINE,
      (cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,200,1e-6),ecc_mask,5)
    return cv2.invertAffineTransform(inv)
  except cv2.error: return None
for path in poses:
  source=cv2.imread(path,cv2.IMREAD_COLOR);sh_,sw_=source.shape[:2];cands={}
  # Generated portraits keep the reference framing, so the nominal scale is a safe start.
  s0=w/sw_;cands['nominal']=np.float32([[s0,0,0],[0,s0,(h-sh_*s0)/2]])
  ks,ds=sift.detectAndCompute(source,None)
  good=[a for a,b in cv2.BFMatcher().knnMatch(ds,db,k=2) if a.distance<.7*b.distance]
  inl=0
  if len(good)>=8:
    m,inliers=cv2.estimateAffinePartial2D(np.float32([ks[g.queryIdx].pt for g in good]),np.float32([kb[g.trainIdx].pt for g in good]),method=cv2.RANSAC,ransacReprojThreshold=3)
    if m is not None:cands['sift']=m.astype(np.float32);inl=int(inliers.sum())
  for k in list(cands):
    r=ecc_refine(cands[k],source)
    if r is not None:cands[k+'+ecc']=r.astype(np.float32)
  errs={k:round(ring_err(m,source),2) for k,m in cands.items()}
  best=min(errs,key=errs.get);m=cands[best]
  # A correct registration leaves the skin ring around the eyes nearly identical.
  ok=errs[best]<=14
  if not ok:print(f'WARNING {path}: registration doubtful {errs}')
  # Raw source thumbnail for diagnosis when a pose must be regenerated.
  preview.mkdir(parents=True,exist_ok=True);Image.open(path).convert('RGB').resize((320,round(320*sh_/sw_))).save(preview/f'raw-{Path(path).stem}.jpg',quality=80)
  inliers=np.array([inl])
  warped=cv2.warpAffine(source,m,(w,h)).astype(np.float32)
  # Generated portraits drift in exposure; match the feather ring (skin only) to the original.
  shift=np.clip(np.median(base[ring].astype(np.float32)-warped[ring],axis=0),-25,25)
  warped=np.clip(warped+shift,0,255);result=np.round(base*(1-alpha[:,:,None])+warped*alpha[:,:,None]).astype('uint8')
  # Changed-pixel share per horizontal tenth: only the eye bands may move.
  diff=np.abs(result.astype(int)-base.astype(int)).max(2)>12
  bands=[round(float(diff[i*h//10:(i+1)*h//10].mean())*100,2) for i in range(10)]
  out=rgba.copy();out[:,:,:3]=cv2.cvtColor(result,cv2.COLOR_BGR2RGB);tiles.append(Image.fromarray(out).crop((x0,y0,x1,y1)))
  report['poses'].append({'source':Path(path).name,'method':best,'ok':ok,'ring_err':errs,'inliers':int(inliers.sum()),'color_shift_bgr':[round(float(v),1) for v in shift],'changed_pct_by_tenth':bands})
atlas=Image.new('RGBA',(len(tiles)*(x1-x0),y1-y0))
for i,t in enumerate(tiles):atlas.paste(t,(i*(x1-x0),0))
atlas.save(Path('cloudflare-deploy/public/img/visemes')/f'{name}-eyes.webp',lossless=True)
# Preview for human review: original crop then each pose, 3x enlarged on white.
preview.mkdir(parents=True,exist_ok=True);crop=Image.fromarray(rgba).crop((x0,y0,x1,y1))
sheet=Image.new('RGB',((x1-x0)*3,(y1-y0)*3*(len(tiles)+1)),'white')
for i,t in enumerate([crop]+tiles):
  bg=Image.new('RGBA',t.size,'white');bg.alpha_composite(t);sheet.paste(bg.convert('RGB').resize(((x1-x0)*3,(y1-y0)*3)),(0,i*(y1-y0)*3))
sheet.save(preview/f'{name}-eyes-preview.jpg',quality=90)
(preview/f'{name}-eyes-report.json').write_text(json.dumps(report,indent=1))
print(f'{name}: rect {report["rect"]}; inliers {[p["inliers"] for p in report["poses"]]}')
