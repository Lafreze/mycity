import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CITY_PROPS} from '../dist/props.js';
import {RESIDENTS} from '../dist/residents.js';
const m=JSON.parse(await readFile('dist/assets/models/manifest.json','utf8'));
const assets=[...m.models,...m.props,...(m.characters||[])];
assert.equal(m.models.length,5);assert.equal(m.props.length,46);
assert.equal(m.characters?.length,1,'The third-person entry point requires its character');
assert.equal(m.characters[0].id,'hero');
assert.equal(new Set(assets.map(x=>x.id)).size,51+(m.characters?.length||0));
for(const a of assets){
 const u=new URL(a.url);
 assert.equal(u.protocol,'https:');assert.ok(!u.hostname.endsWith('.invalid'),'Asset host is not ready');assert.equal(u.username,'');assert.equal(u.password,'');
 assert.match(a.sha256,/^[a-f0-9]{64}$/);
 assert.ok(u.pathname.endsWith(`.${a.sha256.slice(0,16)}.glb`));
 assert.ok(Number.isSafeInteger(a.bytes)&&a.bytes>0);
}
const quality=JSON.parse(await readFile('reference/model-quality.json','utf8'));
for(const a of assets){const q=quality.assets.find(q=>q.id===a.id);assert.equal(q?.sha256,a.sha256,`Quality audit is stale: ${a.id}`);assert.equal(q.bytes,a.bytes);}
const hero=quality.assets.find(q=>q.id==='hero');
assert.ok(hero?.hasSkin&&hero.bones>=12,'Character must be rigged');
assert.deepEqual(hero.animations.map(a=>a.name.toLowerCase()).sort(),['idle','run','walk']);
for(const p of CITY_PROPS)assert.ok(m.props.some(x=>x.id===p.id),`Missing model: ${p.id}`);
for(const p of RESIDENTS){
 const q=quality.assets.find(q=>q.id===p.id);
 assert.ok(q?.hasSkin&&q.bones>=6,`${p.id} needs its own skeleton`);
 assert.deepEqual(q.animations.map(a=>a.name.toLowerCase()).sort(),['idle','talk']);
 assert.equal(CITY_PROPS.find(x=>x.id===p.id)?.positions.length,1,'Each resident has one unique rig');
}
assert.equal(m.environment?.length,4,'Four painted views must surround the street');
for(const a of m.environment){
 const u=new URL(a.url);assert.equal(u.protocol,'https:');assert.equal(u.username,'');assert.equal(u.password,'');
 assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.ok(u.pathname.endsWith(`.${a.sha256.slice(0,16)}.png`));
 assert.equal(a.mimeType,'image/png');assert.ok(a.width>=1300&&a.height>=700&&a.bytes>0);
}
console.log(`Passed: ${assets.length} model URLs, nine animated residents, four landscape panels, fingerprints and placements.`);
