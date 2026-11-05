// Shared dimensions for the waterfront, placement audit and boat motion.
// X follows the current; Z runs from the shops toward the opposite bank.
export const CANAL = Object.freeze({minX:-20,maxX:20,minZ:6.9,maxZ:9.5,y:-.23,flowSpeed:.12});
export const BRIDGE = Object.freeze({x:10.9,z:8.2,width:5.6});
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
  const angle=(definition.rotation||0)+(definition.varied?index*.8:0);
  const width=scale*(Math.abs(Math.cos(angle))*sx+Math.abs(Math.sin(angle))*sz);
  const depth=scale*(Math.abs(Math.sin(angle))*sx+Math.abs(Math.cos(angle))*sz);
  const [x,y,z]=definition.positions[index];
  return {minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2,minY:y,maxY:y+sy*scale,width,depth};
}
