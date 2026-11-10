import * as THREE from 'three';
import {RESIDENTS} from './residents.js?v=neighbors-2';

export function createNeighbors(scene){
  const entries=new Map(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  let selected=null,hovered=null;
  const debug=new URLSearchParams(location.search).has('perf');let diagnosticTime=0;
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const c=canvas.getContext('2d');c.fillStyle='#fff8e8';c.strokeStyle='#a18050';c.lineWidth=4;
  c.beginPath();c.roundRect(12,18,104,76,28);c.fill();c.stroke();
  c.beginPath();c.moveTo(35,91);c.lineTo(35,112);c.lineTo(58,93);c.fill();
  c.fillStyle='#967548';for(const x of [39,64,89]){c.beginPath();c.arc(x,56,5,0,Math.PI*2);c.fill();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:.16}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float opacity;void main(){float a=1.-smoothstep(.12,.5,length(vUv-.5));gl_FragColor=vec4(.16,.13,.09,a*opacity);}'});
  const shadowGeometry=new THREE.PlaneGeometry(.65,.5);
  function add({id,root,model,animations,height,firstYear,phase=0}){
    const person=RESIDENTS.find(p=>p.id===id);if(!person)return;
    const mixer=new THREE.AnimationMixer(model),actions=new Map(animations.map(clip=>[clip.name.toLowerCase(),mixer.clipAction(clip)]));
    const idle=actions.get('idle');idle?.play();if(idle)idle.time=phase%idle.getClip().duration;
    const icon=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false,transparent:true}));
    icon.position.set(root.position.x,root.position.y+height+.22,root.position.z);icon.scale.setScalar(.28);icon.layers.set(1);scene.add(icon);
    const shadow=new THREE.Mesh(shadowGeometry,shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.copy(root.position);shadow.position.y+=.008;shadow.layers.set(1);scene.add(shadow);
    root.updateWorldMatrix(true,true);
    // Animated skin bounds can be stale before the first skeleton update. Use
    // a conservative world-space resident volume for both culling and animation.
    const sphere=new THREE.Sphere(root.position.clone().add(new THREE.Vector3(0,height*.5,0)),height*.95);
    entries.set(id,{person,root,model,mixer,actions,current:'idle',icon,shadow,sphere,firstYear,elapsed:0,head:model.getObjectByName('Head')});
  }
  function setTalking(id){
    selected=id;
    for(const [key,e] of entries){
      const name=key===id?'talk':'idle';if(name===e.current)continue;
      const next=e.actions.get(name);if(!next)continue;
      next.reset().fadeIn(.25).play();e.actions.get(e.current)?.fadeOut(.25);e.current=name;
    }
  }
  function update(dt,camera,player,walking,year){
    camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
    for(const [id,e] of entries){
      const visible=year>=e.firstYear;e.shadow.visible=visible;
      e.model.visible=visible&&frustum.intersectsSphere(e.sphere);
      const distance=player?player.distanceTo(e.root.position):Infinity;
      e.icon.visible=visible&&((walking&&distance<3.1&&!selected)||(!walking&&hovered===id));
      e.elapsed+=dt;
      // Off-screen residents cost no animation work. Distant gestures update at 20 Hz.
      if(!e.model.visible)continue;
      const interval=camera.position.distanceTo(e.root.position)>16?1/20:0;
      if(e.elapsed<interval)continue;e.mixer.update(Math.min(e.elapsed,.15));e.elapsed=0;
    }
    if(debug&&(diagnosticTime+=dt)>.2){
      diagnosticTime=0;
      document.body.dataset.neighbors=JSON.stringify([...entries].map(([id,e])=>({id,clip:e.current,time:+(e.actions.get(e.current)?.time||0).toFixed(2),head:e.head?.quaternion.toArray().map(v=>+v.toFixed(4)),visible:e.root.visible,ready:e.actions.has('idle')&&e.actions.has('talk')})));
      document.body.dataset.talking=selected||'';
    }
  }
  return {add,update,setTalking,setHovered(id){hovered=id;},
    getTarget(id){const e=entries.get(id);return e?.root.visible?e:null;},
    nearby(player,year){return [...entries].filter(([,e])=>e.root.visible&&year>=e.firstYear).map(([id,e])=>({id:`resident:${id}`,resident:id,label:`和${e.person.name}聊聊`,x:e.root.position.x,z:e.root.position.z,year:e.firstYear,radius:1.9,priority:.35}));},
    dispose(){for(const e of entries.values()){e.mixer.stopAllAction();e.mixer.uncacheRoot(e.model);scene.remove(e.icon,e.shadow);}entries.clear();},
    get resources(){return [texture,shadowGeometry,shadowMaterial];}
  };
}
