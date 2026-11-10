import * as THREE from '../../dist/vendor/three/three.module.js';

// CPU equivalent of the GPU skinning chunks, using the Float32 bone palette.
// Deliberately independent of groundFigure's getVertexPosition contact sampling.
export function survivingBounds(mesh,cutY=-Infinity){
  mesh.skeleton?.update();
  const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
  const result=new THREE.Box3(),bindVertex=new THREE.Vector3(),skinned=new THREE.Vector3(),part=new THREE.Vector3(),bone=new THREE.Matrix4();
  for(let i=0;i<position.count;i++){
    if(position.getY(i)<cutY)continue;
    bindVertex.fromBufferAttribute(position,i);
    if(mesh.isSkinnedMesh){
      bindVertex.applyMatrix4(mesh.bindMatrix);skinned.set(0,0,0);
      for(let j=0;j<4;j++){
        const weight=skinWeight.getComponent(i,j);if(!weight)continue;
        bone.fromArray(mesh.skeleton.boneMatrices,skinIndex.getComponent(i,j)*16);
        skinned.addScaledVector(part.copy(bindVertex).applyMatrix4(bone),weight);
      }
      skinned.applyMatrix4(mesh.bindMatrixInverse);
    }else skinned.copy(bindVertex);
    result.expandByPoint(skinned.applyMatrix4(mesh.matrixWorld));
  }
  return result;
}

