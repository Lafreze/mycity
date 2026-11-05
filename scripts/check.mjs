import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { PRODUCTS, statusAt, CITY } from '../dist/products.js';
assert.equal(new Set(PRODUCTS.map(p=>p.id)).size,PRODUCTS.length,'Product IDs must be unique');
for(const p of PRODUCTS){
  assert.ok(p.name && /^\d{4}-\d{2}-\d{2}$/.test(p.launched));
  assert.ok(['live','building','archived'].includes(p.status));
  assert.equal(statusAt(p,Number(p.launched.slice(0,4))-1),'future');
  assert.ok(p.position.x>=0 && p.position.x<=100 && p.position.y>=0 && p.position.y<=100);
  if(p.url) assert.ok(/^https?:\/\//.test(p.url),'Product links must be HTTP(S)');
}
const archived=PRODUCTS.find(p=>p.status==='archived');
assert.equal(statusAt(archived,2024),'live');
assert.equal(statusAt(archived,2025),'archived');
assert.equal(PRODUCTS.filter(p=>statusAt(p,CITY.lastYear)==='building').length,1);
for(const file of ['index.html','app.js','styles.css','assets/city-day.webp','vendor/three/three.module.js','vendor/three/addons/loaders/GLTFLoader.js']) await access(`dist/${file}`);
console.log('Passed: product data, lifecycle timeline, safe product URLs, and required assets.');
