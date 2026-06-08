export {}

declare global {
  interface Window {
    cmPosShell?: {
      platform: string
      /** offline.html 등 — preferFresh true면 no-cache(온라인일 때만), false면 SW·디스크 캐시 우선 */
      reloadPosUrl?: (opts?: { preferFresh?: boolean }) => Promise<{ ok: boolean; reason?: string }>
      /** Electron net.isOnline — Wi‑Fi/랜 연결 여부(서버 도달과 무관) */
      isSystemOnline?: () => Promise<boolean>
      getVersion?: () => Promise<string | null>
      checkForUpdates?: () => Promise<Record<string, unknown>>
      /** 키오스크·전체화면 해제 후 창 최대화 */
      exitKioskOrFullscreen?: () => Promise<{ ok: boolean; reason?: string }>
      minimizeWindow?: () => Promise<{ ok: boolean; reason?: string }>
      quitApp?: () => Promise<{ ok: boolean; reason?: string }>
      listPrinters?: () => Promise<Array<{ name: string; displayName: string; isDefault: boolean }>>
      printWithDialog?: () => Promise<Record<string, unknown>>
      quickPrint?: () => Promise<Record<string, unknown>>
      /** HTML 문서 전체 문자열 인쇄 (Electron에서 iframe.print 대체). preferDialog면 시스템 인쇄 대화상자만 */
      printHtml?: (
        html: string,
        opts?: {
          preferDialog?: boolean
          /** runtime-config print.receiptDeviceName vs kitchenNDeviceName */
          printRole?: 'receipt' | 'kitchen'
          /** printRole이 receipt일 때 홀 주문서 vs 결제 영수증(ESC/POS 절단 분기) */
          printReceiptKind?: 'hall_order' | 'payment'
          /** 매장 프린터 설정에서 온 절단 여부(우선) */
          escPosCutOverride?: boolean
          kitchenStation?: 1 | 2 | 3
        }
      ) => Promise<{
        ok: boolean
        reason?: string
        usedDevice?: string
        cutOk?: boolean
        cutReason?: string
      }>
      getPrintConfig?: () => Promise<{
        silent: boolean
        deviceName: string | null
        receiptDeviceName?: string | null
        kitchen1DeviceName?: string | null
        kitchen2DeviceName?: string | null
        kitchen3DeviceName?: string | null
        kitchenDeviceName?: string | null
      } | null>
      savePrintConfig?: (payload: {
        silent?: boolean
        deviceName?: string | null
        receiptDeviceName?: string | null
        kitchen1DeviceName?: string | null
        kitchen2DeviceName?: string | null
        kitchen3DeviceName?: string | null
        kitchenDeviceName?: string | null
      }) => Promise<{
        ok: boolean
        reason?: string
        config?: {
          silent: boolean
          deviceName: string | null
          receiptDeviceName?: string | null
          kitchen1DeviceName?: string | null
          kitchen2DeviceName?: string | null
          kitchen3DeviceName?: string | null
          kitchenDeviceName?: string | null
        } | null
      }>
      /**
       * Windows 하이브리드: 영수증용 프린터( runtime-config `print.receiptDeviceName` 등 )로 ESC/POS 드로어 킥.
       * 별도 `local-cash-drawer-bridge` 없이 동작.
       */
      openCashDrawer?: () => Promise<{ ok: boolean; reason?: string; usedDevice?: string }>
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
        qrType?: "THAI_QR" | "CREDIT_CARD"
        items?: Array<{ name: string; qty: number; amount: number }>
        totalAmount?: number
        breakdown?: {
          subtotal: number
          discountAmt: number
          vatFeeAmt: number
          receiptExclusiveSubtotalDisplay?: number
          receiptVatDisplayAmt?: number
          receiptTaxableGrossForDisplay?: number
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
          qrType?: "THAI_QR" | "CREDIT_CARD"
          items?: Array<{ name: string; qty: number; amount: number }>
          totalAmount?: number
          breakdown?: {
            subtotal: number
            discountAmt: number
            vatFeeAmt: number
            receiptExclusiveSubtotalDisplay?: number
            receiptVatDisplayAmt?: number
            receiptTaxableGrossForDisplay?: number
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
