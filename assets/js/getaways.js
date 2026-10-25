(function(){
  var f=document.getElementById('ga-finder'); if(!f) return;
  var GAS=4.108, MPG=25; // AAA Florida regular avg 10/25/2026; assumed mpg. Disclosed in fine print.
  var data=JSON.parse(document.getElementById('ga-data').textContent), byId={};
  data.forEach(function(d){byId[d.id]=d;});
  var grid=document.getElementById('ga-grid'), st=document.getElementById('ga-status'), loc=document.getElementById('ga-loc'),
      sortSel=document.getElementById('ga-sort'), gn=document.getElementById('ga-n'), kb=document.getElementById('ga-kids'),
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
    var v=parseInt(gn.value,10), A=isNaN(v)||v<1?2:Math.min(v,20), K=kb.checked;
    cards.forEach(function(c){
      var g=c._g, ft=fit(g,K), p=c.querySelector('.ga-fit');
      c._fit=ft.s; p.hidden=!ft.why.length; p.className='ga-fit'+(ft.s>=2?' top':''); p.textContent=ft.why.join('. ')+(ft.why.length?'.':'');
      if(!origin) return;
      var d=c._d, miles=d.road||d.line*1.25, fuel=miles*2/MPG*GAS, adm=g.adm?A*g.adm[0]:0, tot=fuel+adm+g.veh;
      c._tot=tot;
      var q=function(k){return c.querySelector('[data-f="'+k+'"]');};
      q('dist').textContent='~'+Math.round(d.line)+' mi';
      q('time').textContent='~'+fT(d.min);
      q('total').textContent='~'+money(Math.round(tot))+' est.';
      var b=[];
      if(g.adm) b.push('Admission: '+A+' guest'+(A>1?'s':'')+' × '+money(g.adm[0])+' adult rate = '+money(adm));
      if(g.veh) b.push('Vehicle entry fees: '+money(g.veh));
      b.push('Fuel, round trip '+Math.round(miles*2)+' mi'+(d.road?'':' (rough)')+': ~'+money(Math.round(fuel)));
      b.push('Lodging and meals not included');
      q('break').innerHTML=''; b.forEach(function(t){var li=document.createElement('li');li.textContent=t;q('break').appendChild(li);});
      if(K){var li=document.createElement('li'),a2=document.createElement('a');li.className='ga-kidnote';li.appendChild(document.createTextNode('Kids often pay less or get in free; this estimate uses the adult rate for everyone. '));a2.href=g.price;a2.rel='noopener';a2.textContent='See ages and prices';li.appendChild(a2);q('break').appendChild(li);}
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
  function compute(lat,lon,label){
    origin={label:label};
    cards.forEach(function(c){var l=hav(lat,lon,c._g.lat,c._g.lon);c._d={line:l,road:0,min:l*1.25/50*60};});
    st.textContent='Showing rough estimates from '+label+'. Checking driving routes…'; render();
    var coords=[lon+','+lat].concat(cards.map(function(c){return c._g.lon+','+c._g.lat;})).join(';');
    var ctl=window.AbortController?new AbortController():null; if(ctl) setTimeout(function(){ctl.abort();},8000);
    fetch('https://router.project-osrm.org/table/v1/driving/'+coords+'?sources=0&annotations=duration,distance',ctl?{signal:ctl.signal}:{})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(j){if(j.code!=='Ok')throw 0;cards.forEach(function(c,i){var du=j.durations[0][i+1],di=j.distances[0][i+1];if(du!=null&&di!=null){c._d.min=du/60;c._d.road=di/1609.344;}});
        st.textContent='Sorted from '+label+'. All figures are estimates.';render();})
      .catch(function(){st.textContent='Sorted from '+label+'. Routing is unavailable, so drive times are rough estimates.';});
  }
  f.addEventListener('submit',function(ev){
    ev.preventDefault(); var v=loc.value.trim();
    if(!v){st.textContent='Enter a city, ZIP code or address.';loc.focus();return;}
    if(busy||Date.now()-last<1500) return; busy=true; last=Date.now();
    st.textContent='Looking up '+v+'…';
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q='+encodeURIComponent(v),{headers:{'Accept-Language':'en'}})
      .then(function(r){return r.json();})
      .then(function(j){if(!j.length){st.textContent='Couldn\'t find that place. Try adding the city or state.';return;}compute(+j[0].lat,+j[0].lon,v);})
      .catch(function(){st.textContent='Location lookup is unavailable right now. Please try again later.';})
      .then(function(){busy=false;});
  });
  document.getElementById('ga-geo').addEventListener('click',function(){
    if(!navigator.geolocation){st.textContent='Your browser doesn\'t support location.';return;}
    st.textContent='Getting your location…';
    navigator.geolocation.getCurrentPosition(function(p){var la=p.coords.latitude,lo=p.coords.longitude;compute(la,lo,la.toFixed(5)+','+lo.toFixed(5));},
      function(){st.textContent='Location permission was denied. Type a city or ZIP instead.';},{timeout:10000});
  });
  [sortSel,gn,kb].forEach(function(el){el.addEventListener('change',render);el.addEventListener('input',render);});
  var rg=document.getElementById('ga-region');
  function region(){var v=rg?rg.value:'';cards.forEach(function(c){c.hidden=!!v&&c.dataset.region!==v;});}
  if(rg) rg.addEventListener('change',region);
  render(); region();
})();
