"""Replace one registered mouth atlas cell; keep original portrait outside ellipse.
Arguments: name pose original_portrait generated_portrait cx cy rx ry
"""
import sys
from pathlib import Path
import cv2,numpy as np
from PIL import Image
name,pose,basepath,generated=sys.argv[1:5];cx,cy,rx,ry=map(int,sys.argv[5:9]);pad=8
base=cv2.imread(basepath,cv2.IMREAD_COLOR);source=cv2.imread(generated,cv2.IMREAD_COLOR)
h,w=base.shape[:2];mask=np.full((h,w),255,np.uint8);cv2.ellipse(mask,(cx,cy),(rx*2,ry*2),0,0,360,0,-1)
sift=cv2.SIFT_create();kb,db=sift.detectAndCompute(base,mask);ks,ds=sift.detectAndCompute(source,None)
good=[a for a,b in cv2.BFMatcher().knnMatch(ds,db,k=2) if a.distance<.7*b.distance]
if len(good)<8:raise RuntimeError('insufficient registration features')
m,inliers=cv2.estimateAffinePartial2D(np.float32([ks[g.queryIdx].pt for g in good]),np.float32([kb[g.trainIdx].pt for g in good]),method=cv2.RANSAC,ransacReprojThreshold=3)
if m is None or inliers.sum()<6:raise RuntimeError('registration failed')
warped=cv2.warpAffine(source,m,(w,h));alpha=np.zeros((h,w),np.float32);cv2.ellipse(alpha,(cx,cy),(rx,ry),0,0,360,1,-1);alpha=cv2.GaussianBlur(alpha,(0,0),2);alpha[alpha<.005]=0
result=np.round(base*(1-alpha[:,:,None])+warped*alpha[:,:,None]).astype('uint8')
rgba=np.array(Image.open(basepath).convert('RGBA'));rgba[:,:,:3]=cv2.cvtColor(result,cv2.COLOR_BGR2RGB)
x,y,pw,ph=cx-rx-pad,cy-ry-pad,(rx+pad)*2,(ry+pad)*2
p=Path('cloudflare-deploy/public/img/visemes')/f'{name}-mouths.webp';atlas=Image.open(p).convert('RGBA');ix='XABCDEFGH'.index(pose);atlas.paste(Image.fromarray(rgba).crop((x,y,x+pw,y+ph)),((ix%3)*pw,(ix//3)*ph));atlas.save(p,lossless=True)
print(f'{name}/{pose}: {int(inliers.sum())} registration inliers; outside-mouth pixels preserved')
