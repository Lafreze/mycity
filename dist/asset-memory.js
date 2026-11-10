// Shared GLTF materials/images are resized and released once, before GPU upload.
export function objectResources(object,resources=new Set()){
  object.traverse(o=>{
    if(o.geometry)resources.add(o.geometry);
    if(o.skeleton)resources.add(o.skeleton);
    for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){
      resources.add(m);
      for(const v of Object.values(m))if(v?.isTexture)resources.add(v);
      for(const u of Object.values(m.uniforms||{}))if(u?.value?.isTexture)resources.add(u.value);
    }
  });return resources;
}
export function disposeResources(resources){
  const images=new Set();
  for(const r of new Set(resources)){if(r.isTexture&&r.image)images.add(r.image);r.dispose?.();}
  for(const image of images){image.close?.();if(image.tagName==='CANVAS'){image.width=1;image.height=1;}}
}
export function resizeTextures(textures,maxSize,makeCanvas=()=>document.createElement('canvas')){
  if(!Number.isFinite(maxSize))return;
  const replacements=new Map(),originals=new Set();
  for(const texture of new Set(textures)){
    const image=texture.image;if(!image||Math.max(image.width,image.height)<=maxSize)continue;
    let canvas=replacements.get(image);
    if(!canvas){
      const scale=maxSize/Math.max(image.width,image.height);canvas=makeCanvas();
      canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('Texture resize unavailable');
      context.drawImage(image,0,0,canvas.width,canvas.height);replacements.set(image,canvas);originals.add(image);
    }
    // Assigning source.data also updates GLTF texture clones sharing this Source.
    texture.image=canvas;texture.needsUpdate=true;
  }
  for(const image of originals)image.close?.();
}
export async function mapSettledLimit(items,limit,work){
  const results=new Array(items.length);let next=0;
  async function worker(){while(next<items.length){const index=next++;try{results[index]={status:'fulfilled',value:await work(items[index],index)};}catch(reason){results[index]={status:'rejected',reason};}}}
  await Promise.all(Array.from({length:Math.min(items.length,limit)},worker));return results;
}
// Numbers only: never retain the released TypedArray through a debug closure.
const uploadedBuffers=new WeakMap();
const geometryBuffers=geometry=>[geometry.index,...Object.values(geometry.attributes),...Object.values(geometry.morphAttributes).flat()].filter(Boolean).map(a=>a.isInterleavedBufferAttribute?a.data:a);

// Call only for low-mode GLTFs. Picking uses separate boxes and navigation uses
// JSON colliders. Skinning/morphs, dynamic attributes and shared unsafe buffers
// retain their CPU arrays. Bounds must exist before the first upload.
export function releaseStaticGeometryAfterUpload(object){
  const eligible=new Set(),protectedBuffers=new Set();
  object.traverse(o=>{
    const g=o.geometry;if(!g)return;
    const buffers=geometryBuffers(g);
    const safe=o.isMesh&&!o.isSkinnedMesh&&!o.isInstancedMesh&&!o.userData.pickProxy&&
      !Object.values(g.morphAttributes).some(a=>a.length)&&
      !(Array.isArray(o.material)?o.material:[o.material]).some(m=>m?.wireframe)&&
      buffers.every(a=>a.array&&a.usage===35044&&!a.isInterleavedBuffer); // STATIC_DRAW
    if(safe)eligible.add(g);else buffers.forEach(a=>protectedBuffers.add(a));
  });
  for(const geometry of eligible){
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    for(const attribute of geometryBuffers(geometry)){
      if(protectedBuffers.has(attribute)||uploadedBuffers.has(attribute))continue;
      uploadedBuffers.set(attribute,{bytes:attribute.array.byteLength,released:false});
      const previous=attribute.onUploadCallback;
      attribute.onUpload(function(){
        previous.call(this);
        // count/itemSize/normalization stay intact. WebGLAttributes retains GPU
        // type/stride/size and will reuse the unchanged buffer version.
        const record=uploadedBuffers.get(this);record.released=true;this.array=null;
      });
    }
  }
}

export function resourceBytes(resources){
  const buffers=new Set(),cpuArrays=new Set(),sources=new Set();
  let geometryBytes=0,geometryCPUBytes=0,releasedGeometryBytes=0,textureBytes=0;
  for(const r of resources){
    if(r.isBufferGeometry)for(const buffer of geometryBuffers(r)){
      if(buffers.has(buffer))continue;buffers.add(buffer);
      const record=uploadedBuffers.get(buffer);
      geometryBytes+=record?.bytes??buffer.array?.byteLength??0;
      if(record?.released)releasedGeometryBytes+=record.bytes;
      if(buffer.array&&!cpuArrays.has(buffer.array)){cpuArrays.add(buffer.array);geometryCPUBytes+=buffer.array.byteLength;}
    }
    if(r.isTexture&&r.image&&!sources.has(r.source)){sources.add(r.source);textureBytes+=(r.image.width||0)*(r.image.height||0)*4*(r.generateMipmaps?4/3:1);}
  }return {geometryBytes,geometryCPUBytes,releasedGeometryBytes,textureBytes};
}
