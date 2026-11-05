import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CITY_PROPS} from '../dist/props.js';
const m=JSON.parse(await readFile('dist/assets/models/manifest.json','utf8'));
const assets=[...m.models,...m.props];
assert.equal(m.models.length,5);assert.equal(m.props.length,46);
assert.equal(new Set(assets.map(x=>x.id)).size,51);
for(const a of assets){
 const u=new URL(a.url);
 assert.equal(u.protocol,'https:');assert.ok(!u.hostname.endsWith('.invalid'),'Asset host is not ready');assert.equal(u.username,'');assert.equal(u.password,'');
 assert.match(a.sha256,/^[a-f0-9]{64}$/);
 assert.ok(u.pathname.endsWith(`.${a.sha256.slice(0,16)}.glb`));
 assert.ok(Number.isSafeInteger(a.bytes)&&a.bytes>0);
}
const quality=JSON.parse(await readFile('reference/model-quality.json','utf8'));
for(const a of assets){const q=quality.assets.find(q=>q.id===a.id);assert.equal(q?.sha256,a.sha256,`Quality audit is stale: ${a.id}`);assert.equal(q.bytes,a.bytes);}
for(const p of CITY_PROPS)assert.ok(m.props.some(x=>x.id===p.id),`Missing model: ${p.id}`);
console.log('Passed: all 51 model URLs, fingerprints, sizes and street placements.');
