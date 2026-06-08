const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cmPosShell", {
  platform: "windows-electron",
  /** 메인 창이 offline.html 일 때 POS URL 을 다시 로드(다시 시도·캐시로 열기) */
  reloadPosUrl: (opts) => ipcRenderer.invoke("cm-pos-reload-pos-url", opts || {}),
  /** Electron net.isOnline() — offline.html에서「다시 시도」숨김 판단 */
  isSystemOnline: () => ipcRenderer.invoke("cm-pos-is-system-online"),
  getVersion: () => ipcRenderer.invoke("cm-pos-get-version"),
  checkForUpdates: () => ipcRenderer.invoke("cm-pos-check-updates"),
  exitKioskOrFullscreen: () => ipcRenderer.invoke("cm-pos-exit-kiosk"),
  minimizeWindow: () => ipcRenderer.invoke("cm-pos-minimize-window"),
  quitApp: () => ipcRenderer.invoke("cm-pos-quit-app"),
  listPrinters: () => ipcRenderer.invoke("cm-pos-list-printers"),
  getPrintConfig: () => ipcRenderer.invoke("cm-pos-get-print-config"),
  savePrintConfig: (payload) => ipcRenderer.invoke("cm-pos-save-print-config", payload || {}),
  /** 영수증 프린터( runtime-config `print.receiptDeviceName` 등과 동일 해석)로 ESC/POS 드로어 킥 */
  openCashDrawer: () => ipcRenderer.invoke("cm-pos-open-cash-drawer"),
  printWithDialog: () => ipcRenderer.invoke("cm-pos-print-dialog"),
  quickPrint: () => ipcRenderer.invoke("cm-pos-quick-print"),
  printHtml: (html, opts) => {
    const htmlLength = typeof html === "string" ? html.length : 0;
    ipcRenderer.send("cm-pos-shell-print-html-invoke", { htmlLength });
    const o = opts && typeof opts === "object" ? opts : {};
    return ipcRenderer.invoke("cm-pos-print-html", {
      html,
      preferDialog: Boolean(o.preferDialog),
      printRole: o.printRole === "kitchen" || o.printRole === "receipt" ? o.printRole : undefined,
      printReceiptKind:
        o.printReceiptKind === "hall_order" || o.printReceiptKind === "payment" ? o.printReceiptKind : undefined,
      escPosCutOverride: typeof o.escPosCutOverride === "boolean" ? o.escPosCutOverride : undefined,
      kitchenStation:
        o.kitchenStation === 1 || o.kitchenStation === 2 || o.kitchenStation === 3 ? o.kitchenStation : undefined,
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
