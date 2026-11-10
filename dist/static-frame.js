import * as THREE from 'three';

// Cache the full-resolution static street AND its depth. Animated water/boat still
// use real geometry and depth testing. Any camera/scene change renders the street again.
// High mode retains the original HDR/MSAA path. Low uses tone-mapped RGBA8.
export function createStaticFrame(renderer,scene,camera,{enabled=true,low=false}={}){
  camera.layers.enable(1);
  const supported=enabled&&(low||renderer.extensions.has('EXT_color_buffer_float'));
  if(!supported)return {settings:{enabled:false,samples:0,format:'none',bytes:0},invalidate(){},resize(){},dispose(){},render(){renderer.render(scene,camera);}};
  const size=new THREE.Vector2();
  const target=new THREE.WebGLRenderTarget(1,1,{
    type:low?THREE.UnsignedByteType:THREE.HalfFloatType,format:THREE.RGBAFormat,
    minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
    depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType),
    samples:low?0:Math.min(4,renderer.capabilities.maxSamples)
  });
  // Ordinary render targets bypass Three's tone mapping. Tone-map low-mode
  // materials BEFORE storing in RGBA8; simply changing the target type clips HDR.
  // Direct-to-screen materials keep Three's normal TONE_MAPPING branch. The copy
  // only encodes the stored linear LDR color to the screen color space.
  const exposure={value:renderer.toneMappingExposure},patched=new WeakSet(),restore=[];
  function prepareLDR(){
    scene.traverse(o=>{
      if(!o.layers.isEnabled(0))return;
      for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){
        if(!m.toneMapped||patched.has(m))continue;
        patched.add(m);
        const before=m.onBeforeCompile,key=m.customProgramCacheKey,cacheKey=key.call(m);
        m.onBeforeCompile=function(shader,...args){
          before.call(this,shader,...args);
          shader.uniforms.cityCacheExposure=exposure;
          shader.fragmentShader=`#ifndef TONE_MAPPING
#define toneMappingExposure cityCacheExposure
#include <tonemapping_pars_fragment>
#undef toneMappingExposure
#endif
`+shader.fragmentShader.replace('#include <tonemapping_fragment>',`#ifdef TONE_MAPPING
#include <tonemapping_fragment>
#else
  gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
#endif`);
        };
        m.customProgramCacheKey=()=>cacheKey+'|city-ldr-v1';m.needsUpdate=true;
        restore.push(()=>{m.onBeforeCompile=before;m.customProgramCacheKey=key;m.needsUpdate=true;});
      }
    });
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
  const material=new THREE.ShaderMaterial({
    uniforms:{staticColor:{value:target.texture},staticDepth:{value:target.depthTexture}},
    vertexShader:'varying vec2 screenUv; void main(){screenUv=uv;gl_Position=vec4(position,1.0);}',
    fragmentShader:`varying vec2 screenUv;
      uniform sampler2D staticColor; uniform sampler2D staticDepth;
      void main(){
        gl_FragColor=texture2D(staticColor,screenUv);
        gl_FragDepth=texture2D(staticDepth,screenUv).x;
        ${low?'':`// Three.js clears a solid background without tone mapping it.
        if(gl_FragDepth<1.0){
          #include <tonemapping_fragment>
        }`}
        #include <colorspace_fragment>
      }`,
    toneMapped:!low,depthTest:true,depthWrite:true,depthFunc:THREE.AlwaysDepth,blending:THREE.NoBlending
  });
  const copyScene=new THREE.Scene(),copyCamera=new THREE.Camera(),quad=new THREE.Mesh(geometry,material);
  quad.frustumCulled=false;copyScene.add(quad);
  let dirty=true;
  const settings={enabled:true,samples:target.samples,format:low?'rgba8':'rgba16f',bytes:0,rebuilds:0};
  return {
    settings,
    invalidate(){dirty=true;},
    resize(){renderer.getDrawingBufferSize(size);target.setSize(size.x,size.y);settings.bytes=size.x*size.y*((low?4:8)+4)*(1+target.samples);dirty=true;},
    render(moving=false){
      if(low&&dirty){prepareLDR();exposure.value=renderer.toneMappingExposure;}
      if(moving){dirty=true;renderer.render(scene,camera);return;}
      const background=scene.background,mask=camera.layers.mask,autoClear=renderer.autoClear;
      if(dirty){
        camera.layers.set(0);renderer.setRenderTarget(target);renderer.autoClear=true;
        renderer.render(scene,camera);renderer.setRenderTarget(null);dirty=false;settings.rebuilds++;
      }
      renderer.autoClear=true;renderer.render(copyScene,copyCamera);
      renderer.autoClear=false;scene.background=null;camera.layers.set(1);
      renderer.render(scene,camera);
      camera.layers.mask=mask;scene.background=background;renderer.autoClear=autoClear;
    },
    dispose(){restore.forEach(fn=>fn());target.dispose();geometry.dispose();material.dispose();}
  };
}
