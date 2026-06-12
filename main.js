const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(app.getPath('userData'), 'data');
const dataFile = path.join(dataDir, 'focus-data.json');
let mainWindow = null;
let focusWindow = null;
let tray = null;

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({
      tasks: [], activityLog: [],
      activityTags: ['工作','学习','生活','健康'],
      pomodoroCategories: ['深度工作','沟通协作','学习复盘'],
      pomodoroSessions: [], dailySummaries: {},
      routineTasks: [],
      ui: { panelSizes: [360, 1, 390] }
    }, null, 2), 'utf8');
  }
}
function loadData() { ensureDataFile(); return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
function saveData(payload) { ensureDataFile(); fs.writeFileSync(dataFile, JSON.stringify(payload, null, 2), 'utf8'); }
function broadcastData(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:updated', payload);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1180, minHeight: 760,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (!process.env.PLAYWRIGHT_UI_TEST) {
    mainWindow.on('close', (e) => {
      if (!app.isQuiting) { e.preventDefault(); mainWindow.hide(); }
    });
  }
}

// ── 专注窗口（独立于主窗口） ─────────────────────────────────────────────────
function createFocusWindow() {
  if (focusWindow && !focusWindow.isDestroyed()) {
    focusWindow.focus();
    return;
  }
  // 居中计算
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  focusWindow = new BrowserWindow({
    width: 400, height: 480,
    resizable: false,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    x: Math.round((sw - 400) / 2),
    y: Math.round((sh - 480) / 2),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  focusWindow.loadFile(path.join(__dirname, 'renderer', 'focus.html'));
  focusWindow.on('closed', () => {
    focusWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('focus:closed');
    }
  });
}

function createTray() {
  if (process.env.PLAYWRIGHT_UI_TEST) return;
  const png = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAZElEQVR42mP8//8/Azbw////RwYGBgYGBgYGrAxiYGAQY2BgYGD4T0VFRZkZGf8ZGRm5gYGB4T8DAwP/GRkZ/4mJiT8DA8P/GRgY/2NgYGD4TwMDA/+ZmZn/GRkZ/2dnZ2A0GQAA5P4QzC1v1i4AAAAASUVORK5CYII=');
  tray = new Tray(png);
  tray.setToolTip('FocusTodoDesktop 2.0');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuiting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => mainWindow && mainWindow.show());
}

app.whenReady().then(() => {
  ensureDataFile(); createMainWindow(); createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWindow) mainWindow.show();
  });
});
app.on('before-quit', () => { app.isQuiting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') {} });

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('data:load', async () => loadData());
ipcMain.handle('data:save', async (_, payload) => { saveData(payload); broadcastData(payload); return { ok: true }; });

ipcMain.handle('window:set-always-on-top', async (_, flag) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(!!flag, 'screen-saver');
  return { ok: true };
});
ipcMain.handle('window:maximize', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.maximize();
  return { ok: true };
});
ipcMain.handle('window:unmaximize', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.unmaximize();
  return { ok: true };
});
ipcMain.handle('notify', async (_, payload = {}) => {
  const title = payload.title || 'FocusTodoDesktop';
  const body = payload.body || '';
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('notify:event', { title, body });
  return { ok: true };
});

// ── 专注窗口 IPC ─────────────────────────────────────────────────────────────
ipcMain.handle('focus:open', async (_, state) => {
  createFocusWindow();
  // 等页面加载完再发初始状态
  if (focusWindow) {
    const sendInit = () => {
      focusWindow.webContents.send('focus:init', state);
    };
    if (focusWindow.webContents.isLoading()) {
      focusWindow.webContents.once('did-finish-load', sendInit);
    } else {
      sendInit();
    }
  }
  return { ok: true };
});

ipcMain.handle('focus:close', async () => {
  if (focusWindow && !focusWindow.isDestroyed()) focusWindow.close();
  return { ok: true };
});

ipcMain.handle('focus:state-update', async (_, state) => {
  if (focusWindow && !focusWindow.isDestroyed()) {
    focusWindow.webContents.send('focus:state-update', state);
  }
  return { ok: true };
});

// 专注窗口 → 主窗口的动作转发
ipcMain.handle('focus:action', async (_, action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('focus:action', action);
  }
  return { ok: true };
});

// 控制专注窗口置顶
ipcMain.handle('focus:set-top', async (_, flag) => {
  if (focusWindow && !focusWindow.isDestroyed()) {
    focusWindow.setAlwaysOnTop(!!flag, 'screen-saver');
  }
  return { ok: true };
});

ipcMain.handle('focus:get-data-path', async () => {
  return { dataDir, dataFile };
});