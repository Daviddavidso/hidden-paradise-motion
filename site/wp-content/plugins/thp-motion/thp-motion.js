/* ==== core.js ==== */
/* THP Motion · core
 * An add-on motion layer for thp-theme. It never changes the theme's markup or styles for visitors
 * who get no motion: everything visual is scoped under html.thp-m, which the head snippet sets only when
 * motion is allowed (prefers-reduced-motion, ?motion=off|on, localStorage "thp-motion").
 * Load order: gsap → ScrollTrigger → SplitText → lenis → core.js → modules (each calls THPMotion.register).
 */
(function () {
  'use strict';
  var root = document.documentElement;
  var mq = {
    reduce: matchMedia('(prefers-reduced-motion: reduce)'),
    mobile: matchMedia('(max-width: 720px)'),
    fine: matchMedia('(hover: hover) and (pointer: fine)')
  };

  // Base URL of the plugin folder (…/wp-content/plugins/thp-motion/), taken from this script's own src.
  var me = document.currentScript && document.currentScript.src;
  var base = me ? me.replace(/[^/]*$/, '') : '';

  var queue = [];
  var started = false;

  var M = window.THPMotion = {
    version: '0.1.0',
    base: base,
    mq: mq,
    enabled: root.classList.contains('thp-m'),
    ready: false,
    lenis: null,
    gsap: window.gsap,
    ScrollTrigger: window.ScrollTrigger,
    SplitText: window.SplitText,

    isMobile: function () { return mq.mobile.matches; },
    asset: function (path) { return base + path.replace(/^\//, ''); },
    q: function (sel, ctx) { return (ctx || document).querySelector(sel); },
    qa: function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); },
    log: function () {
      var a = Array.prototype.slice.call(arguments); a.unshift('[thp-motion]');
      console.warn.apply(console, a);
    },

    // cb(true|false) whenever el enters / leaves the viewport (plus margin).
    inView: function (el, cb, margin) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { cb(e.isIntersecting, e); });
      }, { rootMargin: margin || '0px' });
      io.observe(el);
      return function () { io.disconnect(); };
    },

    // Modules: THPMotion.register('name', function (M) { … }). Runs once, only when motion is enabled.
    register: function (name, init) {
      var m = { name: name, init: init };
      queue.push(m);
      if (started) run(m);
    }
  };

  function run(m) {
    if (!M.enabled) return;
    try { m.init(M); }
    catch (err) { M.log('module "' + m.name + '" failed:', err); }
  }

  function setupLenis() {
    // Wheel smoothing on desktop only: touch keeps native scrolling, keys are never intercepted.
    if (!window.Lenis || !mq.fine.matches || mq.mobile.matches) return;
    var nav = document.getElementById('navOverlay');
    if (nav) nav.setAttribute('data-lenis-prevent', '');
    M.qa('[data-chat-log], .thp-chat-dock, #thpChatDock').forEach(function (n) { n.setAttribute('data-lenis-prevent', ''); });

    var lenis = new window.Lenis({ autoRaf: false, smoothWheel: true, syncTouch: false, lerp: 0.11, anchors: false });
    M.lenis = lenis;
    lenis.on('scroll', M.ScrollTrigger.update);
    M.gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    M.gsap.ticker.lagSmoothing(0);

    // The theme locks body scroll while the full-screen menu is open; Lenis must stop with it.
    if (nav && window.MutationObserver) {
      new MutationObserver(function () {
        if (nav.classList.contains('open') && !nav.classList.contains('as-panel')) lenis.stop(); else lenis.start();
      }).observe(nav, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function start() {
    if (started) return;
    started = true;
    if (!M.enabled || !M.gsap || !M.ScrollTrigger) {
      M.enabled = false;
      root.classList.remove('thp-m');
      return;
    }
    M.gsap.registerPlugin(M.ScrollTrigger);
    if (M.SplitText) M.gsap.registerPlugin(M.SplitText);

    try { setupLenis(); } catch (err) { M.log('lenis failed:', err); }

    queue.forEach(run);

    M.ready = true;
    root.classList.add('thp-m-ready');
    document.dispatchEvent(new CustomEvent('thp-motion:ready'));

    // Heights change as images and the serif font arrive; re-measure pinned/scrubbed sections.
    var refresh = function () { M.ScrollTrigger.refresh(); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    window.addEventListener('load', refresh);
    // The theme's lazy images have no width/height and keep arriving after `load` as the visitor scrolls; each
    // one pushes everything below it down (#resort grows by ~340px), which would leave every trigger further down
    // firing early. Re-measure once the page height settles at a new value.
    if (window.ResizeObserver) {
      var lastH = -1, rt = 0;
      new ResizeObserver(function (es) {
        var h = Math.round(es[0].contentRect.height);
        if (h === lastH) return;
        var first = lastH < 0;
        lastH = h;
        if (first) return;
        clearTimeout(rt);
        rt = setTimeout(refresh, 150);
      }).observe(document.body);
    }

    // A visitor who switches "reduce motion" on mid-visit gets the plain site on the next page view;
    // for this one, stop smoothing and freeze every timeline right away.
    mq.reduce.addEventListener && mq.reduce.addEventListener('change', function (e) {
      if (!e.matches) return;
      if (M.lenis) M.lenis.destroy();
      M.gsap.globalTimeline.progress(1).pause();
      document.dispatchEvent(new CustomEvent('thp-motion:stop'));
    });
  }

  // Modules are concatenated after this file, so start once the current task finishes.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
})();

/* ==== reveal.js ==== */
/* THP Motion · reveal — the site comes alive.
 * Everything here happens once, when a block enters the screen, and then the page is still again:
 *  - display headings and band quotes rise line by line out of a mask (SplitText; the original markup is put
 *    back the moment a heading has arrived, so screen readers and copy/paste see the untouched text);
 *  - the big editorial photos (panels, duos, the macaque pair, galleries) open like a curtain from the bottom
 *    while settling from a slight zoom; the small card photos only fade in and settle, so the big ones land;
 *    with a mouse, hovering a photo zooms it in slowly;
 *  - the guest review numbers give a short flick up to their value (screen readers get only the final value);
 *    the facts of #resort keep the theme's own count;
 *  - the rates rows settle one after another, the #resort monogram draws itself;
 *  - the jungle line drawings lean a little with the speed of the scroll and come closer as their section passes;
 *  - inner pages: the hero photo settles from a slight zoom while the title rises.
 * The theme's .reveal fade is switched off (class thp-m-own) only on blocks whose parts this module animates
 * itself; every other .reveal keeps the theme's own fade. Focus landing in content that has not appeared yet
 * shows it at once.
 */
(function () {
  'use strict';
  var T = window.THPMotion;
  if (!T) return;

  T.register('reveal', function (M) {
    var gsap = M.gsap, ST = M.ScrollTrigger, Split = M.SplitText;
    var main = M.q('main');
    if (!main || !gsap || !ST) return;

    var items = [];            // every block this module reveals
    var watch = [];            // blocks waiting for the scroll
    var intro = [];            // blocks that play on load (inner-page heroes)
    var seen = new WeakSet();  // elements already given to some block
    var queue = [], flushCall = null, stopped = false;
    var LINE_FROM = 135;       // % of a line's height: fully under its mask (see .thp-m-ln-mask in reveal.css)
    // Tall photo blocks (panels, duo photos) hide until they open: on a phone, where one fills most of the screen,
    // open them as soon as they come in, instead of leaving the lower third of the screen blank.
    var TALL = function (s) { return M.isMobile() ? 'top 90%' : s; };
    var FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]';

    function kids(el) { return el ? Array.prototype.slice.call(el.children) : []; }
    // Remove what the layer wrote inline. Done by hand as well as through GSAP: after 'thp-motion:stop' the
    // global timeline is paused and GSAP may not render a set() any more.
    function clr(els, css, gs) {
      els.forEach(function (e) { css.forEach(function (p) { e.style.removeProperty(p); }); });
      try { gsap.set(els, { clearProps: gs }); } catch (e) {}
      els.forEach(tidy);
    }
    // Leave no empty style="" behind on elements that had none.
    function tidy(e) { if (e && e.getAttribute && e.getAttribute('style') === '') e.removeAttribute('style'); }
    function skip(el) {
      return !el || !!el.closest('section.hero, .thp-circle, .thp-chat-dock, #navOverlay, .thp-demo, [hidden], dialog, template');
    }
    // The theme hides .reveal until its own observer adds .in; blocks animated here must not wait for that too.
    function own(el) { if (el && el.classList && el.classList.contains('reveal')) el.classList.add('thp-m-own'); }

    /* ——— a block: one paused timeline + the headings split inside it ——— */
    function Block(trig, start, root) {
      var it = { trig: trig, root: root || trig, start: start || 'top 86%', state: 0, lines: [], clean: [], imgs: [],
                 tl: gsap.timeline({ paused: true }), tlDone: false, dc: null, st: null };
      // states: 0 waiting · 1 queued · 2 playing · 3 done
      it.tl.eventCallback('onComplete', function () { it.tlDone = true; settle(it); });
      items.push(it);
      return it;
    }

    // Fade + rise for small companions (eyebrows, ledes, card text, buttons).
    function soft(it, els, at, y, stagger) {
      els = els.filter(function (e) {
        return e && e.nodeType === 1 && !seen.has(e) && !e.matches('form, script, style') && !e.querySelector('form, input, select, textarea');
      });
      if (!els.length) return;
      els.forEach(function (e) { seen.add(e); own(e); });
      // Hidden states are set at once (a child of a paused timeline would only render them when it plays).
      gsap.set(els, { opacity: 0, y: y == null ? 18 : y });
      it.tl.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: stagger == null ? 0.08 : stagger, clearProps: 'opacity,transform' },
        at || 0);
      it.clean.push(function () { clr(els, ['opacity', 'transform', 'translate'], 'opacity,transform'); });
    }

    // A heading or quote rising line by line from a mask. Headings that hold a link are split inside the link
    // (the link element itself stays in place, so focus and listeners survive); anything else interactive
    // inside simply fades up whole.
    function lines(it, el, at) {
      if (!el || seen.has(el) || !el.textContent.trim()) return;
      var tgt = el;
      if (el.querySelector(FOCUSABLE)) {
        var only = el.children.length === 1 ? el.children[0] : null;
        if (only && only.tagName === 'A' && only.textContent.trim() === el.textContent.trim()) tgt = only;
        else { soft(it, [el], at, 30); return; }
      }
      if (!Split) { soft(it, [el], at, 30); return; }
      seen.add(el); own(el);
      var r = { el: tgt, at: at || 0, tw: null, split: null, done: false, dc: null, disp: tgt.style.display };
      if (tgt !== el) tgt.style.display = 'block';   // lines are measured at the heading's own width
      r.split = Split.create(tgt, {
        type: 'lines', mask: 'lines', linesClass: 'thp-m-ln', aria: 'none', autoSplit: true,
        onSplit: function (self) {
          // Re-split (font arrived, width changed): SplitText hands the old tween's time to this new one.
          r.tw = gsap.fromTo(self.lines, { yPercent: LINE_FROM }, {
            yPercent: 0, duration: 1.35, ease: 'expo.out', stagger: 0.11, paused: it.state < 2,
            onComplete: function () { if (r.done) return; r.done = true; requestAnimationFrame(function () { unsplit(r); settle(it); }); }
          });
          return r.tw;
        }
      });
      it.lines.push(r);
    }
    function unsplit(r) {
      if (r.split) { if (r.split.isSplit) r.split.revert(); r.split.kill(); }
      r.el.style.display = r.disp;
      tidy(r.el);
      r.done = true;
    }

    // Curtain: the frame is clipped from the bottom up while the photo inside settles from a slight zoom.
    // frame === img: the photo shares its box with a caption, so it is clipped on itself, and the clip is
    // pulled in on every side by exactly what the zoom adds, so it never grows over its neighbours.
    function curtain(it, frame, img, at) {
      if (!frame) return;
      at = at || 0;
      if (frame === img) {
        var o = { r: 1, z: 1.07 };
        var draw = function () {
          var c = (1 - 1 / o.z) * 50, t = c + (100 - 2 * c) * o.r;
          img.style.setProperty('--thp-m-z', o.z.toFixed(4));
          img.style.clipPath = 'inset(' + t.toFixed(3) + '% ' + c.toFixed(3) + '% ' + c.toFixed(3) + '% ' + c.toFixed(3) + '%)';
        };
        img.classList.add('thp-m-zi');
        it.imgs.push(img);
        draw();
        it.tl.to(o, { r: 0, duration: 1.3, ease: 'power3.out', onUpdate: draw }, at);
        it.tl.to(o, { z: 1, duration: 2.0, ease: 'expo.out', onUpdate: draw }, at);
        it.clean.push(function () { img.classList.remove('thp-m-zi'); img.style.removeProperty('--thp-m-z'); img.style.removeProperty('clip-path'); tidy(img); });
        return;
      }
      // The clip stays at inset(0) until the zoom has settled: frames without overflow:hidden (.duo .shot) rely on it.
      // clip-path only hides the zoomed edges; thp-m-cf also keeps them out of the page's scrollable width
      // (a full-bleed .duo .shot on a phone would otherwise widen the page by ~35px until it is revealed).
      // Only frames that do not clip already: overriding a theme overflow:hidden would change their grid sizing.
      var fcs = getComputedStyle(frame), cf = fcs.overflowX === 'visible' && fcs.overflowY === 'visible';
      if (cf) frame.classList.add('thp-m-cf');
      gsap.set(frame, { clipPath: 'inset(100% 0% 0% 0%)' });
      it.tl.to(frame, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'power3.out' }, at);
      it.clean.push(function () { if (cf) frame.classList.remove('thp-m-cf'); clr([frame], ['clip-path', '-webkit-clip-path'], 'clipPath'); });
      if (img) zoom(it, img, at, 1.07, 2.0);
    }
    // Small photos (cards) only fade in while settling from a slight zoom: no curtain, so the big ones stand out.
    function settleIn(it, frame, img, at) {
      if (!frame) return;
      gsap.set(frame, { opacity: 0 });
      it.tl.to(frame, { opacity: 1, duration: 1.2, ease: 'power3.out' }, at || 0);
      it.clean.push(function () { clr([frame], ['opacity'], 'opacity'); });
      if (img) {
        img.classList.add('thp-m-zi');
        it.imgs.push(img);
        gsap.set(img, { '--thp-m-z': 1.05 });
        it.tl.to(img, { '--thp-m-z': 1, duration: 1.2, ease: 'power3.out' }, at || 0);
        it.clean.push(function () { img.classList.remove('thp-m-zi'); img.style.removeProperty('--thp-m-z'); tidy(img); });
      }
    }
    // `scale` (not transform) so it adds up with the theme's own transforms: hover zoom, breathe, drift.
    function zoom(it, img, at, from, dur) {
      img.classList.add('thp-m-zi');
      it.imgs.push(img);
      gsap.set(img, { '--thp-m-z': from });
      it.tl.to(img, { '--thp-m-z': 1, duration: dur, ease: 'expo.out' }, at || 0);
      it.clean.push(function () { img.classList.remove('thp-m-zi'); img.style.removeProperty('--thp-m-z'); tidy(img); });
    }

    // Count-up: screen readers read the final value from a visually hidden copy; the ticking copy is aria-hidden
    // and holds the final width from the start, so nothing around it moves. When done, the original text returns.
    function count(it, el, at, detach, dur, ease) {
      if (!el || seen.has(el) || el.style.minWidth) return;   // minWidth: the theme's own count already runs on it
      var txt = el.textContent.trim(), m = /^([\d.,]+)(.*)$/.exec(txt);
      if (!m) return;
      var raw = m[1], suf = m[2], dec = (raw.split('.')[1] || '').length, to = parseFloat(raw.replace(/,/g, ''));
      if (!isFinite(to) || to <= 0) return;
      if (detach) {   // the theme observes .fact .n itself: a copy of the node leaves its observer behind
        var c = el.cloneNode(true);
        el.parentNode.replaceChild(c, el);
        el = c;
      }
      seen.add(el);
      var html = el.innerHTML, comma = raw.indexOf(',') > -1, o = { v: 0 }, back = false;
      var sr = document.createElement('span'); sr.className = 'thp-sr'; sr.textContent = txt;
      var tk = document.createElement('span'); tk.className = 'thp-m-tick'; tk.setAttribute('aria-hidden', 'true');
      el.textContent = ''; el.appendChild(sr); el.appendChild(tk);
      var fmt = function (v) { var s = v.toFixed(dec); if (comma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return s + suf; };
      var lock = function () { tk.style.minWidth = ''; tk.textContent = txt; tk.style.minWidth = Math.ceil(tk.getBoundingClientRect().width) + 'px'; };
      lock(); tk.textContent = fmt(0);
      it.tl.to(o, {
        v: to, duration: dur || 2, ease: ease || 'power3.out',
        onStart: function () { lock(); tk.textContent = fmt(o.v); },   // re-measure: the serif font may have arrived since
        onUpdate: function () { tk.textContent = fmt(o.v); }
      }, at || 0);
      it.clean.push(function () { if (back) return; back = true; el.innerHTML = html; });
    }

    /* ——— playing ——— */
    function enqueue(it) {
      if (it.state || stopped) return;
      it.state = 1;
      queue.push(it);
      if (!flushCall) flushCall = gsap.delayedCall(0.03, flush);
    }
    // Blocks that arrive side by side (a row of cards) follow one another from left to right. Rows never wait
    // for each other: a fast scroll must not stack delays. Blocks already scrolled past are simply there.
    function flush() {
      flushCall = null;
      var rows = {};
      queue.splice(0, queue.length).forEach(function (it) {
        if (it.state !== 1) return;
        var r = it.trig.getBoundingClientRect();
        if (r.bottom < 0) { finish(it); return; }
        var k = Math.round(r.top / 80);
        (rows[k] = rows[k] || []).push({ it: it, l: r.left });
      });
      Object.keys(rows).forEach(function (k) {
        rows[k].sort(function (a, b) { return a.l - b.l; }).forEach(function (p, i) { start(p.it, Math.min(i * 0.12, 0.48)); });
      });
    }
    function start(it, delay) {
      it.state = 1;
      it.dc = gsap.delayedCall(delay || 0, function () {
        if (it.state !== 1) return;
        it.state = 2;
        // Photos get their own layer only while they move: the zoom and the clip then cost no repaint.
        it.imgs.forEach(function (img) { img.style.willChange = 'scale'; });
        if (it.tl.duration() === 0) it.tlDone = true; else it.tl.play();
        it.lines.forEach(function (r) {
          r.dc = gsap.delayedCall(r.at, function () { if (r.tw && !r.done) r.tw.play(); });
        });
        settle(it);
      });
    }
    function settle(it) {
      if (it.state === 3 || it.state < 2 || !it.tlDone) return;
      for (var i = 0; i < it.lines.length; i++) if (!it.lines[i].done) return;
      it.state = 3;
      if (it.st) { it.st.kill(); it.st = null; }
      it.clean.forEach(function (f) { f(); });
      it.imgs.forEach(function (img) { img.style.removeProperty('will-change'); tidy(img); });
    }
    // Straight to the final state: focus arrived, the block was scrolled past unseen, or motion was stopped.
    function finish(it) {
      if (it.state === 3) return;
      it.state = 3;
      if (it.dc) it.dc.kill();
      if (it.st) { it.st.kill(); it.st = null; }
      it.tl.progress(1, false);
      it.tl.kill();
      it.lines.forEach(function (r) {
        if (r.dc) r.dc.kill();
        if (r.tw) r.tw.progress(1, true);
        unsplit(r);
      });
      it.clean.forEach(function (f) { f(); });
      it.imgs.forEach(function (img) { img.style.removeProperty('will-change'); tidy(img); });
    }
    function arm(it) {
      if (it.state) return;
      it.st = ST.create({
        trigger: it.trig, start: it.start, end: 'bottom top',
        onEnter: function () { enqueue(it); },
        onEnterBack: function () { enqueue(it); },
        onLeave: function () { if (it.state < 2) finish(it); }   // jumped past (anchor, End key): just be there
      });
    }

    /* ——— the blocks ——— */

    // A group: eyebrow first, then the heading line by line, then whatever follows it.
    function group(box, start, at0) {
      if (skip(box) || seen.has(box)) return null;
      var h = M.q('h1.display, h2.display, h3.display, blockquote', box);
      if (!h) return null;
      var it = Block(box, start);
      own(box); seen.add(box);
      var before = [], after = [];
      var pool = kids(box);
      if (h.parentElement !== box) pool = pool.concat(kids(h.parentElement));
      pool.forEach(function (k) {
        if (k === h || k.contains(h) || before.indexOf(k) > -1 || after.indexOf(k) > -1) return;
        (k.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING ? before : after).push(k);
      });
      at0 = at0 || 0;
      soft(it, before, at0, 12);
      lines(it, h, at0 + 0.08);
      soft(it, after, at0 + 0.4, 18, 0.1);
      it.box = box; it.h = h; it.late = at0 + 0.5;
      watch.push(it);
      return it;
    }
    // Other modules may add a line of their own under a heading while they start (sunset in #taste): it joins
    // the heading's entrance instead of standing there before the heading has appeared.
    function adopt(it) {
      if (!it.box || it.state) return;
      soft(it, kids(it.box).filter(function (k) {
        return !seen.has(k) && !k.contains(it.h) && (it.h.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING);
      }), it.late, 18, 0.1);
    }

    // 1. Inner-page heroes: the photo settles from a slight zoom, the title rises, the rest follows.
    M.qa('.page-hero, .oia-hero', main).forEach(function (hero) {
      if (skip(hero)) return;
      var it = Block(hero, null, hero);
      seen.add(hero);
      var img = M.q('.hero-media img', hero) || M.q(':scope > img, :scope > picture > img', hero);
      if (img) { zoom(it, img, 0, 1.1, 2.8); it.heroImg = img; }
      var body = M.q('.hero-inner, .hero-body', hero);
      var h1 = body && M.q('h1', body);
      if (body) {
        var before = [], after = [];
        kids(body).forEach(function (k) {
          if (h1 && (k === h1 || k.contains(h1))) return;
          (h1 && (k.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING) ? before : after).push(k);
        });
        soft(it, before, 0.3, 12);
        if (h1) lines(it, h1, 0.15);
        soft(it, after, 0.65, 16, 0.1);
      }
      intro.push(it);
    });

    // 2. Section heads.
    M.qa('.head', main).forEach(function (head) { group(head, 'top 86%'); });

    // 3. Full-width photo bands: the title or quote rises; the photo settles from a slight zoom
    //    (not in #pool: the water layer owns that photo). The guests photo settles the same way.
    M.qa('.band, section.guests', main).forEach(function (band) {
      if (skip(band)) return;
      var inner = M.q(':scope > .inner', band);
      var it = inner ? group(inner, 'top 78%') : null;
      if (band.id === 'pool') return;
      var img = M.q(':scope > img, :scope > picture > img', band);
      if (!img) return;
      if (!it) { it = Block(band, 'top 70%'); watch.push(it); }
      zoom(it, img, 0, 1.12, 2.8);
    });

    // 4. Duo (photo beside text).
    M.qa('.duo', main).forEach(function (duo) {
      if (skip(duo)) return;
      var shot = M.q(':scope > .shot', duo), img = shot && M.q('img', shot);
      if (shot && img && !seen.has(shot)) {
        var it = Block(shot, TALL('top 70%')); seen.add(shot); own(shot);
        curtain(it, shot, img, 0);
        watch.push(it);
      }
      var copy = M.q(':scope > .copy', duo);
      if (copy) group(copy, 'top 80%');
    });

    // 5. Split panels: the whole panel opens (photo, shade and words together), then the words rise.
    M.qa('.panel', main).forEach(function (p) {
      if (skip(p) || seen.has(p)) return;
      var img = M.q(':scope > img, :scope > picture > img', p);
      var it = Block(p, TALL('top 70%'));
      own(p); seen.add(p);
      curtain(it, p, img, 0);
      var body = M.q('.panel-body', p);
      if (body) {
        var h = M.q('h2.display, h3.display', body);
        if (h) lines(it, h, 0.5);
        soft(it, kids(body).filter(function (k) { return k !== h; }), 0.75, 16, 0.1);
      }
      watch.push(it);
    });

    // 6. Cards: the photo fades in and settles, then title, meta and text follow.
    M.qa('.card, .bed', main).forEach(function (c) {
      if (skip(c) || seen.has(c)) return;
      var shot = M.q('.shot', c), img = shot && M.q('img', shot);
      var it = Block(c, 'top 88%');
      own(c); seen.add(c);
      if (shot && img) settleIn(it, shot, img, 0);
      soft(it, kids(c).filter(function (k) { return !shot || (k !== shot && !k.contains(shot)); }), shot ? 0.35 : 0, 16, 0.07);
      watch.push(it);
    });

    // 7. Photo pairs (the macaques in #resort).
    M.qa('.thp-duo-shots', main).forEach(function (box) {
      if (skip(box) || seen.has(box)) return;
      var it = Block(box, TALL('top 72%'));
      own(box); seen.add(box);
      M.qa('figure', box).forEach(function (f, i) { curtain(it, f, M.q('img', f), i * 0.16); });
      watch.push(it);
    });

    // 8. Galleries. Rails and carousels: only the photos on screen open, the rest are simply there.
    //    Grids: every photo opens on its own as it arrives.
    M.qa('.rail, .thp-room-gal', main).forEach(function (rail) {
      if (skip(rail) || seen.has(rail)) return;
      seen.add(rail);
      var wrap = rail.closest('.reveal');
      if (wrap) own(wrap);
      var it = Block(rail, 'top 80%'), n = 0, rr = rail.getBoundingClientRect();
      kids(rail).forEach(function (f) {
        var img = f.tagName === 'IMG' ? f : M.q('img', f);
        if (!img) return;
        var fr = f.getBoundingClientRect();
        if (fr.width && (fr.right <= rr.left + 2 || fr.left >= rr.right - 2)) return;
        var cs = getComputedStyle(f);
        var clips = cs.overflow === 'hidden' || cs.overflow === 'clip' || f === img;
        var tight = clips && f.getBoundingClientRect().height - img.getBoundingClientRect().height < 2;
        curtain(it, tight ? f : img, img, n * 0.12);
        n++;
      });
      if (n) watch.push(it); else items.splice(items.indexOf(it), 1);
    });
    M.qa('.room-gallery .g-shot', main).forEach(function (g) {
      if (skip(g) || seen.has(g)) return;
      var img = M.q('img', g);
      if (!img) return;
      var it = Block(g, 'top 90%');
      seen.add(g);
      curtain(it, g, img, 0);
      watch.push(it);
    });

    // 9. Figures. The facts of #resort rise softly; their numbers keep the theme's own count (it runs on the
    //    plain site too). The guest review numbers give a short flick up to their value.
    M.qa('.facts', main).forEach(function (box) {
      if (skip(box) || seen.has(box)) return;
      var it = Block(box, 'top 88%');
      own(box); seen.add(box);
      soft(it, M.qa('.fact', box), 0, 20, 0.1);
      watch.push(it);
    });
    M.qa('.thp-rev-stats', main).forEach(function (ul) {
      if (skip(ul) || seen.has(ul)) return;
      var it = Block(ul, 'top 90%');
      own(ul); seen.add(ul);
      var li = kids(ul);
      li.forEach(function (x, i) { var b = M.q('b', x); if (b) count(it, b, 0.05 + i * 0.1, false, 1.1, 'expo.out'); });
      soft(it, li, 0, 16, 0.1);
      watch.push(it);
    });

    // 10. Rates: rows settle one after another, 0.6 s in all. Only opacity and transform: rows never re-flow.
    M.qa('.thp-rates, .rates', main).forEach(function (box) {
      if (skip(box) || seen.has(box)) return;
      var rows = box.classList.contains('thp-rates') ? M.qa(':scope > .thp-rate', box) : M.qa('tr', box);
      if (!rows.length) return;
      var it = Block(box, 'top 86%');
      own(box); seen.add(box);
      var each = Math.min(0.035, 0.18 / Math.max(rows.length - 1, 1));
      gsap.set(rows, { opacity: 0, y: 14 });
      it.tl.to(rows, { opacity: 1, y: 0, duration: 0.42, ease: 'power2.out', stagger: each, clearProps: 'opacity,transform' }, 0);
      it.clean.push(function () { clr(rows, ['opacity', 'transform', 'translate'], 'opacity,transform'); });
      watch.push(it);
    });

    // 11. The monogram draws itself: the ring from the top, then the stem, then the two leaves.
    M.qa('svg.monogram', main).forEach(function (svg) {
      if (skip(svg) || seen.has(svg)) return;
      var shapes = M.qa('circle, ellipse, path, line, polyline', svg).filter(function (s) {
        try { return s.getTotalLength() > 0; } catch (e) { return false; }
      });
      if (!shapes.length) return;
      var it = Block(svg, 'top 88%');
      seen.add(svg);
      shapes.forEach(function (s, i) {
        var L = Math.ceil(s.getTotalLength()) + 2;
        if (s.tagName === 'circle' || s.tagName === 'ellipse') { s.style.transformBox = 'fill-box'; s.style.transformOrigin = '50% 50%'; s.style.rotate = '-90deg'; }
        gsap.set(s, { strokeDasharray: L + ' ' + (L + 2), strokeDashoffset: L });
        it.tl.to(s, { strokeDashoffset: 0, duration: i ? 1.1 : 1.9, ease: 'power2.inOut' }, i ? 0.5 + i * 0.2 : 0);
      });
      gsap.set(svg, { opacity: 0 });
      it.tl.to(svg, { opacity: 1, duration: 0.5, ease: 'none' }, 0);
      it.clean.push(function () {
        clr(shapes, ['stroke-dasharray', 'stroke-dashoffset', 'transform-box', 'transform-origin', 'rotate'], 'strokeDasharray,strokeDashoffset');
        clr([svg], ['opacity'], 'opacity');
      });
      watch.push(it);
    });

    // 12. Every other display heading and band quote (inside a theme .reveal block: that block is taken over).
    M.qa('h1.display, h2.display, .panel h3.display, .band blockquote', main).forEach(function (h) {
      if (skip(h) || seen.has(h)) return;
      var box = h.closest('.reveal');
      if (box && box !== h && !seen.has(box)) { group(box, 'top 86%'); return; }
      if (box && box !== h) return;
      var it = Block(h, 'top 88%');
      var eb = h.previousElementSibling;
      if (eb && eb.classList.contains('eyebrow') && !eb.classList.contains('reveal')) soft(it, [eb], 0, 12);
      lines(it, h, eb ? 0.08 : 0);
      watch.push(it);
    });

    /* ——— focus, stop ——— */
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      items.forEach(function (it) { if (it.state < 3 && it.root && it.root.contains(t)) finish(it); });
      // The theme's own .reveal blocks too: shown at once, without their one-second fade.
      var r = t.closest('.reveal:not(.in)');
      if (r) r.classList.add('in', 'thp-m-own');
    }, true);

    var jungle = setupJungle();

    document.addEventListener('thp-motion:stop', function () {
      stopped = true;
      items.forEach(finish);
      if (jungle) jungle.stop();
    });

    // Scroll positions are measured once every module has changed the page (the hero adds its own track).
    function go() {
      if (stopped) return;
      watch.forEach(adopt);
      watch.forEach(arm);
      // Arriving through a page transition, the hero photo is already on screen (it is growing out of the card
      // that was clicked): the title rises together with it instead of after it.
      var vt = transitionRunning();
      intro.forEach(function (it) {
        if (vt) { it.lines.forEach(function (r) { r.at = 0; }); start(it, 0); }
        else whenPainted(it.heroImg, function () { start(it, 0.05); });
      });
      if (jungle) jungle.start();
    }
    if (M.ready) go(); else document.addEventListener('thp-motion:ready', go, { once: true });

    // Is a cross-document view transition playing right now? (pagereveal has fired before this script ran.)
    function transitionRunning() {
      try {
        return document.getAnimations().some(function (a) {
          var e = a.effect;
          return !!(e && e.pseudoElement && e.pseudoElement.indexOf('::view-transition') === 0);
        });
      } catch (e) { return false; }
    }

    // The hero intro waits for its photo to be decoded (at most 1.2 s), so the settle plays smoothly instead of
    // being swallowed by the frames in which the browser is still decoding a large image.
    function whenPainted(img, cb) {
      var done = false, go1 = function () { if (!done) { done = true; cb(); } };
      setTimeout(go1, 1200);
      if (!img) return go1();
      var dec = function () { if (img.decode) img.decode().then(go1, go1); else go1(); };
      if (img.complete) dec(); else { img.addEventListener('load', dec, { once: true }); img.addEventListener('error', go1, { once: true }); }
    }

    /* ——— the jungle drawings: lean with the speed of the scroll, come closer as their section passes ——— */
    function setupJungle() {
      if (M.isMobile() || !M.mq.fine.matches || !window.getComputedStyle) return null;
      var hosts = [];
      M.qa('main section, footer').forEach(function (h) {
        var cs = getComputedStyle(h);
        if (cs.overflowX !== 'hidden' && cs.overflowX !== 'clip') return;   // a moving drawing must stay inside its section
        var hit = false;
        ['before', 'after'].forEach(function (p) {
          var ps = getComputedStyle(h, '::' + p);
          var mask = ps.webkitMaskImage || ps.maskImage || '';
          if (ps.display === 'none' || ps.content === 'none' || ps.content === 'normal' || mask.indexOf('url(') < 0) return;
          if (parseFloat(ps.width) > h.clientWidth * 0.7) return;           // full-width bands stay put
          var grounded = parseFloat(ps.top) > h.clientHeight * 0.35;        // grows from the bottom edge: pivot there
          h.classList.add('thp-m-j' + p.charAt(0) + (grounded ? 'g' : ''));
          hit = true;
        });
        M.qa(':scope > .thp-jg', h).forEach(function (j) { j.classList.add('thp-m-jx'); hit = true; });
        if (hit) hosts.push({ h: h, st: null });
      });
      if (!hosts.length) return null;
      var wind = { v: 0 }, sts = [], lean = null, calm = null;
      var paint = function () {
        var v = wind.v.toFixed(3);
        hosts.forEach(function (o) { if (o.st && o.st.isActive) o.h.style.setProperty('--thp-m-wind', v); });
      };
      return {
        start: function () {
          hosts.forEach(function (o) {
            o.st = ST.create({
              trigger: o.h, start: 'top bottom', end: 'bottom top',
              onUpdate: function (s) { o.h.style.setProperty('--thp-m-jd', s.progress.toFixed(3)); },
              onToggle: function () { o.h.style.setProperty('--thp-m-wind', wind.v.toFixed(3)); }
            });
            sts.push(o.st);
          });
          lean = gsap.quickTo(wind, 'v', { duration: 1.6, ease: 'power2.out', onUpdate: paint });
          calm = gsap.delayedCall(0.18, function () { lean(0); }).pause();
          sts.push(ST.create({
            start: 0, end: 'max',
            onUpdate: function (s) { lean(gsap.utils.clamp(-1, 1, s.getVelocity() / 3000)); calm.restart(true); }
          }));
        },
        stop: function () {
          sts.forEach(function (s) { s.kill(); });
          if (calm) calm.kill();
          hosts.forEach(function (o) {
            o.h.style.removeProperty('--thp-m-wind'); o.h.style.removeProperty('--thp-m-jd');
            o.h.classList.remove('thp-m-jb', 'thp-m-jbg', 'thp-m-ja', 'thp-m-jag');
          });
        }
      };
    }
  });
})();

/* ==== hero.js ==== */
/* THP Motion · hero — "Through the window" (home page only).
 * Desktop: the hero sits sticky inside a taller track. Scrolling walks the camera into the living room's opening:
 * the room photo zooms toward the clear part of the window, while a second photo (golden hour over the pool and
 * the gorge) appears INSIDE the opening — masked by the real outline of the window, behind the steel column, the
 * post, the ceiling beams and the chair — and grows until it fills the screen. The walk goes from the shade of
 * the room into the light: the swap happens within the first flick of the wheel under a short warm lift (the
 * eyes adjusting to the brightness outside), the valley is framed on its sunlit top, and the low sun warms the
 * arrival.
 * On load (≤ 3 s, then still): the room settles from a slight zoom while the headline rises line by line and the
 * rest follows. Any wheel, key, touch or focus finishes the entrance at once, so the scroll owns the frame.
 * Phones: the image strip walks up to the window by itself once (3.2 s, then still), so the valley is already
 * inside the opening; the scroll then finishes the walk as the strip leaves the screen.
 * Text never fades out: over the photos a fixed, screen-locked scrim (it never animates) keeps the eyebrow,
 * headline, tagline and buttons readable on every frame.
 */
(function () {
  'use strict';
  if (!window.THPMotion) return;

  THPMotion.register('hero', function (M) {
    var hero = M.q('main section.hero');
    if (!hero) return;
    var media = M.q('.hero-media', hero);
    var room = media && M.q('img', media);
    var inner = M.q('.hero-inner', hero);
    if (!media || !room || !hero.parentNode) return;

    // The geometry below is measured on this exact photo. If the hero image is ever replaced, do nothing.
    var srcOf = function () { return room.currentSrc || room.src || ''; };
    if (!/img-hero-living-w(-m)?\.jpg/.test(srcOf())) return;

    var gsap = M.gsap, ST = M.ScrollTrigger;
    var root = document.documentElement;

    /* ── geometry of the opening, in pixels of img-hero-living-w.jpg (1600×821) ───────────────────────────
       The phone crop img-hero-living-w-m.jpg (1170×780) is the same frame: x 184…1415.6 of the desktop photo,
       scaled by 0.95 (fitted by image difference, mean error 3.6/255). */
    var PHOTO = {
      d: { w: 1600, h: 821, x0: 0, k: 1, s0: 1.04 },     // drift starts at scale(1.04)
      m: { w: 1170, h: 780, x0: 184, k: 0.95, s0: 1.02 } // breathe starts at scale(1.02)
    };
    // The opening: ceiling line on top, the two walls, down to the trimmed hedge (feathered, see mask).
    var OPEN = [[288, 142], [380, 139], [460, 138], [620, 137], [800, 136], [1000, 135.5], [1180, 135.5],
      [1300, 138], [1379, 140], [1375, 420], [290, 420]];
    // Things in front of the view that must stay in front of the valley.
    var HOLES = [
      [[1196, 120], [1222, 120], [1219, 430], [1193, 430]],                                   // steel column
      [[570, 277], [593, 277], [592, 300], [587, 350], [582, 400], [582, 432], [556, 432],
        [558, 400], [563, 350], [569, 300]],                                                  // wooden post
      [[406, 128], [433, 128], [426, 152], [412, 152]],                                       // left ceiling beam
      [[1092, 128], [1114, 128], [1107, 149], [1095, 149]],                                   // right ceiling beam
      [[1121, 365], [1207, 366], [1244, 378], [1244, 432], [1119, 432]]                       // chair back
    ];
    var WIN = { x0: 288, y0: 135, x1: 1379, y1: 400 };   // bounding box of the opening
    var CLEAR = { x0: 598, y0: 139, x1: 1192, y1: 364 }; // widest part with nothing in front: post → column

    function pathOf(pts) {
      return 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join('L') + 'Z';
    }
    function maskURL(kind) {
      var P = PHOTO[kind];
      var vb = kind === 'd' ? '0 0 1600 821' : '184 0 ' + (P.w / P.k).toFixed(2) + ' ' + (P.h / P.k).toFixed(2);
      // The holes are softened by a sub-pixel blur: at 2–4× zoom a hard polygon edge shows as a pale halo.
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + P.w + '" height="' + P.h + '" viewBox="' + vb + '">' +
        '<defs><linearGradient id="f" gradientUnits="userSpaceOnUse" x1="0" y1="376" x2="0" y2="392" ' +
        'gradientTransform="rotate(.42 832 384)"><stop offset="0" stop-color="#fff"/>' +
        '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
        '<filter id="b"><feGaussianBlur stdDeviation=".8"/></filter>' +
        '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="821">' +
        '<rect width="1600" height="821" fill="#fff"/><path fill="#000" filter="url(#b)" d="' + HOLES.map(pathOf).join('') + '"/></mask></defs>' +
        '<path fill="url(#f)" mask="url(#m)" d="' + pathOf(OPEN) + '"/></svg>';
      return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    }

    /* ── DOM: everything the layer adds lives inside .hero-media, under the theme's own scrim ────────────── */
    var VALLEY_SRC = M.asset('../../themes/thp-theme/assets/img/img-01-px-c.jpg');

    function layer(cls, tag) {
      var el = document.createElement(tag || 'div');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      media.appendChild(el);
      return el;
    }
    // The valley, masked to the opening.
    var view = layer('thp-m-hero-view');
    var valley = document.createElement('img');
    valley.className = 'thp-m-hero-valley';
    valley.alt = '';
    valley.setAttribute('aria-hidden', 'true');
    valley.decoding = 'async';
    view.appendChild(valley);
    // A short warm lift inside the opening while the room gives way to the valley (the eyes adjusting to the
    // light outside); it hides the moment both photos overlap.
    var glare = layer('thp-m-hero-glare');
    // The low sun warming the arrival (soft-light, screen-locked).
    var sun = layer('thp-m-hero-sun');
    // Screen-locked scrim behind the text block. Static: it never animates, it is sized to the text on resize.
    var scrim = layer('thp-m-hero-scrim');

    // Desktop track: the hero sticks while the visitor walks through the window (no pin, no scroll hijack).
    var track = document.createElement('div');
    track.className = 'thp-m-hero-track';
    hero.parentNode.insertBefore(track, hero);
    track.appendChild(hero);
    var booking = track.nextElementSibling && track.nextElementSibling.classList.contains('booking-wrap') ?
      track.nextElementSibling : null;
    root.classList.add('thp-m-hero-on');

    var loaded = false, fade = { v: 0 };
    function onValley() {
      if (loaded) return;
      loaded = true;
      var go = function () {
        gsap.to(fade, { v: 1, duration: cur > 0.01 ? 0.9 : 0.01, ease: 'power2.out', onUpdate: function () { render(cur); } });
        valleyReady();
      };
      if (valley.decode) valley.decode().then(go, go); else go();
    }
    valley.addEventListener('load', onValley);
    valley.addEventListener('error', function () { view.style.display = 'none'; glare.style.display = 'none'; valleyReady(); });

    function loadValley() {
      if (valley.getAttribute('src')) return;
      valley.setAttribute('fetchpriority', 'low');
      valley.src = VALLEY_SRC;
      if (valley.complete && valley.naturalWidth) onValley();
    }

    /* ── measurement (on refresh / resize only; the scroll path does no layout reads) ─────────────────────── */
    var G = null;
    function measure() {
      var mobile = M.isMobile();
      var P = PHOTO[/-m\.jpg/.test(srcOf()) ? 'm' : 'd'];
      if (mobile !== (P === PHOTO.m)) P = mobile ? PHOTO.m : PHOTO.d; // currentSrc may lag a resize by a moment
      var W = media.clientWidth, H = media.clientHeight;
      if (!W || !H) return null;
      var c = Math.max(W / P.w, H / P.h);
      var ox = (W - P.w * c) / 2, oy = (H - P.h * c) / 2;
      var L = function (x, y) { return [ox + (x - P.x0) * P.k * c, oy + y * P.k * c]; };
      var r0 = L(CLEAR.x0, CLEAR.y0), r1 = L(CLEAR.x1, CLEAR.y1);
      var w0 = L(WIN.x0, WIN.y0), w1 = L(WIN.x1, WIN.y1);
      var s0 = P.s0;
      // End scale: the clear part of the opening covers the whole frame, with a little room to spare.
      var s1 = 1.04 * Math.max(H / (r1[1] - r0[1]), W / (r1[0] - r0[0]));
      G = {
        mobile: mobile, W: W, H: H, cx: W / 2, cy: H / 2,
        R: [(r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2], win: [w0[0], w0[1], w1[0], w1[1]],
        s0: s0, s1: s1,
        mask: P === PHOTO.m ? 'm' : 'd'
      };
      if (view.getAttribute('data-mask') !== G.mask) {
        var u = maskURL(G.mask);
        [view, glare].forEach(function (el) { el.style.webkitMaskImage = u; el.style.maskImage = u; });
        view.setAttribute('data-mask', G.mask);
      }
      if (!mobile && inner) sizeScrim();
      if (booking) {
        var peek = -parseFloat(getComputedStyle(booking).marginTop) || 0;
        root.style.setProperty('--thp-m-bk-dock', Math.round(peek - booking.offsetHeight) + 'px');
      }
      return G;
    }
    // The scrim hugs the text block: an ellipse around the union of the eyebrow, headline, tagline and buttons
    // (layout boxes, so the entrance's offsets and the headline's drift do not change it).
    function sizeScrim() {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      M.qa(':scope > *', inner).forEach(function (el) {
        if (!el.offsetWidth || !el.offsetHeight) return;
        var x = el.offsetLeft, y = el.offsetTop;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + el.offsetWidth); y1 = Math.max(y1, y + el.offsetHeight);
      });
      if (x1 < x0) return;
      // Centred a little above the block: the small eyebrow on top needs more than the large buttons below,
      // which also sit on the theme's own darker lower edge.
      var w = (x1 - x0) / 2, h = (y1 - y0) / 2;
      scrim.style.background = 'radial-gradient(' + Math.round(w * 1.3 + 40) + 'px ' + Math.round(h * 1.42 + 40) + 'px at ' +
        Math.round(x0 + w) + 'px ' + Math.round(y0 + h * 0.9) + 'px,var(--thp-m-scrim))';
    }

    /* ── one frame ─────────────────────────────────────────────────────────────────────────────────────── */
    // Mostly linear with soft ends: the first notch of the wheel already pushes into the room (~10 %),
    // the arrival still lands softly.
    function ease(x) { return 0.55 * x + 0.45 * (0.5 - 0.5 * Math.cos(Math.PI * x)); }
    var cur = 0, target = 0;
    var boot = { v: 1 };        // load entrance: the room settles from a slight zoom (1 = settled)
    var BOOT_Z = 0.08;
    function smooth(a, b, x) { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); }
    function f(n) { return Math.round(n * 1000) / 1000; }

    function render(p) {
      if (!G && !measure()) return;
      var g = ease(p);
      var k0 = G.mobile ? 1 : 1 + BOOT_Z * (1 - boot.v);
      var s = G.s0 * Math.pow(G.s1 / G.s0, g);
      // The clear part of the window starts where the theme puts it and ends centred in the frame.
      var R0x = G.cx + G.s0 * (G.R[0] - G.cx), R0y = G.cy + G.s0 * (G.R[1] - G.cy);
      var ax = R0x + (G.cx - R0x) * g, ay = R0y + (G.cy - R0y) * g;
      var tx = ax - G.cx - s * (G.R[0] - G.cx), ty = ay - G.cy - s * (G.R[1] - G.cy);
      // The entrance zoom is a plain zoom about the centre on top of the walk (continuous with it at p = 0).
      tx *= k0; ty *= k0; s *= k0;
      var T = 'translate3d(' + f(tx) + 'px,' + f(ty) + 'px,0) scale(' + s.toFixed(5) + ')';
      room.style.transform = p === 0 ? 'scale(' + (G.s0 * k0).toFixed(5) + ')' : T;
      view.style.transform = T;
      glare.style.transform = T;

      // The valley is far away: it drifts with a third of the room's travel (depth), and over the arrival it
      // rises into place and keeps gliding closer instead of parking.
      var lift = smooth(0.6, 1, p);
      var k = 0.3, vx = k * (R0x - G.cx) * (1 - g), vy = k * (R0y - G.cy) * (1 - g) + 0.05 * G.H * (1 - lift);
      var v = (0.95 + 0.05 * g) * (1 + 0.04 * lift);
      // Never let an edge of the valley (its element box: the whole frame) show inside the opening.
      var wl = Math.max(0, G.cx + tx + s * (G.win[0] - G.cx)), wr = Math.min(G.W, G.cx + tx + s * (G.win[2] - G.cx));
      var wt = Math.max(0, G.cy + ty + s * (G.win[1] - G.cy)), wb = Math.min(G.H, G.cy + ty + s * (G.win[3] - G.cy));
      v = Math.max(v, (G.cx + vx - wl) / (G.W / 2), (wr - G.cx - vx) / (G.W / 2),
        (G.cy + vy - wt) / (G.H / 2), (wb - G.cy - vy) / (G.H / 2));
      // Inside the zoomed layer: undo the room's transform, then apply the valley's own.
      var b = v / s, bx = (vx - tx) / s, by = (vy - ty) / s;
      valley.style.transform = 'translate3d(' + f(bx) + 'px,' + f(by) + 'px,0) scale(' + b.toFixed(6) + ')';

      // The room gives way to the valley within the first flick of the wheel, under a short warm lift.
      var o = smooth(0.04, G.mobile ? 0.16 : 0.12, p) * fade.v;
      view.style.opacity = f(o);
      glare.style.opacity = f(0.3 * smooth(0.03, 0.08, p) * (1 - smooth(0.08, 0.14, p)) * fade.v);
      sun.style.opacity = f(smooth(0.5, 1, p) * fade.v);
      if (inner) inner.style.transform = g && !G.mobile ? 'translate3d(0,' + f(-14 * g) + 'px,0)' : '';
    }

    /* ── scroll → progress, with a light, frame-rate independent follow ───────────────────────────────── */
    var ticking = false, lastT = 0, idle = null;
    function tick(time) {
      var dt = Math.min(0.1, Math.max(0.001, time - lastT)); lastT = time;
      var d = target - cur;
      if (Math.abs(d) < 0.0004) { cur = target; render(cur); sleep(); return; }
      cur += d * (1 - Math.exp(-dt / 0.11));
      render(cur);
    }
    function wake() {
      if (ticking) return;
      ticking = true; lastT = gsap.ticker.time;
      hero.classList.add('thp-m-hero-live');
      clearTimeout(idle);
      gsap.ticker.add(tick);
    }
    function sleep() {
      if (!ticking) return;
      ticking = false;
      gsap.ticker.remove(tick);
      rest();
    }
    // Drop the layer hints once still, so the browser re-rasterises the resting frame at full sharpness.
    function rest() {
      clearTimeout(idle);
      idle = setTimeout(function () { if (!ticking && !moving()) hero.classList.remove('thp-m-hero-live'); }, 300);
    }
    function setTarget(p, jump) {
      target = p;
      // A jump (anchor link, Home/End key) snaps; continuous scrolling is followed softly.
      if (jump || Math.abs(target - cur) > 0.4) { cur = p; render(p); return; }
      if (target !== cur) wake();
    }

    /* ── phones: one walk up to the window by itself, then the scroll takes over ─────────────────────── */
    var PH_AUTO = 0.55;
    var auto = { v: 0 }, autoTw = null;
    var st = null;
    function phoneP(sp) { var a = PH_AUTO * auto.v; return a + (1 - a) * sp; }
    function autoWalk() {
      if (autoTw || auto.v >= 1 || !G || !G.mobile || !st) return;
      // Only when the strip is on screen; a visitor who arrives further down just finds the frame there.
      if (window.scrollY > media.offsetHeight * 0.5) { auto.v = 1; setTarget(phoneP(st.progress), true); return; }
      hero.classList.add('thp-m-hero-live');
      autoTw = gsap.to(auto, {
        v: 1, duration: 3.2, ease: 'power2.inOut',
        onUpdate: function () { if (st) setTarget(phoneP(st.progress)); },
        onComplete: function () { autoTw = null; rest(); }
      });
    }

    // Three layouts: 'walk' = sticky hero in the track (desktop, at least 600px tall, the theme's hero minimum);
    // 'short' = desktop layout in a window shorter than the hero (landscape phones): no sticky, the zoom plays
    // while the hero scrolls away; 'phone' = the theme's image strip (≤720px), same, after its own short walk.
    function makeTrigger(mode) {
      var free = mode !== 'walk', phone = mode === 'phone';
      var map = phone ? phoneP : function (x) { return x; };
      measure();
      st = ST.create(free ? {
        trigger: media, start: 'top top',
        end: function () { return '+=' + Math.max(1, Math.round(media.offsetHeight * 0.8)); },
        onUpdate: function (s) { setTarget(map(s.progress)); },
        onRefresh: function (s) { measure(); setTarget(map(s.progress), true); }
      } : {
        trigger: track, start: 'top top',
        end: function () { return '+=' + Math.max(1, track.offsetHeight - hero.offsetHeight); },
        onUpdate: function (s) { setTarget(s.progress); },
        onRefresh: function (s) { measure(); setTarget(s.progress, true); }
      });
      setTarget(map(st.progress), true);
      if (phone && entranceReady) whenBoth(autoWalk);
      return function () {
        if (st) st.kill();
        st = null; sleep();
        if (autoTw) { autoTw.progress(1); autoTw = null; }
        G = null;
      };
    }

    /* ── the entrance on load ────────────────────────────────────────────────────────────────────────── */
    var intro = null, split = null, lineTw = null, bootTw = null, entranceReady = false, started = false;
    var eyebrow = inner && M.q(':scope > .eyebrow', inner);
    var h1 = inner && M.q(':scope > h1', inner);
    var tagline = inner && M.q(':scope > .tagline', inner);
    var ctas = inner && M.q(':scope > .hero-ctas', inner);
    var soft = [eyebrow, tagline, ctas].filter(Boolean);
    // Nothing plays for a visitor who arrives further down (reload mid-page, #book in the address).
    var atTop = window.scrollY < 40 && !/^#./.test(location.hash);

    function moving() { return !!((bootTw && bootTw.isActive()) || (autoTw && autoTw.isActive())); }
    function unsplit() {
      if (split) { if (split.isSplit) split.revert(); split.kill(); split = null; }
      if (h1 && h1.getAttribute('style') === '') h1.removeAttribute('style');
    }
    function clearSoft() {
      soft.forEach(function (el) { el.style.removeProperty('opacity'); el.style.removeProperty('transform'); el.style.removeProperty('translate'); if (el.getAttribute('style') === '') el.removeAttribute('style'); });
    }
    // Finish the entrance: at once (focus, keys, stop) or within a moment (the wheel or a finger took over).
    function finishIntro(now) {
      off();
      if (bootTw) {
        if (now) { bootTw.progress(1); }
        else { bootTw.kill(); bootTw = gsap.to(boot, { v: 1, duration: 0.35, ease: 'power2.out', onUpdate: bootFrame, onComplete: function () { bootTw = null; rest(); } }); }
      }
      if (now) {
        var tl = intro; intro = null;
        if (tl) { tl.progress(1); tl.kill(); }
        if (lineTw) lineTw.progress(1);
        done();
      } else {
        if (intro) intro.timeScale(Math.max(intro.timeScale(), 4));
        if (lineTw) lineTw.timeScale(4);
      }
    }
    function done() { unsplit(); clearSoft(); }
    function bootFrame() { if (!ticking) render(cur); }
    var OFF_EVENTS = ['wheel', 'touchstart', 'keydown'];
    function onUser(e) { finishIntro(e.type === 'keydown'); }
    function onFocus(e) { if (inner && inner.contains(e.target)) finishIntro(true); }
    function on() {
      OFF_EVENTS.forEach(function (t) { window.addEventListener(t, onUser, { passive: true }); });
      document.addEventListener('focusin', onFocus, true);
    }
    function off() {
      OFF_EVENTS.forEach(function (t) { window.removeEventListener(t, onUser, { passive: true }); });
      document.removeEventListener('focusin', onFocus, true);
    }

    function setupEntrance() {
      if (!atTop || !inner) return;
      // Hidden states now (before the first frame of the layer); the head CSS kept the words hidden until here.
      gsap.set(soft, { opacity: 0, y: 12 });
      intro = gsap.timeline({ paused: true, onComplete: function () { intro = null; if (!lineTw || lineTw.progress() === 1) done(); off(); } });
      if (h1 && M.SplitText) {
        split = M.SplitText.create(h1, {
          type: 'lines', mask: 'lines', linesClass: 'thp-m-ln', aria: 'none', autoSplit: true,
          onSplit: function (self) {
            // Re-split (serif font arrived, width changed): SplitText hands the old tween's time to this one.
            lineTw = gsap.fromTo(self.lines, { yPercent: 135 }, {
              yPercent: 0, duration: 1.35, ease: 'expo.out', stagger: 0.11, delay: 0.2, paused: !started,
              onComplete: function () { lineTw = null; if (!intro) requestAnimationFrame(done); }
            });
            return lineTw;
          }
        });
      } else if (h1) {
        gsap.set(h1, { opacity: 0 });
        intro.to(h1, { opacity: 1, duration: 1.2, ease: 'power3.out', clearProps: 'opacity' }, 0.2);
      }
      [[eyebrow, 0.55], [tagline, 0.7], [ctas, 0.85]].forEach(function (a) {
        if (a[0]) intro.to(a[0], { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', clearProps: 'opacity,transform' }, a[1]);
      });
      on();
    }
    function startEntrance() {
      if (started) return;
      started = true;
      if (intro) intro.play();
      if (lineTw) lineTw.play();
      // Desktop: the room settles from a slight zoom. Phones walk up to the window instead (below).
      if (atTop && G && !G.mobile && cur < 0.001) {
        boot.v = 0; render(cur);
        hero.classList.add('thp-m-hero-live');
        bootTw = gsap.to(boot, { v: 1, duration: 2.4, ease: 'expo.out', onUpdate: bootFrame,
          onComplete: function () { bootTw = null; rest(); } });
      }
      entranceReady = true;
      if (G && G.mobile) whenBoth(autoWalk);
    }
    // Phones: the walk needs the valley; wait for it at most 1.6 s after the room has been painted.
    var bothCbs = [], bothDone = false;
    function valleyReady() { if (bothDone) return; bothDone = true; bothCbs.splice(0).forEach(function (cb) { cb(); }); }
    function whenBoth(cb) { if (bothDone) cb(); else { bothCbs.push(cb); setTimeout(valleyReady, 1600); } }

    // Wait until the room photo is decoded (at most 1.2 s), so the settle plays smoothly from its first frame.
    function whenPainted(cb) {
      var fired = false, go1 = function () { if (!fired) { fired = true; cb(); } };
      setTimeout(go1, 1200);
      var dec = function () { if (room.decode) room.decode().then(go1, go1); else go1(); };
      if (room.complete) dec(); else { room.addEventListener('load', dec, { once: true }); room.addEventListener('error', go1, { once: true }); }
    }

    setupEntrance();
    if (!atTop) { auto.v = 1; boot.v = 1; }

    var mm = gsap.matchMedia();
    mm.add('(min-width: 721px) and (min-height: 600px)', function () { return makeTrigger('walk'); });
    mm.add('(min-width: 721px) and (max-height: 599.98px)', function () { return makeTrigger('short'); });
    mm.add('(max-width: 720px)', function () { return makeTrigger('phone'); });

    whenPainted(startEntrance);

    /* ── the booking bar: docked at the bottom edge during the walk, exactly where the theme shows it ──────
       Anchors (#book) and keyboard focus must land on its real place, not on the docked one. */
    function docked() {
      return !!booking && !track.classList.contains('thp-m-undock') &&
        getComputedStyle(booking).position === 'sticky' && window.scrollY < st_end() - 2;
    }
    function st_end() { return st ? st.end : 0; }
    function undock() { track.classList.add('thp-m-undock'); }
    function redock() {
      requestAnimationFrame(function () { requestAnimationFrame(function () { track.classList.remove('thp-m-undock'); }); });
    }
    function isBookTarget(el) { return !!(booking && el && (el === booking || booking.contains(el))); }
    function hashTarget(hash) {
      if (!hash || hash.length < 2) return null;
      try { return document.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) { return null; }
    }
    if (booking) {
      // Capture phase runs before the link's default action, so the browser measures the undocked layout.
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest && e.target.closest('a[href*="#"]');
        if (!a) return;
        var url;
        try { url = new URL(a.href, location.href); } catch (err) { return; }
        if (url.origin !== location.origin || url.pathname !== location.pathname) return;
        if (!isBookTarget(hashTarget(url.hash))) return;
        undock(); redock();
      }, true);
      booking.addEventListener('focusin', function (e) {
        if (!docked()) return;
        undock();
        e.target.scrollIntoView({ block: 'center' }); // as Chrome does for focus on the plain site
        if (M.lenis) M.lenis.scrollTo(window.scrollY, { immediate: true });
        redock();
      });
      // Loaded with #book in the address: land on the real form once the layout has settled.
      if (isBookTarget(hashTarget(location.hash))) {
        undock();
        var touched = false;
        var mark = function () { touched = true; };
        ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (t) {
          window.addEventListener(t, mark, { passive: true, once: true });
        });
        var land = function () {
          var t = hashTarget(location.hash);
          if (!touched && isBookTarget(t)) {
            t.scrollIntoView();
            if (M.lenis) M.lenis.scrollTo(window.scrollY, { immediate: true });
            ST.update();
          }
        };
        land();
        var settle = function () { setTimeout(function () { land(); redock(); }, 60); };
        if (document.readyState === 'complete') settle(); else window.addEventListener('load', settle);
      }
    }

    // The valley shows within the first flick of the wheel (desktop) or within the phone's own walk, so fetch
    // it right away, at low priority.
    loadValley();

    // Visitor switched on "reduce motion" mid-visit: stop following the scroll and keep the current frame.
    document.addEventListener('thp-motion:stop', function () {
      finishIntro(true);
      if (autoTw) { autoTw.progress(1); autoTw = null; }
      mm.kill();
      if (st) st.kill();
      st = null;
      if (ticking) { ticking = false; gsap.ticker.remove(tick); }
    });
  });
})();

/* ==== water.js ==== */
/* THP Motion · water — "Living water" on #pool.
 * The pool in the band photo (img-07-px-c.jpg, lower left) becomes a live surface. A height-field wave
 * simulation runs on the GPU in the pool's own ground plane (the photo's perspective, so rings are wide ellipses
 * near the camera and thin lines at the far edge), and the photo is re-drawn through it: the floor refracts near
 * the camera, reflections shift toward the far edge, faint capped glints ride the crests. Only pixels inside a
 * pre-computed water mask are drawn, and only while the water moves; at rest the canvas is empty and the
 * visitor sees the theme's own <img>. Pointer and finger leave a string of small rings; the first time the pool
 * comes into view a few drops fall from the canopy (≤ 5 s; the first one right after the quote has risen, in the
 * part of the pool nearest the middle of the band), afterwards it only answers the visitor. Paused off-screen and in
 * background tabs. Plain photo whenever WebGL cannot render float textures, on context loss, or on failure.
 */
(function () {
  'use strict';
  var TH = window.THPMotion;
  if (!TH) return;

  TH.register('water', function (M) {
    var band = document.getElementById('pool');
    var img = band && band.querySelector('img');
    if (!img || !window.WebGLRenderingContext) return;

    // ---- Geometry of this photo (measured; see report) ------------------------------------------------------
    // Ground plane of the pool seen by the camera: horizon at v = .34 of the frame, principal point u = .5,
    // focal length = 1 frame height, frame aspect 3:2. Plane coords (units ≈ camera heights):
    //   X = (u − .5)·1.5 / (v − .34),  Z = 1 / (v − .34)
    var CAM = [0.5, 0.34, 1.0, 1.5];
    var PLANE = [-2.8128, 1.5335, 2.544, 3.4592];  // X0, Z0, width, depth of the simulated patch of water
    var BOX = [0.0, 0.536, 0.446, 0.972];          // image-uv bounds of the water mask (the drawn quad)
    var NX = 188, NZ = 256;                         // sim cells, 0.0135 plane units each
    var STEP_MS = 1000 / 60;                        // fixed sim rate, independent of display refresh
    var WAVE_K = 0.3;                               // c² term → rings spread ≈ .22 plane units / s
    var DAMP = 0.984, DAMP_CALM = 0.9;              // per-step velocity damping (normal / settling)
    var LOOK = [0.8, 0.42, 16.0, 40.0];             // refraction, reflection, sky shading, glint gain
    var AUTO_END = 5000;                            // WCAG 2.2.2: ambient drops are still within 5 s
    var USER_TAIL = 4200;                           // after the last touch, ripples settle within this time
    var WAKE_GAP = 0.06, WAKE_MS = 60;              // pointer wake: one small drop per 0.06 plane units, ≤ 1 / 60 ms
                                                    // (each a small plink: 2–3 fine concentric rings)
    var SETTLE = 700;                               // last part of either window: damping ramps to calm
    var MASK_URL = M.asset('img/water-mask.png');

    // ---- Shaders (GLSL ES 1.00: runs in WebGL1 and WebGL2 contexts alike) ------------------------------------
    var HEAD =
      '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
      'uniform vec4 uCam;uniform vec4 uPlane;\n' +
      'vec2 toPlane(vec2 uv){float d=max(uv.y-uCam.y,.02);return vec2((uv.x-uCam.x)*uCam.w/d,uCam.z/d);}\n' +
      'vec2 toImage(vec2 p){return vec2(uCam.x+p.x*uCam.z/(p.y*uCam.w),uCam.y+uCam.z/p.y);}\n';

    var VS_SIM =
      'attribute vec2 aPos;varying vec2 vS;' +
      'void main(){vS=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}';

    // One step of the damped wave equation. State texel: r = height, g = velocity, ba = slope (per cell).
    var FS_SIM = HEAD +
      'uniform sampler2D uState;uniform sampler2D uMask;uniform vec2 uTexel;uniform float uK;uniform float uDamp;' +
      'uniform vec4 uDrop[8];uniform int uDropN;varying vec2 vS;\n' +
      'void main(){' +
      ' vec4 c=texture2D(uState,vS);' +
      ' float l=texture2D(uState,vS-vec2(uTexel.x,0.)).r,r=texture2D(uState,vS+vec2(uTexel.x,0.)).r;' +
      ' float b=texture2D(uState,vS-vec2(0.,uTexel.y)).r,t=texture2D(uState,vS+vec2(0.,uTexel.y)).r;' +
      // water strength here: 0 on the rim and outside; waves are absorbed near the rim and the patch border
      ' float m=texture2D(uMask,toImage(uPlane.xy+vS*uPlane.zw)).g;' +
      ' float e=min(min(vS.x,1.-vS.x),min(vS.y,1.-vS.y));' +
      ' float live=smoothstep(0.,.35,m)*smoothstep(0.,.05,e);' +
      ' float v=(c.g+((l+r+b+t)*.25-c.r)*uK)*mix(.86,uDamp,live);' +
      ' float h=c.r+v;' +
      ' for(int i=0;i<8;i++){if(i>=uDropN)break;vec4 d=uDrop[i];' +
      '  float q=length((vS-d.xy)*uPlane.zw)/d.z;if(q<1.)h+=d.w*(.5+.5*cos(q*3.14159265));}' +
      ' float w=step(.002,m);h*=w;v*=w;' +
      ' if(abs(h)<2e-4&&abs(v)<2e-4){h=0.;v=0.;}' +      // let the surface come fully to rest
      ' gl_FragColor=vec4(h,v,(r-l)*.5,(t-b)*.5);' +
      '}';

    var VS_DRAW =
      'attribute vec2 aPos;uniform vec4 uCover;varying vec2 vUv;' +
      'void main(){vUv=aPos;vec2 p=uCover.xy+aPos*uCover.zw;gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);}';

    // Re-draw the photo through the surface. Output is premultiplied; alpha is 0 wherever the water is still,
    // so the theme's <img> shows through untouched.
    var FS_DRAW = HEAD +
      'uniform sampler2D uPhoto;uniform sampler2D uState;uniform sampler2D uMask;uniform vec2 uSim;uniform vec4 uLook;' +
      'varying vec2 vUv;\n' +
      'vec4 sim(vec2 s){\n' +
      '#ifdef MANUAL_BILINEAR\n' +
      ' vec2 f=s*uSim-.5,i=floor(f),w=f-i,tx=1./uSim,o=(i+.5)*tx;' +
      ' return mix(mix(texture2D(uState,o),texture2D(uState,o+vec2(tx.x,0.)),w.x),' +
      '  mix(texture2D(uState,o+vec2(0.,tx.y)),texture2D(uState,o+tx),w.x),w.y);\n' +
      '#else\n' +
      ' return texture2D(uState,s);\n' +
      '#endif\n' +
      '}\n' +
      'void main(){' +
      ' vec4 mk=texture2D(uMask,vUv);' +
      ' if(mk.r<.004){gl_FragColor=vec4(0.);return;}' +
      ' vec2 P=toPlane(vUv);' +
      ' vec4 st=sim((P-uPlane.xy)/uPlane.zw);' +
      ' vec2 g0=st.ba*mk.g;' +
      ' vec2 g=g0/(1.+length(g0)*12.);' +          // soft limit: splashes stay in proportion
      ' float far=smoothstep(1.7,4.6,P.y);' +
      // refraction: the floor shifts in the ground plane, projected back through the photo's perspective
      ' vec2 uv=toImage(P-g*uLook.x);' +
      // reflection: a tilted facet mirrors a different piece of the scene; grows toward grazing angles
      ' uv+=vec2(-.6*g.x,g.y)*uLook.y*far;' +
      ' vec3 col=texture2D(uPhoto,uv).rgb;' +
      // facets tipped toward the camera mirror more of the pale sky (a sheen on the crests), the backs of the
      // waves mirror the canopy (a little darker)
      ' float k=g.y*uLook.z*(.6+.4*far);' +
      ' col=mix(col,vec3(.72,.8,.8),clamp(k,0.,.5));' +
      ' col*=1.-clamp(-k,0.,.22);' +
      // glints: only the steepest sky-facing crests, capped, blended (never brighter than white)
      ' float s=smoothstep(.62,1.,dot(g,vec2(-.35,1.))*uLook.w);' +
      ' col=mix(col,vec3(1.,.97,.9),s*.22*(.4+.6*far));' +
      ' float a=mk.r*clamp(max(length(g0)*160.,abs(st.r)*mk.g*20.),0.,1.);' +
      ' gl_FragColor=vec4(col*a,a);' +
      '}';

    // ---- WebGL context + a float format we can render to ------------------------------------------------------
    var ATTRS = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'low-power' };   // never wake a discrete GPU for this

    function makeCanvas() {
      var c = document.createElement('canvas');
      c.className = 'thp-m-water';
      c.setAttribute('aria-hidden', 'true');
      c.width = 1; c.height = 1;
      return c;
    }

    function stateTex(gl, f) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      var filt = f.lin ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, f.ifmt, NX, NZ, 0, gl.RGBA, f.type, null);
      return t;
    }
    function fboFor(gl, t) {
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return ok ? fb : null;
    }

    // Candidates in order of preference. Half float first: filterable in WebGL2 core and on iOS WebGL1.
    function formats(gl, v2) {
      var out = [];
      if (v2) {
        var cbf = gl.getExtension('EXT_color_buffer_float');
        var cbh = gl.getExtension('EXT_color_buffer_half_float');
        if (cbf || cbh) out.push({ name: 'RGBA16F', ifmt: gl.RGBA16F, type: gl.HALF_FLOAT, lin: true });
        if (cbf) out.push({ name: 'RGBA32F', ifmt: gl.RGBA32F, type: gl.FLOAT, lin: !!gl.getExtension('OES_texture_float_linear') });
      } else {
        var hf = gl.getExtension('OES_texture_half_float');
        if (hf) {
          gl.getExtension('EXT_color_buffer_half_float');
          out.push({ name: 'HALF_FLOAT_OES', ifmt: gl.RGBA, type: hf.HALF_FLOAT_OES, lin: !!gl.getExtension('OES_texture_half_float_linear') });
        }
        if (gl.getExtension('OES_texture_float')) {
          gl.getExtension('WEBGL_color_buffer_float');
          out.push({ name: 'FLOAT', ifmt: gl.RGBA, type: gl.FLOAT, lin: !!gl.getExtension('OES_texture_float_linear') });
        }
      }
      return out;
    }

    // Returns {canvas, gl, v2, fmt} or null. A WebGL2 context without renderable floats is dropped and WebGL1
    // is tried on a fresh canvas (a canvas keeps whichever context type it got first).
    function probe() {
      var kinds = ['webgl2', 'webgl'];
      for (var k = 0; k < kinds.length; k++) {
        var c = makeCanvas(), gl = null;
        try { gl = c.getContext(kinds[k], ATTRS) || (kinds[k] === 'webgl' ? c.getContext('experimental-webgl', ATTRS) : null); }
        catch (e) { gl = null; }
        if (!gl) continue;
        var v2 = kinds[k] === 'webgl2';
        var cands = formats(gl, v2);
        for (var i = 0; i < cands.length; i++) {
          var t = null, fb = null;
          try {
            while (gl.getError()) { /* drain */ }
            t = stateTex(gl, cands[i]);
            fb = gl.getError() ? null : fboFor(gl, t);
          } catch (e) { fb = null; }
          if (t) gl.deleteTexture(t);
          if (fb) { gl.deleteFramebuffer(fb); return { canvas: c, gl: gl, v2: v2, fmt: cands[i] }; }
        }
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
      return null;
    }

    // ---- State ----------------------------------------------------------------------------------------------
    var P = null, cv = null, gl = null, FMT = null;   // context, created when the pool is within reach
    var R = null;              // GL resources (programs, textures, buffers) once built
    var photo = null;          // {el, w, h}
    var maskData = null;       // CPU copy of the mask's G (water) and B (ripples read well here) channels
    var MW = 150, MH = 100;
    var dead = false, lost = false, building = false;
    var inView = false, running = false, raf = 0, last = 0, acc = 0;
    var T = 0;                 // active (visible, running) time in ms
    var endT = 0;              // active time at which the water has to be still again
    var autoDone = false, wantAmbient = false, autoQueue = [];
    var drops = [];            // pending [sx, sz, radiusPlane, strength]
    var ptr = { on: false, has: false, x: 0, z: 0, px: 0, pz: 0, t: -1e9 };
    var cover = [0, 0, 1, 1], bw = 0, bh = 0;
    var dprCap = 1.5, slow = 0, frames = 0;

    // ---- Mapping helpers ------------------------------------------------------------------------------------
    function objectPos() {
      var s = (getComputedStyle(img).objectPosition || '').split(/\s+/);
      var f = function (v) { return /%$/.test(v || '') ? parseFloat(v) / 100 : 0.5; };
      return [f(s[0]), f(s[1])];
    }
    function layout() {
      if (!photo) return;
      var r = band.getBoundingClientRect();
      bw = r.width; bh = r.height;
      if (!bw || !bh) return;
      var s = Math.max(bw / photo.w, bh / photo.h), dw = photo.w * s, dh = photo.h * s, op = objectPos();
      cover = [(bw - dw) * op[0] / bw, (bh - dh) * op[1] / bh, dw / bw, dh / bh];
      var dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      if (bw * bh * dpr * dpr > 4.2e6) dpr = Math.sqrt(4.2e6 / (bw * bh));
      var w = Math.max(1, Math.round(bw * dpr)), h = Math.max(1, Math.round(bh * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    }
    function toPlane(u, v) { var d = Math.max(v - CAM[1], 0.02); return [(u - CAM[0]) * CAM[3] / d, CAM[2] / d]; }
    function fadeAt(u, v) {
      if (!maskData || u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
      return maskData[(Math.floor(v * MH) * MW + Math.floor(u * MW)) * 2] / 255;
    }
    function visAt(u, v) {
      if (!maskData || u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
      return maskData[(Math.floor(v * MH) * MW + Math.floor(u * MW)) * 2 + 1] / 255;
    }
    function clientToUv(x, y) {
      var r = band.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return [((x - r.left) / r.width - cover[0]) / cover[2], ((y - r.top) / r.height - cover[1]) / cover[3]];
    }
    function addDrop(X, Z, rad, str) {
      if (drops.length < 24) drops.push([(X - PLANE[0]) / PLANE[2], (Z - PLANE[1]) / PLANE[3], rad, str]);
    }
    // A drop landing: the point bobs for a moment (crater, rebound, crater…), which sends out the familiar train
    // of 2–3 concentric rings instead of one lone wave.
    var plinks = [];
    function plink(X, Z, rad, amp) { if (plinks.length < 6) plinks.push({ X: X, Z: Z, r: rad, a: amp, t: 0 }); }
    function feedPlinks() {
      for (var i = plinks.length - 1; i >= 0; i--) {
        var p = plinks[i], t = p.t / 1000;
        addDrop(p.X, p.Z, p.r, -p.a * Math.sin(t * 6.2832 * 2.8) * Math.exp(-t / 0.2) / 5);
        p.t += STEP_MS;
        if (p.t > 560) plinks.splice(i, 1);
      }
    }

    // ---- GL resources ---------------------------------------------------------------------------------------
    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('water shader: ' + gl.getShaderInfoLog(s));
      return s;
    }
    function program(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('water link: ' + gl.getProgramInfoLog(p));
      var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
      for (var i = 0; i < n; i++) {
        var info = gl.getActiveUniform(p, i);
        u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
      }
      return { p: p, u: u };
    }
    function imageTex(src) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      return t;
    }
    function build(maskImg) {
      var def = FMT.lin ? '' : '#define MANUAL_BILINEAR\n';
      var sim = program(VS_SIM, FS_SIM), draw = program(VS_DRAW, def + FS_DRAW);
      var quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var box = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, box);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([BOX[0], BOX[1], BOX[2], BOX[1], BOX[0], BOX[3], BOX[2], BOX[3]]), gl.STATIC_DRAW);
      var tA = stateTex(gl, FMT), tB = stateTex(gl, FMT);
      var fA = fboFor(gl, tA), fB = fboFor(gl, tB);
      if (!fA || !fB) throw new Error('water: framebuffer incomplete');
      var res = { sim: sim, draw: draw, quad: quad, box: box, tex: [tA, tB], fbo: [fA, fB], cur: 0,
        photo: imageTex(photo.el), mask: imageTex(maskImg), dropBuf: new Float32Array(32) };
      if (gl.getError() === gl.OUT_OF_MEMORY) throw new Error('water: out of memory');
      R = res;
      zero();
    }
    function zero() {
      gl.clearColor(0, 0, 0, 0);
      for (var i = 0; i < 2; i++) { gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo[i]); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // ---- Simulation + drawing -------------------------------------------------------------------------------
    function stepSim() {
      // the pointer's wake: small drops spaced along the path (a string of rings, not a scratch-like line)
      if (ptr.on && ptr.has) {
        var dx = ptr.x - ptr.px, dz = ptr.z - ptr.pz;
        if (dx * dx + dz * dz >= WAKE_GAP * WAKE_GAP && T - ptr.t >= WAKE_MS) {
          plink(ptr.x, ptr.z, 0.03, 0.9);
          ptr.px = ptr.x; ptr.pz = ptr.z; ptr.t = T;
          endT = Math.max(endT, T + USER_TAIL);
        }
      }
      feedPlinks();
      var s = R.sim, u = s.u, src = R.cur, dst = 1 - src, nd = Math.min(8, drops.length);
      for (var i = 0; i < 32; i++) R.dropBuf[i] = 0;
      for (i = 0; i < nd; i++) {
        var d = drops[i];
        R.dropBuf[i * 4] = d[0]; R.dropBuf[i * 4 + 1] = d[1]; R.dropBuf[i * 4 + 2] = d[2]; R.dropBuf[i * 4 + 3] = d[3];
      }
      drops.splice(0, nd);
      var settle = Math.min(1, Math.max(0, (T - (endT - SETTLE)) / SETTLE));
      gl.useProgram(s.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo[dst]);
      gl.viewport(0, 0, NX, NZ);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex[src]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.mask);
      gl.uniform1i(u.uState, 0); gl.uniform1i(u.uMask, 1);
      gl.uniform4fv(u.uCam, CAM); gl.uniform4fv(u.uPlane, PLANE);
      gl.uniform2f(u.uTexel, 1 / NX, 1 / NZ);
      gl.uniform1f(u.uK, WAVE_K);
      gl.uniform1f(u.uDamp, DAMP + (DAMP_CALM - DAMP) * settle);
      gl.uniform4fv(u.uDrop, R.dropBuf);
      gl.uniform1i(u.uDropN, nd);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      R.cur = dst;
    }
    function draw() {
      var d = R.draw, u = d.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(d.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.photo);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.tex[R.cur]);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, R.mask);
      gl.uniform1i(u.uPhoto, 0); gl.uniform1i(u.uState, 1); gl.uniform1i(u.uMask, 2);
      gl.uniform4fv(u.uCam, CAM); gl.uniform4fv(u.uPlane, PLANE);
      gl.uniform4fv(u.uCover, cover);
      gl.uniform4fv(u.uLook, LOOK);
      if (u.uSim) gl.uniform2f(u.uSim, NX, NZ);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.box);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function canRun() { return R && !dead && !lost && inView && !document.hidden; }
    function wake() {
      if (running || !canRun() || T >= endT) return;
      running = true; last = 0; acc = 0;
      raf = requestAnimationFrame(frame);
    }
    function halt() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function rest() {
      halt();
      drops.length = 0; plinks.length = 0; ptr.has = false;
      if (R && !gl.isContextLost()) zero();
    }
    function frame(now) {
      raf = 0;
      if (!running) return;
      if (!canRun()) { running = false; return; }
      var dt = last ? Math.min(now - last, 100) : STEP_MS;
      last = now; acc += dt;
      // quality governor: a struggling device drops to 1× pixels (never switches the effect off by itself)
      if (++frames > 20) { slow = slow * 0.95 + (dt > 40 ? 0.05 : 0); if (slow > 0.6 && dprCap > 1) { dprCap = 1; layout(); } }
      var n = 0;
      while (acc >= STEP_MS && n < 3) {
        T += STEP_MS;
        while (autoQueue.length && autoQueue[0].t <= T) { var a = autoQueue.shift(); plink(a.X, a.Z, a.r, a.s); }
        stepSim();
        acc -= STEP_MS; n++;
      }
      if (n === 3) acc = 0;
      if (n) draw();
      if (T >= endT) { rest(); return; }
      raf = requestAnimationFrame(frame);
    }

    // ---- Ambient drops, the first time the pool is properly in view -----------------------------------------
    function visibleUv() {
      // part of the photo inside the band, a little inset
      var u0 = -cover[0] / cover[2], u1 = (1 - cover[0]) / cover[2];
      var v0 = -cover[1] / cover[3], v1 = (1 - cover[1]) / cover[3];
      var iu = (u1 - u0) * 0.04, iv = (v1 - v0) * 0.06;
      return [Math.max(u0 + iu, BOX[0]), Math.min(u1 - iu, BOX[2]), Math.max(v0 + iv, BOX[1]), Math.min(v1 - iv, BOX[3])];
    }
    // Drops land where rings read best (lighter water: sky reflection, sunlit floor), spaced apart. The first one
    // lands in the part of the pool nearest the middle of the band, where the eye is (under the quote).
    function pickSpots(n) {
      var vr = visibleUv(), cands = [], out = [];
      if (vr[1] <= vr[0] || vr[3] <= vr[2]) return out;
      for (var k = 0; k < 700 && cands.length < 80; k++) {
        var u = vr[0] + Math.random() * (vr[1] - vr[0]), v = vr[2] + Math.random() * (vr[3] - vr[2]);
        if (fadeAt(u, v) >= 0.75) cands.push([u, v, visAt(u, v)]);
      }
      cands.sort(function (a, b) { return b[2] - a[2]; });
      var cu = (0.5 - cover[0]) / cover[2], cvv = (0.5 - cover[1]) / cover[3], near = null, nd = 1e9;
      cands.slice(0, Math.ceil(cands.length * 0.6)).forEach(function (c) {
        var du = (c[0] - cu) * cover[2] * bw, dv = (c[1] - cvv) * cover[3] * bh, d = du * du + dv * dv;
        if (d < nd) { nd = d; near = c; }
      });
      if (near) out.push(near);
      for (var i = 0; i < cands.length && out.length < n; i++) {
        var c = cands[i], ok = true;
        for (var j = 0; j < out.length; j++) if (Math.abs(out[j][0] - c[0]) * 1.5 + Math.abs(out[j][1] - c[1]) < 0.09) ok = false;
        if (ok) out.push(c);
      }
      return out;
    }
    // The quote above the water rises line by line (reveal.js splits it and puts the text back when done): the
    // first drop lands as it settles, at most 1.4 s after the pool came into place.
    function afterQuote(cb) {
      var q = band.querySelector('blockquote'), fired = false;
      var go = function () { if (fired) return; fired = true; if (mo) mo.disconnect(); cb(); };
      var busy = function () { return !!(q && q.querySelector('.thp-m-ln')); };
      if (!busy() || !window.MutationObserver) return go();
      var mo = new MutationObserver(function () { if (!busy()) go(); });
      mo.observe(q, { childList: true, subtree: true });
      setTimeout(go, 1400);
    }
    function ambient() {
      wantAmbient = true;
      if (!R || autoDone || dead) return;
      autoDone = true;
      afterQuote(drip);
    }
    function drip() {
      if (dead) return;
      var spots = pickSpots(5), at = [150, 650, 1250, 2000, 3000], str = [2.4, 1.8, 2.2, 1.6, 1.4];
      spots.forEach(function (p, i) {
        var pl = toPlane(p[0], p[1]);
        autoQueue.push({ t: T + at[i] + (Math.random() * 160 - 80), X: pl[0], Z: pl[1], r: 0.028 + Math.random() * 0.012, s: str[i] });
      });
      if (!autoQueue.length) return;
      endT = Math.max(endT, T + AUTO_END);
      wake();
    }

    // ---- Visitor input --------------------------------------------------------------------------------------
    function track(x, y, splash) {
      if (!R) return;
      var uv = clientToUv(x, y);
      if (!uv || fadeAt(uv[0], uv[1]) < 0.12) { ptr.on = false; ptr.has = false; return; }
      var pl = toPlane(uv[0], uv[1]);
      ptr.x = pl[0]; ptr.z = pl[1]; ptr.on = true;
      if (!ptr.has) { ptr.px = pl[0]; ptr.pz = pl[1]; ptr.has = true; }
      if (splash) plink(pl[0], pl[1], 0.045, splash);
      endT = Math.max(endT, T + USER_TAIL);
      wake();
    }
    function onPointerMove(e) { if (e.pointerType !== 'touch') track(e.clientX, e.clientY, 0); }
    function onPointerDown(e) { if (e.pointerType !== 'touch') track(e.clientX, e.clientY, 1.8); }
    function onPointerLeave(e) { if (e.pointerType !== 'touch') { ptr.on = false; ptr.has = false; } }
    function onTouchStart(e) {
      for (var i = 0; i < e.changedTouches.length; i++) { ptr.has = false; track(e.changedTouches[i].clientX, e.changedTouches[i].clientY, 1.5); }
    }
    function onTouchMove(e) { var t = e.changedTouches[0]; if (t) track(t.clientX, t.clientY, 0); }
    function onTouchEnd() { ptr.on = false; ptr.has = false; }

    var PASSIVE = { passive: true };
    var listeners = [
      [band, 'pointermove', onPointerMove], [band, 'pointerdown', onPointerDown], [band, 'pointerleave', onPointerLeave],
      [band, 'touchstart', onTouchStart], [band, 'touchmove', onTouchMove], [band, 'touchend', onTouchEnd],
      [band, 'touchcancel', onTouchEnd]
    ];
    function listen(on) {
      listeners.forEach(function (l) { l[0][on ? 'addEventListener' : 'removeEventListener'](l[1], l[2], PASSIVE); });
    }

    // ---- Lifecycle ------------------------------------------------------------------------------------------
    function fail(err) {
      M.log('water: falling back to the photo', err);
      dead = true; halt(); listen(false);
      if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
      // the photo keeps its static framing (the class stays) so nothing jumps
    }

    function loadImg(src, cors) {
      return new Promise(function (res, rej) {
        var im = new Image();
        if (cors) im.crossOrigin = 'anonymous';
        im.onload = function () { res(im); };
        im.onerror = function () { rej(new Error('water: cannot load ' + src)); };
        im.src = src;
      });
    }
    function photoSource() {
      var src = img.currentSrc || img.src;
      var same = true;
      try { same = new URL(src, location.href).origin === location.origin; } catch (e) { same = true; }
      if (!same) return loadImg(src, true);   // cross-origin (CDN): needs CORS to become a texture
      if (img.complete && img.naturalWidth) return Promise.resolve(img);
      return new Promise(function (res, rej) {
        img.addEventListener('load', function () { res(img); }, { once: true });
        img.addEventListener('error', function () { rej(new Error('water: photo failed')); }, { once: true });
      });
    }
    // Decode off the main thread where possible, so the texture upload itself is cheap.
    function decoded(el) {
      var back = function () { return el; };
      try { if (window.createImageBitmap) return createImageBitmap(el).catch(back); } catch (e) { /* old engine */ }
      return el.decode ? el.decode().then(back, back) : Promise.resolve(el);
    }
    function setup() {
      if (building || R || dead || !attach()) return;
      building = true;
      Promise.all([photoSource(), loadImg(MASK_URL, true)]).then(function (r) {
        var el = r[0], mk = r[1];
        var w = el.naturalWidth, h = el.naturalHeight;
        if (!w || !h || Math.abs(w / h - 1.5) > 0.02) throw new Error('water: unexpected photo ' + w + 'x' + h);
        return decoded(el).then(function (tex) {
          if (dead) return;
          var c2 = document.createElement('canvas');
          c2.width = MW; c2.height = MH;
          var x = c2.getContext('2d', { willReadFrequently: true });   // CPU canvas: no GPU readback stall
          x.drawImage(mk, 0, 0, MW, MH);
          var px = x.getImageData(0, 0, MW, MH).data, g = new Uint8Array(MW * MH * 2);
          for (var i = 0; i < MW * MH; i++) { g[i * 2] = px[i * 4 + 1]; g[i * 2 + 1] = px[i * 4 + 2]; }
          maskData = g;
          photo = { el: tex, w: w, h: h, mask: mk };
          layout();
          building = false;
          if (gl.isContextLost()) { lost = true; return; }   // onRestored builds it
          build(mk);
          if (wantAmbient) ambient();
          if (inView) wake();
        });
      }).catch(function (err) { building = false; fail(err); });
    }

    function onLost(e) {
      e.preventDefault();          // ask for a restore
      lost = true; R = null; halt();
    }
    function onRestored() {
      lost = false;
      if (!photo || dead) return;
      // a restored context starts without extensions: enable them again, same format as before
      var again = formats(gl, P.v2).filter(function (f) { return f.name === FMT.name; })[0];
      if (!again) { fail('float format gone after restore'); return; }
      FMT = again;
      try { layout(); build(photo.mask); if (wantAmbient) ambient(); } catch (err) { fail(err); }
    }

    // Create the context once and put the canvas right after the photo (under the scrim and the text).
    function attach() {
      if (P || dead) return !!P;
      P = probe();
      if (!P) { dead = true; M.log('water: no WebGL float render target, keeping the photo'); return false; }
      cv = P.canvas; gl = P.gl; FMT = P.fmt;
      var anchor = img.parentNode && img.parentNode.tagName === 'PICTURE' ? img.parentNode : img;
      anchor.insertAdjacentElement('afterend', cv);
      // The canvas has to match the photo exactly, so the theme's slow "breathe" zoom stops on this image.
      band.classList.add('thp-m-water-on');
      cv.addEventListener('webglcontextlost', onLost, false);
      cv.addEventListener('webglcontextrestored', onRestored, false);
      return true;
    }

    if (window.ResizeObserver) new ResizeObserver(function () { layout(); if (R && !running && !lost) zero(); }).observe(band);
    else window.addEventListener('resize', layout);

    // Pool near the viewport already on load (reload mid-page, #pool link): take over the photo right away, before
    // it has visibly started the theme's zoom. Otherwise build everything once the pool is 1.5 screens away.
    var r0 = band.getBoundingClientRect(), vh = window.innerHeight || 800;
    if (r0.top < vh * 2.5 && r0.bottom > -vh * 1.5) attach();
    M.inView(band, function (on) { if (on) setup(); }, '150% 0px 150% 0px');
    // Run only while it is on screen.
    M.inView(band, function (on) { inView = on; if (on) wake(); else halt(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) halt(); else wake(); });
    if (M.ScrollTrigger) {
      M.ScrollTrigger.create({ trigger: band, start: 'center 62%', end: 'bottom top', once: true,
        onEnter: ambient });
    }
    listen(true);

    document.addEventListener('thp-motion:stop', function () {
      dead = true; autoQueue.length = 0; listen(false); rest();
    });

    // Small hook for QA and the demo (not used by the page itself): THPMotion.water.drop(u, v[, strength])
    // drops at image-uv (u, v); THPMotion.water.info() reports the GL path.
    M.water = {
      drop: function (u, v, s) {
        if (!R || dead || fadeAt(u, v) < 0.05) return false;
        var pl = toPlane(u, v);
        plink(pl[0], pl[1], 0.04, s == null ? 1.6 : s);
        endT = Math.max(endT, T + USER_TAIL);
        wake();
        return true;
      },
      info: function () {
        if (!P) return { ready: false, dead: dead };
        return { gl: P.v2 ? 'webgl2' : 'webgl1', format: FMT.name, linear: FMT.lin, ready: !!R, running: running,
          lost: lost, dead: dead, canvas: [cv.width, cv.height], cover: cover.map(function (v) { return +v.toFixed(4); }) };
      }
    };
  });
})();

/* ==== sunset.js ==== */
/* THP Motion · sunset — "Sunset today".
 * Under the #taste heading ("Two rooms, one view") the layer adds one line in the site's own voice with
 * tonight's sunset over the valley, computed here with the NOAA solar algorithm for Pejeng Kawan
 * (lat −8.515, lon 115.293) in Bali time (WITA, UTC+8) whatever the visitor's own timezone is.
 * A hairline arc (decorative, aria-hidden) sits above the line; its sun follows the scroll through the
 * heading and goes down behind the horizon.
 * The line is static text (no live region). Scroll-driven only: nothing moves on its own.
 */
(function () {
  'use strict';

  var LAT = -8.515, LON = 115.293, TZ = 8;            // Pejeng Kawan, WITA
  var RAD = Math.PI / 180;

  // NOAA solar calculator (Meeus-based spreadsheet version). Returns minutes after local midnight (WITA)
  // of sunrise and sunset for the given WITA calendar date, or null in polar day/night (never at −8.5°).
  function noaa(y, m, d) {
    var jd0 = Date.UTC(y, m - 1, d) / 864e5 + 2440587.5;  // Julian day at 0h UTC of that date

    function sun(jd) {
      var T = (jd - 2451545) / 36525;
      var L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
      var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
      var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
      var C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
              Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
      var om = 125.04 - 1934.136 * T;
      var lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(om * RAD);
      var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
      var eps = eps0 + 0.00256 * Math.cos(om * RAD);
      var decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
      var yy = Math.pow(Math.tan(eps * RAD / 2), 2);
      var eot = 4 / RAD * (yy * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) +
        4 * e * yy * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
        0.5 * yy * yy * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
      return { decl: decl, eot: eot };
    }

    // Upper limb on the horizon, with refraction: zenith 90.833°.
    function event(rising) {
      var t = 720 - 4 * LON - TZ * 60 + (rising ? -360 : 360);   // first guess, minutes UTC
      for (var i = 0; i < 3; i++) {                               // re-evaluate the sun at the event itself
        var s = sun(jd0 + t / 1440);
        var cosH = Math.cos(90.833 * RAD) / (Math.cos(LAT * RAD) * Math.cos(s.decl)) -
                   Math.tan(LAT * RAD) * Math.tan(s.decl);
        if (cosH < -1 || cosH > 1) return null;
        var H = Math.acos(cosH) / RAD;
        t = 720 - 4 * LON - s.eot + (rising ? -4 * H : 4 * H);
      }
      return t + TZ * 60;
    }
    return { rise: event(true), set: event(false) };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Today's date and time in Bali, from the visitor's clock.
  function baliNow() {
    var b = new Date(Date.now() + TZ * 36e5);
    return { y: b.getUTCFullYear(), m: b.getUTCMonth() + 1, d: b.getUTCDate(), min: b.getUTCHours() * 60 + b.getUTCMinutes() };
  }

  function sunsetInfo() {
    var now = baliNow();
    var day = { y: now.y, m: now.m, d: now.d };
    var t = noaa(day.y, day.m, day.d);
    var tomorrow = false;
    if (t.set != null && now.min > Math.round(t.set) + 10) {        // already set in the valley: give tomorrow's
      var n = new Date(Date.UTC(now.y, now.m - 1, now.d + 1));
      day = { y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate() };
      t = noaa(day.y, day.m, day.d);
      tomorrow = true;
    }
    if (t.set == null) return null;
    var mins = Math.round(t.set);
    var hm = pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
    var r = Math.round(t.rise);
    return {
      tomorrow: tomorrow, hm: hm,
      rise: pad(Math.floor(r / 60)) + ':' + pad(r % 60),
      iso: day.y + '-' + pad(day.m) + '-' + pad(day.d) + 'T' + hm + '+08:00'
    };
  }

  // Exposed for the report / verification only (read-only, inside the core namespace).
  if (window.THPMotion) window.THPMotion.sunset = { noaa: noaa, info: sunsetInfo };

  if (!window.THPMotion) return;
  THPMotion.register('sunset', function (M) {
    var section = M.q('#taste');
    var head = section && M.q('.head', section);
    var h2 = head && M.q('h2', head);
    if (!h2) return;
    var info = sunsetInfo();
    if (!info) return;

    // ── markup ────────────────────────────────────────────────────────────────
    // Arc geometry (viewBox 0 0 320 92): horizon y=78; the sun's path is a circle of radius R centred
    // under the horizon, meeting it at x=24 and x=296 and peaking at y=16.
    var R = 180.16, CX = 160, CY = 196.16, HALF = 49.0;
    var box = document.createElement('div');
    box.className = 'thp-m-sunset';
    box.innerHTML =
      '<svg class="thp-m-sunset-arc" viewBox="0 0 320 92" aria-hidden="true" focusable="false">' +
        '<defs>' +
          // userSpaceOnUse: a horizontal line has a zero-height box, so bounding-box units would not paint
          '<linearGradient id="thp-m-sunset-hz" gradientUnits="userSpaceOnUse" x1="0" x2="320" y1="0" y2="0">' +
            '<stop offset="0" stop-color="currentColor" stop-opacity="0"/>' +
            '<stop offset=".18" stop-color="currentColor" stop-opacity=".55"/>' +
            '<stop offset=".82" stop-color="currentColor" stop-opacity=".55"/>' +
            '<stop offset="1" stop-color="currentColor" stop-opacity="0"/>' +
          '</linearGradient>' +
          '<clipPath id="thp-m-sunset-sky"><rect x="0" y="-40" width="320" height="118"/></clipPath>' +
        '</defs>' +
        '<path class="thp-m-sunset-path" d="M24 78A' + R + ' ' + R + ' 0 0 1 296 78"/>' +
        '<g clip-path="url(#thp-m-sunset-sky)">' +
          '<g class="thp-m-sunset-sun">' +
            '<circle class="thp-m-sunset-halo" cx="' + CX + '" cy="' + (CY - R) + '" r="10.5"/>' +
            '<circle class="thp-m-sunset-disc" cx="' + CX + '" cy="' + (CY - R) + '" r="4.6"/>' +
          '</g>' +
        '</g>' +
        '<line class="thp-m-sunset-hz" x1="0" y1="78.5" x2="320" y2="78.5" stroke="url(#thp-m-sunset-hz)"/>' +
      '</svg>' +
      '<p class="thp-m-sunset-line">' + (info.tomorrow ? 'Tomorrow' : 'Tonight') +
        ' the sun sets over the valley at <time datetime="' + info.iso + '">' + info.hm + '</time></p>';
    h2.parentNode.insertBefore(box, h2.nextSibling);

    // ── scroll: the sun goes down while the heading crosses the screen ─────────
    var gsap = M.gsap;
    var sunEl = box.querySelector('.thp-m-sunset-sun');
    gsap.set(sunEl, { rotation: -34, svgOrigin: CX + ' ' + CY });

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: box,
        start: 'top 92%',
        endTrigger: section.querySelector('.cards') || box,
        end: 'top 30%',
        scrub: 0.9
      }
    });
    tl.to(sunEl, { rotation: HALF, duration: 0.86, ease: 'sine.in' }, 0)         // reaches the horizon…
      .to(sunEl, { rotation: HALF + 8, duration: 0.14 }, 0.86);                  // …and slips below it

    document.addEventListener('thp-motion:stop', function () {
      if (tl.scrollTrigger) tl.scrollTrigger.kill();
      tl.progress(1).kill();
    });
  });
})();

/* ==== transitions.js ==== */
/* THP Motion · transitions — page transitions with cross-document View Transitions.
 * The opt-in (@view-transition, see transitions.css) lives in the stylesheet so that both the page being left
 * and the page being opened carry it before their first paint; it is gated by prefers-reduced-motion there.
 * An at-rule cannot be scoped to html.thp-m, so this file cancels the transition in `pageswap` whenever the
 * layer is off (?motion=off, the demo switch, or the head snippet's fallback) — the visitor then gets the
 * plain navigation of the original site.
 *
 * What moves (≤ 400 ms): the photo of the card or panel the visitor clicked grows into the next page's hero
 * (the hero carries the name `thp-m-hero` from CSS; here we give the same name to the clicked card at
 * `pageswap`, one element per page) — only when both are the SAME photo. Two different photos in one growing
 * frame read as a double exposure, so a card whose picture differs from the next page's hero simply stays in
 * place, and the new page settles in over the old one. Titles fade in place and never scale.
 * Going back (bfcache), the hero shrinks back into the same card. Browsers without cross-document
 * View Transitions navigate normally.
 */
(function () {
  'use strict';
  var root = document.documentElement;
  var NAME = 'thp-m-hero';
  var HERO = '.page-hero, .oia-hero';
  var KEY = 'thp-m-vt';
  var named = [];
  var lastClick = null;

  // The head snippet sets html.thp-m before the first paint and core removes it if the layer cannot run;
  // `pagereveal` may fire before core has started, so the class alone is the test (not THPMotion.ready).
  function on() { return root.classList.contains('thp-m'); }
  function same(a, b) {
    try { var x = new URL(a, location.href), y = new URL(b, location.href); return x.origin === y.origin && x.pathname === y.pathname; }
    catch (e) { return false; }
  }
  function setName(el, v) { el.style.viewTransitionName = v; named.push(el); }
  function clearNames() { named.forEach(function (el) { el.style.viewTransitionName = ''; }); named = []; }
  function onScreen(el, minW) {
    var r = el.getBoundingClientRect();
    return r.width >= (minW || 1) && r.height > 40 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }
  function ownHero() {
    var h = document.querySelector(HERO);
    return h && h.querySelector('img') ? h : null;
  }
  function heroText(h) { return h && h.querySelector('.hero-inner, .hero-body'); }
  // This page's hero steps aside (another element carries the name, or it is scrolled away).
  function heroOff(h) {
    if (!h) return;
    setName(h, 'none');
    var t = heroText(h); if (t) setName(t, 'none');
  }
  // Name the card; a panel's own title block is captured apart so it fades in place and never scales.
  function nameSource(el) {
    setName(el, NAME);
    var body = el.classList.contains('panel') && el.querySelector('.panel-body');
    if (body) setName(body, 'thp-m-card-text');
  }
  // The picture to morph for a clicked link: a whole .panel (image, scrim and title, like a small hero), else
  // the clipping frame of the card's photo (.shot) so a hover-zoomed image does not jump out of its frame.
  function source(a) {
    var panel = a.closest('.panel');
    if (panel && panel.querySelector('img')) return onScreen(panel, 120) ? panel : null;
    var box = a.closest('article, .card, .bed, li') || a;
    var img = a.querySelector('img') || box.querySelector('img');
    if (!img) return null;
    var el = img.closest('.shot') || img;
    return onScreen(el, 120) ? el : null;
  }
  function allSources() { return Array.prototype.slice.call(document.querySelectorAll('.panel, .shot')); }

  // Which photo a page opens with, as a file stem ("-c", "-px", a trailing "-m" and the extension dropped, so the
  // card crop and the hero file of the same photo compare equal). Listed: the pages whose hero photo also appears
  // on a card that links to them (checked against the whole site, 30.09); any other card simply does not morph.
  // A page the visitor has opened in this session reports its own hero (below), so a changed photo is picked up.
  var HEROES = {'stay/premiere-suite/':'bk-premiere-hero-v2','stay/honeymoon-villa/':'bk-honeymoon-hero',
    'stay/two-bedroom-villa/':'img-hero-living-w','stay/valley-suite/':'bk-valley-hero','villa-oia/':'r-oia-18',
    'valley/river-walk/':'img-20','valley/tirta-empul/':'img-10','valley/gunung-kawi/':'oia-05',
    'valley/pejeng-moon/':'oia-07','taste/sunset-point/':'img-28','wellbeing/spa/':'img-11'};
  var SEEN = 'thp-m-vt-heroes';
  function stem(src) {
    var n = String(src || '').split(/[?#]/)[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    return n.replace(/-(c|px)(?=-|$)/g, '').replace(/-m$/, '');
  }
  function imgStem(el) {
    var img = el && (el.tagName === 'IMG' ? el : el.querySelector('img'));
    return img ? stem(img.currentSrc || img.getAttribute('src')) : '';
  }
  function pathOf(url) { try { return new URL(url, location.href).pathname; } catch (e) { return ''; } }
  function seen() { try { return JSON.parse(sessionStorage.getItem(SEEN) || '{}') || {}; } catch (e) { return {}; } }
  // The hero photo of the page at `url`, or '' when unknown / the page has none.
  function heroStemAt(url) {
    var p = pathOf(url), s = seen();
    if (Object.prototype.hasOwnProperty.call(s, p)) return s[p];
    var best = '', key = '';
    Object.keys(HEROES).forEach(function (k) {
      if (('/' + p.replace(/^\//, '')).slice(-(k.length + 1)) === '/' + k && k.length > key.length) { key = k; best = HEROES[k]; }
    });
    return best;
  }
  // This page reports its own hero, for the next time the visitor comes to it from another page.
  function noteOwnHero() {
    var h = ownHero(), s = seen();
    s[location.pathname] = h ? imgStem(h.querySelector('img')) : '';
    try { sessionStorage.setItem(SEEN, JSON.stringify(s)); } catch (e) {}
  }
  function read() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }

  // Which link started the navigation (plain left click, same tab, same site).
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    lastClick = { a: a, href: a.href, t: Date.now() };
  }, true);

  // Leaving this page: last chance to name what the browser should capture.
  window.addEventListener('pageswap', function (e) {
    var vt = e.viewTransition;
    if (!vt) return;
    if (!on()) { vt.skipTransition(); return; }
    clearNames();
    var act = e.activation, to = act && act.entry && act.entry.url;
    var hero = ownHero();
    var want = to ? heroStemAt(to) : '';
    var src = null;
    if (act && act.navigationType !== 'traverse' && lastClick && to && same(lastClick.href, to) && Date.now() - lastClick.t < 5000) {
      src = source(lastClick.a);
      if (src && (!want || imgStem(src) !== want)) src = null;   // a different photo: no morph
    }
    if (src) {
      if (hero !== src) heroOff(hero);                   // one element per name on a page
      nameSource(src);
      write({ from: location.href, to: to, i: allSources().indexOf(src) });
    } else {
      write(null);
      // This page's own hero morphs into the next one only when it is on screen and shows the same photo.
      if (hero && (hero.getBoundingClientRect().top < -60 || !want || imgStem(hero) !== want)) heroOff(hero);
    }
    lastClick = null;
  });

  // Arriving: the new page's hero is named by CSS. Coming back to a page we left from a card, give the
  // card the name again so the hero shrinks back into it (works when the page returns from the bfcache,
  // where this listener is already in place before the first frame).
  window.addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition;
    clearNames();
    if (!vt) return;
    if (!on()) { vt.skipTransition(); return; }
    var act = window.navigation && window.navigation.activation;
    var s = read();
    var hero = ownHero();
    if (act && act.navigationType === 'traverse' && s && act.from && same(act.from.url, s.to) && same(location.href, s.from)) {
      var el = allSources()[s.i];
      if (el && onScreen(el, 120)) {
        if (hero !== el) heroOff(hero);
        nameSource(el);
        hero = null;
      }
    }
    // Back on a page scrolled away from its hero (bfcache): the hero is off screen and must not take part.
    if (hero && hero.getBoundingClientRect().bottom < 60) heroOff(hero);
    vt.finished.then(clearNames, clearNames);
  });

  window.addEventListener('pageshow', function (e) { if (e.persisted) setTimeout(clearNames, 600); });

  if (!window.THPMotion) return;
  THPMotion.register('transitions', function () {
    // The listeners above do the work, and the new page's hero is named by CSS before its first paint. Here the
    // page only notes which photo its hero shows. A visitor who switches on "reduce motion" mid-visit is covered
    // by the media query around @view-transition.
    noteOwnHero();
  });
})();
