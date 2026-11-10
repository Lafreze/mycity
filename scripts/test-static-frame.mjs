import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/three.module.js';

// Resolve the browser's import-map entry to the same vendored Three.js in Node.
const source=(await readFile(new URL('../dist/static-frame.js',import.meta.url),'utf8'))
  .replace("from 'three'",`from '${new URL('../dist/vendor/three/three.module.js',import.meta.url)}'`);
const {createStaticFrame}=await import('data:text/javascript,'+encodeURIComponent(source));
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
scene.background=new THREE.Color('#e7ddcb');
const background=scene.background;
let target=null,calls=[],width=2560,height=1440;
const renderer={
  extensions:{has:()=>true},capabilities:{maxSamples:4},autoClear:true,
  setRenderTarget(value){target=value;},
  getDrawingBufferSize(value){return value.set(width,height);},
  render(s,c){calls.push({scene:s,mask:c.layers.mask,target,clear:this.autoClear,background:s.background});}
};
const cache=createStaticFrame(renderer,scene,camera);
cache.resize();cache.render();
assert.equal(calls.length,3,'First stationary frame renders static, depth copy and dynamic objects');
const staticTarget=calls[0].target;
assert.equal(calls[0].mask,1);assert.equal(staticTarget.width,width);assert.equal(staticTarget.height,height);
assert.equal(staticTarget.samples,4,'Retain multisample antialiasing');
assert.equal(staticTarget.texture.type,THREE.HalfFloatType,'Retain HDR before final tone mapping');
assert.ok(staticTarget.depthTexture,'Depth is retained so the riverbank/bridge occlude the boat');
assert.equal(calls[2].mask,2);assert.equal(calls[2].clear,false);assert.equal(calls[2].background,null);
assert.equal(camera.layers.mask,3);assert.equal(scene.background,background);assert.equal(renderer.autoClear,true);
calls=[];cache.render();
assert.equal(calls.length,2,'A second stationary frame must not redraw static high-density models');
assert.ok(calls.every(c=>c.target===null));
calls=[];cache.render(true);
assert.equal(calls.length,1,'Camera movement draws full original geometry directly');
assert.equal(calls[0].scene,scene);assert.equal(calls[0].mask,3);assert.equal(calls[0].target,null);
calls=[];cache.render();assert.equal(calls.length,3,'Rebuild after camera stops');
calls=[];cache.invalidate();cache.render();assert.equal(calls.length,3,'Rebuild after light/year/asset changes');
width=585;height=1266;cache.resize();calls=[];cache.render();
assert.equal(staticTarget.width,width);assert.equal(staticTarget.height,height);assert.equal(calls.length,3);
let released=false;staticTarget.addEventListener('dispose',()=>released=true);cache.dispose();assert.equal(released,true);
renderer.extensions.has=()=>false;calls=[];
const fallback=createStaticFrame(renderer,scene,new THREE.PerspectiveCamera());fallback.render();
assert.equal(calls.length,1);assert.equal(calls[0].mask,3,'Unsupported HDR devices still show water and boat');
console.log('Passed: static reuse, depth occlusion, full geometry during camera motion, invalidation, full resolution, antialiasing, disposal and fallback.');
