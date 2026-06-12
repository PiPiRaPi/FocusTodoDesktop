const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('focusAPI', {
  loadData:       () => ipcRenderer.invoke('data:load'),
  saveData:       (payload) => ipcRenderer.invoke('data:save', payload),
  notify:         (payload) => ipcRenderer.invoke('notify', payload),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:set-always-on-top', flag),
  maximize:       () => ipcRenderer.invoke('window:maximize'),
  unmaximize:     () => ipcRenderer.invoke('window:unmaximize'),
  onDataUpdated:  (cb) => ipcRenderer.on('data:updated', (_, d) => cb(d)),
  onNotifyEvent:  (cb) => ipcRenderer.on('notify:event', (_, d) => cb(d)),

  // ── 专注窗口 ────────────────────────────────────────────────────────────
  openFocusWindow: (state) => ipcRenderer.invoke('focus:open', state),
  closeFocusWindow: ()     => ipcRenderer.invoke('focus:close'),
  syncFocusState:  (state) => ipcRenderer.invoke('focus:state-update', state),
  focusSetTop:     (flag)  => ipcRenderer.invoke('focus:set-top', flag),
  onFocusAction:   (cb)    => ipcRenderer.on('focus:action', (_, a) => cb(a)),
  onFocusClosed:   (cb)    => ipcRenderer.on('focus:closed', () => cb()),
  sendFocusAction: (act)   => ipcRenderer.invoke('focus:action', act),
  onFocusInit:     (cb)    => ipcRenderer.on('focus:init', (_, s) => cb(s)),
  onFocusStateUpdate: (cb) => ipcRenderer.on('focus:state-update', (_, s) => cb(s)),
  getDataPath:     ()      => ipcRenderer.invoke('focus:get-data-path'),
});