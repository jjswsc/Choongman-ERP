export {}

declare global {
  interface Window {
    cmPosShell?: {
      platform: string
      getVersion?: () => Promise<string | null>
      checkForUpdates?: () => Promise<Record<string, unknown>>
      /** 키오스크·전체화면 해제 후 창 최대화 */
      exitKioskOrFullscreen?: () => Promise<{ ok: boolean; reason?: string }>
      minimizeWindow?: () => Promise<{ ok: boolean; reason?: string }>
      quitApp?: () => Promise<{ ok: boolean; reason?: string }>
      listPrinters?: () => Promise<Array<{ name: string; displayName: string; isDefault: boolean }>>
      getPrintConfig?: () => Promise<{ silent: boolean; deviceName: string | null } | null>
      printWithDialog?: () => Promise<Record<string, unknown>>
      quickPrint?: () => Promise<Record<string, unknown>>
      /** HTML 문서 전체 문자열 인쇄 (Electron에서 iframe.print 대체) */
      printHtml?: (html: string) => Promise<{ ok: boolean; reason?: string }>
      /** SW·Cache Storage 비우고 캐시 무시 새로고침 (로그인 유지). 확인 대화상자는 셸에서 표시 */
      resetCacheAndReload?: () => Promise<{
        ok: boolean
        reason?: string
        warnings?: string[]
      }>
      configureCustomerDisplay?: (params: {
        enabled: boolean
        autoOpen: boolean
        monitorPreference: 'secondary-first' | 'primary-only'
        storeCode?: string
      }) => Promise<{ ok: boolean; reason?: string }>
      openCustomerDisplayWindow?: () => Promise<{ ok: boolean; reason?: string }>
      closeCustomerDisplayWindow?: () => Promise<{ ok: boolean; reason?: string }>
      setCustomerDisplayState?: (payload: {
        storeCode: string
        kind: 'idle' | 'ordering' | 'payment' | 'qr'
        updatedAt: string
        title?: string
        message?: string
        qrPayload?: string
        items?: Array<{ name: string; qty: number; amount: number }>
        totalAmount?: number
        breakdown?: {
          subtotal: number
          discountAmt: number
          vatFeeAmt: number
          vatRate?: number
          vatMode?: "included" | "separate"
          serviceFeeAmt: number
          serviceRate?: number
          serviceMode?: "included" | "separate"
          cardFeeAmt: number
          cardRate?: number
          cardMode?: "included" | "separate"
          otherFeeAmt: number
          otherRate?: number
          otherMode?: "included" | "separate"
          total: number
        }
        showOrderSummary?: boolean
        showOrderTotal?: boolean
        idleMediaType?: "none" | "image" | "video"
        idleMediaUrl?: string
      }) => Promise<{ ok: boolean; reason?: string }>
      onCustomerDisplayState?: (
        handler: (payload: {
          storeCode: string
          kind: 'idle' | 'ordering' | 'payment' | 'qr'
          updatedAt: string
          title?: string
          message?: string
          qrPayload?: string
          items?: Array<{ name: string; qty: number; amount: number }>
          totalAmount?: number
          breakdown?: {
            subtotal: number
            discountAmt: number
            vatFeeAmt: number
            vatRate?: number
            vatMode?: "included" | "separate"
            serviceFeeAmt: number
            serviceRate?: number
            serviceMode?: "included" | "separate"
            cardFeeAmt: number
            cardRate?: number
            cardMode?: "included" | "separate"
            otherFeeAmt: number
            otherRate?: number
            otherMode?: "included" | "separate"
            total: number
          }
          showOrderSummary?: boolean
          showOrderTotal?: boolean
          idleMediaType?: "none" | "image" | "video"
          idleMediaUrl?: string
        }) => void
      ) => () => void
    }
  }
}
