/* Photographic icons for speaking setup/settings only. Higgsfield assets, 2026-10-04.
   Keep the original text/i18n and all controls; never observe chat or avatar animation.
   The four English faces use the same stills as mango-avatar.js, not generated faces. */
(function () {
  'use strict';
  var base = '/img/warmup-photos/';
  var faces = { emma:'/img/teacher-avatar.png', jake:'/img/hero-avatar.png',
    lily:'/img/lily-closed.webp', noah:'/img/noah-closed.webp',
    mei:'/img/mei-closed.webp', long:'/img/long-closed.webp' };
  var icons = {
    '🧑‍🎓':'child', '🧑‍💼':'adult', '👩‍🏫':'mei', '👨‍🏫':'long',
    '🇺🇸':'globe', '🇨🇳':'globe', '🧒':'kid', '🎒':'teen', '👩':'emma', '🦸':'jake', '👧':'lily', '👦':'noah',
    '📘':'book', '📗':'book', '📚':'book', '📖':'book', '💬':'conversation',
    '🗣️':'conversation', '🗣':'conversation', '🌐':'globe', '🏠':'home',
    '🎤':'microphone', '🎙️':'microphone', '🎙':'microphone', '🎯':'target',
    '🚀':'rocket', '💡':'bulb', '✨':'bulb', '🐢':'turtle', '🐇':'rabbit',
    '🌱':'seedling', '👂':'ear', '👁️':'eye', '👁':'eye', '⚙️':'settings',
    '⚙':'settings', '🎚️':'sliders', '🎚':'sliders', '🗑️':'trash', '🗑':'trash',
    '🔊':'speaker', '🔇':'speaker', '🔄':'restart', '🔀':'shuffle', '📊':'levels',
    '📱':'phone', '⌨️':'keyboard', '✅':'check', '🔔':'bell'
  };
  var pattern = new RegExp(Object.keys(icons).sort(function(a,b){return b.length-a.length;}).join('|'), 'gu');
  var roots = [document.getElementById('wuSetup'), document.querySelector('.top')].filter(Boolean);
  var observer;
  function replace(node) {
    var value = node.nodeValue;
    pattern.lastIndex = 0;
    if (!pattern.test(value)) return;
    pattern.lastIndex = 0;
    var fragment = document.createDocumentFragment(), last = 0, match;
    while ((match = pattern.exec(value))) {
      fragment.appendChild(document.createTextNode(value.slice(last,match.index)));
      var key = icons[match[0]], img = document.createElement('img');
      img.className = 'wu-photo-icon' + (faces[key] ? ' wu-photo-face' : '') + (match[0]==='🔇' ? ' wu-photo-muted' : '');
      img.src = faces[key] || base + key + '.webp';
      img.alt = ''; img.setAttribute('aria-hidden','true');
      img.width = 24; img.height = 24; img.decoding = 'async';
      img.draggable = false;
      // Preserve the meaning of the two icon-only speed endpoints for screen readers.
      if (node.parentElement.classList.contains('rate-side')) {
        img.removeAttribute('aria-hidden');
        img.alt = key==='turtle' ? '천천히 / Slow' : '빠르게 / Fast';
      }
      fragment.appendChild(img);
      last = pattern.lastIndex;
    }
    fragment.appendChild(document.createTextNode(value.slice(last)));
    node.replaceWith(fragment);
  }
  function decorate() {
    // Own DOM writes must not trigger another observer pass.
    if(observer) observer.disconnect();
    roots.forEach(function(root){
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode:function(node){
          return node.parentElement.closest('script,style,textarea,option,[contenteditable]')
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes=[], node;
      while((node=walker.nextNode())) nodes.push(node);
      nodes.forEach(replace);
    });
    if(observer) roots.forEach(function(root){observer.observe(root,{childList:true,characterData:true,subtree:true});});
  }
  observer = new MutationObserver(decorate);
  decorate();
})();
