// Launchpad Digital — small progressive enhancements. No tracking, no third-party scripts.
// ONE PLACE TO CHANGE: Launchpad Digital's own newsletter signup URL.
// Until it's set, every [data-lp-subscribe] link falls back to its /subscribe/ href.
var LAUNCHPAD_SUBSCRIBE_URL = ''; // e.g. 'https://YOUR-SIGNUP-URL'
(function(){
  document.documentElement.classList.remove('no-js');
  if(LAUNCHPAD_SUBSCRIBE_URL){document.querySelectorAll('[data-lp-subscribe]').forEach(function(a){a.href=LAUNCHPAD_SUBSCRIBE_URL;});}
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
