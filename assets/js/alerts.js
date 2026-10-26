/* Launchpad live Florida alerts: official NWS alerts (api.weather.gov, free, no key). Auto-posted; dismissible per alert. */
(function(){
var URL=window.LP_ALERTS_URL||'https://api.weather.gov/alerts/active?area=FL',DKEY='lp_alert_dismissed',KW=/Hurricane|Tropical Storm|Storm Surge|Tornado Warning|Flash Flood Warning|Evacuation/i;
var css='.lp-alerts{margin:0 0 1rem}.lp-alerts[hidden]{display:none}.lp-alert{position:relative;background:#FFF4EE;border:1px solid var(--orange,#CD4B22);border-left:6px solid var(--orange,#CD4B22);border-radius:12px;padding:.8rem 2.6rem .8rem 1rem;margin:0 0 .6rem;color:var(--ink,#0E1630);font-size:.95rem;line-height:1.4}.lp-alert.ex{border-left-color:#B00020}.lp-alert .lbl{display:block;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--orange-ink,#A63A16)}.lp-alert h3{margin:.15rem 0 .25rem;font-size:1.05rem}.lp-alert ul{margin:.25rem 0;padding-left:1.1rem}.lp-alert li{margin:.2rem 0}.lp-alert a{color:var(--orange-ink,#A63A16);font-weight:600}.lp-alert .t{color:var(--muted,#4A5068);font-size:.85rem}.lp-alert .x{position:absolute;top:.4rem;right:.4rem;background:none;border:0;font-size:1.4rem;line-height:1;cursor:pointer;color:var(--muted,#4A5068);padding:.3rem .5rem;min-width:44px;min-height:44px}.lp-alerts.slim{margin:0}.lp-alerts.slim .lp-alert{border-radius:0;margin:0;border-width:0 0 1px;padding:.5rem 2.8rem .5rem 1rem;font-size:.88rem}.lp-alerts.slim .lp-alert h3{display:inline;font-size:.9rem;margin-right:.4rem}.lp-alerts.slim .lp-alert .lbl{display:inline;margin-right:.4rem}';
function el(t,a,x){var e=document.createElement(t);if(a)for(var k in a)e.setAttribute(k,a[k]);if(x!=null)e.textContent=x;return e}
function get(k,d){try{return JSON.parse(localStorage.getItem(k)||'null')||d}catch(e){return d}}
function fmt(s){if(!s)return '';try{return new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET'}catch(e){return s}}
function mine(){return get('lp_news_locations',[]).map(function(l){return (l&&l.county||'').toLowerCase()}).filter(Boolean)}
function hits(area,cs){area=(area||'').toLowerCase();return cs.some(function(c){return area.indexOf(c)>=0})}
var OFF={MLB:1,MFL:1,TBW:1,JAX:1,TAE:1,KEY:1,MOB:1};
function link(p){if(/Hurricane|Tropical|Storm Surge/i.test(p.event||''))return 'https://www.nhc.noaa.gov/';var a=(p.parameters&&p.parameters.AWIPSidentifier||[])[0]||'',o=a.slice(-3).toUpperCase();return OFF[o]?'https://www.weather.gov/'+o.toLowerCase()+'/':'https://www.weather.gov/'}
var hosts=[];
function setup(){var s=el('style');s.textContent=css;document.head.appendChild(s);
  var full=document.querySelectorAll('[data-lp-alerts]');
  if(full.length){for(var i=0;i<full.length;i++)hosts.push({el:full[i],slim:false})}
  else{var m=document.getElementById('main');if(m){var d=el('div');m.insertBefore(d,m.firstChild);hosts.push({el:d,slim:true})}}
  hosts.forEach(function(h){h.el.className='lp-alerts'+(h.slim?' slim':'');h.el.hidden=true;h.el.setAttribute('role','region');h.el.setAttribute('aria-label','Official weather alerts')});
  if(hosts.length){load();setInterval(load,300000)}}
var last=[];
function load(){fetch(URL,{headers:{Accept:'application/geo+json'}}).then(function(r){return r.ok?r.json():{features:[]}}).then(function(j){last=(j&&j.features)||[];render()}).catch(function(){})}
function render(){var dis=get(DKEY,{}),now=Date.now(),cs=mine(),groups={},order=[];
  last.forEach(function(f){var p=f.properties||{};if(!p.event)return;
    if(!(p.severity==='Severe'||p.severity==='Extreme'||KW.test(p.event)))return;
    var ex=p.expires||p.ends;if(ex&&Date.parse(ex)<now)return;var id=p.id||f.id;if(dis[id])return;
    if(!groups[p.event]){groups[p.event]={event:p.event,items:[],ex:false,local:false};order.push(p.event)}
    var g=groups[p.event];g.items.push({id:id,area:p.areaDesc,url:link(p),office:p.senderName||'National Weather Service',sent:p.sent||p.effective,ex:ex});if(p.severity==='Extreme')g.ex=true;if(hits(p.areaDesc,cs))g.local=true});
  var gs=order.map(function(k){return groups[k]});
  gs.sort(function(a,b){return (b.local-a.local)||(b.ex-a.ex)});
  gs.forEach(function(g){g.items.sort(function(a,b){return hits(b.area,cs)-hits(a.area,cs)})});
  hosts.forEach(function(h){var box=h.el;box.innerHTML='';
    gs.forEach(function(g){var c=el('div',{'class':'lp-alert'+(g.ex?' ex':'')});
      c.appendChild(el('span',{'class':'lbl'},'Official alert from the National Weather Service'+(g.local?' · Your area':'')));
      c.appendChild(el('h3',null,g.event));
      var list=h.slim?g.items.slice(0,1):g.items,ul=el('ul');
      list.forEach(function(it){var li=el('li');li.appendChild(el('span',null,it.area+' '));var a=el('a',{href:it.url,target:'_blank',rel:'noopener'},(it.url.indexOf('nhc')>0?'National Hurricane Center':it.office));li.appendChild(a);
        li.appendChild(el('div',{'class':'t'},'Issued '+fmt(it.sent)+(it.ex?' · Expires '+fmt(it.ex):'')));ul.appendChild(li)});
      if(h.slim&&g.items.length>1){var mo=el('li');mo.appendChild(el('a',{href:'/news/'},'+'+(g.items.length-1)+' more areas'));ul.appendChild(mo)}
      c.appendChild(ul);
      var x=el('button',{type:'button','class':'x','aria-label':'Dismiss '+g.event},'×');
      x.addEventListener('click',function(){var d=get(DKEY,{});g.items.forEach(function(i){d[i.id]=Date.now()});try{localStorage.setItem(DKEY,JSON.stringify(d))}catch(e){}render()});
      c.appendChild(x);box.appendChild(c)});
    box.hidden=!gs.length})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
