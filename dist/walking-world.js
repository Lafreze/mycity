// Collision and walking are independent of visual mesh density and frame rate.
export const WALKING={radius:.32,walkSpeed:1.65,runSpeed:2.8,maxStep:.205,bounds:{minX:-16.65,maxX:16.65,minZ:-12.6,maxZ:14.15},spawn:{x:-8.8,z:4.7}};

export function interpolateHeight(profile,z){
  if(z<profile[0][0]||z>profile.at(-1)[0])return null;
  for(let i=1;i<profile.length;i++)if(z<=profile[i][0]){
    const [a,ay]=profile[i-1],[b,by]=profile[i];
    return ay+(by-ay)*(z-a)/(b-a);
  }
  return profile.at(-1)[1];
}

export function floorHeight(x,z,bridge,bridgeReady=true){
  const b=WALKING.bounds,r=WALKING.radius;
  if(x<b.minX+r||x>b.maxX-r||z<b.minZ+r||z>b.maxZ-r)return null;
  if(bridgeReady&&bridge&&x>=bridge.safeMinX&&x<=bridge.safeMaxX){
    const y=interpolateHeight(bridge.profile,z);if(y!==null)return y;
  }
  // The entire canal is unwalkable except the measured bridge deck.
  if(z>6.9-r&&z<9.5+r)return null;
  if(bridge&&z>bridge.profile[0][0]&&z<bridge.profile.at(-1)[0]&&x>bridge.stairsMinX-r&&x<bridge.stairsMaxX+r)return null;
  // Stone sides and balustrades cannot be entered laterally through the mesh.
  if(bridge&&x>bridge.minX-r&&x<bridge.maxX+r&&z>bridge.bodyMinZ-r&&z<bridge.bodyMaxZ+r)return null;
  return 0;
}

export function blockedAt(x,z,colliders,year=2026){
  const r=WALKING.radius;
  return colliders.some(b=>{
    if(b.firstYear>year)return false;
    const dx=x-Math.max(b.minX,Math.min(x,b.maxX)),dz=z-Math.max(b.minZ,Math.min(z,b.maxZ));
    return dx*dx+dz*dz<r*r-1e-9;
  });
}

export function moveWalker(position,dx,dz,world,year=2026,bridgeReady=true){
  const p={...position},steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
  const accept=(x,z)=>{
    const y=floorHeight(x,z,world.bridge,bridgeReady);
    if(y===null||Math.abs(y-p.y)>WALKING.maxStep||blockedAt(x,z,world.colliders,year))return false;
    p.x=x;p.z=z;p.y=y;return true;
  };
  for(let i=0;i<steps;i++){
    // Slide along an obstacle instead of stopping diagonal movement entirely.
    if(!accept(p.x+dx/steps,p.z+dz/steps)){
      accept(p.x+dx/steps,p.z);accept(p.x,p.z+dz/steps);
    }
  }
  return p;
}

export function safePosition(preferred,world,year=2026,bridgeReady=true){
  const valid=(x,z)=>{const y=floorHeight(x,z,world.bridge,bridgeReady);return y!==null&&!blockedAt(x,z,world.colliders,year)?{x,y,z}:null;};
  const current=valid(preferred.x,preferred.z);if(current)return current;
  for(let r=.3;r<3;r+=.3)for(let i=0;i<24;i++){const p=valid(preferred.x+Math.cos(i*Math.PI/12)*r,preferred.z+Math.sin(i*Math.PI/12)*r);if(p)return p;}
  return valid(WALKING.spawn.x,WALKING.spawn.z)||{...WALKING.spawn,y:0};
}

export const DISCOVERIES=[
  {id:'chess',label:'游戏厅',x:-9.6,z:3.9,year:2023,product:'chess'},
  {id:'workshop',label:'创作工坊',x:-4.8,z:4,year:2024,product:'workshop'},
  {id:'life',label:'生活小店',x:0,z:3.75,year:2024,product:'life'},
  {id:'library',label:'图书馆',x:4.8,z:3.8,year:2025,product:'library'},
  {id:'archive',label:'旧时光',x:-13,z:-1.5,year:2024,product:'archive'},
  {id:'garden',label:'花园广场',x:0,z:-8.8,year:2023,message:'留一点空白，让下一个想法长出来。'},
  {id:'cafe',label:'河畔咖啡',x:-2.2,z:12.2,year:2023,message:'沿河走累了，就在这里歇一会儿。'},
  {id:'river',label:'顺流而下',x:-4.9,z:5.7,year:2023,message:'每个小小的开始，都有自己的去处。'}
];
