import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/three.module.js';
import * as projection from '../dist/landscape-projection.js';
import {CANAL} from '../dist/world.js';
import {BOAT_WATERLINE} from '../dist/boat-waterline.js';
import {selectQualityProfile} from '../dist/quality-profile.js';
import {importBrowserModule} from './lib/node-gltf.mjs';
import {assertDirectiveLines,assertTerminated,assembleMaterial,validateOffline} from './lib/shader-audit.mjs';

const root=new URL('../dist/',import.meta.url),sources=new Map();
for(const path of await readdir(root,{recursive:true}))if(path.endsWith('.js')&&!path.startsWith('vendor/'))sources.set(path,await readFile(new URL(path,root),'utf8'));
// Fail when a new injection/material owner is added without extending this
// inventory. Vendored shaders are exercised through Three's real builder below.
const inventory=pattern=>[...sources].map(([p,s])=>[p,[...s.matchAll(pattern)].length]).filter(([,n])=>n).sort(([a],[b])=>a.localeCompare(b));
assert.deepEqual(inventory(/\.onBeforeCompile\s*=/g),[['city3d.js',1],['figure-grounding.js',1],['static-frame.js',2]]);
assert.deepEqual(inventory(/new THREE\.(?:Raw)?ShaderMaterial\(/g),
  [['ambient-life.js',2],['city3d.js',1],['landscape.js',2],['neighbors.js',1],['static-frame.js',1],['walker.js',1]]);
for(const [name,value] of Object.entries(projection))if(name.endsWith('_GLSL'))assertTerminated(value,name);
const number='(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';
for(const [file,source] of sources)for(const match of source.matchAll(new RegExp(`smoothstep\\(\\s*${number}\\s*,\\s*${number}\\s*,`,'g'))){
  assert.ok(Math.fround(Number(match[1]))<Math.fround(Number(match[2])),`${file}: literal smoothstep edges must be strictly ordered`);
}

const {LANDSCAPE,WATER_JOIN_GLSL}=projection;
const {createLandscape}=await importBrowserModule('dist/landscape.js');
const {createAmbientLife}=await importBrowserModule('dist/ambient-life.js');
const {FIGURE_BASES,groundFigure}=await importBrowserModule('dist/figure-grounding.js');
const {createStaticFrame}=await importBrowserModule('dist/static-frame.js');
const city=sources.get('city3d.js'),start='  canal.material.onBeforeCompile=',end='  // Pavement seams';
assert.equal(city.split(start).length,2);assert.equal(city.split(end).length,2);
// Execute the exact runtime closure and program-key assignment, with the same
// lexical bindings. Do not maintain a separate handwritten copy of the hook.
const installWater=new Function('THREE','LANDSCAPE','WATER_JOIN_GLSL','BOAT_WATERLINE','landscape','quality','canal',city.slice(city.indexOf(start),city.indexOf(end)));
function inlineMaterial(file,name){
  const match=sources.get(file).match(new RegExp(`const ${name}=(new THREE\\.ShaderMaterial\\([^\\n]+\\));`));
  assert.ok(match,`${file}: material anchor changed; update audit`);
  return new Function('THREE',`return ${match[1]};`)(THREE);
}
function figure(id){
  const spec=FIGURE_BASES[id],root=new THREE.Group(),geometry=new THREE.BoxGeometry();
  const count=geometry.attributes.position.count,weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial()),bone=new THREE.Bone();
  mesh.name=spec.mesh;mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));root.add(mesh);
  assert.ok(groundFigure(root,{id,sha256:spec.sha256}));
  return mesh;
}

const variants=[];
for(const low of [false,true]){
  const quality=selectQualityProfile({search:low?'?quality=low':'?quality=high'}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  scene.fog=new THREE.Fog('#ddd4be',55,170);
  if(!low){const env=new THREE.Texture({height:256});env.mapping=THREE.CubeUVReflectionMapping;scene.environment=env;}
  const landscape=createLandscape(scene,CANAL,quality),[ground,sky]=scene.children;
  ground.name='ground';sky.name='sky';
  const water=new THREE.Mesh(new THREE.PlaneGeometry(40,2.6),new THREE.MeshStandardMaterial({transparent:true,depthWrite:false}));
  water.name='water';water.layers.set(1);scene.add(water);
  installWater(THREE,LANDSCAPE,WATER_JOIN_GLSL,BOAT_WATERLINE,landscape,quality,water);
  // Check all four hash-specific material patches in each profile, even though
  // low loads only the maker in normal gameplay. No assets are downloaded.
  for(const id of Object.keys(FIGURE_BASES)){const mesh=figure(id);mesh.name=id;mesh.layers.set(1);scene.add(mesh);}
  // Explicit chaining regression: a pre-existing cut hook followed by the LDR
  // cache wrapper, with both direct-screen and cached tone-mapping branches.
  const chained=figure('maker');chained.name='figure-cache-chain';scene.add(chained);
  for(const Type of [THREE.MeshStandardMaterial,THREE.MeshPhysicalMaterial]){
    const texture=new THREE.Texture(),material=new Type({map:texture,normalMap:texture,roughnessMap:texture});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);mesh.name=Type.name+'-cache';scene.add(mesh);
  }
  for(const [file,name,label] of [['city3d.js','fireflyMaterial','fireflies'],['walker.js','shadowMaterial','hero-shadow'],['neighbors.js','shadowMaterial','resident-shadow']]){
    const object=new THREE.Mesh(new THREE.PlaneGeometry(),inlineMaterial(file,name));object.layers.set(1);object.name=label;scene.add(object);
  }
  const ambient=createAmbientLife(scene,quality);
  for(const [i,material] of ambient.resources.filter(r=>r.isMaterial).entries()){
    scene.traverse(o=>{if(o.material===material)o.name=i?'birds':'seeds';});
  }
  let copy;
  const renderer={extensions:{has:()=>true},capabilities:{maxSamples:4},toneMappingExposure:1.05,autoClear:true,
    setRenderTarget(){},getDrawingBufferSize:v=>v.set(low?390:1280,low?844:720),render(s){if(s!==scene)copy=s.children[0];}};
  const cache=createStaticFrame(renderer,scene,camera,{low});cache.resize();cache.render();
  assert.ok(copy);copy.name='cache-copy';
  const objects=[];scene.traverse(o=>{if(o.material)objects.push(o);});objects.push(copy);
  assert.equal(objects.filter(o=>o.material.isShaderMaterial).length,low?6:8,'Every custom material constructor is covered');
  for(const object of objects){
    const material=object.material;
    if(object===water)assert.notEqual(material.onBeforeCompile,THREE.Material.prototype.onBeforeCompile);
    if(object.name.endsWith('-cache'))assert.equal(material.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile,low,'Only low wraps cached lit materials');
    for(const cached of object===copy||object.layers.isEnabled(1)?[false]:[false,true]){
      const label=`${quality.name}-${object.name}-${cached?'cached':'screen'}`;
      const result=assembleMaterial(object,scene,{low,cached,label});variants.push(result);
      if(FIGURE_BASES[object.name])assert.equal(result.replacements,2,'Both figure-cut stages are actually patched');
      if(object===chained)assert.equal(result.replacements,low?3:2,'LDR wrapper preserves both earlier figure replacements');
      if(object.name.endsWith('-cache'))assert.equal(result.replacements,low?1:0,'Exercise the cached lit-material replacement');
      if(object===water){
        assert.equal(result.replacements,4,'Exercise every water replacement in both quality branches');
        assert.match(result.frag,/\}\n#define CITY_AUDIT_fragmentShader_START\n#define STANDARD/);
        // Recreate the reported separator loss in assembled output. The audit
        // must catch it without a WebGL context or optional external compiler.
        const broken=result.frag.replace('}\n#define CITY_AUDIT_fragmentShader_START','}#define CITY_AUDIT_fragmentShader_START');
        assert.notEqual(broken,result.frag);assert.throws(()=>assertDirectiveLines(broken,'reported water regression'),/code before preprocessor/);
      }
    }
  }
  cache.dispose();landscape.dispose();
}
await validateOffline(variants);
console.log(`Passed: ${variants.length} assembled shader variants across high/low; every material hook, chained LDR/direct paths, newline-terminated injections and preprocessor boundaries.`);
