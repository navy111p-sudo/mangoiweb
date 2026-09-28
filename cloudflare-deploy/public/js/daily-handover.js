/* Five-minute handover: suggestions never submit, and acknowledgement never closes a task. */
(function () {
  'use strict';
  var root = document.getElementById('mangoi-handover');
  if (!root) return;
  var $ = function (id) { return root.querySelector('#mh-' + id); };
  var api = '/api/approval/handover', me, members = [], version = 0, revision = 0;
  var reviewed = false, sent = false, busy = false, suggestion = null, requestAttempt = null;
  var started = null, stopped = null, reports = [], originalSubmitted = false, recognition = null;
  var fields = ['work', 'noissue', 'issue', 'noopen', 'open', 'owner', 'deadline', 'student', 'class', 'priority', 'recipient'];
  var labels = { work:'오늘 한 일 / Work completed', issue:'문제·조치 / Issue & action', open:'남은 일 / Open items', owner:'담당자 / Owner', deadline:'기한 / Deadline' };
  function say(message, error) { $('errors').hidden = !error; if (error) $('errors').textContent = message; else $('save-status').textContent = message; }
  function node(tag, content, className) { var n = document.createElement(tag); if (content != null) n.textContent = content; if (className) n.className = className; return n; }
  function clock() { var secs = started == null ? 0 : Math.floor(((stopped == null ? Date.now() : stopped) - started) / 1000); $('time').textContent = String(Math.floor(secs / 60)).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0'); }
  setInterval(clock, 1000);
  function begin() { if (started == null) started = Date.now(); }
  function payload() { return { work:$('work').value.trim(), no_issue:$('noissue').checked, issue:$('issue').value.trim(), no_open:$('noopen').checked, open:$('open').value.trim(), owner:$('owner').value, deadline:$('deadline').value, student:$('student').value.trim(), class_info:$('class').value.trim(), priority:$('priority').value }; }
  function sync() { $('issue').hidden = $('noissue').checked; $('follow').hidden = $('noopen').checked; }
  function row(label,value) { var n=node('div',null,'item'); n.append(node('b',label),node('span',value)); return n; }
  function staffName(username) { var a=members.find(function(m){return m.username===username;}); return a ? (a.name||a.username) : username; }
  function showPayload(target,d,date,name) {
    target.replaceChildren(); target.append(row('날짜·담당자 / Date & staff',date+' / '+name),row(labels.work,d.work||'—'),row(labels.issue,d.no_issue?'문제 없음 / No issues':d.issue||'—'),row(labels.open,d.no_open?'없음 / None':(d.open||'—')+' / '+staffName(d.owner||'—')+' / '+(d.deadline||'—').replace('T',' ')+' KST'));
    if(d.student||d.class_info)target.append(row('학생·수업 / Student & class',[d.student,d.class_info].filter(Boolean).join(' / ')));
  }
  function preview(){showPayload($('preview'),payload(),$('date').value,me?me.name:'');}
  function storageKey(){return 'mangoi_handover_v1:'+me.username+':'+$('date').value;}
  function cacheDraft(){if(!me)return;try{localStorage.setItem(storageKey(),JSON.stringify({payload:payload(),recipient:$('recipient').value,version:version,updated:Date.now()}));$('save-status').textContent='이 기기에 임시 보관 중 / Kept on this device · 서버 저장은 임시 저장 버튼';}catch(e){$('save-status').textContent='기기 임시 보관 불가 · 임시 저장을 눌러 주세요. / Use Save draft.';}}
  function invalidate(){begin();revision++;reviewed=false;sent=false;stopped=null;suggestion=null;requestAttempt=null;$('confirm').checked=false;$('confirm').disabled=true;$('send').disabled=true;$('success').hidden=true;$('ai').hidden=true;$('review-status').textContent='';$('badge').textContent='작성 중 / Editing';$('step1').className='active';$('step2').className='';$('step3').className='';$('errors').hidden=true;sync();preview();cacheDraft();}
  fields.forEach(function(k){$(k).addEventListener('input',invalidate);});
  async function call(path,body,timeout){
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},timeout||20000);
    try{
      var r=await fetch(api+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
      if(r.status===401){location.href='/admin/login?next=%2Fdaily-handover.html';throw new Error('로그인이 필요합니다. / Sign in required.');}
      var j=await r.json();
      if(!r.ok||!j.ok){if(j.error==='conflict')throw new Error('다른 화면에서 변경되었습니다. 작성 내용은 이 기기에 남아 있습니다. 새로 열어 최신 보고와 비교해 주세요. / Another window changed this report. Reopen and compare.');if(r.status===403)throw new Error('본사 관리자만 사용할 수 있습니다. / Head-office staff only.');if(j.error==='already_submitted')throw new Error('제출된 보고는 수정 후 다시 확인·전달해 주세요. / Review and resubmit corrections.');throw new Error('처리하지 못했습니다 / Could not complete: '+(j.error||r.status));}return j;
    }finally{clearTimeout(timer);}
  }
  function networkError(e){say(e.name==='AbortError'?'응답이 늦습니다. 내용은 유지됩니다. 다시 시도해 주세요. / Timed out; your text is preserved.':e.message,true);}
  function populate(d){$('work').value=d.work||'';$('noissue').checked=d.no_issue===true;$('issue').value=d.issue||'';$('noopen').checked=d.no_open===true;$('open').value=d.open||'';$('owner').value=d.owner||'';$('deadline').value=d.deadline||'';$('student').value=d.student||'';$('class').value=d.class_info||'';$('priority').value=d.priority||'normal';sync();}
  function resetReview(){reviewed=false;$('confirm').checked=false;$('confirm').disabled=true;$('send').disabled=true;}
  async function review(useAI){
    if(!me||busy)return;begin();busy=true;$('review').disabled=true;$('manual').disabled=true;
    var rev=revision;resetReview();$('review-status').textContent=useAI?'AI가 문장을 정리하고 있습니다… / AI is reviewing…':'필수 항목 점검 중 / Checking…';
    try{
      var j=await call('/review',{report_date:$('date').value,payload:payload(),use_ai:useAI},16000);
      if(rev!==revision){$('review-status').textContent='내용이 바뀌었습니다. 다시 점검해 주세요. / Text changed; review again.';return;}
      if(!j.check.ready){say('입력해 주세요 / Please complete: '+j.check.missing.map(function(k){return labels[k]||k;}).join(', '),true);$('review-status').textContent='필수 항목 확인 / Required fields';return;}
      if(!$('recipient').value){say('전달 대상을 선택해 주세요. / Select a recipient.',true);return;}
      reviewed=true;$('confirm').disabled=false;$('badge').textContent='확인 준비 / Ready';$('step1').className='';$('step2').className='active';$('step3').className='';$('errors').hidden=true;
      $('review-status').textContent='✓ 필수 항목 완료 / Required fields complete'+(useAI&&j.ai_state!=='ready'?' · AI 연결 지연: 직접 확인 후 제출 가능 / AI unavailable; manual review available':'');
      suggestion=j.suggestion;
      if(suggestion){$('ai').hidden=false;var h=$('ai-text');h.replaceChildren();['work','issue','open'].forEach(function(k){if(suggestion[k])h.append(row(labels[k],suggestion[k]));});suggestion.tips.forEach(function(t){h.append(node('p',t,'small'));});}
      preview();
    }catch(e){networkError(e);$('review-status').textContent='AI 없이 점검을 눌러 다시 시도할 수 있습니다. / Try Check without AI.';}
    finally{busy=false;$('review').disabled=false;$('manual').disabled=false;}
  }
  $('review').onclick=function(){review(true);};$('manual').onclick=function(){review(false);};
  $('apply').onclick=function(){if(!suggestion)return;var s=suggestion;$('work').value=s.work;$('issue').value=s.issue;$('open').value=s.open;invalidate();review(false);};
  $('confirm').onchange=function(){$('send').disabled=!(reviewed&&$('confirm').checked&&!sent&&!busy);};
  async function save(submit){
    if(!me||busy)return;if(submit&&(!reviewed||!$('confirm').checked||sent))return;
    if(submit&&recognition)recognition.stop();
    busy=true;$('save').disabled=true;$('send').disabled=true;var rev=revision;
    var body={report_date:$('date').value,payload:payload(),recipient:$('recipient').value,version:version,submit:submit,confirmed:submit&&$('confirm').checked};
    var signature=JSON.stringify(body);
    if(!requestAttempt||requestAttempt.signature!==signature)requestAttempt={signature:signature,key:crypto.randomUUID()};
    body.request_key=requestAttempt.key;
    try{
      var j=await call('/save',body);version=j.row.version;requestAttempt=null;
      if(submit){originalSubmitted=true;if(rev===revision){sent=true;stopped=Date.now();clock();$('success').hidden=false;$('success').textContent='전달 완료 / Sent · '+staffName(j.row.recipient)+' · '+$('time').textContent+(j.push==='sent'?' · 푸시 발송 / Push sent':' · 보고함에 저장 / Available in reports');$('badge').textContent='확인 대기 / Awaiting review';$('step1').className='';$('step2').className='';$('step3').className='active';$('save-status').textContent='서버에 저장·전달했습니다. / Saved and sent.';resetReview();try{localStorage.removeItem(storageKey());}catch(e){} $('alert').hidden=true;}else{cacheDraft();say('전송 중 변경한 내용이 남아 있습니다. 다시 점검 후 전달해 주세요. / New edits remain unsent.',true);}}
      else{cacheDraft();say('서버에 임시 저장했습니다. / Draft saved to server.',false);}
      await loadList();
    }catch(e){networkError(e);}finally{busy=false;$('save').disabled=originalSubmitted;$('send').disabled=!(reviewed&&$('confirm').checked&&!sent);}
  }
  $('save').onclick=function(){save(false);};$('send').onclick=function(){save(true);};
  function statusLabel(s){return {draft:'초안 / Draft',submitted:'확인 대기 / Awaiting review',acknowledged:'확인 완료 / Acknowledged',changes_requested:'보완 요청 / Changes requested'}[s]||s;}
  function paintList(){
    var host=$('reports'),filter=$('filter').value;host.replaceChildren();
    var list=reports.filter(function(r){return filter==='all'||filter===r.status||(filter==='open'&&!r.payload.no_open)||(filter==='urgent'&&r.payload.priority==='urgent');});
    if(!list.length){host.append(node('p','해당 보고가 없습니다. / No reports.','sub'));return;}
    list.forEach(function(r){
      var item=node('details');item.style.cssText='border-top:1px solid var(--mh-line);padding-top:12px';
      var summary=node('summary',r.staff_name+' · '+statusLabel(r.status)+' · '+r.payload.work.slice(0,90));item.append(summary);
      var content=node('div',null,'preview');showPayload(content,r.payload,r.report_date,r.staff_name);item.append(content);
      item.append(node('p','전달 / To: '+staffName(r.recipient)+' · v'+r.version,'small'));
      if(r.acknowledged_by)item.append(node('p','확인 / Reviewed by: '+staffName(r.acknowledged_by),'small'));
      if(r.feedback)item.append(node('p','보완 요청 / Feedback: '+r.feedback,'notice'));
      if(r.username!==me.username&&r.status==='submitted'&&(r.recipient===me.username||root.dataset.exec==='true')){
        var buttons=node('div',null,'buttons'),ack=node('button','확인 / Acknowledge'),ret=node('button','보완 요청 / Request changes');
        ack.onclick=function(){act(r,'ack',ack);};ret.onclick=function(){act(r,'return',ret);};buttons.append(ack,ret);item.append(buttons);
      }host.append(item);
    });
  }
  async function act(r,kind,button){var feedback='';if(kind==='return'){feedback=prompt('보완할 내용을 적어 주세요. / What needs clarification?')||'';if(!feedback.trim())return;}button.disabled=true;try{await call('/'+kind,{id:r.id,version:r.version,feedback:feedback});await loadList();}catch(e){networkError(e);button.disabled=false;}}
  async function loadList(){
    var date=$('list-date').value, j=await call('/home?date='+encodeURIComponent(date));
    if(date!==$('list-date').value)return;reports=j.reports;paintList();
    var weekday=new Date(date+'T00:00:00Z').getUTCDay();var required=(j.required||[]).filter(function(r){return r.exempt_date!==date&&r.weekdays.split(',').includes(String(weekday));});
    var missing=required.filter(function(r){return !r.submitted_at;});
    $('required').textContent=required.length?'보고 대상 '+required.length+'명 · 미제출 / Not submitted: '+(missing.map(function(r){return r.name||r.username;}).join(', ')||'없음 / None'):'';
  }
  $('filter').onchange=paintList;$('list-date').onchange=function(){loadList().catch(networkError);};$('refresh').onclick=function(){loadList().catch(networkError);};
  var weeknames=['일 / Sun','월 / Mon','화 / Tue','수 / Wed','목 / Thu','금 / Fri','토 / Sat'];
  weeknames.forEach(function(name,i){var label=node('label',null,'check'),c=document.createElement('input');c.type='checkbox';c.value=String(i);c.checked=i>0&&i<6;label.append(c,document.createTextNode(name));$('weekdays').append(label);});
  $('schedule-save').onclick=async function(){var button=$('schedule-save');button.disabled=true;try{await call('/schedule',{enabled:$('schedule-enabled').checked,weekdays:Array.from($('weekdays').querySelectorAll('input:checked')).map(function(c){return Number(c.value);}),due_time:$('due-time').value,exempt_date:$('exempt-date').value});$('schedule-status').textContent='설정 저장 완료 · 마감 30분 전/마감/30분 후 알림. / Saved: reminders at −30 / 0 / +30 min (15-min checks).';}catch(e){networkError(e);}finally{button.disabled=false;}};
  var Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  $('voice').onclick=function(){
    if(recognition){recognition.stop();return;}
    if(!Speech){say('이 브라우저에서는 말로 입력을 지원하지 않습니다. 직접 입력해 주세요. / Dictation is unavailable; please type.',true);return;}
    var rec=new Speech();recognition=rec;rec.lang=$('voice-lang').value;rec.continuous=true;rec.interimResults=false;
    rec.onstart=function(){$('voice').textContent='● 듣는 중 · 정지 / Listening · Stop';};
    rec.onresult=function(event){var additions=[];for(var i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal)additions.push(event.results[i][0].transcript);if(additions.length){$('work').value=($('work').value+' '+additions.join(' ')).trim().slice(0,1500);invalidate();}};
    rec.onerror=function(){say('마이크 권한이나 연결을 확인해 주세요. 직접 입력도 가능합니다. / Check microphone permission or type instead.',true);};
    rec.onend=function(){recognition=null;$('voice').textContent='말로 입력 / Dictate';};
    try{rec.start();}catch(e){recognition=null;networkError(e);}
  };
  document.addEventListener('visibilitychange',function(){if(document.hidden&&recognition)recognition.stop();});
  async function init(){
    fields.forEach(function(k){$(k).disabled=true;});$('review').disabled=true;$('save').disabled=true;$('manual').disabled=true;
    try{
      var j=await call('/home');me=j.me;members=j.members;root.dataset.exec=String(j.can_review_all);
      $('date').value=j.day;$('list-date').value=j.day;$('staff').value=me.name;
      ['owner','recipient'].forEach(function(k){members.forEach(function(m){var option=node('option',m.name?m.name+' ('+m.username+')':m.username);option.value=m.username;$(k).append(option);});});
      if(j.own){version=j.own.version;populate(j.own.payload);$('recipient').value=j.own.recipient;originalSubmitted=!!j.own.submitted_at;$('badge').textContent=statusLabel(j.own.status);if(j.own.feedback){$('alert').hidden=false;$('alert').textContent='보완 요청 / Changes requested: '+j.own.feedback;}}
      else{$('recipient').value=j.default_recipient;$('noissue').checked=true;$('noopen').checked=true;$('alert').hidden=false;$('alert').textContent='오늘 보고를 아직 제출하지 않았습니다. / Today’s handover has not been submitted.';}
      try{var saved=JSON.parse(localStorage.getItem(storageKey())||'null');if(saved&&saved.version===version){populate(saved.payload);$('recipient').value=saved.recipient;$('save-status').textContent='이 기기의 임시 작성 내용을 복원했습니다. / Device draft restored.';}else{$('save-status').textContent=j.own?'저장된 보고를 불러왔습니다. / Saved report loaded.':'날짜·담당자가 자동 입력되었습니다. / Date and staff filled automatically.';}}catch(e){}
      if(j.schedule){$('schedule-enabled').checked=!!j.schedule.enabled;$('due-time').value=j.schedule.due_time;$('exempt-date').value=j.schedule.exempt_date;Array.from($('weekdays').querySelectorAll('input')).forEach(function(c){c.checked=j.schedule.weekdays.split(',').includes(c.value);});}
      sync();preview();reports=j.reports;paintList();await loadList();
      fields.forEach(function(k){$(k).disabled=false;});$('review').disabled=false;$('manual').disabled=false;$('save').disabled=originalSubmitted;
    }catch(e){networkError(e);}
  }
  init();
})();
