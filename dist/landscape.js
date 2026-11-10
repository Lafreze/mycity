import * as THREE from 'three';
import { resizeTextures, mapSettledLimit, disposeResources } from './asset-memory.js';
import { HORIZON, HORIZON_GLSL } from './world.js?v=neighbors-3';

// A painted distant landscape surrounds the playable 3D street. The river and
// both banks continue out to it; the painting never replaces walkable geometry.
export function createLandscape(scene,canal,quality={low:false,landscapeTextureSize:Infinity}){
  const resources=[],night={value:0};let disposed=false;
  const terrainMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{night,stone:{value:new THREE.Color('#e2d4b7')},grass:{value:new THREE.Color('#adb68a')}},
    vertexShader:'varying vec3 landscapeWorld;void main(){landscapeWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(landscapeWorld,1.);}',
    fragmentShader:`varying vec3 landscapeWorld;uniform float night;uniform vec3 stone;uniform vec3 grass;
    ${HORIZON_GLSL}
    void main(){
      vec2 p=landscapeWorld.xz;
      float edge=max(max(abs(p.x)-17.0,-13.0-p.y),p.y-14.5);
      float grain=fract(sin(dot(floor(p*12.),vec2(12.9898,78.233)))*43758.5453);
      vec3 color=mix(stone,grass*(.97+.06*grain),smoothstep(0.,9.,edge));
      color=mix(color,color*vec3(.10,.14,.27),night);
      float fade=cityHorizonAlpha(landscapeWorld);
      gl_FragColor=vec4(color,fade);
      #include <colorspace_fragment>
    }`});
  resources.push(terrainMaterial);
  for(const [minZ,maxZ] of [[-210,canal.minZ],[canal.maxZ,210]]){
    const geometry=new THREE.PlaneGeometry(420,maxZ-minZ),ground=new THREE.Mesh(geometry,terrainMaterial);
    ground.rotation.x=-Math.PI/2;ground.position.set(0,-.08,(minZ+maxZ)/2);ground.renderOrder=-900;scene.add(ground);resources.push(geometry);
  }
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,toneMapped:false,
    uniforms:{painting0:{value:null},painting1:{value:null},painting2:{value:null},painting3:{value:null},night,hasPainting:{value:0}},
    vertexShader:'varying vec3 domePosition;void main(){domePosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 domePosition;uniform sampler2D painting0;uniform sampler2D painting1;uniform sampler2D painting2;uniform sampler2D painting3;uniform float night;uniform float hasPainting;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      vec3 panel(float i,vec2 uv){
        if(i<.5)return texture2D(painting0,uv).rgb;
        if(i<1.5)return texture2D(painting1,uv).rgb;
        if(i<2.5)return texture2D(painting2,uv).rgb;
        return texture2D(painting3,uv).rgb;
      }
      void main(){
        vec3 d=normalize(domePosition);float angle=asin(d.y);
        // +X is downstream. At that heading the valley's painted river is at
        // u=.54, v=.38, instead of the former village hillside (u=.43).
        vec2 uv=vec2(fract(atan(d.x,d.z)/6.2831853+${HORIZON.paintingYaw}),clamp(.38+angle*1.3,.002,.998));
        float sector=floor(uv.x*4.),x=fract(uv.x*4.);
        // Overlap neighboring edges. Four detailed views cover the full horizon.
        vec3 color=panel(sector,vec2(.18+x*.82,uv.y));
        color=mix(color,panel(mod(sector+1.,4.),vec2(max(0.,x-.82),uv.y)),smoothstep(.82,1.,x));
        // The opposite mouth also dissolves into a river, using the same valley
        // texture in a feathered sector. No extra image/GPU texture is allocated.
        float upstream=step(d.x,0.)*(1.-smoothstep(.08,.40,abs(d.z)));
        color=mix(color,panel(2.,vec2(clamp(.54-d.z*1.25,.002,.998),uv.y)),upstream);
        color=mix(vec3(.65,.73,.74),color,hasPainting);
        color=mix(color,vec3(.43,.58,.64),smoothstep(.44,.75,angle));
        color=mix(color,color*vec3(.10,.14,.27),night);
        vec2 starUV=vec2(uv.x*520.,angle*180.),cell=floor(starUV);
        float star=step(.996,hash(cell))*(1.-smoothstep(.015,.17,length(fract(starUV)-.5)))*smoothstep(.04,.2,angle);
        color+=vec3(.8,.85,1.)*star*night;
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
  });
  const geometry=new THREE.SphereGeometry(240,64,32),sky=new THREE.Mesh(geometry,skyMaterial);
  sky.renderOrder=-1000;sky.frustumCulled=false;scene.add(sky);resources.push(geometry,skyMaterial);
  return {
    async load(assets){
      if(!assets?.length)return;
      const results=await mapSettledLimit(assets.slice(0,4),quality.low?1:4,async(asset,i)=>{
        if(disposed)throw new Error('Landscape disposed');
        const texture=await new THREE.TextureLoader().loadAsync(asset.url);
        if(disposed){disposeResources([texture]);throw new Error('Landscape disposed');}
        texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=quality.low?2:4;
        resizeTextures([texture],quality.landscapeTextureSize);
        skyMaterial.uniforms['painting'+i].value=texture;resources.push(texture);
        return texture;
      });
      const fallback=results.find(r=>r.status==='fulfilled')?.value;
      if(!fallback){console.warn('Distant landscape unavailable');return;}
      for(let i=0;i<4;i++)if(!skyMaterial.uniforms['painting'+i].value)skyMaterial.uniforms['painting'+i].value=fallback;
      skyMaterial.uniforms.hasPainting.value=1;
    },
    dispose(release=true){if(disposed)return;disposed=true;if(release)disposeResources(resources);resources.length=0;},
    setNight(value){skyMaterial.uniforms.night.value=value?1:0;},
    get resources(){return resources;}
  };
}
