import assert from 'node:assert/strict';
import {runShotSequence,withTimeout} from './scene-shot-runner.mjs';

const attempted=[],persisted=[],recovered=[],logged=[];
const shots=['default','bad-camera','river-west','bad-interaction','resident-feet'].map(name=>({name}));
const results=await runShotSequence(shots,{
  async capture(shot,result){
    attempted.push(shot.name);result.profile='desktop';
    result.phase=shot.name==='bad-camera'?'position':'interaction';
    if(shot.name==='bad-camera')throw new ReferenceError('camera is not defined');
    result.snapshot={render:{calls:20,triangles:600000}};
    if(shot.name==='bad-interaction')throw new Error('Dialog did not open');
    result.phase='complete';
  },
  async persist(result){persisted.push(structuredClone(result));},
  async recover(result){recovered.push(result.shot);if(result.shot==='bad-interaction')throw new Error('Page already crashed');},
  onFailure:result=>logged.push(result.shot),
});
assert.deepEqual(attempted,shots.map(s=>s.name),'A position/interaction failure must not abort any later shot');
assert.deepEqual(results.map(r=>r.status),['passed','failed','passed','failed','passed']);
assert.deepEqual(recovered,['bad-camera','bad-interaction']);assert.deepEqual(logged,recovered);
assert.equal(persisted.length,shots.length,'Every shot, including failures, gets a report');
assert.match(persisted[1].error,/camera is not defined/);assert.equal(persisted[1].phase,'position');
assert.equal(persisted[3].snapshot.render.calls,20,'Partial measurements survive an interaction failure');
assert.match(persisted[3].recoveryError,/Page already crashed/,'Cleanup failure is recorded without aborting later captures');
assert.equal(results.filter(r=>r.status==='failed').length,2,'The caller retains all failures for its final nonzero exit');

const saved=[];
const writes=await runShotSequence([{name:'write-fails'},{name:'next-shot'}],{
  async capture(shot,result){result.measured=true;},
  async persist(result){saved.push(result.shot);if(result.shot==='write-fails')throw new Error('Disk full');},
});
assert.deepEqual(saved,['write-fails','next-shot']);assert.equal(writes[0].status,'failed');
assert.match(writes[0].persistenceError,/Disk full/);assert.equal(writes[1].status,'passed');
await assert.rejects(withTimeout(new Promise(()=>{}),'Stalled frame sample',5),/Stalled frame sample timed out/);
assert.equal(await withTimeout(Promise.resolve(42),'Completed evaluation',5),42);
console.log('Passed: shot failure isolation, partial diagnostics, recovery/write failures, continued capture and bounded browser waits.');
