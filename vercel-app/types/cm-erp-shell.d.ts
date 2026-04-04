export {}

declare global {
  interface Window {
    cmErpShell?: {
      platform: string
      getVersion?: () => Promise<string | null>
      checkForUpdates?: () => Promise<Record<string, unknown>>
      listPrinters?: () => Promise<Array<{ name: string; displayName: string; isDefault: boolean }>>
      getPrintConfig?: () => Promise<{ silent: boolean; deviceName: string | null } | null>
      printWithDialog?: () => Promise<Record<string, unknown>>
      quickPrint?: () => Promise<Record<string, unknown>>
    }
  }
}
