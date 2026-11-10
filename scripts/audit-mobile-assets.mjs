// Read-only audit of the exact manifest GLBs; cache binaries only in ignored output/.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CITY_PROPS} from '../dist/props.js';
const manifest=JSON.parse(await readFile('dist/assets/models/manifest.json','utf8'));
const directory='output/mobile-memory/assets';await mkdir(directory,{recursive:true});
const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},bytes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
function dimensions(b){
  if(b.toString('ascii',1,4)==='PNG')return [b.readUInt32BE(16),b.readUInt32BE(20)];
  for(let p=12;p+8<b.length;){const type=b.toString('ascii',p,p+4),n=b.readUInt32LE(p+4),q=p+8;
    if(type==='VP8X')return [1+b.readUIntLE(q+4,3),1+b.readUIntLE(q+7,3)];
    if(type==='VP8 ')return [b.readUInt16LE(q+6)&0x3fff,b.readUInt16LE(q+8)&0x3fff];
    if(type==='VP8L'){const v=b.readUInt32LE(q+1);return [(v&0x3fff)+1,((v>>>14)&0x3fff)+1];}
    p=q+n+(n%2);
  }throw new Error('Unknown image encoding');
}
const rows=[];
for(const item of [...manifest.models,...manifest.characters,...manifest.props]){
  const path=`${directory}/${item.id}.glb`;let data;
  try{data=await readFile(path);}catch{const r=await fetch(item.url+'?delivery=2');if(!r.ok)throw new Error(`${item.id}: ${r.status}`);data=Buffer.from(await r.arrayBuffer());await writeFile(path,data);}
  if(createHash('sha256').update(data).digest('hex')!==item.sha256)throw new Error(`Hash mismatch: ${item.id}`);
  const length=data.readUInt32LE(12),json=JSON.parse(data.toString('utf8',20,20+length)),bin=data.subarray(28+length);
  const used=new Set(),dracoIndices=new Set();let triangles=0;
  for(const mesh of json.meshes)for(const p of mesh.primitives){Object.values(p.attributes).forEach(i=>used.add(i));if(p.indices!==undefined){used.add(p.indices);if(p.extensions?.KHR_draco_mesh_compression)dracoIndices.add(p.indices);triangles+=json.accessors[p.indices].count/3;}for(const target of p.targets||[])Object.values(target).forEach(i=>used.add(i));}
  const geometryBytes=[...used].reduce((n,i)=>{const a=json.accessors[i];return n+a.count*components[a.type]*(dracoIndices.has(i)?4:bytes[a.componentType]);},0);
  const images=(json.images||[]).map(image=>{const v=json.bufferViews[image.bufferView];return dimensions(bin.subarray(v.byteOffset,v.byteOffset+v.byteLength));});
  const textureBytes=images.reduce((n,[w,h])=>n+w*h*4*4/3,0);
  rows.push({id:item.id,active:!manifest.props.includes(item)||CITY_PROPS.some(p=>p.id===item.id),downloadBytes:data.length,triangles,geometryBytes,images,textureBytes});
  console.log(`${item.id}: geometry ${(geometryBytes/2**20).toFixed(1)} MiB, textures ${(textureBytes/2**20).toFixed(1)} MiB`);
}
await writeFile('output/mobile-memory/asset-audit.json',JSON.stringify({rows,environment:manifest.environment},null,2)+'\n');
