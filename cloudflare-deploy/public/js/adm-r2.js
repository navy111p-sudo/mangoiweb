// ═══════════════════════════════════════════════════════════════
// adm-r2.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
      /* ═══ 🧩 운영 인프라 4모듈 프론트 (modx- 네임스페이스, /api/admin/mod/*) ═══ */
      (function(){
        const won = n => '₩' + Number(n||0).toLocaleString('ko-KR');
        const api = async (path, opt={}) => {
          const r = await fetch('/api/admin/mod/' + path, Object.assign({ credentials:'include',
            headers:{ 'Content-Type':'application/json' } }, opt));
          return r.json().catch(()=>({ ok:false }));
        };
        const curMonth = () => new Date().toISOString().slice(0,7);

        // ── ① 정산 ──────────────────────────────────────────
        window.modxSettleSeed = async function(){
          const period = (document.getElementById('modx-settle-period').value) || curMonth();
          // 데모용 결제 6건(B2B/B2C, 지점 3곳) — PG/본사 분개는 서버가 계산
          const branches=[['bz01','부산지점',0.18],['bz02','강남대리점',0.16],['bz03','송파대리점',0.15]];
          const payments=[];
          branches.forEach((b,i)=>{
            payments.push({ pay_id:`${period}_${b[0]}_b2b`, channel:'B2B', branch_id:b[0], branch_name:b[1], period, gross_amount:(i+5)*1000000, hq_rate:b[2] });
            payments.push({ pay_id:`${period}_${b[0]}_b2c`, channel:'B2C', branch_id:b[0], branch_name:b[1], period, gross_amount:(i+3)*800000, hq_rate:b[2] });
          });
          const r = await api('settlement/build', { method:'POST', body:JSON.stringify({ payments }) });
          await modxSettleLoad();
          modxToast(`정산 분개 ${r.inserted||0}건 적재(중복 제외)`);
        };
        window.modxSettleLoad = async function(){
          const period = (document.getElementById('modx-settle-period').value) || curMonth();
          const r = await api('settlement/list?period=' + period);
          const rows = r.rows || [];
          const body = document.getElementById('modx-settle-body');
          if(!rows.length){ body.innerHTML = `<span style="color:#94a3b8">${period} 정산 데이터가 없습니다. ‘샘플 분개’를 눌러보세요.</span>`; return; }
          let h = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px">
            <thead><tr style="background:#f8fafc;color:#475569">
            <th style="padding:6px;text-align:left">지점/가맹점</th><th style="padding:6px">채널</th>
            <th style="padding:6px;text-align:right">총결제액</th><th style="padding:6px;text-align:right">PG수수료(2.86%)</th>
            <th style="padding:6px;text-align:right">본사 수수료</th><th style="padding:6px;text-align:right">→ 지점 송금액</th>
            <th style="padding:6px">상태</th><th style="padding:6px">처리</th></tr></thead><tbody>`;
          rows.forEach(x=>{
            const paid = x.unpaid===0;
            h += `<tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:6px;font-weight:600;color:#1e293b">${x.branch_name||x.branch_id}</td>
              <td style="padding:6px;text-align:center;color:#6366f1;font-weight:600">${x.channel}</td>
              <td style="padding:6px;text-align:right;font-variant-numeric:tabular-nums">${won(x.gross)}</td>
              <td style="padding:6px;text-align:right;color:#dc2626;font-variant-numeric:tabular-nums">-${won(x.pg)}</td>
              <td style="padding:6px;text-align:right;color:#b45309;font-variant-numeric:tabular-nums">-${won(x.hq)}</td>
              <td style="padding:6px;text-align:right;font-weight:700;color:#15803d;font-variant-numeric:tabular-nums">${won(x.payout)}</td>
              <td style="padding:6px;text-align:center">${paid
                ? '<span style="padding:2px 8px;background:#dcfce7;color:#166534;border-radius:99px;font-weight:700">✅ 송금 완료</span>'
                : '<span style="padding:2px 8px;background:#fee2e2;color:#991b1b;border-radius:99px;font-weight:700">⏰ 송금 대기</span>'}</td>
              <td style="padding:6px;text-align:center">${paid ? '<span style="color:#cbd5e1">—</span>'
                : `<button onclick="modxSettlePay('${x.branch_id}','${x.period}')" style="padding:3px 9px;font-size:11px;background:#10b981;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:700">💸 송금하기</button>`}</td>
            </tr>`;
          });
          const totPayout = rows.reduce((a,x)=>a+(x.payout||0),0);
          const totHq = rows.reduce((a,x)=>a+(x.hq||0),0);
          h += `</tbody><tfoot><tr style="background:#eef2ff;font-weight:800">
            <td colspan="5" style="padding:7px;text-align:right;color:#3730a3">합계 — 본사 수수료 ${won(totHq)} ·</td>
            <td style="padding:7px;text-align:right;color:#15803d">${won(totPayout)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
          body.innerHTML = h;
        };
        window.modxSettlePay = async function(branch_id, period){
          if(!confirm('해당 지점 정산액을 송금 완료 처리할까요?')) return;
          await api('settlement/pay', { method:'POST', body:JSON.stringify({ branch_id, period }) });
          await modxSettleLoad(); modxToast('송금 완료 처리됨 ✅');
        };
        window.modxSettlePayAll = async function(){
          const period = (document.getElementById('modx-settle-period').value) || curMonth();
          const r = await api('settlement/list?period=' + period);
          const pend = (r.rows||[]).filter(x=>x.unpaid>0);
          if(!pend.length){ modxToast('송금 대기 건이 없습니다.'); return; }
          if(!confirm(`${pend.length}개 지점을 일괄 송금 완료 처리할까요?`)) return;
          for(const x of pend){ await api('settlement/pay', { method:'POST', body:JSON.stringify({ branch_id:x.branch_id, period:x.period }) }); }
          await modxSettleLoad(); modxToast(`${pend.length}개 지점 일괄 송금 완료 ✅`);
        };

        // ── ② 위험군 + 큐 ───────────────────────────────────
        let _modxRisk = [];
        window.modxRiskScan = async function(){
          const r = await api('risk/scan');
          _modxRisk = r.students || [];
          const body = document.getElementById('modx-risk-body');
          document.getElementById('modx-risk-enq').disabled = _modxRisk.length===0;
          document.getElementById('modx-risk-enq').style.opacity = _modxRisk.length? '1':'.45';
          if(!_modxRisk.length){ body.innerHTML='<span style="color:#16a34a;font-weight:600">✅ 출석률 70% 이하 위험군이 없습니다.</span>'; return; }
          let h = `<div style="margin-bottom:6px;color:#991b1b;font-weight:700">위험군 ${_modxRisk.length}명</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="background:#f8fafc;color:#475569"><th style="padding:6px;text-align:left">학생</th><th style="padding:6px">세그먼트</th><th style="padding:6px;text-align:right">출석률</th><th style="padding:6px">학부모 연락처</th></tr></thead><tbody>`;
          _modxRisk.forEach(s=>{
            const fail = s.segment==='Fail';
            h += `<tr style="border-bottom:1px solid #f1f5f9;background:${fail?'#fef2f2':'#fffbeb'}">
              <td style="padding:6px;font-weight:600">${s.student_name||s.student_id}</td>
              <td style="padding:6px;text-align:center"><span style="padding:2px 8px;border-radius:99px;font-weight:700;background:${fail?'#fecaca':'#fde68a'};color:${fail?'#991b1b':'#92400e'}">${s.segment}</span></td>
              <td style="padding:6px;text-align:right;font-weight:700;color:${fail?'#dc2626':'#b45309'}">${Math.round((s.rate||0)*100)}%</td>
              <td style="padding:6px;text-align:center;color:#64748b">${s.parent_phone||'-'}</td></tr>`;
          });
          h += '</tbody></table></div>';
          body.innerHTML = h;
        };
        window.modxRiskEnqueue = async function(){
          if(!_modxRisk.length) return;
          if(!confirm(`위험군 ${_modxRisk.length}명의 학부모 알림을 큐에 적재할까요?(톤앤매너 자동 조절)`)) return;
          const r = await api('risk/enqueue', { method:'POST', body:JSON.stringify({ students:_modxRisk }) });
          modxToast(`알림 큐에 ${r.enqueued||0}건 적재(pending)`); modxQueueLoad();
        };
        window.modxQueueLoad = async function(){
          const r = await api('queue/list');
          const rows = r.rows || [];
          const body = document.getElementById('modx-risk-body');
          let h = `<div style="margin-bottom:6px;color:#475569;font-weight:700">📥 대기 알림 큐 ${rows.length}건</div>`;
          if(!rows.length){ h += '<span style="color:#94a3b8">대기 중인 알림이 없습니다.</span>'; }
          else { h += '<div style="display:grid;gap:6px">' + rows.slice(0,30).map(q=>
            `<div style="border:1px solid #fecaca;border-radius:8px;padding:8px;background:#fff">
               <div style="font-weight:700;color:#991b1b;font-size:11.5px">${q.student_name||q.student_id} · ${q.segment||''} · ${q.parent_phone||''} <span style="float:right;color:#f59e0b">${q.status}</span></div>
               <div style="color:#475569;margin-top:3px;font-size:11px;line-height:1.5">${(q.message||'').replace(/</g,'&lt;')}</div></div>`).join('') + '</div>'; }
          body.innerHTML = h;
        };
        // 큐 발송: 먼저 미리보기(dryRun) → 확인 시 실제 발송(dryRun:false)
        window.modxQueueSend = async function(){
          const prev = await api('queue/send', { method:'POST', body:JSON.stringify({ dryRun:true }) });
          if(!prev.pending){ modxToast('발송할 대기 알림이 없습니다.'); modxQueueLoad(); return; }
          if(prev.mode==='disabled'){
            alert(`📤 발송 보류\n\n대기 ${prev.pending}건이 있으나 SOLAPI 발신 키가 설정되지 않아 실제 발송할 수 없습니다.\n(키 설정 시 동일 버튼으로 발송됩니다. 큐는 그대로 유지됩니다.)`);
            modxQueueLoad(); return;
          }
          if(!confirm(`📤 대기 ${prev.pending}건을 실제 발송할까요?\n발신 모드: ${prev.mode==='mock'?'테스트(mock)':'실제(real)'}`)) return;
          const r = await api('queue/send', { method:'POST', body:JSON.stringify({ dryRun:false }) });
          modxToast(`발송 완료 — 성공 ${r.sent||0} / 실패 ${r.failed||0} (${r.mode})`);
          modxQueueLoad();
        };

        // ── ③ 공휴일 + 검증 ─────────────────────────────────
        window.modxHoliSync = async function(){
          const body = document.getElementById('modx-holi-body');
          body.innerHTML = '⏳ 공휴일 동기화 중...';
          const s = await api('holidays/sync', { method:'POST', body:JSON.stringify({ year:2026, countries:['KR','PH'] }) });
          const r = await api('holidays/list?year=2026');
          const rows = r.rows || [];
          if(!rows.length){ body.innerHTML='<span style="color:#dc2626">동기화 결과가 없습니다(외부 API 일시 불가일 수 있음).</span>'; return; }
          const byC = { KR:[], PH:[] };
          rows.forEach(h=>{ (byC[h.country]=byC[h.country]||[]).push(h); });
          const col = (cc,flag)=> `<div style="flex:1;min-width:200px"><div style="font-weight:700;color:#155e75;margin-bottom:4px">${flag} ${cc} (${(byC[cc]||[]).length})</div>`
            + (byC[cc]||[]).slice(0,40).map(h=>`<div style="font-size:11px;color:#475569;padding:1px 0">${h.date} · ${h.name}</div>`).join('') + '</div>';
          body.innerHTML = `<div style="color:#0891b2;font-weight:700;margin-bottom:6px">✅ ${s.upserted||rows.length}건 동기화</div><div style="display:flex;gap:16px;flex-wrap:wrap">${col('KR','🇰🇷')}${col('PH','🇵🇭')}</div>`;
        };
        window.modxValidate = async function(){
          const date = document.getElementById('modx-val-date').value;
          const teacher_id = document.getElementById('modx-val-teacher').value.trim();
          const out = document.getElementById('modx-val-out');
          if(!date){ out.textContent='날짜를 선택하세요'; out.style.color='#dc2626'; return; }
          const r = await api('schedule/validate', { method:'POST', body:JSON.stringify({ date, teacher_id }) });
          if(r.blocked){ out.textContent = '🚫 배정 차단 — ' + r.reason; out.style.color='#dc2626'; }
          else { out.textContent = '✅ 배정 가능'; out.style.color='#16a34a'; }
        };

        // ── ④ 교재-비디오 ───────────────────────────────────
        window.modxTbvSeed = async function(){
          // 교재 1 + 영상 3 + 매핑 + 퀴즈
          await api('textbook/upsert', { method:'POST', body:JSON.stringify({ id:'tb_phonics1', title:'Phonics Level 1', isbn:'978-1-000-00001', level:'A1', unit_count:3 }) });
          const vids=[['vid_p1u1','https://youtu.be/dQw4w9WgXcQ',1,1,'quiz_p1u1'],['vid_p1u2','https://www.youtube.com/watch?v=oHg5SJYRHA0',2,2,'quiz_p1u2'],['vid_p1u3','https://youtu.be/9bZkp7q19f0',3,3,null]];
          for(const v of vids){
            await api('video/upsert', { method:'POST', body:JSON.stringify({ id:v[0], youtube_url:v[1], title:'Lesson '+v[2], lesson_no:v[2] }) });
            await api('textbook/map', { method:'POST', body:JSON.stringify({ textbook_id:'tb_phonics1', video_id:v[0], unit_no:v[3], quiz_id:v[4] }) });
          }
          modxToast('샘플 교재·영상 매핑 생성'); modxTbvLoad();
        };
        window.modxTbvLoad = async function(){
          const r = await api('textbook/resources?textbook_id=tb_phonics1');
          const body = document.getElementById('modx-tbv-body');
          const vids = r.videos || [];
          if(!vids.length){ body.innerHTML='<span style="color:#94a3b8">매핑이 없습니다. ‘샘플 매핑’을 눌러주세요.</span>'; return; }
          let h = `<div style="font-weight:700;color:#166534;margin-bottom:6px">📖 ${r.textbook_title||r.textbook_id} <span style="color:#16a34a;font-weight:400">(레벨 ${r.level||'-'}) · 영상 ${vids.length} · 퀴즈 ${r.quizzes.length}</span></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">`;
          vids.forEach(v=>{
            const thumb = v.youtube_id ? `https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg` : '';
            h += `<a href="${v.youtube_url}" target="_blank" rel="noopener" style="border:1px solid #d1fae5;border-radius:8px;overflow:hidden;text-decoration:none;color:#166534;background:#fff">
              ${thumb?`<img src="${thumb}" style="width:100%;display:block;aspect-ratio:16/9;object-fit:cover" loading="lazy">`:''}
              <div style="padding:6px 8px;font-size:11.5px;font-weight:600">단원${v.unit_no??'-'} · ${v.title||('Lesson '+(v.lesson_no??''))}</div>
              <div style="padding:0 8px 7px;font-size:10.5px;color:${v.quiz_id?'#16a34a':'#94a3b8'}">${v.quiz_id?('📝 복습퀴즈: '+v.quiz_id):'퀴즈 없음'}</div></a>`;
          });
          h += '</div>';
          body.innerHTML = h;
        };

        // ── 공통 토스트 ─────────────────────────────────────
        function modxToast(msg){
          let t = document.getElementById('modx-toast');
          if(!t){ t=document.createElement('div'); t.id='modx-toast'; t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1e293b;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:opacity .3s'; document.body.appendChild(t); }
          t.textContent = msg; t.style.opacity='1';
          clearTimeout(t._tm); t._tm=setTimeout(()=>{ t.style.opacity='0'; }, 2200);
        }
        window.modxToast = modxToast;

        // 카드 최초 펼침 시 정산월 기본값만 세팅(데이터는 버튼 클릭 시 로딩 — 가벼움)
        document.getElementById('card-ops-modules')?.addEventListener('toggle', function(){
          if(this.open){ const m=document.getElementById('modx-settle-period'); if(m && !m.value) m.value=curMonth(); }
        });
      })();
      
