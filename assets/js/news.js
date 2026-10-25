/* Launchpad Digital: Florida news by county. Reads static JSON built by a scheduled job. */
(function(){
  var D='/news/data/', state={tab:'local',county:'',lat:null,lon:null}, statewide=null, cache={};
  var $=function(id){return document.getElementById(id)};
  var list=$('nw-list'),status=$('nw-status'),asof=$('nw-asof'),sel=$('nw-county'),wx=$('nw-weather'),outlets=$('nw-outlets');
  var slug=function(c){return c.toLowerCase().replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'')};
  var esc=function(s){return String(s||'').replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var fmt=function(d){if(!d)return'';var t=new Date(d),h=(Date.now()-t)/36e5;
    if(h<1)return'Just now';if(h<24)return Math.round(h)+'h ago';
    return t.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/New_York'})};
  var getJSON=function(u){return fetch(u,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})};
  // Florida counties set for validation
  var counties=[].map.call(sel.options,function(o){return o.value}).filter(Boolean);
  function setStatus(h){status.innerHTML=h}
  function card(it,regional){
    var b='';if(state.county&&state.tab==='local'){b=it.m?'<span class="nw-badge">'+esc(state.county)+' County</span>':'<span class="nw-badge reg">Regional</span>'}
    return '<article class="nw-item"><div class="nw-meta"><span class="src">'+esc(it.s)+'</span>'+(it.d?'<time datetime="'+esc(it.d)+'">'+fmt(it.d)+'</time>':'')+b+'</div>'+
      '<h3><a href="'+esc(it.u)+'" rel="noopener" target="_blank">'+esc(it.t)+'</a></h3>'+(it.x?'<p>'+esc(it.x)+'</p>':'')+'</article>'}
  function render(){
    [].forEach.call(document.querySelectorAll('.nw-tabs button'),function(b){b.setAttribute('aria-selected',b.dataset.tab===state.tab)});
    wx.hidden=state.tab!=='weather'; if(state.tab==='weather')loadWeather();
    outlets.hidden=true;
    var p=state.county?loadCounty(state.county):Promise.resolve(null);
    p.then(function(cj){
      var items=[],label;
      if(!statewide){return}
      if(state.tab==='local'){
        if(cj){items=cj.items;label=state.county+' County headlines from '+cj.feeds.length+' regional and local outlets';
          showOutlets(cj)}
        else{items=statewide.sections.statewide;label='Statewide headlines. Enter your location or pick a county for local news'}
      }else{
        items=statewide.sections[state.tab]||[];
        if(cj&&state.tab!=='politics'){var loc=cj.items.filter(function(i){return i.c&&i.c.indexOf(state.tab)>-1});
          var seen={};items=loc.concat(items).filter(function(i){if(seen[i.u])return false;return seen[i.u]=true}).slice(0,40)}
        label={politics:'Florida politics, from outlets across the spectrum, newest first',budgeting:'Money, taxes, insurance and cost of living',crime:'Crime and public safety',weather:'Weather headlines'}[state.tab]+(cj&&state.tab!=='politics'?' (stories mentioning '+state.county+' County first)':'');
      }
      asof.textContent=label+' · updated '+fmt(statewide.generated);
      list.innerHTML=items.length?items.map(function(i){return card(i)}).join(''):'<p class="nw-empty">No recent headlines in this category right now. Check back soon.</p>';
    })}
  function showOutlets(cj){
    var f=cj.feeds||[];
    outlets.innerHTML='<h2>Outlets covering '+esc(cj.county)+' County on this page</h2><ul>'+f.map(function(x){return'<li><a href="'+esc(x.home)+'" rel="noopener" target="_blank">'+esc(x.name)+'</a></li>'}).join('')+'</ul>'+
      (cj.items.filter(function(i){return i.m}).length<5?'<p class="small-note">Few stories right now mention '+esc(cj.county)+' County by name, so we also show regional stories from the outlets above. Your county government and sheriff\'s websites post official notices.</p>':'');
    outlets.hidden=false}
  function loadCounty(c){if(cache[c])return Promise.resolve(cache[c]);
    return getJSON(D+'county/'+slug(c)+'.json').then(function(j){return cache[c]=j}).catch(function(){return null})}
  function setCounty(c,how){
    state.county=c;sel.value=c;
    try{c?localStorage.setItem('lp-news-county',JSON.stringify({c:c,lat:state.lat,lon:state.lon})):localStorage.removeItem('lp-news-county')}catch(e){}
    setStatus(c?'Showing news for <strong>'+esc(c)+' County</strong>'+(how?' ('+esc(how)+')':'')+'.':'Showing statewide news.');
    render()}
  function countyFrom(addr){
    if(!addr||addr.state!=='Florida')return null;
    var c=(addr.county||'').replace(/ County$/,'');
    if(c==='Miami-Dade'||/Dade/.test(c))c='Miami-Dade';
    if(!c&&addr.city==='Jacksonville')c='Duval';
    return counties.indexOf(c)>-1?c:null}
  var NOM='https://nominatim.openstreetmap.org/';
  $('nw-loc').addEventListener('submit',function(e){e.preventDefault();
    var q=$('nw-q').value.trim();if(!q)return;
    if(!/\bfl(orida)?\b/i.test(q))q+=', Florida';
    setStatus('Looking up your county…');
    getJSON(NOM+'search?format=jsonv2&addressdetails=1&countrycodes=us&limit=1&q='+encodeURIComponent(q)).then(function(r){
      var h=r[0],c=h&&countyFrom(h.address);
      if(!c){setStatus('We couldn\'t match that to a Florida county. Try a city name or ZIP code, or choose your county from the list.');return}
      state.lat=+h.lat;state.lon=+h.lon;setCounty(c,'from "'+$('nw-q').value.trim()+'"')
    }).catch(function(){setStatus('Location lookup is unavailable right now. Please choose your county from the list.')})});
  $('nw-geo').addEventListener('click',function(){
    if(!navigator.geolocation){setStatus('Your browser can\'t share location. Choose your county from the list.');return}
    setStatus('Getting your location…');
    navigator.geolocation.getCurrentPosition(function(p){
      state.lat=p.coords.latitude;state.lon=p.coords.longitude;
      getJSON(NOM+'reverse?format=jsonv2&zoom=10&addressdetails=1&lat='+state.lat+'&lon='+state.lon).then(function(r){
        var c=countyFrom(r.address);if(!c){setStatus('You appear to be outside Florida. Showing statewide news; you can pick a county below.');setCounty('');return}
        setCounty(c,'from your location')}).catch(function(){setStatus('Location lookup is unavailable. Choose your county from the list.')})
    },function(){setStatus('Location permission was denied. Enter a city or ZIP, or choose your county.')},{timeout:10000,maximumAge:6e5})});
  sel.addEventListener('change',function(){state.lat=null;state.lon=null;setCounty(sel.value,'')});
  [].forEach.call(document.querySelectorAll('.nw-tabs button'),function(b){b.addEventListener('click',function(){state.tab=b.dataset.tab;
    try{history.replaceState(null,'','#'+state.tab)}catch(e){}render()})});
  // Weather from api.weather.gov (CORS-enabled, free, no key)
  var NWS='https://api.weather.gov/';
  function loadWeather(){
    var key=state.county+'|'+state.lat;if(wx.dataset.key===key)return;wx.dataset.key=key;
    wx.innerHTML='<p class="small-note">Loading National Weather Service alerts…</p>';
    var aUrl=state.lat!=null?NWS+'alerts/active?point='+state.lat.toFixed(4)+','+state.lon.toFixed(4):NWS+'alerts/active?area=FL';
    var alerts=getJSON(aUrl).then(function(j){var f=j.features||[];
      if(state.county&&state.lat==null)f=f.filter(function(x){return(x.properties.areaDesc||'').indexOf(state.county)>-1});
      return f}).catch(function(){return null});
    var fc=state.lat!=null?getJSON(NWS+'points/'+state.lat.toFixed(4)+','+state.lon.toFixed(4)).then(function(p){return getJSON(p.properties.forecast)}).then(function(f){return f.properties.periods.slice(0,6)}).catch(function(){return null}):Promise.resolve(null);
    Promise.all([alerts,fc]).then(function(r){
      var a=r[0],p=r[1],where=state.county?state.county+' County':'Florida',h='';
      if(a===null)h+='<p class="small-note">NWS alerts are unavailable right now. See <a href="https://www.weather.gov" rel="noopener">weather.gov</a>.</p>';
      else if(!a.length)h+='<p class="small-note">No active National Weather Service alerts for '+esc(where)+'.</p>';
      else h+=a.slice(0,8).map(function(x){var q=x.properties;return'<div class="nw-alert"><h3>'+esc(q.event)+'</h3><p>'+esc(q.headline||'')+'</p><p><a href="'+esc(q['@id']||'https://alerts.weather.gov')+'" rel="noopener" target="_blank">Full NWS alert</a></p></div>'}).join('');
      if(p)h+='<div class="nw-fc">'+p.map(function(x){return'<div><strong>'+esc(x.name)+'</strong><span class="temp">'+esc(x.temperature)+'°'+esc(x.temperatureUnit)+'</span>'+esc(x.shortForecast)+'</div>'}).join('')+'</div><p class="small-note">Forecast: National Weather Service for your location.</p>';
      else if(state.county)h+='<p class="small-note">Enter your city or ZIP above for a local NWS forecast.</p>';
      wx.innerHTML=h})}
  // init
  var t=(location.hash||'').slice(1);if(['local','politics','budgeting','crime','weather'].indexOf(t)>-1)state.tab=t;
  try{var s=JSON.parse(localStorage.getItem('lp-news-county')||'null');if(s&&counties.indexOf(s.c)>-1){state.county=s.c;state.lat=s.lat;state.lon=s.lon;sel.value=s.c;setStatus('Showing news for <strong>'+esc(s.c)+' County</strong> (saved on this device).')}}catch(e){}
  getJSON(D+'statewide.json').then(function(j){statewide=j;render()}).catch(function(){asof.textContent='Headlines are temporarily unavailable.'});
})();
