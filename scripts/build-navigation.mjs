import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CITY_PROPS} from '../dist/props.js';
import {PRODUCTS} from '../dist/products.js';
import {footprint,BRIDGE} from '../dist/world.js';
import {WALKING} from '../dist/walking-world.js';
const quality=JSON.parse(await readFile('reference/model-quality.json','utf8'));
const models=new Map(quality.assets.map(a=>[a.id,a])),colliders=[];
for(const p of PRODUCTS){
  const b=footprint(models.get(p.id==='archive'?'chess':p.id),{width:p.id==='archive'?2.8:4.2,positions:[p.scenePosition]});
  colliders.push({...b,id:p.id,firstYear:Number(p.launched.slice(0,4)),camera:true});
}
const narrow={
  'street-lamp':.19,'direction-sign':.22,'street-clock':.3,'plane-tree':.42,
  'olive-tree':.48,'blossom-tree':.74,'courier':.22,'maker':.22,'barista':.22,'florist':.24,
  'reader':.3,'construction-worker':.25,'helper-robot':.24,'street-musician':.3
};
for(const p of CITY_PROPS){
  if(['rowboat','stone-bridge'].includes(p.id))continue;
  const firstYear=p.product?Number(PRODUCTS.find(x=>x.id===p.product).launched.slice(0,4)):2023;
  p.positions.forEach(([x,y,z],i)=>{
    const b=footprint(models.get(p.id),p,i),r=narrow[p.id];
    const canopy=['plane-tree','olive-tree','blossom-tree'].includes(p.id)?{...b,minY:b.maxY*.4}:null;
    if(r)Object.assign(b,{minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r});
    // Let walkers pass through the arch's open center, not through its columns.
    if(p.id==='garden-arch'){
      for(const edge of [b.minX+.13,b.maxX-.13])colliders.push({...b,minX:edge-.13,maxX:edge+.13,id:p.id,requiresAsset:p.id,firstYear,camera:false});
    }else colliders.push({...b,id:p.id,requiresAsset:p.id,firstYear,camera:!!canopy||(!r&&b.maxY>1.2),...(canopy?{cameraBounds:canopy}:{})});
  });
}
const measured=JSON.parse(await readFile('reference/bridge-walkable.json','utf8'));
const sourceHash=createHash('sha256');
for(const file of ['dist/world.js','dist/walking-world.js','dist/props.js','dist/products.js','reference/model-quality.json','reference/bridge-walkable.json'])sourceHash.update(await readFile(file));
const world={sourceVersion:sourceHash.digest('hex'),bridge:{
  assetId:'stone-bridge',minX:9.07,maxX:12.73,bodyMinZ:5.4,bodyMaxZ:11,stairsMinX:9.85,stairsMaxX:11.55,
  safeMinX:measured.safeCenterXForRadius022[0]+WALKING.radius-.22,safeMaxX:measured.safeCenterXForRadius022[1]-WALKING.radius+.22,
  profile:[[3.58,0],...measured.surfaceSamples,[12.82,0]],targetWidth:BRIDGE.width
},colliders};
await writeFile('dist/navigation.json',JSON.stringify(world,null,2)+'\n');
console.log(`Prepared ${colliders.length} walking obstacles and ${world.bridge.profile.length} measured bridge heights.`);
