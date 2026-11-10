import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/three.module.js';
import {releaseStaticGeometryAfterUpload,objectResources,resourceBytes,disposeResources} from '../dist/asset-memory.js';

// Run the actual vendored attribute upload/cache implementation against a GL
// boundary stub, including its callback timing and subsequent buffer reuse.
const vendor=await readFile(new URL('../dist/vendor/three/three.module.js',import.meta.url),'utf8');
const start=vendor.indexOf('function WebGLAttributes( gl ) {');
const end=vendor.indexOf('\n}\n',start)+3;
const {WebGLAttributes}=await import('data:text/javascript;base64,'+Buffer.from(vendor.slice(start,end)+'\nexport {WebGLAttributes};\n//# sourceURL=vendored-WebGLAttributes-test.js').toString('base64'));
let uploads=0,deleted=0;
const gl={FLOAT:5126,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,createBuffer:()=>({}),bindBuffer(){},bufferData(target,array){assert.ok(array.byteLength);uploads++;},deleteBuffer(){deleted++;}};
const gpu=WebGLAttributes(gl),geometry=new THREE.BoxGeometry(),root=new THREE.Group(),material=new THREE.MeshStandardMaterial();
root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));
const before=resourceBytes(objectResources(root)),beforeBounds=new THREE.Box3().setFromObject(root);
let previousCallbacks=0;geometry.attributes.position.onUpload(()=>previousCallbacks++);
releaseStaticGeometryAfterUpload(root);
assert.ok(geometry.boundingBox&&geometry.boundingSphere);
const attributes=[geometry.index,...Object.values(geometry.attributes)];
for(const attribute of attributes){
  assert.ok(attribute.array,'Do not free before bufferData');const count=attribute.count;
  gpu.update(attribute,attribute===geometry.index?34963:34962);
  assert.equal(attribute.array,null);assert.equal(attribute.count,count);assert.ok(gpu.get(attribute).bytesPerElement);
}
assert.equal(previousCallbacks,1);assert.equal(uploads,attributes.length);
for(const attribute of attributes)gpu.update(attribute,34962);
assert.equal(uploads,attributes.length,'A later draw uses cached GPU buffers without reading the null arrays');
assert.deepEqual(new THREE.Box3().setFromObject(root),beforeBounds,'Cached bounds still support clone/layout queries');
assert.deepEqual(new THREE.Box3().setFromObject(root.clone(true)),beforeBounds);
const after=resourceBytes(objectResources(root));
assert.equal(after.geometryBytes,before.geometryBytes,'GPU byte budget must not disappear when CPU arrays are released');
assert.equal(after.geometryCPUBytes,0);assert.equal(after.releasedGeometryBytes,before.geometryBytes);
releaseStaticGeometryAfterUpload(root); // Idempotent, no recomputation from null arrays.
let released=0;geometry.addEventListener('dispose',()=>{released++;attributes.forEach(a=>gpu.remove(a));});
disposeResources(objectResources(root));assert.equal(released,1);assert.equal(deleted,attributes.length);

for(const kind of ['skinned','morph','dynamic','proxy','instanced','interleaved','wireframe']){
  const g=new THREE.BoxGeometry();let mesh=new THREE.Mesh(g,material);
  if(kind==='skinned')mesh=new THREE.SkinnedMesh(g,material);
  if(kind==='morph')g.morphAttributes.position=[g.attributes.position.clone()];
  if(kind==='dynamic')g.attributes.position.setUsage(THREE.DynamicDrawUsage);
  if(kind==='wireframe')mesh.material=new THREE.MeshBasicMaterial({wireframe:true});
  if(kind==='proxy')mesh.userData.pickProxy=true;
  if(kind==='instanced')mesh=new THREE.InstancedMesh(g,material,1);
  if(kind==='interleaved')g.setAttribute('position',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(9),3),3,0));
  const array=g.attributes.position.array;releaseStaticGeometryAfterUpload(mesh);
  for(const a of [g.index,...Object.values(g.attributes)])gpu.update(a,34962);
  assert.equal(g.attributes.position.array,array,`${kind} CPU data must be retained`);
  assert.equal(resourceBytes(objectResources(mesh)).releasedGeometryBytes,0);
}
// Even if a static mesh is visited first, geometry shared with a skinned mesh is unsafe.
const shared=new THREE.BoxGeometry(),mixed=new THREE.Group();mixed.add(new THREE.Mesh(shared,material),new THREE.SkinnedMesh(shared,material));
releaseStaticGeometryAfterUpload(mixed);gpu.update(shared.attributes.position,34962);assert.ok(shared.attributes.position.array);
// Proxy raycasting still works; proxies are separate from the releasable GLTFs.
const proxy=new THREE.Mesh(new THREE.BoxGeometry(),material);proxy.userData.pickProxy=true;
releaseStaticGeometryAfterUpload(proxy);gpu.update(proxy.geometry.attributes.position,34962);
assert.ok(new THREE.Raycaster(new THREE.Vector3(0,0,3),new THREE.Vector3(0,0,-1)).intersectObject(proxy).length);
console.log('Passed: actual buffer upload/cache reuse after CPU release, retained bounds, shared ownership, disposal, skin/morph/dynamic safeguards and proxy raycasting.');
