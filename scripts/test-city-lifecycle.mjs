// Exercise real city construction/lifecycle with GPU and network boundaries stubbed.
// This checks ownership and async races; it is not a browser/GPU benchmark.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {relative} from 'node:path';
import * as THREE from '../dist/vendor/three/three.module.js';
import {selectQualityProfile} from '../dist/quality-profile.js';
import {PRODUCTS} from '../dist/products.js';
import {instrumentCity,instrumentWalker,instrumentNeighbors} from './scene-shot-hooks.mjs';
let renderer,heldResolve,holdProp=false,rejectBuilding=false,released=0,closed=0,decoderDisposals=0,environmentBakes=0;
const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{})});
class Canvas extends EventTarget {constructor(){super();this.tagName='CANVAS';this.style={};}getContext(){return context;}remove(){this.removed=true;}}
globalThis.document={createElement:()=>new Canvas(),querySelector:()=>null};
globalThis.window=Object.assign(new EventTarget(),{innerWidth:390});globalThis.devicePixelRatio=3;globalThis.location={search:'?debug=1',href:'http://127.0.0.1:4173/'};
globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
const world=JSON.parse(await readFile('dist/navigation.json','utf8'));globalThis.fetch=async()=>({ok:true,json:async()=>world});
class Renderer{
  constructor(options){renderer=this;this.options=options;this.domElement=new Canvas();this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>8};this.extensions={has:()=>false};this.info={memory:{},render:{},reset(){}};this.renders=0;}
  setPixelRatio(value){this.ratio=value;}setSize(w,h){this.domElement.width=w*this.ratio;this.domElement.height=h*this.ratio;}
  setRenderTarget(){}getDrawingBufferSize(value){return value.set(this.domElement.width,this.domElement.height);}
  render(){this.renders++;}dispose(){this.disposed=true;}forceContextLoss(){}forceContextRestore(){}
  getContext(){return{getContextAttributes:()=>({antialias:this.options.antialias})};}
}
class Loader{
  setDRACOLoader(){}
  async loadAsync(url){
    if(rejectBuilding&&url.includes('chess'))throw new Error('Simulated network failure');
    if(holdProp&&url.includes('coffee'))await new Promise(resolve=>heldResolve=resolve);
    const scene=new THREE.Group(),geometry=new THREE.BoxGeometry(),texture=new THREE.Texture({width:2048,height:2048,close(){closed++;}}),material=new THREE.MeshStandardMaterial({map:texture});
    for(const resource of [geometry,texture,material])resource.addEventListener('dispose',()=>released++);
    scene.add(new THREE.Mesh(geometry,material));return {scene,animations:[]};
  }
}
class Draco{setWorkerLimit(){}setDecoderPath(){}dispose(){decoderDisposals++;}}
class Controls{constructor(){this.target=new THREE.Vector3();}update(){return false;}dispose(){}}
class Environment{dispose(){}}
class PMREM{fromScene(){environmentBakes++;return {texture:new THREE.Texture(),dispose(){}};}dispose(){}}
globalThis.cityTestDoubles={Renderer,Loader,Draco,Controls,Environment,PMREM};
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const realThree=new URL('../dist/vendor/three/three.module.js',import.meta.url).href;
const threeStub=moduleURL(`export * from ${JSON.stringify(realThree)};export const WebGLRenderer=globalThis.cityTestDoubles.Renderer,PMREMGenerator=globalThis.cityTestDoubles.PMREM;`);
const stubs=new Map([
  ['three/addons/loaders/GLTFLoader.js',['GLTFLoader','Loader']],['three/addons/loaders/DRACOLoader.js',['DRACOLoader','Draco']],
  ['three/addons/controls/OrbitControls.js',['OrbitControls','Controls']],['three/addons/environments/RoomEnvironment.js',['RoomEnvironment','Environment']]
]);
const cache=new Map();
const repository=fileURLToPath(new URL('../',import.meta.url));
const transforms=new Map([['city3d.js',instrumentCity],['walker.js',instrumentWalker],['neighbors.js',instrumentNeighbors]]);
async function moduleSource(url,{revision='working',instrument=false}={}){
  const cacheKey=`${revision}:${instrument}:${url.href}`;
  if(cache.has(cacheKey))return cache.get(cacheKey);
  const path=relative(repository,fileURLToPath(url));
  let source=revision==='working'?await readFile(url,'utf8'):execFileSync('git',['show',`${revision}:${path}`],{cwd:repository,encoding:'utf8'});
  const transform=transforms.get(path.split('/').at(-1));
  if(instrument&&transform){
    source=transform(source);
    const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8'});
    assert.equal(checked.status,0,`${revision}:${path}: ${checked.stderr}`);
  }
  for(const match of [...source.matchAll(/from\s+(['"])([^'"]+)\1/g)]){
    const spec=match[2];let target;
    if(spec==='three')target=url.pathname.endsWith('/city3d.js')?threeStub:realThree;
    else if(stubs.has(spec)){const [name,key]=stubs.get(spec);target=moduleURL(`export const ${name}=globalThis.cityTestDoubles.${key};`);}
    else target=await moduleSource(new URL(spec,url),{revision,instrument});
    source=source.replace(match[0],`from ${JSON.stringify(target)}`);
  }
  const result=moduleURL(source);cache.set(cacheKey,result);return result;
}
const {createCity3D}=await import(await moduleSource(new URL('../dist/city3d.js',import.meta.url)));
const container={clientWidth:390,clientHeight:844,appendChild(){}};
const manifest={models:[{id:'chess',url:'https://example.test/chess.glb'}],props:[{id:'coffee-cart',url:'https://example.test/coffee.glb'}]};
const quality=selectQualityProfile({search:'?quality=low'});
let losses=0,restorations=0;
const create=()=>createCity3D(container,manifest,PRODUCTS,()=>{},()=>{},{quality,onContextLost(){losses++;},onContextRestored(){restorations++;}});
let city=await create();await city.streetReady;city.setYear(2026);city.resume();
assert.equal(environmentBakes,0,'No float-target environment bake when unsupported in low mode');
assert.equal(renderer.options.antialias,false);assert.equal(renderer.ratio,1);assert.equal(renderer.shadowMap.enabled,false);
assert.equal(window.__mycityDebug.snapshot().loadedProps,1);
assert.equal(closed,2,'Decoded originals are closed before rendering');
const before=renderer.renders;
const lost=new Event('webglcontextlost',{cancelable:true});renderer.domElement.dispatchEvent(lost);
assert.equal(lost.defaultPrevented,true);assert.equal(losses,1);city.resume();assert.equal(renderer.renders,before);
renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));assert.equal(restorations,1);city.resume();assert.equal(renderer.renders,before,'Restoration waits for explicit retry');
city.dispose();assert.equal(renderer.disposed,true);assert.equal(renderer.domElement.removed,true);assert.equal(released,6,'Shared GLTF resources disposed exactly once');assert.equal(window.__mycityDebug,undefined);
city.dispose();assert.equal(released,6,'Dispose is idempotent');
// Retry/disposal while a street GLB is still parsing must not orphan its resources.
holdProp=true;city=await create();const oldRenderer=renderer;const decoders=decoderDisposals;city.dispose();
assert.equal(decoderDisposals,decoders,'Do not terminate a decoder while a promise still depends on it');
const beforeLate=released;heldResolve();await city.streetReady;
assert.equal(released,beforeLate+3,'Late GLTF geometry/material/texture are released');assert.equal(oldRenderer.disposed,true);
assert.ok(decoderDisposals>decoders);
holdProp=false;rejectBuilding=true;
const consoleError=console.error,expectedErrors=[];console.error=(...args)=>expectedErrors.push(args);
try{await assert.rejects(create(),/could not be loaded/);}finally{console.error=consoleError;}
assert.equal(expectedErrors.length,1);assert.equal(renderer.disposed,true);assert.equal(renderer.domElement.removed,true);
rejectBuilding=false;city=await create();await city.streetReady;city.resume();assert.ok(renderer.renders>0);city.dispose();
console.log('Passed: scene startup, context loss/restoration pause, retry, initial failure cleanup, idempotent disposal and late GLTF ownership.');

// Execute BOTH complete transformed module graphs, including git show main's
// city3d.js. V8 parses them and real Three cameras exercise lexical lookup; a
// syntax-only check cannot detect a helper outside camera's try-block scope.
for(const revision of ['main','working']){
  const {createCity3D:createInstrumented}=await import(await moduleSource(new URL('../dist/city3d.js',import.meta.url),{revision,instrument:true}));
  const instrumentedManifest={...manifest,characters:[{id:'hero',url:'https://example.test/hero.glb'}],props:[{id:'maker',url:'https://example.test/maker.glb'}]};
  const testCity=await createInstrumented(container,instrumentedManifest,PRODUCTS,()=>{},()=>{},{quality});
  try{
    await testCity.streetReady;testCity.setYear(2026);
    const shot=window.__mycityDebug.sceneShot;
    shot.set({player:[-8.8,0,4.7],camera:null,time:null});
    for(const position of [[13,2.35,8.2],[-13,2.35,8.2]]){
      const actual=shot.set({player:[-8.8,0,4.7],camera:{position,target:[position[0]*6,0,8.2],fov:48},time:12});
      assert.deepEqual(actual.camera.position,position,`${revision}: explicit camera setter resolves the actual scene camera`);
      assert.equal(actual.camera.fov,48);
      testCity.resume();testCity.pause(); // Also exercise applySceneShotCamera inside tick.
      assert.deepEqual(shot.state().camera.position,position);
    }
    const reset=shot.set({camera:null,player:[-8.8,0,4.7],time:null});
    assert.notDeepEqual(reset.camera.position,[-13,2.35,8.2],`${revision}: default shot clears a prior camera lock`);
    assert.equal(reset.time,null);
  }finally{testCity.dispose();}
}
console.log('Passed: transformed main and working city/walker/neighbors parse and execute default, east/west camera, fixed animation, render and reset hooks in the real lexical scope.');
