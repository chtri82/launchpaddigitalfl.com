// Launchpad Digital — small progressive enhancements. No tracking, no third-party scripts.
// ONE PLACE TO CHANGE: Launchpad Digital's own newsletter signup URL.
// Until it's set, every [data-lp-subscribe] link falls back to its /subscribe/ href.
var LAUNCHPAD_SUBSCRIBE_URL = '/subscribe/#launchpad'; // our own signup form (self-hosted newsletter)
// Self-owned newsletter backend (Cloudflare Worker in lp-newsletter). Set to the Worker's public URL at go-live.
var LAUNCHPAD_NEWSLETTER_API = (location.hostname==='localhost'||location.hostname==='127.0.0.1') ? 'http://localhost:8787' : 'https://news-api.launchpaddigitalfl.com';
(function(){
  document.documentElement.classList.remove('no-js');
  if(LAUNCHPAD_SUBSCRIBE_URL){document.querySelectorAll('[data-lp-subscribe]').forEach(function(a){a.href=LAUNCHPAD_SUBSCRIBE_URL;});}
  // Newsletter signup form
  var nf=document.querySelector('[data-lp-newsletter-form]');
  if(nf){
    nf.action=LAUNCHPAD_NEWSLETTER_API+'/api/subscribe';
    var msg=nf.querySelector('.lp-msg'), all=nf.querySelector('[data-lp-all]');
    if(all)all.addEventListener('click',function(){var bs=nf.querySelectorAll('input[name=sections]'),on=[].some.call(bs,function(b){return !b.checked;});[].forEach.call(bs,function(b){b.checked=on;});all.textContent=on?'Clear all':'Select all';});
    var st=new URLSearchParams(location.search).get('status');
    if(st&&msg)msg.textContent=st==='check-email'?'Almost done! Check your email and click the link to confirm.':'Something went wrong. Please try again.';
    nf.addEventListener('submit',function(e){
      e.preventDefault();
      if(!nf.email.value||!nf.email.checkValidity()){msg.textContent='Please enter a valid email address.';nf.email.focus();return;}
      var b=nf.querySelector('[type=submit]');b.disabled=true;msg.textContent='Sending…';
      fetch(nf.action,{method:'POST',body:new FormData(nf),headers:{'Accept':'application/json'}})
        .then(function(r){return r.json();})
        .then(function(d){msg.textContent=d.message||(d.ok?'Check your email to confirm.':'Something went wrong.');if(d.ok)nf.reset();})
        .catch(function(){msg.textContent='Could not reach the signup service. Please try again later.';})
        .then(function(){b.disabled=false;});
    });
  }
  // ZIP -> county -> cities (Census 2020 data bundled at /assets/data/fl-geo.json)
  var loc=document.querySelector('[data-lp-loc]');
  if(loc){
    var zip=loc.querySelector('[name=zip]'),cw=loc.querySelector('[data-lp-loc-county]'),cs=cw.querySelector('select'),cities=loc.querySelector('[data-lp-loc-cities]'),geo=null;
    var esc=function(t){return String(t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
    var showCities=function(c){
      if(!c){cities.hidden=true;cities.innerHTML='';return;}
      cities.innerHTML='<label class="lp-check"><input type="checkbox" name="cities" value="all" checked> All of '+esc(c)+' County</label><p style="margin:.5rem 0 .25rem">Or only these cities and towns:</p><div class="lp-grid">'+(geo.places[c]||[]).map(function(p){return '<label class="lp-check"><input type="checkbox" name="cities" value="'+esc(p.name)+'"> '+esc(p.name)+(p.incorporated?'':' <small>(unincorporated)</small>')+'</label>';}).join('')+'</div>';
      cities.hidden=false;
      var all=cities.querySelector('[value=all]');
      cities.addEventListener('change',function(e){if(e.target===all){if(all.checked)[].forEach.call(cities.querySelectorAll('[name=cities]:not([value=all])'),function(b){b.checked=false;});}else if(e.target.checked){all.checked=false;}else if(!cities.querySelector('[name=cities]:not([value=all]):checked')){all.checked=true;}});
    };
    var lookup=function(){
      var z=zip.value.trim();
      if(!/^\d{5}$/.test(z)){cw.hidden=true;cs.innerHTML='';showCities(null);return;}
      var go=function(){var cs_=geo.zips[z]||[];
        if(!cs_.length){cw.hidden=true;cs.innerHTML='';cities.innerHTML='<p>We couldn\'t find that ZIP in Florida. You\'ll get statewide local news.</p>';cities.hidden=false;return;}
        cs.innerHTML=cs_.map(function(c){return '<option>'+esc(c)+'</option>';}).join('');cw.hidden=cs_.length<2;showCities(cs_[0]);};
      if(geo)go();else fetch('/assets/data/fl-geo.json').then(function(r){return r.json();}).then(function(d){geo=d;go();});
    };
    zip.addEventListener('input',lookup);cs.addEventListener('change',function(){showCities(cs.value);});
  }
  // Mobile nav
  var t=document.querySelector('.menu-toggle'), m=document.getElementById('primary-nav');
  if(t&&m){
    t.addEventListener('click',function(){var o=m.classList.toggle('open');t.setAttribute('aria-expanded',o);});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&m.classList.contains('open')){m.classList.remove('open');t.setAttribute('aria-expanded','false');t.focus();}});
  }
  // Header shadow + back-to-top
  var h=document.querySelector('.site-header'), top=document.querySelector('.to-top');
  function onScroll(){var y=window.scrollY>12;if(h)h.classList.toggle('scrolled',y);if(top)top.classList.toggle('show',window.scrollY>600);}
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();
  if(top)top.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
  // Reveal on scroll
  var els=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12});
    els.forEach(function(el){io.observe(el);});
  } else els.forEach(function(el){el.classList.add('in');});
  // Copy email
  document.querySelectorAll('[data-copy]').forEach(function(b){
    b.addEventListener('click',function(){
      var v=b.getAttribute('data-copy');
      if(navigator.clipboard){navigator.clipboard.writeText(v).then(function(){b.setAttribute('data-copied','');var o=b.textContent;b.textContent='Copied!';setTimeout(function(){b.textContent=o;b.removeAttribute('data-copied');},1800);});}
    });
  });
  // Filter chips (Articles) — filters entries in [data-entries] by data-topic
  document.querySelectorAll('.filters').forEach(function(f){
    var list=document.querySelector(f.getAttribute('data-target'));
    f.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;
      f.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b);});
      if(!list)return;var topic=b.getAttribute('data-topic');
      list.querySelectorAll('[data-topic]').forEach(function(it){it.hidden=!(topic==='all'||it.getAttribute('data-topic').split(' ').indexOf(topic)>-1);});
    });
  });
  // Year
  document.querySelectorAll('[data-year]').forEach(function(y){y.textContent=new Date().getFullYear();});
})();
