/**
 * Preload — expõe API segura para o renderer (contextBridge).
 * Extensão .cjs garante CommonJS com "type": "module" no package.json.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectPdf: () => ipcRenderer.invoke("select-pdf"),
  compress: (inputPath, preset) => ipcRenderer.invoke("compress", { inputPath, preset }),
  onCompressProgress: (callback) => {
    ipcRenderer.on("compress-progress", (_event, percent) => callback(percent));
  },
  showItemInFolder: (filePath) => ipcRenderer.invoke("show-item-in-folder", filePath),
});
