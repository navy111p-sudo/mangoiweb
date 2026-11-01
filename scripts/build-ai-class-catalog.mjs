#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   🤖 A.i 선생님 화상수업 — 레슨 목록(카탈로그) 만들기 (2026-10-07)
   ──────────────────────────────────────────────────────────────
   [왜] /ai-class.html 은 레슨 443개를 고르는 목록이 필요한데, 문장 원본
        (cloudflare-deploy/public/data/tb-say/*.json, 84파일 1.7MB)을 통째로 받으면
        첫 화면이 무겁다. 그래서 «목록» 만 작게 뽑아 두고(약 60KB),
        문장은 학생이 레슨을 고를 때 그 권의 파일 하나만 받는다(16~32KB).
   [정본] 문장은 언제나 tb-say 가 정본이다 — 이 파일에는 «어느 파일의 어느 묶음» 만 적는다.
        tb-say 를 고치면 이 스크립트를 다시 돌리세요:
          node scripts/build-ai-class-catalog.mjs
        안 돌리면 test-harness/ai_class_page_harness.mjs 가 «목록이 원본과 다르다» 로 FAIL 냅니다.
   [교재 그림] 이 목록에는 그림 번호를 적지 않는다 — 화면이 레슨을 열 때
        /api/textbook-files?book=… 로 그 권의 파일 번호를 받는다(수업 화면과 같은 API).
        ⛔ 원본 슬라이드 이미지를 저장소에 올리지 않는다(저장소가 공개입니다).
   ══════════════════════════════════════════════════════════════ */
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TB_DIR = path.join(ROOT, 'cloudflare-deploy/public/data/tb-say');
export const OUT = path.join(ROOT, 'cloudflare-deploy/public/data/ai-class-catalog.json');
// 키 모양: 「[BTS 1 001 (Welcome to school)] New / Slide4.JPG」 · 「[NEW SIU BASIC 001 - …] Easy / Slide3.JPG」
export const KEY_RE = /^\[(.+?)\]\s*(.*?)\s*\/\s*Slide(\d+)\.JPG$/i;

export function titleOf(book) {
  const m = book.match(/\(([^)]+)\)/) || book.match(/- (.+)$/);
  return m ? m[1] : book;
}

// 화면(ai-class.html)의 unitFrom() 과 같은 규칙 — 둘이 어긋나면 하니스가 잡는다
export function buildCatalog(dir = TB_DIR) {
  const units = new Map();
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const k of Object.keys(d)) {
      const m = KEY_RE.exec(k);
      if (!m) continue;
      const id = m[1] + (m[2] ? ' · ' + m[2] : '');
      let u = units.get(id);
      if (!u) { u = { id, book: m[1], part: m[2], title: titleOf(m[1]), file: f.replace(/\.json$/, ''), n: 0 }; units.set(id, u); }
      if (u.file !== f.replace(/\.json$/, '')) throw new Error('한 레슨이 두 파일에 걸쳐 있음: ' + id);
      u.n++;
    }
  }
  return [...units.values()];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cat = buildCatalog();
  fs.writeFileSync(OUT, JSON.stringify(cat) + '\n');
  const v = crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex').slice(0, 8);
  console.log('레슨', cat.length, '개 ·', fs.statSync(OUT).size, '바이트 →', path.relative(ROOT, OUT));
  console.log('⚠️ ai-class.html 의 주소를 /data/ai-class-catalog.json?v=' + v + ' 로 바꾸세요(내용 해시 — 다르면 하니스가 FAIL)');
}
