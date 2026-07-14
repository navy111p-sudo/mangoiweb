// ═══════════════════════════════════════════════════════════════
// adm-r17.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // 양식 템플릿 정의
  var FORMS = {
    1: {
      title: '🌴 휴가 계획서',
      subtitle: '인사/총무 — 휴가 신청 양식 (사용중)',
      body: function(){
        return '\
          <div class="rf-form-section">\
            <div class="rf-form-section-title">📌 신청자 정보</div>\
            <div class="rf-form-grid">\
              <div><label class="rf-field-label required">신청자 이름</label><input type="text" id="vc-name" placeholder="홍길동"></div>\
              <div><label class="rf-field-label required">사번 / ID</label><input type="text" id="vc-uid" placeholder="hong_gd"></div>\
              <div><label class="rf-field-label required">소속 부서</label><select id="vc-dept"><option>본사 — 운영팀</option><option>본사 — 강사팀</option><option>본사 — 회계</option><option>지사 — 강남SLP</option><option>지사 — 부산SLP</option></select></div>\
              <div><label class="rf-field-label required">직급</label><select id="vc-rank"><option>강사</option><option>매니저</option><option>팀장</option><option>본부장</option><option>임원</option></select></div>\
            </div>\
          </div>\
          <div class="rf-form-section">\
            <div class="rf-form-section-title">📅 휴가 정보</div>\
            <div class="rf-form-grid">\
              <div><label class="rf-field-label required">휴가 종류</label><select id="vc-type" onchange="rfVacUpdate()"><option value="annual">연차 휴가</option><option value="sick">병가</option><option value="family">경조사</option><option value="reward">포상 휴가</option><option value="etc">기타 (사유 필수)</option></select></div>\
              <div><label class="rf-field-label">반차 여부</label><select id="vc-half"><option value="">전일 사용</option><option value="am">오전 반차</option><option value="pm">오후 반차</option></select></div>\
              <div><label class="rf-field-label required">시작일</label><input type="date" id="vc-from" onchange="rfVacUpdate()"></div>\
              <div><label class="rf-field-label required">종료일</label><input type="date" id="vc-to" onchange="rfVacUpdate()"></div>\
            </div>\
            <div class="rf-stat-box" id="vc-stat">📊 시작일과 종료일을 입력해주세요</div>\
          </div>\
          <div class="rf-form-section">\
            <div class="rf-form-section-title">📝 사유 및 인수인계</div>\
            <div class="rf-form-grid full">\
              <div><label class="rf-field-label required">휴가 사유</label><textarea id="vc-reason" placeholder="구체적인 사유를 작성해주세요. (예: 가족 여행, 개인 사유 등)"></textarea></div>\
              <div><label class="rf-field-label">업무 인수자 (수업 대체)</label><input type="text" id="vc-handover" placeholder="대체 강사 이름 / 사번"></div>\
              <div><label class="rf-field-label">비상 연락처</label><input type="tel" id="vc-emergency" placeholder="010-0000-0000"></div>\
            </div>\
          </div>';
      }
    },
    2: {
      title: '📄 기안 및 지출서 (구)',
      subtitle: '회계 — 일반 기안 및 지출 결의 양식 (사용중)',
      body: function(){
        return '\
          <div class="rf-form-section">\
            <div class="rf-form-section-title">📌 기안자 정보</div>\
            <div class="rf-form-grid">\
              <div><label class="rf-field-label required">기안자</label><input type="text" id="ex-name" placeholder="홍길동"></div>\
              <div><label class="rf-field-label required">사번 / ID</label><input type="text" id="ex-uid" placeholder="hong_gd"></div>\
              <div><label class="rf-field-label required">소속 부서</label><select id="ex-dept"><option>본사 — 운영팀</option><option>본사 — 강사팀</option><option>본사 — 회계</option><option>지사 — 강남SLP</option><option>지사 — 부산SLP</option></select></div>\
              <div><label class="rf-field-label required">기안 일자</label><input type="date" id="ex-date"></div>\
            </div>\
          </div>\
          <div class="rf-form-section">\
            <div class="rf-form-section-title">📑 기안 내용</div>\
            <div class="rf-form-grid">\
              <div><label class="rf-field-label required">분류</label><select id="ex-type" onchange="rfExpUpdate()"><option value="general">일반 기안 (정책·운영)</option><option value="expense">지출 결의</option><option value="contract">계약 체결</option><option value="hr">인사 발령</option><option value="etc">기타</option></select></div>\
              <div><label class="rf-field-label required">긴급도</label><select id="ex-urgency"><option value="normal">일반</option><option value="urgent">긴급</option><option value="urgent-top">최우선</option></select></div>\
            </div>\
            <div class="rf-form-grid full">\
              <div><label class="rf-field-label required">제목</label><input type="text" id="ex-title" placeholder="기안서 제목 (예: 2026년 1분기 강사 워크샵 진행 건)"></div>\
              <div><label class="rf-field-label required">상세 내용</label><textarea id="ex-content" placeholder="기안 배경, 추진 사유, 기대 효과 등을 상세히 작성해주세요" style="min-height:120px"></textarea></div>\
            </div>\
          </div>\
          <div class="rf-form-section" id="ex-expense-section" style="display:none">\
            <div class="rf-form-section-title">💰 지출 정보 (지출 결의 선택 시)</div>\
            <div class="rf-form-grid">\
              <div><label class="rf-field-label required">지출 금액 (원)</label><input type="number" id="ex-amount" placeholder="1000000" min="0"></div>\
              <div><label class="rf-field-label required">지급 수단</label><select id="ex-method"><option>법인카드</option><option>계좌이체</option><option>현금</option><option>법인수표</option></select></div>\
              <div><label class="rf-field-label">증빙 종류</label><select id="ex-proof"><option>세금계산서</option><option>현금영수증</option><option>신용카드 매출전표</option><option>기타</option></select></div>\
              <div><label class="rf-field-label">집행 예정일</label><input type="date" id="ex-pay-date"></div>\
            </div>\
          </div>\
          <div class="rf-form-section">\
            <div class="rf-form-section-title">👥 결재선</div>\
            <div class="rf-form-grid">\
              <div><label class="rf-field-label required">1차 결재자 (팀장)</label><input type="text" id="ex-app1" placeholder="김팀장"></div>\
              <div><label class="rf-field-label">2차 결재자 (본부장)</label><input type="text" id="ex-app2" placeholder="박본부장"></div>\
              <div><label class="rf-field-label">최종 결재자 (대표)</label><input type="text" id="ex-final" placeholder="대표이사"></div>\
              <div><label class="rf-field-label">참조 (수신)</label><input type="text" id="ex-cc" placeholder="회계팀, 인사팀"></div>\
            </div>\
          </div>';
      }
    }
  };

  // 현재 열린 양식 ID
  var currentFormId = null;

  // 모달 열기
  window.rfOpen = function(id){
    var form = FORMS[id];
    if (!form) {
      alert('양식 #' + id + ' 정의 없음 — 기본 빈 양식으로 표시합니다.');
      return;
    }
    currentFormId = id;
    document.getElementById('rf-modal-title').textContent = form.title;
    document.getElementById('rf-modal-subtitle').textContent = form.subtitle;
    document.getElementById('rf-modal-body').innerHTML = form.body();
    document.getElementById('rf-modal-overlay').classList.add('show');
    document.body.style.overflow = 'hidden';
    // 오늘 날짜 기본값
    var today = new Date().toISOString().slice(0, 10);
    var dateInputs = document.querySelectorAll('#rf-modal-body input[type="date"]');
    dateInputs.forEach(function(el){ if (!el.value) el.value = today; });
    console.log('[ph108] 양식 #' + id + ' 미리보기 열림');
  };

  // 모달 닫기
  window.rfCloseModal = function(){
    document.getElementById('rf-modal-overlay').classList.remove('show');
    document.body.style.overflow = '';
    currentFormId = null;
  };

  // ESC 키로 닫기
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && document.getElementById('rf-modal-overlay').classList.contains('show')) {
      rfCloseModal();
    }
  });

  // 휴가 일수 자동 계산
  window.rfVacUpdate = function(){
    var f = document.getElementById('vc-from');
    var t = document.getElementById('vc-to');
    var s = document.getElementById('vc-stat');
    if (!f || !t || !s) return;
    if (!f.value || !t.value) { s.textContent = '📊 시작일과 종료일을 입력해주세요'; return; }
    var fd = new Date(f.value), td = new Date(t.value);
    if (td < fd) { s.textContent = '⚠ 종료일이 시작일보다 빨라요'; s.className = 'rf-stat-box warn'; return; }
    var days = Math.floor((td - fd) / 86400000) + 1;
    s.textContent = '📊 사용 휴가 일수: ' + days + '일 (' + f.value + ' ~ ' + t.value + ')';
    s.className = 'rf-stat-box';
  };

  // 지출 결의 선택 시 금액 섹션 표시
  window.rfExpUpdate = function(){
    var type = document.getElementById('ex-type').value;
    var sec = document.getElementById('ex-expense-section');
    if (sec) sec.style.display = (type === 'expense') ? '' : 'none';
  };

  // 임시 저장
  window.rfSaveDraft = function(){
    if (!currentFormId) return;
    console.log('[ph108] 임시 저장 — 양식 #' + currentFormId);
    alert('💾 임시 저장 완료\n\n나중에 "내 작성 중 문서" 에서 이어서 작성하실 수 있습니다.');
  };

  // 결재 상신
  window.rfSubmit = function(){
    if (!currentFormId) return;
    if (!confirm('결재를 상신하시겠습니까?\n\n상신 후에는 결재자가 승인/반려할 수 있습니다.')) return;
    console.log('[ph108] 결재 상신 — 양식 #' + currentFormId);
    alert('📤 결재 상신 완료\n\n결재자에게 알림이 발송됩니다.\n(실서비스에서는 백엔드 API 호출 + 알림톡 발송)');
    rfCloseModal();
  };

  console.log('[ph108] 양식 미리보기 모달 초기화 완료 — rfOpen(id) 로 양식 ID 1, 2 호출 가능');
})();
