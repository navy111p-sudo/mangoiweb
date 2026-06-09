/*!
 * pii-mask.js — 프런트엔드 개인정보(PII) 마스킹 유틸 (2026-06-09)
 *
 *  학생/학부모 전화번호·카카오톡 ID 노출 결함 대응용 클라이언트 방어 계층.
 *  ⚠ 1차 방어는 백엔드(pii-mask.ts) — 하위 권한 계정에는 마스킹된 값만 전송됨.
 *    이 파일은 idempotent(이미 마스킹된 값에 다시 적용해도 안전)한 2차 방어이자
 *    렌더 시 권한 플래그(window.__canViewPII)에 따라 추가 보호한다.
 *
 *  전역 노출: window.PIIMask = { maskPhoneNumber, maskKakaoId, maskByPermission, canView, setCanView }
 */
(function (global) {
  'use strict';

  /**
   * 전화번호 마스킹 — 뒤 4자리를 ****로.
   *   "010-1234-5678" | "01012345678" → "010-1234-****"
   *   "02-123-4567"                   → "02-123-****"
   * @param {string} phone
   * @returns {string}
   */
  function maskPhoneNumber(phone) {
    if (phone == null) return '';
    var raw = String(phone).trim();
    if (!raw) return '';
    if (raw.indexOf('*') > -1) return raw;  // 이미 마스킹됨 → 멱등 반환
    var digits = raw.replace(/\D/g, '');
    if (digits.length < 7) return new Array(Math.max(digits.length, 3) + 1).join('*');

    var TAIL = '****';
    if (digits.length === 11) {
      return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + TAIL;
    }
    if (digits.length === 10) {
      var head = digits.indexOf('02') === 0 ? digits.slice(0, 2) : digits.slice(0, 3);
      var mid = digits.slice(head.length, digits.length - 4);
      return head + '-' + mid + '-' + TAIL;
    }
    if (digits.length === 9 && digits.indexOf('02') === 0) {
      return '02-' + digits.slice(2, 5) + '-' + TAIL;
    }
    return digits.slice(0, digits.length - 4) + '-' + TAIL;
  }

  /**
   * 카카오톡 ID / 이메일 마스킹 — 앞 3글자만 남기고 나머지는 ***.
   *   "kakao_id"           → "kak***"
   *   "navy111p@gmail.com" → "nav***@gmail.com" (도메인 보존)
   * @param {string} id
   * @returns {string}
   */
  function maskKakaoId(id) {
    if (id == null) return '';
    var raw = String(id).trim();
    if (!raw) return '';
    if (raw.indexOf('*') > -1) return raw;  // 이미 마스킹됨 → 멱등 반환
    var at = raw.indexOf('@');
    if (at > 0) {
      var local = raw.slice(0, at);
      var domain = raw.slice(at);
      var head = local.length <= 3 ? local.charAt(0) : local.slice(0, 3);
      return head + '***' + domain;
    }
    if (raw.length <= 3) return raw.charAt(0) + '***';
    return raw.slice(0, 3) + '***';
  }

  /**
   * 값이 이미 마스킹된 표시값(별표 포함)인가? — 마스킹 문자열을 그대로 저장해
   * 원본을 덮어쓰는 손상을 막기 위해 폼 저장 전 검사용.
   */
  function isMaskedValue(v) { return typeof v === 'string' && v.indexOf('*') > -1; }

  // ── 권한 플래그 (백엔드 응답의 can_view_pii 로 설정) ──
  //   기본값 false = 안전측(권한 모름 → 마스킹). hq/none 응답을 받으면 true 로 갱신.
  var _canView = false;
  function setCanView(v) { _canView = !!v; }
  function canView() { return _canView; }

  /**
   * 권한에 따라 마스킹 — 열람 권한 있으면 원본, 없으면 마스킹.
   * @param {string} value
   * @param {'phone'|'id'} type
   */
  function maskByPermission(value, type) {
    if (_canView) return value == null ? '' : String(value);
    return type === 'id' ? maskKakaoId(value) : maskPhoneNumber(value);
  }

  global.PIIMask = {
    maskPhoneNumber: maskPhoneNumber,
    maskKakaoId: maskKakaoId,
    isMaskedValue: isMaskedValue,
    maskByPermission: maskByPermission,
    canView: canView,
    setCanView: setCanView
  };
})(typeof window !== 'undefined' ? window : this);
