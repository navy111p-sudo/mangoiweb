"""A.i영화더빙 음성 안내 음원 다시 만들기 / Rebuild the dubbing voice-guide mp3 (2026-10-27)

장면(씬) 음성 11개 + 배경음악 → guide-<ko|en>.mp3 (모노 64kbps 44.1kHz) 과 장면 시작 시각(OFFSETS).
11 scene clips + background music → guide-<lang>.mp3 and the scene start offsets.

사용 / Usage:
  python3 build_guide.py <lang> <scene_dir> <bgm.wav> <out.mp3>
  scene_dir 안에 01.wav … 11.wav (장면 음성만 / voice only)
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
SIL_DB = -40
TARGET_RMS = 0.1
BGM_GAIN_DB = -19         # 목소리 대비 배경음악 크기 / music level under the voice


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


def main():
    lang, scene_dir, bgm_path, out = sys.argv[1], Path(sys.argv[2]), sys.argv[3], sys.argv[4]
    parts, offsets, t = [], [], 0.0
    for k in range(1, 12):
        clip = tighten(load(scene_dir / f'{k:02d}.wav'))
        if parts:
            parts.append(np.zeros(int(GAP * SR), np.float32)); t += GAP
        offsets.append(round(t, 2))
        parts.append(clip); t += len(clip) / SR
    voice = np.concatenate(parts)
    tmp = Path(out).with_suffix('.voice.wav')
    with wave.open(str(tmp), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(voice, -1, 1) * 32767).astype(np.int16).tobytes())
    # 목소리 loudnorm → 배경음악을 아래로 깔고, 말할 때 살짝 더 줄인다(sidechain) / duck music under speech
    fc = (f'[0:a]loudnorm=I=-17:TP=-1.5,asplit=2[v][key];'
          f'[1:a]volume={BGM_GAIN_DB}dB[m];'
          f'[m][key]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=400[md];'
          f'[v][md]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp), '-i', bgm_path, '-filter_complex', fc,
                    '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '64k', out], check=True)
    tmp.unlink()
    print(json.dumps({'lang': lang, 'seconds': round(t, 2), 'offsets': offsets}, ensure_ascii=False))


if __name__ == '__main__':
    main()
