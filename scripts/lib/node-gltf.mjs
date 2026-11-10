// Real vendored GLTFLoader + Draco WASM in Node, with only image decoding omitted.
// Geometry, hierarchy, inverse binds, skin weights and animations remain intact.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import * as THREE from '../../dist/vendor/three/three.module.js';

const root=new URL('../../',import.meta.url),modules=new Map();
export async function importBrowserModule(path){
  const url=new URL(path,root);
  if(!modules.has(url.href))modules.set(url.href,(async()=>{
    let source=await readFile(url,'utf8');
    for(const match of [...source.matchAll(/^import\s[\s\S]*?\bfrom\s+(['"])([^'"]+)\1/gm)]){
      const target=match[2]==='three'?new URL('dist/vendor/three/three.module.js',root).href:await moduleURL(new URL(match[2],url));
      source=source.replace(match[0],match[0].replace(/from\s+(['"])([^'"]+)\1$/,`from ${JSON.stringify(target)}`));
    }
    return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  })());
  return import(await modules.get(url.href));
}
async function moduleURL(url){
  await importBrowserModule(url);
  return modules.get(url.href);
}

let decoderModule;
async function draco(){
  if(!decoderModule)decoderModule=(async()=>{
    const context=vm.createContext({console,WebAssembly,TextDecoder,TextEncoder,setTimeout,clearTimeout});
    vm.runInContext(await readFile(new URL('dist/vendor/three/addons/libs/draco/gltf/draco_wasm_wrapper.js',root),'utf8'),context);
    return context.DracoDecoderModule({wasmBinary:await readFile(new URL('dist/vendor/three/addons/libs/draco/gltf/draco_decoder.wasm',root))});
  })();
  return decoderModule;
}

export async function loadCachedGLTF(asset,{directory='output/mobile-memory/assets'}={}){
  const path=new URL(`${directory}/${asset.id}.glb`,root);
  let bytes;
  try{bytes=await readFile(path);}catch(error){throw new Error(`Missing cached GLB: ${path.pathname}. Run node scripts/audit-mobile-assets.mjs first (downloads only into output/).`,{cause:error});}
  if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error(`Cached GLB hash mismatch: ${asset.id}`);
  const d=await draco(),{GLTFLoader}=await importBrowserModule('dist/vendor/three/addons/loaders/GLTFLoader.js');
  const loader=new GLTFLoader();
  loader.setDRACOLoader({preload(){},decodeDracoFile(buffer,onLoad,attributeIDs,attributeTypes,colorSpace,onError){
    const decoder=new d.Decoder(),mesh=new d.Mesh();let status;
    try{
      status=decoder.DecodeArrayToMesh(new Int8Array(buffer),buffer.byteLength,mesh);
      if(!status.ok())throw new Error(status.error_msg());
      const geometry=new THREE.BufferGeometry();
      for(const [name,id] of Object.entries(attributeIDs)){
        const attribute=decoder.GetAttributeByUniqueId(mesh,id),Type=globalThis[attributeTypes[name]];
        const type={Float32Array:d.DT_FLOAT32,Uint32Array:d.DT_UINT32,Uint16Array:d.DT_UINT16,Uint8Array:d.DT_UINT8,Int32Array:d.DT_INT32,Int16Array:d.DT_INT16,Int8Array:d.DT_INT8}[Type.name];
        const count=mesh.num_points()*attribute.num_components(),size=count*Type.BYTES_PER_ELEMENT,ptr=d._malloc(size);
        try{
          decoder.GetAttributeDataArrayForAllPoints(mesh,attribute,type,size,ptr);
          geometry.setAttribute(name,new THREE.BufferAttribute(new Type(d.HEAPU8.buffer,ptr,count).slice(),attribute.num_components()));
        }finally{d._free(ptr);}
      }
      const count=mesh.num_faces()*3,ptr=d._malloc(count*4);
      try{decoder.GetTrianglesUInt32Array(mesh,count*4,ptr);geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(d.HEAPU8.buffer,ptr,count).slice(),1));}finally{d._free(ptr);}
      onLoad(geometry);
    }catch(error){onError(error);}finally{if(status)d.destroy(status);d.destroy(mesh);d.destroy(decoder);}
  }});
  loader.register(parser=>{
    parser.loadTextureImage=()=>Promise.resolve(new THREE.Texture());
    return {name:'NODE_TEST_SKIP_IMAGE_DECODING'};
  });
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
