fetch('https://webrtc-unified-platform.navy111p.workers.dev').then(r=>r.text()).then(t=>{
  const has=s=>t.includes(s);
  console.log('size',t.length);
  ['vpLoadUrl','vpTogglePiP','vp-floating','tab-video','@media (max-width: 900px)','vpExtractYouTubeId','vpUploadFile','📹 동영상'].forEach(k=>console.log(k,has(k)));
}).catch(e=>console.error(e.message));
