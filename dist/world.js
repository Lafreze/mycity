// Shared dimensions for the waterfront, placement audit and boat motion.
// X follows the current; Z runs from the shops toward the opposite bank.
export const CANAL = Object.freeze({minX:-20,maxX:20,minZ:6.9,maxZ:9.5,y:-.23,flowSpeed:.12});
export const BRIDGE = Object.freeze({x:10.9,z:8.2,width:9.2});
// Fade all three waterfront surfaces together, beyond the playable banks.
// Keeping this camera-relative also works from the far bank and overview camera.
export const HORIZON = Object.freeze({fadeStart:32,fadeEnd:78,paintingYaw:.36});
export const HORIZON_GLSL = `float cityHorizonAlpha(vec3 p){
  return 1.0-smoothstep(${HORIZON.fadeStart.toFixed(1)},${HORIZON.fadeEnd.toFixed(1)},length(p.xz-cameraPosition.xz));
}`;
// Shared visible pavement heights. Physics uses a flat zero-height street, but
// soles/contact shadows should meet these surfaces instead of hovering 1–2 cm.
export const STREET_SURFACES = Object.freeze([
  [34,14.9,'#d6c6a9',0,-.025,-.55], [34,5,'#d6c6a9',0,-.025,-10.5],
  [28,1.2,'#c5b79b',0,-.018,-8.5], [34,5,'#dfceb0',0,-.025,12],
  [34,2.15,'#b6aa94',0,-.018,4.475], [34,1.6,'#e4d4b9',0,-.014,2.6],
]);
export function streetSurfaceY(x,z){
  return STREET_SURFACES.reduce((y,[w,h,,cx,cy,cz])=>Math.abs(x-cx)<=w/2&&Math.abs(z-cz)<=h/2?Math.max(y,cy):y,-.08);
}
export function contactFloorY(p,bridge){
  if(p.y>0||(bridge&&p.x>=bridge.safeMinX&&p.x<=bridge.safeMaxX&&p.z>=bridge.profile[0][0]&&p.z<=bridge.profile.at(-1)[0]))return p.y;
  return streetSurfaceY(p.x,p.z);
}
// The Hi3D rowboat has its stern/rudder at local +Z and its bow at -Z.
export const BOAT = Object.freeze({minX:-18.5,maxX:18.5,z:8.2,draft:.18,length:2.8,heading:-Math.PI/2,forwardZ:-1});

export function boatPose(seconds,startX=-5) {
  const span=BOAT.maxX-BOAT.minX;
  return {
    x:BOAT.minX+((startX-BOAT.minX+Math.max(0,seconds)*CANAL.flowSpeed)%span+span)%span,
    y:CANAL.y-BOAT.draft+Math.sin(seconds*.8)*.012,
    z:BOAT.z,
    roll:Math.sin(seconds*.65)*.006,
  };
}

// Bounds are in the exported glTF Y-up coordinate system.
export function footprint(asset,definition,index=0) {
  const [sx,sy,sz]=asset.size;
  const scale=(definition.height?definition.height/sy:definition.width/Math.max(sx,sz))*(definition.varied?.93+Math.sin(index*2.1)*.07:1);
  const angle=definition.rotations?.[index]??((definition.rotation||0)+(definition.varied?index*.8:0));
  const width=scale*(Math.abs(Math.cos(angle))*sx+Math.abs(Math.sin(angle))*sz);
  const depth=scale*(Math.abs(Math.sin(angle))*sx+Math.abs(Math.cos(angle))*sz);
  const [x,y,z]=definition.positions[index];
  return {minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2,minY:y,maxY:y+sy*scale,width,depth};
}
