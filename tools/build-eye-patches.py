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
# (cx,cy,rx,ry) per eye+brow, in the 640x800 portrait's pixels.
ELLIPSES={'lily':[(276,246,44,36),(378,246,44,36)],'noah':[(252,284,54,40),(392,284,54,40)]}
PAD=6
name,basepath=sys.argv[1:3];poses=sys.argv[3:6];preview=Path(sys.argv[6])
ells=ELLIPSES[name];base=cv2.imread(basepath,cv2.IMREAD_COLOR);h,w=base.shape[:2]
x0=min(cx-rx for cx,cy,rx,ry in ells)-PAD;y0=min(cy-ry for cx,cy,rx,ry in ells)-PAD
x1=max(cx+rx for cx,cy,rx,ry in ells)+PAD;y1=max(cy+ry for cx,cy,rx,ry in ells)+PAD
mask=np.full((h,w),255,np.uint8);alpha=np.zeros((h,w),np.float32)
for cx,cy,rx,ry in ells:
  cv2.ellipse(mask,(cx,cy),(rx*2,ry*2),0,0,360,0,-1);cv2.ellipse(alpha,(cx,cy),(rx,ry),0,0,360,1,-1)
alpha=cv2.GaussianBlur(alpha,(0,0),3);alpha[alpha<.005]=0
sift=cv2.SIFT_create();kb,db=sift.detectAndCompute(base,mask)
rgba=np.array(Image.open(basepath).convert('RGBA'));tiles,report=[],{'rect':[x0,y0,x1-x0,y1-y0],'poses':[]}
for path in poses:
  source=cv2.imread(path,cv2.IMREAD_COLOR);ks,ds=sift.detectAndCompute(source,None)
  good=[a for a,b in cv2.BFMatcher().knnMatch(ds,db,k=2) if a.distance<.7*b.distance]
  if len(good)<8:raise RuntimeError(f'{path}: insufficient registration features')
  m,inliers=cv2.estimateAffinePartial2D(np.float32([ks[g.queryIdx].pt for g in good]),np.float32([kb[g.trainIdx].pt for g in good]),method=cv2.RANSAC,ransacReprojThreshold=3)
  if m is None or inliers.sum()<6:raise RuntimeError(f'{path}: registration failed')
  warped=cv2.warpAffine(source,m,(w,h)).astype(np.float32)
  # Generated portraits drift in exposure; match the feather ring (skin only) to the original.
  ring=(alpha>.02)&(alpha<.5);shift=np.clip(np.median(base[ring].astype(np.float32)-warped[ring],axis=0),-25,25)
  warped=np.clip(warped+shift,0,255);result=np.round(base*(1-alpha[:,:,None])+warped*alpha[:,:,None]).astype('uint8')
  # Changed-pixel share per horizontal tenth: only the eye bands may move.
  diff=np.abs(result.astype(int)-base.astype(int)).max(2)>12
  bands=[round(float(diff[i*h//10:(i+1)*h//10].mean())*100,2) for i in range(10)]
  out=rgba.copy();out[:,:,:3]=cv2.cvtColor(result,cv2.COLOR_BGR2RGB);tiles.append(Image.fromarray(out).crop((x0,y0,x1,y1)))
  report['poses'].append({'source':Path(path).name,'inliers':int(inliers.sum()),'color_shift_bgr':[round(float(v),1) for v in shift],'changed_pct_by_tenth':bands})
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
