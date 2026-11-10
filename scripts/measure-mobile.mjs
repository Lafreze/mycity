// npm run dev, then: node scripts/measure-mobile.mjs
// Uses installed Playwright (or PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs).
// Results/screenshots are local, ignored output/mobile-memory/. No uploads.
import {mkdir,writeFile,readdir,readFile,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
async function playwright(){
  if(process.env.PLAYWRIGHT_MODULE)return import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  try{return await import('playwright');}catch{}
  const cache=`${homedir()}/.npm/_npx`;
  for(const entry of await readdir(cache)){
    const base=`${cache}/${entry}/node_modules/playwright`;
    try{if(JSON.parse(await readFile(`${base}/package.json`,'utf8')).version==='1.65.0')return import(pathToFileURL(`${base}/index.mjs`).href);}catch{}
  }throw new Error('Install Playwright or set PLAYWRIGHT_MODULE to its index.mjs');
}
const {chromium,devices}=await playwright();
const output='output/mobile-memory';await mkdir(output,{recursive:true});
const origin=process.env.MEASURE_ORIGIN||'http://127.0.0.1:4173';
const selected=process.argv.find(a=>a.startsWith('--profiles='))?.split('=')[1]?.split(',')||['phone-high','phone-auto','desktop'];
// A preinstalled Chromium can have a different revision from the Playwright API.
async function chromiumExecutable(){
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
const browser=await chromium.launch({channel:'chromium',executablePath:await chromiumExecutable(),headless:!process.argv.includes('--headed'),args:['--enable-precise-memory-info']});
const results=[];
async function ready(page){await page.waitForFunction(()=>document.body.dataset.sceneState==='ready'&&window.__mycityDebug?.ready,{},{timeout:300000});}
try{
  for(const name of selected){
    const phone=name.startsWith('phone');
    const context=await browser.newContext(phone?{...devices['iPhone 15'],viewport:{width:390,height:844}}:{viewport:{width:1280,height:720},deviceScaleFactor:2});
    const page=await context.newPage(),errors=[],warnings=[],consoleErrors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());if(m.type()==='error'||m.type()==='warning')warnings.push(m.text());});
    page.on('crash',()=>errors.push('Page crashed'));
    const started=Date.now();
    const query=new URLSearchParams({debug:'1'});if(name==='phone-high')query.set('quality','high');if(name==='phone-low')query.set('quality','low');
    await page.goto(`${origin}/?${query}`,{waitUntil:'domcontentloaded'});
    try{await ready(page);}catch(error){await writeFile(`${output}/${name}-failure.json`,JSON.stringify({errors,warnings,state:await page.locator('body').getAttribute('data-scene-state')},null,2));throw error;}const loadMs=Date.now()-started;
    await page.waitForTimeout(5000);
    // Sample a window, not a lucky single frame immediately after a cache rebuild.
    const frames=await page.evaluate(async()=>{
      const samples=[];for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);samples.push(window.__mycityDebug.frame());}return samples;
    });
    const triangles=frames.map(f=>f.render.triangles).sort((a,b)=>a-b);
    const frameSample={frames:frames.length,trianglesMedian:triangles[30],trianglesP95:triangles[57],callsMax:Math.max(...frames.map(f=>f.render.calls)),cacheRebuilds:frames.at(-1).cacheRebuilds-frames[0].cacheRebuilds};
    const beforeGC=await page.evaluate(()=>performance.memory?.usedJSHeapSize);
    const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
    const value=await page.evaluate(()=>({
      ...window.__mycityDebug.snapshot(),heapUsed:performance.memory?.usedJSHeapSize,heapTotal:performance.memory?.totalJSHeapSize,
      viewport:[innerWidth,innerHeight],devicePixelRatio,deviceMemory:navigator.deviceMemory,userAgent:navigator.userAgent,
      sceneState:document.body.dataset.sceneState,
    }));
    const measuredAt=new Date().toISOString();
    // Preserve current readings even if a budget assertion fails; older successful
    // runs remain separately available in the original per-profile files.
    await writeFile(`${output}/${name}-latest.json`,JSON.stringify({name,measuredAt,browser:browser.version(),...value,frameSample,errors,warnings},null,2)+'\n');
    assert.equal(value.failedProps,0);assert.equal(value.loadedProps,value.totalProps);assert.equal(errors.length,0,errors.join('\n'));assert.equal(consoleErrors.length,0,consoleErrors.join('\n'));
    if(name==='desktop'||name==='phone-high'){
      assert.equal(value.quality.name,'high');assert.equal(value.antialias,true);assert.deepEqual(value.shadowMap,[4096,4096]);assert.equal(value.totalProps,40);
      assert.equal(value.staticFrame.enabled,true);assert.equal(value.staticFrame.samples,4);assert.equal(value.staticFrame.format,'rgba16f');
      assert.equal(value.releasedGeometryBytes,0,'High mode keeps its CPU arrays');assert.equal(value.geometryCPUBytes,value.geometryBytes);
      assert.equal(value.quality.pixelRatioCap,name==='desktop'?2:1.5);
    }else{
      assert.equal(value.quality.name,'low');assert.equal(value.antialias,false);assert.equal(value.shadowMap,null);
      assert.equal(value.staticFrame.enabled,true);assert.equal(value.staticFrame.format,'rgba8');assert.equal(value.staticFrame.samples,0);
      assert.equal(value.staticFrame.bytes,390*844*8);assert.equal(value.totalProps,9);assert.deepEqual([...value.residents].sort(),['maker','reader']);
      assert.ok(value.geometryBytes<215*2**20,'Keep total geometry budget visible even after releasing CPU arrays');
      assert.ok(value.textureBytes<110*2**20);assert.ok(value.releasedGeometryBytes>32*2**20,'Visible static meshes must release substantial CPU storage');
      assert.ok(value.geometryCPUBytes<value.geometryBytes*.8,'CPU storage should fall at least 20% below the geometry budget');
      assert.ok(frameSample.trianglesMedian>=600000,'Hero must still render');
      assert.ok(frameSample.trianglesP95<1500000,'Steady low frames should be well below the old ~2M high-mode baseline');
      assert.ok(frameSample.callsMax<40);assert.equal(frameSample.cacheRebuilds,0,'Idle water and residents must reuse the street cache');
    }
    await page.screenshot({path:`${output}/${name}.png`});
    const result={name,measuredAt,browser:browser.version(),loadMs,heapBeforeGC:beforeGC,...value,frameSample,errors,warnings};
    results.push(result);await writeFile(`${output}/${name}.json`,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({name,loadMs,heapMiB:value.heapUsed/2**20,textureMiB:value.textureBytes/2**20,geometryMiB:value.geometryBytes/2**20,geometryCPUMiB:value.geometryCPUBytes/2**20,releasedGeometryMiB:value.releasedGeometryBytes/2**20,frameSample,memory:value.memory,render:value.render}));
    if(process.argv.includes('--faults')&&value.quality.low){
      // Exercise a real cache invalidation (including night exposure) and resize.
      const builds=value.staticFrame.rebuilds;
      await page.locator('#night-toggle').click();await page.waitForTimeout(500);
      assert.ok(await page.evaluate(()=>window.__mycityDebug.snapshot().staticFrame.rebuilds)>builds);
      await page.screenshot({path:`${output}/${name}-night.png`});
      await page.setViewportSize({width:844,height:390});await page.waitForTimeout(500);
      assert.deepEqual(await page.evaluate(()=>window.__mycityDebug.snapshot().drawingBuffer),[844,390]);
      await page.setViewportSize({width:390,height:844});await page.locator('#night-toggle').click();
      // Force real movement and return to rest after arrays have been released.
      const canvas=page.locator('#scene3d canvas');const rect=await canvas.boundingBox();
      await page.mouse.move(rect.x+rect.width*.65,rect.y+rect.height*.4);await page.mouse.down();
      await page.mouse.move(rect.x+rect.width*.35,rect.y+rect.height*.4,{steps:12});await page.mouse.up();
      await page.waitForTimeout(2000);
      assert.equal(errors.length,0,errors.join('\n'));assert.equal(consoleErrors.length,0,consoleErrors.join('\n'));
      // The scene must reload after loss: released arrays cannot be re-uploaded.

      await page.evaluate(()=>window.__mycityDebug.loseContext());
      await page.waitForFunction(()=>document.body.dataset.sceneState==='error');
      assert.match(await page.locator('#error-message').textContent(),/轻量模式/);
      await page.evaluate(()=>window.__mycityDebug.restoreContext());
      await page.waitForFunction(()=>document.querySelector('#error-message').textContent.includes('绘图已恢复'));
      await page.locator('#retry').click();await ready(page);
      assert.equal(await page.locator('#scene3d canvas').count(),1);
      await page.waitForTimeout(2000);
      assert.ok(await page.evaluate(()=>window.__mycityDebug.snapshot().releasedGeometryBytes)>0);
      assert.equal(errors.length,0,errors.join('\n'));
      // A rejected essential asset must release the failed scene before retry.
      let fail=true;
      await page.route('**/models/arcade.*.glb*',route=>fail?route.abort('failed'):route.continue());
      await page.reload();await page.waitForFunction(()=>document.body.dataset.sceneState==='error',{},{timeout:120000});
      assert.match(await page.locator('#error-message').textContent(),/重试/);
      assert.equal(await page.locator('#scene3d canvas').count(),0,'Failed boot releases its renderer');
      fail=false;await page.locator('#retry').click();await ready(page);
      await page.unroute('**/models/arcade.*.glb*');
      console.log('Passed: real WebGL context loss/restoration, low-mode retry, model failure cleanup and successful retry.');
      await writeFile(`${output}/fault-checks.json`,JSON.stringify({nightCache:true,resize:true,movementAfterRelease:true,contextLoss:true,contextRestoration:true,lowRetry:true,modelFailure:true,cleanup:true,retry:true},null,2)+'\n');
    }
    await context.close();
  }
  await writeFile(`${output}/measurements.json`,JSON.stringify(results,null,2)+'\n');
}finally{await browser.close();}
