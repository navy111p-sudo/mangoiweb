# -*- coding: utf-8 -*-
import io, os
FONTDIR = os.path.abspath('fonts/package/files')
R = 'file://' + FONTDIR + '/noto-sans-kr-korean-400-normal.woff2'
B = 'file://' + FONTDIR + '/noto-sans-kr-korean-700-normal.woff2'

CSS = """
@font-face{font-family:'NSK';src:url('%s') format('woff2');font-weight:400;font-display:block}
@font-face{font-family:'NSK';src:url('%s') format('woff2');font-weight:700;font-display:block}
@page{size:A4;margin:9mm 10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'NSK','Liberation Sans',sans-serif;color:#16202b;font-size:10.3pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hd{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2.5px solid #0b6e63;padding-bottom:5px;margin-bottom:8px}
h1{font-size:19.5pt;font-weight:700;color:#0b3d38;letter-spacing:-.3px}
.sub{font-size:9.1pt;color:#55636f;margin-top:2px}
.url{background:#0b6e63;color:#fff;font-weight:700;font-size:12.4pt;padding:6px 14px;border-radius:7px;white-space:nowrap}
h2{font-size:11.5pt;font-weight:700;color:#0b3d38;margin:11px 0 6px;padding-left:7px;border-left:4px solid #f0a202}
.steps{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
.step{border:1.2px solid #cfdbe4;border-radius:9px;padding:8px 10px;background:#f7fafc}
.step .n{display:inline-block;width:17px;height:17px;line-height:17px;text-align:center;border-radius:50%%;background:#0b6e63;color:#fff;font-weight:700;font-size:8pt;margin-right:5px}
.step b{font-size:10.6pt}
.step p{color:#4a5763;font-size:9.2pt;margin-top:3px}
table{width:100%%;border-collapse:collapse;font-size:9.2pt}
th{background:#0b3d38;color:#fff;font-weight:700;padding:5px 7px;text-align:left}
td{border-bottom:1px solid #e2e9ef;padding:4.2px 7px;vertical-align:top}
tr:nth-child(even) td{background:#f7fafc}
.yes{color:#0b6e63;font-weight:700}
.no{color:#9aa6b1}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tips{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.tip{border:1px solid #dbe4ec;border-left:3px solid #0b6e63;border-radius:6px;padding:6px 9px;background:#fff}
.tip b{display:block;font-size:9.7pt;color:#0b3d38}
.tip span{font-size:9.1pt;color:#4a5763}
.warn{border:1.2px solid #f0c36d;background:#fffaf0;border-radius:8px;padding:9px 12px}
.warn li{list-style:none;font-size:9.3pt;margin:4.5px 0;padding-left:17px;position:relative;color:#5d4a1f}
.warn li:before{content:'!';position:absolute;left:0;top:0;width:11px;height:11px;line-height:11px;text-align:center;border-radius:50%%;background:#e8a33d;color:#fff;font-weight:700;font-size:7.5pt}
.warn b{color:#8a5a00}
.new{background:#0b6e63;color:#fff;font-size:7pt;font-weight:700;padding:1px 5px;border-radius:9px;vertical-align:middle;margin-left:4px}
.ft{margin-top:11px;border-top:1px solid #dbe4ec;padding-top:6px;font-size:8.4pt;color:#7a858f;display:flex;justify-content:space-between}
""" % (R, B)

KO = dict(
 title='전자결재 사용법 — 3분이면 끝납니다',
 sub='망고아이 임직원·강사용 안내 · 종이 결재·카톡 보고는 이제 이 화면 하나로',
 url='mangoi.ai/work',
 h1='① 올리는 방법 — 딱 세 번 누릅니다',
 steps=[('주소를 엽니다','휴대폰·PC 어디서나 <b>mangoi.ai/work</b>. 관리자 아이디로 로그인하면 바로 결재함입니다.'),
        ('분류를 고릅니다','큰 버튼 중 하나만 누르세요. <b>누구에게 보낼지는 고르지 않습니다</b> — 결재선은 자동입니다.'),
        ('쓰고 「올리기」','제목과 내용만 필수입니다. 지출이면 금액·영수증 사진, 휴가면 날짜 칸이 저절로 나옵니다.')],
 h2='② 무엇을 올릴 수 있나',
 th=['분류','이럴 때 씁니다','강사도 가능','답변 기한'],
 rows=[('물품 구입','교재·비품·장비를 사야 할 때','—','24시간'),
       ('지출 정산','이미 쓴 돈을 돌려받을 때 (영수증 첨부)','—','24시간'),
       ('인사 · 급여','급여·인사 관련 (한국 본사 전용)','—','48시간'),
       ('고객 불만','학부모·학생 불만이 접수됐을 때','가능','24시간'),
       ('긴급 소통','수업 중단·사고 등 지금 알려야 할 때','가능','2시간'),
       ('일반 문서','보고·기안·그 밖의 문서','—','48시간'),
       ('휴가 신청','연차·병가·경조사 (날짜 입력)','가능','24시간')],
 h3='③ 편하게 쓰는 요령',
 tips=[('영수증은 사진 한 장','찍으면 금액·날짜를 자동으로 읽어 채웁니다. 앨범에서 골라도 됩니다.'),
       ('말로 입력 (영어)','타자 대신 말하면 제목·내용 초안이 만들어집니다.'),
       ('「지난번과 같이」','매달 같은 지출이면 버튼 한 번으로 그대로 채워집니다.'),
       ('인터넷이 끊겨도 OK','올린 것이 기기에 저장됐다가 연결되면 자동으로 전송됩니다.'),
       ('쓰다 말아도 남습니다','창을 닫아도 쓰던 내용이 그대로 살아납니다 (사진은 다시 찍어 주세요).'),
       ('휴가는 한 번만','승인되면 그 기간 수업 예약이 자동으로 막힙니다. 캘린더에 또 적지 마세요.')],
 h4='④ 알아두시면 좋습니다',
 warns=['<b>카카오톡에서 링크를 열면 로그인이 안 될 수 있습니다.</b> 「크롬으로 열기」를 누르고 다시 들어와 주세요 (카톡 브라우저가 로그인 정보를 돌려주지 않습니다).',
        '<b>금액이 크면 2단계입니다.</b> 5,000 페소 · 12만 원을 넘으면 담당자 승인 뒤 경영진 승인이 한 번 더 있습니다.',
        '<b>답이 늦으면 자동으로 다시 알립니다.</b> 기한을 넘기면 재알림, 이틀 더 지나면 경영진 결재함으로 올라갑니다.',
        '<b>휴가·출장으로 자리를 비울 때</b>는 오른쪽 위 「부재중」에서 대신 결재할 사람을 정해 두세요. 결재가 멈추지 않습니다.',
        '<b>관리자 화면에서도 바로 갑니다.</b><span class="new">NEW</span> 「품질·이력 ▸ 보고서 양식」에서 양식을 보고 「이 양식으로 결재 올리기」를 누르면 그 결재 폼이 바로 열립니다.'],
 ft1='망고아이 전자결재 · 이 안내문은 화면이 바뀌면 함께 갱신됩니다',
 ft2='문의: 본사 운영팀')

EN = dict(
 title='How to Use e-Approval — It Takes 3 Minutes',
 sub='For Mango-i staff and teachers · No more paper forms or KakaoTalk reports — one screen does it all',
 url='mangoi.ai/work',
 h1='1. How to submit — just three taps',
 steps=[('Open the page','From your phone or PC: <b>mangoi.ai/work</b>. Log in with your admin ID and you land in your approval box.'),
        ('Pick a category','Tap one of the big buttons. <b>You never choose who to send it to</b> — the approval route is automatic.'),
        ('Write, then Submit','Only title and detail are required. Amount and receipt appear for expenses; date fields appear for time off.')],
 h2='2. What you can submit',
 th=['Category','Use it when','Teachers too','Reply due'],
 rows=[('Purchase','You need to buy books, supplies or equipment','—','24 hours'),
       ('Expense','You already paid and want it back (attach receipt)','—','24 hours'),
       ('HR &amp; Pay','Payroll and HR matters (Korea head office only)','—','48 hours'),
       ('Complaint','A parent or student has raised a complaint','Yes','24 hours'),
       ('Urgent','Class stopped, accident — something people must know now','Yes','2 hours'),
       ('Document','Reports, proposals and other paperwork','—','48 hours'),
       ('Time off','Leave, sick days, family events (pick the dates)','Yes','24 hours')],
 h3='3. Tips that save you time',
 tips=[('One photo of the receipt','The amount and date are read automatically. Picking from your album works too.'),
       ('Speak it (English)','Say it instead of typing — a draft title and detail are written for you.'),
       ('“Same as last time”','For a monthly repeat, one tap fills the whole form.'),
       ('Works with no internet','Your request is kept on the device and sent by itself once you are back online.'),
       ('Half-written is kept','Close the window and what you wrote is still there (the photo needs retaking).'),
       ('Time off, entered once','Once approved, bookings for those days are blocked automatically. No calendar entry needed.')],
 h4='4. Good to know',
 warns=['<b>Opening the link inside KakaoTalk may fail to log you in.</b> Tap “Open in Chrome” and try again (the Kakao browser does not return the login cookie).',
        '<b>Larger amounts need two steps.</b> Above PHP 5,000 / KRW 120,000 the staff approval is followed by an executive approval.',
        '<b>Late replies are chased automatically.</b> Past the deadline you are reminded again; after two more days it moves to the executives.',
        '<b>Going on leave or a trip?</b> Set a stand-in under “Away” (top right) so approvals never stall while you are out.',
        '<b>There is a shortcut in the admin screen.</b><span class="new">NEW</span> Under “Quality &amp; audit ▸ Report Forms”, preview a form and tap “Submit with this form” — that approval form opens straight away.'],
 ft1='Mango-i e-Approval · This sheet is updated whenever the screen changes',
 ft2='Questions: Head Office Operations')

def build(d, lang):
    steps = ''.join('<div class="step"><b><span class="n">%d</span>%s</b><p>%s</p></div>' % (i+1, t, p)
                    for i,(t,p) in enumerate(d['steps']))
    rows = ''.join('<tr><td><b>%s</b></td><td>%s</td><td class="%s">%s</td><td>%s</td></tr>'
                   % (a, b, ('yes' if c not in ('—',) else 'no'), c, e) for a,b,c,e in d['rows'])
    tips = ''.join('<div class="tip"><b>%s</b><span>%s</span></div>' % (t, s) for t,s in d['tips'])
    warns = ''.join('<li>%s</li>' % w for w in d['warns'])
    return """<!doctype html><html lang="%s"><head><meta charset="utf-8"><title>%s</title><style>%s</style></head><body>
<div class="hd"><div><h1>%s</h1><div class="sub">%s</div></div><div class="url">%s</div></div>
<h2>%s</h2><div class="steps">%s</div>
<h2>%s</h2><table><tr>%s</tr>%s</table>
<h2>%s</h2><div class="tips">%s</div>
<h2>%s</h2><div class="warn"><ul>%s</ul></div>
<div class="ft"><span>%s</span><span>%s</span></div>
</body></html>""" % (lang, d['title'], CSS, d['title'], d['sub'], d['url'],
     d['h1'], steps, d['h2'], ''.join('<th>%s</th>' % x for x in d['th']), rows,
     d['h3'], tips, d['h4'], warns, d['ft1'], d['ft2'])

io.open('guide_ko.html','w',encoding='utf-8').write(build(KO,'ko'))
io.open('guide_en.html','w',encoding='utf-8').write(build(EN,'en'))
print('written')
