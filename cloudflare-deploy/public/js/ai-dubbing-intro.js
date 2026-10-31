/* Keep embedded titles off screen even when a media server ignores seeks. */
(function (root) {
  'use strict';
  var states = new WeakMap();
  function prepare(video, scene) {
    var old = states.get(video);
    if (old) old();
    var cover = video.parentNode.querySelector('.dub-intro-cover');
    if (!cover) {
      cover = document.createElement('div');
      cover.className = 'dub-intro-cover';
      cover.setAttribute('aria-hidden', 'true');
      video.insertAdjacentElement('afterend', cover);
    }
    cover.replaceChildren();
    if (scene.poster) {
      var image = document.createElement('img');
      image.alt = ''; image.src = scene.poster;
      cover.appendChild(image);
    }
    var start = scene.playbackStartSec || 0, frame = null, active = true;
    cover.hidden = !start;
    function paint() {
      if (!active || !start) return;
      if (video.requestVideoFrameCallback) {
        if (frame !== null) return;
        frame = video.requestVideoFrameCallback(function (_, metadata) {
          frame = null;
          if (!active) return;
          cover.hidden = metadata.mediaTime >= start;
          if (!cover.hidden) paint();
        });
      } else cover.hidden = video.readyState >= 2 && video.currentTime >= start + 0.1;
    }
    function seeking() {
      if (video.currentTime < start) cover.hidden = false;
      paint();
    }
    video.addEventListener('loadeddata', paint);
    video.addEventListener('timeupdate', paint);
    video.addEventListener('seeking', seeking);
    states.set(video, function () {
      active = false;
      if (frame !== null && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frame);
      video.removeEventListener('loadeddata', paint);
      video.removeEventListener('timeupdate', paint);
      video.removeEventListener('seeking', seeking);
    });
  }
  root.MangoiDubIntro = { prepare: prepare };
})(typeof window !== 'undefined' ? window : this);
