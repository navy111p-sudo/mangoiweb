#!/usr/bin/env python3
"""4편(dub-004) 장면 합성 — CI 러너 전용 임시 도구 (main 에 올리지 않음).
입력 plan.json: 장면마다 Higgsfield 클립 4개 + 그 클립 입모양을 만든 샷 음성 4개 + 대사 시각.
출력 out/: scene-N.mp4(무음, 40초) · scene-N.jpg · scene-N-<역>.mp3(40초, 그 역 대사 구간만 소리) · scene-N-mix.mp3 · report.json
"""
import json, os, subprocess, urllib.request, re

P = json.load(open('tools/ep4build/plan.json'))
os.makedirs('w', exist_ok=True); os.makedirs('out', exist_ok=True)
ROLES = ['kai', 'emma', 'maya', 'pip', 'momo']
PAD = 0.12
rep = {'scenes': []}

def sh(*a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode: raise SystemExit(' '.join(a) + '\n' + r.stderr[-3000:])
    return r.stderr + r.stdout

def dur(p):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',p]).strip())

def get(u, p):
    if not os.path.exists(p): urllib.request.urlretrieve(u, p)
    return p

for sc in P['scenes']:
    n = sc['scene']; parts = []; auds = []
    for i, s in enumerate(sc['shots']):
        v = get(s['clip'], f'w/s{n}-{i}.mp4'); a = get(s['audio'], f'w/s{n}-{i}.mp3')
        info = {'clip_dur': dur(v), 'aud_dur': dur(a), 'want': s['dur']}
        pv = f'w/s{n}-{i}-v.mp4'
        # 정확히 want 초: 짧으면 마지막 프레임 연장
        sh('ffmpeg','-y','-v','error','-i',v,'-an','-vf',
           f"scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,tpad=stop_mode=clone:stop_duration=2,trim=duration={s['dur']},setpts=PTS-STARTPTS",
           '-c:v','libx264','-preset','slow','-crf','20','-pix_fmt','yuv420p',pv)
        pa = f'w/s{n}-{i}-a.wav'
        sh('ffmpeg','-y','-v','error','-i',a,'-af',f"apad,atrim=0:{s['dur']}",'-ar','48000','-ac','2',pa)
        parts.append(pv); auds.append(pa); info['seg'] = dur(pv); sc.setdefault('info', []).append(info)
    lst = f'w/s{n}.txt'; open(lst,'w').write(''.join(f"file '{os.path.basename(p)}'\n" for p in parts))
    sh('ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',lst,'-c:v','libx264','-preset','slow','-crf','22',
       '-pix_fmt','yuv420p','-movflags','+faststart',f'out/scene-{n}.mp4')
    mix = f'w/s{n}-mix.wav'
    sh('ffmpeg','-y','-v','error',*sum([['-i',p] for p in auds],[]),'-filter_complex',
       ''.join(f'[{k}:a]' for k in range(len(auds)))+f'concat=n={len(auds)}:v=0:a=1[o]','-map','[o]',mix)
    sh('ffmpeg','-y','-v','error','-ss','3','-i',f'out/scene-{n}.mp4','-frames:v','1','-q:v','4','-vf','scale=640:-2',f'out/scene-{n}.jpg')
    sh('ffmpeg','-y','-v','error','-i',mix,'-c:a','libmp3lame','-b:a','128k',f'out/scene-{n}-mix.mp3')
    lines = [l for l in P['lines'] if l['scene'] == n]
    for r in ROLES:
        win = [(max(0,l['start']-PAD), min(40,l['end']+PAD)) for l in lines if l['speaker'] == r]
        if not win: continue
        expr = '+'.join(f'between(t,{a:.3f},{b:.3f})' for a, b in win)
        sh('ffmpeg','-y','-v','error','-i',mix,'-af',f"volume='if({expr},1,0)':eval=frame",
           '-c:a','libmp3lame','-b:a','128k',f'out/scene-{n}-{r}.mp3')
    # 검증: 대사 밖 구간에 소리가 없는지(무음 구간이 대사 시각과 맞는지)
    sil = sh('ffmpeg','-v','info','-i',mix,'-af','silencedetect=n=-40dB:d=0.25','-f','null','-')
    ss = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', sil)]
    se = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', sil)]
    silent = list(zip(ss, se + [40.0]*(len(ss)-len(se))))
    speech_in_silence = [l['id'] for l in lines for a, b in silent if a < l['start']+0.3 and b > l['end']-0.3]
    vol = sh('ffmpeg','-v','info','-i',mix,'-af','volumedetect','-f','null','-')
    rep['scenes'].append({'scene': n, 'video_dur': dur(f'out/scene-{n}.mp4'), 'mix_dur': dur(mix),
        'size_mb': round(os.path.getsize(f'out/scene-{n}.mp4')/1048576, 2), 'shots': sc['info'],
        'silences': silent, 'lines_fully_inside_silence': speech_in_silence,
        'mean_volume': re.findall(r'mean_volume: (\S+)', vol), 'max_volume': re.findall(r'max_volume: (\S+)', vol)})
json.dump(rep, open('out/report.json','w'), indent=1)
print(json.dumps(rep, indent=1)[:6000])
