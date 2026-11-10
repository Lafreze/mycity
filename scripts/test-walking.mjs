import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {WALKING,DISCOVERIES,floorHeight,blockedAt,moveWalker,safePosition} from '../dist/walking-world.js';
const world=JSON.parse(await readFile('dist/navigation.json','utf8'));
const sourceHash=createHash('sha256');
for(const file of ['dist/world.js','dist/walking-world.js','dist/props.js','dist/products.js','reference/model-quality.json','reference/bridge-walkable.json'])sourceHash.update(await readFile(file));
assert.equal(world.sourceVersion,sourceHash.digest('hex'),'Walking map is stale; run npm run navigation:build after changing model placements.');
assert.equal(blockedAt(WALKING.spawn.x,WALKING.spawn.z,world.colliders),false,'Spawn must be clear');
const wallWorld={bridge:null,colliders:[{minX:0,maxX:1,minZ:0,maxZ:3,firstYear:2023}]};
const stopped=moveWalker({x:-1,y:0,z:1},5,0,wallWorld);
assert.ok(stopped.x<=-WALKING.radius+.01,'High-speed movement cannot tunnel through walls');
const slide=moveWalker({x:-WALKING.radius-.08,y:0,z:1},1,1,wallWorld);
assert.ok(slide.z>1.8&&slide.x<0,'Diagonal movement slides along walls');
const river=moveWalker({x:0,y:0,z:6.5},0,2,{...world,colliders:[]});
assert.ok(river.z<=6.9-WALKING.radius+.01,'Canal remains inaccessible');
assert.equal(floorHeight(10.7,8.2,world.bridge,false),null,'Unloaded bridge is not walkable');
let p={x:10.7,y:0,z:3.45},peak=0;
for(let i=0;i<240;i++){p=moveWalker(p,0,.045,world);peak=Math.max(peak,p.y);}
assert.ok(p.z>13.5&&p.y===0,'Walk up, across and down the actual bridge steps');
assert.ok(peak>1.8&&peak<1.9,'Bridge height follows measured deck');
const start={x:10.7,y:floorHeight(10.7,8.2,world.bridge),z:8.2};
const edge=moveWalker(start,4,0,world);assert.ok(edge.x<=world.bridge.safeMaxX,'Cannot walk off the side of the bridge');
const recovered=safePosition({x:0,y:0,z:0},world);
assert.equal(blockedAt(recovered.x,recovered.z,world.colliders),false,'Recover from a building appearing around the player');

// Flood-fill the same collision data to prove the plaza, both banks and all interaction sites are reachable.
const step=.2,minX=-16.4,minZ=-12.2,nx=165,nz=132;
const at=(ix,iz)=>({x:minX+ix*step,z:minZ+iz*step});
const origin=[Math.round((WALKING.spawn.x-minX)/step),Math.round((WALKING.spawn.z-minZ)/step)];
const queue=[origin],seen=new Set([origin.join(',')]),reached=new Set();
for(let q=0;q<queue.length;q++){
  const [ix,iz]=queue[q],pos=at(ix,iz),y=floorHeight(pos.x,pos.z,world.bridge);
  for(const d of DISCOVERIES)if(Math.hypot(d.x-pos.x,d.z-pos.z)<1.3)reached.add(d.id);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=ix+dx,zz=iz+dz,key=`${xx},${zz}`;if(xx<0||xx>=nx||zz<0||zz>=nz||seen.has(key))continue;
    const b=at(xx,zz),h=floorHeight(b.x,b.z,world.bridge);
    if(h===null||Math.abs(h-y)>WALKING.maxStep||blockedAt(b.x,b.z,world.colliders))continue;
    seen.add(key);queue.push([xx,zz]);
  }
}
assert.deepEqual([...reached].sort(),DISCOVERIES.map(d=>d.id).sort(),'Every discovery must be reachable without crossing water/walls');
console.log(`Passed: collision sliding, high-speed walls, dry banks, stairs/bridge, safe recovery and ${reached.size} reachable discoveries (${seen.size} walkable samples).`);
