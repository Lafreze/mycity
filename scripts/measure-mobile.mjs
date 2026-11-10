// npm run dev, then: node scripts/measure-mobile.mjs
// Uses installed Playwright (or PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs).
// Results/screenshots are local, ignored output/mobile-memory/. No uploads.
import {mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
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
const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_EXECUTABLE,headless:!process.argv.includes('--headed'),args:['--enable-precise-memory-info']});
const results=[];
async function ready(page){await page.waitForFunction(()=>document.body.dataset.sceneState==='ready'&&window.__mycityDebug?.ready,{},{timeout:300000});}
try{
  for(const name of selected){
    const phone=name.startsWith('phone');
    const context=await browser.newContext(phone?{...devices['iPhone 15'],viewport:{width:390,height:844}}:{viewport:{width:1280,height:720},deviceScaleFactor:2});
    const page=await context.newPage(),errors=[],warnings=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')warnings.push(m.text());});
    page.on('crash',()=>errors.push('Page crashed'));
    const started=Date.now();
    const query=new URLSearchParams({debug:'1'});if(name==='phone-high')query.set('quality','high');if(name==='phone-low')query.set('quality','low');
    await page.goto(`${origin}/?${query}`,{waitUntil:'domcontentloaded'});
    try{await ready(page);}catch(error){await writeFile(`${output}/${name}-failure.json`,JSON.stringify({errors,warnings,state:await page.locator('body').getAttribute('data-scene-state')},null,2));throw error;}const loadMs=Date.now()-started;
    await page.waitForTimeout(5000);
    const beforeGC=await page.evaluate(()=>performance.memory?.usedJSHeapSize);
    const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
    const value=await page.evaluate(()=>({
      ...window.__mycityDebug.snapshot(),heapUsed:performance.memory?.usedJSHeapSize,heapTotal:performance.memory?.totalJSHeapSize,
      viewport:[innerWidth,innerHeight],devicePixelRatio,deviceMemory:navigator.deviceMemory,userAgent:navigator.userAgent,
      sceneState:document.body.dataset.sceneState,
    }));
    assert.equal(value.failedProps,0);assert.equal(value.loadedProps,value.totalProps);assert.equal(errors.length,0,errors.join('\n'));
    if(name==='desktop'||name==='phone-high'){
      assert.equal(value.quality.name,'high');assert.equal(value.antialias,true);assert.deepEqual(value.shadowMap,[4096,4096]);assert.equal(value.totalProps,40);
      assert.equal(value.staticFrame.enabled,true);assert.equal(value.staticFrame.samples,4);
      assert.equal(value.quality.pixelRatioCap,name==='desktop'?2:1.5);
    }else{assert.equal(value.quality.name,'low');assert.equal(value.antialias,false);assert.equal(value.staticFrame.enabled,false);assert.equal(value.totalProps,16);}
    await page.screenshot({path:`${output}/${name}.png`});
    const result={name,browser:browser.version(),loadMs,heapBeforeGC:beforeGC,...value,errors,warnings};
    results.push(result);await writeFile(`${output}/${name}.json`,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({name,loadMs,heapMiB:value.heapUsed/2**20,textureMiB:value.textureBytes/2**20,geometryMiB:value.geometryBytes/2**20,memory:value.memory,render:value.render}));
    if(process.argv.includes('--faults')&&value.quality.low){
      // Exercise loss both after readiness and while a subsequent city is loading.
      await page.evaluate(()=>window.__mycityDebug.loseContext());
      await page.waitForFunction(()=>document.body.dataset.sceneState==='error');
      assert.match(await page.locator('#error-message').textContent(),/轻量模式/);
      await page.evaluate(()=>window.__mycityDebug.restoreContext());
      await page.waitForFunction(()=>document.querySelector('#error-message').textContent.includes('绘图已恢复'));
      await page.locator('#retry').click();await ready(page);
      assert.equal(await page.locator('#scene3d canvas').count(),1);
      // A rejected essential asset must release the failed scene before retry.
      let fail=true;
      await page.route('**/models/arcade.*.glb*',route=>fail?route.abort('failed'):route.continue());
      await page.reload();await page.waitForFunction(()=>document.body.dataset.sceneState==='error',{},{timeout:120000});
      assert.match(await page.locator('#error-message').textContent(),/重试/);
      assert.equal(await page.locator('#scene3d canvas').count(),0,'Failed boot releases its renderer');
      fail=false;await page.locator('#retry').click();await ready(page);
      await page.unroute('**/models/arcade.*.glb*');
      console.log('Passed: real WebGL context loss/restoration, low-mode retry, model failure cleanup and successful retry.');
      await writeFile(`${output}/fault-checks.json`,JSON.stringify({contextLoss:true,contextRestoration:true,lowRetry:true,modelFailure:true,cleanup:true,retry:true},null,2)+'\n');
    }
    await context.close();
  }
  await writeFile(`${output}/measurements.json`,JSON.stringify(results,null,2)+'\n');
}finally{await browser.close();}
