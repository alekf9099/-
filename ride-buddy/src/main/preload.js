// 렌더러에 최소한의 API만 노출 (contextIsolation)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rideBuddyAPI', {
  onNotify: cb => ipcRenderer.on('notify', (_e, n) => cb(n)),
  onConfig: cb => ipcRenderer.on('config', (_e, c) => cb(c)),
  onCommand: cb => ipcRenderer.on('command', (_e, c) => cb(c)),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setInteractive: on => ipcRenderer.send('set-interactive', !!on),
  openMenu: () => ipcRenderer.send('context-menu'),
});
