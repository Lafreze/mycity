import * as THREE from 'three';
import {WALKING,DISCOVERIES,moveWalker,safePosition,nearestInteraction} from './walking-world.js?v=neighbors-3';

export function createWalker({scene,camera,canvas,gltf,world,motion={},getResidents=()=>[],onDiscovery,onMode,onNearby}){
  const allColliders=world.colliders,loadedAssets=new Set();
  world={...world,colliders:allColliders.filter(b=>!b.requiresAsset)};
  const root=new THREE.Group(),model=gltf.scene;
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=1.55/size.y;
  model.position.set(-center.x*scale,(-bounds.min.y+(motion.groundOffset||0))*scale,-center.z*scale);model.scale.setScalar(scale);
  root.add(model);scene.add(root);
  root.traverse(o=>{o.layers.set(1);if(o.isMesh){o.castShadow=false;o.receiveShadow=true;if(o.isSkinnedMesh)o.frustumCulled=false;}});
  const animationSpeed={walk:(motion.walkSpeed||WALKING.walkSpeed/scale)*scale,run:(motion.runSpeed||WALKING.runSpeed/scale)*scale};
  const mixer=new THREE.AnimationMixer(model),actions=new Map();
  for(const clip of gltf.animations)actions.set(clip.name.toLowerCase(),mixer.clipAction(clip));
  let actionName='',action;
  function animate(name,speed=1){
    const next=actions.get(name);if(!next)return;
    if(actionName!==name){next.reset().setEffectiveWeight(1).fadeIn(.18).play();action?.fadeOut(.18);action=next;actionName=name;}
    next.timeScale=speed;
  }
  animate('idle');
  // A small, soft contact shadow moves with the character without redrawing city shadows.
  const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:.2}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float opacity;void main(){float a=1.-smoothstep(.12,.5,length(vUv-.5));gl_FragColor=vec4(.16,.13,.09,a*opacity);}'});
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.75,.55),shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.layers.set(1);scene.add(shadow);
  let active=false,year=2026,bridgeReady=false,position={...WALKING.spawn,y:0},yaw=-Math.PI/2,pitch=.28,distance=4.5,heading=Math.PI/2,nearby=null,muted=false;
  let heldRun=false,drag=null,joystickId=null,joy={x:0,y:0},visitSignature='',conversation=null;
  const debug=new URLSearchParams(location.search).has('perf');
  const keys=new Set(),listeners=[],cameraPosition=new THREE.Vector3(),cameraTarget=new THREE.Vector3(),offset=new THREE.Vector3(),previousCamera=new THREE.Vector3(),ray=new THREE.Ray(),hit=new THREE.Vector3();
  const cameraBoxes=allColliders.filter(b=>b.camera).map(b=>{const c=b.cameraBounds||b;return {...b,box:new THREE.Box3(new THREE.Vector3(c.minX-.12,c.minY||0,c.minZ-.12),new THREE.Vector3(c.maxX+.12,c.maxY+.12,c.maxZ+.12))};});
  const listen=(target,name,fn,options)=>{target.addEventListener(name,fn,options);listeners.push(()=>target.removeEventListener(name,fn,options));};
  const stick=document.querySelector('#walk-stick'),thumb=document.querySelector('#walk-thumb');
  const blocked=()=>muted||!!document.querySelector('dialog[open]');
  const clear=()=>{keys.clear();joy={x:0,y:0};heldRun=false;drag=null;joystickId=null;if(thumb)thumb.style.transform='translate(0,0)';};
  const movementCodes=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
  listen(window,'keydown',e=>{
    if(!active||blocked()||e.target.closest?.('input,textarea,[contenteditable="true"]'))return;
    if(movementCodes.has(e.code)){e.preventDefault();keys.add(e.code);}
    if(e.code==='KeyE'&&!e.repeat){e.preventDefault();interact();}
  });
  listen(window,'keyup',e=>keys.delete(e.code));listen(window,'blur',clear);
  listen(canvas,'pointerdown',e=>{if(!active||blocked()||e.button>0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  listen(canvas,'pointermove',e=>{if(!active||!drag||drag.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.006;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-drag.y)*.004,.15,1.1);drag.x=e.clientX;drag.y=e.clientY;});
  const endDrag=e=>{if(drag?.id===e.pointerId)drag=null;};
  listen(canvas,'pointerup',endDrag);listen(canvas,'pointercancel',endDrag);
  listen(canvas,'wheel',e=>{if(active){e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.003,2.2,7);}},{passive:false});
  if(stick){
    const updateStick=e=>{const r=stick.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/40,y=(e.clientY-r.top-r.height/2)/40;const n=Math.max(1,Math.hypot(x,y));joy={x:x/n,y:y/n};thumb.style.transform=`translate(${joy.x*31}px,${joy.y*31}px)`;};
    listen(stick,'pointerdown',e=>{if(!active)return;e.preventDefault();joystickId=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);});
    listen(stick,'pointermove',e=>{if(e.pointerId===joystickId)updateStick(e);});
    const release=e=>{if(e.pointerId===joystickId){joystickId=null;joy={x:0,y:0};thumb.style.transform='translate(0,0)';}};
    listen(stick,'pointerup',release);listen(stick,'pointercancel',release);
  }
  function interact(){if(active&&!blocked()&&nearby){clear();onDiscovery(nearby);}}
  function setActive(value){
    active=value;clear();visitSignature='';animate('idle');root.visible=true;shadow.visible=true;onMode(active);
    if(active){position=safePosition(position,world,year,bridgeReady);root.position.set(position.x,position.y,position.z);root.rotation.y=heading;updateCamera(1,true);}
    else onNearby(null);
  }
  function updateCamera(dt,snap=false){
    cameraTarget.set(position.x,position.y+.95,position.z);
    offset.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    let boom=distance;
    if(conversation){
      cameraTarget.lerp(new THREE.Vector3(conversation.x,conversation.y+.95,conversation.z),.55);
      offset.set(position.x-conversation.x,0,position.z-conversation.z).normalize();
      offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP,-.55);offset.y=.28;offset.normalize();boom=3.7;
    }
    ray.set(cameraTarget,offset);
    for(const b of cameraBoxes){if(b.firstYear>year||(b.requiresAsset&&!loadedAssets.has(b.requiresAsset)))continue;if(ray.intersectBox(b.box,hit))boom=Math.min(boom,Math.max(.3,cameraTarget.distanceTo(hit)-.18));}
    cameraPosition.copy(cameraTarget).addScaledVector(offset,boom);
    previousCamera.copy(camera.position);camera.position.lerp(cameraPosition,snap?1:1-Math.exp(-12*dt));
    // Clamp the smoothed camera too: it must not briefly slide through a wall or tree.
    offset.copy(camera.position).sub(cameraTarget);let safeDistance=offset.length();offset.normalize();ray.set(cameraTarget,offset);
    for(const b of cameraBoxes){if(b.firstYear>year||(b.requiresAsset&&!loadedAssets.has(b.requiresAsset)))continue;if(ray.intersectBox(b.box,hit))safeDistance=Math.min(safeDistance,Math.max(.3,cameraTarget.distanceTo(hit)-.18));}
    camera.position.copy(cameraTarget).addScaledVector(offset,safeDistance);camera.lookAt(cameraTarget);
    return previousCamera.distanceToSquared(camera.position)>1e-9;
  }
  function update(dt){
    if(!active){mixer.update(dt);return false;}
    let forward=0,right=0,run=false;
    if(!blocked()){
      forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joy.y;
      right=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joy.x;
      run=heldRun||keys.has('ShiftLeft')||keys.has('ShiftRight');
    }
    const magnitude=Math.max(1,Math.hypot(forward,right)),speed=run?WALKING.runSpeed:WALKING.walkSpeed;
    const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*right)/magnitude*speed*dt,dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*right)/magnitude*speed*dt;
    const next=moveWalker(position,dx,dz,world,year,bridgeReady),moved=Math.hypot(next.x-position.x,next.z-position.z);
    if(moved>.0001){
      const desired=Math.atan2(next.x-position.x,next.z-position.z);
      heading+=Math.atan2(Math.sin(desired-heading),Math.cos(desired-heading))*(1-Math.exp(-15*dt));
      animate(run?'run':'walk',THREE.MathUtils.clamp(moved/Math.max(.001,dt)/(run?animationSpeed.run:animationSpeed.walk),.15,2.5));
    }else animate('idle');
    position=next;root.position.set(position.x,position.y,position.z);root.rotation.y=heading;
    shadow.position.set(position.x,position.y+.006,position.z);mixer.update(dt);
    nearby=nearestInteraction(position,year,DISCOVERIES,getResidents(root.position,year));
    if((nearby?.id||'')!==visitSignature){visitSignature=nearby?.id||'';onNearby(nearby);}
    const movedCamera=updateCamera(dt);
    // DOM diagnostics also make collision/animation behaviour reviewable without a debug API.
    if(debug){
      document.body.dataset.playerPosition=[position.x,position.y,position.z].map(v=>v.toFixed(3)).join(',');
      document.body.dataset.playerAnimation=actionName;
      document.body.dataset.playerPhase=String(Math.floor((action?.time||0)*10)%10);
    }
    return movedCamera||moved>.0001||!!drag;
  }
  root.visible=false;shadow.visible=false;
  return {update,setActive,interact,get active(){return active;},get root(){return root;},setConversation(target){conversation=target?.clone()||null;},setYear(value){year=value;position=safePosition(position,world,year,bridgeReady);},setBridgeReady(value){bridgeReady=value;},setAssetReady(id){loadedAssets.add(id);world.colliders=allColliders.filter(b=>!b.requiresAsset||loadedAssets.has(b.requiresAsset));position=safePosition(position,world,year,bridgeReady);},setMuted(value){muted=value;if(value)clear();},setRun(value){heldRun=value;},zoom(factor){distance=THREE.MathUtils.clamp(distance*factor,2.2,7);},pause:clear,dispose(){clear();listeners.forEach(fn=>fn());mixer.stopAllAction();mixer.uncacheRoot(model);scene.remove(root,shadow);}};
}
