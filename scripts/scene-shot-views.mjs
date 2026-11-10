// Fixed world coordinates, shared by before/after runs. The default is the actual
// spawn view. Feet views include the whole figure and ground with HUD margins.
// Florist is viewed from the left to clear the cyclist; musician from the open
// south promenade, left of the bench. Reader includes the complete chair.
export const SHOTS=[
  {name:'default',player:[-8.8,0,4.7,Math.PI/2]},
  {name:'river-east',player:[-8.8,0,4.7],camera:{position:[13,2.35,8.2],target:[80,-.15,8.2],fov:52}},
  {name:'river-west',player:[-8.8,0,4.7],camera:{position:[-13,2.35,8.2],target:[-80,-.15,8.2],fov:52}},
  {name:'protagonist-feet',figure:'hero',player:[-8.8,0,4.7,Math.PI/2],camera:{position:[-6.4,1.7,6.05],target:[-8.8,.75,4.7],fov:52}},
  {name:'resident-feet',figure:'maker',player:[-8.8,0,4.7],camera:{position:[-4.6,1.6,6],target:[-4.5,.67,2.9],fov:52}},
  {name:'reader-feet',figure:'reader',player:[-8.8,0,4.7],camera:{position:[4.4,1.3,5.9],target:[4.4,.56,2.8],fov:52}},
  {name:'florist-feet',figure:'florist',highOnly:true,player:[-8.8,0,4.7],camera:{position:[-1.15,1.6,5.7],target:[.5,.67,2.9],fov:52}},
  {name:'robot-feet',figure:'helper-robot',highOnly:true,player:[-8.8,0,4.7],camera:{position:[-3.05,1.1,6.05],target:[-3.3,.43,3.5],fov:52}},
  {name:'musician-feet',figure:'street-musician',highOnly:true,player:[-8.8,0,4.7],camera:{position:[-11.25,1.7,15.3],target:[-10.5,.69,12],fov:52}},
  {name:'entrance',player:[-8.8,0,4.7,Math.PI],camera:{position:[-7,2.2,7.2],target:[-9.1,1.25,1.7],fov:60}},
];
