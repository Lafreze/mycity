import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CITY_PROPS,WITHHELD_PROPS} from '../dist/props.js';
import {PRODUCTS} from '../dist/products.js';
import {CANAL,BOAT,BRIDGE,boatPose,footprint} from '../dist/world.js';
const quality=JSON.parse(await readFile('reference/model-quality.json','utf8'));
const models=new Map(quality.assets.map(a=>[a.id,a]));
const wet=b=>b.minZ<CANAL.maxZ&&b.maxZ>CANAL.minZ;
const overlap=(a,b,pad=0)=>a.minX<b.maxX-pad&&a.maxX>b.minX+pad&&a.minZ<b.maxZ-pad&&a.maxZ>b.minZ+pad;
const placed=[];
for(const p of CITY_PROPS) {
  assert.ok(!WITHHELD_PROPS.includes(p.id),`Unisolated diorama in scene: ${p.id}`);
  assert.ok(models.has(p.id),`Missing inspected geometry: ${p.id}`);
  p.positions.forEach((position,i)=>{
    const b=footprint(models.get(p.id),p,i);placed.push({...b,id:p.id});
    if(!['rowboat','stone-bridge'].includes(p.id))assert.ok(!wet(b),`${p.id} enters the canal: ${JSON.stringify(b)}`);
    if(p.id!=='rowboat')assert.equal(position[1],0,`${p.id} is not grounded`);
  });
  assert.ok(!p.motion||p.motion==='drift',`Unrigged sliding motion: ${p.id}`);
}
const canopy=new Set(['plane-tree','blossom-tree','olive-tree']);
for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
  const a=placed[i],b=placed[j];
  if(canopy.has(a.id)||canopy.has(b.id))continue;
  const dx=Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX),dz=Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ);
  assert.ok(dx<=.07||dz<=.07,`${a.id} intersects ${b.id}`);
}
for(const p of PRODUCTS) {
  const model=models.get(p.id==='archive'?'chess':p.id),width=p.id==='archive'?2.8:4.2;
  const b=footprint(model,{width,positions:[p.scenePosition]});
  assert.ok(!wet(b),`Building ${p.id} enters the water`);
  // No props may pass through shop walls. Trees may overhang; their trunks stay behind the row.
  for(const a of placed.filter(a=>!['plane-tree','blossom-tree'].includes(a.id)))assert.ok(!overlap(a,b,.08),`${a.id} intersects ${p.id}`);
}
const bridge=placed.find(p=>p.id==='stone-bridge');
assert.ok(bridge.minZ<CANAL.minZ-.4&&bridge.maxZ>CANAL.maxZ+.4,'Bridge must reach both banks');
for(const a of placed.filter(p=>p.id==='river-railing'))assert.ok(!overlap(a,bridge,.03),'Railing blocks a bridge entrance');
for(const id of ['city-bike','cargo-bike','delivery-van','cyclist','rowboat']) {
  const p=CITY_PROPS.find(p=>p.id===id),a=models.get(id),b=footprint(a,p);
  assert.ok(b.width>b.depth*1.4,`${id} is perpendicular to the street/current`);
}
assert.ok(Math.sin(BOAT.heading)*BOAT.forwardZ>.999,'The bow faces against the current');
const boat=placed.find(p=>p.id==='rowboat');
assert.ok(boat.minZ>CANAL.minZ+.2&&boat.maxZ<CANAL.maxZ-.2,'Boat strikes riverbank');
assert.ok(boat.minY<CANAL.y-.1&&boat.maxY>CANAL.y+.2,'Hull must straddle the waterline');
assert.ok(models.get('stone-bridge').archClearanceAtBoatBeam>boat.maxY+.075,'Boat strikes the arch');
for(let t=0;t<1200;t+=.5) {
  const a=boatPose(t),b=boatPose(t+.5);
  assert.equal(a.z,BOAT.z,'Boat leaves the channel');
  assert.ok(a.x-BOAT.length/2>CANAL.minX&&a.x+BOAT.length/2<CANAL.maxX,'Boat leaves water');
  if(b.x<a.x)assert.ok(a.x>BOAT.maxX-.1&&b.x<BOAT.minX+.1,'Boat reverses mid-channel');
  else assert.ok(Math.abs(b.x-a.x-CANAL.flowSpeed*.5)<1e-9,'Boat speed/heading changes');
}
assert.ok(quality.assets.every(a=>a.hasNormals),'An asset lost its shading normals');
assert.ok(models.get('chess').triangles>=450000,'Building detail regressed');
assert.ok(models.get('city-bike').triangles>=300000,'Bicycle detail regressed');
console.log(`Passed: ${placed.length} placements, dry building footprints, clear bridge approaches, vehicle headings, boat draft and 20 minutes of river motion.`);
