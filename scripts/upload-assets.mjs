import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),bucket=process.env.R2_BUCKET_NAME;
if(!bucket || !/^[a-z0-9-]+$/.test(bucket))throw new Error('Set R2_BUCKET_NAME');
const plan=JSON.parse(await readFile('output/r2-upload-plan.json','utf8'));
let completed=0;
const queue=[...plan];
async function worker(){while(queue.length){const p=queue.shift();
 if(!p.key.startsWith('mycity/models/') || p.key.includes('..'))throw new Error('Invalid upload prefix');
 await exec('npx',['-y','wrangler@4.158.0','r2','object','put',`${bucket}/${p.key}`,'--remote','--file',p.source,'--content-type','model/gltf-binary','--cache-control','public, max-age=31536000, immutable'],{maxBuffer:1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 console.log(`${++completed}/${plan.length} ${p.id}`);
}}
await Promise.all([worker(),worker(),worker()]);
console.log('All model uploads completed. Run assets:verify before deployment.');
