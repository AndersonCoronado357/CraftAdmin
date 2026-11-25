// Puente seguro entre la interfaz y el proceso principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posada', {
  call: async (method, ...args) => {
    const r = await ipcRenderer.invoke('posada:call', method, args);
    if (r && r.error) throw new Error(r.error);
    return r ? r.value : undefined;
  },
  on: (fn) => {
    const handler = (_e, msg) => fn(msg);
    ipcRenderer.on('posada:event', handler);
    return () => ipcRenderer.removeListener('posada:event', handler);
  },
});
