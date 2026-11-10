import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import * as THREE from '../dist/vendor/three/three.module.js';
import {HORIZON,HORIZON_GLSL,streetSurfaceY,contactFloorY} from '../dist/world.js';
import {instrumentCity,instrumentWalker,instrumentNeighbors} from './scene-shot-hooks.mjs';
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const three=new URL('../dist/vendor/three/three.module.js',import.meta.url).href;
async function browserModule(file){
  let source=await readFile(new URL('../dist/'+file,import.meta.url),'utf8');
  source=source.replace("'three'",JSON.stringify(three));
  source=source.replace("'./world.js?v=neighbors-3'",JSON.stringify(new URL('../dist/world.js',import.meta.url).href));
  source=source.replace("'./walking-world.js?v=neighbors-3'",JSON.stringify(new URL('../dist/walking-world.js',import.meta.url).href));
  source=source.replace("'./asset-memory.js'",JSON.stringify(new URL('../dist/asset-memory.js',import.meta.url).href));
  return import(moduleURL(source));
}
const {FIGURE_BASES,groundFigure}=await browserModule('figure-grounding.js');
const manifest=JSON.parse(await readFile('dist/assets/models/manifest.json','utf8'));
const audit=JSON.parse(await readFile('reference/figure-bases.json','utf8'));
for(const [id,spec] of Object.entries(FIGURE_BASES)){
  const asset=manifest.props.find(a=>a.id===id),measured=audit.figures.find(a=>a.id===id);
  assert.equal(spec.sha256,asset.sha256);assert.equal(measured.sha256,asset.sha256);
  assert.equal(measured.mesh,spec.mesh);assert.equal(measured.cutY,spec.cutY);
  const model=new THREE.Group(),placement=new THREE.Group();placement.scale.setScalar(.9994);placement.position.y=-.5;model.add(placement);
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,-.5,0,0,Math.fround(spec.cutY)+1e-7,0,0,.5,0],3)),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);mesh.name=spec.mesh;placement.add(mesh);
  let called=0;material.onBeforeCompile=()=>called++;material.customProgramCacheKey=()=> 'original';
  assert.equal(groundFigure(model,{...asset,sha256:'new-uninspected-file'}),null,'Never cut an uninspected revision');
  const data=groundFigure(model,asset);
  const soleY=geometry.attributes.position.getY(1);
  assert.ok(Math.abs(data.contactY-(soleY*.9994-.5))<1e-9,'Rigid contact respects the parent transform');
  model.position.y=-data.contactY;model.updateMatrixWorld(true);
  assert.ok(Math.abs(mesh.localToWorld(new THREE.Vector3(0,soleY,0)).y)<1e-9,'The first surviving vertex rests on the ground');
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>\n#include <skinning_vertex>',fragmentShader:'#include <clipping_planes_fragment>\n#include <color_fragment>'};
  material.onBeforeCompile(shader);assert.equal(called,1);assert.equal(shader.uniforms.cityFigureCut.value,spec.cutY);
  assert.ok(shader.vertexShader.indexOf('cityFigureHeight=position.y')<shader.vertexShader.indexOf('<skinning_vertex>'),'Clip follows rest geometry, not animated leg height');
  assert.match(shader.fragmentShader,/if\(cityFigureHeight<cityFigureCut\)discard/);
  assert.equal(mesh.geometry,geometry,'No extra model buffers or index copies');
  assert.equal(groundFigure(model,asset),null,'Idempotent preparation');
  geometry.dispose();material.dispose();
}
for(const id of ['hero','reader','cyclist','courier','barista','construction-worker']){
  assert.equal(groundFigure(new THREE.Group(),{id}),null,'Keep actual soles, chairs, wheels and raised walking feet');
  assert.equal(audit.figures.find(a=>a.id===id).cutY,null);
}

const {createAmbientLife}=await browserModule('ambient-life.js');
for(const options of [{low:true},{reducedMotion:true}]){
  const scene=new THREE.Scene(),life=createAmbientLife(scene,options);life.update(3,false);
  assert.equal(life.resources.length,0);assert.equal(scene.children.length,0,'Low/reduced motion allocates no new effects');
}
const scene=new THREE.Scene(),life=createAmbientLife(scene),meshes=[],points=[];
scene.traverse(o=>{if(o.isMesh)meshes.push(o);if(o.isPoints)points.push(o);});
assert.equal(meshes.length,1);assert.equal(points.length,1);
assert.equal(meshes[0].geometry.attributes.position.count/3,6);assert.equal(points[0].geometry.attributes.position.count,20);
for(const o of [...meshes,...points]){assert.equal(o.layers.mask,2);assert.equal(o.castShadow,false);assert.ok(!o.material.map);}
const camera=new THREE.PerspectiveCamera();
let renders=0;const renderer={extensions:{has:()=>true},capabilities:{maxSamples:4},toneMappingExposure:1,autoClear:true,setRenderTarget(){},getDrawingBufferSize(v){return v.set(1280,720);},render(){renders++;}};
const {createStaticFrame}=await browserModule('static-frame.js');const cache=createStaticFrame(renderer,scene,camera);cache.resize();cache.render();
for(let frame=0;frame<60;frame++){life.update(frame/60,false);cache.render();}
assert.equal(cache.settings.rebuilds,1,'Wind/birds must not invalidate the street cache');assert.equal(renders,3+60*2);
life.update(10,true);assert.equal(scene.children[0].visible,false);cache.dispose();life.resources.forEach(r=>r.dispose());

const {createLandscape}=await browserModule('landscape.js');const landscapeScene=new THREE.Scene();const landscape=createLandscape(landscapeScene,{minZ:6.9,maxZ:9.5});
assert.ok(HORIZON.fadeStart>32-1&&HORIZON.fadeEnd<90);
const terrain=landscapeScene.children[0].material,sky=landscapeScene.children.at(-1).material;
assert.ok(terrain.fragmentShader.includes(HORIZON_GLSL));assert.equal(terrain.depthWrite,false);
assert.match(sky.fragmentShader,/panel\(2\./,'The upstream mouth uses the existing river painting');
landscape.setNight(true);assert.equal(terrain.uniforms.night.value,1);assert.equal(sky.uniforms.night.value,1);landscape.dispose();

const city=await readFile('dist/city3d.js','utf8');
assert.doesNotMatch(city,/journalSign|journalCanvas|discoveryMarkers/,'No floating journal/dialog panels or building markers');
assert.match(city,/b\.tag\.visible=!walker\?\.active&&/,'Overview selection cannot leak a nameplate into walking');
assert.match(city,/diffuseColor\.a \*= cityHorizonAlpha/);assert.match(city,/canal\.material\.depthWrite=false/);
assert.doesNotMatch(city,/surface\(420.*435955/,'No opaque riverbed survives beneath the fading water');

assert.equal(streetSurfaceY(-8.8,4.7),-.018);assert.equal(streetSurfaceY(-4.5,2.9),-.014);assert.equal(streetSurfaceY(-10.5,12),-.025);
const world=JSON.parse(await readFile('dist/navigation.json','utf8'));
assert.equal(contactFloorY({x:10.7,y:1.8,z:8.2},world.bridge),1.8,'Bridge feet keep the measured deck height');
globalThis.window=new EventTarget();globalThis.document={querySelector:()=>null};globalThis.location={search:''};
const {createWalker}=await browserModule('walker.js');
const walkingScene=new THREE.Scene(),walkingCamera=new THREE.PerspectiveCamera(52,1,.1,360),model=new THREE.Group();
const body=new THREE.Mesh(new THREE.BoxGeometry(.4,1.55,.3),new THREE.MeshStandardMaterial());body.position.y=.775;model.add(body);
const discoveries=[],nearby=[];
const walker=createWalker({scene:walkingScene,camera:walkingCamera,canvas:new EventTarget(),gltf:{scene:model,animations:[]},world,onMode(){},onNearby:p=>nearby.push(p),onDiscovery:p=>discoveries.push(p)});
walker.setActive(true);walker.update(1/60);
assert.equal(nearby.at(-1).id,'chess','Spawn still has its proximity interaction without a world-space sign');
assert.ok(Math.abs(new THREE.Box3().setFromObject(model).min.y+.018)<1e-6,'Hero soles meet the visible street, not an invisible zero plane');
const key=(type,code)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,'code',{value:code});window.dispatchEvent(e);};
key('keydown','KeyE');walker.interact();assert.equal(discoveries.length,2,'Keyboard E and the tap callback both open the nearby place');
key('keydown','KeyW');for(let i=0;i<30;i++)walker.update(1/60);key('keyup','KeyW');
let settled=false;for(let i=0;i<180;i++)if(!walker.update(1/60)){settled=true;break;}
assert.ok(settled,'Follow position and gaze must settle for static caching');
const finalPosition=walkingCamera.position.clone(),finalRotation=walkingCamera.quaternion.clone();
for(let i=0;i<30;i++)assert.equal(walker.update(1/60),false);
assert.ok(finalPosition.equals(walkingCamera.position));assert.ok(finalRotation.equals(walkingCamera.quaternion));
walker.dispose();body.geometry.dispose();body.material.dispose();

for(const [file,transform] of [['city3d.js',instrumentCity],['walker.js',instrumentWalker],['neighbors.js',instrumentNeighbors]]){
  const code=transform(await readFile('dist/'+file,'utf8'));
  const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:code,encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
}
assert.throws(()=>instrumentCity('unsupported source'),/anchor missing/,'Never silently capture a wrong baseline view');
console.log('Passed: audited figure cuts/contact heights, protected supports, horizon blending, exploration UI, bounded dynamic effects, cache reuse and screenshot source compatibility.');
