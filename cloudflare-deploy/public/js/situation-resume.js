/* Same-tab recovery only. Never persist recordings, tokens, or HTML. */
(function(root){
  'use strict';
  var KEY='mangoi_situation_resume';
  function owner(){
    for(var keys=['mango_user','mangoi_logged_user'],i=0;i<keys.length;i++){
      try{var u=JSON.parse(localStorage.getItem(keys[i])||'null');if(u&&(u.user_id||u.uid||u.id))return String(u.user_id||u.uid||u.id);}catch(e){}
    }
    return '';
  }
  function read(){
    try{
      var d=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(!d || typeof d.at!=='number' || !Number.isFinite(d.at) || d.owner!==owner() || d.sid!==sessionStorage.getItem('mangoi_warmup_sid') ||
        Date.now()-d.at>1800000 || d.at>Date.now() || !Array.isArray(d.messages) || !d.messages.length ||
        !root.MangoiSituations || !root.MangoiSituations.find(d.sit))return null;
      if(d.messages.length>48 || !d.messages.every(function(m){return m && (m.who==='me'||m.who==='ai') && typeof m.text==='string' && m.text.length<=8000;}))return null;
      return d;
    }catch(e){return null;}
  }
  function save(sit,sid,messages){
    try{sessionStorage.setItem(KEY,JSON.stringify({owner:owner(),sit:sit,sid:sid,at:Date.now(),messages:messages.slice(-48)}));}catch(e){}
  }
  root.MangoSituationResume={read:read,save:save};
})(window);
