// Pure selection keeps desktop defaults independent of browser sniffing in tests.
export function selectQualityProfile({search='',width=1024,height=768,screenWidth=width,screenHeight=height,coarse=false,deviceMemory,userAgent='',platform='',maxTouchPoints=0}={}){
  const forced=new URLSearchParams(search).get('quality');
  const ios=/iPad|iPhone|iPod/.test(userAgent)||(platform==='MacIntel'&&maxTouchPoints>1);
  const phone=coarse&&Math.min(width,height,screenWidth,screenHeight)<=600;
  const low=forced==='low'||(forced!=='high'&&(ios||phone||(deviceMemory>0&&deviceMemory<=4)));
  return Object.freeze({name:low?'low':'high',low,antialias:!low,pixelRatioCap:low?1:(width<600?1.5:2),shadows:!low,shadowMapSize:low?0:4096,staticFrame:true,modelConcurrency:low?1:Infinity,propConcurrency:low?1:3,dracoWorkers:low?1:2,modelTextureSize:low?1024:Infinity,propTextureSize:low?512:Infinity,landscapeTextureSize:low?1024:Infinity});
}
export function browserQualityProfile(search=location.search){
  return selectQualityProfile({search,width:innerWidth,height:innerHeight,screenWidth:screen.width,screenHeight:screen.height,coarse:matchMedia('(pointer: coarse)').matches,deviceMemory:navigator.deviceMemory,userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints});
}
// Keep the playable crossing, waterfront, garden landmarks and two neighbors.
// Dropped decorative types save ~60 MiB of decoded buffers vs the first low set.
export const LOW_PROPS=Object.freeze(['stone-bridge','river-railing','rowboat','street-lamp','coffee-cart','plane-tree','fountain','maker','reader']);
export function includeStreetAsset(id,profile){return !profile.low||LOW_PROPS.includes(id);}
