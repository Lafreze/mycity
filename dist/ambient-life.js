import * as THREE from 'three';

// Sparse windborne seeds and distant swallows: one points draw + six triangles.
// Dense GLB trees/buildings stay on layer 0, so the street cache remains useful.
// No textures, lights, shadows, CPU vertex updates, or low-profile allocations.
export function createAmbientLife(scene,{low=false,reducedMotion=false}={}){
  if(low||reducedMotion)return {update(){},resources:[],triangles:0,points:0};
  const time={value:0},group=new THREE.Group();scene.add(group);
  const resources=[],positions=[];
  for(let i=0;i<20;i++)positions.push(Math.sin(i*7.31)*14,.7+(i%5)*.3,i<12?-9.7+Math.cos(i*2.7)*2:11.6+Math.cos(i*2.7));
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time},
    vertexShader:`uniform float time;varying float seedAlpha;void main(){
      vec3 p=position;p.x+=sin(time*.19+position.z)*.65;p.z+=sin(time*.13+position.x)*.28;p.y+=sin(time*.6+position.x)*.13;
      vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;
      gl_PointSize=clamp(34./-v.z,1.,3.);seedAlpha=.22+.16*sin(time*.5+position.x);
    }`,
    fragmentShader:`varying float seedAlpha;void main(){
      float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.82,.73,.48,a*seedAlpha);
      #include <colorspace_fragment>
    }`});
  const seeds=new THREE.Points(geometry,material);seeds.layers.set(1);group.add(seeds);resources.push(geometry,material);
  const wings=[],phases=[];
  for(let bird=0;bird<3;bird++)for(const side of [-1,1]){
    wings.push(0,0,0,side*.32,0,.1,side*.16,0,-.1);phases.push(bird*1.7,bird*1.7,bird*1.7);
  }
  const birdGeometry=new THREE.BufferGeometry();birdGeometry.setAttribute('position',new THREE.Float32BufferAttribute(wings,3));birdGeometry.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
  const birdMaterial=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{time},
    vertexShader:`uniform float time;attribute float phase;void main(){
      vec3 p=position;p.y+=abs(p.x)*sin(time*4.2+phase)*.7;
      float a=time*.028+phase;p+=vec3(cos(a)*29.,12.+sin(a*2.)*.6+phase*.3,sin(a)*24.);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    }`,fragmentShader:'void main(){gl_FragColor=vec4(.18,.20,.18,1.);\n#include <colorspace_fragment>\n}'});
  const birds=new THREE.Mesh(birdGeometry,birdMaterial);birds.layers.set(1);birds.frustumCulled=false;group.add(birds);resources.push(birdGeometry,birdMaterial);
  // Shader drift can extend the seeds beyond their undeformed bounding volume.
  geometry.computeBoundingSphere();geometry.boundingSphere.radius+=1;
  return {update(seconds,night){time.value=seconds;group.visible=!night;},resources,triangles:6,points:20};
}
