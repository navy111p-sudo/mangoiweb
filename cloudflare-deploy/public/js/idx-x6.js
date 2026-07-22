// ═══════════════════════════════════════════════════════════════
// idx-x6.js — index.html 인라인 추출 (3단계 36차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. VC·부팅 코드 아님(분류 후 추출).
//   원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // anchor: 'hat'(이마 위) | 'eyes'(두 눈) | 'nose'(코끝) | 'stache'(코밑) | 'face'(얼굴 전체 덮기)
  // scale: 얼굴 폭 기준 크기   yOff: 세로 미세조정(얼굴폭 비율, +면 아래로)
  // (2026-07-22) 이모지·SVG 액세서리 전량 → 실사 사진 액세서리로 교체.
  //   소스 = 그린스크린 시트 1장을 크로마키·디스필해서 잘라낸 투명 PNG 35개 (/face-fx/r/).
  //   추출 스크립트는 docs 참조. 남긴 이모지형은 안경 3종(썬글라스·안경·물안경)뿐 — 나머지는
  //   실사와 겹치고 품질이 떨어져 의도적으로 뺐음. **되살리지 말 것.**
  //
  //   scale = 기준 폭 대비 그려질 이미지 '가로' 배율
  //     anchor 'eyes'  → 기준 = 두 눈 바깥 코너 간격        그 외 → 기준 = 얼굴 폭
  //   yOff  = 부착 위치 미세조정(얼굴폭 비율, hat 은 클수록 아래로 내려앉음)
  //   imgYOff = 이미지 자체를 위아래로 밀기(size 비율, +면 아래로) — 여백이 치우친 컷 보정용
  var FX_ITEMS = [
    // ── 얼굴 전체 마스크 ──
    { id:'rtiger',  ko:'호랑이',   en:'Tiger',      anchor:'face', scale:1.77, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/tiger.png' },
    { id:'rfox',    ko:'여우',     en:'Fox',        anchor:'face', scale:1.57, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/fox.png' },
    { id:'rcat',    ko:'고양이',   en:'Cat',        anchor:'face', scale:1.60, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/cat.png' },
    { id:'rdog',    ko:'강아지',   en:'Dog',        anchor:'face', scale:2.05, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/dog.png', imgYOff:0.04 },
    { id:'rrabbit', ko:'토끼',     en:'Rabbit',     anchor:'face', scale:1.25, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/rabbit.png', imgYOff:-0.26 },
    { id:'rpanda',  ko:'판다',     en:'Panda',      anchor:'face', scale:1.74, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/panda.png' },
    { id:'rorang',  ko:'오랑우탄', en:'Orangutan',  anchor:'face', scale:1.27, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/orangutan.png', imgYOff:-0.03 },
    { id:'rclown',  ko:'광대',     en:'Clown',      anchor:'face', scale:1.71, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/clown.png' },
    { id:'ralien',  ko:'외계인',   en:'Alien',      anchor:'face', scale:1.28, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/alien.png', imgYOff:-0.06 },
    { id:'rpump',   ko:'호박',     en:'Pumpkin',    anchor:'face', scale:1.73, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/pumpkin.png' },
    { id:'rvader',  ko:'검은 헬멧', en:'Dark Helmet', anchor:'face', scale:1.75, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/vader.png', imgYOff:-0.08 },
    { id:'rled',    ko:'LED 가면', en:'LED Mask',   anchor:'face', scale:1.39, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/ledmask.png' },

    // ── 모자·가발 ──
    // ⚠️ hat 앵커의 yOff 는 '클수록 아래로'. 아래 값들은 이마 랜드마크(10) 기준으로
    //    '모자 밑단이 이마보다 살짝 아래' 가 되도록 역산한 값이다. 임의로 키우면 눈을 덮는다.
    { id:'rtophat', ko:'중절모',       en:'Top Hat',        anchor:'hat', scale:1.70, yOff:-0.24, rotate:true, draw:'image', img:'/face-fx/r/tophat.png' },
    { id:'rsteamhat', ko:'스팀펑크 모자', en:'Steampunk Hat', anchor:'hat', scale:1.80, yOff:-0.24, rotate:true, draw:'image', img:'/face-fx/r/steamhat.png' },
    { id:'rcap',    ko:'야구모자',     en:'Cap',            anchor:'hat', scale:1.72, yOff:-0.17, rotate:true, draw:'image', img:'/face-fx/r/cap.png' },
    { id:'rcrowng', ko:'황금 왕관',    en:'Gold Crown',     anchor:'hat', scale:1.38, yOff:-0.25, rotate:true, draw:'image', img:'/face-fx/r/crown-gold.png' },
    { id:'rcrowns', ko:'은빛 왕관',    en:'Silver Crown',   anchor:'hat', scale:1.34, yOff:-0.16, rotate:true, draw:'image', img:'/face-fx/r/crown-silver.png' },
    { id:'rgrad',   ko:'학사모',       en:'Grad Cap',       anchor:'hat', scale:2.00, yOff:0.34, rotate:true, draw:'image', img:'/face-fx/r/gradcap.png' },
    { id:'rhelmet', ko:'안전모',       en:'Hard Hat',       anchor:'hat', scale:1.74, yOff:-0.21, rotate:true, draw:'image', img:'/face-fx/r/helmet.png' },
    { id:'rviking', ko:'바이킹 투구',  en:'Viking Helmet',  anchor:'hat', scale:2.45, yOff:-0.04, rotate:true, draw:'image', img:'/face-fx/r/viking.png' },
    // 가발 PNG 는 앞머리가 막혀 있어 그대로 씌우면 얼굴을 가림 → 아래 배치 기준으로 얼굴 자리에
    //   타원 구멍을 미리 파둔 이미지다(wigcut). scale/yOff 를 바꾸면 구멍 위치도 다시 파야 한다.
    { id:'rwigbr',  ko:'갈색 가발',    en:'Brown Wig',      anchor:'hat', scale:1.62, yOff:0.96, rotate:true, draw:'image', img:'/face-fx/r/wig-brown.png' },
    { id:'rwigbl',  ko:'금발 가발',    en:'Blonde Wig',     anchor:'hat', scale:1.56, yOff:0.93, rotate:true, draw:'image', img:'/face-fx/r/wig-blonde.png' },

    // ── 안경류(실사) ──
    { id:'rgblack', ko:'뿔테 안경',     en:'Black Glasses',     anchor:'eyes', scale:1.60, yOff:0.05, rotate:true, draw:'image', img:'/face-fx/r/glasses-black.png' },
    { id:'raviator',ko:'항공 선글라스', en:'Aviator Shades',    anchor:'eyes', scale:1.62, yOff:0.05, rotate:true, draw:'image', img:'/face-fx/r/aviator.png' },
    { id:'rgoggle', ko:'보안경',        en:'Safety Goggles',    anchor:'eyes', scale:1.66, yOff:0.05, rotate:true, draw:'image', img:'/face-fx/r/goggles.png' },
    { id:'rsteamgg',ko:'스팀펑크 고글', en:'Steampunk Goggles', anchor:'eyes', scale:2.05, yOff:0.05, rotate:true, draw:'image', img:'/face-fx/r/steamgoggles.png' },

    // ── 수염 ──
    { id:'rstache1',ko:'카이저 수염',   en:'Curly Mustache', anchor:'stache', scale:0.68, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/stache-curl-brown.png' },
    { id:'rstache2',ko:'검은 콧수염',   en:'Black Mustache', anchor:'stache', scale:0.66, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/stache-curl-black.png' },
    { id:'rstache3',ko:'넓은 콧수염',   en:'Wide Mustache',  anchor:'stache', scale:0.62, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/stache-wide.png' },
    { id:'rstache4',ko:'짧은 콧수염',   en:'Short Mustache', anchor:'stache', scale:0.42, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/stache-short.png' },
    { id:'rstache5',ko:'덥수룩 수염',   en:'Thick Mustache', anchor:'stache', scale:0.60, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/stache-thick.png', imgYOff:0.10 },
    { id:'rstache6',ko:'얇은 콧수염',   en:'Slim Mustache',  anchor:'stache', scale:0.50, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/stache-slim.png' },
    { id:'rbeardbl',ko:'금빛 턱수염',   en:'Blonde Beard',   anchor:'chin',   scale:1.00, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/beard-blonde.png', imgYOff:0.14 },
    { id:'rgoatee', ko:'염소 수염',     en:'Goatee',         anchor:'chin',   scale:0.62, yOff:0.00, rotate:true, draw:'image', img:'/face-fx/r/beard-goatee.png', imgYOff:0.18 },

    // ── 코 ──
    { id:'rnose',   ko:'빨간코',        en:'Red Nose',       anchor:'nose',   scale:0.32, yOff:0.00, rotate:false, draw:'image', img:'/face-fx/r/rednose.png' },

    // ── 남겨둔 그리기형 안경 3종 (가볍고 얼굴을 안 가려서 유지) ──
    { id:'sun',      ko:'썬글라스', en:'Sunglasses',  emoji:'🕶️', anchor:'eyes', scale:1.55, yOff:0.04, rotate:true, draw:'glasses', gl:'sun' },
    { id:'glasses',  ko:'안경',     en:'Glasses',     emoji:'👓', anchor:'eyes', scale:1.55, yOff:0.04, rotate:true, draw:'glasses', gl:'glasses' },
    { id:'goggles',  ko:'물안경',   en:'Goggles',     emoji:'🥽', anchor:'eyes', scale:1.55, yOff:0.04, rotate:true, draw:'glasses', gl:'goggles' }
  ];

  var vcFx = window.vcFx = {
    active:false, mode:'off',
    mpLoaded:false, mpLoading:null,
    detector:null,
    canvas:null, ctx:null,
    hiddenVideo:null,
    rafId:null, sending:false,
    processedStream:null,
    lastLM:null,       // 보간된 FaceMesh 랜드마크(떨림 완화)
    frameTick:0
  };

  // 진단·튜닝용 내부 핸들 노출 — 정지 사진에 액세서리를 얹어 scale/yOff 를 눈으로 맞출 때 사용.
  //   (렌더 경로에는 영향 없음. 콘솔에서 vcFx._items 로 값 바꾸고 바로 확인 가능)
  vcFx._items = FX_ITEMS;

  // 이미지 액세서리 프리로드 캐시 (.svg/.png 동일 처리, same-origin 이라 canvas taint 없음)
  vcFx._imgCache = vcFx._imgCache || {};
  function fxImg(src){
    if (!src) return null;
    var c = vcFx._imgCache[src];
    if (c) return c;
    var im = new Image();
    im.decoding = 'async';
    im.src = src;
    vcFx._imgCache[src] = im;
    return im;
  }
  function fxPreloadImages(){ FX_ITEMS.forEach(function(it){ if (it.img) fxImg(it.img); }); }

  // 🔬 진단 오버레이 — URL 에 ?fxdebug 가 있을 때만 표시(일반 사용자 영향 없음)
  function fxDbg(){
    try {
      // (2026-06-19) URL ?fxdebug 로는 더 이상 안 켜짐 — 저장된 링크에 fxdebug 가 붙어
      //   일반 사용자에게 녹색 진단 글자가 계속 보이던 문제 방지. 진단은 localStorage 로만 켬.
      //   (켜기:  localStorage.setItem('fx_debug','1')  /  끄기: removeItem)
      var on = false; try { on = localStorage.getItem('fx_debug') === '1'; } catch(_){}
      var el = document.getElementById('fx-dbg');
      // 꺼져 있으면 남아있는 진단 오버레이까지 제거하고 종료
      if (!on){ if (el && el.parentNode) el.parentNode.removeChild(el); return; }
      if (!el){
        el = document.createElement('div'); el.id='fx-dbg';
        el.style.cssText='position:fixed;left:6px;bottom:6px;z-index:2147483647;background:rgba(0,0,0,.82);color:#0f0;font:11px/1.45 monospace;padding:6px 8px;border-radius:6px;max-width:86vw;white-space:pre-wrap;pointer-events:none';
        document.body.appendChild(el);
      }
      var hv=vcFx.hiddenVideo, lv=document.getElementById('vc-local-video');
      var ps=vcFx.processedStream, pt=ps&&ps.getVideoTracks()[0];
      el.textContent =
        'mode='+vcFx.mode+' active='+vcFx.active+' engine='+(vcFx.engine||'-')+' dlg='+(vcFx._delegate||'-')+(vcFx._flRecovering?' [recovering]':'')+'\n'+
        'MP='+!!vcFx.mpLoaded+' detector='+(!!vcFx.detector||!!vcFx.fl)+' sending='+!!vcFx.sending+'\n'+
        'hv: rs='+(hv&&hv.readyState)+' '+(hv&&hv.videoWidth)+'x'+(hv&&hv.videoHeight)+' paused='+(hv&&hv.paused)+'\n'+
        'lastLM='+!!vcFx.lastLM+' miss='+(vcFx._missCount||0)+'\n'+
        'canvas='+(vcFx.canvas&&vcFx.canvas.width)+'x'+(vcFx.canvas&&vcFx.canvas.height)+'\n'+
        'pTrack='+(pt?(pt.readyState+'/en='+pt.enabled):'none')+'\n'+
        'localV: paused='+(lv&&lv.paused)+' rs='+(lv&&lv.readyState)+' bound='+(lv&&lv.srcObject===ps)+'\n'+
        'err='+(vcFx._lastErr?((vcFx._lastErr.name||'')+':'+(vcFx._lastErr.message||String(vcFx._lastErr))):'-');
    } catch(_){}
  }

  function fxMobile(){ return (typeof vcIsMobileDevice === 'function') ? vcIsMobileDevice() : (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'')); }
  function fxLang(){ try { return (localStorage.getItem('mango_lang')==='en' || document.documentElement.lang==='en') ? 'en' : 'ko'; } catch(_) { return 'ko'; } }

  function fxStatus(msg){ var el=document.getElementById('vc-fx-status'); if(el) el.textContent=msg; }

  // --- 그리드 UI 생성 ---
  function fxBuildGrid(){
    var grid = document.getElementById('vc-fx-grid');
    if (!grid || grid.dataset.built==='1') return;
    grid.dataset.built='1';
    var en = fxLang()==='en';
    var html = '';
    // 끄기 타일
    html += '<button class="vc-fx-tile vc-fx-active" data-fx="off" onclick="vcSetFace(\'off\')" '+
      'style="aspect-ratio:1/1;border:2px solid #a78bfa;border-radius:12px;background:linear-gradient(135deg,#1e293b,#0f172a);color:#e2e8f0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px;font-size:11px;font-weight:700">'+
      '<span style="font-size:26px">🚫</span><span data-ko="없음" data-en="None">'+(en?'None':'없음')+'</span></button>';
    FX_ITEMS.forEach(function(it){
      // 안경류는 옆다리 없는 앞면 전용 SVG 아이콘으로 표시
      var icon = (it.draw==='image')
        // loading=lazy — 이 패널은 처음엔 숨어 있음. 홈 첫 로딩에서 썸네일 35장(약 800KB)을
        //   미리 받지 않도록 반드시 유지할 것(성능 회귀 방지).
        ? '<span style="display:flex;align-items:center;justify-content:center;height:38px"><img src="'+it.img+'" alt="" loading="lazy" decoding="async" style="max-height:38px;max-width:52px;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))"></span>'
        : (it.draw==='glasses')
        ? '<span style="display:flex;align-items:center;justify-content:center;height:34px">'+fxGlassesSVG(it.gl)+'</span>'
        : '<span style="font-size:30px;line-height:1">'+(it.emoji || (it.draw==='mustache' ? '〰️' : '✨'))+'</span>';
      html += '<button class="vc-fx-tile" data-fx="'+it.id+'" onclick="vcSetFace(\''+it.id+'\')" '+
        'style="aspect-ratio:1/1;border:2px solid #334155;border-radius:12px;background:#0f172a;color:#e2e8f0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px;font-size:11px;font-weight:700">'+
        icon+
        '<span data-ko="'+it.ko+'" data-en="'+it.en+'">'+(en?it.en:it.ko)+'</span></button>';
    });
    grid.innerHTML = html;
  }

  // === [신규 1순위 엔진] MediaPipe Tasks-Vision FaceLandmarker ===
  //   레거시 face_mesh(2021, WASM solutions)는 모바일 브라우저에서 얼굴을 자주 못 잡음
  //   (detector 는 돌지만 multiFaceLandmarks 가 비어 분장이 안 붙음 = miss 계속 증가).
  //   tasks-vision 의 FaceLandmarker 는 모바일 최적화 + GPU 가속 + 비디오 직접입력이라 훨씬 안정적.
  //   랜드마크 토폴로지(468점 인덱스)는 face_mesh 와 동일 → FX_IDX/그리기 코드 그대로 재사용.
  //   forceCPU=true 면 GPU 를 건너뛰고 CPU 델리게이트로 생성(복구·모바일용).
  function fxInitFaceLandmarker(forceCPU){
    if (vcFx.fl) return Promise.resolve();
    if (vcFx._flLoading) return vcFx._flLoading;
    vcFx._flLoading = (async function(){
      var V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
      // 모듈/WASM fileset 은 1회만 받아 캐시(복구 재생성 시 재다운로드 방지)
      var vision = vcFx._vision || (vcFx._vision = await import(V + '/vision_bundle.mjs'));
      var fileset = vcFx._fileset || (vcFx._fileset = await vision.FilesetResolver.forVisionTasks(V + '/wasm'));
      var mk = function(delegate){
        return vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: delegate
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.3,   // 모바일·측면·일부 가림에도 잘 잡도록 민감하게
          minFacePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3
        });
      };
      // ⚠️ 모바일 GPU(WebGL) 델리게이트는 ROI 를 NaN 으로 계산해 그래프를 영구 손상시키는
      //   사례가 있음("ROI contains NaN values" → 이후 모든 프레임 실패). 모바일은 CPU 우선.
      var preferCPU = forceCPU || (typeof fxMobile==='function' && fxMobile());
      if (preferCPU){
        vcFx.fl = await mk('CPU'); vcFx._delegate = 'CPU';
      } else {
        try { vcFx.fl = await mk('GPU'); vcFx._delegate = 'GPU'; }
        catch(e){ vcFx._lastErr = e; vcFx.fl = await mk('CPU'); vcFx._delegate = 'CPU'; }
      }
      vcFx.engine = 'fl';
      vcFx.mpLoaded = true;
      if (!vcFx.canvas){
        vcFx.canvas = document.createElement('canvas');
        vcFx.canvas.width = 640; vcFx.canvas.height = 480;
        vcFx.ctx = vcFx.canvas.getContext('2d');
      }
    })();
    // 로드 끝나면 _flLoading 비워서 차후 재생성(복구) 이 가능하도록
    var p = vcFx._flLoading;
    p.then(function(){ vcFx._flLoading=null; }, function(){ vcFx._flLoading=null; });
    return p;
  }

  // detectForVideo 가 ROI NaN/그래프 손상 에러를 던지면 인스턴스가 영구히 깨진 상태가 됨.
  //   → close 후 CPU 델리게이트로 재생성. 재생성도 실패하면 레거시 FaceMesh 로 폴백.
  function fxRecoverFL(){
    if (vcFx._flRecovering) return;
    vcFx._flRecovering = true;
    try { vcFx.fl && vcFx.fl.close && vcFx.fl.close(); } catch(_){}
    vcFx.fl = null; vcFx._flLoading = null; vcFx._lastTs = null;
    setTimeout(function(){
      fxInitFaceLandmarker(true).then(function(){
        vcFx._flRecovering = false; vcFx._flErr = 0;
      }, function(e){
        vcFx._lastErr = e; vcFx._flRecovering = false; vcFx.engine = 'mesh';
        fxLoadMP().then(fxInitDetector).catch(function(){});
      });
    }, 500);
  }

  // 두 엔진(FaceLandmarker / 레거시 FaceMesh) 공통 — 원시 랜드마크 배열을 받아 보간 후 저장
  //   src: 랜드마크 배열(src[i] = {x,y[,z]} 정규화 0~1) 또는 null(미검출)
  function fxApplyRawLandmarks(src){
    if (!src){ vcFx._missCount=(vcFx._missCount||0)+1; if (vcFx._missCount>10) vcFx.lastLM=null; return; }
    vcFx._missCount = 0;
    var cur = {};
    FX_IDX.forEach(function(i){ var p=src[i]; if(p) cur[i]={x:p.x,y:p.y}; });
    // 적응형 보간 — 움직임이 크면 즉각 따라붙고(최대 0.92), 정지 시엔 강하게 떨림 억제(0.45)
    var prev = vcFx.lastLM;
    if (prev){
      FX_IDX.forEach(function(i){
        var o=prev[i], n=cur[i];
        if (o && n){
          var d = Math.hypot(n.x-o.x, n.y-o.y);
          var a = d>0.06 ? 0.92 : d>0.025 ? 0.72 : 0.45;
          cur[i]={ x:o.x+(n.x-o.x)*a, y:o.y+(n.y-o.y)*a };
        }
      });
    }
    vcFx.lastLM = cur;
  }

  // --- [폴백 2순위 엔진] MediaPipe FaceMesh(468점 정밀 랜드마크) lazy 로드 ---
  //   신규 엔진 로드 실패 시에만 사용(네트워크/구형 브라우저 대비)
  function fxLoadMP(){
    if (vcFx.mpLoaded) return Promise.resolve();
    if (vcFx.mpLoading) return vcFx.mpLoading;
    vcFx.mpLoading = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js';
      s.crossOrigin = 'anonymous';
      s.onload = function(){ vcFx.mpLoaded = true; resolve(); };
      s.onerror = function(){ reject(new Error('FaceMesh 로드 실패')); };
      document.head.appendChild(s);
    });
    return vcFx.mpLoading;
  }

  function fxInitDetector(){
    if (vcFx.detector) return Promise.resolve();
    if (typeof FaceMesh === 'undefined') return Promise.reject(new Error('FaceMesh 미로드'));
    vcFx.detector = new FaceMesh({
      locateFile: function(f){ return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/' + f; }
    });
    vcFx.detector.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,   // 경량(눈동자 정밀화 끔) → 발열·부하 절감
      minDetectionConfidence: 0.4,  // 살짝 낮춰 얼굴을 더 민감하게 잡음(측면·일부 가림에도 부착 유지)
      minTrackingConfidence: 0.5
    });
    vcFx.detector.onResults(fxOnResults);
    if (!vcFx.canvas){
      vcFx.canvas = document.createElement('canvas');
      vcFx.canvas.width = 640; vcFx.canvas.height = 480;
      vcFx.ctx = vcFx.canvas.getContext('2d');
    }
    return vcFx.detector.initialize ? vcFx.detector.initialize() : Promise.resolve();
  }

  // 숨겨진 카메라 비디오 (검출 입력) — vcBg 의 것을 재사용, 없으면 자체 생성
  function fxEnsureHiddenVideo(){
    if (typeof vcBg !== 'undefined' && vcBg.hiddenVideo) { vcFx.hiddenVideo = vcBg.hiddenVideo; }
    if (!vcFx.hiddenVideo){
      var hv = document.createElement('video');
      hv.autoplay=true; hv.muted=true; hv.playsInline=true; hv.setAttribute('playsinline','');
      hv.style.cssText='position:fixed;left:-9999px;top:-9999px;width:320px;height:240px;visibility:hidden;pointer-events:none';
      document.body.appendChild(hv);
      vcFx.hiddenVideo = hv;
    }
    var stream = (typeof vcLocalStream !== 'undefined') ? vcLocalStream : null;
    if (stream && vcFx.hiddenVideo.srcObject !== stream) vcFx.hiddenVideo.srcObject = stream;
    try { vcFx.hiddenVideo.play(); } catch(_){}
    return vcFx.hiddenVideo;
  }

  // 우리가 쓰는 FaceMesh 랜드마크 인덱스만 추려서 저장(468 전부 보간하면 낭비)
  //   10=이마중앙위, 152=턱끝, 234/454=얼굴 좌/우폭, 1=코끝, 2=코밑,
  //   13=윗입술중앙, 33=오른눈 바깥, 263=왼눈 바깥, 133=오른눈 안쪽, 362=왼눈 안쪽, 168=미간
  var FX_IDX = [10,152,234,454,1,2,13,33,263,133,362,168];

  // 레거시 FaceMesh 콜백 — 공통 핸들러로 위임
  function fxOnResults(res){
    var faces = res && res.multiFaceLandmarks;
    fxApplyRawLandmarks(faces && faces.length ? faces[0] : null);
  }

  // 안경 앞면 전용 아이콘(SVG) — 옆다리(귀걸이) 없이 렌즈 2개 + 브릿지만
  function fxGlassesSVG(kind){
    var frame = (kind==='goggles') ? '#3b9eff' : '#cbd5e1';
    var fill  = (kind==='sun') ? '#0b0b10' : (kind==='goggles' ? 'rgba(90,180,255,0.30)' : 'rgba(200,220,255,0.10)');
    var lens;
    if (kind==='goggles'){
      lens = '<ellipse cx="30" cy="25" rx="20" ry="17"/><ellipse cx="70" cy="25" rx="20" ry="17"/>';
    } else {
      lens = '<rect x="9" y="9" width="36" height="32" rx="9"/><rect x="55" y="9" width="36" height="32" rx="9"/>';
    }
    return '<svg width="46" height="24" viewBox="0 0 100 50" fill="'+fill+'" stroke="'+frame+'" stroke-width="5" stroke-linejoin="round">'+
           lens+'<line x1="45" y1="20" x2="55" y2="20"/></svg>';
  }

  // 안경 앞면 전용 그리기(캔버스) — 원점 중심, size = 전체 폭. 옆다리 없음.
  function fxDrawGlasses(ctx, kind, size){
    var lw = size*0.42, lh = size*0.40, gap = size*0.10;
    var cxL = -(gap/2 + lw/2), cxR = (gap/2 + lw/2);
    var r = Math.min(lw, lh)*0.30;
    var frame = (kind==='goggles') ? '#1e88e5' : '#1f2937';
    var lineW = Math.max(1, size*0.05);
    function lensPath(cx){
      ctx.beginPath();
      if (kind==='goggles'){
        ctx.ellipse(cx, 0, lw/2, lh/2, 0, 0, Math.PI*2);
      } else {
        var x = cx-lw/2, y = -lh/2;
        ctx.moveTo(x+r, y);
        ctx.arcTo(x+lw, y,    x+lw, y+lh, r);
        ctx.arcTo(x+lw, y+lh, x,    y+lh, r);
        ctx.arcTo(x,    y+lh, x,    y,    r);
        ctx.arcTo(x,    y,    x+lw, y,    r);
        ctx.closePath();
      }
    }
    // 렌즈 채움
    ctx.fillStyle = (kind==='sun') ? 'rgba(18,18,24,0.92)'
                  : (kind==='goggles') ? 'rgba(120,200,255,0.32)'
                  : 'rgba(190,215,255,0.16)';
    lensPath(cxL); ctx.fill();
    lensPath(cxR); ctx.fill();
    // 프레임 외곽선
    ctx.lineWidth = lineW; ctx.strokeStyle = frame; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    lensPath(cxL); ctx.stroke();
    lensPath(cxR); ctx.stroke();
    // 브릿지(코걸이)
    ctx.beginPath();
    ctx.moveTo(cxL + lw/2, -lh*0.10);
    ctx.lineTo(cxR - lw/2, -lh*0.10);
    ctx.lineWidth = lineW*0.9; ctx.stroke();
  }

  // 액세서리 한 개 그리기 — FaceMesh 랜드마크 기준 정밀 배치
  function fxDrawItem(ctx, it, lm, W, H){
    if (!lm) return;
    function P(i){ var p=lm[i]; return p ? { x:p.x*W, y:p.y*H } : null; }
    var forehead=P(10), chin=P(152), faceLp=P(234), faceRp=P(454),
        noseTip=P(1), noseBot=P(2), lipTop=P(13),
        eyeR=P(33), eyeL=P(263), brow=P(168);
    if (!forehead || !faceLp || !faceRp) return;

    var faceW = Math.hypot(faceRp.x-faceLp.x, faceRp.y-faceLp.y);
    // 고개 기울기(roll): 두 눈 바깥 코너 기준, 없으면 얼굴 좌우폭 기준
    var angle = 0;
    if (eyeR && eyeL) angle = Math.atan2(eyeL.y-eyeR.y, eyeL.x-eyeR.x);
    else angle = Math.atan2(faceRp.y-faceLp.y, faceRp.x-faceLp.x);

    var px, py, size, eyeMid=null, eyeSpan=faceW*0.46;
    if (eyeR && eyeL){
      eyeMid = { x:(eyeR.x+eyeL.x)/2, y:(eyeR.y+eyeL.y)/2 };
      eyeSpan = Math.hypot(eyeL.x-eyeR.x, eyeL.y-eyeR.y) || eyeSpan;
    }

    // 위 방향 단위벡터(고개 기울기 반영) — 모자를 머리 위로 정확히 올리기 위함
    var up = { x:Math.sin(angle), y:-Math.cos(angle) };

    if (it.anchor==='hat'){
      size = faceW * it.scale;
      var lift = size*0.20 - it.yOff*faceW;   // 머리 위 띄움 대폭 축소 → 모자가 머리에 얹힘. yOff 클수록 더 내려옴
      px = forehead.x + up.x*lift;
      py = forehead.y + up.y*lift;
    } else if (it.anchor==='eyes'){
      px = (eyeMid?eyeMid.x:forehead.x) + up.x*(-it.yOff*faceW);
      py = (eyeMid?eyeMid.y:forehead.y) + up.y*(-it.yOff*faceW);
      size = eyeSpan * it.scale;
    } else if (it.anchor==='nose'){
      var n = noseTip || brow || forehead;
      px = n.x; py = n.y; size = faceW * it.scale;
    } else if (it.anchor==='stache'){
      var a0 = noseBot || noseTip || forehead;
      var b0 = lipTop || chin || forehead;
      px = a0.x + (b0.x-a0.x)*0.4;
      py = a0.y + (b0.y-a0.y)*0.4;
      // 실사 콧수염은 얼굴 폭보다 좁아야 자연스러움 → scale 을 반영(그리기형은 내부에서 faceW 를 따로 씀)
      size = faceW * (it.scale || 1);
    } else if (it.anchor==='chin'){
      // 콧밑~턱끝 사이(턱 쪽으로) — 수염 등 하관 액세서리
      var cn = noseBot || noseTip || forehead;
      var ch2 = chin || noseBot || forehead;
      px = cn.x + (ch2.x-cn.x)*0.55 + up.x*(-it.yOff*faceW);
      py = cn.y + (ch2.y-cn.y)*0.55 + up.y*(-it.yOff*faceW);
      size = faceW * it.scale;
    } else { // face — 얼굴 전체 덮기
      var bot = chin || noseBot || forehead;
      px = (forehead.x+bot.x)/2 + up.x*(-it.yOff*faceW);
      py = (forehead.y+bot.y)/2 + up.y*(-it.yOff*faceW);
      size = faceW * it.scale;
    }

    ctx.save();
    ctx.translate(px, py);
    if (it.rotate) ctx.rotate(angle);
    // 입체감/또렷함을 위한 그림자
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.max(2, size*0.05);
    ctx.shadowOffsetY = Math.max(1, size*0.025);
    if (it.draw==='mustache'){
      var mw = faceW*0.6, mh = faceW*0.24;
      ctx.fillStyle = '#2b1a0e';
      ctx.beginPath();
      ctx.moveTo(0,-mh*0.15);
      ctx.bezierCurveTo(-mw*0.15,-mh*0.5, -mw*0.45,-mh*0.5, -mw*0.5,mh*0.1);
      ctx.bezierCurveTo(-mw*0.45,mh*0.5, -mw*0.2,mh*0.45, 0,mh*0.05);
      ctx.bezierCurveTo( mw*0.2,mh*0.45,  mw*0.45,mh*0.5,  mw*0.5,mh*0.1);
      ctx.bezierCurveTo( mw*0.45,-mh*0.5, mw*0.15,-mh*0.5, 0,-mh*0.15);
      ctx.fill();
    } else if (it.draw==='glasses'){
      fxDrawGlasses(ctx, it.gl, size);
    } else if (it.draw==='image'){
      // 실사풍 투명 이미지 오버레이 — 폭=size, 높이=원본 비율 유지
      var im = fxImg(it.img);
      if (im && im.complete && im.naturalWidth){
        var iw = size;
        var ih = size * (im.naturalHeight / im.naturalWidth || 1);
        var oy = (it.imgYOff || 0) * size;   // 이미지 내부 세로 미세조정(+면 아래로)
        try { ctx.drawImage(im, -iw/2, -ih/2 + oy, iw, ih); } catch(_){}
      }
    } else {
      ctx.textAlign='center'; ctx.textBaseline='middle';
      try { ctx.filter = 'saturate(1.35) contrast(1.06)'; } catch(_){}
      ctx.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color",sans-serif';
      ctx.fillText(it.emoji, 0, 0);
      try { ctx.filter = 'none'; } catch(_){}
    }
    ctx.restore();
  }

  vcFx._drawItem = fxDrawItem;   // 진단·튜닝용(위 vcFx._items 주석 참고)

  // 렌더 루프 — 매 프레임 base 영상 그리고, 검출은 N프레임마다, 액세서리는 매 프레임(보간된 얼굴로)
  function fxLoop(){
    if (!vcFx.active){ vcFx.rafId=null; return; }
    var ctx = vcFx.ctx, cv = vcFx.canvas;
    // base 프레임 결정: 가상배경 처리중이면 그 합성 캔버스, 아니면 원본 카메라
    var bgActive = (typeof vcBg!=='undefined' && vcBg.isProcessing && vcBg.canvas && vcBg.canvas.width>0);
    var base = bgActive ? vcBg.canvas : vcFx.hiddenVideo;
    var bw = bgActive ? vcBg.canvas.width  : (vcFx.hiddenVideo? vcFx.hiddenVideo.videoWidth :0);
    var bh = bgActive ? vcBg.canvas.height : (vcFx.hiddenVideo? vcFx.hiddenVideo.videoHeight:0);
    if (bw>0 && bh>0){
      // 캔버스 크기를 base 에 맞춤(과대 인코딩 방지: 가로 상한)
      var target = (typeof vcBgTargetWidth==='function') ? vcBgTargetWidth() : (fxMobile()?480:640);
      var cw = Math.min(bw, target), ch = Math.round(cw*bh/bw);
      if (cv.width!==cw || cv.height!==ch){ cv.width=cw; cv.height=ch; }
      try { ctx.drawImage(base, 0, 0, cv.width, cv.height); } catch(_){}
      // 액세서리
      if (vcFx.mode!=='off'){
        var it = null; for (var i=0;i<FX_ITEMS.length;i++){ if (FX_ITEMS[i].id===vcFx.mode){ it=FX_ITEMS[i]; break; } }
        if (it) fxDrawItem(ctx, it, vcFx.lastLM, cv.width, cv.height);
      }
    }
    // 검출 — 데스크톱 매 프레임, 모바일 격프레임(발열·부하 절감)
    vcFx.frameTick++;
    var everyN = fxMobile()?2:1;
    var hv = vcFx.hiddenVideo;
    // 워치독: 레거시 send 가 2초 넘게 안 끝나면(WASM 멈춤) 풀어줘 파이프라인이 영구히 죽지 않게
    if (vcFx.sending && vcFx._sendStart && (performance.now()-vcFx._sendStart > 2000)) vcFx.sending=false;
    if (vcFx.frameTick % everyN === 0 && hv && hv.readyState>=2 && hv.videoWidth>0){
      if (vcFx.engine==='fl' && vcFx.fl){
        // 🟢 신규 엔진: 비디오 프레임을 직접 입력(동기 호출). 타임스탬프는 단조 증가 필수.
        var ts = performance.now();
        if (vcFx._lastTs!=null && ts<=vcFx._lastTs) ts = vcFx._lastTs+1;
        vcFx._lastTs = ts;
        // 프레임 유효성 가드(폭·높이 0 이면 NaN ROI 유발) — 한쪽이라도 0 이면 이번 프레임 검출 건너뜀
        if (hv.videoWidth>0 && hv.videoHeight>0){
          try {
            var r = vcFx.fl.detectForVideo(hv, ts);
            vcFx._flErr = 0;
            fxApplyRawLandmarks(r && r.faceLandmarks && r.faceLandmarks.length ? r.faceLandmarks[0] : null);
          } catch(err){
            vcFx._lastErr = err;
            var em = (err && err.message) ? err.message : String(err);
            // ROI NaN / 그래프 손상 → 인스턴스 영구 손상. 누적 2회 시 CPU 로 재생성.
            if (/NaN|Graph has errors|INVALID_ARGUMENT|WaitUntilIdle|RET_CHECK/i.test(em)){
              vcFx._flErr = (vcFx._flErr||0)+1;
              if (vcFx._flErr>=2) fxRecoverFL();
            }
          }
        }
      } else if (vcFx.detector && !vcFx.sending){
        // 🟡 폴백 레거시 FaceMesh(WASM send) — 축소 프레임 입력
        var iw = fxMobile()?384:480, ih = Math.max(1, Math.round(iw*hv.videoHeight/(hv.videoWidth||1)));
        if (!vcFx.inCanvas){ vcFx.inCanvas=document.createElement('canvas'); vcFx.inCtx=vcFx.inCanvas.getContext('2d'); }
        if (vcFx.inCanvas.width!==iw || vcFx.inCanvas.height!==ih){ vcFx.inCanvas.width=iw; vcFx.inCanvas.height=ih; }
        try { vcFx.inCtx.drawImage(hv,0,0,iw,ih); } catch(_){}
        vcFx.sending=true; vcFx._sendStart=performance.now();
        vcFx.detector.send({ image: vcFx.inCanvas }).catch(function(err){ vcFx._lastErr = err; }).finally(function(){ vcFx.sending=false; });
      }
    }
    fxDbg();
    vcFx.rafId = requestAnimationFrame(fxLoop);
  }

  // fx 내부에서 트랙 교체 (가드 우회 플래그)
  function fxInternalSwap(track){
    window.__vcFxInternalSwap = true;
    try { if (typeof vcSwapVideoTrack==='function') vcSwapVideoTrack(track); }
    finally { window.__vcFxInternalSwap = false; }
  }

  // 액세서리 끄고 적절한 소스로 복귀
  function fxRestoreSource(){
    var localV = document.getElementById('vc-local-video');
    var bgActive = (typeof vcBg!=='undefined' && vcBg.isProcessing && vcBg.processedStream);
    if (bgActive){
      if (localV) localV.srcObject = vcBg.processedStream;
      var t = vcBg.processedStream.getVideoTracks()[0];
      if (t) fxInternalSwap(t);
    } else {
      var ls = (typeof vcLocalStream!=='undefined') ? vcLocalStream : null;
      if (localV && ls) localV.srcObject = ls;
      var ct = ls && ls.getVideoTracks()[0];
      if (ct) fxInternalSwap(ct);
    }
  }

  // === 메인 진입점 ===
  window.vcSetFace = async function(mode){
    // 활성 타일 표시
    document.querySelectorAll('.vc-fx-tile').forEach(function(t){
      var on = t.getAttribute('data-fx')===mode;
      t.classList.toggle('vc-fx-active', on);
      t.style.borderColor = on ? '#a78bfa' : '#334155';
    });
    var en = fxLang()==='en';

    if (mode==='off'){
      vcFx.mode='off'; vcFx.active=false;
      if (vcFx.rafId){ cancelAnimationFrame(vcFx.rafId); vcFx.rafId=null; }
      fxRestoreSource();
      fxStatus(en?'Off':'꺼짐');
      return;
    }

    var ls = (typeof vcLocalStream!=='undefined') ? vcLocalStream : null;
    var camTrack = ls && ls.getVideoTracks()[0];
    if (!camTrack){ fxStatus(en?'⚠ Turn on camera first':'⚠ 카메라를 먼저 켜주세요'); return; }

    vcFx.mode = mode;
    fxStatus(en?'Loading face model…':'얼굴인식 모델 로딩 중…');
    try {
      // 1순위: 모바일에서도 잘 잡는 FaceLandmarker. 실패 시에만 레거시 FaceMesh 폴백(데스크톱 회귀 방지).
      try {
        await fxInitFaceLandmarker();
      } catch(e0){
        vcFx._lastErr = e0; vcFx.engine = 'mesh';
        console.warn('[vc-fx] FaceLandmarker 초기화 실패 → 레거시 FaceMesh 폴백', e0);
        await fxLoadMP();
        await fxInitDetector();
      }
      fxEnsureHiddenVideo();
    } catch(e){
      console.warn('[vc-fx] init fail', e);
      fxStatus(en?'⚠ Failed to load (check network)':'⚠ 로드 실패 (네트워크 확인)');
      return;
    }

    vcFx.active = true;
    vcFx.frameTick = 0;
    if (!vcFx.rafId) fxLoop();

    // 캔버스 스트림 → 송신 + 로컬 미리보기
    if (!vcFx.processedStream){
      var baseFps = (typeof vcBgCaptureFps==='function') ? vcBgCaptureFps() : (fxMobile()?12:20);
      var fps = Math.max(baseFps, fxMobile()?15:24);   // 출력 영상 fps 상향 → 액세서리 움직임이 더 부드럽고 즉각적
      vcFx.processedStream = vcFx.canvas.captureStream(fps);
      var audio = ls.getAudioTracks()[0];
      if (audio) vcFx.processedStream.addTrack(audio);
    }
    var localV = document.getElementById('vc-local-video');
    if (localV){
      localV.srcObject = vcFx.processedStream;
      // 모바일(안드로이드 Chrome) 자동재생 정책: srcObject 교체 후 명시적 play() 안 하면
      //   이전 프레임에 멈춰 장식이 안 보임 → 반드시 재생 호출
      localV.muted = true; localV.setAttribute('playsinline','');
      try { var _p=localV.play(); if(_p&&_p.catch) _p.catch(function(){}); } catch(_){}
    }
    var outTrack = vcFx.processedStream.getVideoTracks()[0];
    if (outTrack) fxInternalSwap(outTrack);

    var name = en ? (FX_ITEMS.filter(function(x){return x.id===mode;})[0]||{}).en : (FX_ITEMS.filter(function(x){return x.id===mode;})[0]||{}).ko;
    fxStatus('✅ ' + (name||mode) + (en?' applied — visible to everyone':' 적용됨 — 모든 참가자에게 보임'));

    // 진단: 3초 내 얼굴 랜드마크가 한 번도 안 잡히면 원인을 화면에 알림
    //   (모바일에서 분장이 "안 나타나는" 경우 원인 파악용 — 조용한 실패 방지)
    setTimeout(function(){
      if (vcFx.mode!==mode || !vcFx.active) return;
      if (!vcFx.lastLM){
        var why = vcFx._lastErr ? (' ('+(vcFx._lastErr.message||vcFx._lastErr)+')') : '';
        fxStatus((en?'⚠ Face not detected — face the camera in bright light':'⚠ 얼굴 인식 안됨 — 밝은 곳에서 정면을 봐주세요')+why);
      }
    }, 3000);
  };

  // 그리드 빌드 (탭 진입 시 + 초기)
  function fxInit(){
    // ⚠️ 여기서 fxPreloadImages() 를 부르지 말 것 — 실사 액세서리 PNG 35장(약 800KB)을
    //    홈 첫 로딩에 통째로 받아버림. 배경화면 탭을 실제로 열 때 1회만 예열한다.
    fxBuildGrid();
    // 배경 탭 버튼 클릭 시에도 빌드 보장
    document.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('.tab-btn');
      if (b){
        setTimeout(fxBuildGrid, 60);
        if (!vcFx._preloaded){ vcFx._preloaded = true; setTimeout(fxPreloadImages, 400); }
      }
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', fxInit);
  else fxInit();
})();
