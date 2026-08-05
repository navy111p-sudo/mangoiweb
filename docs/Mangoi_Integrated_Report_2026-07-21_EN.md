# Mangoi Integrated Report — July 21, 2026 (Kmong Meeting & Development Status)

Prepared by: Mangoi Development AI (Claude) · For: Management & Staff (KR/PH)

---

## 1. Today in 3 Lines

1. **SRS v2.1 published** (27-page full system specification) — now covers the Judgment Engine, security upgrades, and the server migration plan.
2. **Joint meeting with Kmong + "Smart Developer" completed** — they proposed a rebuild (KRW 60M–300M). After review, **a rebuild is NOT needed**. Recommended path: a small on-call maintenance contract + a separate quote for server migration only.
3. **The most urgent task is the server move** — our Cafe24 hosting contract **expires August 15 (D-25)**. This must start now, regardless of any rebuild discussion.

## 2. Today's Deliverables

| Document | Content |
|---|---|
| SRS v2.1 (System Specification) | Full system status: 370+ APIs, 52 pages, 15 games, 10+ AI features, security & backup systems |
| Developer Meeting Question Sheet v2 | 6 agenda items prioritized (server move, SSH, payment mapping, legacy PHP, external processes, maintenance) |
| Emergency Response One-Pager (for staff) | 3-step guide for staff when the site has problems |
| On-Call Contract Terms Request (to Kmong) | Written request for per-incident support rates & SLA — reply due Fri, Jul 24 |

## 3. Kmong Meeting Analysis (49-min recording transcribed + meeting notes)

### 3.1 Their Proposal

- Migrate (= rebuild) our system onto their stack (Spring Boot / Next.js / PostgreSQL) + 1 AI feature = minimum KRW 60M. Full rebuild with AI = minimum KRW 300M / 6+ months.
- They recommend buying a commercial video-call solution instead of our own.
- Kmong will send a written proposal with budget options by email (**still waiting** — a comparison table will be added to this report when it arrives).

### 3.2 Review — Where We Agree vs. Disagree

**Points we AGREE with (and will fix ourselves):**

| Their point | Our action |
|---|---|
| The UI is too complex; doesn't feel like a polished IT product | Simplify the home screen (3-button layout), hide new features by default, add onboarding |
| Even good features go unused (their chatbot example) | Measure menu usage → remove or merge low-usage features |
| Having no dev team is risky in emergencies | Solve with a per-incident on-call contract (insurance), minimal fixed cost |
| Ship step-by-step, continuously | Already our daily practice (develop → verify → deploy every day) |

**Claims we DISAGREE with (not true for our system):**

| Their claim | The facts |
|---|---|
| "Self-built video calls are unstable, overload servers, cost a lot" | Ours is P2P + serverless — video does not pass through our servers, so "overload/heat" doesn't apply. Already running real classes with auto-recovery and low-bandwidth fallback, fully tested |
| "200,000 concurrent users is too hard" | Our classes are 1:1 / small groups; rooms scale automatically. 200K is an irrelevant scare number |
| "An AI assistant is a huge, expensive project" | We already run 10+ AI features (ops assistant, consultation avatar, warm-up, judgment training, etc.) |
| "You must re-architect the system to add AI" | AI is already integrated and running — the premise is false |
| Their proposed "1 AI feature" (auto class report after each lesson) | **Already built and live** (teacher AI coaching + monthly reports + judgment growth reports) |

Note: Most of the meeting discussed our **old system** (2019 PHP + external video vendor + KCP payments). The new Cloudflare system was not deeply reviewed by them (they were unfamiliar with our core technologies).

### 3.3 Budget Assessment

- KRW 60M–300M is essentially **the cost of throwing away what we already have and rebuilding it** — likely with only part of today's features.
- A 6-month rebuild does not solve the urgent **Aug 15 hosting expiry**.
- Recommendation: No rebuild ❌ / ✅ per-incident on-call contract + separate migration quote + (optional) a small UX consulting job to test their quality.

## 4. Real Tasks Discovered in the Meeting

1. **Port the "payment → auto-scheduling" automation (important)**: In the old system, when a student pays, they pick days/times/teacher, and the system auto-creates the schedule, auto-extends sessions, auto-closes after non-payment, and blocks double-booking. This automation must be ported to the new system so managers don't do it by hand.
2. **UX simplification** (see 3.2).
3. ⚠ They asked for a back-office **account or screenshots** — do NOT hand over real accounts. Provide screenshots + (after NDA) the SRS.

## 5. Plan (by priority)

| Priority | Task | Owner · Deadline |
|---|---|---|
| P0 | Restore Cafe24 SSH access → migrate server to NCP | CEO (phone) → AI (execution) · **countdown to Aug 15, start now** |
| P0 | Review Kmong's written proposal (comparison table) | AI · upon arrival |
| P1 | Backfill payment→student mapping (fix 79% unattributed July revenue) | AI · after SSH restored |
| P1 | Port payment→auto-scheduling | AI + Managers · right after migration |
| P1 | Toss PG review (go live with payments) | CEO |
| P2 | UX diet (simpler home, usage metrics) | AI · in parallel |
| P2 | KakaoTalk notification template approvals | CEO |
| P3 | Academy-management (ERP) B2B expansion roadmap | after migration stabilizes |

## 6. Roles

| Who | What |
|---|---|
| CEO | Decisions & budget; external calls/contracts (Cafe24, NCP, PG, Kakao); weekly 30-min priority meeting; observe real classes for UX pain points |
| AI (Claude) | All development, deployment, security, maintenance; execute server migration; port payment automation; UX improvements; keep documents current |
| Korean Managers | Explain old-system payment/scheduling rules (interviews); beta-test new features for 1 week before release; single channel for bug reports; know the Emergency One-Pager |
| Philippine Teachers & Managers | Feedback on the English teacher UI; verify video-call quality on local networks (the real test for low-bandwidth mode); onboard new teachers with the EN training manual; monthly feedback on whether AI coaching reports actually help |

## 7. Kmong Meeting-Minutes Email Arrived (Jul 21, 14:25) — Review Summary

- What arrived is **meeting minutes + requests**, not yet the quotation ("proposal to follow after careful review").
- Three key corrections we will send back: ① the SRS they are working from is the **outdated v1.1 (Jul 7)** — three weeks behind v2.1 ② the "KCP→Toss payment migration" they scoped is **already done** by us (awaiting PG review) — must be excluded from any quote ③ the MVP AI feature they proposed ("auto class report after each lesson") is **already live** — a different feature must be chosen.
- The one real point of agreement: the **payment→auto-scheduling logic** matters most (we already started porting it).
- Their requests: back-office **account credentials** (❌ declined — we provide a menu-structure document + masked screenshots + SRS v2.1 after NDA) and confirming the MVP AI feature.
- A full reply draft (corrections + alternatives + a request to split the quote into: per-feature pricing / maintenance SLA / server migration priced separately with a **Jul 24 deadline**) is ready for the CEO to send.
- ⚠ Their "3-year long-term enhancement" phrasing may foreshadow a long lock-in contract — if the quote includes multi-year terms, counter with 1-year renewable.

— End —
