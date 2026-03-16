const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,

  // Bridge control
  bridgeStart: () => ipcRenderer.invoke('bridge:start'),
  bridgeStop: () => ipcRenderer.invoke('bridge:stop'),
  bridgeStatus: () => ipcRenderer.invoke('bridge:status'),
  onBridgeStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('bridge:status', handler);
    return () => ipcRenderer.removeListener('bridge:status', handler);
  },
});
