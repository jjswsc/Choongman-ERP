const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cmPosShell", {
  platform: "windows-electron",
  getVersion: () => ipcRenderer.invoke("cm-pos-get-version"),
  checkForUpdates: () => ipcRenderer.invoke("cm-pos-check-updates"),
  exitKioskOrFullscreen: () => ipcRenderer.invoke("cm-pos-exit-kiosk"),
  minimizeWindow: () => ipcRenderer.invoke("cm-pos-minimize-window"),
  quitApp: () => ipcRenderer.invoke("cm-pos-quit-app"),
  listPrinters: () => ipcRenderer.invoke("cm-pos-list-printers"),
  getPrintConfig: () => ipcRenderer.invoke("cm-pos-get-print-config"),
  printWithDialog: () => ipcRenderer.invoke("cm-pos-print-dialog"),
  quickPrint: () => ipcRenderer.invoke("cm-pos-quick-print"),
  printHtml: (html, opts) => {
    const htmlLength = typeof html === "string" ? html.length : 0;
    ipcRenderer.send("cm-pos-shell-print-html-invoke", { htmlLength });
    return ipcRenderer.invoke("cm-pos-print-html", {
      html,
      preferDialog: Boolean(opts && opts.preferDialog),
    });
  },
  /** App 메뉴의 Reset cache + reload 와 동일(확인 대화상자는 메인 프로세스) */
  resetCacheAndReload: () => ipcRenderer.invoke("cm-pos-reset-cache-reload"),
  configureCustomerDisplay: (params) => ipcRenderer.invoke("cm-pos-customer-display-configure", params || {}),
  openCustomerDisplayWindow: () => ipcRenderer.invoke("cm-pos-customer-display-open"),
  closeCustomerDisplayWindow: () => ipcRenderer.invoke("cm-pos-customer-display-close"),
  setCustomerDisplayState: (payload) => ipcRenderer.invoke("cm-pos-customer-display-state", payload || {}),
  onCustomerDisplayState: (handler) => {
    if (typeof handler !== "function") return () => {};
    const channel = "cm-pos-customer-display-state"
    const listener = (_event, payload) => {
      try {
        handler(payload)
      } catch {
        // ignore handler errors
      }
    }
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
});
