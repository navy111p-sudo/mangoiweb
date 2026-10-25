/* Guided pilot: answers stay in memory; no microphone, cloud TTS or AI calls. */
(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const academy = new URLSearchParams(location.search).get('academy') || 'eleaderjam';
  // Explicit administrator view avoids silently elevating a student when both logins exist.
  const adminView = new URLSearchParams(location.search).get('view') === 'director';
  const token = () => adminView ? '' : (localStorage.getItem('mango_token') || '');
  let identity = token(), state, unit, index = 0, busy = false, generation = 0, speechGeneration = 0;
  function stopSpeech(message) {
    window.EleaderSpeaking?.cancel();
    speechGeneration++;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (window.MangoAvatar) window.MangoAvatar.plainStop();
    if (message) el('voiceStatus').textContent = message;
  }
  function clear() {
    generation++; stopSpeech(); window.EleaderSpeaking?.reset(); state = null; unit = null;
    el('student').hidden = el('director').hidden = el('lesson').hidden = true;
    ['units','history','report','expansion','question','hint','students','assignUnit'].forEach(id => el(id).replaceChildren());
    el('answer').value = ''; el('settingName').value = ''; el('enabled').checked = false;
    el('academyName').textContent = '엘리더잼 말하기 전용관'; el('status').textContent = '로그인 확인이 필요합니다.';
  }
  function checkIdentity() {
    if (token() !== identity) { clear(); identity = token(); throw new Error('로그인이 변경됐어요. 새로고침해 주세요.'); }
  }
  async function api(action, data) {
    checkIdentity(); const epoch = generation;
    const headers = {};
    if (!adminView) headers.Authorization = 'Bearer ' + identity;
    if (state) headers['X-Eleader-Subject'] = state.subject;
    if (data) headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/ai/eleader/' + action + '?academy=' + encodeURIComponent(academy), {
      method: data ? 'POST' : 'GET', headers, credentials: 'same-origin', cache: 'no-store', body: data ? JSON.stringify(data) : undefined
    });
    checkIdentity(); if (epoch !== generation) throw new Error('화면이 변경됐어요. 다시 시도해 주세요.');
    const result = await response.json();
    if (!response.ok) {
      if ([401,403,409].includes(response.status)) clear();
      const messages = { login_required:'기존 계정으로 로그인해 주세요.', academy_access_denied:'이 학원 접근 권한이 없습니다.', academy_paused:'학원 연습이 잠시 중지되었습니다.', pilot_disabled:'시범판이 활성화되지 않았습니다.', pilot_unavailable:'시범판 준비 상태를 확인해 주세요.', unit_not_assigned:'이 유닛 배정이 해제됐어요. 새로고침해 주세요.' };
      throw new Error(messages[result.error] || '요청을 완료하지 못했어요. 새로고침 후 다시 시도해 주세요.');
    }
    return result;
  }
  function error(e) { el('status').textContent = e.message || '연결을 확인해 주세요.'; }
  async function run(fn) {
    if (busy) return; busy = true;
    document.querySelectorAll('button').forEach(b => { if(b.id !== 'stop') b.disabled = true; });
    try { await fn(); } catch(e) { error(e); }
    finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); window.EleaderSpeaking?.configure(state?.live); }
  }
  function table(target, rows) {
    const t = document.createElement('table');
    rows.forEach((row,i) => { const tr=document.createElement('tr'); row.forEach(text => { const c=document.createElement(i ? 'td':'th'); c.textContent=text; tr.append(c); }); t.append(tr); });
    el(target).replaceChildren(t);
  }
  function render() {
    el('academyName').textContent=state.name; el('status').textContent='배정 및 기록을 확인했어요 · 음성·AI는 아래 승인 상태를 확인하세요';
    window.EleaderSpeaking?.configure(state.live);
    const director=state.role==='director'; el('director').hidden=!director; el('student').hidden=director;
    if(director) {
      el('settingName').value=state.name; el('enabled').checked=state.enabled;
      el('students').replaceChildren(...state.students.map(s=>new Option(s.subject,s.subject)));
      el('assignUnit').replaceChildren(...state.units.map(u=>new Option(u.title,u.id)));
      table('report', [['학생','유닛','배정','완료 / 20'],...state.students.flatMap(s=>state.units.map(u=>[s.subject,u.title,state.assignments.some(a=>a.student_uid===s.subject&&a.unit_id===u.id)?'배정':'미배정',state.progress.filter(p=>p.student_uid===s.subject&&p.unit_id===u.id).length+' / 20']))]);
    } else {
      el('units').replaceChildren(...state.units.map(u=>{
        const button=document.createElement('button'); button.className='unit';
        const assigned=state.assignments.some(a=>a.unit_id===u.id);
        const title=document.createElement('strong'); title.textContent=u.title;
        button.append(title,document.createTextNode(assigned?'20문항 · 연습하기':'미배정 · 원장님께 요청하세요'));
        button.setAttribute('aria-pressed',String(unit?.id===u.id));
        button.onclick=()=>{if(!assigned){el('status').textContent='아직 배정되지 않은 유닛입니다.';return;} unit=u; index=0;render();showQuestion();};return button;
      }));
      table('history',[['유닛','연습한 문항'],...state.units.map(u=>[u.title,state.progress.filter(p=>p.unit_id===u.id).length+' / 20'])]);
      if(unit&&!state.assignments.some(a=>a.unit_id===unit.id)){unit=null;el('lesson').hidden=true;stopSpeech();}
    }
  }
  function showQuestion() {
    stopSpeech(); window.EleaderSpeaking?.reset(); window.EleaderSpeaking?.configure(state.live); const q=unit.questions[index]; el('lesson').hidden=false;
    el('position').textContent=unit.title+' · '+(index+1)+' / 20'; el('question').textContent=q.question;
    el('hint').textContent=q.hint;el('hint').hidden=true;el('answer').value='';el('expansion').textContent='';
    el('complete').textContent=state.progress.some(p=>p.question_id===q.id)?'이미 연습한 문장 · 다시 연습':'이 문장 연습 완료';
    if(window.MangoAvatar) window.MangoAvatar.setCharacter('emma');
  }
  async function load() { stopSpeech(); state=await api('state'); render(); }
  el('reload').onclick=()=>run(load);
  el('hintButton').onclick=()=>{el('hint').hidden=!el('hint').hidden;};
  el('expand').onclick=()=>{
    const q=unit.questions[index], answer=el('answer').value.trim();
    if(!answer){el('expansion').textContent='한 단어라도 적어 보세요.';return;}
    const match=answer.toLowerCase().replace(/[.!?]$/,'')===q.short;
    el('expansion').textContent=(match?'이 짧은 답을 문장으로 말해 볼까요?\n':'이렇게 말할 수도 있어요. 내 생각과 다르면 바꾸어 말해요.\n')+q.model+'\n(준비된 예시이며 AI 교정·정답 판정이 아닙니다.)';
  };
  el('next').onclick=()=>{index=(index+1)%unit.questions.length;showQuestion();};
  el('complete').onclick=()=>run(async()=>{await api('complete',{unit:unit.id,question:unit.questions[index].id});await load();if(unit)showQuestion();});
  el('settings').onsubmit=e=>{e.preventDefault();run(async()=>{await api('settings',{name:el('settingName').value,enabled:el('enabled').checked});await load();});};
  el('assign').onsubmit=e=>{e.preventDefault();run(async()=>{await api('assign',{student:el('students').value,unit:el('assignUnit').value,assigned:el('assigned').checked});await load();});};
  el('listen').onclick=()=>{
    stopSpeech(); const epoch=speechGeneration;
    const synth=window.speechSynthesis;
    const voice=synth&&synth.getVoices().find(v=>v.localService&&/^en[-_]/i.test(v.lang));
    if(!voice){el('voiceStatus').textContent='기기 내장 영어 음성이 없어요. 문장을 직접 읽어 주세요. 외부 음성은 호출하지 않습니다.';return;}
    const utterance=new SpeechSynthesisUtterance(unit.questions[index].question);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=.8;
    utterance.onstart=()=>{if(epoch!==speechGeneration)return;el('voiceStatus').textContent='기기 음성 재생 중 · Emma 음성 아님';window.MangoAvatar?.plainStart();};
    utterance.onend=()=>{if(epoch===speechGeneration)stopSpeech('재생이 끝났어요.');};
    utterance.onerror=()=>{if(epoch===speechGeneration)stopSpeech('음성 재생에 실패했어요. 문장을 직접 읽거나 다시 시도해 주세요.');};
    try{synth.speak(utterance);}catch{stopSpeech('음성을 재생할 수 없어요. 문장을 직접 읽어 주세요.');}
  };
  el('stop').onclick=()=>stopSpeech('음성 재생을 취소했어요.');
  window.addEventListener('storage',e=>{if(e.key==='mango_token'||e.key===null){clear();identity=token();el('status').textContent='로그인이 변경됐어요. 배정·기록을 새로고침해 주세요.';}});
  window.addEventListener('pagehide',()=>{clear();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){clear();}
    else{identity=token();run(load);}
  });
  window.EleaderSpeaking?.connect(()=>{
    checkIdentity();
    if(!state?.live?.allowed||!unit)throw new Error('승인된 학생·유닛과 보호자 동의가 필요합니다.');
    return {academy,unit:unit.id,question:unit.questions[index].id,questionText:unit.questions[index].question,subject:state.subject,token:identity,policy:state.live.policy};
  });
  run(load);
})();
