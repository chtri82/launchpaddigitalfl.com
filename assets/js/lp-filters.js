/* Launchpad reader filters: date (+ optional category). State lives in the URL: ?range=7|from=&to=&cat= */
(function(){
var box=document.getElementById('lp-filters'); if(!box) return;
var grid=document.querySelector(box.getAttribute('data-target')); if(!grid) return;
var cats=box.getAttribute('data-cats'); cats=cats?JSON.parse(cats):null;
var cards=[].slice.call(grid.querySelectorAll('[data-date]'));
function ymd(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
var h='<div class="lpf-row"><label>Date <select id="lpf-range"><option value="all">All dates</option><option value="1">Today</option><option value="3">Last 3 days</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range…</option></select></label>'
+'<span id="lpf-custom" hidden><label>From <input type="date" id="lpf-from"></label><label>To <input type="date" id="lpf-to"></label></span>';
if(cats){h+='<label>Section <select id="lpf-cat"><option value="">All sections</option>';cats.forEach(function(c){h+='<option value="'+c[0]+'">'+c[1]+'</option>';});h+='</select></label>';}
h+='<button type="button" class="btn btn-sm" id="lpf-reset">Reset</button></div><p class="lpf-count" id="lpf-count" aria-live="polite"></p><p class="note" id="lpf-none" hidden>No stories match these filters. Try a wider date range or another section.</p>';
box.innerHTML=h;
var R=document.getElementById('lpf-range'),F=document.getElementById('lpf-from'),T=document.getElementById('lpf-to'),C=document.getElementById('lpf-cat'),CU=document.getElementById('lpf-custom');
var q=new URLSearchParams(location.search);
if(q.get('from')||q.get('to')){R.value='custom';F.value=q.get('from')||'';T.value=q.get('to')||'';}
else if(q.get('range')&&R.querySelector('option[value="'+q.get('range')+'"]')) R.value=q.get('range');
if(C&&q.get('cat')) C.value=q.get('cat');
function apply(push){
  CU.hidden=R.value!=='custom';
  var from='',to='',now=new Date();
  if(R.value==='custom'){from=F.value;to=T.value;}
  else if(R.value!=='all'){var d=new Date(now);d.setDate(d.getDate()-(parseInt(R.value,10)-1));from=ymd(d);to=ymd(now);}
  var cat=C?C.value:'',n=0;
  cards.forEach(function(el){
    var dd=ymd(new Date(el.getAttribute('data-date'))),ok=true;
    if(from&&dd<from) ok=false; if(to&&dd>to) ok=false;
    if(cat&&('|'+el.getAttribute('data-category')+'|').indexOf('|'+cat+'|')<0) ok=false;
    el.classList.toggle('lpf-hide',!ok); if(ok&&!el.hidden&&el.style.display!=='none') n++;
  });
  document.getElementById('lpf-count').textContent='Showing '+n+' '+(n===1?'story':'stories');
  document.getElementById('lpf-none').hidden=n>0;
  if(push){var p=new URLSearchParams(location.search);['range','from','to','cat'].forEach(function(k){p.delete(k);});
    if(R.value==='custom'){if(from)p.set('from',from);if(to)p.set('to',to);}else if(R.value!=='all')p.set('range',R.value);
    if(cat)p.set('cat',cat);var s=p.toString();history.replaceState(null,'',location.pathname+(s?'?'+s:'')+location.hash);}
}
[R,F,T,C].forEach(function(x){if(x)x.addEventListener('change',function(){apply(true);});});
document.getElementById('lpf-reset').addEventListener('click',function(){R.value='all';F.value='';T.value='';if(C)C.value='';apply(true);});
apply(false);
new MutationObserver(function(){apply(false);}).observe(grid,{attributes:true,subtree:true,attributeFilter:['hidden','style']});
})();
