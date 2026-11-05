import { CITY, PRODUCTS, STATUS, statusAt } from './products.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const escape = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {year:CITY.lastYear,selected:'chess',filter:'all',night:false,zoom:1,playing:false,three:false};
let timer, toastTimer, renderer3d, threeLoading = false, lastTrigger;
const productById = (id) => PRODUCTS.find(p => p.id === id);
const available = () => PRODUCTS.filter(p => statusAt(p,state.year) !== 'future');
const safeLink = (url) => { try {const parsed = new URL(url); return ['http:','https:'].includes(parsed.protocol) ? parsed.href : null;} catch {return null;} };
const cropStyle = () => '';
const thumbnail = (p) => `./assets/thumbs/${p.id === 'archive' ? 'chess' : p.id}.webp`;
const statusMarkup = (p) => `<span class="status ${statusAt(p,state.year)}">${STATUS[statusAt(p,state.year)]}</span>`;
const latestUpdates = () => available().flatMap(p => p.updates.filter(u=>Number(u.date.slice(0,4))<=state.year).map(u=>({...u,product:p}))).sort((a,b)=>b.date.localeCompare(a.date));

function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('visible');
  toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);
}

function layoutScene() {
  const viewport=$('#scene-viewport'), scene=$('#scene');
  const width=Math.max(viewport.clientWidth,viewport.clientHeight*1.6), height=width/1.6;
  scene.style.width=`${width}px`; scene.style.height=`${height}px`; scene.style.left='50%';scene.style.top='50%';scene.style.margin='0';scene.style.right='auto';scene.style.bottom='auto';
  const mobile=viewport.clientWidth<600;
  scene.style.transform=`translate(-50%,-50%) translateX(${mobile?width*.12:0}px) scale(${state.zoom})`;
}
new ResizeObserver(layoutScene).observe($('#scene-viewport'));

function renderHotspots() {
  $('#city-hotspots').innerHTML=PRODUCTS.map(p=>`<button class="hotspot ${statusAt(p,state.year)} ${p.id===state.selected?'selected':''}" style="left:${p.position.x}%;top:${p.position.y}%" data-product="${p.id}" aria-label="${escape(p.name)}，${STATUS[statusAt(p,state.year)]}，查看详情" ${statusAt(p,state.year)==='future'?'disabled':''}><span>${p.icon}</span>${escape(p.name)}<small>${STATUS[statusAt(p,state.year)]}</small></button>`).join('');
  $$('[data-outline]').forEach(el=>el.classList.toggle('selected',el.dataset.outline===state.selected));
}

function renderFeatured() {
  const p=productById(state.selected), status=statusAt(p,state.year);
  $('#featured-product').innerHTML=`<div class="featured-copy"><span class="eyebrow">${escape(p.building.toUpperCase())} <span> / </span> ${STATUS[status]}</span><h2>${escape(p.name)}</h2><p>${escape(p.subtitle)}</p><div class="featured-links"><button data-detail="${p.id}">查看作品 <span aria-hidden="true">↗</span></button><span>│</span><button data-next>下一站 →</button></div></div><span class="featured-icon" aria-hidden="true">${p.icon}</span>`;
}

function renderIndex() {
  $('#index-items').innerHTML=available().map(p=>`<button class="index-item" data-product="${p.id}"><span aria-hidden="true">${p.icon}</span><span><strong>${escape(p.name)}</strong><small>${escape(p.category)} · ${STATUS[statusAt(p,state.year)]}</small></span><span aria-hidden="true">↗</span></button>`).join('');
}

function renderProducts() {
  const products=available().filter(p=>state.filter==='all'||statusAt(p,state.year)===state.filter);
  $('#product-grid').innerHTML=products.map(p=>`<article class="product-card ${statusAt(p,state.year)}" tabindex="0" role="button" aria-label="查看 ${escape(p.name)} 的项目详情" data-detail="${p.id}"><div class="card-image" style="${cropStyle(p)}"><img src="${thumbnail(p)}" alt="${escape(p.building)} 建筑局部" loading="lazy"><span class="card-type">${escape(p.building)}</span>${statusMarkup(p)}</div><div class="card-meta"><h3>${escape(p.name)}</h3><span class="arrow" aria-hidden="true">↗</span></div><p>${escape(p.subtitle)}</p><div class="card-bottom"><span>${escape(p.category)} <span> / </span> EST. ${p.launched.slice(0,4)}</span><span>${p.demo?'示例作品':''}</span></div></article>`).join('');
  $('#empty-products').hidden=products.length>0;
  $('.filter[data-filter="all"] span').textContent=available().length;
}

function renderJournal() {
  const updates=latestUpdates().slice(0,3);
  $('#journal-year').textContent=`${state.year} / 建城手记`;
  $('#journal-list').innerHTML=updates.map(u=>`<button class="journal-entry" data-detail="${u.product.id}"><time datetime="${u.date}">${u.date.replaceAll('-','.')}</time><span><h3>${escape(u.title)}</h3><p>${escape(u.text)}</p></span><span class="journal-project">${escape(u.product.name)}</span><span aria-hidden="true">↗</span></button>`).join('');
}

function setYear(year, user = false) {
  state.year=Math.max(CITY.firstYear,Math.min(CITY.lastYear,Number(year)));
  if(user) stopTimeline();
  if(statusAt(productById(state.selected),state.year)==='future') state.selected=available()[0].id;
  $('#year-range').value=state.year;
  $$('[data-year]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.year)===state.year);b.setAttribute('aria-pressed',Number(b.dataset.year)===state.year);});
  $('#timeline-progress').style.width=`${(state.year-CITY.firstYear)/(CITY.lastYear-CITY.firstYear)*100}%`;
  const counts={live:0,building:0,archived:0};available().forEach(p=>counts[statusAt(p,state.year)]++);
  $('#city-count').textContent=`${counts.live} 间已开业${counts.building?` · ${counts.building} 间建造中`:''}`;
  $('#scene-caption').textContent=state.three?`${state.year} · 拖动旋转 / ${window.innerWidth<600?'双指':'滚轮'}缩放`:(state.year===CITY.lastYear?`灵感街 · ${state.night?'夜晚':'黄昏'}`:`2026 全景 · ${state.year} 年索引`);
  renderHotspots();renderFeatured();renderIndex();renderProducts();renderJournal();
  renderer3d?.setYear(state.year);
}

function selectProduct(id,{detail=false}={}) {
  const p=productById(id);if(!p) return;
  if(statusAt(p,state.year)==='future') setYear(Number(p.launched.slice(0,4)),true);
  state.selected=id;renderHotspots();renderFeatured();renderer3d?.focus(id);
  if(detail) showProduct(id);
}

function showProduct(id) {
  const p=productById(id);if(!p)return;
  lastTrigger=document.activeElement;
  const updates=p.updates.filter(u=>Number(u.date.slice(0,4))<=state.year).sort((a,b)=>b.date.localeCompare(a.date));
  const url=safeLink(p.url);
  $('#product-detail').innerHTML=`<div class="detail-image" style="${cropStyle(p)}"><img src="${thumbnail(p)}" alt="${escape(p.building)} 建筑" ><span class="detail-building">${escape(p.building)}</span></div><div class="detail-body"><div class="detail-topline"><span class="eyebrow">${escape(p.category)} · EST. ${p.launched.slice(0,4)}</span>${statusMarkup(p)}</div><h2 id="detail-title">${escape(p.name)}</h2><p class="detail-description">${escape(p.description)}</p><div class="tags">${p.tags.map(t=>`<span>${escape(t)}</span>`).join('')}</div>${p.status==='building'?`<div class="progress-label"><span>建筑完成度（示例）</span><span>${p.progress}%</span></div><div class="construction-progress"><span style="width:${p.progress}%"></span></div><br>`:''}<div class="detail-updates"><h3>这栋建筑的故事</h3>${updates.map(u=>`<div class="update-item"><time datetime="${u.date}">${u.date.replaceAll('-','.')}</time><div><strong>${escape(u.title)}</strong><p>${escape(u.text)}</p></div></div>`).join('')}</div><div class="detail-footer">${url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">进入产品 ↗</a>`:`<button class="primary-button" disabled>尚未接入产品链接</button>`}<small>${p.demo?'这是一个示例项目。<br>真实作品入驻后，这扇门将为你打开。':'产品之城 · 每个想法都有自己的地址'}</small></div></div>`;
  $('#product-dialog').showModal();
}

function showInfo(type) {
  lastTrigger=document.activeElement;
  const content={
    about:`<p class="eyebrow">AN IDEA, MADE TANGIBLE</p><h2 id="info-title">产品，是这座城的建筑。</h2><p>每做成一个可以被使用的东西，就在这里为它建一栋楼。生活工具是一家商店，游戏是一座游乐场，AI 助手有自己的事务所，知识则住在图书馆里。</p><p>正在开发的项目搭起脚手架。停止维护的作品搬进旧城区。时间轴记录的，是从「如果可以」到「真的做出来了」的过程。</p><p>这座城不追求一次建完。它会随着真实的作品，一点一点长大。</p><p class="info-note">目前为交互概念演示。项目名称、时间、进度与更新记录均为示例；尚未接入真实产品链接。</p>`,
    contact:`<p class="eyebrow">GOOD IDEAS START WITH A HELLO</p><h2 id="info-title">在街角，聊个新想法。</h2><p>这座城为创造、实验和分享而建。带着一个想法走进来，也许下一栋建筑就从这里开始。</p>${CITY.contactEmail?`<a class="text-button" href="mailto:${escape(CITY.contactEmail)}">写封信 ↗</a>`:`<p class="info-note">城主的联系地址尚未填写。你可以先收藏或分享这座城，之后再回来走走。</p><button class="text-button" id="copy-link">复制城市地址 ↗</button>`}`,
    models:`<p class="eyebrow">THE CITY IS TAKING SHAPE</p><h2 id="info-title">三维街区正在建造中。</h2><p>建筑将通过 Hi3D 生成真实的三维模型。完成后，可以在这里旋转、缩放，并观看建筑沿着时间轴生长。</p><p class="info-note">当前已开放插画街区、建筑详情、产品索引、年份筛选与夜景。三维资产尚未就绪。</p>`,
  };
  $('#info-content').innerHTML=content[type];$('#info-dialog').showModal();
}

async function toggleThree() {
  if(threeLoading)return;
  if(state.three) {
    state.three=false;$('#scene3d').hidden=true;$('#scene').hidden=false;$('#three-title').hidden=true;$('#three-controls').hidden=true;$('#asset-progress').hidden=true;$('.city-section').classList.remove('three-active');$('#three-toggle').setAttribute('aria-pressed','false');renderer3d?.pause();setYear(state.year);return;
  }
  try {
    threeLoading=true;
    if(!renderer3d) {
      const res=await fetch('./assets/models/manifest.json');
      if(!res.ok){showInfo('models');return;}
      const manifest=await res.json();
      if(!manifest.models?.length){showInfo('models');return;}
      $('#scene-loading').hidden=false;
      const {createCity3D}=await import('./city3d.js');
      renderer3d=await createCity3D($('#scene3d'),manifest,PRODUCTS,id=>selectProduct(id,{detail:true}),progress=>{
        const complete=progress.loaded+progress.failed>=progress.total;
        $('#asset-progress').textContent=complete?(progress.failed?'部分街道细节未能载入':'街道和居民已就位'):`街区正在苏醒 · ${progress.loaded} / ${progress.total}`;
        $('#asset-progress').hidden=!state.three;
        if(complete)setTimeout(()=>{$('#asset-progress').hidden=true;},3500);
      });
    }
    state.three=true;$('#scene3d').hidden=false;$('#scene').hidden=true;$('#three-title').hidden=false;$('#three-controls').hidden=false;$('.city-section').classList.add('three-active');$('#three-toggle').setAttribute('aria-pressed','true');renderer3d.setNight(state.night);renderer3d.setYear(state.year);renderer3d.resume();setYear(state.year);window.scrollTo({top:0,behavior:'smooth'});
    toast('拖动旋转街区，点击建筑查看作品');
  } catch(error) {console.error('3D scene:',error);toast('三维街区暂时未能加载，请稍后重试。');renderer3d?.dispose();renderer3d=null;} finally {threeLoading=false;$('#scene-loading').hidden=true;}
}

function stopTimeline(){clearInterval(timer);state.playing=false;$('#play-timeline').textContent='▷';$('#play-timeline').setAttribute('aria-label','播放城市成长时间轴');}
function playTimeline(){if(state.playing){stopTimeline();return;}setYear(CITY.firstYear);state.playing=true;$('#play-timeline').textContent='Ⅱ';$('#play-timeline').setAttribute('aria-label','暂停城市成长时间轴');timer=setInterval(()=>{if(state.year>=CITY.lastYear){stopTimeline();return;}setYear(state.year+1);},1800);}

$('#year-buttons').innerHTML=Array.from({length:CITY.lastYear-CITY.firstYear+1},(_,i)=>CITY.firstYear+i).map(year=>`<button class="year-button" data-year="${year}" aria-pressed="${year===state.year}">${year}</button>`).join('');
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-product],[data-detail],[data-next],[data-year],[data-filter],[data-dialog]');if(!button)return;
  if(button.dataset.product) selectProduct(button.dataset.product,{detail:true});
  if(button.dataset.detail) selectProduct(button.dataset.detail,{detail:true});
  if(button.hasAttribute('data-next')){const list=available();selectProduct(list[(list.findIndex(p=>p.id===state.selected)+1)%list.length].id);}
  if(button.dataset.year)setYear(button.dataset.year,true);
  if(button.dataset.filter){state.filter=button.dataset.filter;$$('.filter').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button);});renderProducts();}
  if(button.dataset.dialog)showInfo(button.dataset.dialog);
});
document.addEventListener('keydown',e=>{const card=e.target.closest('.product-card');if(card&&['Enter',' '].includes(e.key)){e.preventDefault();selectProduct(card.dataset.detail,{detail:true});}});
$$('dialog').forEach(dialog=>{
  $('.dialog-close',dialog).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>lastTrigger?.focus?.());
});
$('#info-dialog').addEventListener('click',async e=>{if(!e.target.closest('#copy-link'))return;try{await navigator.clipboard.writeText(location.origin+location.pathname);toast('城市地址已复制');}catch{toast('可以复制浏览器地址栏中的链接');}});
$('#year-range').addEventListener('input',e=>setYear(e.target.value,true));
$('#play-timeline').addEventListener('click',playTimeline);
$('#night-toggle').addEventListener('click',()=>{state.night=!state.night;$('.city-section').classList.toggle('night',state.night);$('#night-toggle').setAttribute('aria-pressed',state.night);$('#night-toggle .tool-icon').textContent=state.night?'☼':'☾';$('#night-toggle .tool-text').textContent=state.night?'日景':'入夜';renderer3d?.setNight(state.night);setYear(state.year);});
function toggleIndex(force){const visible=force??$('#city-index').hidden;$('#city-index').hidden=!visible;$('#view-toggle').setAttribute('aria-pressed',visible);}
$('#view-toggle').addEventListener('click',()=>toggleIndex());$('#close-index').addEventListener('click',()=>toggleIndex(false));
$('#three-toggle').addEventListener('click',toggleThree);
$('#orbit-toggle').addEventListener('click',()=>{const active=$('#orbit-toggle').getAttribute('aria-pressed')!=='true';$('#orbit-toggle').setAttribute('aria-pressed',active);renderer3d?.setOrbit(active);});
$('#life-toggle').addEventListener('click',()=>{const active=$('#life-toggle').getAttribute('aria-pressed')!=='true';$('#life-toggle').setAttribute('aria-pressed',active);renderer3d?.setLife(active);});
$('#canal-view').addEventListener('click',()=>{$('#orbit-toggle').setAttribute('aria-pressed','false');renderer3d?.view('canal');});
$('#overhead-view').addEventListener('click',()=>{$('#orbit-toggle').setAttribute('aria-pressed','false');renderer3d?.view('overhead');});
$('#zoom-in').addEventListener('click',()=>{if(state.three){renderer3d.zoom(.8);return;}state.zoom=Math.min(1.7,state.zoom+.15);layoutScene();});
$('#zoom-out').addEventListener('click',()=>{if(state.three){renderer3d.zoom(1.2);return;}state.zoom=Math.max(1,state.zoom-.15);layoutScene();});
$('#reset-scene').addEventListener('click',()=>{state.zoom=1;layoutScene();renderer3d?.reset();toggleIndex(false);state.selected=available()[0].id;renderHotspots();renderFeatured();});
$('#explore').addEventListener('click',()=>{toggleIndex(true);$('#city-index .index-item')?.focus();});
$('#back-to-city').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
$('.mobile-menu').addEventListener('click',()=>{const open=$('.site-header').classList.toggle('menu-open');$('.mobile-menu').setAttribute('aria-expanded',open);$('.mobile-menu').setAttribute('aria-label',open?'关闭菜单':'打开菜单');});
$$('.site-header nav a').forEach(a=>a.addEventListener('click',()=>{$('.site-header').classList.remove('menu-open');$('.mobile-menu').setAttribute('aria-expanded','false');}));
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTimeline();renderer3d?.pause();}else if(state.three)renderer3d?.resume();});
window.addEventListener('pagehide',()=>{stopTimeline();renderer3d?.dispose();});
setYear(state.year);layoutScene();
if(new URLSearchParams(location.search).get('view')==='3d') toggleThree();
