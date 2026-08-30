/** POS UI 언어 코드 — `lib/lang-context` LangCode 와 동일 집합 */
export type PosCustomerDisplayUiLang = "ko" | "en" | "th" | "mm" | "la" | "kh" | "vi" | "ms"

export type PosCustomerDisplayStateKind = "idle" | "ordering" | "payment" | "qr" | "change"

export type PosCustomerDisplayPayload = {
  storeCode: string
  kind: PosCustomerDisplayStateKind
  updatedAt: string
  /** POS 터미널에서 선택한 UI 언어(고객 창은 별도 세션이라 sessionStorage와 무관) */
  uiLang?: PosCustomerDisplayUiLang
  title?: string
  message?: string
  qrPayload?: string
  qrType?: "THAI_QR" | "CREDIT_CARD" | "CRYPTO"
  cryptoNetwork?: string
  cryptoAmount?: number
  cryptoAsset?: string
  /** 결제 모달에서 입력 중인 수단별 금액(고객 모니터 표시용) */
  paymentLines?: Array<{ label: string; amount: number }>
  /** 매장 영수증 로고 등 — 주문/결제 화면 상단 */
  brandLogoUrl?: string
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
  /** 평상시 배경 (터미널이 설정에서 로드해 브로드캐스트) */
  idleMediaType?: "none" | "image" | "video"
  idleMediaUrl?: string
  /** 결제 후 현금 거스름(고객 모니터 표시용) */
  changeAmountBaht?: number
}

const CHANNEL_NAME = "cm-pos-customer-display"
const STORAGE_PREFIX = "cm:pos:customer-display:"

function keyForStore(storeCode: string) {
  return `${STORAGE_PREFIX}${storeCode.trim()}`
}

export function readPosCustomerDisplayState(storeCode: string): PosCustomerDisplayPayload | null {
  if (typeof window === "undefined") return null
  const key = keyForStore(storeCode)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as PosCustomerDisplayPayload
  } catch {
    return null
  }
}

export function publishPosCustomerDisplayState(payload: PosCustomerDisplayPayload) {
  if (typeof window === "undefined") return
  const key = keyForStore(payload.storeCode)
  try {
    window.localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // ignore localStorage write errors
  }
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME)
    bc.postMessage(payload)
    bc.close()
  } catch {
    // BroadcastChannel unsupported -> storage event fallback only
  }
}

export function subscribePosCustomerDisplayState(
  storeCode: string,
  onChange: (payload: PosCustomerDisplayPayload) => void
) {
  if (typeof window === "undefined") return () => {}
  const key = keyForStore(storeCode)

  const onStorage = (e: StorageEvent) => {
    if (e.key !== key || !e.newValue) return
    try {
      const parsed = JSON.parse(e.newValue) as PosCustomerDisplayPayload
      onChange(parsed)
    } catch {
      // ignore invalid payload
    }
  }
  window.addEventListener("storage", onStorage)

  let bc: BroadcastChannel | null = null
  try {
    bc = new BroadcastChannel(CHANNEL_NAME)
    bc.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as PosCustomerDisplayPayload | null
      if (!data || data.storeCode !== storeCode) return
      onChange(data)
    }
  } catch {
    bc = null
  }

  return () => {
    window.removeEventListener("storage", onStorage)
    try {
      bc?.close()
    } catch {
      // ignore
    }
  }
}
