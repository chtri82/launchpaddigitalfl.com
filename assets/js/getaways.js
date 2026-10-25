(function(){
  var f=document.getElementById('ga-finder'); if(!f) return;
  var GAS=4.108, MPG=25, DEF={lat:28.54,lon:-81.38,label:'Orlando',def:1}; // Orlando: Wikipedia coords 28°32′24″N 81°22′48″W
  var KEY='lp-ga-origin'; // AAA Florida regular avg 10/25/2026; assumed mpg. Disclosed in fine print.
  var data=JSON.parse(document.getElementById('ga-data').textContent), byId={};
  data.forEach(function(d){byId[d.id]=d;});
  var grid=document.getElementById('ga-grid'), st=document.getElementById('ga-status'), loc=document.getElementById('ga-loc'),
      sortSel=document.getElementById('ga-sort'), gn=document.getElementById('ga-n'), kn=document.getElementById('ga-kn'), kb=document.getElementById('ga-kids'),
      cards=[].slice.call(grid.querySelectorAll('.ga-card')), origin=null, busy=false, last=0;
  cards.forEach(function(c){c._g=byId[c.dataset.id];});
  function n(i){var v=parseInt(i.value,10);return isNaN(v)||v<0?0:Math.min(v,20);}
  function hav(a,b,c,d){var R=3958.8,r=Math.PI/180,x=Math.sin((c-a)*r/2),y=Math.sin((d-b)*r/2);return 2*R*Math.asin(Math.sqrt(x*x+Math.cos(a*r)*Math.cos(c*r)*y*y));}
  function fT(m){var h=Math.floor(m/60),mm=Math.round(m%60);return (h?h+' h ':'')+mm+' min';}
  function money(v){return '$'+(Math.round(v*100)/100).toFixed(v%1?2:0);}
  function fit(g,K){
    var s=0,why=[],f=g.fit;
    if(K){if(f.kids){s+=2;why.push(f.kids);} if(f.infants){s+=1;if(!f.kids)why.push(f.infants);} if(!f.kids&&!f.infants) s-=1;}
    else {if(f.adults){s+=2;why.push(f.adults);} if(f.arts) s+=1;}
    return {s:s,why:why};
  }
  function render(){
    var v=parseInt(gn.value,10), A=isNaN(v)||v<1?2:Math.min(v,20), C=kn?Math.min(n(kn),20):0, K=kb.checked||C>0;
    cards.forEach(function(c){
      var g=c._g, ft=fit(g,K), p=c.querySelector('.ga-fit');
      c._fit=ft.s; p.hidden=!ft.why.length; p.className='ga-fit'+(ft.s>=2?' top':''); p.textContent=ft.why.join('. ')+(ft.why.length?'.':'');
      if(!origin) return;
      var d=c._d, miles=d.road||d.line*1.25, fuel=miles*2/MPG*GAS, adm=g.adm?A*g.adm[0]+C*g.adm[1]:0, tot=fuel+adm+g.veh;
      c._tot=tot;
      var q=function(k){return c.querySelector('[data-f="'+k+'"]');};
      q('dist').textContent='~'+Math.round(d.line)+' mi';
      q('time').textContent='About '+fT(d.min)+' from '+origin.label+(d.road?'':' (rough)');
      q('total').textContent='~'+money(Math.round(tot))+' est.';
      var b=[];
      if(g.adm) b.push('Admission: '+A+' adult'+(A>1?'s':'')+' × '+money(g.adm[0])+(C?' + '+C+' child'+(C>1?'ren':'')+' × '+money(g.adm[1])+' youth rate':'')+' = '+money(adm));
      else b.push('Admission: per-vehicle entry only (below)');
      if(g.veh) b.push('Vehicle entry fees: '+money(g.veh));
      else b.push('Parking: not listed in our data; check the venue');
      b.push('Fuel, round trip '+Math.round(miles*2)+' mi'+(d.road?'':' (rough)')+': ~'+money(Math.round(fuel)));
      b.push('Estimate does not include dining or lodging.');
      q('break').innerHTML=''; b.forEach(function(t){var li=document.createElement('li');li.textContent=t;q('break').appendChild(li);});
      if(K&&!C){var li=document.createElement('li'),a2=document.createElement('a');li.className='ga-kidnote';li.appendChild(document.createTextNode('Kids often pay less or get in free; this estimate uses the adult rate for everyone. '));a2.href=g.price;a2.rel='noopener';a2.textContent='See ages and prices';li.appendChild(a2);q('break').appendChild(li);}
      c.querySelector('.ga-est').hidden=false;
      var a=c.querySelector('.ga-dir');
      a.href='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(origin.label)+'&destination='+encodeURIComponent(a.getAttribute('data-dest'));
    });
    var k=sortSel.value;
    if(!origin&&k!=='fit') return;
    cards.slice().sort(function(x,y){
      if(k==='fit'||!origin) return (y._fit-x._fit)||(origin?x._d.min-y._d.min:0);
      return k==='time'?x._d.min-y._d.min:k==='total'?x._tot-y._tot:x._d.line-y._d.line;
    }).forEach(function(c){grid.appendChild(c);});
  }
  function compute(lat,lon,label,save){
    origin={label:label};
    if(save) try{localStorage.setItem(KEY,JSON.stringify({lat:lat,lon:lon,label:label}));}catch(e){}
    cards.forEach(function(c){var l=hav(lat,lon,c._g.lat,c._g.lon);c._d={line:l,road:0,min:l*1.25/50*60};});
    st.textContent='Showing rough estimates from '+label+'. Checking driving routes…'; render();
    var coords=[lon+','+lat].concat(cards.map(function(c){return c._g.lon+','+c._g.lat;})).join(';');
    var ctl=window.AbortController?new AbortController():null; if(ctl) setTimeout(function(){ctl.abort();},8000);
    fetch('https://router.project-osrm.org/table/v1/driving/'+coords+'?sources=0&annotations=duration,distance',ctl?{signal:ctl.signal}:{})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(j){if(j.code!=='Ok')throw 0;cards.forEach(function(c,i){var du=j.durations[0][i+1],di=j.distances[0][i+1];if(du!=null&&di!=null){c._d.min=du/60;c._d.road=di/1609.344;}});
        st.textContent='Sorted from '+label+(origin.def?' (default; enter your city or ZIP to change)':'')+'. All figures are estimates.';render();})
      .catch(function(){st.textContent='Sorted from '+label+'. Routing is unavailable, so drive times are rough estimates.';});
  }
  f.addEventListener('submit',function(ev){
    ev.preventDefault(); var v=loc.value.trim();
    if(!v){st.textContent='Enter a city, ZIP code or address.';loc.focus();return;}
    if(busy||Date.now()-last<1500) return; busy=true; last=Date.now();
    st.textContent='Looking up '+v+'…';
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q='+encodeURIComponent(v),{headers:{'Accept-Language':'en'}})
      .then(function(r){return r.json();})
      .then(function(j){if(!j.length){st.textContent='Couldn\'t find that place. Try adding the city or state.';return;}compute(+j[0].lat,+j[0].lon,v,1);})
      .catch(function(){st.textContent='Location lookup is unavailable right now. Please try again later.';})
      .then(function(){busy=false;});
  });
  document.getElementById('ga-geo').addEventListener('click',function(){
    if(!navigator.geolocation){st.textContent='Your browser doesn\'t support location.';return;}
    st.textContent='Getting your location…';
    navigator.geolocation.getCurrentPosition(function(p){var la=p.coords.latitude,lo=p.coords.longitude;compute(la,lo,'your location',1);},
      function(){st.textContent='Location permission was denied. Type a city or ZIP instead.';},{timeout:10000});
  });
  [sortSel,gn,kb].concat(kn?[kn]:[]).forEach(function(el){el.addEventListener('change',render);el.addEventListener('input',render);});
  var rg=document.getElementById('ga-region');
  function region(){var v=rg?rg.value:'';cards.forEach(function(c){c.hidden=!!v&&c.dataset.region!==v;});}
  if(rg) rg.addEventListener('change',region);
  render(); region();
  var sv=null; try{sv=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){}
  if(sv&&isFinite(sv.lat)&&isFinite(sv.lon)){loc.value=sv.label==='your location'?'':sv.label;compute(sv.lat,sv.lon,sv.label);}
  else {compute(DEF.lat,DEF.lon,'Orlando');origin.def=1;st.textContent='Showing estimates from Orlando (default). Enter your city or ZIP to change it.';}
})();
