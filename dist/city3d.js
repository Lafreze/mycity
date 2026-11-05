import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { statusAt } from './products.js';
import { CITY_PROPS } from './props.js';
import { CANAL, boatPose } from './world.js';

// Building geometry comes exclusively from the Hi3D GLB assets in the manifest.
// Simple planes provide the display plinth, street and canal, not replacement buildings.
export async function createCity3D(container,manifest,products,onSelect,onProgress=()=>{}) {
  const scene=new THREE.Scene();
  const mobile=window.innerWidth<600;
  const dayColor=new THREE.Color('#e7ddcb'),nightColor=new THREE.Color('#162339');
  scene.background=dayColor.clone();scene.fog=new THREE.Fog(dayColor,55,110);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(38,1,.1,160);
  const initialPosition=new THREE.Vector3(mobile?-46:-19,mobile?31:17,mobile?40:32);
  const initialTarget=new THREE.Vector3(0,1,3.3);
  camera.position.copy(initialPosition);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.copy(initialTarget);controls.enableDamping=true;controls.dampingFactor=.07;
  controls.maxPolarAngle=Math.PI*.47;controls.minPolarAngle=.2;controls.minDistance=6;controls.maxDistance=70;
  controls.enablePan=true;controls.autoRotate=false;
  const hemi=new THREE.HemisphereLight('#fff5d8','#6c5748',1.6);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe1a8',2.5);sun.position.set(-10,20,12);sun.castShadow=true;
  sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-25,right:25,top:24,bottom:-24,near:.5,far:65});sun.shadow.bias=-.0005;scene.add(sun);
  const fill=new THREE.DirectionalLight('#b6d6ee',.6);fill.position.set(10,8,-9);scene.add(fill);
  const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();
  const env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.45;room.dispose();pmrem.dispose();

  const disposables=[];
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  function improveTextureSampling(object){object.traverse(o=>{if(!o.isMesh)return;for(const m of (Array.isArray(o.material)?o.material:[o.material]))for(const v of Object.values(m))if(v?.isTexture)v.anisotropy=anisotropy;});}
  function surface(w,h,color,x,y,z,roughness=1) {
    const geometry=new THREE.PlaneGeometry(w,h),material=new THREE.MeshStandardMaterial({color,roughness});
    const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;scene.add(mesh);disposables.push(geometry,material);return mesh;
  }
  // Two separate banks leave an actual opening at the canal. No land plane crosses the water.
  surface(34,14.9,'#d6c6a9',0,-.025,-.55);
  surface(34,5,'#dfceb0',0,-.025,12);
  surface(34,2.15,'#b6aa94',0,-.018,4.475);
  surface(34,1.6,'#e4d4b9',0,-.014,2.6);
  surface(40,CANAL.maxZ-CANAL.minZ,'#435955',0,-1.1,8.2);
  const canal=surface(40,CANAL.maxZ-CANAL.minZ,'#719b94',0,CANAL.y,8.2,.2);
  canal.material.onBeforeCompile=shader=>{
    shader.uniforms.cityWaterTime={value:0};
    shader.vertexShader='varying vec2 cityWaterUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\ncityWaterUv = uv;');
    shader.fragmentShader='varying vec2 cityWaterUv; uniform float cityWaterTime;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float ripple = 0.5 + 0.5 * sin(cityWaterUv.x * 240.0 - cityWaterTime * 0.72 + sin(cityWaterUv.y * 70.0 + cityWaterTime * 0.3));
      float crossRipple = 0.5 + 0.5 * sin(cityWaterUv.y * 180.0 - cityWaterTime * 0.7 + cityWaterUv.x * 20.0);
      diffuseColor.rgb += vec3(0.065, 0.075, 0.07) * pow(ripple * crossRipple, 9.0);
    `);
    canal.userData.shader=shader;
  };
  canal.material.customProgramCacheKey=()=> 'product-city-water-v2';
  // Pavement seams stay flush with the street.
  for(let x=-16;x<17;x+=.8) surface(.012,2.1,'#c8baa1',x,-.01,4.475);
  for(let z=3.55;z<5.5;z+=.45) surface(34,.014,'#c8baa1',0,-.009,z);
  function bankEdge(x,width,z) {
    const geo=new THREE.BoxGeometry(width,.55,.16),mat=new THREE.MeshStandardMaterial({color:'#c5b294',roughness:1});
    const edge=new THREE.Mesh(geo,mat);edge.position.set(x,-.275,z);edge.receiveShadow=true;scene.add(edge);disposables.push(geo,mat);
  }
  // Retaining walls end below the waterline and support each river bank.
  for(const z of [CANAL.minZ-.08,CANAL.maxZ+.08])bankEdge(0,34,z);

  const loader=new GLTFLoader();const draco=new DRACOLoader();draco.setDecoderPath('./vendor/three/addons/libs/draco/gltf/');loader.setDRACOLoader(draco);
  const buildings=new Map(),pickables=[],lights=[],streetObjects=[],allModels=[];
  const modelResults=await Promise.allSettled(manifest.models.map(async item=>{
    const gltf=await loader.loadAsync(item.url || `./assets/models/${item.file}`);
    return {item,object:gltf.scene};
  }));
  if(modelResults.some(result=>result.status==='rejected')) {
    modelResults.forEach((result,index)=>{if(result.status==='rejected')console.error('Building asset failed:',manifest.models[index].id,result.reason);});
    const resources=new Set(disposables);
    modelResults.filter(r=>r.status==='fulfilled').forEach(r=>r.value.object.traverse(o=>{
      if(o.geometry)resources.add(o.geometry);
      if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{resources.add(m);Object.values(m).forEach(v=>{if(v?.isTexture)resources.add(v);});});
    }));
    resources.forEach(resource=>resource.dispose());draco.dispose();env.dispose();controls.dispose();renderer.dispose();renderer.domElement.remove();
    throw new Error('One or more building models could not be loaded');
  }
  const meshes=modelResults.map(result=>result.value);

  function label(text,color='#f6eddb') {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#453425e8';ctx.beginPath();ctx.roundRect(4,4,504,104,30);ctx.fill();
    ctx.strokeStyle='#d6bd91';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=color;ctx.font='30px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,57,465);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true});
    const sprite=new THREE.Sprite(material);sprite.scale.set(3.5,.765,1);sprite.renderOrder=10;disposables.push(tex,material);return sprite;
  }

  const journalCanvas=document.createElement('canvas');journalCanvas.width=512;journalCanvas.height=384;
  const journalTexture=new THREE.CanvasTexture(journalCanvas);journalTexture.colorSpace=THREE.SRGBColorSpace;
  const journalMaterial=new THREE.SpriteMaterial({map:journalTexture,transparent:true});
  const journalSign=new THREE.Sprite(journalMaterial);journalSign.scale.set(1.25,.9375,1);journalSign.position.set(-3.25,1.15,2.65);scene.add(journalSign);pickables.push(journalSign);disposables.push(journalTexture,journalMaterial);
  function updateJournal(year){
    const update=products.flatMap(p=>p.updates.filter(u=>Number(u.date.slice(0,4))<=year).map(u=>({...u,product:p}))).sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(!update)return;
    const ctx=journalCanvas.getContext('2d');ctx.clearRect(0,0,512,384);ctx.fillStyle='#f6edda';ctx.beginPath();ctx.roundRect(5,5,502,374,16);ctx.fill();ctx.strokeStyle='#99774a';ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle='#9a7a4b';ctx.textAlign='center';ctx.font='21px Georgia';ctx.fillText('NOTES FROM THE CITY',256,62);ctx.fillStyle='#4b3825';ctx.font='30px "PingFang SC", sans-serif';
    const chars=[...update.title];for(let i=0;i<chars.length;i+=12)ctx.fillText(chars.slice(i,i+12).join(''),256,135+i/12*47);
    ctx.fillStyle='#9c8058';ctx.font='25px Georgia';ctx.fillText(update.date.replaceAll('-','.'),256,280);ctx.font='20px Georgia';ctx.fillText(update.product.name,256,330,460);
    journalTexture.needsUpdate=true;journalSign.userData.productId=update.product.id;
  }

  function addBuilding(item,object,p,archived=false) {
    improveTextureSampling(object);allModels.push(object);
    const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const scale=(item.width||4.2)/Math.max(size.x,size.z);
    object.position.set(-center.x,-box.min.y,-center.z);
    const normalize=new THREE.Group();normalize.add(object);normalize.scale.setScalar(scale);
    normalize.rotation.y=item.rotation||0;
    const growth=new THREE.Group();growth.add(normalize);
    const root=new THREE.Group();root.add(growth);root.position.fromArray(p.scenePosition);scene.add(root);
    object.traverse(child=>{
      if(!child.isMesh)return;
      child.castShadow=true;child.receiveShadow=true;child.userData.productId=p.id;pickables.push(child);
      if(archived){const materials=Array.isArray(child.material)?child.material:[child.material];child.material=materials.map(mat=>{const clone=mat.clone();if(clone.color){clone.userData.cityBaseColor=clone.color.clone();clone.color.multiplyScalar(.65);}return clone;});if(child.material.length===1)child.material=child.material[0];}
    });
    const tag=label(p.name,archived?'#d0c8bc':'#fff0d0');tag.position.set(0,size.y*scale+.5,0);root.add(tag);tag.userData.productId=p.id;pickables.push(tag);
    const light=new THREE.PointLight('#ffb44c',0,6,2);light.position.set(0,1.2,2);root.add(light);lights.push(light);
    buildings.set(p.id,{root,growth,tag,target:1,product:p,height:size.y*scale,baseColor:archived});
  }
  meshes.forEach(({item,object})=>{const p=products.find(p=>p.id===item.id);if(p)addBuilding(item,object,p);});
  const archive=products.find(p=>p.id==='archive'),source=meshes.find(m=>m.item.id==='chess');
  if(archive&&source){const copy=source.object.clone(true);copy.position.set(0,0,0);addBuilding({...source.item,width:2.8},copy,archive,true);}
  let running=false,frame=0,night=false,flight=null,hovered=null,disposed=false,currentYear=2026,lifeEnabled=true,lifeTime=0,lastTick=0;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;


  function placeStreetAsset(item,object,definition,index) {
    improveTextureSampling(object);allModels.push(object);
    const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=definition.height?definition.height/Math.max(size.y,.01):definition.width/Math.max(size.x,size.z,.01);
    object.position.set(-center.x,-bounds.min.y,-center.z);
    definition.positions.forEach((position,i)=>{
      const normalized=new THREE.Group();normalized.add(i===0?object:object.clone(true));normalized.scale.setScalar(scale*(definition.varied?.93+Math.sin(i*2.1)*.07:1));normalized.rotation.y=(definition.rotation||0)+(definition.varied?i*.8:0);
      const root=new THREE.Group();root.add(normalized);root.position.fromArray(position);scene.add(root);
      if(definition.ground)root.scale.y=.08;
      root.traverse(child=>{if(child.isMesh){child.castShadow=!definition.ground&&definition.motion!=='drift';child.receiveShadow=true;if(definition.product){child.userData.productId=definition.product;pickables.push(child);}}});
      const firstYear=definition.product?Number(products.find(p=>p.id===definition.product).launched.slice(0,4)):2023;
      const entry={root,definition,position:new THREE.Vector3(...position),firstYear,phase:index*.73+i};
      root.visible=currentYear>=firstYear;streetObjects.push(entry);renderer.shadowMap.needsUpdate=true;
      if(definition.glow){const light=new THREE.PointLight('#ffb852',night?5:0,5,2);light.position.set(position[0],position[1]+definition.height*.9,position[2]);scene.add(light);lights.push(light);entry.light=light;light.visible=root.visible;}
    });
  }
  // The first view appears as soon as the buildings load. Props stream in three at a time.
  const propQueue=(manifest.props||[]).filter(item=>CITY_PROPS.some(p=>p.id===item.id));const totalProps=propQueue.length;let loadedProps=0,failedProps=0;
  async function propWorker(){while(propQueue.length&&!disposed){const item=propQueue.shift();try{const definition=CITY_PROPS.find(p=>p.id===item.id);if(!definition)continue;const gltf=await loader.loadAsync(item.url || `./assets/models/${item.file}`);if(disposed){gltf.scene.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{Object.values(m).forEach(v=>{if(v?.isTexture)v.dispose();});m.dispose();});});return;}placeStreetAsset(item,gltf.scene,definition,CITY_PROPS.indexOf(definition));loadedProps++;}catch(error){failedProps++;console.warn('Street asset unavailable:',item.id,error);}onProgress({loaded:loadedProps,total:totalProps,failed:failedProps});}}
  const streetReady=Promise.all([propWorker(),propWorker(),propWorker()]).finally(()=>draco.dispose());
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const down={x:0,y:0};
  function pick(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(pickables,false).find(hit=>{const id=hit.object.userData.productId;return buildings.get(id)?.root.visible;})?.object.userData.productId;}
  const pointerDown=e=>{down.x=e.clientX;down.y=e.clientY;flight=null;};
  const pointerUp=e=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)return;const id=pick(e);if(id)onSelect(id);};
  let hoverAt=0;const pointerMove=e=>{if(performance.now()-hoverAt<90)return;hoverAt=performance.now();const id=pick(e);renderer.domElement.style.cursor=id?'pointer':'grab';if(id!==hovered){buildings.forEach((b,key)=>b.tag.material.color.set(key===id?'#ffe0a0':'#ffffff'));hovered=id;}};
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointermove',pointerMove);

  function resize(){const w=container.clientWidth||container.parentElement.clientWidth,h=container.clientHeight||container.parentElement.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
  function tick(){if(!running||disposed)return;frame=requestAnimationFrame(tick);
    const now=performance.now(),delta=lastTick?Math.min((now-lastTick)/1000,.1):0;lastTick=now;
    if(lifeEnabled&&!reducedMotion)lifeTime+=delta;
    const elapsed=lifeTime;
    if(lifeEnabled&&!reducedMotion&&canal.userData.shader)canal.userData.shader.uniforms.cityWaterTime.value=elapsed;
    buildings.forEach(b=>{if(Math.abs(b.growth.scale.y-b.target)>.001)renderer.shadowMap.needsUpdate=true;b.growth.scale.y=THREE.MathUtils.lerp(b.growth.scale.y,b.target,reducedMotion?1:.065);b.root.visible=b.target>0||b.growth.scale.y>.015;b.tag.visible=b.target>0;b.tag.material.opacity=THREE.MathUtils.clamp(b.growth.scale.y,0,1);const distance=camera.position.distanceTo(b.root.position);const width=Math.min(2.8,2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*135/(container.clientHeight||800));b.tag.scale.set(width,width*112/512,1);});
    if(lifeEnabled&&!reducedMotion)streetObjects.forEach(entry=>{
      if(!entry.root.visible||entry.definition.motion!=='drift')return;
      const pose=boatPose(elapsed,entry.position.x);
      entry.root.position.set(pose.x,pose.y,pose.z);entry.root.rotation.x=pose.roll;
    });
    if(flight){camera.position.lerp(flight.position,reducedMotion?1:.065);controls.target.lerp(flight.target,reducedMotion?1:.065);if(camera.position.distanceTo(flight.position)<.03)flight=null;}
    controls.update();renderer.render(scene,camera);
  }
  function setYear(year){renderer.shadowMap.needsUpdate=true;currentYear=year;buildings.forEach(b=>{const status=statusAt(b.product,year);b.target=status==='future'?0:1;if(b.baseColor)b.root.traverse(o=>{if(o.isMesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m.userData.cityBaseColor)m.color.copy(m.userData.cityBaseColor).multiplyScalar(status==='archived'?.65:1);});});});streetObjects.forEach(o=>{o.root.visible=year>=o.firstYear;if(o.light)o.light.visible=o.root.visible;});updateJournal(year);}
  function setNight(value){night=value;scene.background.copy(night?nightColor:dayColor);scene.fog.color.copy(scene.background);hemi.intensity=night?.5:1.6;sun.intensity=night?.35:2.5;fill.intensity=night?.7:.6;scene.environmentIntensity=night?.28:.45;sun.color.set(night?'#a1b8ed':'#ffe1a8');renderer.toneMappingExposure=night?.9:1.05;lights.forEach(light=>light.intensity=night?8:0);canal.material.color.set(night?'#273d55':'#789f9c');}
  function focus(id){const b=buildings.get(id);if(!b)return;const h=Math.max(4,b.height);flight={target:b.root.position.clone().add(new THREE.Vector3(0,h*.5,0)),position:b.root.position.clone().add(new THREE.Vector3(-h*1.15,h*.95,h*1.85))};}
  function view(name){
    controls.autoRotate=false;
    const boat=streetObjects.find(o=>o.definition.id==='rowboat');
    const x=boat?.root.position.x||0;
    const presets={canal:{position:new THREE.Vector3(x-3,9.5,16),target:new THREE.Vector3(x,.1,8.2)},overhead:{position:new THREE.Vector3(0,35,5),target:new THREE.Vector3(0,0,4)}};
    flight=presets[name]||null;
  }
  function reset(){flight={position:initialPosition.clone(),target:initialTarget.clone()};}
  function zoom(factor){const delta=camera.position.clone().sub(controls.target).multiplyScalar(factor);const length=THREE.MathUtils.clamp(delta.length(),controls.minDistance,controls.maxDistance);flight={position:controls.target.clone().add(delta.setLength(length)),target:controls.target.clone()};}
  function resume(){if(running||disposed)return;running=true;lastTick=0;resize();tick();}
  function pause(){running=false;cancelAnimationFrame(frame);}
  function dispose(){pause();disposed=true;resizeObserver.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointermove',pointerMove);const resources=new Set(disposables);scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{resources.add(m);Object.values(m).forEach(v=>{if(v?.isTexture)resources.add(v);});});});resources.forEach(r=>r.dispose());env.dispose();renderer.dispose();renderer.domElement.remove();}
  function setLife(value){lifeEnabled=value;}
  function setOrbit(value){controls.autoRotate=value;controls.autoRotateSpeed=.28;}
  return {setYear,setNight,focus,reset,zoom,resume,pause,dispose,setLife,setOrbit,view,streetReady};
}
