/* Authored targets for dedicated Higgsfield photoreal scenes. No AI grading. */
(function(root){
  'use strict';
  var rows = [
    ['space','우주 정거장','Space station','adventure','우주복을 입은 사람','the person in the spacesuit','astronaut|an astronaut|the astronaut','waving|wave|waving a hand','The astronaut is waving.|An astronaut is waving.|The astronaut waves.|He is waving.'],
    ['castle','마법의 성','Magic castle','adventure','마법사가 흔드는 물건','the object the wizard waves','wand|a wand|magic wand|a magic wand','waving a wand|wave a wand|waving his wand','The wizard is waving a wand.|A wizard is waving a wand.|The wizard waves a wand.|He is waving a wand.'],
    ['jungle','정글 탐험','Jungle trail','adventure','안내자가 가리키는 동물','the animal the guide points at','monkey|a monkey|the monkey','pointing at a monkey|point at a monkey|pointing to a monkey','The guide is pointing at a monkey.|The guide is pointing to a monkey.|A guide is pointing at a monkey.'],
    ['ocean','바닷속 탐험','Under the sea','adventure','잠수 장비를 착용한 사람','the person wearing diving equipment','diver|a diver|the diver','waving|wave|waving a hand','The diver is waving.|A diver is waving.|The diver waves.'],
    ['birthday-action','생일 파티','Birthday party','everyday','케이크 위에 있는 것','the things on the cake','candles|candle|the candles','blowing out the candles|blow out the candles|blowing out candles','A boy is blowing out the candles.|The boy is blowing out the candles.|He is blowing out the candles.'],
    ['cooking-action','꼬마 요리사','Little chefs','everyday','아이가 젓고 있는 반죽','the mixture the boy is stirring','batter|the batter','stirring the batter|stir the batter|stirring batter','A boy is stirring the batter.|The boy is stirring the batter.|He is stirring the batter.'],
    ['library','비밀 도서관','Secret library','everyday','아이가 읽고 있는 것','the thing the child is reading','book|a book|the book','reading a book|read a book|reading the book','The child is reading a book.|A child is reading a book.|The girl is reading a book.'],
    ['soccer','결승전의 순간','Match point','everyday','선수가 발로 차는 것','the thing the player kicks','ball|a ball|the ball|soccer ball|football','kicking the ball|kick the ball|kicking a ball','The player is kicking the ball.|A player is kicking the ball.|The player kicks the ball.'],
    ['beach','모래성 해변','Sandcastle beach','nature','아이들이 모래로 만드는 것','the thing the children build with sand','sandcastle|a sandcastle|sand castle|a sand castle','building a sandcastle|build a sandcastle|building a sand castle','The children are building a sandcastle.|The kids are building a sandcastle.|They are building a sandcastle.'],
    ['zoo','동물원 친구','Zoo friends','nature','사육사가 먹이를 주는 동물','the animal the keeper feeds','giraffe|a giraffe|the giraffe','feeding the giraffe|feed the giraffe|feeding a giraffe','The keeper is feeding the giraffe.|A keeper is feeding the giraffe.|The zookeeper is feeding the giraffe.'],
    ['farm','농장 친구들','Farm friends','nature','아이가 먹이를 주는 동물','the animals the child feeds','chickens|chicken|the chickens','feeding the chickens|feed the chickens|feeding chickens','The child is feeding the chickens.|A child is feeding the chickens.|The child feeds the chickens.'],
    ['snow','눈의 왕국','Snow kingdom','nature','아이들이 눈으로 만드는 것','the thing the children build with snow','snowman|a snowman|the snowman','building a snowman|build a snowman|making a snowman','The children are building a snowman.|The kids are building a snowman.|They are building a snowman.|The children are making a snowman.']
  ];
  var actions = {space:['손을 흔들어 인사해요.','Move a hand to say hello.'],castle:['마법 지팡이를 흔들어요.','Move a magic wand.'],jungle:['원숭이를 손으로 가리켜요.','Show where the monkey is with a finger.'],ocean:['손을 흔들어 인사해요.','Move a hand to say hello.'],'birthday-action':['촛불을 불어 꺼요.','Use a breath to put out the candles.'],'cooking-action':['반죽을 저어요.','Mix the batter with a spoon.'],library:['책을 읽어요.','Look at the words in a book.'],soccer:['공을 발로 차요.','Hit the ball with a foot.'],beach:['모래성을 만들어요.','Make a castle with sand.'],zoo:['기린에게 먹이를 줘요.','Give food to the giraffe.'],farm:['닭들에게 먹이를 줘요.','Give food to the chickens.'],snow:['눈사람을 만들어요.','Make a person with snow.']};
  var scenes = rows.map(function(r){return {id:r[0],ko:r[1],en:r[2],world:r[3],actionKo:actions[r[0]][0],actionEn:actions[r[0]][1],clueKo:r[4],clueEn:r[5],answers:r.slice(6).map(function(a){return a.split('|');}),poster:'/img/scene-quest/'+r[0]+'.webp',video:'/videos/scene-quest/'+r[0]+'.mp4'};});
  // 🖼 사진 문제 은행(2026-09-23) — 이미 가진 Higgsfield 실사 사진(`/img/scene-clips/` 행동 장면 · `/img/scene-words/` 낱말 사진 중 사람이 나오는 것)에 사람이 사진을 보고 쓴 정답.
  //    원본은 docs/scene-curriculum-media/scene-quest-bank.json, 빌드는 scripts/build-scene-quest-bank.mjs.
  //    영상은 아직 없어 video:null — 화면이 «영상 보기» 를 감춥니다. world 는 교재 수준(bts·siu-basic·siu-advance).
  //    📦 수준별로 나눠 받습니다(2026-09-24) — 파일은 scene-quest-bank-<band>.js 셋이고, 화면은 학생이 고른 수준만
  //    «탐험 시작» 을 누를 때 load() 로 받습니다(처음 열 때 받는 사진 문제 0바이트). 주소(?v=)는 화면 HTML 의
  //    <template id="sq-banks"> 가 정본이라 asset_version 하니스가 지킵니다. ⛔ 주소를 여기 적지 마세요.
  var BANDS=['bts','siu-basic','siu-advance'],loaded={};
  function cap(t){return t.charAt(0).toUpperCase()+t.slice(1);}
  function addBank(band,list){
    if(loaded[band]||BANDS.indexOf(band)<0||!list)return;loaded[band]=true;
    list.forEach(function(b){
      var sent=[];b.subj.forEach(function(sj){b.phrase.forEach(function(ph){sent.push(sj+' '+b.aux+' '+ph);});(b.simple||[]).forEach(function(sp){sent.push(sj+' '+sp);});});
      sent[0]=cap(sent[0])+'.';
      var s=b.src==='w'?'w':'c';
      scenes.push({id:s+b.i,ko:b.ko,en:b.en,world:band,actionKo:b.actionKo,actionEn:b.actionEn,clueKo:b.clueKo,clueEn:b.clueEn,answers:[b.word.slice(),b.phrase.slice(),sent],poster:'/img/'+(s==='w'?'scene-words':'scene-clips')+'/'+b.i+'.webp',video:null});
    });
  }
  var inNode=typeof module!=='undefined'&&module.exports;
  if(inNode)BANDS.forEach(function(band){addBank(band,require('./scene-quest-bank-'+band+'.js'));});
  else{var pre=root.MangoiSceneQuestBanks||{};BANDS.forEach(function(band){addBank(band,pre[band]);});}
  // 그 세계에 필요한 수준 — 'all'(깜짝 탐험)은 세 수준 모두, 그림·영상 세계는 받을 것이 없습니다.
  function bandsFor(world){return world==='all'?BANDS.slice():BANDS.indexOf(world)>=0?[world]:[];}
  function ready(world){return bandsFor(world).every(function(b){return loaded[b];});}
  // urls: {band: '/js/scene-quest-bank-<band>.js?v=N'} · done(err) — 하나라도 못 받으면 err 로 알립니다(지어내지 않음).
  function load(world,urls,done){
    var need=bandsFor(world).filter(function(b){return !loaded[b];}),left=need.length,failed=null;
    if(!left){done(null);return;}
    need.forEach(function(band){
      if(!urls||!urls[band]){failed=failed||new Error('no url: '+band);if(--left===0)done(failed);return;}
      var el=document.createElement('script');el.src=urls[band];el.async=true;
      el.onload=function(){addBank(band,(root.MangoiSceneQuestBanks||{})[band]);if(!loaded[band])failed=failed||new Error('empty: '+band);if(--left===0)done(failed);};
      el.onerror=function(){el.remove();failed=failed||new Error('load failed: '+band);if(--left===0)done(failed);};
      document.head.appendChild(el);
    });
  }
  function normalize(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\b(he|she|it)'s\b/g,'$1 is').replace(/\b(they|we)'re\b/g,'$1 are').replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();}
  function distance(a,b){var prev=Array.from({length:b.length+1},function(_,i){return i;});for(var i=1;i<=a.length;i++){var next=[i];for(var j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=next;}return prev[b.length];}
  function check(value,scene,level){
    var n=normalize(value), accepted=(level===1?scene.answers[1].concat(scene.answers[2]):scene.answers[level]).map(normalize);
    if(!n)return 'empty';
    if(accepted.indexOf(n)>=0)return 'correct';
    // A spelling nudge never grants a pass, and never hints that negation is correct.
    if(!/\b(not|no|never|isnt|isn't|arent|aren't|dont|don't)\b/.test(n)&&n.length>=4&&accepted.some(function(a){return distance(n,a)===1;}))return 'close';
    return 'wrong';
  }
  function deck(world,level,random){
    random=random||Math.random;
    var pool=scenes.filter(function(s){return world==='all'||s.world===world;}).slice();
    for(var i=pool.length-1;i>0;i--){var j=Math.floor(random()*(i+1)),t=pool[i];pool[i]=pool[j];pool[j]=t;}
    var selected=pool.slice(0,4).map(function(s){return {scene:s,level:level,boss:false};});
    selected.push({scene:pool[0],level:Math.min(2,level+1),boss:true});
    return selected;
  }
  var api={scenes:scenes,normalize:normalize,check:check,deck:deck,bands:BANDS,ready:ready,load:load,addBank:addBank};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MangoiSceneQuest=api;
})(typeof window!=='undefined'?window:this);
