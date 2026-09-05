# -*- coding: utf-8 -*-
"""성우 나레이션 한 파일을 18개 장면으로 가른다.

  ⚠️ 「글자 수 비율」만으로 자르면 문장 한가운데서 화면이 넘어간다.
     그래서 ① 글자 수로 «있어야 할 자리»를 잡고 ② 그 근처의 «실제 무음»으로 당긴다.
  ⚠️ 무음이 없으면 억지로 당기지 않는다 — 없는 경계를 지어내는 쪽이 나쁘다.
"""
import json, re, subprocess, sys

W = json.load(open('weights.json'))['weights']          # 장면별 글자 수
N = len(W)
SNAP = 4.0        # 예상 경계에서 이만큼 안의 무음만 후보
MIN_SCENE = 1.5   # 장면이 이보다 짧아지면 스냅을 버린다

def probe_duration(path):
    out = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration',
                          '-of','csv=p=0', path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())

def silences(path, noise='-34dB', dur=0.35):
    p = subprocess.run(['ffmpeg','-hide_banner','-i',path,'-af',
                        f'silencedetect=noise={noise}:d={dur}','-f','null','-'],
                       capture_output=True, text=True)
    txt = p.stderr
    starts = [float(m) for m in re.findall(r'silence_start:\s*([0-9.]+)', txt)]
    ends   = [float(m) for m in re.findall(r'silence_end:\s*([0-9.]+)', txt)]
    out = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else None
        if e is not None and e > s:
            out.append((s, e, (s+e)/2.0))
    return out

def main():
    audio = sys.argv[1]
    D = probe_duration(audio)
    sil = silences(audio)
    print(f'오디오 {D:.2f}초 · 무음 구간 {len(sil)}개')
    for s,e,c in sil[:40]:
        print(f'    무음 {s:7.2f}~{e:7.2f}  ({e-s:.2f}초)')

    tot = sum(W)
    want, acc = [], 0.0
    for w in W[:-1]:
        acc += w/tot*D
        want.append(acc)

    used, cuts, prev = set(), [], 0.0
    for i, t in enumerate(want):
        best, bd = None, SNAP + 1
        for j, (s,e,c) in enumerate(sil):
            if j in used: continue
            d = abs(c - t)
            if d < bd: best, bd = j, d
        if best is not None and bd <= SNAP:
            c = sil[best][2]
            # 단조 증가 + 최소 길이를 깨면 스냅을 포기한다
            if c - prev >= MIN_SCENE and (D - c) >= MIN_SCENE*(N-1-i):
                used.add(best); cuts.append(c); prev = c
                print(f'  s{i+1:02d}→s{i+2:02d} 경계  예상 {t:6.2f} → 무음 {c:6.2f}  (당김 {c-t:+.2f}초)')
                continue
        cuts.append(max(t, prev + MIN_SCENE)); prev = cuts[-1]
        print(f'  s{i+1:02d}→s{i+2:02d} 경계  예상 {t:6.2f} → 그대로        (근처 무음 없음)')

    bounds = [0.0] + cuts + [D]
    segs = [(bounds[i], bounds[i+1]) for i in range(N)]
    bad = [i for i,(a,b) in enumerate(segs) if b-a < MIN_SCENE]
    if bad:
        print('⚠️ 너무 짧은 장면:', [i+1 for i in bad]); sys.exit(1)
    json.dump([{'i':i+1,'start':round(a,3),'dur':round(b-a,3)} for i,(a,b) in enumerate(segs)],
              open('cuts.json','w'), ensure_ascii=False, indent=1)
    print('\n장면 길이:')
    for i,(a,b) in enumerate(segs,1): print(f'  s{i:02d}  {a:7.2f} ~ {b:7.2f}   {b-a:5.2f}초')

main()
