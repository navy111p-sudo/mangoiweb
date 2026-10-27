"""A.i영화더빙 음성 안내 음원 다시 만들기 / Rebuild the dubbing voice-guide mp3 (2026-10-27)

장면(씬) 음성 11개 + 배경음악 → guide-<ko|en>.mp3 (모노 64kbps 44.1kHz) 과 장면 시작 시각(OFFSETS).
11 scene clips + background music → guide-<lang>.mp3 and the scene start offsets.

사용 / Usage:
  python3 build_guide.py <lang> <scene_dir> <bgm.wav> <out.mp3>
  scene_dir 안에 01.wav … 11.wav (장면 음성만 / voice only)
  → 같은 폴더에 build-<lang>.json(길이·OFFSETS) 을 남긴다. 하니스가 mp3 길이·OFFSETS 와 대조한다.
  → also writes build-<lang>.json (length + OFFSETS) next to this script; the harness checks the mp3 against it.

⚠️ 2026-10-27 v2 사고 / v2 incident: 마지막 «…나만의 영화를 만들어 보세요. 감사합니다.» 약 2.9초가 잘렸다.
   loudnorm 은 192kHz 로 내보내고 끝 3초를 들고 있다가 마지막에 내놓는데, 그 출력을 amix(duration=first) 에
   바로 물리면 그 3초를 받기 전에 amix 가 끝난다(배경음악이 목소리보다 길거나 같을 때 — ffmpeg 6.1 실측).
   → loudnorm 바로 뒤에 aresample=44100 을 두고, 만든 뒤 파일 길이를 재서 짧으면 실패로 끝낸다.
   The last ~2.9 s was cut: loudnorm (192 kHz, 3 s look-ahead) feeding amix(duration=first) directly drops
   the flushed tail. Fix: aresample=44100 right after loudnorm + verify the output length.
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
GAP = 0.8                 # 장면 사이 쉼 / gap between scenes
LONG_PAUSE, KEEP = 0.55, 0.45   # 0.55초 넘는 쉼은 0.45초로 / shorten long pauses
HEAD, TAIL = 0.10, 0.15   # 앞뒤 무음 / edge silence
OUTRO = 1.5               # 마지막 말 뒤 배경음악이 잦아드는 시간 / music fade-out after the last word
SIL_DB = -40
TARGET_RMS = 0.1
BGM_GAIN_DB = -19         # 목소리 대비 배경음악 크기 / music level under the voice
BGM_FADE = 2.5            # 끝에서 배경음악 줄이기(초) / music fade-out length
LEN_SLACK = 0.05          # mp3 길이가 목소리보다 이만큼 넘게 짧으면 실패 / allowed shortfall before failing


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', str(path), '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def tighten(x):
    """긴 쉼 줄이기 + 앞뒤 무음 맞추기 / shorten long pauses, normalise edges"""
    win = int(0.02 * SR)
    n = len(x) // win
    rms = np.sqrt(np.mean(x[: n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
    loud = 20 * np.log10(rms) > SIL_DB
    if not loud.any():
        return x
    first, last = np.argmax(loud), n - 1 - np.argmax(loud[::-1])
    out, i = [], first
    while i <= last:
        j = i
        while j <= last and loud[j] == loud[i]:
            j += 1
        seg = x[i * win: j * win]
        if not loud[i] and len(seg) > LONG_PAUSE * SR:
            seg = seg[: int(KEEP * SR)]
        out.append(seg)
        i = j
    z = lambda s: np.zeros(int(s * SR), np.float32)
    y = np.concatenate([z(HEAD)] + out + [z(TAIL)])
    # 장면마다 말소리 크기를 맞춘다(새로 녹음한 장면이 튀지 않게) / level-match speech across scenes
    speech = rms[first:last + 1][loud[first:last + 1]]
    return y * (TARGET_RMS / float(np.sqrt(np.mean(speech ** 2))))


def duration(path):
    """파일 길이(초) — ffprobe / file length in seconds"""
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def main():
    lang, scene_dir, bgm_path, out = sys.argv[1], Path(sys.argv[2]), sys.argv[3], sys.argv[4]
    parts, offsets, t = [], [], 0.0
    for k in range(1, 12):
        clip = tighten(load(scene_dir / f'{k:02d}.wav'))
        if parts:
            parts.append(np.zeros(int(GAP * SR), np.float32)); t += GAP
        offsets.append(round(t, 2))
        parts.append(clip); t += len(clip) / SR
    parts.append(np.zeros(int(OUTRO * SR), np.float32)); t += OUTRO
    voice = np.concatenate(parts)
    tmp = Path(out).with_suffix('.voice.wav')
    with wave.open(str(tmp), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(voice, -1, 1) * 32767).astype(np.int16).tobytes())
    if duration(bgm_path) < t:
        sys.exit(f'배경음악이 목소리({t:.2f}초)보다 짧다 — make_bgm.py {int(t) + 1} 로 다시 만드세요 / bgm shorter than voice')
    # 목소리 loudnorm(→ 44.1kHz 로 되돌림: 끝 잘림 방지) → 배경음악을 아래로 깔고 말할 때 더 줄이며, 끝에서 잦아든다
    # loudnorm (back to 44.1 kHz so its tail is not dropped) → duck music under speech, fade it out at the end
    fc = (f'[0:a]loudnorm=I=-17:TP=-1.5,aresample={SR},asplit=2[v][key];'
          f'[1:a]volume={BGM_GAIN_DB}dB,afade=t=out:st={t - BGM_FADE:.2f}:d={BGM_FADE}[m];'
          f'[m][key]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=400[md];'
          f'[v][md]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp), '-i', bgm_path, '-filter_complex', fc,
                    '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '64k', out], check=True)
    tmp.unlink()
    got = duration(out)
    if got < t - LEN_SLACK:   # ⛔ 잘린 파일을 내보내지 않는다 / never ship a truncated file
        Path(out).unlink()
        sys.exit(f'음원이 잘렸다: 목소리 {t:.2f}초 → 파일 {got:.2f}초 / output truncated')
    info = {'lang': lang, 'seconds': round(t, 2), 'file_seconds': round(got, 2), 'offsets': offsets}
    (Path(__file__).parent / f'build-{lang}.json').write_text(json.dumps(info, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(info, ensure_ascii=False))


if __name__ == '__main__':
    main()
