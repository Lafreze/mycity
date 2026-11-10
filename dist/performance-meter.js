// Opt-in local diagnostics. No analytics, network calls or normal-page UI.
export function createPerformanceMeter(renderer,container,pickSample){
  if(!new URLSearchParams(location.search).has('perf'))return null;
  const output=document.createElement('output');output.id='city-performance';
  output.style.cssText='position:fixed;left:12px;top:80px;z-index:8;white-space:pre;font:11px/1.5 monospace;background:#fffdf0e8;color:#30291f;padding:8px;pointer-events:none';
  container.append(output);
  let start=performance.now(),last=0,begin=0,cpu=[],frames=[],triangles=0,calls=0;
  const p95=a=>a.sort((a,b)=>a-b)[Math.floor((a.length-1)*.95)]||0;
  return {
    begin(){begin=performance.now();if(last)frames.push(begin-last);last=begin;},
    end(){
      const now=performance.now();cpu.push(now-begin);triangles+=renderer.info.render.triangles;calls+=renderer.info.render.calls;
      if(now-start<3000)return;
      const pickStart=performance.now();pickSample();const pick=performance.now()-pickStart;
      const stats={fps:Number((cpu.length*1000/(now-start)).toFixed(1)),frameP95:Number(p95(frames).toFixed(1)),cpuP95:Number(p95(cpu).toFixed(1)),triangles:Math.round(triangles/cpu.length),drawCalls:Math.round(calls/cpu.length),pickMs:Number(pick.toFixed(2)),pixelRatio:renderer.getPixelRatio(),width:renderer.domElement.width,height:renderer.domElement.height};
      output.dataset.stats=JSON.stringify(stats);output.textContent=Object.entries(stats).map(([k,v])=>`${k}: ${v}`).join('\n');
      start=performance.now();cpu=[];frames=[];triangles=0;calls=0;
    },
    dispose(){output.remove();}
  };
}
