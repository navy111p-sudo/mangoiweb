"""ep4 remake runner (temporary branch only — never merge to main).

TASK file decides what runs:
  asr   : download each line voice, transcribe (faster-whisper), compare to the script line
          -> out/asr.json  (word match, missing/extra words, word timestamps)
"""
import json, os, re, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
TASK = open(os.path.join(HERE, 'TASK')).read().strip()


def norm(s):
    s = s.lower().replace("'", '')
    return re.sub(r'[^a-z0-9 ]+', ' ', s).split()


def lcs(a, b):
    d = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a)):
        for j in range(len(b)):
            d[i + 1][j + 1] = d[i][j] + 1 if a[i] == b[j] else max(d[i][j + 1], d[i + 1][j])
    return d[-1][-1]


def asr():
    from faster_whisper import WhisperModel
    model = WhisperModel('medium.en', device='cpu', compute_type='int8')
    rows = [l.rstrip('\n').split('\t') for l in open(os.path.join(HERE, 'voices.tsv')) if l.strip()]
    res = {}
    os.makedirs('/tmp/v', exist_ok=True)
    for idx, url, speaker, text in rows:
        p = f'/tmp/v/{idx}.wav'
        urllib.request.urlretrieve(url, p)
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                             check=True, capture_output=True).stdout
        import numpy as np
        audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
        segs, _ = model.transcribe(audio, language='en', beam_size=5, word_timestamps=True,
                                   initial_prompt=None, vad_filter=False)
        words = []
        for s in segs:
            for w in (s.words or []):
                words.append([round(w.start, 2), round(w.end, 2), w.word.strip()])
        hyp = ' '.join(w[2] for w in words)
        ref_n, hyp_n = norm(text), norm(hyp)
        m = lcs(ref_n, hyp_n)
        res[idx] = {'speaker': speaker, 'ref': text, 'hyp': hyp,
                    'recall': round(m / max(1, len(ref_n)), 3),
                    'precision': round(m / max(1, len(hyp_n)), 3),
                    'missing': [w for w in ref_n if w not in hyp_n],
                    'extra': [w for w in hyp_n if w not in ref_n],
                    'words': words}
        print(idx, res[idx]['recall'], res[idx]['precision'], '|', text, '=>', hyp, flush=True)
    json.dump(res, open(os.path.join(OUT, 'asr.json'), 'w'), ensure_ascii=False, indent=1)
    bad = [k for k, v in res.items() if v['recall'] < 1 or v['precision'] < 1]
    print('NOT EXACT:', bad)


if TASK == 'asr':
    asr()
else:
    sys.exit(f'unknown TASK {TASK!r}')
