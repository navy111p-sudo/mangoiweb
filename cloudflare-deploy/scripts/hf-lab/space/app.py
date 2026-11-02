"""입모양(viseme) 타임라인 확인용 비공개 Space (보고서 6장 항목 A, 방식 (a)).

입력: 문장 텍스트(표시용) + TTS로 만든 WAV 음성 파일 1개.
처리: Rhubarb Lip Sync 로 음성 → 입모양 타임라인(JSON).
출력: 타임라인 표 + JSON.

원칙: 학생 음성·영상은 올리지 않는다. 공개 TTS 샘플 또는 가공 문장만 쓴다.
"""
import json
import os
import subprocess
import tempfile
import urllib.request
import zipfile

import gradio as gr

RHUBARB_VERSION = "1.13.0"  # 실행 전 실제 릴리스 존재 여부를 확인해야 한다
RHUBARB_URL = (
    "https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/"
    f"v{RHUBARB_VERSION}/Rhubarb-Lip-Sync-{RHUBARB_VERSION}-Linux.zip"
)
WORK_DIR = os.path.join(tempfile.gettempdir(), "rhubarb")


def ensure_rhubarb() -> str:
    """Rhubarb 실행 파일 경로를 돌려준다. 없으면 한 번 내려받는다.

    Rhubarb 는 실행 파일 옆의 res/ 폴더(음향 모델)를 읽으므로,
    실행 파일만 복사하지 말고 압축을 푼 폴더 그대로 쓴다.
    """
    if os.path.isdir(WORK_DIR):
        for root, _dirs, files in os.walk(WORK_DIR):
            if "rhubarb" in files and os.path.isdir(os.path.join(root, "res")):
                return os.path.join(root, "rhubarb")
    os.makedirs(WORK_DIR, exist_ok=True)
    zip_path = os.path.join(WORK_DIR, "rhubarb.zip")
    urllib.request.urlretrieve(RHUBARB_URL, zip_path)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(WORK_DIR)
    os.remove(zip_path)
    for root, _dirs, files in os.walk(WORK_DIR):
        if "rhubarb" in files:
            binary = os.path.join(root, "rhubarb")
            os.chmod(binary, 0o755)
            return binary
    raise RuntimeError("압축 안에서 rhubarb 실행 파일을 찾지 못했습니다.")


def run_lipsync(sentence: str, audio_path: str):
    if not audio_path:
        return "음성 파일을 올려 주세요.", None, None
    if not audio_path.lower().endswith(".wav"):
        return "WAV 파일만 받습니다. 다른 형식은 WAV로 바꿔 올려 주세요.", None, None

    binary = ensure_rhubarb()
    result = subprocess.run(
        [binary, "-f", "json", "--quiet", audio_path],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        return f"Rhubarb 실행 실패: {result.stderr[:500]}", None, None

    data = json.loads(result.stdout)
    cues = data.get("mouthCues", [])
    rows = [[round(c["start"], 2), round(c["end"], 2), c["value"]] for c in cues]
    summary = (
        f"문장: {sentence or '(입력 없음)'}\n"
        f"입모양 구간 수: {len(cues)}\n"
        f"길이: {data.get('metadata', {}).get('duration', '?')} 초"
    )
    return summary, rows, json.dumps(data, ensure_ascii=False, indent=2)


with gr.Blocks(title="Mouth Shape Lab") as demo:
    gr.Markdown(
        "# Mouth Shape Lab (비공개)\n"
        "TTS로 만든 WAV를 올리면 입모양 타임라인을 보여 줍니다. "
        "학생 음성은 올리지 마세요."
    )
    sentence = gr.Textbox(label="문장 (표시용)", placeholder="Hello, how are you?")
    audio = gr.Audio(label="TTS 음성 (WAV)", type="filepath")
    run = gr.Button("입모양 분석")
    summary = gr.Textbox(label="요약", interactive=False)
    table = gr.Dataframe(headers=["start(초)", "end(초)", "입모양"], label="타임라인")
    raw = gr.Code(label="원본 JSON", language="json")
    run.click(run_lipsync, inputs=[sentence, audio], outputs=[summary, table, raw])

if __name__ == "__main__":
    demo.launch()
