#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   🎬 A.i영화더빙 — 화면 자료(매니페스트) 만들기 (2026-10-20)
   ──────────────────────────────────────────────────────────────
   [입력] content/dubbing/<에피소드>/
          · story/episode.json · story/characters.json — 대본·캐릭터 정본(GPT 제작, 그대로 보관)
          · release.json — 검수·배포 상태표(장면별 승인 여부, 우리 쪽 «/…» 미디어 경로)
   [출력] cloudflare-deploy/public/data/dubbing/<에피소드>.json  (schema «mangoi.dub.v1»)
          화면 /ai-dubbing.html 이 js/ai-dubbing.js 로 이 파일 하나만 읽는다.
   [실행] node scripts/build-dub-manifest.mjs dub-001
          고친 뒤 안 돌리면 test-harness/dubbing_episode_harness.mjs 가 «출력이 원본과 다르다» 로 FAIL.
   ⛔ http·https·// 주소는 거절한다 — 생성 서비스 주소는 영구 보관이 아니고, 저장소가 공개다.
   ⛔ 캐릭터의 생김새·목소리 메모(visual·voice)는 화면에 필요 없어 싣지 않는다(제작용).
   ══════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_DIR = path.join(ROOT, 'content/dubbing');
export const OUT_DIR = path.join(ROOT, 'cloudflare-deploy/public/data/dubbing');
export const SCHEMA = 'mangoi.dub.v1';
const EP_RE = /^dub-\d{3}$/;
const LOCAL_PATH = /^\/(?!\/)[A-Za-z0-9._\-\/]+$/;   // js/ai-dubbing.js 의 isLocalPath 와 같은 규칙(하니스가 대조)

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
export function mediaPath(v, where) {
  if (v == null) return null;
  if (typeof v !== 'string' || !LOCAL_PATH.test(v) || v.includes('..')) {
    throw new Error(`${where}: «/…» 로 시작하는 우리 경로만 받습니다 — 받은 값: ${JSON.stringify(v)}`);
  }
  return v;
}

export function buildManifest(ep) {
  if (!EP_RE.test(ep)) throw new Error(`에피소드 이름이 이상합니다: ${ep}`);
  const dir = path.join(CONTENT_DIR, ep);
  const story = readJson(path.join(dir, 'story/episode.json'));
  const chars = readJson(path.join(dir, 'story/characters.json'));
  const rel = readJson(path.join(dir, 'release.json'));
  if (story.id !== ep || rel.episode !== ep) throw new Error(`id 가 어긋납니다: story=${story.id} release=${rel.episode}`);

  const relByNo = new Map((rel.scenes || []).map(s => [s.no, s]));
  if (relByNo.size !== story.scenes.length) {
    throw new Error(`release.json 장면 수(${relByNo.size})와 대본 장면 수(${story.scenes.length})가 다릅니다`);
  }
  const characters = {};
  for (const [id, c] of Object.entries(chars)) characters[id] = { name: { ko: c.name.ko, en: c.name.en } };

  const scenes = story.scenes.map(s => {
    const r = relByNo.get(s.no);
    if (!r) throw new Error(`release.json 에 장면 ${s.no} 이 없습니다`);
    const voices = {};
    for (const [who, p] of Object.entries(r.voices || {})) voices[who] = mediaPath(p, `장면 ${s.no} voices.${who}`);
    return {
      no: s.no,
      label: { ko: s.label.ko, en: s.label.en },
      arc: s.arc,
      qaApproved: r.qaApproved === true,
      linesSynced: r.linesSynced === true,
      durationSec: typeof r.durationSec === 'number' ? r.durationSec : null,
      video: mediaPath(r.video, `장면 ${s.no} video`),
      thumb: mediaPath(r.thumb, `장면 ${s.no} thumb`),
      bgm: mediaPath(r.bgm, `장면 ${s.no} bgm`),
      voices,
      lines: s.lines.map(l => ({ id: l.id, speaker: l.speaker, en: l.en, ko: l.ko,
        start: l.start, end: l.end, emotion: l.emotion, scored: l.scored === true })),
    };
  });

  return {
    schema: SCHEMA,
    id: ep,
    title: { ko: story.title.ko, en: story.title.en },
    level: story.level,
    playable: story.playable.slice(),
    qaApproved: rel.qaApproved === true,
    characters,
    scenes,
  };
}

export function manifestText(ep) { return JSON.stringify(buildManifest(ep), null, 2) + '\n'; }
export function outPath(ep) { return path.join(OUT_DIR, `${ep}.json`); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ep = process.argv[2] || 'dub-001';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath(ep), manifestText(ep));
  console.log(`✅ ${path.relative(ROOT, outPath(ep))}`);
}
