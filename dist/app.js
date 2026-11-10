import { CITY, PRODUCTS, STATUS, statusAt } from './products.js';
import { createCity3D } from './city3d.js?v=render-cache-1';

const $=selector=>document.querySelector(selector);
const state={year:CITY.lastYear,night:false,playing:false,selected:null};
let city,loading=false,timer,lastTrigger;
const available=()=>PRODUCTS.filter(p=>statusAt(p,state.year)!=='future');
const safeLink=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};

function toggleMenu(open=$('#product-menu').hidden){
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
  $('#product-dialog').showModal();
}
function reportProgress(p){
  if(p.stage==='buildings'){
    $('#loading-label').textContent=`载入建筑 ${p.loaded}/${p.total}`;
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
  if(loading)return;loading=true;stopTimeline();city?.dispose();city=null;
  document.body.dataset.sceneState='loading';$('#loading').hidden=false;$('#load-state').hidden=false;$('#load-error').hidden=true;$('#asset-status').hidden=true;
  $('#loading-label').textContent='载入街区';$('#loading-progress').value=0;
  document.querySelectorAll('[data-scene-control]').forEach(b=>b.disabled=true);
  try{
    const response=await fetch('./assets/models/manifest.json',{cache:'no-cache'});
    if(!response.ok)throw new Error(`Manifest: HTTP ${response.status}`);
    const manifest=await response.json();if(!manifest.models?.length)throw new Error('No buildings in manifest');
    city=await createCity3D($('#scene3d'),manifest,PRODUCTS,showProduct,reportProgress);
    city.setYear(state.year);city.setNight(state.night);if(state.selected)city.focus(state.selected);if(!document.hidden)city.resume();
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
$('#product-dialog').addEventListener('close',()=>{state.selected=null;city?.focus(null);lastTrigger?.focus?.();});
$('#product-dialog').addEventListener('click',e=>{if(e.target===$('#product-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#night-toggle').addEventListener('click',()=>{
  state.night=!state.night;document.body.classList.toggle('night',state.night);city?.setNight(state.night);
  $('#night-toggle').textContent=state.night?'☀':'☾';$('#night-toggle').setAttribute('aria-pressed',String(state.night));$('#night-toggle').setAttribute('aria-label',state.night?'切换日景':'切换夜景');
});
$('#orbit-toggle').addEventListener('click',()=>{const active=$('#orbit-toggle').getAttribute('aria-pressed')!=='true';$('#orbit-toggle').setAttribute('aria-pressed',String(active));city?.setOrbit(active);});
for(const [id,view] of [['canal-view','canal'],['overhead-view','overhead']])$('#'+id).addEventListener('click',()=>{city?.view(view);$('#orbit-toggle').setAttribute('aria-pressed','false');});
$('#zoom-in').addEventListener('click',()=>city?.zoom(.8));$('#zoom-out').addEventListener('click',()=>city?.zoom(1.2));
$('#home').addEventListener('click',reset);$('#reset-scene').addEventListener('click',reset);
$('#play-timeline').addEventListener('click',()=>{
  if(state.playing){stopTimeline();return;}setYear(CITY.firstYear);state.playing=true;
  $('#play-timeline').textContent='Ⅱ';$('#play-timeline').setAttribute('aria-pressed','true');$('#play-timeline').setAttribute('aria-label','暂停城市成长');
  timer=setInterval(()=>{if(state.year>=CITY.lastYear){stopTimeline();return;}setYear(state.year+1);},2100);
});
$('#retry').addEventListener('click',boot);$('#retry-assets').addEventListener('click',boot);
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTimeline();city?.pause();}else city?.resume();});
window.addEventListener('pagehide',()=>{stopTimeline();city?.dispose();city=null;});
window.addEventListener('pageshow',e=>{if(e.persisted)boot();});
setYear(state.year);boot();
