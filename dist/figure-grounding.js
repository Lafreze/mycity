import * as THREE from 'three';

// Measured in the delivered GLBs' unskinned mesh coordinates. See
// docs/natural-scene.md. These four discs are fused into the body mesh; discard
// only the audited base slab, then place the surviving soles at ground level. No new buffers,
// downloaded variants, or changes to skeletons, soles, chairs or bicycle wheels.
export const FIGURE_BASES = Object.freeze({
  maker:{sha256:'567d3a8a01cd3fac8d4404c74a77fb8cce19ca66a04365be8bdb865082f3b197',mesh:'NPCMesh_maker',cutY:-.4500},
  florist:{sha256:'94809d577ec453bf28c85edd3139704e31fd2a6a4ccdf6db5021b9dc8d085002',mesh:'NPCMesh_florist',cutY:-.4680},
  'helper-robot':{sha256:'28759e7a1c78d48208340659c5dcb5544f40b14b986e9d4fbd6362044b39b278',mesh:'NPCMesh_helper-robot',cutY:-.4090},
  'street-musician':{sha256:'07095941107acf7936cc81741cabd67ba925e38156c84dfc3deb44fcbefaf3b1',mesh:'NPCMesh_street-musician',cutY:-.4355},
});

export function groundFigure(model,asset){
  const spec=FIGURE_BASES[asset.id];
  // Fail closed for future model revisions: never apply an old cut to new feet.
  if(!spec||asset.sha256!==spec.sha256||model.userData.figureGrounding)return null;
  const mesh=model.getObjectByName(spec.mesh);
  if(!mesh?.isMesh)return null;
  model.updateWorldMatrix(true,false);
  // Unlike updateWorldMatrix, SkinnedMesh.updateMatrixWorld also refreshes the
  // attached bind inverse. Bone world matrices must be current before sampling.
  model.updateMatrixWorld(true);
  mesh.geometry.computeBoundingBox();
  const bounds=mesh.geometry.boundingBox;
  if(spec.cutY<=bounds.min.y||spec.cutY>=bounds.max.y)return null;
  // Raw POSITION and the rendered skin are different spaces: these GLBs bind
  // with identity, while their inverse bone binds cancel SourcePlacement.
  // Transforming raw cutY by mesh.matrixWorld applies that placement twice and
  // raises the figures by ~half a model unit. Sample the surviving skin instead,
  // once at load time; keep the cutoff in raw POSITION space for the shader.
  const vertex=new THREE.Vector3(),toModel=new THREE.Matrix4().copy(model.matrixWorld).invert();
  const position=mesh.geometry.attributes.position;
  let contactY=Infinity;
  for(let i=0;i<position.count;i++){
    if(position.getY(i)<spec.cutY)continue;
    mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(toModel);
    contactY=Math.min(contactY,vertex.y);
  }
  if(!Number.isFinite(contactY))return null;
  for(const material of new Set(Array.isArray(mesh.material)?mesh.material:[mesh.material])){
    const before=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,...args){
      before.call(this,shader,...args);
      shader.uniforms.cityFigureCut={value:spec.cutY};
      // Bind-space height follows the original skin, even during an idle gesture.
      shader.vertexShader='varying float cityFigureHeight;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncityFigureHeight=position.y;');
      shader.fragmentShader='varying float cityFigureHeight;uniform float cityFigureCut;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(cityFigureHeight<cityFigureCut)discard;');
    };
    material.customProgramCacheKey=()=>key+'|figure-base-v1';material.needsUpdate=true;
  }
  return model.userData.figureGrounding={contactY,cutY:spec.cutY,mesh:spec.mesh};
}

// Shared by runtime placement and the real-GLB regression test. Preserve the
// original full-model scale and X/Z centering; only replace pedestal contact Y.
export function normalizeStreetModel(object,definition){
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=definition.height?definition.height/Math.max(size.y,.01):definition.width/Math.max(size.x,size.z,.01);
  const contactY=object.userData.figureGrounding?.contactY??bounds.min.y;
  object.position.set(-center.x,-contactY,-center.z);
  return {bounds,scale,contactY};
}
