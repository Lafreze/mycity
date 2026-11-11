// Assemble with the actual vendored Three shader builder. The GL boundary only
// captures source; it does NOT compile, link or stand in for a GPU test.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../dist/vendor/three/three.module.js';

const threeURL=new URL('../../dist/vendor/three/three.module.js',import.meta.url);
const source=(await readFile(threeURL,'utf8')).replaceAll("'./three.core.js'",JSON.stringify(new URL('./three.core.js',threeURL).href));
// Test-only exports in memory; never modify the vendored module on disk.
const {WebGLProgram,WebGLPrograms}=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {WebGLProgram,WebGLPrograms};\n').toString('base64'));

const withoutComments=source=>source.replace(/\/\*[\s\S]*?\*\//g,s=>s.replace(/[^\n]/g,' ')).replace(/\/\/[^\n]*/g,'');
export function assertDirectiveLines(source,label){
  const uncommented=withoutComments(source);
  for(const [i,line] of uncommented.split('\n').entries()){
    const hash=line.indexOf('#');
    if(hash>=0)assert.equal(line.slice(0,hash).trim(),'',`${label}:${i+1}: code before preprocessor #: ${line.trim()}`);
  }
}
export function assertTerminated(chunk,label){assert.ok(chunk.endsWith('\n'),`${label}: injected chunk must end in a newline`);}

export function applyAndAuditHook(material,parameters,renderer,label){
  const replacements=[],replace=String.prototype.replace;
  for(const stage of ['vertexShader','fragmentShader']){
    parameters[stage]=`#define CITY_AUDIT_${stage}_START\n`+parameters[stage]+`\n#define CITY_AUDIT_${stage}_END\n`;
  }
  // Hooks are synchronous. Observe their REAL replacement strings so a missing
  // terminal newline cannot hide behind a newline in the original ShaderLib.
  try{
    String.prototype.replace=function(search,replacement){
      if(typeof search==='string'&&search.startsWith('#include <')){
        assert.equal(typeof replacement,'string','Audit new callback-based injections explicitly');
        replacements.push({search,replacement});
      }
      return replace.call(this,search,replacement);
    };
    material.onBeforeCompile(parameters,renderer);
  }finally{String.prototype.replace=replace;}
  for(const {search,replacement} of replacements)assertTerminated(replacement,`${label} ${search}`);
  for(const stage of ['vertexShader','fragmentShader']){
    const result=parameters[stage],start=`#define CITY_AUDIT_${stage}_START\n`,end=`#define CITY_AUDIT_${stage}_END\n`;
    assert.equal(result.split(start).length,2,`${label}: preserve original shader start`);
    assert.equal(result.split(end).length,2,`${label}: preserve original shader end`);
    const prelude=result.slice(0,result.indexOf(start)),append=result.slice(result.indexOf(end)+end.length);
    if(prelude)assertTerminated(prelude,`${label} ${stage} prelude`);
    if(append)assertTerminated(append,`${label} ${stage} append`);
    assertDirectiveLines(result,`${label} ${stage}`);
  }
  return replacements.length;
}

export function assembleMaterial(object,scene,{low=false,cached=false,label='material'}={}){
  const material=object.material,captured={};
  const gl={VERTEX_SHADER:'vert',FRAGMENT_SHADER:'frag',createProgram:()=>({}),createShader:stage=>({stage}),
    shaderSource(shader,source){captured[shader.stage]=source;},compileShader(){},attachShader(){},linkProgram(){}};
  const renderer={getContext:()=>gl,getRenderTarget:()=>cached?{texture:{}}:null,
    state:{buffers:{depth:{getReversed:()=>false}}},shadowMap:{enabled:!low,type:THREE.PCFSoftShadowMap},
    toneMapping:THREE.ACESFilmicToneMapping,outputColorSpace:THREE.SRGBColorSpace};
  const capabilities={precision:'highp',vertexTextures:true,getMaxPrecision:value=>value};
  const maps={get:value=>value},extensions={has:()=>false},bindings={};
  const programs=WebGLPrograms(renderer,maps,maps,extensions,capabilities,bindings,{numPlanes:0,numIntersection:0});
  const lights={directional:[{},{}],hemi:[{}],point:[{}],spot:[],spotLightMap:[],rectArea:[],
    directionalShadowMap:low?[]:[{}],pointShadowMap:[],spotShadowMap:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};
  const parameters=programs.getParameters(material,lights,low?[]:[{}],scene,object);
  parameters.uniforms={...material.uniforms};
  const replacements=applyAndAuditHook(material,parameters,renderer,label);
  new WebGLProgram(renderer,label,parameters,bindings);
  assert.deepEqual(Object.keys(captured).sort(),['frag','vert']);
  for(const [stage,source] of Object.entries(captured)){
    assertDirectiveLines(source,`${label} expanded ${stage}`);
    assert.doesNotMatch(source,/#include\s*</,`${label}: all Three chunks expanded`);
    assert.ok(!/\bundefined\b|\bNaN\b/.test(withoutComments(source)),`${label}: complete renderer parameters`);
  }
  return {label,...captured,replacements};
}

export async function validateOffline(shaders){
  const candidates=process.env.GLSLANG_VALIDATOR?[process.env.GLSLANG_VALIDATOR]:['glslangValidator','/opt/homebrew/bin/glslangValidator','/usr/local/bin/glslangValidator','/usr/bin/glslangValidator'];
  let validator;
  for(const candidate of candidates){
    const result=spawnSync(candidate,['--version'],{encoding:'utf8',timeout:10000});
    if(result.error?.code==='ENOENT')continue;
    assert.equal(result.status,0,`${candidate}: ${result.error?.message||result.stderr}`);validator=candidate;break;
  }
  if(!validator){
    assert.ok(!process.env.GLSLANG_VALIDATOR,'Configured GLSLANG_VALIDATOR was not found');
    console.log('Skipped: offline GLSL compilation/linking (glslangValidator is not installed). Source assembly is not a GPU compile test.');return;
  }
  const directory=new URL('../../output/natural-scene/shader-audit/',import.meta.url);await mkdir(directory,{recursive:true});
  for(const shader of shaders){
    const hash=createHash('sha256').update(shader.vert+shader.frag).digest('hex').slice(0,12),paths=[];
    for(const stage of ['vert','frag']){const path=new URL(`${shader.label}-${hash}.${stage}`,directory);await writeFile(path,shader[stage]);paths.push(fileURLToPath(path));}
    const result=spawnSync(validator,['-l',...paths],{encoding:'utf8',timeout:15000});
    assert.equal(result.status,0,`${shader.label}: ${result.error?.message||''}\n${result.stdout}\n${result.stderr}`);
  }
  console.log(`Passed: offline GLSL ES compilation/linking of ${shaders.length} assembled material variants.`);
}
