import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import * as THREE from '../dist/vendor/three/three.module.js';
import {CANAL,BOAT} from '../dist/world.js';
import {LANDSCAPE as L,PAINTING_GLSL,RIVER_SKIRT_GLSL,WATER_JOIN_GLSL} from '../dist/landscape-projection.js';
import {BOAT_WATERLINE} from '../dist/boat-waterline.js';
import {SHOTS} from './scene-shot-views.mjs';
import {importBrowserModule} from './lib/node-gltf.mjs';

const manifest=JSON.parse(await readFile('dist/assets/models/manifest.json','utf8'));
const audit=JSON.parse(await readFile('reference/landscape-colours.json','utf8'));
assert.equal(audit.sha256,manifest.environment.find(a=>a.id===audit.source).sha256);
for(const sample of audit.samples)assert.equal(L[sample.name],sample.hex,'Runtime palette must match the audited PNG samples');

// Recheck pixel medians whenever the optional local painting cache is present.
// The manifest/hash/palette contract above always runs, including fresh clones.
const png=await readFile('output/natural-scene/assets/valley.png').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(png){
  assert.equal(createHash('sha256').update(png).digest('hex'),audit.sha256);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20),stride=width*3,idat=[];
  assert.deepEqual([png[24],png[25],png[28]],[8,2,0],'Audited PNG is non-interlaced 8-bit RGB');
  for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset);if(png.toString('ascii',offset+4,offset+8)==='IDAT')idat.push(png.subarray(offset+8,offset+8+length));offset+=length+12;}
  const raw=inflateSync(Buffer.concat(idat)),pixels=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
    const type=raw[y*(stride+1)],a=x>=3?pixels[y*stride+x-3]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=3?pixels[(y-1)*stride+x-3]:0;
    const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
    const predictor=[0,a,b,Math.floor((a+b)/2),pa<=pb&&pa<=pc?a:pb<=pc?b:c][type];assert.notEqual(predictor,undefined);
    pixels[y*stride+x]=(raw[y*(stride+1)+x+1]+predictor)&255;
  }
  for(const sample of audit.samples){
    const [x0,y0,x1,y1]=sample.rectangle,channels=[[],[],[]];
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)for(let c=0;c<3;c++)channels[c].push(pixels[(y*width+x)*3+c]);
    const medians=channels.map(a=>{a.sort((a,b)=>a-b);return Math.round((a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2);});
    assert.deepEqual(medians,sample.srgb,`${sample.name}: actual PNG colour`);
  }
  console.log('Passed: exact cached valley PNG hash and all four sampled colour medians.');
}else console.log('Painting PNG cache absent: palette/hash contract checked; optional pixel resampling omitted.');

const smooth=THREE.MathUtils.smoothstep;
function direction(point,camera){
  const ray=point.clone().sub(camera).normalize(),origin=camera.clone().sub(new THREE.Vector3(0,0,L.centerZ)),b=origin.dot(ray);
  return origin.addScaledVector(ray,-b+Math.sqrt(b*b+L.radius**2-origin.lengthSq())).normalize();
}
// Execute the actual scalar GLSL mask functions, not a second handwritten mask.
// This intentionally small evaluator supports float operations and vec2.x/y
// access only. Texture filtering still requires the external GPU captures.
const functionNames=['cityNearWaterAlpha','cityBankMask','cityRiverOffset','cityRiverHalfWidth','cityRiverMask','cityCachedRiverMask','cityGroundHole'];
const scalarSource=functionNames.map(name=>{
  const fn=(WATER_JOIN_GLSL+RIVER_SKIRT_GLSL).match(new RegExp(`float ${name}\\([^]*?\\{[^]*?\\}`));assert.ok(fn,`${name} GLSL body`);
  return fn[0].replace(/^float /,'function ').replace(/\b(?:float|vec2) (?=\w+\s*[,)]\s*)/g,'').replace(/\bfloat /g,'let ');
}).join('\n');
const masks=new Function('smoothstep','mix','abs','sign','max','step',`${scalarSource};return {${functionNames.join(',')}};`)(
  (a,b,x)=>{
    assert.ok([a,b,x].every(Number.isFinite),'Finite GLSL smoothstep operands');
    assert.ok(Math.fround(a)<Math.fround(b),`GLSL smoothstep needs strictly ordered Float32 edges: ${a}, ${b}`);
    return smooth(x,a,b);
  },THREE.MathUtils.lerp,Math.abs,Math.sign,Math.max,(a,x)=>x<a?0:1);
const riverOffset=masks.cityRiverOffset,halfWidth=masks.cityRiverHalfWidth,riverMask=(x,z)=>masks.cityRiverMask({x,y:z});
// At feather=0 the bank's edges are 1.3 and 1.3001, not equal/reversed.
// Exercise the actual GLSL expressions on both mouths, inside town, across each
// transition and past the fade. A future negative feather must fail this audit.
for(let x=-210;x<=210;x+=.125)for(const offset of [-1.4,-1.3,-.8,0,.8,1.3,1.4]){
  const p={x,y:L.centerZ+offset};
  for(const value of [masks.cityBankMask(p),masks.cityNearWaterAlpha(x),masks.cityRiverMask(p)]){
    assert.ok(Number.isFinite(value)&&value>=0&&value<=1,'Finite, bounded bank/river coverage');
  }
}
// The old rigid strip stayed opaque almost to the horizon. Test soft banks,
// mirrored bends, fading with nonzero width, and complete boat-path protection.
assert.equal(riverOffset(20),0);assert.ok(Math.abs(halfWidth(20)-(CANAL.maxZ-CANAL.minZ)/2)<1e-12);
assert.ok(L.nearWaterEnd>=BOAT.maxX+BOAT.length/2,'The animated hull mask covers the entire boat');
for(const sign of [-1,1])for(const x of [21,23,26,30,34,36,80]){
  const center=L.centerZ+riverOffset(sign*x);
  assert.ok(Math.abs(riverOffset(-x)+riverOffset(x))<1e-12);
  assert.ok(halfWidth(x)>.8,'No taper-to-zero tip');
  const feather=THREE.MathUtils.lerp(L.bankFeather,.8,smooth(x,20,28));
  const inner=riverMask(sign*x,center),edge=riverMask(sign*x,center+halfWidth(x)-feather/2),outer=riverMask(sign*x,center+halfWidth(x)+.81);
  assert.ok(inner>=edge&&edge>=outer);assert.equal(outer,0);
  if(x<L.waterFadeEnd){assert.ok(edge>0&&edge<inner,'Fractional feather at the bank');}
  else assert.equal(inner,0,'No geometric water at the horizon');
}

// The overlap cannot put cached water in the dry hull, even at either end of
// the boat path. The hole is strictly inside opaque water, away from its feather.
assert.ok(L.waterOverlap>BOAT.maxX+BOAT.length/2&&L.waterOverlap<L.nearWaterEnd);
for(const boatX of [BOAT.minX,0,BOAT.maxX])for(const [x,left,right] of BOAT_WATERLINE)for(const z of [left,right]){
  const p={x:boatX+x,y:BOAT.z+z};
  assert.equal(masks.cityGroundHole(p),1,'Cached foreground never crosses the swept hull corridor');
  assert.equal(masks.cityBankMask(p)*masks.cityNearWaterAlpha(p.x),1,'Full dynamic coverage, including the hull discard, throughout the boat path');
}
// The old terrain edge cut through the bank's feather and exposed dark/ghost
// painting detail. Now any point on a ground-hole edge is hidden by opaque water.
for(const sign of [-1,1])for(let x=17;x<L.waterOverlap;x+=.01)for(const z of [-L.channelHalfWidth,L.channelHalfWidth]){
  assert.equal(masks.cityBankMask({x:sign*x,y:BOAT.z+z})*masks.cityNearWaterAlpha(sign*x),1);
}
for(const sign of [-1,1])for(let i=0;i<=100;i++)for(let j=0;j<=100;j++){
  const p={x:sign*(L.waterOverlap+(L.nearWaterEnd-L.waterOverlap)*i/100),y:BOAT.z+1.3*j/100};
  const R=masks.cityBankMask(p),D=masks.cityNearWaterAlpha(p.x),A=masks.cityCachedRiverMask(R,D);
  assert.ok(Number.isFinite(A)&&A>=0&&A<=1);
  assert.ok(Math.abs(A+(1-A)*D*R-R)<1e-10,'Overlap coverage equals one bank, with no gap or double bank');
  if(i===100)assert.equal(D,0,'No contribution at the dynamic geometry end, hence no raster crack');
}

// Explicit gradients must be calculated outside both the mouth branches and
// the nested sampler-selection branches. This regresses the actual r2a cause.
assert.doesNotMatch(PAINTING_GLSL,/texture2D\s*\(/,'No implicit derivatives inside divergent texture branches');
assert.equal((PAINTING_GLSL.match(/textureGrad\(/g)||[]).length,4,'Same four samplers, no eager extra reads');
const background=PAINTING_GLSL.slice(PAINTING_GLSL.indexOf('vec3 cityPaintedBackground'));
assert.ok(background.lastIndexOf('dFdx(')<background.indexOf('if(mouth'));
assert.ok(background.lastIndexOf('dFdy(')<background.indexOf('if(mouth'));
assert.doesNotMatch(background,/dFd[xy]\(azimuth|dFd[xy]\(x\)/,'Never differentiate the discontinuous panel wrap');
// Check the analytic angular derivative against unwrapped finite differences
// on both sides of every sector/wrap boundary, including the old baseline seam.
for(const boundary of [0,.25,.5,.75,1])for(const epsilon of [-1e-7,1e-7]){
  const angle=(boundary-L.paintingYaw+epsilon)*2*Math.PI,d=new THREE.Vector3(Math.sin(angle),.1,Math.cos(angle)).normalize();
  const dd=new THREE.Vector3(.00013,0,-.00007),next=d.clone().add(dd).normalize();
  const analytic=4/(2*Math.PI)*(d.z*dd.x-d.x*dd.z)/(d.x*d.x+d.z*d.z);
  let finite=4*(Math.atan2(next.x,next.z)-Math.atan2(d.x,d.z))/(2*Math.PI);finite-=Math.round(finite/4)*4;
  assert.ok(Math.abs(analytic-finite)<2e-8);assert.ok(Math.abs(analytic)<.001,'Filtering footprint never jumps a whole panel at a seam');
}

for(const shot of SHOTS.filter(s=>s.name.startsWith('river-'))){
  const camera=new THREE.Vector3(...shot.camera.position),sign=Math.sign(camera.x);
  for(const x of [30,40,80,200])for(const z of [-25,8.2,35]){
    const ground=new THREE.Vector3(sign*x,-.23,z),ray=ground.clone().sub(camera).normalize();
    const domePoint=camera.clone().addScaledVector(ray,250);
    assert.ok(direction(ground,camera).distanceTo(direction(domePoint,camera))<1e-12,'Sky and skirt sample the same ray independently of surface depth');
  }
  // The near bank slopes from -0.08 to -0.23. Ground-space X/Z is therefore
  // NOT the water-space hole; verify reprojection for both mouths/feather edges.
  for(const x of [17.1,18,19.8])for(const z of [BOAT.z-1.3,BOAT.z-.7,BOAT.z+.7,BOAT.z+1.3]){
    const water=new THREE.Vector3(sign*x,CANAL.y,z),ray=water.clone().sub(camera);
    const slope=sign*(CANAL.y+.08)/3,intercept=-.08-slope*sign*17;
    const t=(slope*camera.x+intercept-camera.y)/(ray.y-slope*ray.x),ground=camera.clone().addScaledVector(ray,t);
    const restored=camera.clone().addScaledVector(ground.clone().sub(camera),(CANAL.y-camera.y)/(ground.y-camera.y));
    assert.ok(restored.distanceTo(water)<1e-12,'Projected ground opening aligns with the visible water plane');
    assert.ok(ground.distanceTo(water)>.0001,'This checks the real slope-space mismatch, not a coplanar identity');
  }
  // Audited valley river centres, in original image UV, at the handoff depths.
  for(const [x,u] of [[23,.43],[26,.59],[30,.63],[34,.55]]){
    const d=direction(new THREE.Vector3(sign*x,CANAL.y,L.centerZ+riverOffset(sign*x)),camera);
    const actual=L.riverU+sign*d.z*L.riverSpread;
    assert.ok(Math.abs(actual-u)<.035,`${shot.name}: curve reaches painted river near x=${x} (${actual}, expected ${u})`);
  }
}

const {createLandscape}=await importBrowserModule('dist/landscape.js');
const {createStaticFrame}=await importBrowserModule('dist/static-frame.js');
for(const low of [false,true]){
  const scene=new THREE.Scene(),landscape=createLandscape(scene,CANAL,{low}),camera=new THREE.PerspectiveCamera();
  const [ground,sky]=scene.children;
  assert.equal(scene.children.length,2,'One ground skirt + existing sky; one fewer cached draw than the old two banks');
  assert.equal(ground.geometry.index.count/3,18,'Small fixed skirt, never dynamic');
  assert.equal(landscape.resources.filter(r=>r.isTexture).length,0,'No generated or duplicate texture allocations');
  assert.ok(ground.material.fragmentShader.includes(PAINTING_GLSL));assert.ok(sky.material.fragmentShader.includes(PAINTING_GLSL));
  assert.ok(ground.material.fragmentShader.includes(RIVER_SKIRT_GLSL));
  assert.doesNotMatch(ground.material.fragmentShader,/uniform.*Time|uniform.*grass|cityHorizonAlpha/);
  assert.match(ground.material.fragmentShader,/mix\(cityRiverColor\(waterP.x\),painted,smoothstep\(22\.,30\./,'River colour reaches exact painting pixels before its opacity vanishes');
  assert.match(ground.material.fragmentShader,/cityPaintedBackground\(landscapeWorld,blur\)/,'Near soil uses existing broad mip colours instead of ghost trees');
  assert.match(ground.material.fragmentShader,/cityGroundHole\(waterP\)/,'Never cut the opening in the higher ground plane');
  assert.match(sky.material.fragmentShader,/cityPaintedBackground\(landscapeWorld,0\.\)/,'Sky remains sharp');
  assert.ok(ground.material.fragmentShader.includes(WATER_JOIN_GLSL));
  for(const name of ['painting0','painting1','painting2','painting3','night','hasPainting','cityHaze'])assert.equal(ground.material.uniforms[name],sky.material.uniforms[name]);
  for(const object of scene.children){assert.equal(object.layers.mask,1);assert.equal(object.material.depthWrite,false);assert.equal(object.material.toneMapped,false);}
  const vertices=ground.geometry.attributes.position;
  for(let i=0;i<vertices.count;i++)if(Math.abs(vertices.getX(i))<=17)assert.ok(Math.abs(vertices.getY(i)+.08)<1e-7,'Walkable banks remain level');
  let draws=0;const renderer={extensions:{has:()=>true},capabilities:{maxSamples:4},toneMappingExposure:1,autoClear:true,setRenderTarget(){},getDrawingBufferSize(v){return v.set(low?390:1280,low?844:720);},render(){draws++;}};
  const cache=createStaticFrame(renderer,scene,camera,{low});cache.resize();cache.render();const initial=cache.settings.rebuilds;
  for(let i=0;i<60;i++)cache.render();assert.equal(cache.settings.rebuilds-initial,0,'No steady-frame cache rebuilds on either quality');
  assert.equal(draws,123);landscape.setNight(true);assert.equal(landscape.waterUniforms.night.value,1);cache.invalidate();cache.render();
  assert.equal(cache.settings.rebuilds,initial+1,'Only an explicit night change rebuilds');cache.dispose();landscape.dispose();
}
const city=await readFile('dist/city3d.js','utf8');
assert.match(city,/surface\(LANDSCAPE\.nearWaterEnd\*2/,'Dynamic water stops at the fixed canal boundary');
assert.match(city,/Object\.assign\(shader\.uniforms,landscape\.waterUniforms\)/);
assert.match(city,/gl_FragColor\.rgb=mix\(gl_FragColor\.rgb,paintedWater/,'Colour matching runs after lighting/tone mapping');
assert.match(city,/cityBankMask\(cityWaterWorld.xz\)\*cityNearWaterAlpha\(cityWaterWorld.x\)/,'Dynamic mask uses the same tested bank/overlap functions');
console.log('Passed: explicit gradients/wrap footprints, projected bank openings, crack-free overlap coverage, full swept-hull clearance, matched sky/skirt rays, river alignment/feather/fade, fixed static cost and zero steady cache rebuilds in high/low.');
