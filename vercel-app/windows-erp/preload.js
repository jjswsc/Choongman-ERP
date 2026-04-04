const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cmErpShell", {
  platform: "windows-electron-erp",
  getVersion: () => ipcRenderer.invoke("cm-erp-get-version"),
  checkForUpdates: () => ipcRenderer.invoke("cm-erp-check-updates"),
  listPrinters: () => ipcRenderer.invoke("cm-erp-list-printers"),
  getPrintConfig: () => ipcRenderer.invoke("cm-erp-get-print-config"),
  printWithDialog: () => ipcRenderer.invoke("cm-erp-print-dialog"),
  quickPrint: () => ipcRenderer.invoke("cm-erp-quick-print"),
});
