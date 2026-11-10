import { CITY, PRODUCTS, STATUS, statusAt } from './products.js';
import { createCity3D } from './city3d.js?v=neighbors-3';
import {DISCOVERIES} from './walking-world.js?v=neighbors-3';

import {RESIDENTS,residentById,greetingFor} from './residents.js?v=neighbors-3';

const $=selector=>document.querySelector(selector);
const state={year:CITY.lastYear,night:false,playing:false,selected:null};
let city,loading=false,timer,lastTrigger;
let walking=false,toastTimer,currentResident=null;
const met=new Set();
try{const saved=JSON.parse(localStorage.getItem('mycity-neighbors')||'[]');if(Array.isArray(saved))saved.filter(id=>residentById(id)).forEach(id=>met.add(id));}catch{}
const visited=new Set();
try{const saved=JSON.parse(localStorage.getItem('mycity-walk-stamps')||'[]');if(Array.isArray(saved))saved.filter(id=>DISCOVERIES.some(p=>p.id===id)).forEach(id=>visited.add(id));}catch{}
function updateWalkProgress(){$('#walk-progress').textContent=`足迹 ${visited.size}/${DISCOVERIES.length} · 邻里 ${met.size}/${RESIDENTS.length}`;}
function walkingMode(value){walking=value;document.body.classList.toggle('walking',value);$('#walk-hud').hidden=!value;$('#walk-toggle').setAttribute('aria-pressed',String(value));$('#walk-toggle').textContent=value?'全景':'漫游';$('#walk-toggle').setAttribute('aria-label',value?'切换街区全景':'第三人称漫游');$('#orbit-toggle').setAttribute('aria-pressed','false');if(value)stopTimeline();else{clearTimeout(toastTimer);$('#walk-toast').hidden=true;}}
function nearbyPlace(place){$('#walk-interact').hidden=!place;if(place)$('#walk-place').textContent=place.label;}
function discover(place){
  if(place.resident){showResident(place.resident);return;}
  const first=!visited.has(place.id);visited.add(place.id);updateWalkProgress();
  try{localStorage.setItem('mycity-walk-stamps',JSON.stringify([...visited]));}catch{}
  if(place.product){showProduct(place.product);return;}
  $('#walk-toast').textContent=visited.size===DISCOVERIES.length&&first?'你走遍了这座小城。下一栋楼，等你来建。':place.message;
  $('#walk-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#walk-toast').hidden=true,4500);
}
function showResident(id){
  const person=residentById(id);if(!person)return;
  stopTimeline();
  const known=met.has(id);met.add(id);updateWalkProgress();
  try{localStorage.setItem('mycity-neighbors',JSON.stringify([...met]));}catch{}
  currentResident=person;toggleMenu(false);city?.setMuted(true);city?.setTalking(id);document.body.classList.add('talking');
  $('#resident-name').textContent=person.name;$('#resident-role').textContent=person.role;
  $('#resident-line').textContent=greetingFor(person,{night:state.night,known});
  $('#resident-options').replaceChildren(...person.topics.map(topic=>{
    const b=document.createElement('button');b.textContent=topic.label;
    b.addEventListener('click',()=>{$('#resident-line').textContent=topic.reply;city?.setTalking(id);});return b;
  }));
  $('#resident-product').hidden=!person.product;
  $('#resident-dialog').showModal();
}
$('#close-resident').addEventListener('click',()=>$('#resident-dialog').close());
$('#resident-dialog').addEventListener('close',()=>{currentResident=null;document.body.classList.remove('talking');city?.setTalking(null);city?.setMuted(false);});
$('#resident-product').addEventListener('click',()=>{const id=currentResident?.product;$('#resident-dialog').close();if(id)showProduct(id);});
const available=()=>PRODUCTS.filter(p=>statusAt(p,state.year)!=='future');
const safeLink=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};

function toggleMenu(open=$('#product-menu').hidden){
  city?.setMuted(open);
  $('#product-menu').hidden=!open;
  $('#products-toggle').setAttribute('aria-expanded',String(open));
}
function renderProducts(){
  $('#product-items').replaceChildren(...available().map(p=>{
    const button=document.createElement('button');button.className='product-item';button.dataset.product=p.id;
    const copy=document.createElement('span'),name=document.createElement('strong'),meta=document.createElement('small'),arrow=document.createElement('span');
    name.textContent=p.name;meta.textContent=`${p.category} · ${STATUS[statusAt(p,state.year)]}`;arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
    copy.append(name,meta);button.append(copy,arrow);return button;
  }));
}
function stopTimeline(){clearInterval(timer);state.playing=false;$('#play-timeline').textContent='▷';$('#play-timeline').setAttribute('aria-pressed','false');$('#play-timeline').setAttribute('aria-label','播放城市成长');}
function setYear(year,manual=false){
  if(manual)stopTimeline();state.year=Math.max(CITY.firstYear,Math.min(CITY.lastYear,Number(year)));
  document.querySelectorAll('[data-year]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.year)===state.year)));
  if(state.selected&&statusAt(PRODUCTS.find(p=>p.id===state.selected),state.year)==='future')$('#product-dialog').close();
  renderProducts();city?.setYear(state.year);
}
function showProduct(id){
  const p=PRODUCTS.find(p=>p.id===id);if(!p)return;
  lastTrigger=document.activeElement;state.selected=id;toggleMenu(false);city?.focus(id);
  $('#detail-title').textContent=p.name;$('#detail-meta').textContent=`${p.category} · ${STATUS[statusAt(p,state.year)]} · ${p.launched.slice(0,4)}`;
  $('#detail-description').textContent=p.description;
  const latest=p.updates.filter(u=>Number(u.date.slice(0,4))<=state.year).sort((a,b)=>b.date.localeCompare(a.date))[0];
  $('#detail-update').hidden=!latest;if(latest){$('#update-date').textContent=latest.date;$('#update-date').dateTime=latest.date;$('#update-title').textContent=latest.title;}
  const url=safeLink(p.url);$('#product-link').hidden=!url;$('#missing-link').hidden=!!url;
  if(url)$('#product-link').href=url;else $('#product-link').removeAttribute('href');
  $('#demo-note').hidden=!p.demo;
  city?.setMuted(true);$('#product-dialog').showModal();
}
function reportProgress(p){
  if(p.stage==='buildings'){
    $('#loading-label').textContent=`载入街区 ${p.loaded}/${p.total}`;
    $('#loading-progress').max=p.total;$('#loading-progress').value=p.loaded;
    return;
  }
  document.body.dataset.assetsLoaded=String(p.loaded);document.body.dataset.assetsFailed=String(p.failed);
  const complete=p.loaded+p.failed>=p.total;
  $('#asset-status').hidden=complete&&!p.failed;
  $('#asset-label').textContent=complete?'部分细节未载入':`细节 ${p.loaded}/${p.total}`;
  $('#retry-assets').hidden=!complete||!p.failed;
}
async function boot(){
  if(loading)return;loading=true;if($('#resident-dialog').open)$('#resident-dialog').close();stopTimeline();city?.dispose();city=null;walkingMode(false);nearbyPlace(null);
  document.body.dataset.sceneState='loading';$('#loading').hidden=false;$('#load-state').hidden=false;$('#load-error').hidden=true;$('#asset-status').hidden=true;
  $('#loading-label').textContent='载入街区';$('#loading-progress').value=0;
  document.querySelectorAll('[data-scene-control]').forEach(b=>b.disabled=true);
  try{
    const response=await fetch('./assets/models/manifest.json',{cache:'no-cache'});
    if(!response.ok)throw new Error(`Manifest: HTTP ${response.status}`);
    const manifest=await response.json();if(!manifest.models?.length)throw new Error('No buildings in manifest');
    city=await createCity3D($('#scene3d'),manifest,PRODUCTS,showProduct,reportProgress,{onMode:walkingMode,onDiscovery:discover,onNearby:nearbyPlace,onResident:showResident});
    city.setYear(state.year);city.setNight(state.night);city.setWalking(true);if(state.selected)city.focus(state.selected);if(!document.hidden)city.resume();
    $('#loading').hidden=true;document.body.dataset.sceneState='ready';
    document.querySelectorAll('[data-scene-control]').forEach(b=>b.disabled=false);
  }catch(error){
    console.error('City load failed:',error);city?.dispose();city=null;
    $('#load-state').hidden=true;$('#load-error').hidden=false;document.body.dataset.sceneState='error';
    $('#error-message').textContent='街区暂时未能加载，请重试。';
  }finally{loading=false;}
}
function reset(){toggleMenu(false);city?.focus(null);city?.setOrbit(false);city?.reset();$('#orbit-toggle').setAttribute('aria-pressed','false');}
$('#year-buttons').replaceChildren(...Array.from({length:CITY.lastYear-CITY.firstYear+1},(_,i)=>{
  const button=document.createElement('button');button.textContent=String(CITY.firstYear+i);button.dataset.year=button.textContent;button.dataset.sceneControl='';button.disabled=true;return button;
}));
$('#products-toggle').addEventListener('click',()=>toggleMenu($('#product-menu').hidden));
$('#close-menu').addEventListener('click',()=>{toggleMenu(false);$('#products-toggle').focus();});
document.addEventListener('click',e=>{
  const product=e.target.closest('[data-product]'),year=e.target.closest('[data-year]');
  if(product)showProduct(product.dataset.product);if(year)setYear(year.dataset.year,true);
  if(!$('#product-menu').hidden&&!e.target.closest('#product-menu,#products-toggle'))toggleMenu(false);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleMenu(false);});
$('#close-detail').addEventListener('click',()=>$('#product-dialog').close());
$('#product-dialog').addEventListener('close',()=>{state.selected=null;city?.setMuted(false);city?.focus(null);lastTrigger?.focus?.();});
$('#product-dialog').addEventListener('click',e=>{if(e.target===$('#product-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#night-toggle').addEventListener('click',()=>{
  state.night=!state.night;document.body.classList.toggle('night',state.night);city?.setNight(state.night);
  $('#night-toggle').textContent=state.night?'☀':'☾';$('#night-toggle').setAttribute('aria-pressed',String(state.night));$('#night-toggle').setAttribute('aria-label',state.night?'切换日景':'切换夜景');
});
$('#orbit-toggle').addEventListener('click',()=>{const active=$('#orbit-toggle').getAttribute('aria-pressed')!=='true';city?.setOrbit(active);$('#orbit-toggle').setAttribute('aria-pressed',String(active));});
for(const [id,view] of [['canal-view','canal'],['overhead-view','overhead']])$('#'+id).addEventListener('click',()=>{city?.view(view);$('#orbit-toggle').setAttribute('aria-pressed','false');});
$('#zoom-in').addEventListener('click',()=>city?.zoom(.8));$('#zoom-out').addEventListener('click',()=>city?.zoom(1.2));
$('#home').addEventListener('click',reset);$('#reset-scene').addEventListener('click',reset);
$('#play-timeline').addEventListener('click',()=>{
  if(state.playing){stopTimeline();return;}setYear(CITY.firstYear);state.playing=true;
  $('#play-timeline').textContent='Ⅱ';$('#play-timeline').setAttribute('aria-pressed','true');$('#play-timeline').setAttribute('aria-label','暂停城市成长');
  timer=setInterval(()=>{if(state.year>=CITY.lastYear){stopTimeline();return;}setYear(state.year+1);},2100);
});
$('#retry').addEventListener('click',boot);$('#retry-assets').addEventListener('click',boot);
$('#walk-toggle').addEventListener('click',()=>{toggleMenu(false);city?.setWalking(!walking);});
$('#walk-interact').addEventListener('click',()=>city?.interact());
$('#walk-run').addEventListener('pointerdown',e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);city?.setRun(true);});
for(const name of ['pointerup','pointercancel'])$('#walk-run').addEventListener(name,()=>city?.setRun(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTimeline();city?.pause();}else city?.resume();});
window.addEventListener('pagehide',()=>{stopTimeline();city?.dispose();city=null;});
window.addEventListener('pageshow',e=>{if(e.persisted)boot();});
updateWalkProgress();setYear(state.year);boot();
