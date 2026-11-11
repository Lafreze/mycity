// Shared, stationary projection for the sky and the ground skirt. Sampling the
// same viewing ray makes their join identical, rather than fading to flat green.
// Palette: median sRGB samples from the manifest's SHA-verified valley.png;
// sample rectangles and hashes are recorded in reference/landscape-colours.json.
export const LANDSCAPE = Object.freeze({
  radius:240,centerZ:8.2,paintingYaw:.36,verticalOrigin:.35,verticalScale:.8,
  riverU:.52,riverSpread:.75,paintStart:-2,paintEnd:10,
  waterFadeStart:24,waterFadeEnd:36,nearWaterStart:17,nearWaterEnd:20,
  waterOverlap:19.92,bankFeather:.5,channelHalfWidth:.7,foregroundBlur:.012,
  waterNear:'#b5bdb0',waterMiddle:'#d1ccb4',waterDistance:'#dddcc4',haze:'#e2dcc4',
});
const f=n=>Number(n).toFixed(4);
export const PAINTING_GLSL=`
uniform sampler2D painting0;uniform sampler2D painting1;uniform sampler2D painting2;uniform sampler2D painting3;
uniform float hasPainting;uniform float night;uniform vec3 cityHaze;
vec3 cityPanel(float i,vec2 uv,vec2 dx,vec2 dy){
  // Implicit texture derivatives are undefined across these non-uniform
  // branches. Explicit gradients remove the dashed mip seams at panel/mouth
  // boundaries, without sampling all four paintings at every pixel.
  if(i<.5)return textureGrad(painting0,uv,dx,dy).rgb;
  if(i<1.5)return textureGrad(painting1,uv,dx,dy).rgb;
  if(i<2.5)return textureGrad(painting2,uv,dx,dy).rgb;
  return textureGrad(painting3,uv,dx,dy).rgb;
}
vec3 cityDomeDirection(vec3 point){
  vec3 ray=normalize(point-cameraPosition);
  vec3 origin=cameraPosition-vec3(0.,0.,${f(LANDSCAPE.centerZ)});
  float b=dot(origin,ray);
  return normalize(origin+ray*(-b+sqrt(max(0.,b*b+${f(LANDSCAPE.radius**2)}-dot(origin,origin)))));
}
vec2 cityFilterX(vec2 dx,float blur){return dx+vec2(blur*(dx.x<0.?-1.:1.),0.);}
vec2 cityFilterY(vec2 dy,float blur){return dy+vec2(0.,blur*(dy.y<0.?-1.:1.));}
vec3 cityPaintedBackground(vec3 point,float blur){
  vec3 d=cityDomeDirection(point);float angle=asin(clamp(d.y,-1.,1.));
  float v=clamp(${f(LANDSCAPE.verticalOrigin)}+angle*${f(LANDSCAPE.verticalScale)},.002,.998);
  float mouth=1.-smoothstep(.18,.62,abs(d.z));
  // Both mouths use the same scale/orientation and the same existing valley
  // texture. +Z is screen-right downstream, -Z screen-right upstream.
  vec2 riverUV=vec2(clamp(${f(LANDSCAPE.riverU)}+sign(d.x)*d.z*${f(LANDSCAPE.riverSpread)},.002,.998),v);
  float azimuth=fract(atan(d.x,d.z)/6.2831853+${f(LANDSCAPE.paintingYaw)});
  float sector=floor(azimuth*4.),x=fract(azimuth*4.);
  // Evaluate EVERY derivative before branching. Differentiate the angle, not
  // fract(angle): its wrap is not a footprint spanning the whole texture.
  vec3 ddx=dFdx(d),ddy=dFdy(d);
  vec2 dv=vec2(dFdx(v),dFdy(v));
  float angularScale=4./(6.2831853*max(dot(d.xz,d.xz),.000001));
  vec2 ds=vec2(d.z*ddx.x-d.x*ddx.z,d.z*ddy.x-d.x*ddy.z)*angularScale;
  vec2 baseDx=cityFilterX(vec2(ds.x*.82,dv.x),blur),baseDy=cityFilterY(vec2(ds.y*.82,dv.y),blur);
  vec2 nextDx=cityFilterX(vec2(ds.x*step(.82,x),dv.x),blur),nextDy=cityFilterY(vec2(ds.y*step(.82,x),dv.y),blur);
  vec2 riverDx=cityFilterX(dFdx(riverUV),blur),riverDy=cityFilterY(dFdy(riverUV),blur);
  vec3 color;
  if(mouth>.999){color=cityPanel(2.,riverUV,riverDx,riverDy);}else{
    color=cityPanel(sector,vec2(.18+x*.82,v),baseDx,baseDy);
    color=mix(color,cityPanel(mod(sector+1.,4.),vec2(max(0.,x-.82),v),nextDx,nextDy),smoothstep(.82,1.,x));
    if(mouth>0.)color=mix(color,cityPanel(2.,riverUV,riverDx,riverDy),mouth);
  }
  color=mix(cityHaze,color,hasPainting);
  // A light veil in the painting's own haze colour, applied to BOTH surfaces.
  color=mix(color,cityHaze,.08*(1.-smoothstep(.02,.22,abs(angle+.04))));
  color=mix(color,vec3(.43,.58,.64),smoothstep(.44,.75,angle));
  return mix(color,color*vec3(.10,.14,.27),night);
}
`;

// Shared by the cached skirt and the existing two-triangle water pass. The
// 8 cm overlap starts beyond the boat's complete +/-19.9 swept hull envelope.
export const WATER_JOIN_GLSL=`
float cityNearWaterAlpha(float x){return 1.-smoothstep(${f(LANDSCAPE.waterOverlap)},${f(LANDSCAPE.nearWaterEnd)},abs(x));}
float cityBankMask(vec2 p){
  float feather=${f(LANDSCAPE.bankFeather)}*smoothstep(${f(LANDSCAPE.nearWaterStart)},${f(LANDSCAPE.nearWaterEnd)},abs(p.x));
  return 1.-smoothstep(1.3-feather,1.3001,abs(p.y-${f(LANDSCAPE.centerZ)}));
}
`;

export const RIVER_SKIRT_GLSL=`
uniform vec3 cityWaterNear;uniform vec3 cityWaterMiddle;uniform vec3 cityWaterDistance;
float cityRiverOffset(float x){
  float t=abs(x);
  return sign(x)*(-1.2*smoothstep(20.,23.,t)+3.7*smoothstep(23.,28.,t)-5.*smoothstep(30.,40.,t));
}
float cityRiverHalfWidth(float x){return mix(1.3,.85,smoothstep(20.,36.,abs(x)));}
float cityRiverMask(vec2 p){
  float width=cityRiverHalfWidth(p.x),feather=mix(${f(LANDSCAPE.bankFeather)},.8,smoothstep(20.,28.,abs(p.x)));
  float across=abs(p.y-${f(LANDSCAPE.centerZ)}-cityRiverOffset(p.x));
  // Fade while the ribbon still has width: never taper to a visible point.
  return (1.-smoothstep(width-feather,width+.0001,across))*(1.-smoothstep(${f(LANDSCAPE.waterFadeStart)},${f(LANDSCAPE.waterFadeEnd)},abs(p.x)));
}
float cityCachedRiverMask(float river,float nearAlpha){
  return river*(1.-nearAlpha)/max(1.-nearAlpha*river,.000001);
}
float cityGroundHole(vec2 p){
  return (1.-step(${f(LANDSCAPE.channelHalfWidth)},abs(p.y-${f(LANDSCAPE.centerZ)})))*(1.-step(${f(LANDSCAPE.waterOverlap)},abs(p.x)));
}
vec3 cityRiverColor(float x){
  vec3 color=mix(cityWaterNear,cityWaterMiddle,smoothstep(20.,30.,abs(x)));
  color=mix(color,cityWaterDistance,smoothstep(30.,40.,abs(x)));
  return mix(color,color*vec3(.10,.14,.27),night);
}
`;
