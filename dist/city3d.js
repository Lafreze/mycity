import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { statusAt } from './products.js';
import { CITY_PROPS } from './props.js';

// Building geometry comes exclusively from the Hi3D GLB assets in the manifest.
// Simple planes provide the display plinth, street and canal, not replacement buildings.
export async function createCity3D(container,manifest,products,onSelect,onProgress=()=>{}) {
  const scene=new THREE.Scene();
  const mobile=window.innerWidth<600;
  const dayColor=new THREE.Color('#e7ddcb'),nightColor=new THREE.Color('#162339');
  scene.background=dayColor.clone();scene.fog=new THREE.Fog(dayColor,40,85);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(38,1,.1,160);
  const initialPosition=new THREE.Vector3(mobile?-38:-15,mobile?25:12,mobile?33:24);
  const initialTarget=new THREE.Vector3(0,1,1.2);
  camera.position.copy(initialPosition);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.copy(initialTarget);controls.enableDamping=true;controls.dampingFactor=.07;
  controls.maxPolarAngle=Math.PI*.47;controls.minPolarAngle=.2;controls.minDistance=6;controls.maxDistance=58;
  controls.enablePan=true;controls.autoRotate=false;
  const hemi=new THREE.HemisphereLight('#fff5d8','#6c5748',1.6);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe1a8',2.5);sun.position.set(-10,20,12);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-22,right:22,top:18,bottom:-18,near:.5,far:65});sun.shadow.bias=-.0005;scene.add(sun);
  const fill=new THREE.DirectionalLight('#b6d6ee',.6);fill.position.set(10,8,-9);scene.add(fill);
  const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();
  const env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.45;room.dispose();pmrem.dispose();

  const disposables=[];
  function surface(w,h,color,x,y,z,roughness=1) {
    const geometry=new THREE.PlaneGeometry(w,h),material=new THREE.MeshStandardMaterial({color,roughness});
    const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;scene.add(mesh);disposables.push(geometry,material);return mesh;
  }
  const base=surface(30,20,'#c7b99c',0,-.08,1.5);
  surface(28,9,'#e1d3b7',0,-.035,-1.5);
  surface(29,3,'#b6aa94',0,-.02,3.8);
  const canal=surface(30,2.7,'#789f9c',0,-.06,6.4,.18);
  canal.material.onBeforeCompile=shader=>{
    shader.uniforms.cityWaterTime={value:0};
    shader.vertexShader='varying vec2 cityWaterUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\ncityWaterUv = uv;');
    shader.fragmentShader='varying vec2 cityWaterUv; uniform float cityWaterTime;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float ripple = 0.5 + 0.5 * sin(cityWaterUv.x * 240.0 + cityWaterTime * 0.45 + sin(cityWaterUv.y * 70.0 + cityWaterTime * 0.3));
      float crossRipple = 0.5 + 0.5 * sin(cityWaterUv.y * 180.0 - cityWaterTime * 0.7 + cityWaterUv.x * 20.0);
      diffuseColor.rgb += vec3(0.065, 0.075, 0.07) * pow(ripple * crossRipple, 9.0);
    `);
    canal.userData.shader=shader;
  };
  canal.material.customProgramCacheKey=()=> 'product-city-water-v1';
  surface(30,3,'#dfceb0',0,-.02,9.2);
  // Small engraved street seams keep the base quiet beneath the generated buildings.
  for(let x=-14;x<15;x+=.8) surface(.012,3,'#cec1a9',x,-.012,3.8);
  for(let z=2.5;z<5.2;z+=.45) surface(29,.014,'#cec1a9',0,-.01,z);
  surface(30,.2,'#eddec3',0,.005,5.15);
  surface(30,.2,'#eddec3',0,.005,7.75);

  const loader=new GLTFLoader();const draco=new DRACOLoader();draco.setDecoderPath('./vendor/three/addons/libs/draco/gltf/');loader.setDRACOLoader(draco);
  const buildings=new Map(),pickables=[],lights=[],streetObjects=[],allModels=[];
  const modelResults=await Promise.allSettled(manifest.models.map(async item=>{
    const gltf=await loader.loadAsync(item.url || `./assets/models/${item.file}`);
    return {item,object:gltf.scene};
  }));
  if(modelResults.some(result=>result.status==='rejected')) {
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
  const journalSign=new THREE.Sprite(journalMaterial);journalSign.scale.set(1.25,.9375,1);journalSign.position.set(-3.5,1.05,2.3);scene.add(journalSign);pickables.push(journalSign);disposables.push(journalTexture,journalMaterial);
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
    allModels.push(object);
    const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const scale=(item.width||3.7)/Math.max(size.x,size.z);
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
  let running=false,frame=0,night=false,flight=null,hovered=null,disposed=false,currentYear=2026,lifeEnabled=true;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock=new THREE.Clock();

  function placeStreetAsset(item,object,definition,index) {
    allModels.push(object);
    const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=definition.height?definition.height/Math.max(size.y,.01):definition.width/Math.max(size.x,size.z,.01);
    object.position.set(-center.x,-bounds.min.y,-center.z);
    definition.positions.forEach((position,i)=>{
      const normalized=new THREE.Group();normalized.add(i===0?object:object.clone(true));normalized.scale.setScalar(scale*(definition.varied?.93+Math.sin(i*2.1)*.07:1));normalized.rotation.y=(definition.rotation||0)+(definition.varied?i*.8:0);
      const root=new THREE.Group();root.add(normalized);root.position.fromArray(position);scene.add(root);
      if(definition.ground)root.scale.y=.08;
      root.traverse(child=>{if(child.isMesh){child.castShadow=!definition.ground;child.receiveShadow=true;if(definition.product){child.userData.productId=definition.product;pickables.push(child);}}});
      const firstYear=definition.product?Number(products.find(p=>p.id===definition.product).launched.slice(0,4)):2023+(index%4);
      const entry={root,definition,position:new THREE.Vector3(...position),firstYear,phase:index*.73+i};
      root.visible=currentYear>=firstYear;streetObjects.push(entry);
      if(definition.glow){const light=new THREE.PointLight('#ffb852',night?5:0,5,2);light.position.set(position[0],position[1]+definition.height*.9,position[2]);scene.add(light);lights.push(light);entry.light=light;light.visible=root.visible;}
    });
  }
  // The first view appears as soon as the buildings load. Props stream in three at a time.
  const propQueue=[...(manifest.props||[])];let loadedProps=0,failedProps=0;
  async function propWorker(){while(propQueue.length&&!disposed){const item=propQueue.shift();try{const definition=CITY_PROPS.find(p=>p.id===item.id);if(!definition)continue;const gltf=await loader.loadAsync(item.url || `./assets/models/${item.file}`);if(disposed){gltf.scene.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{Object.values(m).forEach(v=>{if(v?.isTexture)v.dispose();});m.dispose();});});return;}placeStreetAsset(item,gltf.scene,definition,CITY_PROPS.indexOf(definition));loadedProps++;}catch(error){failedProps++;console.warn('Street asset unavailable:',item.id,error);}onProgress({loaded:loadedProps,total:manifest.props.length,failed:failedProps});}}
  const streetReady=Promise.all([propWorker(),propWorker(),propWorker()]).finally(()=>draco.dispose());
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const down={x:0,y:0};
  function pick(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(pickables,false).find(hit=>{const id=hit.object.userData.productId;return buildings.get(id)?.root.visible;})?.object.userData.productId;}
  const pointerDown=e=>{down.x=e.clientX;down.y=e.clientY;flight=null;};
  const pointerUp=e=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)return;const id=pick(e);if(id)onSelect(id);};
  const pointerMove=e=>{const id=pick(e);renderer.domElement.style.cursor=id?'pointer':'grab';if(id!==hovered){buildings.forEach((b,key)=>b.tag.material.color.set(key===id?'#ffe0a0':'#ffffff'));hovered=id;}};
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointermove',pointerMove);

  function resize(){const w=container.clientWidth||container.parentElement.clientWidth,h=container.clientHeight||container.parentElement.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
  function tick(){if(!running||disposed)return;frame=requestAnimationFrame(tick);
    const elapsed=clock.getElapsedTime();
    if(lifeEnabled&&!reducedMotion&&canal.userData.shader)canal.userData.shader.uniforms.cityWaterTime.value=elapsed;
    buildings.forEach(b=>{b.growth.scale.y=THREE.MathUtils.lerp(b.growth.scale.y,b.target,reducedMotion?1:.065);b.root.visible=b.target>0||b.growth.scale.y>.015;b.tag.visible=b.target>0;b.tag.material.opacity=THREE.MathUtils.clamp(b.growth.scale.y,0,1);const distance=camera.position.distanceTo(b.root.position);const width=Math.min(2.8,2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*135/(container.clientHeight||800));b.tag.scale.set(width,width*112/512,1);});
    if(lifeEnabled&&!reducedMotion)streetObjects.forEach(entry=>{if(!entry.root.visible)return;const {root,definition,position,phase}=entry;if(definition.motion==='water'){root.position.y=position.y+Math.sin(elapsed*.8+phase)*.025;root.rotation.z=Math.sin(elapsed*.65+phase)*.012;}else if(definition.motion==='ride'){root.position.x=position.x+Math.sin(elapsed*.12+phase)*.7;}else if(definition.motion==='walk'){root.position.z=position.z+Math.sin(elapsed*.15+phase)*.15;root.position.y=position.y+Math.sin(elapsed*1.8+phase)*.009;}});
    if(flight){camera.position.lerp(flight.position,reducedMotion?1:.065);controls.target.lerp(flight.target,reducedMotion?1:.065);if(camera.position.distanceTo(flight.position)<.03)flight=null;}
    controls.update();renderer.render(scene,camera);
  }
  function setYear(year){currentYear=year;buildings.forEach(b=>{const status=statusAt(b.product,year);b.target=status==='future'?0:1;if(b.baseColor)b.root.traverse(o=>{if(o.isMesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m.userData.cityBaseColor)m.color.copy(m.userData.cityBaseColor).multiplyScalar(status==='archived'?.65:1);});});});streetObjects.forEach(o=>{o.root.visible=year>=o.firstYear;if(o.light)o.light.visible=o.root.visible;});updateJournal(year);}
  function setNight(value){night=value;scene.background.copy(night?nightColor:dayColor);scene.fog.color.copy(scene.background);hemi.intensity=night?.5:1.6;sun.intensity=night?.35:2.5;fill.intensity=night?.7:.6;scene.environmentIntensity=night?.28:.45;sun.color.set(night?'#a1b8ed':'#ffe1a8');renderer.toneMappingExposure=night?.9:1.05;lights.forEach(light=>light.intensity=night?8:0);canal.material.color.set(night?'#273d55':'#789f9c');}
  function focus(id){const b=buildings.get(id);if(!b)return;const h=Math.max(4,b.height);flight={target:b.root.position.clone().add(new THREE.Vector3(0,h*.5,0)),position:b.root.position.clone().add(new THREE.Vector3(-h*1.15,h*.95,h*1.85))};}
  function reset(){flight={position:initialPosition.clone(),target:initialTarget.clone()};}
  function zoom(factor){const delta=camera.position.clone().sub(controls.target).multiplyScalar(factor);const length=THREE.MathUtils.clamp(delta.length(),controls.minDistance,controls.maxDistance);flight={position:controls.target.clone().add(delta.setLength(length)),target:controls.target.clone()};}
  function resume(){if(running||disposed)return;running=true;resize();tick();}
  function pause(){running=false;cancelAnimationFrame(frame);}
  function dispose(){pause();disposed=true;resizeObserver.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointermove',pointerMove);const resources=new Set(disposables);scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{resources.add(m);Object.values(m).forEach(v=>{if(v?.isTexture)resources.add(v);});});});resources.forEach(r=>r.dispose());env.dispose();renderer.dispose();renderer.domElement.remove();}
  function setLife(value){lifeEnabled=value;}
  function setOrbit(value){controls.autoRotate=value;controls.autoRotateSpeed=.28;}
  return {setYear,setNight,focus,reset,zoom,resume,pause,dispose,setLife,setOrbit,streetReady};
}
