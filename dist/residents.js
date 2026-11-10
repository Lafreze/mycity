// The first conversations are authored locally: no account, API calls, or chat service.
export const RESIDENTS=[
  {id:'courier',name:'小邮',role:'街区信使',greeting:'这一箱，装着工坊今天的新点子。你也是第一次来吗？',returnGreeting:'又见面啦。今天有没有捡到什么好点子？',nightGreeting:'最后一件包裹送完，我就去河边听一会儿琴。',topics:[
    {label:'包裹里是什么？',reply:'一本空白笔记、一支铅笔，还有一句话：先做一个小小的版本。剩下的，等收件人自己完成。'},
    {label:'带我认识小城',reply:'沿着这条街是游戏厅、创作工坊、生活小店和图书馆。石桥通向咖啡摊；绕到房子后面，还有一座安静的小花园。'}]},
  {id:'maker',name:'阿木',role:'工坊创作者',greeting:'等一下，我把这个念头记下来……好了，欢迎来工坊。',returnGreeting:'你来得正好，我又想到一个小改进。',nightGreeting:'夜里安静，特别适合把白天的灵感做成第一个版本。',product:'workshop',topics:[
    {label:'你在做什么？',reply:'把“如果能这样就好了”画进笔记本，再让 AI 和我一起做出来。今天的目标很小：让一个点子真的跑起来。'},
    {label:'给我一点建议',reply:'先做最想亲手试一下的那一部分。有人愿意用，再一点点把它变成这条街上的一栋楼。'}]},
  {id:'reader',name:'书遥',role:'图书馆常客',greeting:'这页刚好读完。坐一会儿？好问题通常不赶时间。',returnGreeting:'上次的问题，后来想通了吗？',nightGreeting:'灯亮着，故事就还没结束。',product:'library',topics:[
    {label:'在读什么？',reply:'一本关于如何观察日常的小书。刚读到一句我很喜欢的话：把熟悉的事重新看一遍。'},
    {label:'哪里适合安静一下？',reply:'屋后的花园有喷泉和长椅。沿街绕过去就能到，那里只听得见水和风。'}]},
  {id:'barista',name:'可可',role:'河畔咖啡师',greeting:'一杯给赶路的人，一杯给愿意停下来的人。你选哪一杯？',returnGreeting:'老朋友，今天还是慢慢来？',nightGreeting:'夜里这杯不着急喝，看看河上的灯影吧。',topics:[
    {label:'给我一杯慢慢来',reply:'好，给你留一个靠河的位置。灵感和咖啡一样，偶尔也需要等一等。'},
    {label:'今天有什么新鲜事？',reply:'工坊又亮起一盏灯，邮差多送了一只箱子。对我们这座小城来说，这就是很好的消息。'}]},
  {id:'florist',name:'南枝',role:'街角花匠',greeting:'这束花还差一点点绿色……现在刚好。你喜欢哪一种颜色？',returnGreeting:'看，花又开了一点。慢慢长，也很好。',nightGreeting:'白天招呼人，夜里照顾花。这会儿它们也该休息了。',product:'life',topics:[
    {label:'喜欢温暖的颜色',reply:'那就送你一束想象中的杏色小花。愿你今天做出来的东西，也有一点这样的温度。'},
    {label:'花为什么一直在开？',reply:'每天照顾一点点呀。浇水、修枝、留下光照——做产品大概也是这样。'}]},
  {id:'cyclist',name:'阿轮',role:'骑行邻居',greeting:'前面有人，我先停一下。你好，要不要一起看看河边？',returnGreeting:'又绕回来了？同一条路，也能看见新东西。',nightGreeting:'天黑了就慢一点，给散步的人让让路。',topics:[
    {label:'推荐一条散步路线',reply:'沿河走到石桥，过桥看看咖啡摊，再从街角绕去后面的花园。慢慢走，别错过路边的人。'},
    {label:'为什么停在这里？',reply:'这条街留给大家慢慢逛。我在等朋友，顺便让车和自己都歇一歇。'}]},
  {id:'construction-worker',name:'梁叔',role:'小城建造者',greeting:'站在围栏外就好。下一栋楼的样子，还在这张图纸上。',returnGreeting:'又来看看进度？今天也向前走了一点。',nightGreeting:'收工啦。灯留一盏，明天接着把想法搭起来。',product:'next',topics:[
    {label:'这里会建什么？',reply:'一个还没有名字的新产品。先把地基打稳：它要帮谁，解决什么小麻烦。外墙的颜色，可以晚一点再想。'},
    {label:'桥现在能走了吗？',reply:'可以，入口是石阶。顺着中间走到对岸就好，别跨过两边的栏杆。'}]},
  {id:'helper-robot',name:'米粒',role:'工坊小助手',greeting:'你好！米粒已准备好。今天想发现什么？',returnGreeting:'识别到熟悉的朋友。欢迎回来！',nightGreeting:'夜间模式开启。我的音量也跟着小了一点。',product:'workshop',topics:[
    {label:'你能帮什么忙？',reply:'把大问题拆小，把散落的点子排好，再陪创作者迈出第一步。最后的选择，还是交给你。'},
    {label:'小城有什么秘密？',reply:'这里藏着八处足迹。也许和每位邻居说句话，比找到全部足迹更有意思。'}]},
  {id:'street-musician',name:'弦音',role:'河畔乐手',greeting:'这一小段，送给刚刚停下脚步的人。',returnGreeting:'你又来了。那我换一个轻一点的旋律。',nightGreeting:'白天听人声，夜里听回声。今晚的小城很安静。',topics:[
    {label:'这是什么曲子？',reply:'还没有名字，是我边走边想到的。每次经过这条河，都会多添几个音符。'},
    {label:'为什么在这里演奏？',reply:'因为总有人愿意停一会儿。一个想法被另一个人听见的时候，它就不再只是自己的了。'}]},
];

export function residentById(id){return RESIDENTS.find(r=>r.id===id);}
export function greetingFor(resident,{night=false,known=false}={}){
  return night?resident.nightGreeting:known?resident.returnGreeting:resident.greeting;
}
