/* Rhubarb/PocketSphinx via lip-sync-engine 1.0.3 (MIT).
   Audio stays in this worker. Pinned public model files are downloaded lazily. */
'use strict';
var engine;
var ready;
function init(){
  if(ready) return ready;
  ready=(async function(){
    importScripts('/vendor/rhubarb-1.0.3.js');
    engine=await createLipSyncEngineModule({locateFile:function(name){
      return 'https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3/dist/wasm/'+name;
    }});
    var p=engine._malloc(8); engine.stringToUTF8('/models',p,8);
    try { if(engine._lipsyncengine_init(p)!==0) throw new Error('model_init'); }
    finally {engine._free(p);}
    self.postMessage({type:'ready'});
  })();
  return ready;
}
self.onmessage=async function(event){
  var m=event.data;
  try{
    await init(); if(m.type==='init') return;
    if(m.type!=='analyze' || !(m.pcm instanceof Int16Array) || m.pcm.length>16000*45) return;
    var p=engine._malloc(m.pcm.byteLength), result=0;
    try{
      engine.HEAP16.set(m.pcm,p/2);
      result=engine._lipsyncengine_analyze_pcm16(p,m.pcm.length,16000,0);
      if(!result) throw new Error('analysis_failed');
      var data=JSON.parse(engine.UTF8ToString(result));
      self.postMessage({type:'result',id:m.id,cues:data.mouthCues});
    }finally{if(result)engine._lipsyncengine_free(result);engine._free(p);}
  }catch(e){self.postMessage({type:'error',id:m.id,error:String(e&&e.message||e)});}
};
