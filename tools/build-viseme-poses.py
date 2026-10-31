"""Register generated atlas cells to a shipped portrait; composite ONLY the mouth.
Usage: python tools/build-viseme-poses.py NAME BASE ATLAS X Y RX RY
The ellipse is in original portrait pixels. Outputs preserve all pixels outside it.
"""
import sys,json
from pathlib import Path
import cv2,numpy as np
name,basepath,atlaspath=sys.argv[1:4]
cx,cy,rx,ry=map(int,sys.argv[4:8])
base=cv2.imread(basepath,cv2.IMREAD_UNCHANGED)
if base.shape[2]==3:base=cv2.cvtColor(base,cv2.COLOR_BGR2BGRA)
atlas=cv2.imread(atlaspath,cv2.IMREAD_COLOR)
h,w=base.shape[:2]
mask=np.full((h,w),255,np.uint8);cv2.ellipse(mask,(cx,cy),(rx*2,ry*2),0,0,360,0,-1)
# SIFT correspondence excludes mouth to avoid matching the expression being changed.
sift=cv2.SIFT_create(); kb,db=sift.detectAndCompute(base[:,:,:3],mask)
out=Path('cloudflare-deploy/public/img/visemes');out.mkdir(exist_ok=True)
alpha=np.zeros((h,w),np.float32);cv2.ellipse(alpha,(cx,cy),(rx,ry),0,0,360,1,-1)
alpha=cv2.GaussianBlur(alpha,(0,0),2);alpha[alpha<.005]=0
report=[]
from PIL import Image
pad=8;left=cx-rx-pad;top=cy-ry-pad;pw=(rx+pad)*2;ph=(ry+pad)*2
patches=Image.new("RGBA",(pw*3,ph*3))
for n,key in enumerate('XABCDEFGH'):
 y,x=divmod(n,3);ah,aw=atlas.shape[:2]
 cell=atlas[round(y*ah/3):round((y+1)*ah/3),round(x*aw/3):round((x+1)*aw/3)]
 kc,dc=sift.detectAndCompute(cell,None)
 matches=cv2.BFMatcher().knnMatch(dc,db,k=2)
 good=[a for a,b in matches if a.distance<.7*b.distance]
 if len(good)<8:raise RuntimeError(f'{name}/{key}: too few registration matches {len(good)}')
 src=np.float32([kc[m.queryIdx].pt for m in good]);dst=np.float32([kb[m.trainIdx].pt for m in good])
 mat,inliers=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=3)
 if mat is None or inliers.sum()<6:raise RuntimeError('registration failed')
 warped=cv2.warpAffine(cell,mat,(w,h))
 result=base.copy();a=alpha[:,:,None]
 result[:,:,:3]=np.round(base[:,:,:3]*(1-a)+warped*a).astype(np.uint8)
 assert np.array_equal(result[alpha==0],base[alpha==0])
 patch=Image.fromarray(cv2.cvtColor(result,cv2.COLOR_BGRA2RGBA)).crop((left,top,left+pw,top+ph))
 patches.paste(patch,((n%3)*pw,(n//3)*ph))
 report.append(dict(pose=key,matches=len(good),inliers=int(inliers.sum()),outside_mouth_changes=0))
patches.save(out/f"{name}-mouths.webp",lossless=True)
print(json.dumps(dict(rect=[left,top,pw,ph],poses=report)))
