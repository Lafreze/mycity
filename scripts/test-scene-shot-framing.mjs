import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import * as THREE from '../dist/vendor/three/three.module.js';
import {CITY_PROPS} from '../dist/props.js';
import {streetSurfaceY} from '../dist/world.js';
import {SHOTS} from './scene-shot-views.mjs';
import {instrumentWalker} from './scene-shot-hooks.mjs';
import {loadCachedGLTF,importBrowserModule} from './lib/node-gltf.mjs';
import {survivingBounds} from './lib/skin-bounds.mjs';
const {FIGURE_BASES,groundFigure,normalizeStreetModel}=await importBrowserModule('dist/figure-grounding.js');
const {residentTiming}=await importBrowserModule('dist/neighbors.js');
const manifest=JSON.parse(await readFile('dist/assets/models/manifest.json','utf8'));
const world=JSON.parse(await readFile('dist/navigation.json','utf8'));
const targets=new Map();

function checkFrame(shot,bounds,revision){
  for(const [profile,aspect] of [['desktop',1280/720],...(!shot.highOnly?[['phone',390/844]]:[])]){
    const camera=new THREE.PerspectiveCamera(shot.camera.fov,aspect,.1,360);
    camera.position.fromArray(shot.camera.position);camera.lookAt(...shot.camera.target);camera.updateMatrixWorld();
    const screen=new THREE.Box3();
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])screen.expandByPoint(new THREE.Vector3(x,y,z).project(camera));
    // Entire figure, including hands/supports, clear of edges and top/bottom HUD.
    assert.ok(screen.min.x>=-.84&&screen.max.x<=.84&&screen.min.y>=-.6&&screen.max.y<=.72&&screen.min.z> -1&&screen.max.z<1,`${revision}/${profile}/${shot.name} clips figure/HUD: ${JSON.stringify(screen)}`);
  }
}
function place(model,definition,revision='working'){
  const {scale}=normalizeStreetModel(model,definition),root=new THREE.Group(),normalized=new THREE.Group();
  normalized.add(model);normalized.scale.setScalar(scale);normalized.rotation.y=definition.rotation||0;
  normalized.position.y=definition.person&&revision==='working'?streetSurfaceY(definition.positions[0][0],definition.positions[0][2]):0;
  root.position.fromArray(definition.positions[0]);root.add(normalized);root.updateMatrixWorld(true);return {root,normalized};
}
for(const shot of SHOTS.filter(s=>s.figure&&s.figure!=='hero')){
  const asset=manifest.props.find(a=>a.id===shot.figure),definition=CITY_PROPS.find(a=>a.id===shot.figure);
  for(const revision of ['main','working']){
    const {scene:model,animations}=await loadCachedGLTF(asset);
    if(revision==='working')groundFigure(model,asset);
    const {root,normalized}=place(model,definition,revision),mixer=new THREE.AnimationMixer(normalized),idle=mixer.clipAction(animations.find(c=>c.name==='Idle'));
    const timing=revision==='working'?residentTiming(asset.id):{speed:1,phase:0};
    idle.play();idle.time=(12*timing.speed+timing.phase)%idle.getClip().duration;mixer.update(0);root.updateMatrixWorld(true);
    const bounds=new THREE.Box3();
    model.traverse(mesh=>{if(mesh.isMesh)bounds.union(survivingBounds(mesh,revision==='working'?FIGURE_BASES[asset.id]?.cutY:undefined));});
    checkFrame(shot,bounds,revision);
    if(revision==='working')targets.set(asset.id,bounds);
  }
}

// Exercise the actual baseline/current walker and the response-only idle seek.
// Previously seeking backward after a long capture left a fade at zero weight,
// photographing the hero's T-pose instead of Idle.
globalThis.window=Object.assign(new EventTarget(),{innerWidth:1280});globalThis.document={querySelector:()=>null};globalThis.location={search:''};
for(const revision of ['main','working']){
  let source=revision==='main'?execFileSync('git',['show','main:dist/walker.js'],{encoding:'utf8'}):await readFile('dist/walker.js','utf8');
  source=instrumentWalker(source).replace(/from\s+(['"])([^'"]+)\1/g,(_,quote,path)=>`from ${JSON.stringify(path==='three'?new URL('../dist/vendor/three/three.module.js',import.meta.url).href:new URL('../dist/'+path,import.meta.url).href)}`);
  const {createWalker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const asset=manifest.characters.find(a=>a.id==='hero'),gltf=await loadCachedGLTF(asset),scene=new THREE.Scene(),shot=SHOTS.find(s=>s.figure==='hero');
  const walker=createWalker({scene,camera:new THREE.PerspectiveCamera(),canvas:new EventTarget(),gltf,world,motion:asset.locomotion,onMode(){},onNearby(){},onDiscovery(){}});
  walker.setActive(true);walker.sceneShotPose(shot.player);walker.sceneShotTime(12);scene.updateMatrixWorld(true);
  const bones=[];gltf.scene.traverse(o=>{if(o.isBone)bones.push(o);});assert.ok(bones.length>=20);
  const pose=bones.map(b=>b.quaternion.clone());
  for(let i=0;i<180;i++)walker.update(.1);
  walker.sceneShotTime(12);scene.updateMatrixWorld(true);
  bones.forEach((b,i)=>assert.ok(1-Math.abs(b.quaternion.dot(pose[i]))<1e-6,`${revision}: deterministic idle pose after backward seek`));
  const bounds=new THREE.Box3();gltf.scene.traverse(mesh=>{if(mesh.isMesh)bounds.union(survivingBounds(mesh));});
  checkFrame(shot,bounds,revision);walker.dispose();
}

// Actual nearby occluders, including the cyclist that filled the former florist
// image. Check ground/torso/head sightlines against their real decoded triangles.
const occluders=[];
for(const id of ['cyclist','flower-cart','market-crates','park-bench','litter-bin','hydrangea-pot','street-clock','street-lamp']){
  const definition=CITY_PROPS.find(d=>d.id===id),asset=manifest.props.find(a=>a.id===id);
  for(let i=0;i<definition.positions.length;i++){
    const {scene:model}=await loadCachedGLTF(asset);
    const {root}=place(model,{...definition,positions:[definition.positions[i]],rotation:definition.rotations?.[i]??definition.rotation});
    root.name=id;occluders.push(root);
  }
}
for(const id of ['florist','street-musician']){
  const shot=SHOTS.find(s=>s.figure===id),bounds=targets.get(id),center=bounds.getCenter(new THREE.Vector3()),origin=new THREE.Vector3(...shot.camera.position);
  for(const t of [0,.25,.5,.75,1]){
    const target=center.clone();target.y=THREE.MathUtils.lerp(bounds.min.y+.02,bounds.max.y-.02,t);
    const direction=target.clone().sub(origin),distance=direction.length(),ray=new THREE.Raycaster(origin,direction.normalize(),.05,distance-.02);
    const hits=ray.intersectObjects(occluders,true);
    assert.equal(hits.length,0,`${id} sightline at height ${t} occluded by ${hits[0]?.object.name}`);
  }
}
console.log('Passed: full figures/feet/HUD margins for both revisions and profiles, deterministic hero idle after backward seek, florist/musician sightlines clear of actual nearby props.');
