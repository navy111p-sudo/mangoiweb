// 복습퀴즈 문항 검증·학생용 응답·추첨·채점. 요청 상태를 보관하지 않는다.
import { endSentence } from './sentence-punct';

    // 문항 검증 (Phase RQ2 — 유형: choice 객관식 / listen 듣기 / write 쓰기 / speak 말하기)
    //   choice/listen: { type, q, opts:[2~6], answer:index, explain?, audio_text(listen 필수) }
    //   write        : { type, q, answer_text, accept?:string[], explain? }
    //   speak        : { type, q?, answer_text(말할 문장), explain? }
    const rqParseQuestions = (raw: any): { ok: boolean; error?: string; list?: any[] } => {
      let list: any[] = [];
      if (Array.isArray(raw)) list = raw;
      else { try { list = JSON.parse(String(raw || '[]')); } catch { return { ok: false, error: 'questions_invalid_json' }; } }
      if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'questions_required' };
      const clean: any[] = [];
      for (const q of list) {
        const type = ['choice', 'listen', 'write', 'speak'].includes(String(q?.type)) ? String(q.type) : 'choice';
        // ✒️ 문장인 칸만 종결부호를 보장합니다. 한국어는 종결어미로 «?»·«.» 를 가르고,
        //    「…단어는」처럼 판정이 안 서면 endSentence 가 손대지 않고 그대로 돌려줍니다.
        const explain = endSentence(String(q?.explain || '').trim());
        let text = endSentence(String(q?.q || '').trim());
        if (type === 'choice' || type === 'listen') {
          // ⛔ choice 의 보기는 「어려운」·「你好」 같은 낱말이라 그대로 둡니다.
          // ✅ listen 의 보기만 «들려준 문장 + 오답 문장» 이라 문장으로 다듬습니다 —
          //    대본(audio_text)과 정답 보기가 «마침표 하나 차이» 로 어긋나지 않게 둘을 함께 처리합니다.
          const opts = Array.isArray(q?.opts)
            ? q.opts.map((o: any) => { const v = String(o || '').trim(); return type === 'listen' ? endSentence(v) : v; })
            : [];
          const answer = Number(q?.answer);
          if (type === 'listen' && !text) text = '🎧 잘 듣고 알맞은 답을 고르세요.';
          if (!text) return { ok: false, error: 'question_text_required' };
          if (opts.length < 2 || opts.length > 6 || opts.some((o: string) => !o)) return { ok: false, error: 'options_required' };
          if (!Number.isInteger(answer) || answer < 0 || answer >= opts.length) return { ok: false, error: 'answer_index_invalid' };
          const audioText = String(q?.audio_text || '').trim();
          if (type === 'listen' && !audioText) return { ok: false, error: 'audio_text_required' };
          const item: any = { type, q: text, opts, answer, explain };
          if (type === 'listen') item.audio_text = endSentence(audioText.slice(0, 300));
          clean.push(item);
        } else {
          const answerText = String(q?.answer_text || '').trim();
          if (!answerText) return { ok: false, error: 'answer_text_required' };
          if (type === 'speak' && !text) text = '🎤 아래 문장을 또박또박 읽어보세요.';
          if (type === 'write' && !text) return { ok: false, error: 'question_text_required' };
          const accept = (Array.isArray(q?.accept) ? q.accept : []).map((a: any) => String(a || '').trim()).filter((a: string) => !!a).slice(0, 8);
          clean.push({ type, q: text, answer_text: endSentence(answerText.slice(0, 300)), accept, explain });
        }
      }
      return { ok: true, list: clean };
    };
    // 채점 보조 — 텍스트 정규화 + 단어 일치율
    // 🈶 (2026-07-31) 한자(一-鿿) 를 허용문자에 추가 — 원래는 중국어를 전부 걸러내서
    //   쓰기/말하기 채점이 항상 빈 문자열끼리 비교돼 정답이어도 오답 처리됐다.
    // 🔤 (2026-08-21) 병음의 «성조 부호» 를 먼저 벗긴다.
    //   그 전에는 dǎgōng 이 허용문자(a-z) 밖이라 통째로 공백이 되어 «d g ng» 이 됐고,
    //   학생이 dagong 이라고 치면 영원히 오답이었다. 그래서 write 문항의 accept 에 병음을
    //   넣어 둔 것이 «있는 척만» 하고 실제로는 한자를 직접 칠 수 있는 사람만 풀 수 있었다.
    //   ⚠️ NFD 로 분해한 뒤 «반드시» NFC 로 되돌려야 한다 — 한글이 자모로 쪼개진 채 남으면
    //      아래 가-힣 범위에 안 걸려 한국어 답이 통째로 사라진다.
    const rqStripTone = (s: string) => { try { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC'); } catch { return s; } };
    const rqNorm = (s: any) => rqStripTone(String(s || '').toLowerCase()).replace(/[^a-z0-9가-힣一-鿿\s']/g, ' ').replace(/\s+/g, ' ').trim();
    // 🈶 중국어는 띄어쓰기가 없어 공백 분리로 쪼개면 문장 전체가 토큰 1개가 되어 부분점수 없이
    //   전부/전무로만 채점된다(발음 인식의 사소한 오차에도 0점). 한자가 섞이면 글자 단위로 쪼갠다.
    const rqTokenize = (s: string) => {
      const norm = rqNorm(s);
      if (/[一-鿿]/.test(norm)) return norm.replace(/\s+/g, '').split('');
      return norm.split(' ').filter(Boolean);
    };
    const rqWordAcc = (target: string, said: string) => {
      const t = rqTokenize(target);
      const s = rqTokenize(said);
      if (!t.length) return 0;
      const pool = s.slice();
      let hit = 0;
      for (const w of t) { const i = pool.indexOf(w); if (i >= 0) { hit++; pool.splice(i, 1); } }
      return hit / t.length;
    };
    // 학생에게 안전한 문항 형태 (정답/듣기 원문 제외)
    // 🎲 랜덤 출제(draw) — 유형별로 무작위 N개 뽑되 원본 bank index(idx) 보존
    const rqSafeOne = (q: any, i: number) => {
      const type = q.type || 'choice';
      const out: any = { idx: i, type, q: q.q };
      if (type === 'choice' || type === 'listen') out.opts = q.opts;
      if (type === 'speak') out.target = q.answer_text;
      if (type === 'listen') out.has_audio = true;
      return out;
    };
    // 일반 조회와 추첨 조회가 같은 비공개 필드 경계를 사용한다.
    const rqSafeQuestions = (qs: any[]) => qs.map((q: any, i: number) => rqSafeOne(q, i));
    const rqShuffle = (arr: any[]) => { const a = arr.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); const t = a[k]; a[k] = a[j]; a[j] = t; } return a; };
    const rqDrawIndices = (qs: any[], draw: any) => {
      const by: any = { listen: [], speak: [], choice: [], write: [] };
      qs.forEach((q: any, i: number) => { const t = (q && q.type) || 'choice'; (by[t] || by.choice).push(i); });
      let out: number[] = [];
      out = out.concat(rqShuffle(by.listen).slice(0, draw.listen || 0));
      out = out.concat(rqShuffle(by.speak).slice(0, draw.speak || 0));
      out = out.concat(rqShuffle(by.choice).slice(0, draw.choice || 0));
      out = out.concat(rqShuffle(by.write).slice(0, draw.write || 0));
      return rqShuffle(out);
    };
    // 채점 (유형별) — answers[i]: choice/listen=보기 index, write/speak=텍스트
    const rqGrade = (qs: any[], answers: any[]) => {
      let score = 0;
      const detail = qs.map((q: any, i: number) => {
        const type = q.type || 'choice';
        const a = answers[i];
        if (type === 'choice' || type === 'listen') {
          const ans = (a == null || a === '') ? NaN : Number(a);   // fix: 무응답(null/빈값)을 0으로 오채점하지 않도록 NaN 처리
          const correct = Number.isInteger(ans) && ans === Number(q.answer);
          if (correct) score++;
          const d: any = { idx: i, type, correct, your_answer: Number.isInteger(ans) ? ans : null, answer: Number(q.answer), explain: q.explain || '' };
          if (type === 'listen') d.audio_text = q.audio_text || '';
          return d;
        }
        const said = String(a == null ? '' : a).slice(0, 500);
        let accuracy = Math.round(rqWordAcc(q.answer_text, said) * 100);
        let correct = false;
        if (type === 'write') {
          const cands = [rqNorm(q.answer_text), ...((q.accept || []).map((x: string) => rqNorm(x)))].filter(Boolean);
          correct = !!said.trim() && (cands.includes(rqNorm(said)) || accuracy >= 85);
          if (correct) accuracy = Math.max(accuracy, 100 * Number(cands.includes(rqNorm(said))) || accuracy);
        } else {
          correct = accuracy >= 60;
        }
        if (correct) score++;
        return { idx: i, type, correct, accuracy, your_text: said, answer_text: q.answer_text, explain: q.explain || '' };
      });
      return { score, detail };
    };

export { rqParseQuestions, rqStripTone, rqNorm, rqTokenize, rqWordAcc, rqSafeQuestions, rqSafeOne, rqShuffle, rqDrawIndices, rqGrade };
