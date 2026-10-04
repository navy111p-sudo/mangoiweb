/* Five-minute handover: suggestions never submit, and acknowledgement never closes a task. */
(function () {
  'use strict';
  var root = document.getElementById('mangoi-handover');
  if (!root) return;
  var $ = function (id) { return root.querySelector('#mh-' + id); };
  var api = '/api/approval/handover', me, members = [], version = 0, revision = 0;
  var reviewed = false, sent = false, busy = false, suggestion = null, requestAttempt = null;
  var started = null, stopped = null, reports = [], originalSubmitted = false, recognition = null;
  var attachments=[], stagedIds=[], fileMap={}, inbox=[], readHistory=[], mine=[], inboxTotal=0, selected=null, uploading=false, lastListState=null, largeReading=false;
  var wanted=new URLSearchParams(location.search), wantedReport=Number(wanted.get('report'))||null;
  var fields = ['work', 'noissue', 'issue', 'noopen', 'open', 'owner', 'deadline', 'student', 'class', 'priority', 'recipient'];
  var labels = { work:'오늘 한 일 / Work completed', issue:'문제·조치 / Issue & action', open:'남은 일 / Open items', owner:'담당자 / Owner', deadline:'기한 / Deadline' };
  function say(message, error) { $('errors').hidden = !error; if (error) $('errors').textContent = message; else $('save-status').textContent = message; }
  function node(tag, content, className) { var n = document.createElement(tag); if (content != null) n.textContent = content; if (className) n.className = className; return n; }
  function clock() { var secs = started == null ? 0 : Math.floor(((stopped == null ? Date.now() : stopped) - started) / 1000); $('time').textContent = String(Math.floor(secs / 60)).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0'); }
  setInterval(clock, 1000);
  function begin() { if (started == null) started = Date.now(); }
  function payload() { return { work:$('work').value.trim(), no_issue:$('noissue').checked, issue:$('issue').value.trim(), no_open:$('noopen').checked, open:$('open').value.trim(), owner:$('owner').value, deadline:$('deadline').value, student:$('student').value.trim(), class_info:$('class').value.trim(), priority:$('priority').value, attachments:attachments.slice() }; }
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
  function populate(d){$('work').value=d.work||'';$('noissue').checked=d.no_issue===true;$('issue').value=d.issue||'';$('noopen').checked=d.no_open===true;$('open').value=d.open||'';$('owner').value=d.owner||'';$('deadline').value=d.deadline||'';$('student').value=d.student||'';$('class').value=d.class_info||'';$('priority').value=d.priority||'normal';attachments=(d.attachments||[]).slice();paintAttachments();sync();}
  function resetReview(){reviewed=false;$('confirm').checked=false;$('confirm').disabled=true;$('send').disabled=true;}
  async function review(useAI){
    if(!me||busy||uploading||(recognition&&recognition.busy()))return;begin();busy=true;$('review').disabled=true;$('manual').disabled=true;
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
    if(!me||busy||uploading||(recognition&&recognition.busy()))return;if(submit&&(!reviewed||!$('confirm').checked||sent))return;
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

  function mergeFiles(files){(files||[]).forEach(function(f){fileMap[f.id]=f;});}
  function attachmentLinks(id,editable){
    var f=fileMap[id], box=node('div',null,'mh-attachment');
    box.append(node('strong',f?f.name:'첨부파일 / Attachment'));
    if(f)box.append(node('span',(f.size/1024/1024).toFixed(1)+' MB','small'));
    var href=api+'/attachment?id='+encodeURIComponent(id), open=node('a','열기 / Open');open.href=href;open.target='_blank';open.rel='noopener';box.append(open);
    var download=node('a','다운로드 / Download');download.href=href+'&download=1';box.append(download);
    if(!editable&&f&&f.mime==='application/pdf'){
      var previewButton=node('button','PDF 미리보기 / Preview');previewButton.type='button';
      previewButton.onclick=function(){if(matchMedia('(max-width:720px)').matches){window.open(href,'_blank','noopener');return;}var old=box.querySelector('iframe');if(old){old.remove();return;}var frame=document.createElement('iframe');frame.className='mh-pdf';frame.title=f.name;frame.src=href;box.append(frame);};box.append(previewButton);
    }
    if(editable){var remove=node('button','첨부 제외 / Remove');remove.type='button';remove.onclick=function(){if(uploading||busy)return;attachments=attachments.filter(function(x){return x!==id;});invalidate();paintAttachments();};box.append(remove);}
    return box;
  }
  // Files uploaded for this date that are not attached (reload before Save drops them from the draft). Never auto-attach: a removed file must stay removed.
  function paintAttachments(){var list=$('file-list');list.replaceChildren();attachments.forEach(function(id){list.append(attachmentLinks(id,true));});
    var loose=stagedIds.filter(function(id){return attachments.indexOf(id)<0&&fileMap[id];});if(!loose.length)return;
    list.append(node('p','업로드했지만 보고에 붙지 않은 파일 '+loose.length+'개 · 필요하면 붙여 주세요. / Uploaded but not attached: '+loose.length,'small'));
    loose.forEach(function(id){var box=node('div',null,'mh-attachment');box.append(node('strong',fileMap[id].name),node('span','미첨부 / Not attached','small'));
      var add=node('button','보고에 붙이기 / Attach');add.type='button';add.onclick=function(){if(uploading||busy)return;if(attachments.length>=5){say('최대 5개까지 첨부할 수 있습니다. / Up to 5 files.',true);return;}attachments.push(id);invalidate();paintAttachments();};box.append(add);list.append(box);});}
  $('files').onchange=async function(){
    if(!me||busy||uploading||(recognition&&recognition.busy()))return;var chosen=Array.from(this.files||[]);
    if(attachments.length+chosen.length>5||chosen.some(function(f){return f.size>20*1024*1024;})){say('최대 5개, 파일당 20MB 이하로 선택해 주세요. / Up to 5 files, 20MB each.',true);this.value='';return;}
    uploading=true;invalidate();$('files').disabled=true;$('review').disabled=true;$('manual').disabled=true;$('save').disabled=true;
    var failed=[];
    for(var f of chosen){
      $('upload-status').textContent='업로드 중 / Uploading: '+f.name;
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},120000);
      try{var res=await fetch(api+'/attachment?date='+encodeURIComponent($('date').value),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(f.name)},body:f,signal:controller.signal});var j=await res.json();if(!res.ok||!j.ok)throw new Error(j.error||res.status);fileMap[j.file.id]=j.file;attachments.push(j.file.id);if(stagedIds.indexOf(j.file.id)<0)stagedIds.push(j.file.id);cacheDraft();paintAttachments();}
      catch(e){failed.push(f.name);say('첨부 업로드 실패 / Upload failed: '+f.name+' · '+e.message,true);}
      finally{clearTimeout(timer);}
    }
    uploading=false;$('files').disabled=false;$('files').value='';$('review').disabled=false;$('manual').disabled=false;$('save').disabled=originalSubmitted;
    $('upload-status').textContent=failed.length?'업로드되지 않은 파일을 다시 선택해 주세요 / Select failed files again: '+failed.join(', '):'첨부 업로드 완료 · 보고 전달 전에는 작성자만 열 수 있습니다. / Uploaded; private until report submission.';
  };
  function visibleList(){
    var filter=$('filter').value;
    if(filter==='read')return readHistory.slice();
    if(filter==='mine')return mine.slice();
    var list=filter==='unread'?inbox:reports.filter(function(r){return filter==='all'||filter===r.status||(filter==='open'&&!r.payload.no_open)||(filter==='urgent'&&r.payload.priority==='urgent');});
    return list.slice().sort(function(a,b){var rank=function(r){return (r.payload.priority==='urgent'&&r.status==='submitted'?-10:0)+({submitted:0,changes_requested:1,draft:2,acknowledged:3}[r.status]||0);};return rank(a)-rank(b)||b.updated_at-a.updated_at;});
  }
  function paintList(){
    var host=$('reports'), detail=$('report-detail'),list=visibleList();host.replaceChildren();detail.replaceChildren();
    var mode=$('filter').value;$('list-date').disabled=mode==='unread'||mode==='read'||mode==='mine';$('reread').textContent=mode==='read'?'← 미확인 보고로 / Back to unread':'📖 확인한 보고 다시 읽기 / Re-read';$('mine').textContent=mode==='mine'?'← 미확인 보고로 / Back to unread':'📤 내가 보낸 보고 · 확인 여부 / My sent reports';
    $('inbox-message').textContent=mode==='mine'?mineSummary():(['admin','mgr_jjw'].includes(me.username)?'미확인 '+inboxTotal+'건 · 읽고 확인해 주세요':'My unread: '+inboxTotal+' · Please read and acknowledge');
    if(!list.length){detail.append(node('p',mode==='read'?'최근 30일에 확인한 보고가 없습니다. / No acknowledged reports in the last 30 days.':mode==='mine'?'최근 30일에 작성한 보고가 없습니다. / No reports written in the last 30 days.':'해당 보고가 없습니다. / No reports.','sub'));if(mode==='unread')detail.append(node('p','확인한 보고는 «📖 다시 읽기»에서 볼 수 있어요. / Acknowledged reports are under Re-read.','small'));return;}
    var r=list.find(function(x){return x.id===selected;})||list[0];selected=r.id;
    list.forEach(function(x){var button=node('button',mode==='mine'?'→ '+staffName(x.recipient):x.staff_name,'mh-report-button');button.type='button';button.setAttribute('aria-pressed',String(x.id===r.id));button.append(node('span',x.report_date+' · '+statusLabel(x.status)),node('span',x.payload.work.slice(0,100)));if(x.payload.priority==='urgent')button.append(node('span','긴급 / Urgent','badge'));if((x.payload.attachments||[]).length)button.append(node('span','첨부 / Files: '+x.payload.attachments.length));button.onclick=function(){selected=x.id;paintList();};host.append(button);});
    var nav=node('div',null,'mh-mobile-nav'),idx=list.indexOf(r),prev=node('button','←'),next=node('button','→');prev.setAttribute('aria-label','이전 보고 / Previous');next.setAttribute('aria-label','다음 보고 / Next');prev.disabled=idx===0;next.disabled=idx===list.length-1;
    prev.onclick=function(){selected=list[idx-1].id;paintList();};next.onclick=function(){selected=list[idx+1].id;paintList();};nav.append(prev,node('span',(idx+1)+' / '+list.length),next);detail.append(nav);
    detail.append(node('p',r.staff_name+' · '+r.report_date+' · '+statusLabel(r.status),'badge'),node('h3',r.payload.work.slice(0,150)));
    var size=node('button','글자 더 크게 / Larger text');size.type='button';size.onclick=function(){var content=detail.querySelector('.preview');var enlarged=largeReading;largeReading=!enlarged;content.style.fontSize=enlarged?'':'26px';size.textContent=enlarged?'글자 더 크게 / Larger text':'기본 크기 / Default text';};detail.append(size);
    var content=node('div',null,'preview');showPayload(content,r.payload,r.report_date,r.staff_name);if(largeReading){content.style.fontSize='26px';size.textContent='기본 크기 / Default text';}detail.append(content);
    (r.payload.attachments||[]).forEach(function(id){detail.append(attachmentLinks(id,false));});
    detail.append(node('p','전달 / To: '+staffName(r.recipient),'small'));
    if(r.acknowledged_by)detail.append(node('p','확인 / Reviewed by: '+staffName(r.acknowledged_by)+(r.acknowledged_at?' · '+kst(r.acknowledged_at)+' KST':''),'small'));
    if(r.username===me.username)detail.append(node('p',ownStatusText(r),r.status==='changes_requested'?'notice':'small'));
    if(r.username===me.username&&r.status==='changes_requested'&&r.report_date===$('date').value){var fix=node('button','✏️ 보완해서 다시 보내기 / Revise & resend','primary');fix.type='button';fix.onclick=openEditor;detail.append(fix);}
    paintFollowup(detail,r);
    if(r.feedback)detail.append(node('p','보완 요청 / Feedback: '+r.feedback,'notice'));
    if(r.username!==me.username&&r.status==='submitted'&&(r.recipient===me.username||root.dataset.exec==='true')){
      var buttons=node('div',null,'buttons'),ack=node('button','내용 확인 완료 / Acknowledge','primary'),ret=node('button','보완 요청 / Request changes');
      ack.onclick=function(){act(r,'ack',ack);};ret.onclick=function(){act(r,'return',ret);};buttons.append(ack,ret);detail.append(buttons);
    }
    detail.append(node('p','수신 확인은 남은 업무를 완료 처리하지 않습니다. / Acknowledgement does not close open tasks.','small'));
  }
  function paintFollowupHistory(panel,r){
    var button=node('button','독촉·응답 이력 / Follow-up history'),box=node('div'),label=node('label','이력 범위 / History scope'),scope=node('select');
    var all=node('option','전체 저장 버전 / All stored versions'),current=node('option','현재 저장 버전 / Current stored version');
    all.value='all';current.value='current';scope.append(all,current);scope.value='all';label.append(scope);
    var content=node('div'),knownVersion=r.version,sequence=0;box.hidden=true;box.append(label,content);
    button.type='button';content.setAttribute('aria-live','polite');panel.append(button,box);
    async function load(){
      var request=++sequence,mode=scope.value;box.hidden=false;button.disabled=true;
      content.replaceChildren(node('p','이력 불러오는 중 / Loading history…','small'));
      try{
        var j=await call('/followup-history?id='+r.id+(mode==='current'?'&version='+knownVersion:''));
        // A newer filter, report selection, or list repaint owns the screen now.
        if(request!==sequence||!panel.isConnected)return;
        knownVersion=j.current_version;current.textContent='현재 저장 버전 v'+knownVersion+' / Current stored version v'+knownVersion;
        content.replaceChildren(node('p','현재 저장 버전 / Current stored version: v'+knownVersion,'small'));
        content.append(node('p','저장 버전은 제출 횟수가 아닙니다. 확인·보완 요청 때도 증가하며, 응답 이력은 처리 전 버전에 기록됩니다. / Stored versions count saves and responses, not submissions. Response events refer to the version before the action.','small'));
        if(r.version!==knownVersion)content.append(node('p','이 화면의 보고는 저장 버전 v'+r.version+'입니다. 최신 보고를 보려면 보고 목록을 새로고침해 주세요. / This report view is v'+r.version+'; refresh the report list for the latest report.','notice'));
        if(mode==='current'&&j.filtered_version!==knownVersion){
          content.append(node('p','조회 중 저장 버전이 바뀌었습니다. 이력을 새로고침해 주세요. / The stored version changed during this lookup. Refresh history.','notice'));return;
        }
        var range=j.filtered_version===null?'전체 저장 버전 / All stored versions':'저장 버전 v'+j.filtered_version+' / Stored version v'+j.filtered_version;
        content.append(node('p',range+' · 최신 최대 '+j.limit+'건 (최신순) / Up to '+j.limit+' latest events, newest first'+(j.has_more?' · 이전 기록은 생략됨 / Older events omitted':''),'small'));
        j.events.forEach(function(e){
          var relation=e.version===knownVersion?'현재 저장 버전 / Current stored version':e.version<knownVersion?'이전 저장 버전 / Earlier stored version':'다른 저장 버전 / Other stored version';
          var item=node('div',null,'mh-history-event');
          item.append(node('p','v'+e.version+' · '+relation,'small'));
          item.append(node('p',kst(e.created_at)+' KST · '+staffName(e.actor)+' · '+({opened:'열람 / Opened',deadline:'기한 설정 / Deadline',remind:'재요청 / Reminder',final:'최종 경고 / Final warning',overdue:'기한 초과 / Overdue',escalated:'지연 전달 / Escalated',hold:'보류 / On hold',acknowledged:'확인 완료 / Acknowledged',changes_requested:'보완 요청 / Changes requested'}[e.kind]||e.kind)+' · '+e.detail,'small'));
          if(e.kind==='acknowledged'||e.kind==='changes_requested')item.append(node('p','처리 전 저장 버전 v'+e.version+'에 대한 응답 / Response recorded against pre-transition stored version v'+e.version,'small'));
          content.append(item);
        });
        if(!j.events.length)content.append(node('p',mode==='current'?'현재 저장 버전에 기록된 이력이 없습니다. 처리 전 응답은 전체 저장 버전에서 확인하세요. / No events recorded against the current stored version. See All stored versions for pre-transition responses.':'이력 없음 / No history','small'));
      }catch(e){
        if(request!==sequence||!panel.isConnected)return;
        content.replaceChildren(node('p','이력을 불러오지 못했습니다. 다시 시도해 주세요. / Could not load history. Please retry.','small'));networkError(e);
      }finally{
        if(request===sequence&&panel.isConnected){button.disabled=false;button.textContent='이력 새로고침 / Refresh history';}
      }
    }
    button.onclick=load;scope.onchange=load;
  }
  var openedRequests={};
  function paintFollowup(detail,r){
    if(r.status==='draft')return;
    var f=r.followup||{},panel=node('section',null,'notice');
    panel.append(node('strong','응답·독촉 관리 / Response & reminders'));
    if(f.opened_at)panel.append(node('p','열람 / Opened: '+kst(f.opened_at)+' KST','small'));
    if(f.due_at)panel.append(node('p','응답 기한 / Respond by: '+kst(f.due_at)+' KST'+(r.status==='submitted'&&Date.now()>f.due_at?' · 🔴 기한 초과 / Overdue':'')));
    if(f.warning_level)panel.append(node('p',f.warning_level>=3?'🔴 최종 경고 / Final warning':'⚠️ 응답 재요청 / Response requested'));
    if(f.delivery_pending&&f.delivery_pending.length)panel.append(node('p','기기 알림 대기 / Device notification pending: '+f.delivery_pending.map(staffName).join(', ')+' · 구독이 연결되면 재시도합니다. / Will retry when a device is subscribed.','small'));
    if(f.hold_reason)panel.append(node('p','보류 사유 / Hold reason: '+f.hold_reason+' · '+kst(f.hold_until)+' KST'));
    paintFollowupHistory(panel,r);
    if(r.status==='submitted'&&r.username===me.username&&r.recipient!==me.username){
      var label=node('label','응답 기한 (한국 시간) / Deadline (KST)'),due=node('input');due.type='datetime-local';due.value=new Date((f.due_at||Date.now()+4*3600000)+9*3600000).toISOString().slice(0,16);label.append(due);panel.append(label);
      var escalation=node('label','기한 3시간 초과 시 대표에게도 전달 / Also notify CEO after 3h overdue'),check=node('input');check.type='checkbox';check.checked=f.escalation_to==='admin';escalation.prepend(check);if(me.username!=='admin'&&members.some(function(m){return m.username==='admin';}))panel.append(escalation);
      panel.append(node('p','기한 초과 알림은 수신자 근무시간에 발송됩니다. 3시간 초과 시 작성자에게도 알립니다. / Overdue alerts run during recipient working hours; the author is notified after 3h overdue.','small'));
      [['deadline','기한 저장 / Save deadline'],['remind','🔔 긴급 재요청 / Urgent reminder'],['final','🔴 최종 경고 / Final warning']].forEach(function(a){var b=node('button',a[1]);b.type='button';b.onclick=async function(){var dueAt=Date.parse(due.value+':00+09:00');if(a[0]==='deadline'&&(!Number.isFinite(dueAt)||dueAt<=Date.now())){say('미래 기한을 선택해 주세요. / Choose a future deadline.',true);return;}if(a[0]!=='deadline'&&!confirm(a[1]+' — '+staffName(r.recipient)+'?'))return;b.disabled=true;try{var j=await call('/followup',{id:r.id,version:r.version,action:a[0],due_at:dueAt,escalation_to:check.checked?'admin':''});say(j.push&&j.push!=='sent'?'요청 저장 완료 · 기기 푸시 미전달, 로그인 화면에서 확인 가능합니다. / Saved; device push not delivered, visible on login.':'저장 완료 / Saved',false);await loadList();}catch(e){networkError(e);b.disabled=false;}};panel.append(b);});
    }
    if(r.status==='submitted'&&r.recipient===me.username&&r.username!==me.username){
      var key=r.id+':'+r.version;
      if(!f.opened_at&&!openedRequests[key]&&!document.hidden){openedRequests[key]=true;call('/opened',{id:r.id,version:r.version}).catch(function(){delete openedRequests[key];});}
      var hold=node('button','사유를 남기고 보류 / Hold with reason');hold.type='button';hold.onclick=async function(){var reason=prompt('보류 사유 (필수) / Reason (required)');if(!reason||!reason.trim())return;var time=prompt('처리 예정 한국 시간 / Expected response in KST (YYYY-MM-DDTHH:mm)',new Date(Date.now()+10*3600000).toISOString().slice(0,16));if(!time)return;var until=Date.parse(time+':00+09:00');if(!Number.isFinite(until)||until<=Date.now()){say('미래 시각을 입력해 주세요. / Enter a future time.',true);return;}hold.disabled=true;try{await call('/hold',{id:r.id,version:r.version,reason:reason,hold_until:until});await loadList();}catch(e){networkError(e);hold.disabled=false;}};panel.append(hold);
    }
    detail.append(panel);
  }
  function kst(ms){return new Date(Number(ms)+9*3600000).toISOString().slice(5,16).replace('T',' ');}
  // 작성자 시점의 «확인 여부» — 매일보고의 «확인» 은 돈 결재의 «승인» 이 아니다(받은 사람이 읽었다는 표시).
  function ownStatusText(r){
    if(r.status==='acknowledged')return '✅ 확인 완료 · '+staffName(r.acknowledged_by||r.recipient)+(r.acknowledged_at?' · '+kst(r.acknowledged_at)+' KST':'')+' / Acknowledged';
    if(r.status==='changes_requested')return '↩️ 보완 요청 · '+staffName(r.acknowledged_by||r.recipient)+(r.feedback?' — '+r.feedback:'')+' / Changes requested';
    if(r.status==='submitted')return r.followup&&r.followup.opened_at?'👁 열람 · 미응답 / Opened, awaiting response · '+kst(r.followup.opened_at)+' KST':'⏳ 미열람 · 확인 대기 / Not opened, awaiting review';
    return '📝 초안 · 아직 보내지 않았습니다. / Draft — not sent yet';
  }
  function mineSummary(){var c={submitted:0,acknowledged:0,changes_requested:0,draft:0};mine.forEach(function(r){if(c[r.status]!=null)c[r.status]++;});
    return '내가 보낸 보고 '+mine.length+'건 · 확인 완료 '+c.acknowledged+' · 확인 대기 '+c.submitted+' · 보완 요청 '+c.changes_requested+(c.draft?' · 초안 '+c.draft:'')+' / Mine: '+c.acknowledged+' acknowledged · '+c.submitted+' awaiting · '+c.changes_requested+' changes';}
  function paintOwn(own){var el=$('own-status');if(!own){el.hidden=true;return;}el.hidden=false;el.textContent='오늘 내 보고 / Today: '+ownStatusText(own);}
  function openEditor(){var editor=$('editor');editor.hidden=false;$('clock-box').hidden=false;begin();editor.scrollIntoView({behavior:'smooth',block:'start'});}
  async function act(r,kind,button){var feedback='';if(kind==='return'){feedback=prompt('보완할 내용을 적어 주세요. / What needs clarification?')||'';if(!feedback.trim())return;}button.disabled=true;try{await call('/'+kind,{id:r.id,version:r.version,feedback:feedback});await loadList();}catch(e){networkError(e);button.disabled=false;}}
  async function loadList(){
    var date=$('list-date').value, wantRead=$('filter').value==='read', wantMine=$('filter').value==='mine', data=await Promise.all([call('/home?date='+encodeURIComponent(date)),call('/inbox'),wantRead?call('/read-history'):null,wantMine?call('/mine'):null]);
    if(date!==$('list-date').value)return;var j=data[0];reports=j.reports;inbox=data[1].reports;inboxTotal=data[1].total;mergeFiles(j.files);mergeFiles(data[1].files);if(data[2]){readHistory=data[2].reports||[];mergeFiles(data[2].files);}if(data[3]){mine=data[3].reports||[];mergeFiles(data[3].files);}if(date===$('date').value)paintOwn(j.own);var listState=JSON.stringify([date,$('filter').value,reports,inbox,readHistory,mine]);if(listState!==lastListState){paintList();lastListState=listState;}
    var weekday=new Date(date+'T00:00:00Z').getUTCDay();var required=(j.required||[]).filter(function(r){return r.exempt_date!==date&&r.weekdays.split(',').includes(String(weekday));});
    var missing=required.filter(function(r){return !r.submitted_at;});
    $('required').textContent=required.length?'보고 대상 '+required.length+'명 · 미제출 / Not submitted: '+(missing.map(function(r){return r.name||r.username;}).join(', ')||'없음 / None'):'';
  }
  $('write-toggle').onclick=function(){var editor=$('editor');editor.hidden=!editor.hidden;$('clock-box').hidden=editor.hidden;if(!editor.hidden){begin();editor.scrollIntoView({behavior:'smooth',block:'start'});}};
  $('filter').onchange=function(){if($('filter').value==='read'||$('filter').value==='mine')loadList().catch(networkError);else paintList();};
  $('reread').onclick=function(){$('filter').value=$('filter').value==='read'?'unread':'read';$('filter').onchange();};$('mine').onclick=function(){$('filter').value=$('filter').value==='mine'?'unread':'mine';$('filter').onchange();};$('own-status').onclick=function(){$('filter').value='mine';$('filter').onchange();};$('list-date').onchange=function(){loadList().catch(networkError);};$('refresh').onclick=function(){loadList().catch(networkError);};
  var weeknames=['일 / Sun','월 / Mon','화 / Tue','수 / Wed','목 / Thu','금 / Fri','토 / Sat'];
  weeknames.forEach(function(name,i){var label=node('label',null,'check'),c=document.createElement('input');c.type='checkbox';c.value=String(i);c.checked=i>0&&i<6;label.append(c,document.createTextNode(name));$('weekdays').append(label);});
  $('schedule-save').onclick=async function(){var button=$('schedule-save');button.disabled=true;try{await call('/schedule',{enabled:$('schedule-enabled').checked,weekdays:Array.from($('weekdays').querySelectorAll('input:checked')).map(function(c){return Number(c.value);}),due_time:$('due-time').value,exempt_date:$('exempt-date').value});$('schedule-status').textContent='설정 저장 완료 · 마감 30분 전/마감/30분 후 알림. / Saved: reminders at −30 / 0 / +30 min (15-min checks).';}catch(e){networkError(e);}finally{button.disabled=false;}};
  recognition=window.HandoverDictation.create({button:$('voice-record'),language:$('voice-lang'),status:$('voice-status'),
    canStart:function(){return !!me&&!busy&&!uploading;},
    onText:function(t){var old=$('work').value,combined=(old+' '+t).trim();$('work').value=combined.slice(0,1500);invalidate();if(combined.length>1500)say('오늘 한 일은 1,500자까지 입력됩니다. / Work completed is limited to 1,500 characters.',true);},
    onBusy:function(active){if(active){begin();resetReview();}$('files').disabled=active||uploading;$('review').disabled=active||busy;$('manual').disabled=active||busy;$('save').disabled=active||busy||originalSubmitted;}
  });
  document.addEventListener('visibilitychange',function(){if(document.hidden&&recognition)recognition.cancel();});
  window.addEventListener('pagehide',function(){if(recognition)recognition.cancel();});
  async function init(){
    fields.forEach(function(k){$(k).disabled=true;});$('review').disabled=true;$('save').disabled=true;$('manual').disabled=true;
    try{
      var j=await call('/home');me=j.me;members=j.members;mergeFiles(j.files);stagedIds=(j.staged_ids||[]).slice();$('editor').hidden=!!j.reader_mode;$('clock-box').hidden=!!j.reader_mode;if(j.reader_mode)$('editor').prepend($('alert'));
      $('filter').value=j.reader_mode?'unread':'all';selected=wantedReport;if(wantedReport)$('filter').value='all';if(wanted.get('view')==='mine')$('filter').value='mine';root.dataset.exec=String(j.can_review_all);
      $('date').value=j.day;$('list-date').value=/^\d{4}-\d{2}-\d{2}$/.test(wanted.get('date')||'')?wanted.get('date'):j.day;$('staff').value=me.name;
      ['owner','recipient'].forEach(function(k){members.forEach(function(m){var option=node('option',m.name?m.name+' ('+m.username+')':m.username);option.value=m.username;$(k).append(option);});});
      paintOwn(j.own);if(j.own){version=j.own.version;populate(j.own.payload);$('recipient').value=j.own.recipient;originalSubmitted=!!j.own.submitted_at;$('badge').textContent=statusLabel(j.own.status);if(j.own.feedback){$('alert').hidden=false;$('alert').textContent='보완 요청 / Changes requested: '+j.own.feedback;}}
      else{$('recipient').value=j.default_recipient;$('noissue').checked=true;$('noopen').checked=true;$('alert').hidden=false;$('alert').textContent='오늘 보고를 아직 제출하지 않았습니다. / Today’s handover has not been submitted.';}
      try{var saved=JSON.parse(localStorage.getItem(storageKey())||'null');if(saved&&saved.version===version){populate(saved.payload);$('recipient').value=saved.recipient;$('save-status').textContent='이 기기의 임시 작성 내용을 복원했습니다. / Device draft restored.';}else{$('save-status').textContent=j.own?'저장된 보고를 불러왔습니다. / Saved report loaded.':'날짜·담당자가 자동 입력되었습니다. / Date and staff filled automatically.';}}catch(e){}
      if(j.schedule){$('schedule-enabled').checked=!!j.schedule.enabled;$('due-time').value=j.schedule.due_time;$('exempt-date').value=j.schedule.exempt_date;Array.from($('weekdays').querySelectorAll('input')).forEach(function(c){c.checked=j.schedule.weekdays.split(',').includes(c.value);});}
      if(j.read_schedule){$('read-start').value=j.read_schedule.start_time;$('read-end').value=j.read_schedule.end_time;Array.from($('read-weekdays').querySelectorAll('input')).forEach(function(c){c.checked=j.read_schedule.weekdays.split(',').includes(c.value);});}
      sync();preview();reports=j.reports;paintList();await loadList();
      fields.forEach(function(k){$(k).disabled=false;});$('review').disabled=false;$('manual').disabled=false;$('save').disabled=originalSubmitted;$('voice-record').disabled=false;
    }catch(e){networkError(e);}
  }
  weeknames.forEach(function(name,i){var label=node('label',null,'check'),c=document.createElement('input');c.type='checkbox';c.value=String(i);c.checked=i>0&&i<6;label.append(c,document.createTextNode(name));$('read-weekdays').append(label);});
  $('read-save').onclick=async function(){var button=this;button.disabled=true;try{await call('/read-schedule',{weekdays:Array.from($('read-weekdays').querySelectorAll('input:checked')).map(function(c){return Number(c.value);}),start_time:$('read-start').value,end_time:$('read-end').value});$('read-status').textContent='저장 완료 / Saved';}catch(e){networkError(e);}finally{button.disabled=false;}};
  setInterval(function(){if(me&&!document.hidden&&!busy&&!uploading)loadList().catch(function(){$('inbox-message').textContent='새 보고 확인 실패 · 새로고침해 주세요. / Refresh to check new reports.';});},60000);
  init();
})();

