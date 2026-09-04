/* ═══════════════════════════════════════════════════════════════════════════
   🌐 net-prefix.ts — 「어느 인터넷 회선인가」를 가리는 정본 (2026-09-03)

   [왜 만들었나] 2026-09-03 필리핀 수업 사고를 조사하다, 강사 계정 약 10개와 매니저 둘이
     **같은 공인 IP 하나**(216.247.55.144)로 로그인한다는 것이 `admin_login_history` 에서
     드러났다 = 사무실 인터넷 회선 하나를 전원이 나눠 쓴다. 그런데 회선품질 기록
     (`vc_quality`)은 사람(uid)별로만 남아서 «그 회선이 매일 몇 시에 막히는가» 를 볼 수 없었다.
     통신사에 항의하려면 그 표가 필요하다.

   [왜 IP 를 통째로 안 남기나] 이 표에는 **학생 29,000명**의 기록도 함께 쌓인다. 그중 다수가
     미성년자다. «어느 회선인가» 를 묶는 데 필요한 것은 네트워크 부분뿐이므로 마지막
     옥텟(IPv4) / 인터페이스 부분(IPv6)을 버린다. 사무실처럼 여럿이 같은 공인 IP 를 쓰는
     경우는 어차피 완전히 같은 값이라 묶임이 흐트러지지 않는다.
     ℹ️ 강사·관리자의 «정확한 IP» 가 필요하면 `admin_login_history.ip` 에 이미 있다
        (로그인 기록 — 예전부터 전량 저장 중). 그래서 여기서 덜 남겨도 잃는 것이 없다.

   ⛔ 이 값으로 사람을 특정하거나 차단하지 말 것 — «회선이 나쁜 시간대» 를 보는 용도다.
      같은 /24 에 남남이 섞일 수 있고(통신사 공유), 한 사람이 여러 /24 를 오갈 수도 있다
      (실측: 그 사무실이 8/28 에 216.247.53.x → 216.247.55.x 로 바뀌었다).
      그래서 통신사(ASN)를 함께 남긴다 — /24 가 바뀌어도 ASN 은 같다.
   ═══════════════════════════════════════════════════════════════════════════ */

/** IPv4 는 /24, IPv6 는 /48 로 잘라 «회선» 을 나타내는 문자열을 만든다.
 *  못 읽는 값이면 빈 문자열 — ⛔ 추측해서 아무 값이나 만들지 않는다(빈 값은 «모름» 이고,
 *  읽는 쪽이 «모름» 을 한 회선으로 묶어 버리면 그게 더 나쁘다). */
export function ipToNet(raw: string): string {
  const ip = String(raw || '').trim().toLowerCase();
  if (!ip) return '';
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) 는 IPv4 로 본다
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  const v4 = mapped ? mapped[1] : ip;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v4)) {
    const p = v4.split('.');
    if (p.some(s => s.length > 3 || Number(s) > 255)) return '';
    return `${Number(p[0])}.${Number(p[1])}.${Number(p[2])}.0/24`;
  }
  if (ip.indexOf(':') < 0) return '';
  // IPv6 — «::» 압축을 펴고 앞 3그룹(=/48)만 남긴다
  const parts = expandV6(ip);
  if (!parts) return '';
  return `${parts[0]}:${parts[1]}:${parts[2]}::/48`;
}

/** IPv6 를 8그룹으로 편다. 형식이 어긋나면 null. */
function expandV6(ip: string): string[] | null {
  if (!/^[0-9a-f:]+$/.test(ip)) return null;
  const dbl = ip.split('::');
  if (dbl.length > 2) return null;
  const head = dbl[0] ? dbl[0].split(':') : [];
  const tail = dbl.length === 2 ? (dbl[1] ? dbl[1].split(':') : []) : [];
  if (dbl.length === 1) {
    if (head.length !== 8) return null;
  } else {
    if (head.length + tail.length > 7) return null;   // «::» 는 최소 1그룹을 대신한다
  }
  const fill = 8 - head.length - tail.length;
  const all = dbl.length === 1 ? head : head.concat(Array(fill).fill('0'), tail);
  if (all.length !== 8) return null;
  const out: string[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(String(parseInt(g, 16).toString(16)));   // 앞의 0 제거(2406:05900 → 5900)
  }
  return out;
}

/** 통신사 표기 — Cloudflare 가 주는 ASN 과 조직명을 «AS9299 PLDT» 한 문자열로 만든다.
 *  ⚠️ 둘 다 없을 수 있다(로컬 개발·테스트). 그때는 빈 문자열이고, 화면은 «—» 로 그린다. */
export function asLabel(asn: any, org: any): string {
  const n = Number(asn);
  const o = String(org || '').trim().slice(0, 60);
  if (Number.isFinite(n) && n > 0) return o ? `AS${n} ${o}` : `AS${n}`;
  return o;
}
