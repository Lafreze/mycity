import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/three.module.js';
const source=(await readFile(new URL('../dist/neighbors.js',import.meta.url),'utf8'))
  .replace("'three'",JSON.stringify(new URL('../dist/vendor/three/three.module.js',import.meta.url).href))
  .replace("'./residents.js?v=neighbors-2'",JSON.stringify(new URL('../dist/residents.js',import.meta.url).href));
const {createNeighbors}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const context=new Proxy({},{get:()=>()=>{},set:()=>true});
globalThis.document={createElement:()=>({getContext:()=>context})};globalThis.location={search:''};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(52,1,.1,100);
camera.position.set(0,1,4);camera.lookAt(0,.8,0);
const root=new THREE.Group(),model=new THREE.Group(),head=new THREE.Bone();head.name='Head';model.add(head);root.add(model);scene.add(root);
const clip=(name,angle)=>new THREE.AnimationClip(name,1,[new THREE.QuaternionKeyframeTrack('Head.quaternion',[0,.5,1],[0,0,0,1,0,Math.sin(angle/2),0,Math.cos(angle/2),0,0,0,1])]);
const residents=createNeighbors(scene);residents.add({id:'maker',root,model,animations:[clip('Idle',.1),clip('Talk',.4)],height:1.4,firstYear:2024});
residents.update(.15,camera,new THREE.Vector3(0,0,1),true,2026);
assert.ok(model.visible,'A nearby animated resident must be visible before skin bounds update');
assert.ok(head.quaternion.y>0,'Idle changes a real bone');
assert.equal(residents.nearby(null,2023).length,0,'A future resident cannot be spoken to');
residents.setTalking('maker');for(let i=0;i<3;i++)residents.update(.15,camera,null,false,2026);
assert.ok(head.quaternion.y>.1,'Conversation cross-fades to a stronger gesture');assert.equal(root.position.length(),0,'Gestures do not slide feet across the ground');
camera.lookAt(0,1,8);residents.update(.1,camera,null,false,2026);
assert.equal(model.visible,false,'Off-screen residents are culled as a whole');const time=head.quaternion.toArray();
residents.update(.1,camera,null,false,2026);assert.deepEqual(head.quaternion.toArray(),time,'Off-screen animation work pauses');
camera.lookAt(0,.8,0);residents.update(.1,camera,null,false,2026);assert.ok(model.visible,'Returning to a resident restores it');
residents.setTalking(null);for(let i=0;i<4;i++)residents.update(.15,camera,null,false,2026);assert.ok(Math.abs(head.quaternion.y)<.06,'Closing conversation restores idle');
residents.dispose();for(const resource of residents.resources)resource.dispose();
assert.equal(scene.children.length,1,'Conversation icons and shadows are released');
console.log('Passed: resident visibility, bone gestures, conversation transitions, future filtering, off-screen pause and cleanup.');
