// ═══════════════════════════════════════════════════════════════════════════════
// FocusTodoDesktop 2.0 — app.js  (全量重写 v10)
// ═══════════════════════════════════════════════════════════════════════════════

// ── 工具函数 ────────────────────────────────────────────────────────────────────
function todayKey() {
  const now = new Date();
  return new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function thisWeekKey() {
  const now = new Date(), day = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setDate(now.getDate() - day); mon.setHours(0,0,0,0);
  return mon.toISOString().slice(0, 10);
}
const el  = id => document.getElementById(id);
const qsa = s  => Array.from(document.querySelectorAll(s));
function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function samePeriod(dateStr, range) {
  const d = new Date(dateStr), now = new Date();
  if (range==='day')   return dateStr===todayKey();
  if (range==='week')  { const s=new Date(now); s.setDate(now.getDate()-(now.getDay()+6)%7); s.setHours(0,0,0,0); const e=new Date(s); e.setDate(s.getDate()+7); return d>=s&&d<e; }
  if (range==='month') return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
  return d.getFullYear()===now.getFullYear();
}
const TAG_COLORS=[
  {bg:'#ede9fe',text:'#5b21b6'},{bg:'#dbeafe',text:'#1d4ed8'},{bg:'#dcfce7',text:'#166534'},
  {bg:'#fef9c3',text:'#854d0e'},{bg:'#ffe4e6',text:'#9f1239'},{bg:'#e0f2fe',text:'#0369a1'},
  {bg:'#fae8ff',text:'#7e22ce'},{bg:'#fff7ed',text:'#c2410c'},
];
function tagColor(tag, tags) { const i=tags.indexOf(tag); return TAG_COLORS[(i>=0?i:0)%TAG_COLORS.length]; }
function tagBadge(tag, tags, extra='') { const c=tagColor(tag,tags); return `<span class="tag-pill" style="background:${c.bg};color:${c.text};${extra}">${esc(tag)}</span>`; }
function tomatoBar(done, exp) { return '🍅'.repeat(Math.min(done,exp))+'🟢'.repeat(Math.max(0,done-exp))+'🤍'.repeat(Math.max(0,exp-done)); }
function playSound(freq=440, freq2=null, dur=0.6) {
  try { const ctx=new(window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(),g=ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(freq,ctx.currentTime); if(freq2)o.frequency.linearRampToValueAtTime(freq2,ctx.currentTime+dur*.5); g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(.14,ctx.currentTime+.05); g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+dur); o.connect(g);g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+dur+.1); setTimeout(()=>ctx.close().catch(()=>{}),2000); } catch(e){}
}
function playCheer() {
  try { const ctx=new(window.AudioContext||window.webkitAudioContext)(); [523,659,784,1047].forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(); o.type='sine'; o.frequency.value=f; g.gain.setValueAtTime(0,ctx.currentTime+i*.15); g.gain.linearRampToValueAtTime(.1,ctx.currentTime+i*.15+.05); g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+i*.15+.4); o.connect(g);g.connect(ctx.destination); o.start(ctx.currentTime+i*.15); o.stop(ctx.currentTime+i*.15+.45);}); setTimeout(()=>ctx.close().catch(()=>{}),2000); } catch(e){}
}
function showConfetti(el_) {
  const e=el_.querySelector('.confetti-overlay'); if(e)e.remove();
  const ov=document.createElement('div'); ov.className='confetti-overlay';
  ov.style.cssText='position:absolute;inset:0;border-radius:var(--ac-r-sm);overflow:hidden;pointer-events:none;z-index:10;display:flex;align-items:center;justify-content:center;font-size:24px';
  ov.innerHTML='<div style="animation:confettiSlide 2.5s ease forwards;white-space:nowrap;letter-spacing:4px">🎉✨🎊🎉✨🎊</div>';
  if(!document.querySelector('#confettiStyle')){ const s=document.createElement('style'); s.id='confettiStyle'; s.textContent='@keyframes confettiSlide{0%{transform:translateX(-100%);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translateX(100%);opacity:0}}'; document.head.appendChild(s); }
  el_.style.position='relative'; el_.appendChild(ov); setTimeout(()=>ov.remove(),2500);
}
function rainbowBg(n) { if(n<=0)return''; const o=Math.min(.55,.08+n*.07); return `background:linear-gradient(90deg,rgba(255,0,0,${o}),rgba(255,165,0,${o}),rgba(255,255,0,${o}),rgba(0,200,0,${o}),rgba(0,0,255,${o}),rgba(148,0,211,${o}))`; }

// ── 状态 ─────────────────────────────────────────────────────────────────────
let state = null;
let panelSizes = [300, 1, 360];
let dragState   = null;
let currentRange = 'day';
let stackFilterTag = null; // 任务堆筛选
let taskModalPendingTags = [];
let routineModalPendingTags = [];

// ── 番茄钟状态 ────────────────────────────────────────────────────────────────
const FOCUS_TOTAL = 25 * 60; // 1500s
const POMO_PHASES = [
  {key:'r', label:'回顾', color:'#818cf8', pct:.08},
  {key:'w', label:'工作', color:'#6366f1', pct:.42},
  {key:'w', label:'工作', color:'#6366f1', pct:.42},
  {key:'t', label:'记录', color:'#a855f7', pct:.08},
];
let pomoState    = 'idle';  // idle | focus | overtime | break
let pomoRunning  = false;
let pomoTimer    = null;
let pomoPhaseTimeout = null;  // 精确阶段转换定时器
let pomoRemaining = FOCUS_TOTAL;
let pomoOT       = 0;       // 加时秒数
let pomoBreak    = 5 * 60;
let pomoCountUp  = false;   // false=倒计时  true=正计时
let pomoCategory = '';
let pomoTaskId   = null;
let focusMode    = false;   // 专注窗口是否显示
let pomoStartTime = 0;      // Date.now() 上次开始/恢复的时间戳

// ── safeState ────────────────────────────────────────────────────────────────
function safeState(d) {
  const b = Object.assign({
    tasks: [], activityLog: [], routineTasks: [],
    activityTags: ['工作','学习','生活','健康'],
    pomodoroSessions: [], dailySummaries: {},
    ui: { panelSizes: [300,1,360] }
  }, d||{});
  if (!b.activityTags) b.activityTags = [];
  if (!b.routineTasks) b.routineTasks = [];
  panelSizes = b.ui?.panelSizes || [300,1,360];
  return b;
}
async function save() {
  try { state.ui = state.ui||{}; state.ui.panelSizes = panelSizes; await window.focusAPI.saveData(state); }
  catch(e) { console.error(e); }
}

// ── 布局 ─────────────────────────────────────────────────────────────────────
function applyLayout() {
  el('app').style.gridTemplateColumns = `${panelSizes[0]}px 6px minmax(380px,${panelSizes[1]}fr) 6px ${panelSizes[2]}px`;
}
function bindResizers() {
  qsa('.resizer').forEach(h=>{
    h.addEventListener('mousedown',e=>{ dragState={type:h.dataset.type,startX:e.clientX,left:panelSizes[0],right:panelSizes[2]}; e.preventDefault(); });
  });
  window.addEventListener('mousemove',e=>{ if(!dragState)return; const dx=e.clientX-dragState.startX; if(dragState.type==='left') panelSizes[0]=Math.min(480,Math.max(240,dragState.left+dx)); if(dragState.type==='right') panelSizes[2]=Math.min(500,Math.max(280,dragState.right-dx)); applyLayout(); });
  window.addEventListener('mouseup',async()=>{ if(dragState){dragState=null;await save();} });
}

// ── 日结算 ───────────────────────────────────────────────────────────────────
function dailyReset() {
  const today = todayKey(), week = thisWeekKey();
  let changed = false;
  state.routineTasks.forEach(rt=>{
    if(rt.lastResetDate !== today){ if(rt.done){rt.done=false;changed=true;} rt.lastResetDate=today; }
    if(rt.weeklyFreq && rt.lastWeekKey !== week){ rt.weeklyDoneCount=0; rt.lastWeekKey=week; changed=true; }
  });
  return changed;
}

// ── Tag 工具 ──────────────────────────────────────────────────────────────────
function renderTagPicker(containerId, pendingArr) {
  const box = el(containerId); if(!box) return; box.innerHTML='';
  state.activityTags.forEach(tag=>{
    const on=pendingArr.includes(tag), c=tagColor(tag,state.activityTags);
    const span=document.createElement('span'); span.className='tag-pill tag-pick';
    span.style.background=on?c.text:c.bg; span.style.color=on?'#fff':c.text; span.textContent=tag;
    span.addEventListener('click',()=>{ if(pendingArr.includes(tag))pendingArr.splice(pendingArr.indexOf(tag),1); else pendingArr.push(tag); renderTagPicker(containerId,pendingArr); });
    box.appendChild(span);
  });
}

// ── Tag 管理 Modal ────────────────────────────────────────────────────────────
function openTagMgr() { renderTagMgrList(); el('tagMgrModal').classList.add('show'); }
function closeTagMgr() { el('tagMgrModal').classList.remove('show'); }
function renderTagMgrList() {
  const box=el('tagMgrList'); box.innerHTML='';
  if(!state.activityTags.length){box.innerHTML='<div class="empty">暂无 Tag</div>';return;}
  state.activityTags.forEach((tag,idx)=>{
    const c=tagColor(tag,state.activityTags); const div=document.createElement('div'); div.className='row between';
    div.style.cssText='padding:6px 0;border-bottom:1px solid var(--line)';
    div.innerHTML=`<span class="tag-pill" style="background:${c.bg};color:${c.text}">${esc(tag)}</span><button class="danger sm" data-tag-del="${idx}">删除</button>`;
    box.appendChild(div);
  });
}
function bindTagMgr() {
  el('closeTagMgrModal').onclick=closeTagMgr;
  el('tagMgrModal').addEventListener('click',e=>{ if(e.target.id==='tagMgrModal')closeTagMgr(); });
  el('tagMgrModal').addEventListener('click',async e=>{
    if(e.target.dataset.tagDel!==undefined&&e.target.dataset.tagDel!==''){
      const idx=Number(e.target.dataset.tagDel), removed=state.activityTags[idx];
      state.activityTags.splice(idx,1);
      state.activityLog.forEach(a=>{if(a.tags)a.tags=a.tags.filter(t=>t!==removed);});
      state.tasks.forEach(t=>{if(t.tags)t.tags=t.tags.filter(x=>x!==removed);});
      state.routineTasks.forEach(r=>{if(r.tags)r.tags=r.tags.filter(x=>x!==removed);});
      await save(); renderTagMgrList(); renderAll();
    }
  });
  el('addTagBtn').onclick=async()=>{
    const text=el('newTagInput').value.trim(); if(!text)return;
    if(state.activityTags.includes(text))return alert('已存在');
    state.activityTags.push(text); el('newTagInput').value='';
    await save(); renderTagMgrList(); renderAll();
  };
  el('newTagInput').addEventListener('keydown',e=>{if(e.key==='Enter')el('addTagBtn').click();});
}

// ── 任务堆 ────────────────────────────────────────────────────────────────────
function renderTaskStack() {
  // tag 筛选栏
  const tagBar=el('taskStackTagBar'); tagBar.innerHTML='';
  const allTags=[...new Set(state.tasks.filter(t=>!t.done).flatMap(t=>t.tags||[]))];
  const mkBtn=(label,tag)=>{
    const btn=document.createElement('span'); btn.className='tag-pill tag-pick';
    const active=(tag===null?stackFilterTag===null:stackFilterTag===tag);
    if(tag===null){ btn.style.background=active?'#19c8b9':'#e2e8f0'; btn.style.color=active?'#fff':'#64748b'; }
    else { const c=tagColor(tag,state.activityTags); btn.style.background=active?c.text:c.bg; btn.style.color=active?'#fff':c.text; }
    btn.textContent=label; btn.onclick=()=>{ stackFilterTag=tag; renderTaskStack(); };
    return btn;
  };
  tagBar.appendChild(mkBtn('全部',null));
  allTags.forEach(tag=>tagBar.appendChild(mkBtn(tag,tag)));

  // 任务列表
  const list=el('taskStackList'); list.innerHTML='';
  const tasks=state.tasks.filter(t=>!t.done && !t.bucket && (stackFilterTag===null||(t.tags||[]).includes(stackFilterTag)));
  if(!tasks.length){ list.innerHTML='<div class="empty">暂无任务，点击＋添加</div>'; }
  // 任务堆支持从 bucket 拖回（取消分类，bucket 清空）
  list.addEventListener('dragover',e=>e.preventDefault());
  list.addEventListener('drop',async e=>{
    e.preventDefault();
    try{
      const data=JSON.parse(e.dataTransfer.getData('text/plain'));
      if(data.from==='bucket'&&data.taskId){
        const t=state.tasks.find(x=>x.id===data.taskId);
        if(t){t.bucket=null;t.updatedAt=todayKey();await save();renderAll();}
      }
    }catch(err){}
  });
  if(!tasks.length) return;

  // 按tag分组
  const groups={};
  tasks.forEach(t=>{
    const key=(t.tags&&t.tags.length)?t.tags[0]:'未分类';
    (groups[key]=groups[key]||[]).push(t);
  });
  Object.entries(groups).forEach(([gTag,gTasks])=>{
    if(stackFilterTag!==null&&gTag!==stackFilterTag&&stackFilterTag!=='未分类'){}
    const header=document.createElement('div'); header.className='task-stack-label';
    const c=tagColor(gTag,state.activityTags);
    header.innerHTML=`<span class="tag-pill" style="background:${c.bg};color:${c.text};font-size:10px">${esc(gTag)}</span>`;
    list.appendChild(header);
    gTasks.forEach(t=>{
      const row=document.createElement('div'); row.className='todo-row'; row.draggable=true; row.dataset.taskId=t.id;
      row.innerHTML=`<span class="ac-checkbox" data-task-stack-toggle="${t.id}" style="font-size:13px"></span><span class="todo-title">${esc(t.title)}</span><span class="todo-meta">${tomatoBar(t.completedPomodoros||0,t.expectedPomodoros||1)}</span><button class="ghost sm" data-task-edit="${t.id}" style="flex-shrink:0;padding:3px 7px;font-size:10px">编辑</button>`;
      row.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',JSON.stringify({from:'stack',taskId:t.id})));
      list.appendChild(row);
    });
  });
}

// ── 任务 Modal ────────────────────────────────────────────────────────────────
function openTaskModal(id=null, defaultBucket='normal') {
  const t = id ? state.tasks.find(x=>x.id===id) : null;
  el('taskModalTitle').textContent = t ? '编辑任务' : '添加任务';
  el('taskTitleInput').value = t ? t.title : '';
  el('taskBucketSelect').value = t ? (t.bucket||'normal') : defaultBucket;
  el('taskPomodorosInput').value = t ? (t.expectedPomodoros||1) : 1;
  el('taskEditingId').value = id||'';
  el('deleteTaskBtn').style.display = t ? '' : 'none';
  taskModalPendingTags = t ? [...(t.tags||[])] : [];
  renderTagPicker('taskTagPicker', taskModalPendingTags);
  el('taskModal').classList.add('show');
  el('taskTitleInput').focus();
}
function closeTaskModal() { el('taskModal').classList.remove('show'); }
function bindTaskModal() {
  el('closeTaskModal').onclick = closeTaskModal;
  el('taskModal').addEventListener('click',e=>{ if(e.target.id==='taskModal')closeTaskModal(); });
  el('saveTaskBtn').onclick = async()=>{
    const title=el('taskTitleInput').value.trim(); if(!title)return alert('请输入任务内容');
    const id=el('taskEditingId').value;
    if(id){
      const t=state.tasks.find(x=>x.id===id); if(t){ t.title=title; t.bucket=el('taskBucketSelect').value; t.expectedPomodoros=Number(el('taskPomodorosInput').value)||1; t.tags=[...taskModalPendingTags]; t.updatedAt=todayKey(); }
    } else {
      state.tasks.unshift({id:crypto.randomUUID(),title,bucket:el('taskBucketSelect').value,expectedPomodoros:Number(el('taskPomodorosInput').value)||1,completedPomodoros:0,done:false,tags:[...taskModalPendingTags],createdAt:todayKey(),updatedAt:todayKey()});
    }
    closeTaskModal(); await save(); renderAll();
  };
  el('deleteTaskBtn').onclick = async()=>{
    const id=el('taskEditingId').value; if(!id)return;
    if(!confirm('确认删除任务？'))return;
    state.tasks=state.tasks.filter(x=>x.id!==id); closeTaskModal(); await save(); renderAll();
  };
}

// ── 待办清单（普通委托/通缉讨伐）────────────────────────────────────────────
function renderBucket(bucket) {
  const listId = bucket==='normal'?'normalList':'urgentList';
  const box=el(listId); if(!box)return; box.innerHTML='';
  const tasks=state.tasks.filter(t=>!t.done&&t.bucket===bucket);
  if(!tasks.length){ box.innerHTML='<div class="empty" style="font-size:12px">暂无任务</div>'; }
  tasks.forEach(t=>{
    const row=document.createElement('div'); row.className='todo-row'; row.draggable=true; row.dataset.taskId=t.id;
    const tagsHtml=(t.tags&&t.tags.length)?t.tags.map(tg=>tagBadge(tg,state.activityTags,'font-size:10px;padding:2px 7px')).join(' '):'';
    row.innerHTML=`<span class="ac-checkbox" data-task-done="${t.id}" style="font-size:13px"></span><div style="flex:1;min-width:0"><div class="todo-title">${esc(t.title)}</div>${tagsHtml?`<div style="margin-top:3px">${tagsHtml}</div>`:''}</div><span class="todo-meta">${tomatoBar(t.completedPomodoros||0,t.expectedPomodoros||1)}</span><button class="ghost sm" data-task-edit="${t.id}" style="padding:3px 7px;font-size:10px;flex-shrink:0">编辑</button>`;
    // 支持从 bucket 拖回任务堆
    row.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',JSON.stringify({from:'bucket',taskId:t.id,sourceBucket:bucket})));
    // 放置区 drop 支持（从任务堆拖入）
    row.addEventListener('dragover',e=>e.preventDefault());
    box.appendChild(row);
  });
  // 整个 box 支持 drop（从任务堆拖入改 bucket）
  box.addEventListener('dragover',e=>e.preventDefault());
  box.addEventListener('drop',async e=>{
    e.preventDefault();
    try {
      const data=JSON.parse(e.dataTransfer.getData('text/plain'));
      if(data.from==='stack'&&data.taskId){
        const t=state.tasks.find(x=>x.id===data.taskId);
        if(t){t.bucket=bucket;t.updatedAt=todayKey();await save();renderAll();}
      }
    } catch(err){}
  });
}

// ── 日常任务 ─────────────────────────────────────────────────────────────────
function syncRoutineLog(rt) {
  const today=todayKey(), key=`routine_${rt.id}_${today}`;
  if(state.activityLog.find(a=>a.sourceKey===key))return;
  state.activityLog.unshift({id:crypto.randomUUID(),text:rt.title,date:today,tags:[...(rt.tags||[])],sourceKey:key,isRoutine:true});
}
function renderRoutine() {
  const box=el('routineList'); if(!box)return; box.innerHTML='';
  if(!state.routineTasks.length){ box.innerHTML='<div class="empty" style="font-size:12px">暂无日常任务</div>'; return; }
  state.routineTasks.forEach(rt=>{
    const row=document.createElement('div'); row.className='routine-row'+(rt.done?' done':'');
    let extra='';
    if(rt.weeklyFreq){const d=rt.weeklyDoneCount||0,r=rt.weeklyFreq,col=d>=r?'#16a34a':'#94a3b8';extra=`<span style="font-size:10px;color:${col};margin-left:4px">${d}/${r}/周</span>`;}
    const styleStr=rt.weeklyFreq?rainbowBg(Math.max(0,(rt.weeklyDoneCount||0)-(rt.weeklyFreq||0))):'';
    if(styleStr)row.style.cssText=styleStr;
    row.innerHTML=`<span class="ac-checkbox${rt.done?' checked':''}" data-routine-toggle="${rt.id}" style="color:${rt.done?'#fff':'transparent'}">✓</span><span class="routine-title" style="flex:1;font-size:13px">${esc(rt.title)}${rt.done?' 💪':''}${extra}</span><div class="row" style="gap:4px;flex-shrink:0"><button class="ghost sm" data-routine-edit="${rt.id}" style="padding:3px 7px;font-size:10px">编辑</button><button class="danger sm" data-routine-del="${rt.id}" style="padding:3px 7px;font-size:10px">删除</button></div>`;
    row.dataset.rid=rt.id;
    box.appendChild(row);
  });
}

function openRoutineModal(id=null) {
  const rt=id?state.routineTasks.find(x=>x.id===id):null;
  el('routineModalTitle').textContent=rt?'编辑日常任务':'添加日常任务';
  el('routineTitleInput').value=rt?rt.title:'';
  el('routineFreqSelect').value=rt&&rt.weeklyFreq?String(rt.weeklyFreq):'0';
  el('routineEditingId').value=id||'';
  routineModalPendingTags=rt?[...(rt.tags||[])]:[];
  renderTagPicker('routineTagPicker',routineModalPendingTags);
  el('routineModal').classList.add('show'); el('routineTitleInput').focus();
}
function closeRoutineModal() { el('routineModal').classList.remove('show'); }
function bindRoutineModal() {
  el('addRoutineBtn').onclick=()=>openRoutineModal();
  el('closeRoutineModal').onclick=closeRoutineModal;
  el('routineModal').addEventListener('click',e=>{ if(e.target.id==='routineModal')closeRoutineModal(); });
  el('saveRoutineBtn').onclick=async()=>{
    const title=el('routineTitleInput').value.trim(); if(!title)return alert('请输入任务名');
    const freq=Number(el('routineFreqSelect').value), id=el('routineEditingId').value;
    if(id){ const rt=state.routineTasks.find(x=>x.id===id); if(rt){rt.title=title;rt.weeklyFreq=freq||null;rt.tags=[...routineModalPendingTags];} }
    else { state.routineTasks.push({id:crypto.randomUUID(),title,done:false,weeklyFreq:freq||null,weeklyDoneCount:0,lastResetDate:todayKey(),lastWeekKey:thisWeekKey(),tags:[...routineModalPendingTags],createdAt:todayKey()}); }
    closeRoutineModal(); await save(); renderRoutine();
  };
}

// ── 委托事件（任务堆+待办+日常）────────────────────────────────────────────
function bindDelegated() {
  document.body.addEventListener('click', async e=>{
    // 任务堆 toggle（标记完成→移出，不放入活动）
    if(e.target.dataset.taskStackToggle){
      const t=state.tasks.find(x=>x.id===e.target.dataset.taskStackToggle); if(!t)return;
      t.done=true; t.updatedAt=todayKey(); await save(); renderAll(); return;
    }
    // 待办清单完成
    if(e.target.dataset.taskDone){
      const t=state.tasks.find(x=>x.id===e.target.dataset.taskDone); if(!t)return;
      t.done=!t.done; t.updatedAt=todayKey(); await save(); renderAll(); return;
    }
    // 任务编辑
    if(e.target.dataset.taskEdit){ openTaskModal(e.target.dataset.taskEdit); return; }
    // 日常任务 toggle
    if(e.target.dataset.routineToggle){
      const rt=state.routineTasks.find(x=>x.id===e.target.dataset.routineToggle); if(!rt)return;
      const wasNotDone=!rt.done; rt.done=!rt.done;
      if(wasNotDone){
        syncRoutineLog(rt);
        if(rt.weeklyFreq){
          rt.weeklyDoneCount=(rt.weeklyDoneCount||0)+1;
          const wd=rt.weeklyDoneCount,wr=rt.weeklyFreq;
          await save(); renderRoutine(); renderSummary();
          if(wd===wr){ const row=document.querySelector(`[data-rid="${rt.id}"]`); if(row)showConfetti(row); }
          if(wd>wr)playCheer();
          return;
        }
        await save(); renderRoutine(); renderSummary(); return;
      }
      const key=`routine_${rt.id}_${todayKey()}`;
      state.activityLog=state.activityLog.filter(a=>a.sourceKey!==key);
      if(rt.weeklyFreq)rt.weeklyDoneCount=Math.max(0,(rt.weeklyDoneCount||1)-1);
      await save(); renderRoutine(); renderSummary(); return;
    }
    // 日常任务编辑/删除
    if(e.target.dataset.routineEdit){ openRoutineModal(e.target.dataset.routineEdit); return; }
    if(e.target.dataset.routineDel){
      if(!confirm('确认删除？'))return;
      state.routineTasks=state.routineTasks.filter(x=>x.id!==e.target.dataset.routineDel);
      await save(); renderRoutine(); return;
    }
    // 活动删除
    if(e.target.dataset.activityDel){
      state.activityLog=state.activityLog.filter(x=>x.id!==e.target.dataset.activityDel);
      await save(); renderSummary(); return;
    }
  });
}

// ── 番茄钟 ───────────────────────────────────────────────────────────────────
// 时间戳倒计时：用 Date.now() 计算剩余时间，不受 setInterval 节流影响
function pomoComputeRemaining() {
  if (!pomoRunning) {
    if (pomoState === 'focus') return pomoRemaining;
    if (pomoState === 'overtime') return pomoOT;
    if (pomoState === 'break') return pomoBreak;
    return FOCUS_TOTAL;
  }
  const elapsed = (Date.now() - pomoStartTime) / 1000;
  if (pomoState === 'focus') return pomoRemaining - elapsed;
  if (pomoState === 'overtime') return pomoOT + elapsed;
  if (pomoState === 'break') return pomoBreak - elapsed;
  return FOCUS_TOTAL;
}
function pomoFormat(state_=pomoState, remaining=pomoRemaining, ot=pomoOT) {
  const sec = pomoComputeRemaining();
  if(state_==='overtime'){ const m=String(Math.floor(Math.max(0,sec)/60)).padStart(2,'0'),s=String(Math.floor(Math.max(0,sec))%60).padStart(2,'0'); return`+${m}:${s}`; }
  if(state_==='break'){ const m=String(Math.floor(Math.max(0,sec)/60)).padStart(2,'0'),s=String(Math.floor(Math.max(0,sec))%60).padStart(2,'0'); return`${m}:${s}`; }
  if(pomoCountUp){ const el_=FOCUS_TOTAL-Math.max(0,sec); const m=String(Math.floor(el_/60)).padStart(2,'0'),s=String(Math.floor(el_)%60).padStart(2,'0'); return`${m}:${s}`; }
  const m=String(Math.floor(Math.max(0,sec)/60)).padStart(2,'0'),s=String(Math.floor(Math.max(0,sec))%60).padStart(2,'0'); return`${m}:${s}`;
}
function pomoTimerColor() {
  if(pomoState==='overtime')return'#f59e0b';
  if(pomoState==='break')return'#22c55e';
  return focusMode?'#fff':'#1e1b4b';
}
function pomoPhaseLabel() {
  if(pomoState==='overtime')return'⏱ 加时中';
  if(pomoState==='break')return'☕ 休息中';
  if(pomoState==='idle')return'准备开始';
  if(!pomoRunning)return'已暂停';
  return '专注中';
}
function pomoCurrentPhaseIdx() {
  if(pomoState!=='focus')return -1;
  const remain = pomoComputeRemaining();
  const pct=(FOCUS_TOTAL-remain)/FOCUS_TOTAL; let cum=0;
  for(let i=0;i<POMO_PHASES.length;i++){cum+=POMO_PHASES[i].pct;if(pct<cum)return i;}
  return POMO_PHASES.length-1;
}
function pomoTimelineHTML() {
  const cur=pomoCurrentPhaseIdx();
  return POMO_PHASES.map((ph,i)=>{
    const active=i===cur, past=(pomoState==='focus'&&i<cur)||pomoState==='overtime'||pomoState==='break';
    const bg=past||active?ph.color:'rgba(255,255,255,.25)', op=active?1:past?.7:.45;
    return `<div style="flex:${ph.pct};background:${bg};opacity:${op};height:100%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${past||active?'#fff':'rgba(255,255,255,.6)'}${active?';outline:2px solid rgba(255,255,255,.8);outline-offset:-2px':''}">${ph.key.toUpperCase()}</div>`;
  }).join('');
}

function syncPomoCategories(selId) {
  const sel=el(selId); if(!sel)return;
  const old=pomoCategory||sel.value;
  sel.innerHTML='<option value="" style="color:#111">--无--</option>';
  state.activityTags.forEach(t=>{ const op=document.createElement('option'); op.value=t; op.textContent=t; op.style.color='#111'; sel.appendChild(op); });
  sel.value=state.activityTags.includes(old)?old:(state.activityTags[0]||'');
  pomoCategory=sel.value;
}
function syncPomoTasks(selId) {
  const sel=el(selId); if(!sel)return;
  const old=pomoTaskId||sel.value||'';
  sel.innerHTML='<option value="" style="color:#111">--不绑定--</option>';
  state.tasks.filter(t=>!t.done).forEach(t=>{ const op=document.createElement('option'); op.value=t.id; op.textContent=t.title; op.style.color='#111'; sel.appendChild(op); });
  sel.value=(old&&[...sel.options].some(o=>o.value===old))?old:'';
  pomoTaskId=sel.value||null;
}

function renderPomoEntry() {
  // 左栏番茄钟 entry（小，显示状态+开始按钮）
  const timeStr=pomoFormat();
  const col=pomoTimerColor();
  const label=pomoPhaseLabel();
  el('pomoTimerDisplay').textContent=timeStr;
  el('pomoTimerDisplay').style.color=col;
  el('pomoStatusLabel').textContent=label;
  el('pomoModeBadge').textContent=pomoCountUp?'正计时':'倒计时';
  el('pomoTimeline').innerHTML=pomoTimelineHTML();
  // 按钮显示
  const idle=pomoState==='idle'||(pomoState==='focus'&&!pomoRunning);
  const running=pomoRunning&&pomoState!=='overtime';
  const overtime=pomoState==='overtime';
  el('pomoStartBtn').style.display=idle&&!overtime?'':'none';
  el('pomoPauseBtn').style.display=running?'':'none';
  el('pomoFinishBtn').style.display=overtime?'':'none';
  // 退出专注按钮
  el('pomoExitFocusBtn').style.display=focusMode?'':'none';
  syncPomoCategories('pomoCatSelect');
  syncPomoTasks('pomoTaskSelect');
}

function renderPomo() {
  renderPomoEntry();
  // 同步状态到独立专注窗口
  if (focusMode) syncToFocusWindow();
  // 兜底检查（正常情况下由 schedulePhaseTransition 精确触发）
  if (pomoState === 'focus' && pomoRunning) {
    if (pomoComputeRemaining() <= 0) { pomoEnterOvertime(); }
  }
  if (pomoState === 'break' && pomoRunning) {
    if (pomoComputeRemaining() <= 0) { finishBreak(); }
  }
}

// 构建发送给专注窗口的状态
function buildFocusState() {
  const remain = pomoComputeRemaining();
  return {
    phase: pomoState,
    running: pomoRunning,
    countUp: pomoCountUp,
    remaining: remain,
    overtimeSec: pomoOT,
    breakSec: pomoBreak,
    startTime: pomoStartTime,
    tasks: state.tasks.filter(t => !t.done).map(t => ({ id: t.id, title: t.title })),
    tags: state.activityTags,
    activeTaskId: pomoTaskId,
    activeCategory: pomoCategory,
  };
}

function syncToFocusWindow() {
  window.focusAPI.syncFocusState(buildFocusState());
}

function enterFocusMode() {
  if (focusMode) return;
  focusMode = true;
  const st = buildFocusState();
  window.focusAPI.openFocusWindow(st);
  if (pomoRunning) window.focusAPI.focusSetTop(true);
}
function exitFocusMode() {
  if (!focusMode) return;
  focusMode = false;
  window.focusAPI.closeFocusWindow();
  window.focusAPI.focusSetTop(false);
  renderPomoEntry();
}

// ── 精确阶段转换定时器（解决 setInterval 延迟导致卡 00:00 的问题）─────────
function clearPhaseTimeout() {
  if (pomoPhaseTimeout) { clearTimeout(pomoPhaseTimeout); pomoPhaseTimeout = null; }
}
function schedulePhaseTransition() {
  clearPhaseTimeout();
  if (!pomoRunning) return;
  if (pomoState === 'focus') {
    const remain = pomoComputeRemaining();
    if (remain <= 0) { pomoEnterOvertime(); return; }
    // 精确到 remain 归零的时刻触发
    pomoPhaseTimeout = setTimeout(() => {
      if (pomoState === 'focus' && pomoRunning) pomoEnterOvertime();
    }, Math.ceil(remain * 1000) + 20);
  } else if (pomoState === 'break') {
    const remain = pomoComputeRemaining();
    if (remain <= 0) { finishBreak(); return; }
    pomoPhaseTimeout = setTimeout(() => {
      if (pomoState === 'break' && pomoRunning) finishBreak();
    }, Math.ceil(remain * 1000) + 20);
  }
}
function finishBreak() {
  clearInterval(pomoTimer); pomoTimer = null; clearPhaseTimeout();
  playSound(440,880,.6);
  window.focusAPI.notify({title:'休息结束',body:'可以开始下一轮了'});
  pomoState='idle'; pomoRunning=false; pomoRemaining=FOCUS_TOTAL;
  exitFocusMode(); renderAll();
}

// 番茄钟核心
function pomoEnterOvertime() {
  clearPhaseTimeout();
  pomoState='overtime'; pomoOT=0; pomoRunning=true; pomoStartTime=Date.now();
  pomoRemaining = 0;
  playSound(440,880,.8);
  window.focusAPI.notify({title:'专注结束',body:'进入加时，手动点完成'});
  window.focusAPI.focusSetTop(true);
  if(pomoTimer)clearInterval(pomoTimer);
  pomoTimer=setInterval(()=>renderPomo(), 500);
}
async function pomoFinish(overtimeSec) {
  if(pomoTimer)clearInterval(pomoTimer); pomoTimer=null; clearPhaseTimeout();
  const ot = typeof overtimeSec === 'number' ? overtimeSec : Math.floor(pomoComputeRemaining());
  state.pomodoroSessions.push({id:crypto.randomUUID(),date:todayKey(),category:pomoCategory,minutes:25,overtimeSeconds:Math.max(0,ot)});
  if(pomoTaskId){const t=state.tasks.find(x=>x.id===pomoTaskId);if(t){t.completedPomodoros=(t.completedPomodoros||0)+1;t.updatedAt=todayKey();}}
  else{const a=state.tasks.find(t=>!t.done);if(a){a.completedPomodoros=(a.completedPomodoros||0)+1;a.updatedAt=todayKey();}}
  await save();
  pomoState='break'; pomoBreak=5*60; pomoRunning=true; pomoOT=0; pomoStartTime=Date.now();
  pomoRemaining = FOCUS_TOTAL;
  window.focusAPI.focusSetTop(true);
  playSound(659,523,.8);
  if(pomoTimer)clearInterval(pomoTimer);
  pomoTimer=setInterval(()=>renderPomo(), 500);
  schedulePhaseTransition();
}
function pomoStart() {
  if(pomoRunning)return;
  if(pomoState==='idle'||pomoState==='focus'){
    pomoState='focus'; pomoRunning=true; pomoStartTime=Date.now();
    if(pomoRemaining===FOCUS_TOTAL)playSound(440,440,.4);
    if(pomoTimer)clearInterval(pomoTimer);
    pomoTimer=setInterval(()=>renderPomo(), 500);
    schedulePhaseTransition();
    enterFocusMode();
    window.focusAPI.focusSetTop(true);
  } else if(pomoState==='break'){
    pomoRunning=true; pomoStartTime=Date.now();
    if(pomoTimer)clearInterval(pomoTimer);
    pomoTimer=setInterval(()=>renderPomo(), 500);
    schedulePhaseTransition();
    enterFocusMode();
    window.focusAPI.focusSetTop(true);
  }
  renderPomo();
}
function pomoPause() {
  if(!pomoRunning&&pomoState!=='overtime')return;
  // ⚠️ 先计算再设状态：pomoComputeRemaining() 在 pomoRunning=true 时走时间戳动态插值
  const remain = pomoComputeRemaining();
  pomoRunning=false;
  clearPhaseTimeout();
  if(pomoState==='focus') pomoRemaining = Math.max(0, remain);
  if(pomoState==='break') pomoBreak = Math.max(0, remain);
  if(pomoState==='overtime') pomoOT = Math.max(0, remain);
  if(pomoTimer)clearInterval(pomoTimer); pomoTimer=null;
  exitFocusMode(); renderPomo();
}
function pomoReset() {
  clearPhaseTimeout();
  if(pomoTimer)clearInterval(pomoTimer); pomoTimer=null;
  pomoState='idle'; pomoRunning=false; pomoRemaining=FOCUS_TOTAL; pomoOT=0; pomoBreak=5*60;
  exitFocusMode(); renderPomo();
}
async function pomoCompleteTask() {
  if(!pomoTaskId)return;
  const t=state.tasks.find(x=>x.id===pomoTaskId); if(!t||t.done)return;
  t.done=true; t.updatedAt=todayKey(); await save(); renderAll();
}

function bindPomoEvents() {
  // 左栏
  el('pomoTimerDisplay').onclick=()=>{ pomoCountUp=!pomoCountUp; renderPomo(); };
  el('pomoStartBtn').onclick=()=>pomoStart();
  el('pomoPauseBtn').onclick=()=>pomoPause();
  el('pomoFinishBtn').onclick=()=>pomoFinish();
  el('pomoResetBtn').onclick=()=>pomoReset();
  el('pomoCatSelect').onchange=e=>{ pomoCategory=e.target.value; };
  el('pomoTaskSelect').onchange=e=>{
    pomoTaskId=e.target.value||null;
    if(pomoTaskId){const t=state.tasks.find(x=>x.id===pomoTaskId);if(t&&t.tags&&t.tags.length){const tag=state.activityTags.includes(t.tags[0])?t.tags[0]:state.activityTags[0];if(tag){pomoCategory=tag;syncPomoCategories('pomoCatSelect');}}}
    renderPomo();
  };
  el('pomoExitFocusBtn').onclick=()=>exitFocusMode();

  // 专注覆盖层 → 由独立窗口处理（不再通过 DOM 事件）
  // 绑定 IPC 焦点动作处理器
  window.focusAPI.onFocusAction(function(action) {
    if (!action || !action.type) return;
    switch (action.type) {
      case 'start': pomoStart(); break;
      case 'resume': pomoStart(); break;
      case 'resume-break': pomoStart(); break;
      case 'pause': {
        const remain = pomoComputeRemaining();
        pomoRunning = false;
        if (pomoState === 'focus') pomoRemaining = Math.max(0, remain);
        if (pomoState === 'break') pomoBreak = Math.max(0, remain);
        if (pomoState === 'overtime') pomoOT = Math.max(0, remain);
        if(pomoTimer) clearInterval(pomoTimer); pomoTimer = null;
        clearPhaseTimeout();
        renderPomo();
        break;
      }
      case 'finish':
        pomoFinish(action.payload ? action.payload.overtimeSec : void 0);
        break;
      case 'reset': pomoReset(); break;
      case 'exit': {
        const exitRemain = pomoComputeRemaining();
        pomoRunning = false;
        if(pomoState === 'focus') pomoRemaining = Math.max(0, exitRemain);
        if(pomoState === 'break') pomoBreak = Math.max(0, exitRemain);
        if(pomoState === 'overtime') pomoOT = Math.max(0, exitRemain);
        if(pomoTimer) clearInterval(pomoTimer); pomoTimer = null;
        clearPhaseTimeout();
        exitFocusMode();
        break;
      }
      case 'enter-overtime': pomoEnterOvertime(); break;
      case 'break-finished': break; // handled by setInterval
      case 'select-category': pomoCategory = action.payload.category; renderPomo(); break;
      case 'select-task': pomoTaskId = action.payload.taskId; renderPomo(); break;
      case 'toggle-mode': pomoCountUp = action.payload.countUp; renderPomo(); break;
      case 'complete-task': pomoCompleteTask(); break;
    }
  });

  window.focusAPI.onFocusClosed(function() {
    if (focusMode) {
      focusMode = false;
      renderPomoEntry();
    }
  });
}

// ── 统计数字 ─────────────────────────────────────────────────────────────────
function renderStats() {
  const today=todayKey();
  const active=state.tasks.filter(t=>!t.done).length;
  const done=state.tasks.filter(t=>t.done&&(t.updatedAt===today||t.createdAt===today)).length;
  const mins=state.pomodoroSessions.filter(s=>s.date===today).reduce((n,s)=>n+s.minutes,0);
  el('statActive').querySelector('div').textContent=active;
  el('statDone').querySelector('div').textContent=done;
  el('statMin').querySelector('div').textContent=mins;
}

// ── 总结中心 ─────────────────────────────────────────────────────────────────
function buildSummary() {
  const sessions=state.pomodoroSessions.filter(s=>samePeriod(s.date,currentRange));
  const activities=state.activityLog.filter(a=>samePeriod(a.date,currentRange));
  const total=sessions.reduce((n,s)=>n+s.minutes,0);
  const catMap={}; sessions.forEach(s=>catMap[s.category]=(catMap[s.category]||0)+s.minutes);
  return {sessions,activities,total,catMap,pomoCnt:sessions.length};
}

function renderSummary() {
  const s=buildSummary();
  const today=todayKey();
  const doneTasks=state.tasks.filter(t=>t.done&&samePeriod(t.updatedAt||t.createdAt||today,currentRange));

  el('summaryHighlights').innerHTML=
    `<div style="background:var(--ac-bg-white);border-radius:var(--ac-r-sm);padding:10px;text-align:center;border:2px solid var(--ac-border-light)"><div style="font-size:24px;font-weight:800">${doneTasks.length}</div><div class="tiny">完成任务</div></div>`+
    `<div style="background:var(--ac-bg-white);border-radius:var(--ac-r-sm);padding:10px;text-align:center;border:2px solid var(--ac-border-light)"><div style="font-size:24px;font-weight:800">${s.total}<span style="font-size:11px;font-weight:400">m</span></div><div class="tiny">专注 ${s.pomoCnt}🍅</div></div>`;

  // 活动分类柱状图（S1）
  const tagCounts={};
  [...doneTasks.flatMap(t=>(t.tags&&t.tags.length?t.tags:['无分类'])),
   ...s.activities.flatMap(a=>(a.tags&&a.tags.length?a.tags:['无分类']))
  ].forEach(tag=>tagCounts[tag]=(tagCounts[tag]||0)+1);
  const barEntries=Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]);
  const maxCnt=barEntries[0]?.[1]||1;
  const barHtml=barEntries.map(([tag,cnt])=>{
    const c=tagColor(tag,state.activityTags);
    return `<div class="bar"><div style="width:64px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ac-text-2)">${esc(tag)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(6,Math.round(cnt/maxCnt*100))}%;background:${c.text}"></div></div><div class="small">${cnt}</div></div>`;
  }).join('');

  // 本日完成活动（Bug1 fix：tag picker 用 DOM 构建，不用 innerHTML 重复渲染）
  const todayDone=state.tasks.filter(t=>t.done&&(t.updatedAt===today||t.createdAt===today));
  const todayActs=state.activityLog.filter(a=>a.date===today);
  const allItems=[
    ...todayDone.map(t=>({text:t.title,tags:t.tags||[],isTask:true,id:t.id})),
    ...todayActs.map(a=>({text:a.text,tags:a.tags||[],isTask:false,id:a.id,isRoutine:a.isRoutine}))
  ];
  // 不再用双列 grid，改为单列 stack，彻底避免 grid 子元素溢出
  const actHtml=allItems.length?allItems.map(item=>{
    const tagsH=(item.tags.length?item.tags.map(t=>tagBadge(t,state.activityTags,'font-size:10px;padding:1px 6px')).join(' '):'');
    const delBtn=item.isTask?'':`<button class="danger sm" data-activity-del="${item.id}" style="padding:2px 8px;font-size:10px;flex-shrink:0;white-space:nowrap;margin-left:auto">删除</button>`;
    // 每条：宽度 100%，overflow:hidden，内部 flex 不溢出
    return `<div style="width:100%;overflow:hidden;padding:4px 0;border-bottom:1px solid var(--ac-border-light)">`+
      `<div style="display:flex;align-items:center;gap:6px;width:100%;min-width:0;box-sizing:border-box">`+
        `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--ac-text-label);min-width:0">${item.isTask?'✅':item.isRoutine?'🔄':'▸'} ${esc(item.text)}</span>`+
        delBtn+
      `</div>`+
      (tagsH?`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;width:100%;overflow:hidden">${tagsH}</div>`:'')+
    `</div>`;
  }).join(''):'<div class="tiny" style="text-align:center;padding:8px">今日暂无记录</div>';

  // 饼图
  const sortedEntries=Object.entries(s.catMap).sort((a,b)=>b[1]-a[1]);
  const pieColors=['#19c8b9','#6fba2c','#f5c31c','#e05a5a','#f0a870','#8ab8e0','#b77dee','#82d5bb'];
  const legendHtml=sortedEntries.map(([k,v],i)=>
    `<div class="bar"><div style="width:8px;height:8px;border-radius:2px;background:${pieColors[i%pieColors.length]};flex-shrink:0"></div><div style="width:80px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ac-text-2)">${esc(k)}</div><div class="bar-track"><div class="bar-fill" style="width:${s.total?Math.max(6,Math.round(v/s.total*100)):0}%;"></div></div><div class="small">${v}m</div></div>`
  ).join('');
  const pieSection=sortedEntries.length
    ?`<div style="display:flex;gap:12px;align-items:center;margin-top:8px"><canvas id="pomoPieChart" width="90" height="90" style="flex-shrink:0"></canvas><div style="flex:1;display:flex;flex-direction:column;gap:4px">${legendHtml}</div></div>`
    :'<div class="empty" style="font-size:12px">暂无计时记录</div>';

  el('summaryContent').innerHTML=
    (barEntries.length?`<div class="section-card"><strong style="font-size:12px">活动分类统计</strong><div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${barHtml}</div></div>`:'')
    +`<div class="section-card"><div class="row between" style="margin-bottom:6px"><strong style="font-size:12px">本日完成的活动</strong></div>`
    +`<div class="row" style="margin-bottom:6px"><input id="actInputRight" placeholder="添加活动记录..." style="font-size:12px;padding:7px 10px"/><button id="actAddRight" style="padding:7px 12px;font-size:12px;flex-shrink:0">添加</button></div>`
    +`<div id="actTagPickerRight" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px"></div>`
    +`<div style="width:100%;overflow:hidden">${actHtml}</div></div>`
    +(sortedEntries.length||s.activities.length>0?`<div class="section-card"><strong style="font-size:12px">番茄钟统计</strong><div class="tiny">${s.total}分钟，共${s.pomoCnt}个🍅</div>${pieSection}</div>`:'');

  // Bug1 fix: tag picker 用 DOM 构建，每次重建（不是 innerHTML 追加）
  requestAnimationFrame(()=>{
    // 画饼图
    const canvas=el('pomoPieChart');
    if(canvas&&sortedEntries.length){
      const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,cx=W/2,cy=H/2,r=Math.min(W,H)/2-4;
      ctx.clearRect(0,0,W,H);
      let start=0;
      sortedEntries.forEach(([k,v],i)=>{const sl=(v/s.total)*2*Math.PI;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,start,start+sl);ctx.closePath();ctx.fillStyle=pieColors[i%pieColors.length];ctx.fill();start+=sl;});
      ctx.beginPath();ctx.arc(cx,cy,r*.52,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();
      ctx.fillStyle='#334155';ctx.font=`bold ${Math.round(r*.22)}px Segoe UI`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`${s.total}m`,cx,cy);
    }
    // 活动输入+tag picker（每次重建，防重复绑定）
    const pickerBox=el('actTagPickerRight');
    const addBtn=el('actAddRight');
    const input=el('actInputRight');
    if(!pickerBox||!addBtn||!input)return;
    // 清空并重建 picker
    let pendingActTags=[];
    pickerBox.innerHTML='';
    state.activityTags.forEach(tag=>{
      const c=tagColor(tag,state.activityTags);
      const span=document.createElement('span'); span.className='tag-pill tag-pick';
      span.style.background=c.bg; span.style.color=c.text; span.textContent=tag;
      span.addEventListener('click',()=>{
        if(pendingActTags.includes(tag))pendingActTags.splice(pendingActTags.indexOf(tag),1); else pendingActTags.push(tag);
        // 只更新视觉，不重绘整个 summary
        pickerBox.querySelectorAll('.tag-pill').forEach(s_=>{
          const on=pendingActTags.includes(s_.textContent);
          const c2=tagColor(s_.textContent,state.activityTags);
          s_.style.background=on?c2.text:c2.bg; s_.style.color=on?'#fff':c2.text;
        });
      });
      pickerBox.appendChild(span);
    });
    // 绑定添加按钮（每次重建，不会重复绑定）
    const newAddBtn=addBtn.cloneNode(true); addBtn.parentNode.replaceChild(newAddBtn,addBtn);
    newAddBtn.onclick=async()=>{
      const text=input.value.trim(); if(!text)return;
      state.activityLog.unshift({id:crypto.randomUUID(),text,date:todayKey(),tags:[...pendingActTags]});
      input.value=''; pendingActTags=[]; pickerBox.querySelectorAll('.tag-pill').forEach(s_=>{const c2=tagColor(s_.textContent,state.activityTags);s_.style.background=c2.bg;s_.style.color=c2.text;});
      await save(); renderSummary();
    };
    input.addEventListener('keydown',e=>{if(e.key==='Enter')newAddBtn.click();});
  });
}

// ── 总量渲染 ─────────────────────────────────────────────────────────────────
async function renderAll() {
  renderStats();
  renderTaskStack();
  renderBucket('normal');
  renderBucket('urgent');
  renderRoutine();
  renderPomo();
  renderSummary();
}

// ── 范围按钮 ─────────────────────────────────────────────────────────────────
function bindRangeBtns() {
  qsa('.rangeBtn').forEach(btn=>btn.onclick=()=>{
    qsa('.rangeBtn').forEach(b=>{ b.classList.remove('active'); if(!b.classList.contains('ghost'))b.classList.add('ghost'); });
    btn.classList.add('active'); btn.classList.remove('ghost');
    currentRange=btn.dataset.range; renderSummary();
  });
}

// ── 初始化 ───────────────────────────────────────────────────────────────────
async function init() {
  state = safeState(await window.focusAPI.loadData());
  if(dailyReset()) await save();
  if(!pomoCategory && state.activityTags.length) pomoCategory=state.activityTags[0];
  applyLayout(); bindResizers();
  bindPomoEvents(); bindDelegated();
  bindTaskModal(); bindRoutineModal(); bindTagMgr(); bindRangeBtns();
  el('addTaskBtn').onclick=()=>openTaskModal();
  el('manageTagsBtn').onclick=()=>openTagMgr();
  el('addNormalBtn').onclick=()=>openTaskModal(null,'normal');
  el('addUrgentBtn').onclick=()=>openTaskModal(null,'urgent');
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      ['taskModal','routineModal','tagMgrModal'].forEach(id=>el(id).classList.remove('show'));
      if(focusMode)exitFocusMode();
    }
  });
  window.focusAPI.onDataUpdated(data=>{ state=safeState(data); renderAll(); });
  window.focusAPI.onNotifyEvent(()=>{});
  renderAll();
}
init();
