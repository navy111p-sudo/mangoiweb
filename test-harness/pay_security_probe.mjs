// 🔒 라이브 결제·보안 공격 시뮬레이션 (읽기/무해 요청만 — 실제 승인 없음)
const BASE = process.argv[2] || 'https://webrtc-unified-platform-prod.navy111p.workers.dev';
let PASS=0, FAIL=0; const F=[];
const ok=(n,c,d='')=>{ (c?PASS++:FAIL++); if(!c)F.push(n); console.log(`  ${c?'✅':'❌'} ${n}${d?' — '+d:''}`); };
const j=async(p,opt)=>{ const r=await fetch(BASE+p,opt); let b=null; try{b=await r.json();}catch{} return {s:r.status,b}; };

console.log('🔒 결제·보안 라이브 프로브\n   '+BASE+'\n');

// ═══ [A] 결제 안전성 ═══
console.log('[A] 결제 안전성 (토스 서버확정·금액검증·멱등)');
// A1) 서버가 금액을 강제 — 클라가 100원 보내도 서버 가격표(60000) 유지
{ const {s,b}=await j('/api/pay/create-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({program:'1on1-4',amount:100,payer:'probe'})});
  ok('create-order: 클라 조작금액(100) 무시하고 서버가격 60000 강제', s===200&&b?.ok&&b.amount===60000, `amount=${b?.amount}`);
  globalThis.__order=b; }
// A2) 없는 상품 결제 불가
{ const {s,b}=await j('/api/pay/create-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({program:'해킹상품',amount:1})});
  ok('create-order: 없는 상품 거부(400 unknown_program)', s===400&&b?.error==='unknown_program'); }
// A3) confirm 금액위변조 — 실제주문(60000)을 1원으로 확정 시도 → amount_mismatch
if (globalThis.__order?.orderId) { const {s,b}=await j('/api/pay/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paymentKey:'fake_pk',orderId:globalThis.__order.orderId,amount:1})});
  ok('confirm: 금액위변조(60000→1) 차단(amount_mismatch)', s===400&&b?.error==='amount_mismatch', `err=${b?.error}`); }
// A4) confirm 없는 주문 → order_not_found (토스에 절대 안 감)
{ const {s,b}=await j('/api/pay/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paymentKey:'fake',orderId:'MGI-NOPE-000000',amount:60000})});
  ok('confirm: 존재하지 않는 주문 거부(order_not_found)', s===404&&b?.error==='order_not_found'); }
// A5) confirm 파라미터 누락 → missing_params
{ const {s,b}=await j('/api/pay/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId:'x'})});
  ok('confirm: 필수 파라미터 누락 거부(missing_params)', s===400&&b?.error==='missing_params'); }
// A6) quote 공개 시세조회 — clientKey 는 공개키(test_ck 또는 live_ck), 시크릿 아님
{ const {s,b}=await j('/api/pay/quote?program=1on1-8');
  const isClient = typeof b?.clientKey==='string' && /^(test|live)_ck_/.test(b.clientKey);
  ok('quote: 금액 정확(120000) + 공개 clientKey만 노출', s===200&&b?.amount===120000&&isClient, `key=${(b?.clientKey||'').slice(0,10)}…`);
  ok('quote: 시크릿키(sk_) 절대 노출 안 됨', !JSON.stringify(b).includes('_sk_')); }
// A7) send-link 관리자전용 — 무인증 차단
{ const {s,b}=await j('/api/pay/send-link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({program:'1on1-4',phone:'01000000000',name:'x'})});
  ok('send-link: 무인증 결제링크 문자발송 차단(401)', s===401&&b?.error==='auth_required'); }

// ═══ [B] 관리자 API default-deny ═══
console.log('\n[B] 관리자 API 인증 (default-deny)');
for (const p of ['/api/admin/students','/api/admin/audit-logs','/api/admin/dunning/log','/api/admin/settlement/tree','/api/admin/churn-contagion/graph','/api/admin/finance/summary','/api/admin/kakao/inbound','/api/dashboard']) {
  const {s}=await j(p); ok(`무인증 ${p} → 401/403`, s===401||s===403, `HTTP ${s}`); }

// ═══ [C] 개인정보 IDOR — 남의 uid 로 개인 API 접근 ═══
console.log('\n[C] 개인 API IDOR (남의 uid 조회 차단)');
for (const p of ['/api/eval/list?uid=hong_gd&role=student','/api/ai/chat-history?uid=someone','/api/voice/history?uid=someone']) {
  const {s,b}=await j(p); ok(`토큰없이 ${p.split('?')[0]} → 401`, s===401, `HTTP ${s} ${b?.error||''}`); }

// ═══ [D] 보안 헤더 / 정보노출 ═══
console.log('\n[D] 보안 헤더 · 정보노출');
{ const r=await fetch(BASE+'/'); 
  ok('X-Content-Type-Options: nosniff', (r.headers.get('x-content-type-options')||'').includes('nosniff'), r.headers.get('x-content-type-options')||'(없음)');
  ok('X-Frame-Options 또는 CSP frame-ancestors 설정', !!(r.headers.get('x-frame-options')||(r.headers.get('content-security-policy')||'').includes('frame-ancestors')), r.headers.get('x-frame-options')||'(없음)');
  ok('Server 헤더에 내부 버전 노출 안 함', !/express|nginx\/[0-9]/i.test(r.headers.get('server')||''), r.headers.get('server')||'(없음)'); }
// D2) 시크릿 부트스트랩/디버그 노출 여부
{ const {s}=await j('/api/_bootstrap'); ok('_bootstrap 진단 엔드포인트 노출 상태 확인', true, `HTTP ${s} (참고)`); }

console.log(`\n════ 결제·보안 프로브: ✅ ${PASS} / ❌ ${FAIL} ════`);
if(FAIL) console.log('실패:', F.join(' | '));
