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
renderer.extensions.has=()=>{throw new Error('Disabled cache must not inspect or allocate HDR targets');};calls=[];
const mobile=createStaticFrame(renderer,scene,new THREE.PerspectiveCamera(),{enabled:false});
mobile.resize();mobile.render();assert.equal(calls.length,1);assert.equal(calls[0].mask,3);assert.equal(mobile.settings.enabled,false);mobile.dispose();

// LDR cache works on a device without EXT_color_buffer_float. Keep real depth,
// avoid a second tone mapping pass, and preserve material shader customizations.
const lowScene=new THREE.Scene(),lowCamera=new THREE.PerspectiveCamera();
lowScene.background=background;
const surfaceMaterial=new THREE.MeshStandardMaterial();
const existingHook=shader=>{shader.fragmentShader+='\n// existing water/asset hook';};
surfaceMaterial.onBeforeCompile=existingHook;const existingKey=()=> 'test-hook';surfaceMaterial.customProgramCacheKey=existingKey;
const unlit=new THREE.ShaderMaterial({toneMapped:false});
lowScene.add(new THREE.Mesh(new THREE.BoxGeometry(),surfaceMaterial),new THREE.Mesh(new THREE.PlaneGeometry(),unlit));
renderer.toneMappingExposure=1.05;calls=[];width=390;height=844;
// The extension getter above deliberately throws if queried.
const ldr=createStaticFrame(renderer,lowScene,lowCamera,{low:true});ldr.resize();ldr.render();
assert.equal(calls.length,3);const lowTarget=calls[0].target;
assert.equal(lowTarget.texture.type,THREE.UnsignedByteType);assert.equal(lowTarget.samples,0);
assert.equal(lowTarget.depthTexture.type,THREE.UnsignedIntType);assert.equal(lowTarget.texture.generateMipmaps,false);
assert.equal(ldr.settings.bytes,390*844*8);assert.equal(ldr.settings.format,'rgba8');
const copyMaterial=calls[1].scene.children[0].material;
assert.equal(copyMaterial.toneMapped,false);assert.doesNotMatch(copyMaterial.fragmentShader,/#include <tonemapping_fragment>/);
assert.match(copyMaterial.fragmentShader,/gl_FragDepth=texture2D/);assert.match(copyMaterial.fragmentShader,/#include <colorspace_fragment>/);
const shader={uniforms:{},fragmentShader:'#include <tonemapping_fragment>\n#include <colorspace_fragment>'};
surfaceMaterial.onBeforeCompile(shader);
assert.match(shader.fragmentShader,/existing water\/asset hook/);
assert.match(shader.fragmentShader,/#ifndef TONE_MAPPING/);assert.match(shader.fragmentShader,/ACESFilmicToneMapping/);
assert.match(shader.fragmentShader,/#ifdef TONE_MAPPING\s*#include <tonemapping_fragment>/);
assert.equal(shader.uniforms.cityCacheExposure.value,1.05);assert.equal(surfaceMaterial.customProgramCacheKey(),'test-hook|city-ldr-v1');
assert.equal(unlit.onBeforeCompile,THREE.Material.prototype.onBeforeCompile,'Paintings and unlit terrain bypass tone mapping');
calls=[];ldr.render();assert.equal(calls.length,2);assert.equal(ldr.settings.rebuilds,1);
calls=[];ldr.render(true);assert.equal(calls.length,1);assert.equal(calls[0].mask,3);
renderer.toneMappingExposure=.9;calls=[];ldr.invalidate();ldr.render();
assert.equal(shader.uniforms.cityCacheExposure.value,.9);assert.equal(ldr.settings.rebuilds,2);
width=844;height=390;ldr.resize();calls=[];ldr.render();assert.equal(lowTarget.width,844);assert.equal(lowTarget.height,390);
assert.equal(lowCamera.layers.mask,3);assert.equal(lowScene.background,background);assert.equal(renderer.autoClear,true);
let lowFreed=false;lowTarget.addEventListener('dispose',()=>lowFreed=true);ldr.dispose();
assert.equal(lowFreed,true);assert.equal(surfaceMaterial.onBeforeCompile,existingHook);assert.equal(surfaceMaterial.customProgramCacheKey,existingKey);
console.log('Passed: float-independent RGBA8 cache, single-sample depth, pre-storage tone mapping, material hooks, night exposure, reuse, resize and cleanup.');

renderer.extensions.has=()=>true;
const unchangedHigh=createStaticFrame(renderer,lowScene,lowCamera);unchangedHigh.resize();unchangedHigh.render();
assert.equal(surfaceMaterial.onBeforeCompile,existingHook);assert.equal(surfaceMaterial.customProgramCacheKey,existingKey);
assert.equal(unchangedHigh.settings.format,'rgba16f');assert.equal(unchangedHigh.settings.samples,4);unchangedHigh.dispose();
