/*
 * 결재함 화면의 «묶어서 승인» 과 «부재중(대결)» 을 실제 브라우저에서 눌러 확인한다.
 * 서버는 띄우지 않는다 — fetch 를 가짜로 바꿔 응답을 물린다(운영 DB 를 건드리지 않는다).
 *
 * 돌리는 법은 같은 폴더 README 참고.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';

const { chromium, exe } = requireBrowser();


const FILE = fileUrl('cloudflare-deploy/public/work.html');


const now = Date.now();
function item(id, title, flags, dueIn) {
  return {
    id, req_type: "purchase", type_ko: "물품 구입", type_en: "Purchase",
    title, amount: 1000 + id, currency: "PHP",
    requester_name: "Melca", created_at: now - 3600000,
    has_file: true, file_name: "r.jpg", status: "pending",
    stage_seq: 1, stage_total: 1,
    stage_due_at: now + (dueIn === undefined ? 86400000 : dueIn),
    summary_ko: "테스트", summary_en: "test",
    flags: flags || [], steps: [],
  };
}

const HOME = {
  ok: true,
  me: { username: "mgr_jjw", name: "본사담당", is_exec: false, is_ph_manager: false, is_teacher: false },
  colleagues: [{ username: "admin", name: "대표" }, { username: "mgr_lby", name: "본사 이" }],
  my_delegate: null,
  can_approve: true, pending: 4,
  types: [{ key: "purchase", ko: "물품 구입", en: "Purchase", needs_amount: true, wants_file: true }],
  inbox: [
    item(1, "Clean one A"),
    item(2, "Clean one B"),
    item(3, "Has a warning", [{ code: "no_file", level: "warn", ko: "영수증 없음", en: "No receipt" }]),
    item(4, "Overdue one", [], -3600000),
  ],
  mine: [], reuse: [], urgent: [],
};

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log("  OK   " + name); }
  else { FAIL++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());          // confirm() 자동 확인

  await page.addInitScript((home) => {
    window.__DECIDED = [];
    window.__DELEGATE = [];
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf("/api/approval/home") === 0) {
        return Promise.resolve(new Response(JSON.stringify(home), { status: 200 }));
      }
      const m = u.match(/\/api\/approval\/requests\/(\d+)\/decide/);
      if (m) {
        window.__DECIDED.push({ id: Number(m[1]), body: JSON.parse(o.body) });
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      if (u.indexOf("/api/approval/delegate") === 0) {
        window.__DELEGATE.push(JSON.parse(o.body || "{}"));
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      if (u.indexOf("/api/push/vapid-public-key") === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: "" }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, HOME);

  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForTimeout(500);

  console.log("\n[1] 묶어서 승인 — 점검을 통과한 건만 묶는가");
  const bulkText = await page.locator("#bulkBox").textContent();
  check("«묶어서 승인» 안내가 보인다", !!bulkText && bulkText.indexOf("2") >= 0,
        "실제: " + JSON.stringify(bulkText));

  await page.locator("#bulkBox button").first().click();
  await page.waitForTimeout(900);

  const decided = await page.evaluate(() => window.__DECIDED);
  const ids = decided.map((d) => d.id).sort();
  check("경고 없는 2건만 승인됐다", JSON.stringify(ids) === "[1,2]", "실제: " + JSON.stringify(ids));
  check("경고가 붙은 건은 승인되지 않았다", ids.indexOf(3) < 0);
  check("마감을 넘긴 건은 승인되지 않았다 (눈으로 보게 남긴다)", ids.indexOf(4) < 0);
  check("전부 «승인» 으로 보냈다", decided.every((d) => d.body.decision === "approved"));

  console.log("\n[2] 부재중(대결)");
  const awayHidden = await page.locator("#awayBtn").isHidden();
  check("«부재중» 버튼이 보인다 (동료 목록이 있을 때)", !awayHidden);

  await page.locator("#awayBtn").click();
  await page.waitForTimeout(200);
  const names = await page.locator("#awayBox button").allTextContents();
  check("대신할 사람 목록이 뜬다", names.indexOf("대표") >= 0, JSON.stringify(names));

  await page.locator("#awayBox button").first().click();
  await page.waitForTimeout(500);
  const dele = await page.evaluate(() => window.__DELEGATE);
  check("위임을 서버로 보냈다", dele.length === 1 && dele[0].delegate_to === "admin",
        JSON.stringify(dele));
  check("기간을 함께 보냈다", dele.length === 1 && dele[0].days === 7);

  console.log("\n[3] 실행 중 오류");
  check("자바스크립트 오류가 없다", errors.length === 0, errors.join(" | "));

  await browser.close();
  console.log("\n──────────────────────────────────────");
  console.log(FAIL ? ("  " + FAIL + "건 실패 / " + (PASS + FAIL) + "건") : ("  전부 통과 (" + PASS + "건)"));
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
