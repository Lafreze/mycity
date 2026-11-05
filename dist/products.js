// Replace this one list with real products. All current entries are illustrative demos.
export const CITY = {
  name: 'PRODUCT CITY',
  description: '用 AI，把脑海中的想法变成可以走进去的世界。',
  contactEmail: '',
  firstYear: 2023,
  lastYear: 2026,
};

export const PRODUCTS = [
  {
    id: 'chess', name: 'Fantasy Chess', subtitle: '让每一步，都有一点想象力。',
    category: '游戏', building: 'Game Arcade', icon: '♞',
    description: '一间为好奇心留灯的游戏厅。把熟悉的国际象棋，变成可以探索的微型世界。',
    launched: '2023-06-18', status: 'live', url: '', demo: true,
    tags: ['交互体验', 'Three.js', '游戏'], progress: 100,
    position: {x: 26, y: 73}, scenePosition: [-8,0,0], model: 'arcade.glb',
    updates: [
      {date:'2023-06-18',title:'第一间店，开门了',text:'从一个棋盘开始，城市有了第一个可以被体验的想法。'},
      {date:'2024-08-12',title:'让棋子拥有自己的世界',text:'加入新的棋盘主题与沉浸式交互。'},
      {date:'2026-09-22',title:'黄昏里的新一局',text:'优化光照、镜头与移动端操作。'},
    ],
  },
  {
    id: 'workshop', name: 'Idea Workshop', subtitle: '给灵感一张工作台。',
    category: 'AI 助手', building: 'AI Workshop', icon: '✧',
    description: '把散落的念头整理成可执行的下一步。在这里，AI 是一起动手的伙伴，每个想法都有机会成为作品。',
    launched: '2024-03-20', status:'live', url:'', demo:true,
    tags:['AI', '创意工具', '工作流'],progress:100,
    position:{x:46,y:65},scenePosition:[-4,0,0],model:'workshop.glb',
    updates:[{date:'2024-03-20',title:'灵感事务所入驻',text:'一张工作台，连接灵感与第一份原型。'},{date:'2026-10-18',title:'从对话，到可以运行的原型',text:'梳理创意、拆分步骤，再把小成果积累起来。'}],
  },
  {
    id:'life',name:'Little Utilities',subtitle:'小工具，让日常轻一点。',category:'生活工具',building:'Life Tools',icon:'♧',
    description:'一家收集小便利的街角商店。专注计时、习惯记录、轻量清单——让软件解决那些每天会遇到的小麻烦。',
    launched:'2024-09-08',status:'live',url:'',demo:true,tags:['日常效率','轻量工具','Web'],progress:100,
    position:{x:62,y:58},scenePosition:[0,0,0],model:'life-tools.glb',
    updates:[{date:'2024-09-08',title:'街角的便利店',text:'第一组轻量生活工具上线。'},{date:'2026-08-09',title:'留一点专注给自己',text:'加入更安静的专注体验与本地记录。'}],
  },
  {
    id:'library',name:'The Living Library',subtitle:'让知识生长，让好奇心常在。',category:'知识项目',building:'Library',icon:'▤',
    description:'一座阳光会照进来的图书馆。把阅读、研究与实践连接起来，让收藏的知识真正成为自己的东西。',
    launched:'2025-04-23',status:'live',url:'',demo:true,tags:['知识库','阅读','数字花园'],progress:100,
    position:{x:78,y:48},scenePosition:[4,0,0],model:'library.glb',
    updates:[{date:'2025-04-23',title:'图书馆迎来第一位读者',text:'把零散笔记连接成可以散步的知识地图。'},{date:'2026-10-28',title:'知识，也需要一扇窗',text:'更新阅读索引，让想法之间的联系更清晰。'}],
  },
  {
    id:'next',name:'Something New',subtitle:'下一栋建筑，从一个「如果」开始。',category:'正在建造',building:'Under Construction',icon:'⚒',
    description:'这里还没有最终答案。一个新想法正在打地基、搭框架，等待变成能被使用的产品。',
    launched:'2026-07-01',status:'building',url:'',demo:true,tags:['实验中','新想法','原型'],progress:62,
    position:{x:92,y:44},scenePosition:[8,0,0],model:'construction.glb',
    updates:[{date:'2026-07-01',title:'给下一个想法留块地',text:'开始验证新方向。'},{date:'2026-11-02',title:'框架正在成形',text:'核心原型完成，正在打磨第一次体验。'}],
  },
  {
    id:'archive',name:'Paper & Pixels',subtitle:'旧作品，也是这座城的一部分。',category:'旧城区',building:'Old Quarter',icon:'◷',
    description:'一个已经停止维护的早期笔记实验。它留在旧城区，记录曾经的尝试，也为之后的新作品提供养分。',
    launched:'2024-01-12',archivedAt:'2025-02-01',status:'archived',url:'',demo:true,tags:['归档','早期实验'],progress:100,
    position:{x:12,y:81},scenePosition:[-11,0,-5],model:null,
    updates:[{date:'2024-01-12',title:'第一本数字笔记',text:'一个关于收集与整理的早期实验。'},{date:'2025-02-01',title:'搬进旧城区',text:'停止维护，保留故事与设计记录。'}],
  },
];

export const statusAt = (product, year) => {
  if (Number(product.launched.slice(0,4)) > year) return 'future';
  if (product.status === 'archived' && year < Number(product.archivedAt.slice(0,4))) return 'live';
  return product.status;
};
export const STATUS = {live:'已开业',building:'建造中',archived:'已归档',future:'尚未动工'};
