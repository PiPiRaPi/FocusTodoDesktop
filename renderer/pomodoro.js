// ─── 状态 ──────────────────────────────────────────────────────────────────────
let state = null;
let timer = null;
// phase: 'focus' | 'overtime' | 'break'
let phase = 'focus';
let remaining = 25 * 60;
let running = false;
let currentCategory = '';
let currentTaskId = null;
let duration = 25 * 60;
let overtimeSeconds = 0;
let dragging = false;
let lastMouse = { x: 0, y: 0 };
let _startNowPending = null; // B2: 缓存 startNow payload，等 init 完成后再执行

const el = id => document.getElementById(id);
function todayKey() {
  const now = new Date();
  // 凌晨 4:00 UTC+8 为分界
  const shifted = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function safeState(data) {
  const base = Object.assign({
    tasks: [], activityLog: [],
    activityTags: ['工作', '学习', '生活', '健康'],
    pomodoroCategories: ['深度工作', '沟通协作', '复盘总结'],
    pomodoroSessions: [],
    routineTasks: [],
  }, data || {});
  if (!base.activityTags) base.activityTags = [];
  return base;
}

// ─── 铃声 ────────────────────────────────────────────────────────────────────
function playSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 1.1);
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch (e) {}
}

// ─── UI ──────────────────────────────────────────────────────────────────────
function updateTimerColor() {
  const t = el('timer');
  const f = el('fill');
  if (phase === 'overtime') {
    t.style.color = '#f59e0b';
    f.className = 'fill overtime';
  } else if (phase === 'break') {
    t.style.color = '#22c55e';
    f.className = 'fill rest';
  } else {
    t.style.color = '#fff';
    f.className = 'fill';
  }
}

function format() {
  if (phase === 'overtime') {
    const m = String(Math.floor(overtimeSeconds / 60)).padStart(2, '0');
    const s = String(overtimeSeconds % 60).padStart(2, '0');
    el('timer').textContent = `+${m}:${s}`;
    el('fill').style.width = '100%';
  } else {
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    el('timer').textContent = `${m}:${s}`;
    el('fill').style.width = `${Math.max(0, Math.min(100, ((duration - remaining) / duration) * 100))}%`;
  }
  updateTimerColor();
}

async function save() { await window.focusAPI.saveData(state); }

// F1: 使用统一的 activityTags 作为计时分类来源
function syncCategories() {
  const sel = el('category');
  const old = currentCategory || sel.value;
  sel.innerHTML = '';
  // 优先用 activityTags；如果为空则 fallback 到 pomodoroCategories
  const tags = (state.activityTags && state.activityTags.length)
    ? state.activityTags
    : state.pomodoroCategories;
  tags.forEach(c => {
    const op = document.createElement('option');
    op.value = c; op.textContent = c; sel.appendChild(op);
  });
  const validVal = tags.includes(old) ? old : tags[0] || '';
  sel.value = validVal;
  currentCategory = validVal;
}

// B3: 显示所有未完成任务（不只限当日），并确保当前绑定任务在列表中
function syncTaskSelect() {
  const sel = el('taskSelect');
  const old = currentTaskId || sel.value;
  sel.innerHTML = '<option value="">-- 不绑定任务 --</option>';
  // 显示所有未完成任务（不过滤日期，避免 B3 bug）
  const available = state.tasks.filter(t => !t.done);
  available.forEach(t => {
    const op = document.createElement('option');
    op.value = t.id;
    op.textContent = t.title;
    sel.appendChild(op);
  });
  // 如果 old 不在列表里也加进去（completed task 绑定的情况）
  if (old && !available.find(t => t.id === old)) {
    const t = state.tasks.find(x => x.id === old);
    if (t) {
      const op = document.createElement('option');
      op.value = t.id; op.textContent = '✅ ' + t.title; sel.appendChild(op);
    }
  }
  sel.value = (old && [...sel.options].some(o => o.value === old)) ? old : '';
  currentTaskId = sel.value || null;
}

function renderCatList() {
  const box = el('catList'); box.innerHTML = '';
  // 显示 activityTags 作为分类来源（只读提示，编辑入口在主窗口）
  const tags = (state.activityTags && state.activityTags.length)
    ? state.activityTags
    : state.pomodoroCategories;
  tags.forEach((c, idx) => {
    const div = document.createElement('div'); div.className = 'cat-item';
    div.innerHTML = `<span>${c}</span>`;
    box.appendChild(div);
  });
  // 提示
  const tip = document.createElement('div');
  tip.style.cssText = 'font-size:11px;color:#94a3b8;margin-top:8px';
  tip.textContent = '分类在主窗口「管理 Tag」中统一编辑';
  box.appendChild(tip);
}

// ─── 完成按钮可见性 ──────────────────────────────────────────────────────────
function updateFinishBtn() {
  el('finishBtn').classList.toggle('show', phase === 'overtime');
}

// ─── 番茄钟核心逻辑 ─────────────────────────────────────────────────────────
function enterOvertime() {
  phase = 'overtime';
  overtimeSeconds = 0;
  playSound();
  window.focusAPI.notify({ title: '番茄钟 25 分钟结束', body: '进入加时，手动点击完成结束专注' });
  el('phase').textContent = '⏱ 加时中，点击完成结束专注';
  updateFinishBtn();
  format();
  if (timer) clearInterval(timer);
  timer = setInterval(() => { overtimeSeconds++; format(); }, 1000);
}

async function finishFocus() {
  clearInterval(timer); timer = null;
  state.pomodoroSessions.push({
    id: crypto.randomUUID(), date: todayKey(),
    category: currentCategory, minutes: 25, phase: 'focus',
    overtimeSeconds: overtimeSeconds,
  });
  // 更新绑定任务的番茄数
  let updated = false;
  if (currentTaskId) {
    const t = state.tasks.find(x => x.id === currentTaskId);
    if (t) { t.completedPomodoros = (t.completedPomodoros || 0) + 1; t.updatedAt = todayKey(); updated = true; }
  }
  if (!updated) {
    const active = state.tasks.find(t => !t.done && t.selectedForExecution);
    if (active) { active.completedPomodoros = (active.completedPomodoros || 0) + 1; active.updatedAt = todayKey(); }
  }
  await save();
  // 进入休息
  phase = 'break'; duration = 5 * 60; remaining = 5 * 60; overtimeSeconds = 0;
  el('phase').textContent = '休息 5 分钟';
  updateFinishBtn(); format();
  running = true; run();
}

function run() {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    remaining--;
    format();
    if (remaining <= 0) {
      clearInterval(timer); timer = null;
      if (phase === 'focus') {
        enterOvertime();
      } else {
        playSound();
        window.focusAPI.notify({ title: '休息结束', body: '可以开始下一轮专注了' });
        phase = 'focus'; duration = 25 * 60; remaining = 25 * 60;
        running = false;
        el('phase').textContent = '休息结束，手动开启下一次专注';
        updateFinishBtn(); format();
      }
    }
  }, 1000);
}

// ─── 拖拽 ────────────────────────────────────────────────────────────────────
function bindDrag() {
  document.querySelector('.top').addEventListener('mousedown', e => {
    dragging = true; lastMouse = { x: e.screenX, y: e.screenY };
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.screenX - lastMouse.x, dy = e.screenY - lastMouse.y;
    lastMouse = { x: e.screenX, y: e.screenY };
    window.focusAPI.dragPomodoro({ dx, dy });
  });
  window.addEventListener('mouseup', () => dragging = false);
}

// B2: startNow 等 init 完成后才执行，避免 state 未加载时卡住
async function startNow(payload = {}) {
  if (!state) { _startNowPending = payload; return; }
  if (payload.taskId) currentTaskId = payload.taskId;
  // B1: 绑定任务时，自动把分类切换为任务的第一个 tag
  if (payload.taskId) {
    const t = state.tasks.find(x => x.id === payload.taskId);
    if (t && t.tags && t.tags.length) {
      payload.category = t.tags[0];
    }
  }
  if (payload.category) {
    const tags = (state.activityTags && state.activityTags.length)
      ? state.activityTags : state.pomodoroCategories;
    currentCategory = tags.includes(payload.category) ? payload.category : (tags[0] || payload.category);
  }

  // 同步 UI 选择器
  syncCategories();
  syncTaskSelect();

  const catSel = el('category');
  if ([...catSel.options].some(x => x.value === currentCategory)) catSel.value = currentCategory;
  const taskSel = el('taskSelect');
  if (currentTaskId && [...taskSel.options].some(x => x.value === currentTaskId)) taskSel.value = currentTaskId;

  // B2: 重置并开始（而不是在 running 时直接 return）
  clearInterval(timer); timer = null;
  phase = 'focus'; duration = 25 * 60; remaining = 25 * 60; overtimeSeconds = 0;
  updateFinishBtn(); format();
  running = true;
  el('phase').textContent = '专注中 25 分钟';
  run();
}

// ─── 分类编辑区 ──────────────────────────────────────────────────────────────
function bindCatEditor() {
  el('editCatBtn').onclick = () => {
    el('catEditor').classList.toggle('show');
    renderCatList();
  };
}

// ─── 初始化 ────────────────────────────────────────────────────────────────────
async function init() {
  state = safeState(await window.focusAPI.loadData());
  syncCategories(); syncTaskSelect(); format(); updateFinishBtn();
  bindDrag(); bindCatEditor();

  el('category').onchange   = e => { currentCategory = e.target.value; };
  // 需求1: 手动切换绑定任务时，自动同步计时分类为任务的第一个 tag
  el('taskSelect').onchange = e => {
    currentTaskId = e.target.value || null;
    if (currentTaskId) {
      const t = state.tasks.find(x => x.id === currentTaskId);
      if (t && t.tags && t.tags.length) {
        const tags = (state.activityTags && state.activityTags.length)
          ? state.activityTags : state.pomodoroCategories;
        const cat = tags.includes(t.tags[0]) ? t.tags[0] : tags[0];
        if (cat) { currentCategory = cat; el('category').value = cat; }
      }
    }
  };

  el('startBtn').onclick = () => {
    if (running) return;
    running = true;
    if (phase === 'focus') el('phase').textContent = '专注中 25 分钟';
    else if (phase === 'break') el('phase').textContent = '休息中 5 分钟';
    run();
  };
  el('pauseBtn').onclick = () => {
    if (!running && phase !== 'overtime') return;
    running = false; clearInterval(timer); timer = null;
    el('phase').textContent = phase === 'overtime' ? '加时已暂停' : '已暂停';
  };
  el('nextBtn').onclick = () => {
    clearInterval(timer); timer = null;
    phase = 'focus'; duration = 25 * 60; remaining = 25 * 60; overtimeSeconds = 0;
    running = false; el('phase').textContent = '准备开始 25 分钟专注';
    updateFinishBtn(); format();
  };
  el('finishBtn').onclick = () => finishFocus();
  el('minBtn').onclick   = () => window.focusAPI.minimizePomodoro();
  el('closeBtn').onclick = () => window.focusAPI.closePomodoro();

  window.focusAPI.onDataUpdated(data => {
    state = safeState(data);
    syncCategories();
    syncTaskSelect();
  });

  // B2: 注册 startNow 回调；如有缓存的 pending payload 立即执行
  window.focusAPI.onPomodoroStartNow(payload => startNow(payload || {}));
  if (_startNowPending) { const p = _startNowPending; _startNowPending = null; startNow(p); }

  window.focusAPI.onNotifyEvent(() => playSound());
}
init();
