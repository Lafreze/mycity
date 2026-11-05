import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{source:{type:'string'},base:{type:'string'}}});
if(!values.source || !values.base) throw new Error('Usage: npm run assets:prepare -- --source /path/to/models --base https://asset-host/mycity');
const base=new URL(values.base.replace(/\/$/,'')+'/');
if(base.protocol!=='https:' || base.username || base.password || base.search || base.hash) throw new Error('Use a public HTTPS asset base without credentials.');
const manifest=JSON.parse(await readFile('reference/source-models.json','utf8'));
const plan=[];
for(const item of [...manifest.models,...manifest.props]){
  if(!/^[a-z0-9/-]+\.glb$/.test(item.file) || item.file.includes('..')) throw new Error('Invalid model path');
  const source=path.resolve(values.source,item.file),bytes=await readFile(source);
  if(bytes.readUInt32LE(0)!==0x46546c67 || bytes.readUInt32LE(4)!==2 || bytes.readUInt32LE(8)!==bytes.length) throw new Error(`Invalid GLB: ${item.file}`);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const key=`mycity/models/${item.file.replace(/\.glb$/,`.${sha256.slice(0,16)}.glb`)}`;
  item.url=new URL(key.slice('mycity/'.length),base).href;
  item.sha256=sha256;item.bytes=bytes.length;
  plan.push({id:item.id,source,key,url:item.url,bytes:bytes.length,sha256});
}
manifest.updatedAt=new Date().toISOString();
manifest.version=createHash('sha256').update(JSON.stringify(plan.map(({key,sha256})=>({key,sha256})))).digest('hex').slice(0,16);
await mkdir('output',{recursive:true});
await writeFile('dist/assets/models/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('output/r2-upload-plan.json',JSON.stringify(plan,null,2)+'\n');
console.log(`Prepared ${plan.length} content-addressed models, ${(plan.reduce((n,x)=>n+x.bytes,0)/1048576).toFixed(2)} MiB; version ${manifest.version}`);
