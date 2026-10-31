(function () {
  'use strict';
  var filter = document.getElementById('styleFilter');
  var languageButton = document.getElementById('galleryLang');
  var result = document.getElementById('galleryResult');
  var groups = Array.from(document.querySelectorAll('.style-group'));
  var language = 'ko';
  try { if (localStorage.getItem('story_lang') === 'en') language = 'en'; } catch (_) {}
  function renderFilter() {
    var count = 0;
    groups.forEach(function (group) {
      group.hidden = filter.value !== 'all' && group.dataset.style !== filter.value;
      if (!group.hidden) count += Number(group.dataset.count);
    });
    result.textContent = language === 'en' ? count + ' books' : count + '권';
  }
  function renderLanguage() {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-ko]').forEach(function (el) {
      el.textContent = el.getAttribute(language === 'en' ? 'data-en' : 'data-ko');
    });
    languageButton.textContent = language === 'en' ? 'KO' : 'EN';
    document.title = language === 'en' ? 'Picture-book cover gallery · Mangoi' : '그림책 표지 갤러리 · 망고아이';
    renderFilter();
  }
  filter.addEventListener('change', renderFilter);
  languageButton.addEventListener('click', function () {
    language = language === 'en' ? 'ko' : 'en';
    try { localStorage.setItem('story_lang', language); } catch (_) {}
    renderLanguage();
  });
  renderLanguage();
}());
