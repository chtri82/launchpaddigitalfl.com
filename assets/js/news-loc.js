/* Launchpad news location filter: ZIP -> county -> All or cities. Saved in localStorage. Nothing is hidden; stories are only reordered/grouped. */
(function(){
var REGIONS={'Panhandle':['Bay','Calhoun','Escambia','Franklin','Gadsden','Gulf','Holmes','Jackson','Jefferson','Leon','Liberty','Okaloosa','Santa Rosa','Wakulla','Walton','Washington'],'North':['Alachua','Baker','Bradford','Clay','Columbia','Dixie','Duval','Flagler','Gilchrist','Hamilton','Lafayette','Levy','Madison','Marion','Nassau','Putnam','St. Johns','Suwannee','Taylor','Union'],'Central':['Citrus','Lake','Orange','Osceola','Polk','Seminole','Sumter','Volusia'],'Space Coast':['Brevard','Indian River'],'Tampa Bay':['Hernando','Hillsborough','Manatee','Pasco','Pinellas','Sarasota'],'South':['Broward','Charlotte','Collier','DeSoto','Glades','Hardee','Hendry','Highlands','Lee','Martin','Miami-Dade','Monroe','Okeechobee','Palm Beach','St. Lucie']};
var ORDER=Object.keys(REGIONS),ALL=[].concat.apply([],ORDER.map(function(r){return REGIONS[r]})).sort();
function regionOf(c){for(var r in REGIONS)if(REGIONS[r].indexOf(c)>=0)return r;return ''}
var KEY='lp_news_locations',box,grid,geo=null,cards;
function load(){try{var v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.filter(function(l){return l&&ALL.indexOf(l.county)>=0}):[]}catch(e){return []}}
function save(l){try{localStorage.setItem(KEY,JSON.stringify(l))}catch(e){}}
function el(t,a,txt){var e=document.createElement(t);for(var k in a||{})e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e}
function list(s){return s?s.split('|').filter(Boolean):[]}
function getGeo(cb){if(geo)return cb(geo);fetch('/assets/data/fl-geo.json').then(function(r){return r.json()}).then(function(g){geo=g;cb(g)}).catch(function(){cb(null)})}
var locs=load(),pending=null;
function render(){
  box.innerHTML='';
  box.appendChild(el('h2',null,'Your location'));
  box.appendChild(el('p',{'class':'msg'},'Enter a ZIP code or pick a county to put your local news first. Every story stays on the page.'));
  var r1=el('div',{'class':'row'}),zip=el('input',{type:'text',inputmode:'numeric',maxlength:'5',placeholder:'ZIP code',autocomplete:'postal-code','aria-label':'ZIP code',id:'lp-zip'}),go=el('button',{type:'button',id:'lp-zip-go'},'Find');
  r1.appendChild(zip);r1.appendChild(go);box.appendChild(r1);
  var r2=el('div',{'class':'row'}),sel=el('select',{'aria-label':'Pick a county',id:'lp-county'});
  sel.appendChild(el('option',{value:''},'Or pick a county (all 67)'));
  ALL.forEach(function(c){sel.appendChild(el('option',{value:c},c+' County'))});
  r2.appendChild(sel);box.appendChild(r2);
  var msg=el('p',{'class':'msg',role:'status','aria-live':'polite'});box.appendChild(msg);
  var step=el('div');box.appendChild(step);
  function chooseCounty(c){pending=c;step.innerHTML='';getGeo(function(g){
    var places=(g&&g.places&&g.places[c])||[],fs=el('fieldset');fs.appendChild(el('legend',null,c+' County: what news do you want?'));
    var all=el('label');var ab=el('input',{type:'checkbox',checked:'',id:'lp-all'});all.appendChild(ab);all.appendChild(document.createTextNode(' All of '+c+' County'));fs.appendChild(all);
    var cw=el('div',{'class':'cities'});places.forEach(function(p){var l=el('label'),b=el('input',{type:'checkbox',value:p.name,'class':'lp-city'});l.appendChild(b);l.appendChild(document.createTextNode(' '+p.name));cw.appendChild(l);b.addEventListener('change',function(){if(b.checked)ab.checked=false;if(!cw.querySelector('input:checked'))ab.checked=true})});
    ab.addEventListener('change',function(){if(ab.checked)[].forEach.call(cw.querySelectorAll('input'),function(i){i.checked=false})});
    if(places.length){fs.appendChild(el('p',{'class':'msg'},'Or pick cities:'));fs.appendChild(cw)}
    var add=el('button',{type:'button',id:'lp-add'},'Add '+c);fs.appendChild(add);step.appendChild(fs);
    add.addEventListener('click',function(){var cities=[].map.call(cw.querySelectorAll('input:checked'),function(i){return i.value});
      var ex=locs.filter(function(l){return l.county===c})[0];if(ex)ex.cities=cities;else locs.push({county:c,cities:cities});save(locs);pending=null;render();apply()});
  })}
  function findZip(){var z=zip.value.replace(/\D/g,'');if(z.length!==5){msg.textContent='Enter a 5-digit Florida ZIP code.';return}
    getGeo(function(g){var cs=g&&g.zips&&g.zips[z];if(!cs){msg.textContent='We could not find '+z+' as a Florida ZIP. Pick your county instead.';return}
      if(cs.length===1){msg.textContent=z+' is in '+cs[0]+' County.';chooseCounty(cs[0]);return}
      msg.textContent=z+' crosses '+cs.length+' counties. Which one?';step.innerHTML='';var rw=el('div',{'class':'row'});
      cs.forEach(function(c){var b=el('button',{type:'button','class':'ghost'},c);b.addEventListener('click',function(){chooseCounty(c)});rw.appendChild(b)});step.appendChild(rw)})}
  go.addEventListener('click',findZip);zip.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();findZip()}});
  sel.addEventListener('change',function(){if(sel.value)chooseCounty(sel.value)});
  if(locs.length){var ul=el('ul',{'class':'chips','aria-label':'Your locations'});
    locs.forEach(function(l,i){var li=el('li'),t=l.cities.length?l.cities.join(', ')+' ('+l.county+')':'All of '+l.county+' County';li.appendChild(el('span',null,t));
      var rm=el('button',{type:'button','class':'ghost','aria-label':'Remove '+t},'Remove');rm.addEventListener('click',function(){locs.splice(i,1);save(locs);render();apply()});li.appendChild(rm);ul.appendChild(li)});
    box.appendChild(ul);var clr=el('button',{type:'button','class':'ghost',id:'lp-clear'},'Clear location');clr.addEventListener('click',function(){locs=[];save(locs);render();apply()});box.appendChild(clr)}
  if(pending)chooseCounty(pending);
}
function head(t,sub){return el('h2',{'class':'lp-group-h'+(sub?' sub':'')},t)}
function apply(){
  [].forEach.call(grid.querySelectorAll('.lp-group-h'),function(h){h.remove()});
  var cities={},counties={},regions={};locs.forEach(function(l){if(l.cities.length)l.cities.forEach(function(c){cities[l.county+'|'+c]=1});else counties[l.county]=1;regions[regionOf(l.county)]=1});
  var mine=[[],[],[]],rest={},state=[];
  cards.forEach(function(c){c.classList.add('in');
    if(c.dataset.section!=='local'){state.push(c);return}
    var cs=list(c.dataset.counties),ct=list(c.dataset.cities),rg=list(c.dataset.regions),t=-1;
    if(cs.some(function(k){return ct.some(function(x){return cities[k+'|'+x]})}))t=0;
    else if(cs.some(function(k){return counties[k]})||cs.some(function(k){return locs.some(function(l){return l.county===k&&l.cities.length&&!ct.length})}))t=1;
    else if(rg.some(function(r){return regions[r]}))t=2;
    if(t>=0)mine[t].push(c);else{var r=rg[0]||'Statewide';(rest[r]=rest[r]||[]).push(c)}});
  var out=[],n=mine[0].length+mine[1].length+mine[2].length;
  if(locs.length){out.push(head('Your local news'));if(!n)out.push(el('p',{'class':'msg lp-group-h sub'},'No Launchpad stories for your area yet. Here is the rest of Florida.'));out=out.concat(mine[0],mine[1],mine[2]);out.push(head('Around Florida'))}
  else if(document.getElementById('lp-original'))out.push(head('Around Florida'));
  ORDER.forEach(function(r){if(rest[r]){out.push(head(r,1));out=out.concat(rest[r])}});
  if(rest.Statewide||state.length){out.push(head('Statewide',1));out=out.concat(rest.Statewide||[],state)}
  out.forEach(function(e){grid.appendChild(e)});
}
function init(){box=document.getElementById('lp-loc');grid=document.getElementById('lp-stories');if(!box||!grid)return;cards=[].slice.call(grid.querySelectorAll('.lp-story'));render();apply()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
