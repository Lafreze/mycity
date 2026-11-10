// Keep per-shot failures local to a shot. Shared by the Playwright script and a
// pure-Node failure-injection test; no browser or filesystem dependency here.
export async function withTimeout(promise,label,milliseconds=30000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${milliseconds} ms`)),milliseconds);})]);}
  finally{clearTimeout(timer);}
}

export async function runShotSequence(shots,{capture,persist,recover=async()=>{},onFailure=()=>{}}){
  const results=[];
  for(const shot of shots){
    const result={shot:shot.name,status:'running'};
    try{await capture(shot,result);result.status='passed';}
    catch(error){result.status='failed';result.error=error.stack||String(error);onFailure(result);}
    // A failed page can leave a modal open, lose its WebGL context, or crash.
    // Recovery must not prevent later shots (or the next profile) being tried.
    if(result.status==='failed'){
      try{await recover(result);}catch(error){result.recoveryError=error.stack||String(error);}
    }
    results.push(result);
    try{await persist(result);}
    catch(error){result.status='failed';result.persistenceError=error.stack||String(error);onFailure(result);}
  }
  return results;
}
