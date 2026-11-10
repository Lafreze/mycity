import * as THREE from 'three';

// Cache the full-resolution static street AND its depth. Animated water/boat still
// use real geometry and depth testing. Any camera/scene change renders the street again.
// No image assets, simplified meshes, texture reductions or lower pixel ratio.
export function createStaticFrame(renderer,scene,camera){
  camera.layers.enable(1);
  const supported=renderer.extensions.has('EXT_color_buffer_float');
  if(!supported)return {invalidate(){},resize(){},dispose(){},render(){renderer.render(scene,camera);}};
  const size=new THREE.Vector2();
  const target=new THREE.WebGLRenderTarget(1,1,{
    type:THREE.HalfFloatType,format:THREE.RGBAFormat,
    minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
    depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType),
    samples:Math.min(4,renderer.capabilities.maxSamples)
  });
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
        // Three.js clears a solid background without tone mapping it.
        if(gl_FragDepth<1.0){
          #include <tonemapping_fragment>
        }
        #include <colorspace_fragment>
      }`,
    depthTest:true,depthWrite:true,depthFunc:THREE.AlwaysDepth,blending:THREE.NoBlending
  });
  const copyScene=new THREE.Scene(),copyCamera=new THREE.Camera(),quad=new THREE.Mesh(geometry,material);
  quad.frustumCulled=false;copyScene.add(quad);
  let dirty=true;
  return {
    invalidate(){dirty=true;},
    resize(){renderer.getDrawingBufferSize(size);target.setSize(size.x,size.y);dirty=true;},
    render(moving=false){
      if(moving){dirty=true;renderer.render(scene,camera);return;}
      const background=scene.background,mask=camera.layers.mask,autoClear=renderer.autoClear;
      if(dirty){
        camera.layers.set(0);renderer.setRenderTarget(target);renderer.autoClear=true;
        renderer.render(scene,camera);renderer.setRenderTarget(null);dirty=false;
      }
      renderer.autoClear=true;renderer.render(copyScene,copyCamera);
      renderer.autoClear=false;scene.background=null;camera.layers.set(1);
      renderer.render(scene,camera);
      camera.layers.mask=mask;scene.background=background;renderer.autoClear=autoClear;
    },
    dispose(){target.dispose();geometry.dispose();material.dispose();}
  };
}
