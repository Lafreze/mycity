import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { statusAt } from './products.js';
import { CITY_PROPS } from './props.js?v=neighbors-3';
import { CANAL, boatPose, STREET_SURFACES, streetSurfaceY } from './world.js?v=neighbors-3';
import { BOAT_WATERLINE } from './boat-waterline.js';
import { createStaticFrame } from './static-frame.js';
import { createPerformanceMeter } from './performance-meter.js';
import { createWalker } from './walker.js?v=neighbors-3';
import { createLandscape } from './landscape.js?v=neighbors-3';
import { LANDSCAPE, WATER_JOIN_GLSL } from './landscape-projection.js';
import { createNeighbors } from './neighbors.js?v=neighbors-3';
import { browserQualityProfile, includeStreetAsset } from './quality-profile.js';
import { objectResources, disposeResources, resizeTextures, mapSettledLimit, resourceBytes, releaseStaticGeometryAfterUpload } from './asset-memory.js';
import { groundFigure, normalizeStreetModel } from './figure-grounding.js';
import { createAmbientLife } from './ambient-life.js';

// Building geometry comes exclusively from the Hi3D GLB assets in the manifest.
// Simple planes provide the display plinth, street and canal, not replacement buildings.
export async function createCity3D(container,manifest,products,onSelect,onProgress=()=>{},hooks={}) {
  const quality=hooks.quality||browserQualityProfile();
  const scene=new THREE.Scene(),disposables=[],cleanup=[],modelRoots=new Set(),assetStats=[];
  const manager=new THREE.LoadingManager();
  let activeLoads=0,landscape=null;
  const debugEnabled=new URLSearchParams(location.search).has('debug');
  let running=false,frame=0,disposed=false,contextLost=false,walker=null;
  function dispose(){
    if(disposed)return;disposed=true;running=false;cancelAnimationFrame(frame);manager.abort();
    const resources=new Set([...disposables,...(landscape?.resources||[])]);objectResources(scene,resources);
    for(const root of modelRoots)objectResources(root,resources);
    disposeResources(resources);cleanup.reverse().forEach(fn=>fn());modelRoots.clear();scene.clear();
  }
  try {
  scene.matrixAutoUpdate=false;
  const mobile=window.innerWidth<600;
  const dayColor=new THREE.Color('#e7ddcb'),nightColor=new THREE.Color('#162339');
  scene.background=dayColor.clone();scene.fog=new THREE.Fog(dayColor,55,110);
  const renderer=new THREE.WebGLRenderer({antialias:quality.antialias,alpha:false});
  cleanup.push(()=>{renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();});
  renderer.setPixelRatio(Math.min(devicePixelRatio,quality.pixelRatioCap));
  renderer.shadowMap.enabled=quality.shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(38,1,.1,360);
  const initialPosition=new THREE.Vector3(mobile?-46:-19,mobile?31:17,mobile?40:32);
  const initialTarget=new THREE.Vector3(0,1,3.3);
  camera.position.copy(initialPosition);
  const controls=new OrbitControls(camera,renderer.domElement);cleanup.push(()=>controls.dispose());
  controls.target.copy(initialTarget);controls.enableDamping=true;controls.dampingFactor=.07;
  controls.maxPolarAngle=Math.PI*.47;controls.minPolarAngle=.2;controls.minDistance=2.2;controls.maxDistance=70;
  controls.enablePan=true;controls.autoRotate=false;
  const hemi=new THREE.HemisphereLight('#fff5d8','#6c5748',1.6);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe1a8',2.5);sun.position.set(-10,20,12);sun.castShadow=quality.shadows;
  sun.shadow.mapSize.set(quality.shadowMapSize,quality.shadowMapSize);Object.assign(sun.shadow.camera,{left:-25,right:25,top:24,bottom:-24,near:.5,far:65});sun.shadow.bias=-.0005;scene.add(sun);
  const fill=new THREE.DirectionalLight('#b6d6ee',.6);fill.position.set(10,8,-9);scene.add(fill);
  // Low mode must also avoid the HDR environment bake on devices without float
  // color targets. Hemisphere/sun/fill lighting still renders the complete scene.
  let env={texture:null,dispose(){}};
  if(!quality.low||renderer.extensions.has('EXT_color_buffer_float')){
    const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();
    env=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();
  }
  scene.environment=env.texture;scene.environmentIntensity=.45;cleanup.push(()=>{sun.shadow.dispose();env.dispose();});

  const neighbors=createNeighbors(scene);disposables.push(...neighbors.resources);cleanup.push(()=>neighbors.dispose());
  landscape=createLandscape(scene,CANAL,quality);
  cleanup.push(()=>landscape.dispose(false));
  const loadLandscape=()=>landscape.load(manifest.environment).then(()=>null,error=>error);
  const landscapeRequest=quality.low?null:loadLandscape();
  const staticFrame=createStaticFrame(renderer,scene,camera,{enabled:quality.staticFrame,low:quality.low});cleanup.push(()=>staticFrame.dispose());
  for(const light of [hemi,sun,fill])light.layers.enable(1);
  let shadowDirty=true,lastShadowUpdate=-Infinity;
  const invalidate=(shadow=false)=>{staticFrame.invalidate();shadowDirty ||= shadow;};
  const onContextLost=event=>{
    event.preventDefault();if(disposed)return;contextLost=true;running=false;cancelAnimationFrame(frame);walker?.pause();manager.abort();hooks.onContextLost?.();
  };
  // Restoration does not restart uploads into an exhausted context. The user can
  // retry with a fresh renderer and the low profile, even before restoration.
  const contextRestored=()=>{if(!disposed){invalidate(true);hooks.onContextRestored?.();}};
  renderer.domElement.addEventListener('webglcontextlost',onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored',contextRestored);
  cleanup.push(()=>{renderer.domElement.removeEventListener('webglcontextlost',onContextLost);renderer.domElement.removeEventListener('webglcontextrestored',contextRestored);});
  const freezeLocal=object=>object.traverse(o=>{o.updateMatrix();o.matrixAutoUpdate=false;});
  const anisotropy=Math.min(quality.low?2:8,renderer.capabilities.getMaxAnisotropy());
  function improveTextureSampling(object){object.traverse(o=>{if(!o.isMesh)return;for(const m of (Array.isArray(o.material)?o.material:[o.material]))for(const v of Object.values(m))if(v?.isTexture)v.anisotropy=anisotropy;});}
  function surface(w,h,color,x,y,z,roughness=1) {
    const geometry=new THREE.PlaneGeometry(w,h),material=new THREE.MeshStandardMaterial({color,roughness});
    const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;scene.add(mesh);disposables.push(geometry,material);return mesh;
  }
  // Two separate banks leave an actual opening at the canal. No land plane crosses the water.
  for(const dimensions of STREET_SURFACES)surface(...dimensions);
  // No infinite opaque riverbed underneath the fade: it would leave a dark stripe
  // across the painting after the water becomes transparent.
  // Only the town canal moves. Its continuation lives in the cached skirt.
  const canal=surface(LANDSCAPE.nearWaterEnd*2,CANAL.maxZ-CANAL.minZ,'#719b94',0,CANAL.y,8.2,.2);
  canal.layers.set(1);
  canal.material.transparent=true;canal.material.depthWrite=false;
  canal.material.onBeforeCompile=shader=>{
    shader.uniforms.cityWaterTime={value:0};
    shader.uniforms.cityBoatXZ={value:new THREE.Vector2()};
    shader.uniforms.cityBoatPresent={value:0};
    Object.assign(shader.uniforms,landscape.waterUniforms);
    // A water plane must exclude the dry interior of a floating hull, even below sea level.
    // The mask follows the measured waterline, inset slightly to stay within the wood.
    const hullClip=BOAT_WATERLINE.slice(0,-1).map((a,i)=>{
      const b=BOAT_WATERLINE[i+1];
      return `if(hull.x>=${a[0].toFixed(5)}&&hull.x<${b[0].toFixed(5)}){float t=(hull.x-(${a[0].toFixed(5)}))/${(b[0]-a[0]).toFixed(5)};vec2 sides=mix(vec2(${a[1].toFixed(5)},${a[2].toFixed(5)}),vec2(${b[1].toFixed(5)},${b[2].toFixed(5)}),t);if(hull.y>sides.x+0.015&&hull.y<sides.y-0.015)discard;}`;
    }).join('\n');
    shader.vertexShader='varying vec3 cityWaterWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncityWaterWorld = (modelMatrix * vec4(transformed,1.0)).xyz;\n');
    shader.fragmentShader='varying vec3 cityWaterWorld; uniform float cityWaterTime; uniform vec2 cityBoatXZ; uniform float cityBoatPresent; uniform vec3 cityWaterNear; uniform float night;\n'+WATER_JOIN_GLSL+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 hull=cityWaterWorld.xz-cityBoatXZ;
      if(cityBoatPresent>0.5 && abs(hull.x)<1.4 && abs(hull.y)<0.6){${hullClip}}
      float ripple = 0.5 + 0.5 * sin(cityWaterWorld.x * 6.0 - cityWaterTime * 0.72 + sin(cityWaterWorld.z * 26.92 + cityWaterTime * 0.3));
      float crossRipple = 0.5 + 0.5 * sin(cityWaterWorld.z * 69.23 - cityWaterTime * 0.7 + cityWaterWorld.x * .5);
      diffuseColor.rgb += vec3(0.065, 0.075, 0.07) * pow(ripple * crossRipple, 9.0);
      float riverEnd=smoothstep(${LANDSCAPE.nearWaterStart.toFixed(1)},${LANDSCAPE.nearWaterEnd.toFixed(1)},abs(cityWaterWorld.x));
      diffuseColor.a *= cityBankMask(cityWaterWorld.xz)*cityNearWaterAlpha(cityWaterWorld.x);
`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      ${quality.low?'':`// Small flowing normal ripples catch the existing sun; no extra pass.
      vec3 slope=vec3(sin(cityWaterWorld.x*3.-cityWaterTime*.72)*.025,0.,sin(cityWaterWorld.z*9.+cityWaterWorld.x-cityWaterTime*.4)*.018);
      normal=normalize(normal+(viewMatrix*vec4(slope,0.)).xyz);`}
`).replace('#include <tonemapping_fragment>',`#include <tonemapping_fragment>
      // Match the unlit painting in display-linear space, AFTER water lighting
      // and tone mapping. No painting sampler or new per-frame CPU update.
      vec3 paintedWater=mix(cityWaterNear,cityWaterNear*vec3(.10,.14,.27),night);
      gl_FragColor.rgb=mix(gl_FragColor.rgb,paintedWater,.35+.65*riverEnd);
`);
    canal.userData.shader=shader;
  };
  canal.material.customProgramCacheKey=()=> 'product-city-water-v7-'+quality.name;
  // Pavement seams stay flush with the street.
  for(let x=-16;x<17;x+=.8) surface(.012,2.1,'#c8baa1',x,-.01,4.475);
  for(let z=3.55;z<5.5;z+=.45) surface(34,.014,'#c8baa1',0,-.009,z);
  function bankEdge(x,width,z) {
    const geo=new THREE.BoxGeometry(width,.55,.16),mat=new THREE.MeshStandardMaterial({color:'#c5b294',roughness:1});
    const edge=new THREE.Mesh(geo,mat);edge.position.set(x,-.275,z);edge.receiveShadow=true;scene.add(edge);disposables.push(geo,mat);
  }
  // Retaining walls end below the waterline and support each river bank.
  for(const z of [CANAL.minZ-.08,CANAL.maxZ+.08])bankEdge(0,34,z);

  // Bypass responses cached before the new domain was allowed by the asset origin policy.
  // The Worker ignores this query for its shared object cache; GLB fingerprints are unchanged.
  const assetURL=item=>{const url=new URL(item.url||`./assets/models/${item.file}`,location.href);url.searchParams.set('delivery','2');return url.href;};
  const loader=new GLTFLoader(manager);const draco=new DRACOLoader(manager);draco.setWorkerLimit(quality.dracoWorkers);draco.setDecoderPath('./vendor/three/addons/libs/draco/gltf/');loader.setDRACOLoader(draco);cleanup.push(()=>{if(!activeLoads)draco.dispose();});
  async function loadModel(item,maxTextureSize){
    if(disposed||contextLost)throw new Error('Scene stopped');
    activeLoads++;
    try {
    const gltf=await loader.loadAsync(assetURL(item));
    if(disposed||contextLost){disposeResources(objectResources(gltf.scene));throw new Error('Scene stopped');}
    modelRoots.add(gltf.scene);
    groundFigure(gltf.scene,item);
    if(quality.low)releaseStaticGeometryAfterUpload(gltf.scene);
    const resources=objectResources(gltf.scene);
    resizeTextures([...resources].filter(r=>r.isTexture),maxTextureSize);
    if(debugEnabled)assetStats.push({id:item.id,...resourceBytes(resources)});
    // Low mode drops GLTF parser caches and the compressed buffer after parsing.
    return quality.low?{scene:gltf.scene,animations:gltf.animations}:gltf;
    }finally{activeLoads--;if(disposed&&!activeLoads)draco.dispose();}
  }
  const buildings=new Map(),pickables=[],lights=[],streetObjects=[];
  const modelItems=[...manifest.models,...(manifest.characters||[])];
  const worldRequest=fetch('./navigation.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Walking map unavailable');return r.json();});
  let loadedBuildings=0;
  onProgress({stage:'buildings',loaded:0,total:modelItems.length,failed:0});
  const [modelResults,worldResult,landscapeError]=await Promise.all([mapSettledLimit(modelItems,quality.modelConcurrency,async item=>{
    const gltf=await loadModel(item,quality.modelTextureSize);
    onProgress({stage:'buildings',loaded:++loadedBuildings,total:modelItems.length,failed:0});
    return {item,object:gltf.scene,gltf};
  }),worldRequest.then(world=>({world}),error=>({error})),landscapeRequest]);
  const deferredLandscapeError=quality.low&&!contextLost?await loadLandscape():null;
  if(disposed||contextLost)throw new Error('Scene stopped');
  if(deferredLandscapeError||landscapeError||worldResult.error||modelResults.some(result=>result.status==='rejected')) {
    modelResults.forEach((result,index)=>{if(result.status==='rejected')console.error('City asset failed:',modelItems[index].id,result.reason);});
    throw deferredLandscapeError||landscapeError||worldResult.error||new Error('One or more city models could not be loaded');
  }
  const meshes=modelResults.map(result=>result.value);

  function label(text,color='#f6eddb') {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#453425e8';ctx.beginPath();ctx.roundRect(4,4,504,104,30);ctx.fill();
    ctx.strokeStyle='#d6bd91';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=color;ctx.font='30px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,57,465);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true});
    const sprite=new THREE.Sprite(material);sprite.layers.set(1);sprite.scale.set(3.5,.765,1);sprite.renderOrder=10;disposables.push(tex,material);return sprite;
  }

  // Invisible interaction volumes keep pointer events independent of model density.
  // They never replace the visible Hi3D geometry or participate in physical layout.
  const hitGeometry=new THREE.BoxGeometry(1,1,1),hitMaterial=new THREE.MeshBasicMaterial();
  disposables.push(hitGeometry,hitMaterial);
  function addHitVolume(root,content,id,resident=false){
    root.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3().setFromObject(content),center=bounds.getCenter(new THREE.Vector3());
    const hit=new THREE.Mesh(hitGeometry,hitMaterial);hit.scale.copy(bounds.getSize(new THREE.Vector3()));
    hit.position.copy(root.worldToLocal(center));hit.visible=false;hit.userData={...(resident?{residentId:id}:{productId:id}),pickProxy:true};
    root.add(hit);hit.updateMatrix();hit.matrixAutoUpdate=false;pickables.push(hit);
  }

  function addBuilding(item,object,p,archived=false) {
    improveTextureSampling(object);object.updateMatrix();
    const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const scale=(item.width||4.2)/Math.max(size.x,size.z);
    object.position.set(-center.x,-box.min.y,-center.z);
    const normalize=new THREE.Group();normalize.add(object);normalize.scale.setScalar(scale);
    normalize.rotation.y=item.rotation||0;
    const growth=new THREE.Group();growth.add(normalize);growth.matrixAutoUpdate=false;
    const root=new THREE.Group();root.add(growth);root.position.fromArray(p.scenePosition);scene.add(root);
    object.traverse(child=>{
      if(!child.isMesh)return;
      child.castShadow=true;child.receiveShadow=true;
      if(archived){const materials=Array.isArray(child.material)?child.material:[child.material];child.material=materials.map(mat=>{const clone=mat.clone();if(clone.color){clone.userData.cityBaseColor=clone.color.clone();clone.color.multiplyScalar(.65);}return clone;});if(child.material.length===1)child.material=child.material[0];}
    });
    freezeLocal(normalize);root.updateMatrix();root.matrixAutoUpdate=false;
    addHitVolume(root,normalize,p.id);
    const tag=label(p.name,archived?'#d0c8bc':'#fff0d0');tag.position.set(0,size.y*scale+.5,0);root.add(tag);tag.userData.productId=p.id;pickables.push(tag);
    const light=new THREE.PointLight('#ffb44c',0,6,2);light.layers.enable(1);light.visible=false;light.position.set(0,1.2,2);root.add(light);lights.push(light);
    buildings.set(p.id,{root,growth,tag,target:1,product:p,height:size.y*scale,baseColor:archived});
  }
  meshes.forEach(({item,object})=>{const p=products.find(p=>p.id===item.id);if(p)addBuilding(item,object,p);});
  const archive=products.find(p=>p.id==='archive'),source=meshes.find(m=>m.item.id==='chess');
  if(archive&&source){const copy=source.object.clone(true);copy.position.set(0,0,0);addBuilding({...source.item,width:2.8},copy,archive,true);}
  let night=false,flight=null,hovered=null,selectedId=null,currentYear=2026,lifeEnabled=true,lifeTime=0,lastTick=0;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ambient=createAmbientLife(scene,{low:quality.low,reducedMotion});disposables.push(...ambient.resources);


  function placeStreetAsset(item,object,definition,index,animations=[]) {
    improveTextureSampling(object);
    const {bounds,scale,contactY}=normalizeStreetModel(object,definition);
    definition.positions.forEach((position,i)=>{
      const normalized=new THREE.Group();normalized.add(i===0?object:object.clone(true));normalized.scale.setScalar(scale*(definition.varied?.93+Math.sin(i*2.1)*.07:1));normalized.rotation.y=definition.rotations?.[i]??((definition.rotation||0)+(definition.varied?i*.8:0));
      const floorOffset=definition.person?streetSurfaceY(position[0],position[2]):0;normalized.position.y=floorOffset;
      const root=new THREE.Group();root.add(normalized);root.position.fromArray(position);scene.add(root);
      if(definition.ground)root.scale.y=.08;
      root.traverse(child=>{if(child.isMesh){child.castShadow=!definition.ground&&definition.motion!=='drift';child.receiveShadow=true;}});
      if(definition.person)addHitVolume(root,normalized,item.id,true);
      else if(definition.product)addHitVolume(root,normalized,definition.product);
      if(definition.person){
        root.updateMatrix();root.matrixAutoUpdate=false;normalized.updateMatrix();normalized.matrixAutoUpdate=false;
        root.traverse(o=>{o.layers.set(1);if(o.isMesh){o.castShadow=false;if(o.isSkinnedMesh)o.frustumCulled=false;}});
      }else freezeLocal(root);
      if(definition.motion==='drift'){root.matrixAutoUpdate=true;root.traverse(o=>o.layers.set(1));}
      const firstYear=definition.product?Number(products.find(p=>p.id===definition.product).launched.slice(0,4)):2023;
      const entry={root,definition,position:new THREE.Vector3(...position),firstYear,phase:index*.73+i};
      root.visible=currentYear>=firstYear;streetObjects.push(entry);invalidate(true);
      if(definition.person)neighbors.add({id:item.id,root,model:normalized,animations,height:(bounds.max.y-contactY)*scale,firstYear,floorOffset});
      if(definition.glow){const light=new THREE.PointLight('#ffb852',night?8:0,5,2);light.layers.enable(1);light.position.set(position[0],position[1]+definition.height*.9,position[2]);scene.add(light);lights.push(light);entry.light=light;light.visible=night&&root.visible;}
    });
    if(item.id==='stone-bridge')walker?.setBridgeReady(true);
    walker?.setAssetReady(item.id);
  }
  // The first view appears as soon as the buildings load. Props stream in three at a time.
  const propQueue=(manifest.props||[]).filter(item=>CITY_PROPS.some(p=>p.id===item.id)&&includeStreetAsset(item.id,quality));const totalProps=propQueue.length;let loadedProps=0,failedProps=0;
  async function propWorker(){
    while(propQueue.length&&!disposed&&!contextLost){
      const item=propQueue.shift();
      try{
        const definition=CITY_PROPS.find(p=>p.id===item.id);
        const gltf=await loadModel(item,quality.propTextureSize);
        placeStreetAsset(item,gltf.scene,definition,CITY_PROPS.indexOf(definition),gltf.animations);loadedProps++;
      }catch(error){if(disposed||contextLost)return;failedProps++;console.warn('Street asset unavailable:',item.id,error);}
      onProgress({stage:'street',loaded:loadedProps,total:totalProps,failed:failedProps});
    }
  }
  const streetReady=Promise.all(Array.from({length:quality.propConcurrency},propWorker)).finally(()=>{draco.dispose();if(!disposed)invalidate(true);});
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  raycaster.layers.enable(1);
  const down={x:0,y:0,active:false};
  function pick(event){
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    for(const hit of raycaster.intersectObjects(pickables,false)){
      const {productId,residentId,pickProxy}=hit.object.userData;
      if(residentId&&neighbors.getTarget(residentId))return `resident:${residentId}`;
      if(productId&&buildings.get(productId)?.target>0&&(hit.object.visible||pickProxy))return productId;
    }
  }
  const pointerDown=e=>{down.x=e.clientX;down.y=e.clientY;down.active=true;flight=null;};
  const pointerUp=e=>{down.active=false;if(walker?.active)return;if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)return;const id=pick(e);if(id?.startsWith('resident:'))hooks.onResident?.(id.slice(9));else if(id)onSelect(id);};
  const pointerCancel=()=>{down.active=false;};
  let hoverAt=0;const pointerMove=e=>{if(walker?.active||down.active||e.pointerType==='touch'||performance.now()-hoverAt<90)return;hoverAt=performance.now();const id=pick(e);renderer.domElement.style.cursor=id?'pointer':'grab';if(id!==hovered){buildings.forEach((b,key)=>b.tag.material.color.set(key===id?'#ffe0a0':'#ffffff'));hovered=id;neighbors.setHovered(id?.startsWith('resident:')?id.slice(9):null);}};
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointermove',pointerMove);
  renderer.domElement.addEventListener('pointercancel',pointerCancel);
  cleanup.push(()=>{for(const [name,fn] of [['pointerdown',pointerDown],['pointerup',pointerUp],['pointermove',pointerMove],['pointercancel',pointerCancel]])renderer.domElement.removeEventListener(name,fn);});

  function resize(){const w=container.clientWidth||container.parentElement.clientWidth,h=container.clientHeight||container.parentElement.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();staticFrame.resize();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);cleanup.push(()=>resizeObserver.disconnect());resize();
  const world=worldResult.world,hero=meshes.find(m=>m.item.id==='hero');
  if(hero){
    improveTextureSampling(hero.object);
    walker=createWalker({scene,camera,canvas:renderer.domElement,gltf:hero.gltf,world,motion:hero.item.locomotion,getResidents:(p,y)=>neighbors.nearby(p,y),
      onMode:value=>{controls.enabled=!value;controls.autoRotate=false;flight=null;camera.fov=value?52:38;camera.updateProjectionMatrix();invalidate();hooks.onMode?.(value);},
      onDiscovery:place=>hooks.onDiscovery?.(place),onNearby:place=>hooks.onNearby?.(place)});
    cleanup.push(()=>walker.dispose());
    walker.setBridgeReady(streetObjects.some(o=>o.definition.id==='stone-bridge'));
    new Set(streetObjects.map(o=>o.definition.id)).forEach(id=>walker.setAssetReady(id));
  }
  const fireflyGeometry=new THREE.BufferGeometry(),fireflyPositions=[];
  for(let i=0;i<32;i++){const park=i<20;fireflyPositions.push((Math.sin(i*7.7)*.5+.5)*(park?12:20)-(park?6:10),.7+(i%5)*.17,park?-9.4-Math.cos(i*2.2)*2:12+Math.sin(i*1.9));}
  fireflyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(fireflyPositions,3));
  const fireflyMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0}},vertexShader:'uniform float time;varying float light;void main(){vec3 p=position;p.x+=sin(time*.35+position.z)*.18;p.y+=sin(time*.7+position.x)*.14;light=.45+.55*sin(time*1.7+position.x*3.);vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(18./-v.z,1.5,4.);}',fragmentShader:'varying float light;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(1.,.77,.25,a*light);}'});
  const fireflies=new THREE.Points(fireflyGeometry,fireflyMaterial);fireflies.layers.set(1);fireflies.visible=false;scene.add(fireflies);disposables.push(fireflyGeometry,fireflyMaterial);
  renderer.info.autoReset=false;
  const meter=createPerformanceMeter(renderer,container,()=>pick({clientX:container.clientWidth*.45,clientY:container.clientHeight*.48}));
  cleanup.push(()=>meter?.dispose());
  function tick(){if(!running||disposed||contextLost)return;frame=requestAnimationFrame(tick);
    const now=performance.now(),delta=lastTick?Math.min((now-lastTick)/1000,.1):0;lastTick=now;
    if(lifeEnabled&&!reducedMotion)lifeTime+=delta;
    const elapsed=lifeTime;ambient.update(elapsed,night);
    fireflies.visible=night;fireflyMaterial.uniforms.time.value=elapsed;
    if(lifeEnabled&&!reducedMotion&&canal.userData.shader)canal.userData.shader.uniforms.cityWaterTime.value=elapsed;
    let growing=false;
    const blend=reducedMotion?1:1-Math.exp(-8*delta);
    buildings.forEach(b=>{
      if(b.growth.scale.y!==b.target){
        const next=THREE.MathUtils.lerp(b.growth.scale.y,b.target,blend);
        b.growth.scale.y=Math.abs(next-b.target)<.001?b.target:next;
        b.growth.updateMatrix();growing=true;invalidate(true);
      }
      b.root.visible=b.target>0||b.growth.scale.y>.015;
      b.tag.visible=!walker?.active&&b.target>0&&(hovered===b.product.id||selectedId===b.product.id);
      if(b.tag.visible){
        b.tag.material.opacity=THREE.MathUtils.clamp(b.growth.scale.y,0,1);
        const distance=camera.position.distanceTo(b.root.position);
        const width=Math.min(2.8,2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*135/(container.clientHeight||800));
        b.tag.scale.set(width,width*112/512,1);
      }
    });
    if(lifeEnabled&&!reducedMotion)streetObjects.forEach(entry=>{
      if(!entry.root.visible||entry.definition.motion!=='drift')return;
      const pose=boatPose(elapsed,entry.position.x);
      entry.root.position.set(pose.x,pose.y,pose.z);entry.root.rotation.x=pose.roll;
    });
    if(canal.userData.shader){
      const boat=streetObjects.find(o=>o.definition.id==='rowboat'),uniforms=canal.userData.shader.uniforms;
      uniforms.cityBoatPresent.value=boat?.root.visible?1:0;
      if(boat)uniforms.cityBoatXZ.value.set(boat.root.position.x,boat.root.position.z);
    }
    const walkingChanged=walker?.update(delta)||false;
    neighbors.update(lifeEnabled&&!reducedMotion?delta:0,camera,walker?.root.position,!!walker?.active,currentYear);
    const flying=!!flight;
    if(flight){camera.position.lerp(flight.position,blend);controls.target.lerp(flight.target,blend);if(camera.position.distanceTo(flight.position)<.03)flight=null;}
    const cameraChanged=walker?.active?walkingChanged:controls.update(delta);
    if(shadowDirty&&(now-lastShadowUpdate>250||(!growing&&loadedProps+failedProps===totalProps))){
      renderer.shadowMap.needsUpdate=true;shadowDirty=false;lastShadowUpdate=now;staticFrame.invalidate();
    }
    renderer.info.reset();meter?.begin();staticFrame.render(cameraChanged||flying||growing);meter?.end();
  }
  function setYear(year){invalidate(true);currentYear=year;walker?.setYear(year);buildings.forEach(b=>{const status=statusAt(b.product,year);b.target=status==='future'?0:1;if(b.baseColor)b.root.traverse(o=>{if(o.isMesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m.userData.cityBaseColor)m.color.copy(m.userData.cityBaseColor).multiplyScalar(status==='archived'?.65:1);});});});streetObjects.forEach(o=>{o.root.visible=year>=o.firstYear;if(o.light)o.light.visible=night&&o.root.visible;});}
  function setNight(value){invalidate();night=value;landscape.setNight(value);scene.background.copy(night?nightColor:dayColor);scene.fog.color.copy(scene.background);hemi.intensity=night?.5:1.6;sun.intensity=night?.35:2.5;fill.intensity=night?.7:.6;scene.environmentIntensity=night?.28:.45;sun.color.set(night?'#a1b8ed':'#ffe1a8');renderer.toneMappingExposure=night?.9:1.05;lights.forEach(light=>{light.intensity=night?8:0;light.visible=night;});canal.material.color.set(night?'#273d55':'#789f9c');}
  function focus(id){selectedId=id;const b=buildings.get(id);if(!b||walker?.active)return;const h=Math.max(4,b.height);flight={target:b.root.position.clone().add(new THREE.Vector3(0,h*.5,0)),position:b.root.position.clone().add(new THREE.Vector3(-h*1.15,h*.95,h*1.85))};}
  function view(name){
    walker?.setActive(false);
    controls.autoRotate=false;
    const boat=streetObjects.find(o=>o.definition.id==='rowboat');
    const x=boat?.root.position.x||0;
    const presets={canal:{position:new THREE.Vector3(x-3,9.5,16),target:new THREE.Vector3(x,.1,8.2)},overhead:{position:new THREE.Vector3(0,35,5),target:new THREE.Vector3(0,0,4)}};
    flight=presets[name]||null;
  }
  function reset(){walker?.setActive(false);flight={position:initialPosition.clone(),target:initialTarget.clone()};}
  function zoom(factor){if(walker?.active){walker.zoom(factor);return;}const delta=camera.position.clone().sub(controls.target).multiplyScalar(factor);const length=THREE.MathUtils.clamp(delta.length(),controls.minDistance,controls.maxDistance);flight={position:controls.target.clone().add(delta.setLength(length)),target:controls.target.clone()};}
  function resume(){if(running||disposed||contextLost)return;running=true;lastTick=0;resize();tick();}
  function pause(){running=false;walker?.pause();cancelAnimationFrame(frame);}
  function setTalking(id){
    neighbors.setTalking(id);
    const person=id&&neighbors.getTarget(id);
    walker?.setConversation(person?.root.position);
    if(person&&!walker?.active){controls.autoRotate=false;flight={target:person.root.position.clone().add(new THREE.Vector3(0,.9,0)),position:person.root.position.clone().add(new THREE.Vector3(-2.2,2,3.6))};}
  }
  function setLife(value){lifeEnabled=value;}
  function setOrbit(value){if(value)walker?.setActive(false);controls.autoRotate=value;controls.autoRotateSpeed=.28;}
  function setWalking(value){if(!walker)return false;if(value)walker.setActive(true);else reset();return true;}
  if(debugEnabled){
    const debug={ready:false,snapshot(){
      const resources=objectResources(scene);for(const root of modelRoots)objectResources(root,resources);
      return {quality,contextLost,loadedProps,failedProps,totalProps,assets:assetStats,
        memory:{...renderer.info.memory},render:{...renderer.info.render},...resourceBytes(resources),
        drawingBuffer:[renderer.domElement.width,renderer.domElement.height],
        antialias:renderer.getContext().getContextAttributes()?.antialias,
        staticFrame:staticFrame.settings,shadowMap:renderer.shadowMap.enabled?sun.shadow.mapSize.toArray():null,
        ambient:{triangles:ambient.triangles,points:ambient.points},
        groundedFigures:[...modelRoots].filter(o=>o.userData.figureGrounding).map(o=>o.userData.figureGrounding),
        residents:streetObjects.filter(o=>o.definition.person).map(o=>o.definition.id)};
    },frame(){return {render:{...renderer.info.render},cacheRebuilds:staticFrame.settings.rebuilds||0};},loseContext:()=>renderer.forceContextLoss(),restoreContext:()=>renderer.forceContextRestore(),dispose};
    window.__mycityDebug=debug;streetReady.then(()=>{debug.ready=!disposed&&!contextLost;});
    cleanup.push(()=>{if(window.__mycityDebug===debug)delete window.__mycityDebug;});
  }
  return {setYear,setNight,focus,reset,zoom,resume,pause,dispose,setLife,setOrbit,view,streetReady,setWalking,setTalking,interact:()=>walker?.interact(),setMuted:value=>walker?.setMuted(value),setRun:value=>walker?.setRun(value)};
  } catch(error){dispose();throw error;}
}
