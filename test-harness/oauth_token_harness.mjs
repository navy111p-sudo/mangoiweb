/* ═══════════════════════════════════════════════════════════════════════════
   🌐 소셜 로그인이 «화면만 로그인» 이던 것 감시 (2026-09-01 신설)

   [무엇이 잘못돼 있었나] 이 저장소의 학생 로그인은 **두 벌이 짝**이다:
     · `mangoi_logged_user` — 화면이 «누가 로그인했나» 를 그리는 데 쓴다
     · `mango_token`        — 서버가 «정말 본인인가» 를 가리는 데 쓴다
   그런데 OAuth 콜백(`/api/oauth/:provider/callback`)은 **앞의 것만** 저장하고
   토큰을 안 줬다. 그러면 헤더에는 로그인한 것처럼 보이는데 본인 확인이 필요한
   API(포인트·단어장·판단력·동의 등)가 전부 «남» 으로 판정한다 —
   규칙서 2장 「로그인했는데 또 로그인하래요」와 같은 뿌리다.
   ⚠️ 2026-09-01 에 그 API 들의 소유자 게이트를 조였으므로(PR #581·#641) 더 아프게 드러난다.

   [잰 것 — 2026-09-01]
     · 라이브 `/api/oauth/status` → kakao·naver·google **전부 false**(클라이언트 ID 미등록)
     · `oauth_users` 표는 **아직 없다**
     · `students_erp` 의 social 접두 계정 **52개**(google 30·kakao 22)는 전부
       **카페24 센티넬**(created_at 1751500000000) — 이 경로가 만든 것이 **아니다**
   [판단 — 측정 아님] 즉 지금 밟는 사람은 없고, **KAKAO_CLIENT_ID 를 등록하는 순간** 터지는 자리다.

   🔐 그리고 토큰을 그 응답 HTML 에 싣게 되므로, 같은 페이지의 탈출 구멍을 함께 막아야 한다 —
   이름·이메일은 **프로바이더가 준 값**이고 `JSON.stringify` 는 여는 꺾쇠를 안 막는다.

   [검사 방법] 문자열만 보지 않는다 — 콜백이 만드는 payload 식을 소스에서 오려 내
   **실제로 평가**해서, 스크립트 종료 태그가 든 이름으로도 탈출이 안 되는지 확인한다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✅ ' + n); pass++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

/** 줄 단위 주석 제거 — 블록주석을 정규식 하나로 지우면 짝 없는 «별표+슬래시» 하나에
 *  코드가 통째로 함께 사라진다(이 저장소 index.ts 에서 실측 8만자). */
function strip(src) {
  let inBlk = false;
  return src.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (inBlk) { if (t.includes('*/')) inBlk = false; return ''; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlk = true; return ''; }
    if (t.startsWith('//')) return '';
    return raw;
  }).join('\n');
}

const raw = readFileSync(join(SRC, 'api-students.ts'), 'utf8');
const src = strip(raw);

/** OAuth 콜백 블록을 «중괄호 짝» 으로 자른다. 길이로 자르면 옆 핸들러가 딸려 온다. */
function callbackBlock() {
  const i = src.indexOf('oauthCbMatch');
  if (i < 0) return '';
  const s = src.indexOf('{', i);
  let d = 0;
  for (let j = s; j < src.length; j++) {
    if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return '';
}
const CB = callbackBlock();

console.log('\n[ A. 콜백이 «본인 확인 토큰» 을 발급한다 ]');
{
  check('OAuth 콜백 블록을 찾았다', CB.length > 1500, '길이 ' + CB.length + ' — 구조가 바뀌었나?');
  check('학생 로그인과 같은 방식으로 발급한다(startSession + signUidToken)',
    /startSession\(userId/.test(CB) && /signUidToken\(userId/.test(CB),
    '토큰이 없으면 «화면만 로그인» 이 된다 — 본인 확인이 필요한 API 가 전부 «남» 으로 본다');
  check('발급 실패가 로그인을 통째로 깨뜨리지 않는다(try/catch)',
    /try \{[\s\S]{0,300}?signUidToken\(userId[\s\S]{0,200}?\} catch/.test(CB),
    '여기서 던지면 소셜 로그인 자체가 죽는다');
  check('그 토큰을 응답 payload 에 싣는다', /token: _oauthToken/.test(CB),
    '만들어 놓고 안 실으면 아무 소용이 없다');
}

console.log('\n[ B. 화면이 그 토큰을 «학생 화면이 읽는 키» 로 저장한다 ]');
{
  check("mango_token 으로 저장한다", /setItem\('mango_token', u\.token\)/.test(CB),
    '키 이름이 다르면 서버가 못 읽는다 — 규칙서: 학생 인증은 mangoi_logged_user + mango_token 짝');
  check('토큰이 없으면 옛 토큰을 지운다', /removeItem\('mango_token'\)/.test(CB),
    '남의 옛 토큰이 남아 있으면 «화면만 로그인» 보다 나쁘다');
  check('화면 표시용 키도 그대로 둔다(둘은 짝이다)',
    /setItem\('mangoi_logged_user'/.test(CB),
    '토큰만 저장하면 이번엔 헤더가 로그인을 못 알아본다');
}

console.log('\n[ C. 실제로 돌려 본다 — 프로바이더가 준 이름으로 탈출되는가 ]');
{
  /* 토큰을 이 페이지에 싣기 시작했으니, 이름에 스크립트 종료 태그가 들어오면
     그 자리에서 탈출해 **토큰이 털린다.** payload 만드는 식을 오려 내 실제로 평가한다. */
  const m = CB.match(/const userPayload = (JSON\.stringify\(\{[\s\S]*?\}\)[\s\S]{0,120}?);/);
  check('payload 만드는 식을 소스에서 오려 냈다', !!m, 'userPayload 를 못 찾았다 — 구조가 바뀌었나?');
  if (m) {
    const EVIL = '</scr' + 'ipt><img src=x onerror=alert(1)>';
    const vars = {
      userId: 'kakao_1', name: EVIL, email: EVIL, profileImage: EVIL,
      provider: 'kakao', _oauthToken: 'tok.123',
    };
    let out = null, threw = null;
    try {
      out = Function(...Object.keys(vars), 'return (' + m[1] + ');')(...Object.values(vars));
    } catch (e) { threw = e; }
    check('그 식이 실제로 돈다', threw === null, String(threw && threw.message));
    check('스크립트 종료 태그가 그대로 남지 않는다(탈출 차단)',
      typeof out === 'string' && !/<\/script/i.test(out),
      '결과: ' + String(out).slice(0, 160)
      + '\n       → 프로바이더가 준 이름으로 스크립트를 심을 수 있다. 이 페이지에는 토큰이 있다');
    check('값 자체는 그대로 살아난다(파싱하면 원래 이름)',
      (() => { try { return JSON.parse(out).user_name === EVIL; } catch { return false; } })(),
      '이스케이프가 값을 망가뜨리면 이름이 깨져 보인다');
    check('토큰도 payload 에 실려 있다',
      (() => { try { return JSON.parse(out).token === 'tok.123'; } catch { return false; } })(),
      String(out).slice(0, 160));
  }

  /* 🔴 payload «한 곳» 만 보고 「이 페이지는 안전하다」고 말하면 안 된다 — 실제로 그랬다.
     같은 이름이 그 위 <p> 에도 그대로 박혀 있었고, 그쪽은 <script> «위» 라 파싱 중 먼저 돈다
     (2026-09-01 trap-check 실측 — 토큰을 이 페이지에 실은 뒤라 그대로 탈취 통로였다).
     그래서 «프로바이더가 준 값이 HTML 로 들어가는 자리» 를 전부 센다. */
  /* ⚠️ `provider` 는 뺀다 — 라우트 정규식이 kakao|naver|google 세 값으로 못 박으므로
     프로바이더가 주는 값이 아니다. 다만 그 «못 박음» 이 풀리면 이야기가 달라지므로
     바로 아래에서 그 정규식 자체를 검사한다(빼 놓고 근거를 안 남기면 나중에 뚫린다). */
  const PROVIDER_VALS = ['name', 'email', 'profileImage'];
  const bare = [];
  for (const v of PROVIDER_VALS) {
    // 템플릿 안에서 그 값을 이스케이프 없이 그대로 꽂는 자리
    const re = new RegExp('\\$\\{[^}]*\\b' + v + '\\b[^}]*\\}', 'g');
    for (const hit of CB.matchAll(re)) {
      const t = hit[0];
      if (/\besc\(/.test(t) || /userPayload|_oauthToken/.test(t)) continue;   // 이미 막힌 자리
      if (/JSON\.stringify/.test(t)) continue;                                 // payload 는 위에서 따로 검사
      bare.push(t.slice(0, 70));
    }
  }
  check('프로바이더가 준 값을 HTML 에 «그대로» 꽂는 자리가 없다', bare.length === 0,
    '안 막힌 자리: ' + bare.join(' | ')
    + '\n       → 이 페이지에는 토큰이 있다. sink 가 둘이면 한 곳만 막는 것은 «안 막은 것» 이다');

  /* ⚠️ 「파일 어딘가에 no-store 가 있나」로 보면 무르다 — 에러 경로에도 그 헤더가 있어서,
     **토큰이 실린 성공 응답**에서 빼도 초록불이었다(실측). 그 응답 하나를 콕 집어 본다. */
  const okResp = CB.match(/return new Response\(html,[\s\S]{0,400}?\}\s*\}\s*\)/);
  check('토큰이 실린 «성공 응답» 을 캐시하지 않는다',
    !!okResp && /'Cache-Control':\s*'private, no-store/.test(okResp[0]),
    '공유 캐시에 남으면 한 사람 토큰이 다른 사람에게 나간다\n       (에러 응답에만 붙어 있으면 이 검사는 통과하면 안 된다)');

  check('에러 페이지도 사유를 그대로 뿌리지 않는다',
    /safeMsg/.test(CB) && /replace\(\/\[\^/.test(CB),
    '그 문자열도 프로바이더 응답에서 온다 — 큰따옴표만 지우면 «작다» 기호로 탈출한다');

  check('provider 를 «믿어도 되는» 근거가 코드에 있다(라우트가 세 값으로 못 박는다)',
    /oauth\\\/\(kakao\|naver\|google\)\\\/callback/.test(src),
    '그 정규식이 느슨해지면 provider 도 못 믿는 값이 된다 — 위 목록에 다시 넣을 것');
}

console.log('\n[ D. 이 경로가 아직 안 쓰인다는 근거를 함께 남긴다 ]');
{
  /* «지금은 아무도 안 밟는다» 는 판단의 근거가 코드에 있어야, 나중에 설정이 켜졌을 때
     이 하니스가 왜 있는지 알 수 있다. */
  check('설정 여부를 알려 주는 status 경로가 있다',
    /path === '\/api\/oauth\/status'/.test(src),
    '설정됐는지 확인할 방법이 없으면 «안 쓰인다» 를 확인할 수 없다');
  check('설정이 안 됐으면 인증 URL 을 안 내준다',
    /not_configured/.test(src),
    '설정 없이 인증 URL 을 주면 프로바이더 화면에서 깨진다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 oauth_token_harness 실패'); process.exit(1); }
console.log('🎉 oauth_token_harness — 전부 통과');
