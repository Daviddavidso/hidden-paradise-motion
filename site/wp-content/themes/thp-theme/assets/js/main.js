(function(){
  var topbar=document.getElementById('topbar'),dock=document.getElementById('dock');
  var overlay=document.getElementById('navOverlay');
  var thpHero=document.querySelector('.hero, .oia-hero, .page-hero');
function onScroll(){
    var y=window.scrollY;
    var thpLimit=thpHero?Math.max(thpHero.offsetHeight-80,40):40;topbar.classList.toggle('solid',y>thpLimit);
    dock.classList.toggle('up',y>window.innerHeight*1.1);
  }
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();

  // 22.09.2026: высота закреплённой шапки нужна вёрстке — по ней считается отступ прокрутки к форме
  // бронирования (#book). Без этого переход по якорю подводит форму под шапку и её не видно.
  function topbarH(){ document.documentElement.style.setProperty('--topbar-h',topbar.offsetHeight+'px') }
  topbarH(); window.addEventListener('resize',topbarH,{passive:true});

  // 20.09.2026: on a desktop with a mouse the menu is a drop-down panel. It opens when the pointer rests on MENU
  // (short delay, so a passing pointer does not open it) or on click; a click pins it. Phones keep the full-screen overlay.
  var mqDesk=window.matchMedia('(hover:hover) and (pointer:fine) and (min-width:1000px)');
  var btn=document.getElementById('menuOpen'),lbl=btn.querySelector('.lbl');
  var scrim=document.createElement('div');scrim.className='thp-scrim';document.body.appendChild(scrim);
  var pinned=false,tOpen=null,tClose=null;
  function isOpen(){return overlay.classList.contains('open')}
  function isPanel(){return overlay.classList.contains('as-panel')}
  function setMenu(open){
    if(open){
      overlay.classList.toggle('as-panel',mqDesk.matches);
      if(mqDesk.matches)overlay.style.setProperty('--topbar-h',topbar.offsetHeight+'px');
    }
    overlay.classList.toggle('open',open);
    overlay.setAttribute('aria-hidden',open?'false':'true');
    btn.setAttribute('aria-expanded',open?'true':'false');
    var panel=open&&isPanel();
    topbar.classList.toggle('menu-open',panel);
    scrim.classList.toggle('on',panel);
    if(lbl)lbl.textContent=panel?'Close':'Menu';
    document.body.style.overflow=(open&&!isPanel())?'hidden':'';
    if(!open)pinned=false;
  }
  function scheduleClose(){clearTimeout(tClose);if(pinned)return;tClose=setTimeout(function(){if(!pinned)setMenu(false)},280)}
  btn.addEventListener('click',function(){
    clearTimeout(tOpen);clearTimeout(tClose);
    if(!mqDesk.matches){setMenu(true);return}
    if(isOpen()&&pinned){setMenu(false);return}
    if(!isOpen())setMenu(true);
    pinned=true;
  });
  btn.addEventListener('mouseenter',function(){
    if(!mqDesk.matches)return;clearTimeout(tClose);
    if(!isOpen())tOpen=setTimeout(function(){setMenu(true)},160);
  });
  btn.addEventListener('mouseleave',function(){clearTimeout(tOpen)});
  [topbar,overlay].forEach(function(zone){
    zone.addEventListener('mouseenter',function(){clearTimeout(tClose)});
    zone.addEventListener('mouseleave',function(){if(isOpen()&&isPanel())scheduleClose()});
  });
  scrim.addEventListener('click',function(){setMenu(false)});
  window.addEventListener('scroll',function(){if(isOpen()&&isPanel()&&!pinned)setMenu(false)},{passive:true});
  document.getElementById('menuClose').addEventListener('click',function(){setMenu(false)});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')setMenu(false)});
  // 16.09.2026: links inside the overlay must close it. A same-page anchor (e.g. /retreats/#terms while on
  // /retreats/) only changes the hash, so without this the menu stayed open with body scroll locked.
  overlay.addEventListener('click',function(e){
    var a=e.target.closest('a');if(!a)return;
    var url;try{url=new URL(a.href,location.href)}catch(err){return}
    var samePage=url.origin===location.origin&&url.pathname.replace(/\/$/,'')===location.pathname.replace(/\/$/,'');
    setMenu(false);
    if(samePage&&url.hash){
      var t=document.getElementById(url.hash.slice(1));
      if(t){e.preventDefault();history.pushState(null,'',url.hash);t.scrollIntoView({behavior:'smooth',block:'start'});}
    }
  });

  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target)}});
  },{threshold:0.12,rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal').forEach(function(el){io.observe(el)});

  // 20.09.2026: booking forms. Defaults: arrival in two weeks, three nights. No past dates; departure stays after arrival.
  (function(){
    var pad=function(n){return(n<10?'0':'')+n};
    var iso=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
    var plus=function(s,n){var p=s.split('-');var d=new Date(+p[0],+p[1]-1,+p[2]);d.setDate(d.getDate()+n);return iso(d)};
    var today=iso(new Date());
    [].forEach.call(document.querySelectorAll('form[data-thp-booking]'),function(f){
      var i=f.querySelector('input[name=checkin]'),o=f.querySelector('input[name=checkout]');if(!i||!o)return;
      i.min=today;if(!i.value)i.value=plus(today,14);
      o.min=plus(i.value,1);if(!o.value)o.value=plus(i.value,3);
      i.addEventListener('change',function(){if(!i.value)return;if(i.value<today)i.value=today;o.min=plus(i.value,1);if(!o.value||o.value<=i.value)o.value=plus(i.value,3)});
      o.addEventListener('change',function(){if(o.value&&i.value&&o.value<=i.value)o.value=plus(i.value,1)});
      [i,o].forEach(function(el){el.addEventListener('click',function(){if(el.showPicker){try{el.showPicker()}catch(e){}}})});
    });
  })();

  // 20.09.2026: The Hidden Circle. A card in the corner, never a full-screen pop-up and never on a timer.
  // It shows once per page view, on behaviour: the rates block comes into view, half of the page is scrolled,
  // or (desktop) the pointer leaves through the top of the window. Not while the menu is open and not while a
  // booking form is on screen. Closed: silent for 7 days. Joined: never again, and the code is remembered, so
  // the booking forms on the site open the engine with the members' code applied.
  (function(){
    var cfg=window.THP_CIRCLE;if(!cfg||!cfg.api)return;
    var KEY='thpCircle',card=document.getElementById('thpCircle');
    var read=function(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){return{}}};
    var write=function(o){try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}};
    // 20.09.2026: ?circle=reset очищает память браузера и показывает карточку сразу — чтобы показывать
    // клуб владельцам отеля, когда почта уже введена и карточка больше не появляется.
    var forced=/[?&]circle=(reset|show)\b/.test(location.search);
    if(forced){ try{localStorage.removeItem(KEY)}catch(e){} }
    var st=read(),shown=false;
    // подложка только для телефона: окно по центру должно читаться как окно, а не как плашка внизу
    var back=document.createElement('div'); back.className='thp-circle-back'; document.body.appendChild(back);

    function applyMember(code,url){
      [].forEach.call(document.querySelectorAll('form[data-thp-booking]'),function(f){
        var h=f.querySelector('input[name=promo]');
        if(!h){h=document.createElement('input');h.type='hidden';h.name='promo';f.appendChild(h)}
        h.value=code;
      });
      [].forEach.call(document.querySelectorAll('.thp-circle-done'),function(d){
        var b=d.querySelector('[data-thp-circle-code]'),a=d.querySelector('[data-thp-circle-book]');
        if(b)b.textContent=code;if(a&&url)a.href=url;d.hidden=false;
        var f=d.parentNode.querySelector('form[data-thp-circle-form]');if(f)f.hidden=true;
      });
    }
    if(st.code)applyMember(st.code,st.url);

    function open(byUser){
      if(!card)return;
      card.hidden=false;shown=true;back.classList.add('on');
      requestAnimationFrame(function(){requestAnimationFrame(function(){card.classList.add('in')})});
      setTimeout(function(){card.classList.add('in')},60);
      if(byUser){var h=card.querySelector('h2');if(h)h.focus({preventScroll:true})}
    }
    function close(remember){
      if(!card)return;
      card.classList.remove('in');back.classList.remove('on');setTimeout(function(){card.hidden=true},500);
      if(remember&&!read().code){var s=read();s.closed=Date.now();write(s)}
    }
    if(card){
      card.querySelector('[data-thp-circle-close]').addEventListener('click',function(){close(true)});
      back.addEventListener('click',function(){close(true)});
      document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!card.hidden)close(true)});
    }
    [].forEach.call(document.querySelectorAll('[data-thp-circle-open]'),function(el){
      el.addEventListener('click',function(e){if(!card)return;e.preventDefault();open(true)});
    });

    // sending
    [].forEach.call(document.querySelectorAll('form[data-thp-circle-form]'),function(f){
      var err=f.querySelector('.thp-circle-err');
      var say=function(m){if(!err)return;err.textContent=m;err.hidden=!m};
      f.addEventListener('submit',function(e){
        e.preventDefault();say('');
        var email=(f.email.value||'').trim();
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){say('Please type your email address.');f.email.focus();return}
        if(!f.consent.checked){say('Please tick the box so we may send you the code.');return}
        f.classList.add('busy');
        var post=function(path,body){return fetch(cfg.api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),credentials:'omit'}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})};
        post('token').then(function(t){
          if(!t.ok||!t.j.t)throw new Error('Please try again in a moment.');
          // the server refuses tokens younger than two seconds: a person needs longer than that to fill a form
          return new Promise(function(res){setTimeout(res,2100)}).then(function(){
            return post('join',{email:email,consent:true,token:t.j.t,website:f.website.value,source:location.pathname});
          });
        }).then(function(r){
          f.classList.remove('busy');
          if(!r.ok||!r.j.ok){say((r.j&&r.j.message)||'Something went wrong. Please try again.');return}
          write({code:r.j.code,url:r.j.url,joined:Date.now()});
          applyMember(r.j.code,r.j.url);
        }).catch(function(x){f.classList.remove('busy');say(x&&x.message?x.message:'No connection. Please try again.')});
      });
    });

    // showing on its own
    if(!card)return;
    if(forced){ setTimeout(function(){open(true)},600); return }
    if(!cfg.auto||st.code)return;
    if(st.closed&&Date.now()-st.closed<7*864e5)return;
    var t0=Date.now();
    function busy(){
      if(shown)return true;
      var ov=document.getElementById('navOverlay');if(ov&&ov.classList.contains('open'))return true;
      var forms=document.querySelectorAll('form[data-thp-booking]');
      for(var k=0;k<forms.length;k++){var r=forms[k].getBoundingClientRect();if(r.bottom>0&&r.top<window.innerHeight)return true}
      return false;
    }
    function maybe(){if(!busy())open(false)}
    var rates=document.getElementById('rates');
    if(rates&&'IntersectionObserver' in window){
      var rio=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){rio.disconnect();setTimeout(maybe,1200)}})},{threshold:0.35});
      rio.observe(rates);
    }
    window.addEventListener('scroll',function(){
      if(shown||Date.now()-t0<8000)return;
      var d=document.documentElement,done=(window.scrollY+window.innerHeight)/d.scrollHeight;
      if(done>0.5)maybe();
    },{passive:true});
    if(window.matchMedia('(hover:hover) and (pointer:fine)').matches){
      document.addEventListener('mouseout',function(e){if(!e.relatedTarget&&e.clientY<=0&&Date.now()-t0>5000)maybe()});
    }
  })();

  // 20.09.2026: one lightbox for every gallery on the site (was only on /gallery/). Any container marked
  // data-thp-gal opens its own set of photos; captions come from <figcaption> or from the alt text.
  (function(){
    var lb=document.getElementById('thp-lb'); if(!lb)return;
    var gals=[].slice.call(document.querySelectorAll('[data-thp-gal]')); if(!gals.length){lb.remove();return}
    var big=lb.querySelector('img'), cap=lb.querySelector('.lb-cap'), set=[], cur=0, opener=null;
    function show(i){
      cur=(i+set.length)%set.length; var im=set[cur];
      big.src=im.currentSrc||im.src; big.alt=im.alt||'';
      var fc=im.closest('figure')?im.closest('figure').querySelector('figcaption'):null;
      var text=fc?fc.textContent.trim():(im.alt||'');
      cap.textContent=set.length>1?(text?text+' · ':'')+(cur+1)+' / '+set.length:text;
      var nx=set[(cur+1)%set.length]; if(nx){var pre=new Image();pre.src=nx.currentSrc||nx.src}
    }
    function open(g,i){
      set=[].slice.call(g.querySelectorAll('img')); if(!set.length)return;
      opener=document.activeElement; show(i);
      lb.classList.add('open'); lb.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden'; lb.querySelector('.lb-x').focus();
    }
    function close(){
      lb.classList.remove('open'); lb.setAttribute('aria-hidden','true');
      document.body.style.overflow=''; big.src=''; if(opener&&opener.focus)opener.focus();
    }
    gals.forEach(function(g){
      g.style.cursor='zoom-in';
      g.addEventListener('click',function(e){
        if(e.target.closest('a'))return;             // карточки-ссылки открываем как обычно
        var im=e.target.closest('img'); if(!im)return;
        e.preventDefault(); open(g,[].slice.call(g.querySelectorAll('img')).indexOf(im));
      });
    });
    lb.querySelector('.lb-x').addEventListener('click',close);
    lb.querySelector('.lb-p').addEventListener('click',function(e){e.stopPropagation();show(cur-1)});
    lb.querySelector('.lb-n').addEventListener('click',function(e){e.stopPropagation();show(cur+1)});
    lb.addEventListener('click',function(e){if(e.target===lb||e.target===big||e.target===cap)close()});
    document.addEventListener('keydown',function(e){
      if(!lb.classList.contains('open'))return;
      if(e.key==='Escape')close();
      if(e.key==='ArrowLeft')show(cur-1);
      if(e.key==='ArrowRight')show(cur+1);
    });
    var sx=null;
    lb.addEventListener('touchstart',function(e){sx=e.touches[0].clientX},{passive:true});
    lb.addEventListener('touchend',function(e){
      if(sx===null)return; var dx=e.changedTouches[0].clientX-sx; sx=null;
      if(Math.abs(dx)>40)show(cur+(dx<0?1:-1));
    },{passive:true});
  })();

  // 20.09.2026: the concierge chat (see inc/concierge.php). The quiz stays above it; this is for people who
  // would rather ask. History lives in this page only: reload and the conversation starts again.
  (function(){
    var box=document.getElementById('thpChat'); if(!box)return;
    var api=box.getAttribute('data-api'), log=box.querySelector('[data-chat-log]'),
        form=box.querySelector('[data-chat-form]'), ta=form.querySelector('textarea'),
        hints=box.querySelector('[data-chat-hints]'), hist=[];
    function bubble(cls,text){
      var d=document.createElement('div'); d.className='thp-msg '+cls; d.textContent=text;
      log.appendChild(d); d.scrollIntoView({block:'nearest',behavior:'smooth'}); return d;
    }
    function grow(){ ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,180)+'px' }
    ta.addEventListener('input',grow);
    ta.addEventListener('keydown',function(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()} });
    if(hints) hints.addEventListener('click',function(e){
      var b=e.target.closest('.thp-chip'); if(!b)return;
      ta.value=b.textContent.trim(); grow(); form.requestSubmit();
    });
    var post=function(path,body){
      return fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),credentials:'omit'})
        .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})});
    };
    // The server refuses a token younger than two seconds (it is the anti-bot check the Circle form needs).
    // A chat must not wait, so we fetch one ahead of time and keep it: it lives half an hour.
    var tok=null, tokAt=0;
    function freshToken(force){
      var age=(Date.now()-tokAt)/1000;
      if(!force&&tok&&age>3&&age<1500)return Promise.resolve(tok);
      return post('circle/token').then(function(t){
        if(!t.ok||!t.j.t)throw new Error('Please reload the page and try again.');
        tok=t.j.t; tokAt=Date.now();
        return age<3&&!force?new Promise(function(r){setTimeout(function(){r(tok)},2200)}):tok;
      });
    }
    freshToken();
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var q=(ta.value||'').trim(); if(!q)return;
      if(hints) hints.remove(), hints=null;
      bubble('me',q); hist.push({role:'user',text:q});
      ta.value=''; grow(); form.classList.add('busy');
      var wait=bubble('bot wait','…');
      freshToken().then(function(tk){
        return post('chat/ask',{messages:hist,token:tk,website:form.website.value});
      }).then(function(r){
        // a token can expire while the page is open: take a new one and ask again, once
        if(!r.ok&&r.j&&r.j.code==='token'){ return freshToken(true).then(function(tk){ return post('chat/ask',{messages:hist,token:tk,website:form.website.value}) }) }
        return r;
      }).then(function(r){
        form.classList.remove('busy');
        if(!r.ok||!r.j.text){ wait.classList.remove('wait'); wait.textContent=(r.j&&r.j.message)||'The concierge is not answering right now. Please write to us on WhatsApp: +62 813-3918-8754.'; return }
        wait.classList.remove('wait'); wait.textContent=r.j.text; hist.push({role:'model',text:r.j.text});
        if(hist.length>14)hist=hist.slice(-14);
      }).catch(function(x){
        form.classList.remove('busy'); wait.classList.remove('wait');
        wait.textContent=(x&&x.message)?x.message:'No connection. Please try again.';
      });
    });
  })();

  // 22.09.2026: развилка в кнопке брони. Открывается по клику, закрывается по Escape и кликом мимо.
  // Наведением не открываем: на телефоне наведения нет, а поведение должно быть одинаковым.
  (function(){
    var box=document.querySelector('[data-resv]'); if(!box)return;
    var btn=box.querySelector('.reserve'), menu=box.querySelector('.thp-resv-menu');
    function open(v){
      menu.hidden=!v; btn.setAttribute('aria-expanded',v?'true':'false');
      if(v){box.setAttribute('data-open','')}else{box.removeAttribute('data-open')}
    }
    btn.addEventListener('click',function(e){ e.preventDefault(); open(menu.hidden) });
    document.addEventListener('click',function(e){ if(!box.contains(e.target)) open(false) });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&!menu.hidden){open(false);btn.focus()} });
    menu.addEventListener('click',function(){ open(false) });
  })();

  // 21.09.2026: плавающая панель консьержа. Сам чат внутри инициализируется кодом выше — он ищет #thpChat
  // и не знает, видим ли он; поэтому здесь только открыть, закрыть и увести фокус в поле.
  (function(){
    var fab=document.getElementById('thpFab'), dock=document.getElementById('thpChatDock');
    if(!fab||!dock)return;
    var x=dock.querySelector('.thp-chat-x');
    function open(v){
      dock.hidden=!v; fab.setAttribute('aria-expanded',v?'true':'false'); fab.hidden=!!v;
      if(v){ var ta=dock.querySelector('textarea'); if(ta)ta.focus(); }
      else { fab.focus(); }
    }
    fab.addEventListener('click',function(){open(true)});
    if(x)x.addEventListener('click',function(){open(false)});
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&!dock.hidden)open(false) });
  })();

  var rm=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 20.09.2026: the figures in the facts row count up once, when they come into view. The text is only touched
  // inside animation frames, so without JS, or in a background tab, the final value simply stays as written.
  function countUp(el){
    var txt=el.textContent.trim(),m=txt.match(/^([\d.,]+)(.*)$/);if(!m)return;
    var raw=m[1],suffix=m[2],dec=(raw.split('.')[1]||'').length,target=parseFloat(raw.replace(/,/g,''));
    if(!isFinite(target))return;
    var comma=raw.indexOf(',')>-1,t0=null,dur=1400;
    el.style.minWidth=el.offsetWidth+'px';
    function fmt(v){var s=v.toFixed(dec);if(comma)s=s.replace(/\B(?=(\d{3})+(?!\d))/g,',');return s+suffix}
    function step(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/dur,1),e=1-Math.pow(1-p,3);el.textContent=p<1?fmt(target*e):txt;if(p<1)requestAnimationFrame(step)}
    requestAnimationFrame(step);
  }
  if(!rm){
    var nio=new IntersectionObserver(function(entries){
      entries.forEach(function(en){if(en.isIntersecting){nio.unobserve(en.target);countUp(en.target)}});
    },{threshold:0.6});
    document.querySelectorAll('.fact .n').forEach(function(el){if(/^[\d.,]+/.test(el.textContent.trim()))nio.observe(el)});
  }

  // 20.09.2026: the jungle drawings drift a little against the page on scroll. CSS reads --jy (see jungle-bg.css).
  if(!rm&&mqDesk.matches){
    var hosts=[].slice.call(document.querySelectorAll('.intro,.duo,.section.on-dark,.section.deep,.footer'));
    if(hosts.length){
      var ticking=false;
      var par=function(){
        ticking=false;var vh=window.innerHeight;
        hosts.forEach(function(h){
          var r=h.getBoundingClientRect();if(r.bottom<-160||r.top>vh+160)return;
          // p runs 0 → 1 while the section crosses the screen, from first pixel in to last pixel out
          var p=(vh-r.top)/(vh+r.height);p=Math.max(0,Math.min(1,p));var A=200;
          h.style.setProperty('--jup',(-A*p).toFixed(1)+'px');
          h.style.setProperty('--jdn',(A*(1-p)).toFixed(1)+'px');
          h.style.setProperty('--jy',((0.5-p)*100).toFixed(1)+'px');
        });
      };
      window.addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(par)}},{passive:true});
      par();
    }
  }

  // 20.09.2026: guest quotes rotate for real. Before this only the dots changed and there was a single quote.
  // Auto-advance every 10 s (was 7 s, the owner asked for slower, 20.09.2026); it pauses only while a dot has keyboard focus and while the tab is hidden.
  // With "reduce motion" there is no auto-advance, the dots still work.
  var qBox=document.getElementById('thpQuotes'),qDots=document.getElementById('thpQuoteDots');
  if(qBox&&qDots){
    var qItems=[].slice.call(qBox.querySelectorAll('.quote-item')),qBtns=[].slice.call(qDots.querySelectorAll('.dot'));
    var qi=0,qTimer=null,qHold=false;
    var qShow=function(n){
      qi=(n+qItems.length)%qItems.length;
      qItems.forEach(function(el,k){el.classList.toggle('on',k===qi);if(k===qi)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden','true')});
      qBtns.forEach(function(b,k){b.classList.toggle('on',k===qi);b.setAttribute('aria-current',k===qi?'true':'false')});
    };
    var qStart=function(){if(rm||qItems.length<2)return;clearInterval(qTimer);qTimer=setInterval(function(){if(!qHold&&!document.hidden)qShow(qi+1)},10000)};
    qBtns.forEach(function(b,k){b.addEventListener('click',function(e){qShow(k);qStart();if(e.detail>0)b.blur()})});
    var qSec=qBox.closest('section');
    // No pause on mouse hover: the block fills the screen, so the pointer is almost always over it and the quotes
    // never moved (found by the owner, 20.09.2026). The pause stays only for keyboard focus on the dots.
    qDots.addEventListener('focusin',function(e){var t=e.target;qHold=!!(t&&t.matches&&t.matches(':focus-visible'))});
    qDots.addEventListener('focusout',function(){qHold=false});
    var sx=null;
    qSec.addEventListener('touchstart',function(e){sx=e.touches[0].clientX},{passive:true});
    qSec.addEventListener('touchend',function(e){if(sx===null)return;var dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>40){qShow(qi+(dx<0?1:-1));qStart()}},{passive:true});
    qStart();
  }
})();
