/**
 * 인보이스/세금계산서 인쇄 창.
 * 클릭 직후 창을 예약하지 않고 API 이후에 window.open 하면
 * 브라우저가 팝업을 막아 보통 4~5건 이후부터 실패한다.
 */

export const INVOICE_PRINT_STORAGE_KEY = 'invoice-print-data'
export const INVOICE_PRINT_TRANSFER_KEY = 'invoice-print-data-transfer'
export const INVOICE_PRINT_PATH = '/admin/invoice-print'
export const INVOICE_PRINT_PREPARING_HREF = `${INVOICE_PRINT_PATH}?preparing=1`

export type InvoicePrintCommitResult = 'ok' | 'closed' | 'storage'

function isInvoicePrintRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const d = value as Record<string, unknown>
  return 'documentNo' in d && 'seller' in d && 'client' in d && Array.isArray(d.items)
}

export function parseInvoicePrintDatas(raw: string | null | undefined): Record<string, unknown>[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr.filter(isInvoicePrintRecord)
  } catch {
    return []
  }
}

export function isInvoicePrintPreparingSearch(search: string | null | undefined): boolean {
  if (!search) return false
  try {
    const q = search.startsWith('?') ? search.slice(1) : search
    return new URLSearchParams(q).get('preparing') === '1'
  } catch {
    return false
  }
}

export function writeInvoicePrintPayload(datas: unknown[]): boolean {
  if (typeof window === 'undefined') return false
  const payload = JSON.stringify(datas)
  try {
    sessionStorage.setItem(INVOICE_PRINT_STORAGE_KEY, payload)
  } catch {
    return false
  }
  try {
    localStorage.setItem(INVOICE_PRINT_TRANSFER_KEY, payload)
  } catch {
    // sessionStorage만으로도 같은 탭 이동은 가능
  }
  return true
}

/** 인쇄 페이지: localStorage 전달분을 우선하고 즉시 지운다. */
export function readInvoicePrintStorageRaw(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const transfer = localStorage.getItem(INVOICE_PRINT_TRANSFER_KEY)
    if (transfer) {
      try {
        localStorage.removeItem(INVOICE_PRINT_TRANSFER_KEY)
      } catch {
        // ignore
      }
      try {
        sessionStorage.setItem(INVOICE_PRINT_STORAGE_KEY, transfer)
      } catch {
        // ignore
      }
      return transfer
    }
  } catch {
    // ignore
  }
  try {
    return sessionStorage.getItem(INVOICE_PRINT_STORAGE_KEY)
  } catch {
    return null
  }
}

/** 클릭 핸들러에서 await 전에 호출. 사용자 제스처로 탭 1개만 연다. */
export function reserveInvoicePrintWindow(): Window | null {
  if (typeof window === 'undefined') return null
  try {
    const w = window.open(INVOICE_PRINT_PREPARING_HREF, '_blank')
    return w && !w.closed ? w : null
  } catch {
    return null
  }
}

export function closeReservedInvoicePrintWindow(printWindow: Window | null | undefined): void {
  if (!printWindow) return
  try {
    if (!printWindow.closed) printWindow.close()
  } catch {
    // ignore
  }
}

export function commitReservedInvoicePrintWindow(
  printWindow: Window,
  datas: unknown[]
): InvoicePrintCommitResult {
  try {
    if (printWindow.closed) return 'closed'
  } catch {
    return 'closed'
  }
  if (!writeInvoicePrintPayload(datas)) return 'storage'
  try {
    printWindow.sessionStorage.setItem(INVOICE_PRINT_STORAGE_KEY, JSON.stringify(datas))
  } catch {
    // 로딩 중·about:blank 이면 localStorage 전달으로 충분
  }
  try {
    printWindow.location.replace(INVOICE_PRINT_PATH)
    printWindow.focus()
  } catch {
    return 'closed'
  }
  return 'ok'
}
