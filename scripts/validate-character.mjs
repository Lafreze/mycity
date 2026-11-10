import assert from 'node:assert/strict';

// Validate the actual delivered GLB, including data that a filename/hash cannot prove.
export function validateCharacter(bytes){
  assert.equal(bytes.readUInt32LE(0),0x46546c67,'Character must be a GLB');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  const joints=new Set((gltf.skins||[]).flatMap(s=>s.joints));
  assert.ok(joints.size>=12,'Character needs an articulated skeleton');
  const primitives=(gltf.meshes||[]).flatMap(m=>m.primitives);
  assert.ok(primitives.some(p=>p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined),'Mesh must have skin weights');
  assert.ok(primitives.every(p=>p.attributes.NORMAL!==undefined),'Character normals must be preserved');
  const animations=[];
  for(const name of ['Idle','Walk','Run']){
    const clip=gltf.animations?.find(a=>a.name.toLowerCase()===name.toLowerCase());
    assert.ok(clip,`Missing ${name} animation`);
    const animatedJoints=new Set(clip.channels.filter(c=>joints.has(c.target.node)).map(c=>c.target.node));
    assert.ok(animatedJoints.size>=(name==='Idle'?1:4),`${name} must animate limbs, not translate a static model`);
    const times=clip.samplers.map(s=>gltf.accessors[s.input]);
    assert.ok(times.every(a=>a.count>1),'Animations need multiple keyframes');
    animations.push({name,joints:animatedJoints.size,seconds:Math.max(...times.map(a=>a.max?.[0]||0))});
  }
  return {bones:joints.size,animations};
}
