/* Demo only: the "Анимация вкл/выкл" switch for comparing the client's site with and without the layer.
 * Not part of the plugin that ships. Switching reloads the page and returns to the same section.
 * "Off" is remembered like the plugin's own ?motion=off (localStorage thp-motion). "On" is kept for this tab only
 * (sessionStorage thp-demo-motion, read by the head snippet): it can override the device's "reduce motion", so
 * it must never outlive the visit; the shipped plugin never stores "on" at all. */
(function () {
  'use strict';
  var KEY = 'thp-motion', DEMO_ON = 'thp-demo-motion', POS = 'thp-demo-pos', NOTE = 'thp-demo-note';
  var root = document.documentElement;
  var on = root.classList.contains('thp-m');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function store(k, v, session) { try { (session ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} }
  function drop(k, session) { try { (session ? sessionStorage : localStorage).removeItem(k); } catch (e) {} }
  function read(k, session) { try { return (session ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } }

  // Remember which block is at the top of the screen, so the reload lands on the same place
  // even though the page height differs with and without the layer.
  function anchor() {
    var blocks = document.querySelectorAll('main > section, main > div > section, footer');
    var best = null;
    for (var i = 0; i < blocks.length; i++) {
      var r = blocks[i].getBoundingClientRect();
      if (r.top <= 80) best = { i: i, off: Math.min(80 - r.top, r.height) / Math.max(r.height, 1) };
    }
    return best ? best.i + ':' + best.off.toFixed(3) : '';
  }
  function restore() {
    var v = read(POS, true); if (!v) return;
    store(POS, '', true);
    var p = v.split(':'), blocks = document.querySelectorAll('main > section, main > div > section, footer');
    var el = blocks[+p[0]]; if (!el) return;
    var go = function () {
      var r = el.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + r.top + r.height * (+p[1]) - 80);
    };
    go();
    document.addEventListener('thp-motion:ready', function () { setTimeout(go, 60); });
    window.addEventListener('load', function () { setTimeout(go, 120); });
  }

  var aside = document.createElement('aside');
  aside.className = 'thp-demo';
  aside.setAttribute('lang', 'ru');
  aside.setAttribute('aria-label', 'Демо-режим');
  aside.innerHTML =
    '<button type="button" class="thp-demo-btn" aria-pressed="' + on + '">' +
      '<span class="thp-demo-lbl">Анимация</span>' +
      '<span class="thp-demo-state" aria-hidden="true">' + (on ? 'вкл' : 'выкл') + '</span>' +
    '</button>';
  document.body.appendChild(aside);

  aside.querySelector('button').addEventListener('click', function () {
    if (on) { store(KEY, 'off'); drop(DEMO_ON, true); }
    else { drop(KEY); store(DEMO_ON, 'on', true); }
    store(POS, anchor(), true);
    location.reload();
  });

  // One-time note: what this page is. Closed by the visitor only, never on a timer; once closed, it stays closed
  // (also in its "reduce motion" wording).
  if (read(NOTE) !== 'closed') {
    var note = document.createElement('div');
    note.className = 'thp-demo-note';
    note.innerHTML = (reduced && !on
      ? '<p>На этом устройстве включено «Уменьшение движения», поэтому анимация выключена. Чтобы посмотреть её, нажми «Анимация» справа.</p>'
      : '<p>Это ваш сайт, в котором ничего не изменено, только добавлен слой анимации. Кнопка «Анимация» справа показывает, как было.</p>') +
      '<button type="button" class="thp-demo-x">Понятно</button>';
    aside.appendChild(note);
    note.querySelector('.thp-demo-x').addEventListener('click', function () {
      store(NOTE, 'closed');
      note.remove();
      aside.querySelector('.thp-demo-btn').focus();
    });
  }

  restore();
})();
