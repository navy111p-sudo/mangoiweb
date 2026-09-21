// -*- coding: utf-8 -*-
// escape_step_art_harness.mjs — 방탈출 세 게임의 «단계별 장면» 이 실제로 바뀌는지 본다.
//
//   [왜 필요한가] 2026-09-21 사장님: 「캐비닛을 열라고 했을 때 그림을 클릭하면 캐비닛이 열린
//     그림으로 바뀌는 줄 알았는데 그대로에요.」 원인은 장소마다 사진이 «1장» 뿐이었고(voice 의
//     새 장소 5곳) 성공하면 교실 전체로 «되돌아가던» 것(school)이었다. 그래서 무엇을 해도
//     그림이 그대로라 「눌러도 아무 일도 안 일어난다」로 읽혔다.
//
//   [무엇을 묻는가]  «그 글자가 있는가» 가 아니라 표를 **소스에서 오려 내 실제로 돌려**
//     ① 단계마다 다른 그림을 고르는가 ② 그 그림이 저장소에 **실재하는가**(커밋 누락 방지 —
//     2026-08-31 Lily 얼굴이 표만 고치고 파일을 안 담아 며칠 폴백으로 돌던 것과 같은 함정)
//     ③ 열기 «전» 에 열린 그림을 보여주지 않는가(순서 뒤집힘).
//   ⚠️ 「바뀐다」 옆에 「엉뚱한 그림은 아니다」를 짝으로 둔다 — 앞만 보면 «단계마다 아무거나»
//      도 통과한다.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB  = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok  = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };

/** 중괄호·대괄호 짝으로 선언 하나를 오려 낸다(길이로 자르면 옆 코드가 딸려 온다) */
function cutDecl(src, head, open, close) {
  const i = src.indexOf(head); if (i < 0) return null;
  let j = src.indexOf(open, i); if (j < 0) return null;
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === open) d++;
    else if (src[k] === close) { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}
/** SCENES 의 키 → 파일 경로(쿼리 제거) */
function scenePaths(decl) {
  const out = {};
  for (const m of decl.matchAll(/(\w+)\s*:\s*'(\/img\/[^']+)'/g)) out[m[1]] = m[2].split('?')[0];
  return out;
}

/* ══ ① escape-voice — 여섯 장소가 같은 뼈대를 쓴다 ══════════════════════ */
console.log('\n① 음성 방탈출(escape-voice) — 단계마다 장면이 바뀌는가');
{
  const src = readFileSync(join(PUB, 'student-game-escape-voice.html'), 'utf8');
  const scenesDecl = cutDecl(src, 'var SCENES=', '{', '}');
  const locArt     = cutDecl(src, 'function locArt(', '{', '}');
  const stepArt    = cutDecl(src, 'var STEP_ART=', '{', '}');
  ok(!!scenesDecl && !!locArt && !!stepArt, '전제: SCENES·locArt·STEP_ART 를 오려 냈다');
  if (scenesDecl && locArt && stepArt) {
    const SCENES = scenePaths(scenesDecl);
    // 표를 실제로 평가한다 — 「그 글자가 있는가」로는 무엇이 나오는지 알 수 없다
    const ART = new Function(`${locArt}; ${stepArt}; return STEP_ART;`)();
    const LOCS = ['study', 'classroom', 'restroom', 'storage', 'rooftop', 'playground'];
    const STEPS = ['desk', 'drawer', 'painting', 'books', 'code', 'key', 'door'];
    ok(LOCS.every(l => ART[l]), `여섯 장소가 모두 표에 있다 (${Object.keys(ART).length}곳)`);

    let missing = [], sameAsBefore = [], leaked = [];
    for (const L of LOCS) {
      for (const S of STEPS) {
        const t = ART[L] && ART[L][S];
        if (!t) { missing.push(`${L}.${S}`); continue; }
        for (const ph of ['before', 'after']) {
          const p = SCENES[t[ph]];
          if (!p) { missing.push(`${L}.${S}.${ph}=${t[ph]}`); continue; }
          if (!existsSync(join(PUB, p))) missing.push(`파일없음 ${p}`);
        }
      }
      // 「연 결과」가 눈에 보여야 한다 — 보관함/금고/문 세 고비에서 before ≠ after
      for (const S of ['drawer', 'code', 'door']) {
        const t = ART[L][S];
        if (t && t.before === t.after) sameAsBefore.push(`${L}.${S}`);
      }
      // 순서 뒤집힘 — 열기 «전» 에 열린 그림을 쓰면 안 된다
      if (/Open$|drawerCU$/.test(ART[L].drawer.before)) leaked.push(`${L}.drawer.before`);
      if (/Escape$|^escape$/.test(ART[L].door.before)) leaked.push(`${L}.door.before`);
    }
    ok(missing.length === 0, `표가 가리키는 그림이 전부 실재한다${missing.length ? ' — ' + missing.slice(0, 4).join(', ') : ''}`);
    ok(sameAsBefore.length === 0, `보관함·금고·문은 성공하면 그림이 바뀐다${sameAsBefore.length ? ' — ' + sameAsBefore.join(', ') : ''}`);
    ok(leaked.length === 0, `열기 «전» 에 열린 그림을 보여주지 않는다${leaked.length ? ' — ' + leaked.join(', ') : ''}`);

    // 짝 — 「바뀐다」만 보면 «단계마다 아무 그림» 도 통과한다. 뜻이 맞는지 본다.
    let wrong = [];
    for (const L of LOCS.filter(x => x !== 'study')) {
      if (ART[L].drawer.after   !== L + 'Open')   wrong.push(`${L}.drawer→${ART[L].drawer.after}`);
      if (ART[L].painting.after !== L + 'Safe')   wrong.push(`${L}.painting→${ART[L].painting.after}`);
      if (ART[L].code.after     !== L + 'Key')    wrong.push(`${L}.code→${ART[L].code.after}`);
      if (ART[L].door.after     !== L + 'Escape') wrong.push(`${L}.door→${ART[L].door.after}`);
    }
    ok(wrong.length === 0, `바뀐 그림이 그 단계의 결과와 맞다${wrong.length ? ' — ' + wrong.join(', ') : ''}`);

    // 장소마다 사진 1장으로 되돌아가지 않았는가 — 이 사고의 뿌리
    let flat = [];
    for (const L of LOCS) {
      const keys = new Set(STEPS.flatMap(S => [ART[L][S].before, ART[L][S].after]));
      if (keys.size < 4) flat.push(`${L}(${keys.size}종)`);
    }
    ok(flat.length === 0, `장소마다 최소 네 가지 장면을 쓴다${flat.length ? ' — ' + flat.join(', ') : ''}`);
  }
}

/* ══ ② escape-school — 성공할 때마다 교실로 되돌아가던 것 ═══════════════ */
console.log('\n② 학교 탈출(escape-school) — 성공이 결과 화면으로 이어지는가');
{
  const src = readFileSync(join(PUB, 'student-game-escape-school.html'), 'utf8');
  const scenesDecl = cutDecl(src, 'var SCENES=', '{', '}');
  const stepArt    = cutDecl(src, 'var STEP_ART=', '{', '}');
  ok(!!scenesDecl && !!stepArt, '전제: SCENES·STEP_ART 를 오려 냈다');
  if (scenesDecl && stepArt) {
    const SCENES = scenePaths(scenesDecl);
    const ART = new Function(`${stepArt}; return STEP_ART;`)();
    const STEPS = ['classroom', 'door1', 'computer', 'note', 'password', 'email', 'door2'];
    ok(STEPS.every(s => ART[s]), '일곱 단계가 모두 표에 있다');
    let missing = [], flat = [];
    for (const S of STEPS) {
      for (const ph of ['before', 'after']) {
        const p = SCENES[ART[S][ph]];
        if (!p) { missing.push(`${S}.${ph}=${ART[S][ph]}`); continue; }
        if (!existsSync(join(PUB, p))) missing.push(`파일없음 ${p}`);
      }
      // 첫 단계(둘러보기)만 빼고 성공하면 화면이 달라져야 한다
      if (S !== 'classroom' && ART[S].before === ART[S].after) flat.push(S);
    }
    ok(missing.length === 0, `표가 가리키는 그림이 전부 실재한다${missing.length ? ' — ' + missing.slice(0, 4).join(', ') : ''}`);
    ok(flat.length === 0, `성공하면 화면이 달라진다${flat.length ? ' — ' + flat.join(', ') : ''}`);
    // ⛔ 교실 전체(room)로 되돌아가는 단계가 없어야 한다 — 이것이 「그대로에요」의 정체였다
    const backToRoom = STEPS.filter(s => s !== 'classroom' && ART[s].after === 'room');
    ok(backToRoom.length === 0, `성공 후 교실 전체로 되돌아가지 않는다${backToRoom.length ? ' — ' + backToRoom.join(', ') : ''}`);
    ok(ART.password.after === 'emailCU' && ART.email.after === 'sentCU',
       '비번이 맞으면 메일창 · 보내면 전송확인으로 이어진다');
  }
}

/* ══ ③ escape-zombie — 캐비닛만 「열린 판」이 없었다 ════════════════════ */
console.log('\n③ 좀비 실험실(escape-zombie) — 캐비닛이 열린 그림으로 바뀌는가');
{
  const src = readFileSync(join(PUB, 'student-game-escape-zombie.html'), 'utf8');
  const scenesDecl = cutDecl(src, 'var SCENES=', '{', '}');
  ok(!!scenesDecl, '전제: SCENES 를 오려 냈다');
  if (scenesDecl) {
    const SCENES = scenePaths(scenesDecl);
    ok(!!SCENES.cabinetOpen, '「열린 캐비닛」 장면이 등록돼 있다');
    ok(SCENES.cabinetOpen && existsSync(join(PUB, SCENES.cabinetOpen)),
       `그 그림이 저장소에 실재한다 (${SCENES.cabinetOpen || '—'})`);
    // 주석을 벗겨 낸 사본으로 배선을 본다 — 설명 주석이 자기를 잡는 것을 막는다
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    ok(/s\.id\s*===\s*'cabinet'\s*&&\s*SCENES\.cabinetOpen/.test(bare),
       '캐비닛을 열면 그 그림을 실제로 건다');
    ok(/setScene\('cabinetOpen'\)/.test(bare), '「열린 판」을 화면에 세운다');
    // 짝 — 그 뒤 다음 장면으로 넘어가는 길이 남아 있어야 한다(열린 채로 굳으면 안 된다)
    ok(/setScene\('cabinetOpen'\)[\s\S]{0,220}setScene\(s\.scene\)/.test(bare),
       '잠깐 보여준 뒤 다음 장면으로 넘어간다');
  }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) { console.log('⚠ 실제 확인 필요'); process.exit(1); }
