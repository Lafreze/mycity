// Read-only response instrumentation for screenshot comparisons, including
// 043d341/main. The source on disk/server is untouched. Both revisions receive
// identical controls; rendering, asset selection, materials and caching stay real.
// Exact anchors fail loudly rather than silently photographing the wrong place.
function replace(source,anchor,replacement){
  if(!source.includes(anchor))throw new Error(`Screenshot hook anchor missing: ${anchor.slice(0,90)}`);
  if(source.indexOf(anchor)!==source.lastIndexOf(anchor))throw new Error(`Screenshot hook anchor ambiguous: ${anchor.slice(0,90)}`);
  return source.replace(anchor,replacement);
}
export function instrumentWalker(source){
  return replace(source,'return {update,setActive,interact,',`return {
    sceneShotPose(p){
      clear();conversation=null;
      position=safePosition({x:p[0],y:0,z:p[2]},world,year,bridgeReady);
      heading=p[3]??Math.PI/2;root.position.set(position.x,position.y,position.z);root.rotation.y=heading;
      update(0);updateCamera(1,true);
      return [position.x,position.y,position.z];
    },
    sceneShotTime(seconds){mixer.stopAllAction();actionName='';action=null;animate('idle');action?.stopFading().setEffectiveWeight(1);mixer.setTime(seconds);},
    update,setActive,interact,`);
}
export function instrumentNeighbors(source){
  return replace(source,'return {add,update,setTalking,',`return {
    sceneShotTime(seconds){for(const e of entries.values()){
      e.mixer.stopAllAction();const idle=e.actions.get('idle');if(!idle)continue;
      idle.reset().play();idle.time=(seconds*e.mixer.timeScale+(e.phase||0))%idle.getClip().duration;
      e.mixer.update(0);e.elapsed=0;
    }},add,update,setTalking,`);
}
export function instrumentCity(source){
  // camera is block-scoped INSIDE createCity3D's try block. Inserting at
  // debugEnabled (outside that block) parses, but cannot close over camera.
  source=replace(source,'const camera=new THREE.PerspectiveCamera(38,1,.1,360);',`const camera=new THREE.PerspectiveCamera(38,1,.1,360);
  let sceneShotCamera=null,sceneShotTime=null;
  function applySceneShotCamera(){if(sceneShotCamera){
    camera.position.fromArray(sceneShotCamera.position);camera.lookAt(...sceneShotCamera.target);camera.updateMatrixWorld();
  }}`);
  source=replace(source,'if(lifeEnabled&&!reducedMotion)lifeTime+=delta;','if(sceneShotTime===null&&lifeEnabled&&!reducedMotion)lifeTime+=delta;');
  source=replace(source,'const elapsed=lifeTime;','const elapsed=sceneShotTime??lifeTime;');
  source=replace(source,'walker?.update(delta)','walker?.update(sceneShotTime===null?delta:0)');
  const update=source.match(/neighbors\.update\((.*?),camera,/);
  if(!update)throw new Error('Missing neighbor update hook');
  source=replace(source,update[0],`applySceneShotCamera();neighbors.update(sceneShotTime===null?(${update[1]}):0,camera,`);
  source=replace(source,'const cameraChanged=walker?.active?walkingChanged:controls.update(delta);','const cameraChanged=sceneShotCamera?false:(walker?.active?walkingChanged:controls.update(delta));');
  source=replace(source,'window.__mycityDebug=debug;',`window.__mycityDebug=debug;
    debug.sceneShot={
      set(options={}){
        if('camera' in options){sceneShotCamera=options.camera;flight=null;controls.autoRotate=false;staticFrame.invalidate();}
        if(options.player){walker?.setActive(true);walker?.sceneShotPose(options.player);}
        // setActive's onMode resets FOV; apply the shot FOV after that callback.
        if(sceneShotCamera||'camera' in options){camera.fov=sceneShotCamera?.fov||52;camera.updateProjectionMatrix();}
        applySceneShotCamera();
        if('time' in options){sceneShotTime=options.time;
          if(sceneShotTime!==null){walker?.sceneShotTime(sceneShotTime);neighbors.sceneShotTime(sceneShotTime);}}
        return this.state();
      },
      state(){return {camera:{position:camera.position.toArray(),fov:camera.fov},player:walker?.root.position.toArray(),time:sceneShotTime};}
    };`);
  return source;
}
