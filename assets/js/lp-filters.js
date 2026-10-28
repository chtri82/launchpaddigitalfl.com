/* Launchpad reader filters: date (+ optional category). State lives in the URL: ?range=7|from=&to=&cat= */
(function(){
var box=document.getElementById('lp-filters'); if(!box) return;
var grid=document.querySelector(box.getAttribute('data-target')); if(!grid) return;
var cats=box.getAttribute('data-cats'); cats=cats?JSON.parse(cats):null;
var locs=box.getAttribute('data-locs'); locs=locs?JSON.parse(locs):null;
var LN={'Central':'Central FL','South':'South FL','North':'North FL'};
var cards=[].slice.call(grid.querySelectorAll('[data-date]'));
function ymd(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
var h='<div class="lpf-row"><label>Date <select id="lpf-range"><option value="all">All dates</option><option value="1">Today</option><option value="3">Last 3 days</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range…</option></select></label>'
+'<span id="lpf-custom" hidden><label>From <input type="date" id="lpf-from"></label><label>To <input type="date" id="lpf-to"></label></span>';
if(cats){h+='<label>Section <select id="lpf-cat"><option value="">All sections</option>';cats.forEach(function(c){h+='<option value="'+c[0]+'">'+c[1]+'</option>';});h+='</select></label>';}
var RM=locs?JSON.parse(box.getAttribute('data-rmap')||'{}'):{},C2R={};Object.keys(RM).forEach(function(r){RM[r].forEach(function(c){C2R[c]=r;});});
if(locs){h+='<label>Location <select id="lpf-loc"><option value="">All locations</option><optgroup label="Regions">';locs.forEach(function(c){h+='<option value="'+c+'">'+(LN[c]||c)+'</option>';});
h+='</optgroup><optgroup label="Counties">';Object.keys(C2R).sort().forEach(function(c){h+='<option value="county:'+c+'">'+c+' County</option>';});h+='</optgroup></select></label>';
h+='<label class="lpf-zipl">or ZIP <input id="lpf-zip" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" placeholder="e.g. 33602" autocomplete="postal-code"></label>';}
h+='<button type="button" class="btn btn-sm" id="lpf-reset">Reset</button></div><p class="lpf-zipmsg" id="lpf-zipmsg" hidden></p><p class="lpf-count" id="lpf-count" aria-live="polite"></p><p class="note" id="lpf-none" hidden>No stories match these filters. Try a wider date range or another section.</p>';
box.innerHTML=h;
var R=document.getElementById('lpf-range'),F=document.getElementById('lpf-from'),T=document.getElementById('lpf-to'),C=document.getElementById('lpf-cat'),L=document.getElementById('lpf-loc'),Z=document.getElementById('lpf-zip'),ZM=document.getElementById('lpf-zipmsg'),zipRegs=null,GEO=null,CU=document.getElementById('lpf-custom');
var q=new URLSearchParams(location.search);
if(q.get('from')||q.get('to')){R.value='custom';F.value=q.get('from')||'';T.value=q.get('to')||'';}
else if(q.get('range')&&R.querySelector('option[value="'+q.get('range')+'"]')) R.value=q.get('range');
if(C&&q.get('cat')) C.value=q.get('cat');
if(L&&q.get('loc')) L.value=q.get('loc');
if(Z&&q.get('zip')) Z.value=q.get('zip');
function apply(push){
  CU.hidden=R.value!=='custom';
  var from='',to='',now=new Date();
  if(R.value==='custom'){from=F.value;to=T.value;}
  else if(R.value!=='all'){var d=new Date(now);d.setDate(d.getDate()-(parseInt(R.value,10)-1));from=ymd(d);to=ymd(now);}
  var cat=C?C.value:'',loc=L?L.value:'',n=0;
  cards.forEach(function(el){
    var dd=ymd(new Date(el.getAttribute('data-date'))),ok=true;
    if(from&&dd<from) ok=false; if(to&&dd>to) ok=false;
    if(cat&&('|'+el.getAttribute('data-category')+'|').indexOf('|'+cat+'|')<0) ok=false;
    if(zipRegs){var er=('|'+(el.getAttribute('data-region')||'')+'|');if(!zipRegs.some(function(r){return er.indexOf('|'+r+'|')>=0;})) ok=false;}
    else if(loc.indexOf('county:')===0){if(('|'+(el.getAttribute('data-counties')||'')+'|').indexOf('|'+loc.slice(7)+'|')<0) ok=false;}
    else if(loc&&('|'+(el.getAttribute('data-region')||'')+'|').indexOf('|'+loc+'|')<0) ok=false;
    el.classList.toggle('lpf-hide',!ok); if(ok&&!el.hidden&&el.style.display!=='none') n++;
  });
  document.getElementById('lpf-count').textContent='Showing '+n+' '+(n===1?'story':'stories');
  document.getElementById('lpf-none').hidden=n>0;
  if(push){var p=new URLSearchParams(location.search);['range','from','to','cat','loc','zip'].forEach(function(k){p.delete(k);});
    if(R.value==='custom'){if(from)p.set('from',from);if(to)p.set('to',to);}else if(R.value!=='all')p.set('range',R.value);
    if(cat)p.set('cat',cat);if(zipRegs)p.set('zip',Z.value);else if(loc)p.set('loc',loc);var s=p.toString();history.replaceState(null,'',location.pathname+(s?'?'+s:'')+location.hash);}
}
if(L)L.addEventListener('change',function(){if(Z){Z.value='';zipRegs=null;ZM.hidden=true;}});
[R,F,T,C,L].forEach(function(x){if(x)x.addEventListener('change',function(){apply(true);});});
document.getElementById('lpf-reset').addEventListener('click',function(){R.value='all';F.value='';T.value='';if(C)C.value='';if(L)L.value='';if(Z){Z.value='';zipRegs=null;ZM.hidden=true;}apply(true);});
function doZip(push){var v=(Z.value||'').trim();if(!v){zipRegs=null;ZM.hidden=true;apply(push);return;}
 function go(){var cs=/^[0-9]{5}$/.test(v)&&GEO.zips[v];
  if(!cs){zipRegs=null;ZM.textContent='That isn\u2019t a Florida ZIP code we recognize.';ZM.hidden=false;apply(push);return;}
  var rs=[];cs.forEach(function(c){var r=C2R[c];if(r&&rs.indexOf(r)<0)rs.push(r);});zipRegs=rs;L.value='';
  ZM.textContent='ZIP '+v+': '+cs.join(', ')+(cs.length>1?' counties':' County')+' \u00b7 showing '+rs.map(function(r){return LN[r]||r;}).join(', ')+' stories';ZM.hidden=false;apply(push);}
 if(GEO)go();else fetch('/assets/data/fl-geo.json').then(function(r){return r.json();}).then(function(j){GEO=j;go();}).catch(function(){ZM.textContent='ZIP lookup is unavailable right now.';ZM.hidden=false;});}
if(Z){Z.addEventListener('change',function(){doZip(true);});Z.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();doZip(true);}});}
apply(false);if(Z&&Z.value)doZip(false);
new MutationObserver(function(){apply(false);}).observe(grid,{attributes:true,subtree:true,attributeFilter:['hidden','style']});
})();
