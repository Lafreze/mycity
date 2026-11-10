// Run outside the macOS sandbox; this script never installs or launches a server.
// MEASURE_ORIGIN=http://127.0.0.1:4173 SHOT_DIR=output/natural-scene/before node scripts/shoot-scene.mjs
// Repeat against this branch with SHOT_DIR=output/natural-scene/after.
import {mkdir,writeFile,readdir,readFile,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {instrumentCity,instrumentWalker,instrumentNeighbors} from './scene-shot-hooks.mjs';
import {SHOTS} from './scene-shot-views.mjs';
import {runShotSequence,withTimeout} from './scene-shot-runner.mjs';

async function playwright(){
  if(process.env.PLAYWRIGHT_MODULE)return import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
  try{return await import('playwright');}catch{}
  const cache=`${homedir()}/.npm/_npx`;
  for(const entry of await readdir(cache).catch(()=>[])){
    const base=`${cache}/${entry}/node_modules/playwright`;
    try{if(JSON.parse(await readFile(`${base}/package.json`,'utf8')).version==='1.65.0')return import(pathToFileURL(`${base}/index.mjs`).href);}catch{}
  }
  throw new Error('Install Playwright or set PLAYWRIGHT_MODULE to its index.mjs');
}
async function executable(chromium){
  if(process.env.CHROMIUM_EXECUTABLE)return process.env.CHROMIUM_EXECUTABLE;
  try{await access(chromium.executablePath());return chromium.executablePath();}catch{}
  const cache=process.env.PLAYWRIGHT_BROWSERS_PATH||`${homedir()}/Library/Caches/ms-playwright`;
  const entries=await readdir(cache).catch(()=>[]);
  for(const entry of entries.filter(n=>/^chromium-\d+$/.test(n)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]))){
    for(const binary of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing','chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing','chrome-linux/chrome','chrome-linux64/chrome']){
      const path=`${cache}/${entry}/${binary}`;try{await access(path);return path;}catch{}
    }
  }
  throw new Error('No installed Chromium found; set CHROMIUM_EXECUTABLE.');
}
const origin=process.env.MEASURE_ORIGIN||'http://127.0.0.1:4173';
const output=process.env.SHOT_DIR||'output/natural-scene/after';
const selected=process.argv.find(a=>a.startsWith('--profiles='))?.split('=')[1]?.split(',')||['desktop','phone'];
assert.ok(selected.every(p=>['desktop','phone'].includes(p)),'Profiles: desktop,phone');
const {chromium,devices}=await playwright();await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chromium',executablePath:await executable(chromium),headless:!process.argv.includes('--headed'),args:['--enable-precise-memory-info']});
const results=[];
async function persist(result){
  results.push(result);
  await Promise.all([
    writeFile(`${output}/${result.profile}-${result.shot}.json`,JSON.stringify(result,null,2)+'\n'),
    writeFile(`${output}/measurements.json`,JSON.stringify(results,null,2)+'\n'),
  ]);
}
try{
  for(const profile of selected){
    const phone=profile==='phone';
    let context,state=null;
    const hookErrors=[];
    const onFailure=result=>console.error(JSON.stringify({profile,shot:result.shot,status:'failed',error:result.persistenceError||result.error}));
    try{
      // Match measure-mobile's iPhone 15 profile, explicit 390x844, DPR3, auto low.
      context=await browser.newContext({...(phone?{...devices['iPhone 15'],viewport:{width:390,height:844}}:{viewport:{width:1280,height:720},deviceScaleFactor:2}),locale:'zh-CN',timezoneId:'Asia/Tokyo',reducedMotion:'no-preference',serviceWorkers:'block'});
      // Existing debug API supplies renderer metrics but main has no camera
      // controls. Add those only in this page's JS responses, without modifying
      // the baseline checkout or needing its old script to know any new hook.
      for(const [file,transform] of [['city3d.js',instrumentCity],['walker.js',instrumentWalker],['neighbors.js',instrumentNeighbors]]){
        await context.route(`**/${file}*`,async route=>{
          let response;
          try{response=await route.fetch();await route.fulfill({status:response.status(),body:transform(await response.text()),headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'}});}
          catch(e){hookErrors.push(e.message);await (response?route.fulfill({response}):route.abort('failed')).catch(()=>{});}
        });
      }
      async function ensurePage(){
        if(state)return state;
        const page=await context.newPage();
        const current=state={page,errors:[],warnings:[],hookStart:hookErrors.length};
        page.setDefaultTimeout(30000);
        page.on('pageerror',e=>current.errors.push(e.message));page.on('crash',()=>current.errors.push('Page crashed'));
        page.on('console',m=>{if(m.type()==='error')current.errors.push(m.text());else if(m.type()==='warning')current.warnings.push(m.text());});
        current.evaluate=(fn,arg)=>withTimeout(page.evaluate(fn,arg),'Browser evaluation');
        // A fresh context avoids saved discoveries/night/UI state between runs.
        await page.goto(`${origin.replace(/\/$/,'')}/?debug=1${phone?'':'&quality=high'}`,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.body.dataset.sceneState==='error'||(document.body.dataset.sceneState==='ready'&&window.__mycityDebug?.ready),null,{timeout:300000});
        assert.deepEqual(hookErrors.slice(current.hookStart),[],'Unsupported source revision; screenshot controls could not be installed');
        assert.equal(await current.evaluate(()=>document.body.dataset.sceneState),'ready','Scene failed to initialize');
        await page.waitForFunction(()=>!!window.__mycityDebug?.sceneShot);
        await current.evaluate(()=>document.fonts.ready);
        current.cdp=await context.newCDPSession(page);
        return current;
      }
      await runShotSequence(SHOTS.filter(shot=>!phone||!shot.highOnly),{
        async capture(shot,result){
          Object.assign(result,{profile,browser:browser.version(),origin,instrumentedResponses:true,framingVersion:2,figure:shot.figure??null,measuredAt:new Date().toISOString(),screenshot:null,phase:'ready'});
          try{
            const {page,evaluate,cdp}=await ensurePage();
            result.phase='position';
            await evaluate(shot=>window.__mycityDebug.sceneShot.set({...shot,camera:shot.camera??null,time:null}),shot);
            result.phase='settle';await page.waitForTimeout(2500);
            result.phase='sample';
            const samples=result.samples=await evaluate(async()=>{
              const frames=[];for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);frames.push(window.__mycityDebug.frame());}return frames;
            });
            const triangles=samples.map(s=>s.render.triangles).sort((a,b)=>a-b);
            result.frameSample={count:60,trianglesMedian:triangles[30],trianglesP95:triangles[57],callsMax:Math.max(...samples.map(s=>s.render.calls)),cacheRebuilds:samples.at(-1).cacheRebuilds-samples[0].cacheRebuilds};
            result.phase='heap';
            result.heapBeforeGC=await evaluate(()=>performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null);
            await withTimeout(cdp.send('HeapProfiler.collectGarbage'),'Garbage collection');
            result.phase='snapshot';await evaluate(()=>window.__mycityDebug.sceneShot.set({time:12}));
            await evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
            Object.assign(result,await evaluate(()=>({snapshot:window.__mycityDebug.snapshot(),pose:window.__mycityDebug.sceneShot.state(),heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null,viewport:[innerWidth,innerHeight],devicePixelRatio,sceneState:document.body.dataset.sceneState,interaction:{visible:!document.querySelector('#walk-interact').hidden,label:document.querySelector('#walk-place').textContent}})));
            result.phase='screenshot';
            const path=`${output}/${profile}-${shot.name}.png`;
            await page.screenshot({path,animations:'disabled'});result.screenshot=path;
            if(shot.name==='entrance'){
              result.phase='interaction';
              assert.equal(result.interaction.visible,true,'Entrance still offers a nearby interaction');
              if(phone)await page.locator('#walk-interact').tap();else await page.keyboard.press('e');
              await page.locator('#product-dialog').waitFor({state:'visible'});
              result.interactionOpened=await page.locator('#detail-title').textContent();
              await page.locator('#close-detail').click();
            }
            result.phase='validation';
            assert.deepEqual(state.errors,[],'Browser errors (including shader compilation) must be reviewed');
            assert.equal(result.snapshot.failedProps,0,'A missing model invalidates a visual comparison');
            result.phase='complete';
            console.log(JSON.stringify({profile,shot:shot.name,quality:result.snapshot.quality.name,frameSample:result.frameSample,heapMiB:result.heap?.used/2**20}));
          }finally{
            result.errors=[...(state?.errors||[])];result.warnings=[...(state?.warnings||[])];result.hookErrors=hookErrors.slice(state?.hookStart??0);
          }
        },
        persist,onFailure,
        async recover(){
          // Discard the failed page, not its diagnostics. New pages get fresh
          // error arrays, so one shader/JS failure cannot poison later shots.
          const failed=state;state=null;
          if(failed)await withTimeout(failed.page.close(),'Failed-page cleanup');
        },
      });
    }catch(error){
      const result={profile,shot:'profile-setup',status:'failed',error:error.stack||String(error),hookErrors};
      onFailure(result);await persist(result);
    }finally{
      try{await context?.close();}catch(error){await persist({profile,shot:'profile-cleanup',status:'failed',error:error.stack||String(error)});}
    }
  }
}finally{await browser.close();}
const failed=results.filter(r=>r.status==='failed');
await writeFile(`${output}/summary.json`,JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,failures:failed.map(r=>({profile:r.profile,shot:r.shot,phase:r.phase,error:r.error||r.persistenceError}))},null,2)+'\n');
console.log(`Scene capture finished: ${results.length-failed.length} passed, ${failed.length} failed. Reports: ${output}`);
if(failed.length)process.exitCode=1;
