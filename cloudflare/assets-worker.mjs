const ORIGINS=new Set(['https://mycity-production-8226.up.railway.app','http://127.0.0.1:4173','http://localhost:4173']);
const KEY=/^mycity\/models\/(?:props\/)?[a-z0-9-]+\.[a-f0-9]{16}\.glb$/;
function cors(response,origin){
 const headers=new Headers(response.headers);
 headers.set('Vary','Origin');
 headers.set('X-Content-Type-Options','nosniff');
 if(ORIGINS.has(origin)){
  headers.set('Access-Control-Allow-Origin',origin);
  headers.set('Access-Control-Expose-Headers','Content-Type, Content-Length, ETag, Cache-Control, Content-Range, Accept-Ranges');
 }
 return new Response(response.body,{status:response.status,headers});
}
function error(status){return new Response(null,{status,headers:{'Cache-Control':'no-store'}});}
function matchesETag(value,etag){return value?.split(',').some(x=>x.trim()==='*'||x.trim().replace(/^W\//,'')===etag);}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),key=url.pathname.slice(1),origin=request.headers.get('Origin');
  if(!KEY.test(key))return cors(error(404),origin);
  if(request.method==='OPTIONS'){
   if(!ORIGINS.has(origin))return error(403);
   const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, HEAD','Access-Control-Allow-Headers':'Range, Content-Type, If-None-Match, If-Modified-Since','Access-Control-Max-Age':'3600','Vary':'Origin'};
   return new Response(null,{status:204,headers});
  }
  if(!['GET','HEAD'].includes(request.method))return cors(error(405),origin);
  const cache=caches.default;
  url.search='';
  const cacheKey=new Request(url.href,{method:'GET'});
  const range=request.headers.get('Range');
  let response=range?null:await cache.match(cacheKey);
  if(!response){
   let object;
   try{object=request.method==='HEAD'?await env.MODELS.head(key):await env.MODELS.get(key,range?{range:request.headers}:undefined);}
   catch{ return cors(error(range?416:502),origin); }
   if(!object)return cors(error(404),origin);
   const headers=new Headers();object.writeHttpMetadata(headers);
   headers.set('Content-Type','model/gltf-binary');headers.set('ETag',object.httpEtag);
   headers.set('Cache-Control','public, max-age=31536000, immutable');headers.set('Accept-Ranges','bytes');
   let status=200;
   if(object.range){status=206;const start=object.range.offset||0;const length=object.range.length??object.size-start;headers.set('Content-Range',`bytes ${start}-${start+length-1}/${object.size}`);headers.set('Content-Length',String(length));}
   else headers.set('Content-Length',String(object.size));
   response=new Response(request.method==='HEAD'?null:object.body,{status,headers});
   if(request.method==='GET'&&status===200)ctx.waitUntil(cache.put(cacheKey,response.clone()));
  }
  if(matchesETag(request.headers.get('If-None-Match'),response.headers.get('ETag'))){
   response.body?.cancel();
   const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Range');
   return cors(new Response(null,{status:304,headers}),origin);
  }
  if(request.method==='HEAD'){response.body?.cancel();response=new Response(null,{status:response.status,headers:response.headers});}
  return cors(response,origin);
 }
};
