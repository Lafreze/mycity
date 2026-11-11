import * as THREE from 'three';
import { resizeTextures, mapSettledLimit, disposeResources } from './asset-memory.js';
import { LANDSCAPE, PAINTING_GLSL, RIVER_SKIRT_GLSL, WATER_JOIN_GLSL } from './landscape-projection.js';

// A painted distant landscape surrounds the playable 3D street. The river and
// both banks continue out to it; the painting never replaces walkable geometry.
export function createLandscape(scene,canal,quality={low:false,landscapeTextureSize:Infinity}){
  const resources=[],night={value:0};let disposed=false;
  const uniforms={painting0:{value:null},painting1:{value:null},painting2:{value:null},painting3:{value:null},night,hasPainting:{value:0},
    cityHaze:{value:new THREE.Color(LANDSCAPE.haze)},cityWaterNear:{value:new THREE.Color(LANDSCAPE.waterNear)},
    cityWaterMiddle:{value:new THREE.Color(LANDSCAPE.waterMiddle)},cityWaterDistance:{value:new THREE.Color(LANDSCAPE.waterDistance)}};
  const vertexShader='varying vec3 landscapeWorld;void main(){landscapeWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(landscapeWorld,1.);}';
  const terrainMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{...uniforms,stone:{value:new THREE.Color('#e2d4b7')}},vertexShader,
    fragmentShader:`varying vec3 landscapeWorld;uniform vec3 stone;
    ${PAINTING_GLSL}
    ${RIVER_SKIRT_GLSL}
    ${WATER_JOIN_GLSL}
    void main(){
      vec2 p=landscapeWorld.xz;
      float edge=max(max(abs(p.x)-17.,-13.-p.y),p.y-14.5);
      // Existing mip levels give near soil broad painting colours without
      // translucent-looking silhouettes of distant trees. Far samples become
      // sharp and exactly match the sky; no second lookup or blur texture.
      float blur=${LANDSCAPE.foregroundBlur}*(1.-smoothstep(-2.,6.,edge));
      vec3 painted=cityPaintedBackground(landscapeWorld,blur);
      vec3 paving=mix(stone,stone*vec3(.10,.14,.27),night);
      // Reveal the painting's real foreground details, not a featureless grass
      // colour. At the outer skirt this is exactly the sky's same-ray sample.
      float grain=sin(p.x*.43+sin(p.y*.31))*sin(p.y*.57+p.x*.12);
      float blend=smoothstep(${LANDSCAPE.paintStart.toFixed(1)},${LANDSCAPE.paintEnd.toFixed(1)},edge+grain*.7);
      vec3 color=mix(paving,painted,blend);
      // Project the hole/bank onto the ACTUAL water plane. Cutting it directly
      // in the higher/sloping ground left a dark crescent along the near bank.
      vec2 waterP=(cameraPosition+(landscapeWorld-cameraPosition)*(${(canal.y??-.23).toFixed(4)}-cameraPosition.y)/(landscapeWorld.y-cameraPosition.y)).xz;
      float nearAlpha=cityNearWaterAlpha(waterP.x);
      float river=mix(cityBankMask(waterP),cityRiverMask(waterP),step(${LANDSCAPE.nearWaterEnd.toFixed(1)},abs(waterP.x)));
      // Composite once across the overlap: A + (1-A)*D*R == R, where
      // D is dynamic end alpha and R the desired bank coverage. Avoid both a
      // subpixel gap at X=20 and a brighter double-painted bank in the overlap.
      float cachedRiver=cityCachedRiverMask(river,nearAlpha);
      vec3 water=mix(cityRiverColor(waterP.x),painted,smoothstep(22.,30.,abs(waterP.x)));
      color=mix(color,water,cachedRiver);
      // Only the swept hull corridor needs an opening. Keep opaque soil under
      // the feathered banks, hiding the background's ghost trees. The hole's
      // hard edges lie strictly inside fully opaque water, beyond the hull.
      float hole=cityGroundHole(waterP);
      gl_FragColor=vec4(color,1.-hole);
      #include <colorspace_fragment>
    }`});
  // A small skirt slopes to water level outside town. Exact breakpoints keep
  // all walkable banks unchanged; no animated vertices or new texture buffers.
  const xs=[-210,-40,-30,-20,-17,17,20,30,40,210],vertices=[],indices=[];
  for(const x of xs){
    const t=THREE.MathUtils.smoothstep(Math.abs(x),17,20),y=THREE.MathUtils.lerp(-.08,canal.y??-.23,t);
    vertices.push(x,y,-210,x,y,210);
  }
  for(let i=0;i<xs.length-1;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  const groundGeometry=new THREE.BufferGeometry();groundGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));groundGeometry.setIndex(indices);
  const ground=new THREE.Mesh(groundGeometry,terrainMaterial);ground.renderOrder=-900;scene.add(ground);resources.push(groundGeometry,terrainMaterial);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,toneMapped:false,uniforms,vertexShader,
    fragmentShader:`varying vec3 landscapeWorld;
      ${PAINTING_GLSL}
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec3 d=cityDomeDirection(landscapeWorld);float angle=asin(clamp(d.y,-1.,1.));
        vec3 color=cityPaintedBackground(landscapeWorld,0.);
        vec2 starUV=vec2(atan(d.x,d.z)*82.76,angle*180.),cell=floor(starUV);
        float star=step(.996,hash(cell))*(1.-smoothstep(.015,.17,length(fract(starUV)-.5)))*smoothstep(.04,.2,angle);
        color+=vec3(.8,.85,1.)*star*night;
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
  });
  const geometry=new THREE.SphereGeometry(LANDSCAPE.radius,64,32),sky=new THREE.Mesh(geometry,skyMaterial);
  sky.position.z=LANDSCAPE.centerZ;sky.renderOrder=-1000;sky.frustumCulled=false;scene.add(sky);resources.push(geometry,skyMaterial);
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
    get waterUniforms(){return {cityWaterNear:uniforms.cityWaterNear,night};},
    get resources(){return resources;}
  };
}
