/* Предложение для Аллы: видео эффектов, сохранение ответов, сводка и отправка Саше. ES2017, без сборки. */
(function () {
  'use strict';

  var STORE_KEY = 'thp-proposal-v2';        // v2: другой набор вопросов, старые ответы не подмешиваем
  var TITLE = 'Ответы по анимации для сайта The Hidden Paradise';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ── Видео эффектов ───────────────────────────────────────────────
     Под видео лежит кадр из той же записи (середина эффекта). Видео проявляется поверх, только когда у него есть
     кадр. Нет файла: видео убирается, остаётся кадр. Играет, только пока видно на экране (атрибута autoplay нет,
     поэтому файлы не качаются, пока до них не долистали). Движение дольше 5 секунд можно остановить кнопкой
     (WCAG 2.2.2); при «Уменьшении движения» ничего не играет само. */
  var ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor"/></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2l10 6-10 6z" fill="currentColor"/></svg>';

  function setupMedia(fig) {
    var video = $('video', fig);
    if (!video) return;
    var fx = fig.closest('.fx');
    var name = fig.getAttribute('data-name') || (fx && fx.getAttribute('data-sum')) || '';
    var frame = $('.media-frame', fig);
    var userPaused = false;
    var inView = false;
    var dead = false;

    video.muted = true;                                  // iOS играет без жеста только беззвучное видео
    if (reduce && reduce.matches) { try { video.pause(); } catch (e) {} }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'media-toggle';
    btn.hidden = true;
    // Кнопка встаёт сразу за кадром (кадр скрыт от чтения с экрана, кнопка нет) и в CSS ложится в его угол.
    if (frame && frame.nextSibling) fig.insertBefore(btn, frame.nextSibling); else fig.appendChild(btn);

    function paint() {
      var playing = !video.paused && !video.ended;
      btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      btn.setAttribute('aria-label', (playing ? 'Остановить видео' : 'Включить видео') + (name ? ' «' + name + '»' : ''));
    }
    function kill() {
      if (dead) return;
      dead = true;
      fig.classList.add('no-video');
      fig.classList.remove('has-frame');
      btn.hidden = true;
      try { video.pause(); } catch (e) {}
    }
    function tryPlay() {
      if (dead || userPaused || (reduce && reduce.matches) || !inView) return;
      var p = video.play();
      if (p && p.catch) p.catch(function () { paint(); });
    }

    // Ошибка <source> не всплывает, но ловится на video в фазе перехвата.
    video.addEventListener('error', kill, true);
    var src = $('source', video);
    if (src) src.addEventListener('error', kill);
    // Видео есть: показываем кнопку паузы.
    function hasVideo() {
      if (dead) return;
      btn.hidden = false; paint();
    }
    video.addEventListener('loadedmetadata', hasVideo);
    video.addEventListener('loadeddata', function () { if (!dead) fig.classList.add('has-frame'); });
    video.addEventListener('playing', function () { if (!dead) { fig.classList.add('has-frame'); btn.hidden = false; } paint(); });
    video.addEventListener('pause', paint);


    btn.addEventListener('click', function () {
      if (video.paused) { userPaused = false; inView = true; var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      else { userPaused = true; video.pause(); }
      paint();
    });

    // Скрипт с defer мог опоздать: ошибка или метаданные уже случились до подписки.
    if (video.networkState === 3) kill();            // NETWORK_NO_SOURCE: файла нет
    else {
      if (video.readyState >= 1) hasVideo();
      if (video.readyState >= 2) fig.classList.add('has-frame');
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          inView = e.isIntersecting;
          if (inView) tryPlay(); else if (!video.paused) video.pause();
        });
      }, { threshold: 0.25 }).observe(fig);
    } else { inView = true; }

    if (reduce && reduce.addEventListener) {
      reduce.addEventListener('change', function () { if (reduce.matches && !video.paused) video.pause(); });
    }
    paint();
  }

  /* ── Ответы ─────────────────────────────────────────────────────── */
  var blocks = [];     // все [data-q] по порядку страницы: 6 эффектов, потом 7 вопросов
  var countEl, summaryEl, statusEl, sendBtn, fallback, fallbackMsg, fallbackText;
  var lastCount = -1;

  function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function say(input) {
    if (input.hasAttribute('data-say')) return input.getAttribute('data-say');
    var label = input.closest('label');
    var t = label ? label.textContent.replace(/\s+/g, ' ').trim() : input.value;
    return lowerFirst(t);
  }

  // Ответ по одному блоку: список строк [подпись, значение]; пусто, если не отвечено.
  function answerOf(block) {
    var out = [];
    var label = block.getAttribute('data-sum');
    var radios = $$('input[type=radio]:checked', block);
    var checks = $$('input[type=checkbox]:checked', block);
    if (radios.length) out.push([label, say(radios[0])]);
    if (checks.length) {
      var all = checks.filter(function (c) { return c.value === 'all'; })[0];
      out.push([label, all ? say(all) : checks.map(say).join(', ')]);
    }
    $$('input[type=text], textarea', block).forEach(function (f) {
      var v = f.value.trim();
      if (!v) return;
      var own = f.getAttribute('data-sum');
      out.push([own || label, v]);
    });
    return out;
  }

  function collect() {
    var fx = [], qs = [], answered = 0;
    blocks.forEach(function (b) {
      var a = answerOf(b);
      if (a.length) answered++;
      var into = b.getAttribute('data-kind') === 'effect' ? fx : qs;
      a.forEach(function (r) { into.push(r); });
    });
    return { fx: fx, qs: qs, answered: answered, total: blocks.length };
  }

  function buildText(d) {
    var parts = [TITLE];
    if (d.fx.length) parts.push(d.fx.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n'));
    if (d.qs.length) parts.push(d.qs.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n'));
    return parts.join('\n\n');
  }

  function renderList(title, rows) {
    var h = document.createElement('h3');
    h.textContent = title;
    var dl = document.createElement('dl');
    rows.forEach(function (r) {
      var row = document.createElement('div');
      var dt = document.createElement('dt'); dt.textContent = r[0];
      var dd = document.createElement('dd'); dd.textContent = r[1];
      row.appendChild(dt); row.appendChild(dd); dl.appendChild(row);
    });
    return [h, dl];
  }

  function update() {
    var d = collect();
    // Сводка: обычный текст под заголовком, без живого региона: её читают, когда до неё доходят.
    summaryEl.textContent = '';
    if (!d.fx.length && !d.qs.length) {
      var p = document.createElement('p');
      p.className = 'summary-empty';
      p.textContent = 'Пока ничего не отмечено. Отметь эффекты и ответь на пару вопросов выше, здесь соберётся короткий список.';
      summaryEl.appendChild(p);
    } else {
      if (d.fx.length) renderList('Эффекты', d.fx).forEach(function (n) { summaryEl.appendChild(n); });
      if (d.qs.length) renderList('Вопросы', d.qs).forEach(function (n) { summaryEl.appendChild(n); });
    }
    // Счётчик без «из N», чтобы не было похоже на экзамен. Объявляется вежливо и только когда число изменилось.
    if (d.answered !== lastCount) {
      lastCount = d.answered;
      countEl.textContent = d.answered ? 'Отмечено: ' + d.answered : '';
    }
    return d;
  }

  /* ── Сохранение в браузере ── */
  function snapshot() {
    var data = {};
    $$('[data-q] input, [data-q] textarea').forEach(function (f) {
      if (!f.name) return;
      if (f.type === 'radio') { if (f.checked) data[f.name] = f.value; }
      else if (f.type === 'checkbox') { data[f.name] = data[f.name] || []; if (f.checked) data[f.name].push(f.value); }
      else if (f.value) data[f.name] = f.value;
    });
    return data;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, at: Date.now(), data: snapshot() })); } catch (e) {}
  }
  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = (JSON.parse(raw) || {}).data || {}; } catch (e) { return; }
    $$('[data-q] input, [data-q] textarea').forEach(function (f) {
      if (!f.name || !(f.name in data)) return;
      var v = data[f.name];
      if (f.type === 'radio') f.checked = (f.value === v);
      else if (f.type === 'checkbox') f.checked = Array.isArray(v) && v.indexOf(f.value) > -1;
      else if (typeof v === 'string') f.value = v;
    });
  }

  /* ── Отправка ── */
  function setStatus(msg) {
    // Сбрасываем и ставим заново, чтобы одинаковое сообщение объявилось повторно.
    statusEl.textContent = '';
    if (msg) setTimeout(function () { statusEl.textContent = msg; }, 60);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    var ok = false;
    try { ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function showFallback(text) {
    fallback.hidden = false;
    fallbackText.value = text;
    fallbackMsg.setAttribute('role', 'alert');
    fallbackMsg.textContent = '';
    setTimeout(function () {
      fallbackMsg.textContent = 'Скопировать само не получилось. Текст ниже уже выделен: скопируй его и отправь мне в Telegram.';
    }, 60);
    fallbackText.focus();
    fallbackText.select();
    try { fallbackText.setSelectionRange(0, text.length); } catch (e) {}
  }

  // Меню «Поделиться» открываем на телефонах и планшетах; на компьютере надёжнее скопировать.
  function canShare() {
    return !!navigator.share && !!window.matchMedia && matchMedia('(pointer: coarse)').matches;
  }

  async function send() {
    var d = update();
    fallback.hidden = true;
    if (!d.answered) { setStatus('Пока ничего не отмечено. Отметь что-нибудь выше, и я пойму, что тебе ближе.'); return; }
    var text = buildText(d);
    if (canShare()) {
      try {
        await navigator.share({ text: text });
        setStatus('Ответы отправлены');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') { setStatus(''); return; }
        // любая другая ошибка: пробуем скопировать
      }
    }
    var ok = false;
    try { ok = await copyText(text); } catch (e) { ok = false; }
    if (ok) { setStatus('Ответы скопированы, вставь их в Telegram'); return; }
    setStatus('');
    showFallback(text);
  }

  function init() {
    $$('.media').forEach(setupMedia);

    blocks = $$('[data-q]');
    countEl = $('#count');
    summaryEl = $('#summary');
    statusEl = $('#send-status');
    sendBtn = $('#send');
    fallback = $('#fallback');
    fallbackMsg = $('#fallback-msg');
    fallbackText = $('#fallback-text');
    if (!countEl || !summaryEl || !statusEl || !sendBtn) return;

    restore();
    update();

    var t = null;
    function changed(e) {
      save();
      if (e.type === 'input' && e.target && (e.target.type === 'text' || e.target.tagName === 'TEXTAREA')) {
        clearTimeout(t); t = setTimeout(update, 400);
      } else { update(); }
    }
    $$('[data-q]').forEach(function (b) {
      b.addEventListener('change', changed);
      b.addEventListener('input', changed);
    });
    sendBtn.addEventListener('click', send);

    // Для проверки со стороны: собрать текст без отправки.
    window.THPProposal = { text: function () { return buildText(collect()); }, collect: collect };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
