// Required integration regression: exact cached production GLBs, no browser/GPU.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/three.module.js';
import {CITY_PROPS} from '../dist/props.js';
import {streetSurfaceY} from '../dist/world.js';
import {survivingBounds} from './lib/skin-bounds.mjs';
import {loadCachedGLTF,importBrowserModule} from './lib/node-gltf.mjs';

const {FIGURE_BASES,groundFigure,normalizeStreetModel}=await importBrowserModule('dist/figure-grounding.js');
const {residentTiming,createNeighbors}=await importBrowserModule('dist/neighbors.js');
const manifest=JSON.parse(await readFile(new URL('../dist/assets/models/manifest.json',import.meta.url),'utf8'));
const context=new Proxy({},{get:()=>()=>{}});
globalThis.location={search:''};globalThis.document={createElement:()=>({getContext:()=>context})};

for(const [id,spec] of Object.entries(FIGURE_BASES)){
  const asset=manifest.props.find(a=>a.id===id),definition=CITY_PROPS.find(p=>p.id===id);
  const {scene:model,animations}=await loadCachedGLTF(asset),mesh=model.getObjectByName(spec.mesh);
  assert.ok(mesh.isSkinnedMesh&&mesh.skeleton.bones.length>=10,`${id}: real skin loaded`);
  assert.equal(mesh.bindMode,THREE.AttachedBindMode);
  model.updateMatrixWorld(true);
  const originalBounds=new THREE.Box3().setFromObject(model),center=originalBounds.getCenter(new THREE.Vector3());
  const oldContact=model.worldToLocal(mesh.localToWorld(new THREE.Vector3(0,spec.cutY,0))).y;
  const geometry=mesh.geometry,data=groundFigure(model,asset);
  assert.ok(Math.abs(data.contactY-oldContact)>.45,`${id}: fixture exposes old rigid-transform bug`);
  const {bounds,scale,contactY}=normalizeStreetModel(model,definition);
  assert.equal(mesh.geometry,geometry,'No copied geometry');
  assert.equal(scale,definition.height/(originalBounds.max.y-originalBounds.min.y),'Original scale preserved');
  assert.equal(model.position.x,-center.x);assert.equal(model.position.z,-center.z);

  // Exactly the runtime hierarchy: GLB -> normalized scale/yaw/floor -> root.
  const normalized=new THREE.Group(),root=new THREE.Group(),scene=new THREE.Scene();
  normalized.add(model);normalized.scale.setScalar(scale);normalized.rotation.y=definition.rotation||0;
  const position=definition.positions[0],floorOffset=streetSurfaceY(position[0],position[2]);
  normalized.position.y=floorOffset;root.position.fromArray(position);root.add(normalized);scene.add(root);
  root.updateMatrix();root.matrixAutoUpdate=false;normalized.updateMatrix();normalized.matrixAutoUpdate=false;
  const neighbors=createNeighbors(scene);
  neighbors.add({id,root,model:normalized,animations,height:(bounds.max.y-contactY)*scale,firstYear:2023,floorOffset});
  const timing=residentTiming(id),entry=neighbors.getTarget(id),mixer=entry.mixer;
  assert.equal(entry.shadow.position.y,position[1]+floorOffset+.002,'Actual neighbor shadow stays on the pavement');
  const errors=[];
  function check(label,expectedGround){
    scene.updateMatrixWorld(true);
    const actual=survivingBounds(mesh,spec.cutY).min.y,error=actual-expectedGround;errors.push(Math.abs(error));
    assert.ok(Math.abs(error)<=.01,`${id}/${label}: sole Y ${actual}, ground Y ${expectedGround}, error ${error} m`);
  }
  check('bind',position[1]+floorOffset);
  for(const clip of animations){
    mixer.stopAllAction();const action=mixer.clipAction(clip);action.reset().play();
    // Resident-specific phase, a full cycle, and the screenshot's time=12 pose.
    for(const t of [timing.phase,0,.5,1,1.5,2,2.5,3,3.5,12]){
      action.time=(t===12?t*timing.speed+timing.phase:t)%clip.duration;mixer.update(0);
      check(`${clip.name}@${t}`,position[1]+floorOffset);
    }
  }
  // Detect accidental model-space/world-space cancellation in a second placement.
  root.position.y=2.3;root.rotation.y=.7;root.scale.setScalar(1.25);root.updateMatrix();
  check('elevated/scaled/yawed placement',2.3+floorOffset*1.25);
  assert.equal(root.position.x,position[0]);assert.equal(root.position.z,position[2]);
  console.log(`${id}: max surviving-vertex ground error ${(Math.max(...errors)*1000).toFixed(4)} mm; removed erroneous lift ${((data.contactY-oldContact)*scale*100).toFixed(2)} cm`);
  neighbors.dispose();
}
console.log('Passed: four SHA-verified GLBs, real Draco/skin/bind matrices, runtime normalization/placements, full idle/talk cycles and screenshot poses within 1 cm of pavement.');
