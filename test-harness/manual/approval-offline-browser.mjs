/*
 * work.html 을 실제 브라우저에서 띄우고, 서버 대신 가짜 응답을 물려
 * 「끊겼을 때 쓴 것이 사라지지 않는가」를 실제로 눌러 확인한다.
 * (문법 검사로는 못 잡는 실행 시점 버그를 잡으려는 것)
 */

import { requireBrowser, fileUrl } from './_pw.mjs';

const { chromium, exe } = requireBrowser();


const FILE = fileUrl('cloudflare-deploy/public/work.html');


const HOME = {
  ok: true,
  me: { username: "mgr_melca", name: "Melca", is_exec: false, is_ph_manager: true, is_teacher: false },
  can_approve: false, pending: 1,
  types: [
    { key: "purchase", ko: "물품 구입", en: "Purchase", needs_amount: true, wants_file: true },
    { key: "doc", ko: "일반 문서", en: "Document", needs_amount: false, wants_file: false },
  ],
  inbox: [], mine: [], reuse: [], urgent: [],
};

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log("  OK   " + name); }
  else { FAIL++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  // 서버 대신 가짜 응답. NET 스위치로 «끊김» 을 흉내 낸다.
  await page.addInitScript((home) => {
    window.__NET = true;              // false = 회선 끊김
    window.__POSTS = [];              // 서버가 실제로 받은 기안
    const realFetch = window.fetch;
    window.fetch = function (url, opt) {
      const u = String(url);
      if (!window.__NET) return Promise.reject(new TypeError("Failed to fetch"));
      if (u.indexOf("/api/approval/home") === 0) {
        return Promise.resolve(new Response(JSON.stringify(home), {
          status: 200, headers: { "Content-Type": "application/json" },
        }));
      }
      if (u.indexOf("/api/approval/requests") === 0 && opt && opt.method === "POST") {
        const fd = opt.body;
        const rec = {};
        for (const [k, v] of fd.entries()) rec[k] = (v instanceof Blob) ? ("[file " + v.size + "B]") : v;
        // 같은 열쇠면 같은 건으로 — 서버의 멱등 처리를 흉내 낸다
        const dup = window.__POSTS.find((p) => p.client_key && p.client_key === rec.client_key);
        if (dup) {
          return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 1, duplicate: true }), { status: 200 }));
        }
        window.__POSTS.push(rec);
        return Promise.resolve(new Response(JSON.stringify({ ok: true, id: window.__POSTS.length }), { status: 200 }));
      }
      if (u.indexOf("/api/push/vapid-public-key") === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: "" }), { status: 200 }));
      }
      return realFetch(url, opt);
    };
  }, HOME);

  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForTimeout(400);

  console.log("\n[1] 첫 화면");
  check("분류 버튼이 그려진다", (await page.locator(".kind").count()) >= 2);

  console.log("\n[2] 쓰다 만 기안이 기기에 저장되는가");
  await page.locator(".kind").first().click();               // 물품 구입
  await page.waitForTimeout(150);
  await page.fill("#f_title", "Aircon repair");
  await page.fill("#f_amount", "4200");
  await page.fill("#f_body", "Room 2 aircon stopped during class.");
  await page.waitForTimeout(200);

  const draft = await page.evaluate(() => localStorage.getItem("mangoi_work_draft_v1"));
  check("초안이 저장됐다", !!draft && draft.indexOf("Aircon repair") > 0, draft ? "" : "저장 안 됨");
  const draftKey = draft ? JSON.parse(draft).key : null;
  check("초안에 «같은 건» 열쇠가 들어 있다", !!draftKey);

  console.log("\n[3] 앱이 죽었다 다시 열렸을 때 (새로고침)");
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(600);
  const restoredTitle = await page.inputValue("#f_title").catch(() => "");
  check("쓰던 제목이 되살아난다", restoredTitle === "Aircon repair", "실제: " + JSON.stringify(restoredTitle));
  const restoredAmt = await page.inputValue("#f_amount").catch(() => "");
  check("쓰던 금액이 되살아난다", restoredAmt === "4200", "실제: " + JSON.stringify(restoredAmt));
  const key2 = await page.evaluate(() => JSON.parse(localStorage.getItem("mangoi_work_draft_v1") || "{}").key);
  check("열쇠가 그대로다 (재전송해도 두 건이 되지 않게)", key2 === draftKey);

  console.log("\n[4] 회선이 끊긴 채로 「올리기」");
  await page.evaluate(() => { window.__NET = false; });
  await page.click("#b_submit");
  await page.waitForTimeout(700);

  const queued = await page.evaluate(() => new Promise((res) => {
    const rq = indexedDB.open("mangoi_work", 1);
    rq.onsuccess = () => {
      const tx = rq.result.transaction("outbox", "readonly");
      const g = tx.objectStore("outbox").getAll();
      g.onsuccess = () => res(g.result.map((r) => ({ key: r.key, title: r.title, amount: r.amount })));
      g.onerror = () => res(null);
    };
    rq.onerror = () => res(null);
  }));
  check("기안이 기기에 담겼다", !!queued && queued.length === 1, JSON.stringify(queued));
  check("담긴 기안에 내용이 온전하다", !!queued && queued[0].title === "Aircon repair" && queued[0].amount === "4200");
  check("담긴 기안이 같은 열쇠를 쓴다", !!queued && queued[0].key === draftKey);

  const noteVisible = await page.locator("#queueNote").isVisible();
  check("«저장했습니다» 안내가 보인다", noteVisible);

  const sent0 = await page.evaluate(() => window.__POSTS.length);
  check("아직 서버에는 아무것도 안 갔다", sent0 === 0, "실제: " + sent0);

  console.log("\n[5] 연결이 돌아왔을 때");
  await page.evaluate(() => { window.__NET = true; window.dispatchEvent(new Event("online")); });
  await page.waitForTimeout(1200);

  const posts = await page.evaluate(() => window.__POSTS);
  check("저장해 둔 기안이 자동으로 갔다", posts.length === 1, JSON.stringify(posts));
  check("보낸 내용이 온전하다", posts.length === 1 && posts[0].title === "Aircon repair" && posts[0].amount === "4200");
  check("보낼 때 같은 열쇠를 함께 보냈다", posts.length === 1 && posts[0].client_key === draftKey);

  const leftover = await page.evaluate(() => new Promise((res) => {
    const rq = indexedDB.open("mangoi_work", 1);
    rq.onsuccess = () => {
      const g = rq.result.transaction("outbox", "readonly").objectStore("outbox").getAll();
      g.onsuccess = () => res(g.result.length);
      g.onerror = () => res(-1);
    };
    rq.onerror = () => res(-1);
  }));
  check("보낸 뒤 큐가 비었다", leftover === 0, "남은 건수: " + leftover);

  console.log("\n[6] 같은 것을 또 보내도 두 건이 되지 않는가");
  await page.evaluate(async () => {
    // 큐에 같은 열쇠로 한 번 더 담고 강제로 비워 본다(중복 재전송 상황)
    const d = JSON.parse(localStorage.getItem("mangoi_work_draft_v1") || "null");
    void d;
  });
  const before = await page.evaluate(() => window.__POSTS.length);
  await page.evaluate((k) => {
    return new Promise((res) => {
      const rq = indexedDB.open("mangoi_work", 1);
      rq.onsuccess = () => {
        const tx = rq.result.transaction("outbox", "readwrite");
        tx.objectStore("outbox").put({ key: k, type: "purchase", title: "Aircon repair", amount: "4200", cur: "PHP", body: "", spent: "", ocr: null, file: null, at: Date.now() });
        tx.oncomplete = () => res(1);
        tx.onerror = () => res(0);
      };
      rq.onerror = () => res(0);
    });
  }, draftKey);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.__POSTS.length);
  check("서버에 저장된 기안은 여전히 1건 (중복 안 생김)", after === before && after === 1,
        "before=" + before + " after=" + after);

  console.log("\n[7] 실행 중 오류");
  check("자바스크립트 오류가 없다", errors.length === 0, errors.join(" | "));

  await browser.close();
  console.log("\n──────────────────────────────────────");
  console.log(FAIL ? ("  " + FAIL + "건 실패 / " + (PASS + FAIL) + "건") : ("  전부 통과 (" + PASS + "건)"));
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
