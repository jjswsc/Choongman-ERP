export type PosCashDrawerOpenSource =
  | 'payment_auto'
  | 'manual'
  /** 시재 관리 — 입금 등록 시(시제 입금 버튼) */
  | 'till_deposit'
  /** 영업 시작 — 오픈 시제 저장 시 */
  | 'business_open_save'
  /** POS 홈 — 영업 시작 메뉴로 진입 시 */
  | 'business_open_nav'
  /** POS 홈 — 영업 마감 메뉴로 진입 시 */
  | 'business_close_nav'

export type PosCashDrawerOpenParams = {
  reason: string
  source: PosCashDrawerOpenSource
  storeCode: string
  userName?: string
  drawerOpenOption?: 'password_and_reason' | 'reason_only' | 'force'
}

export type PosCashDrawerOpenResult = {
  success: boolean
  endpoint?: string
  error?: string
}

export function drawerOpenOptionFromPrinterSettings(
  settings: { drawerOpenOption?: string } | null | undefined
): 'password_and_reason' | 'reason_only' | 'force' {
  const o = settings?.drawerOpenOption
  if (o === 'password_and_reason' || o === 'reason_only' || o === 'force') return o
  return 'reason_only'
}

const LOCAL_DRAWER_ENDPOINTS = [
  'http://127.0.0.1:18181/pos/cash-drawer/open',
  'http://localhost:18181/pos/cash-drawer/open',
  'http://127.0.0.1:18181/open-cash-drawer',
  'http://localhost:18181/open-cash-drawer',
  'http://127.0.0.1:17888/pos/cash-drawer/open',
  'http://localhost:17888/pos/cash-drawer/open',
]

async function postJsonWithTimeout(url: string, body: Record<string, unknown>, timeoutMs = 1200) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      // allow non-json success
    }
    const success =
      data == null
        ? true
        : typeof data === 'object' && data != null && 'success' in data
          ? Boolean((data as { success?: unknown }).success)
          : true
    return success ? { ok: true } : { ok: false, error: 'bridge_response_failed' }
  } catch (e) {
    return { ok: false, error: String(e) }
  } finally {
    clearTimeout(timer)
  }
}

export async function openPosCashDrawer(
  params: PosCashDrawerOpenParams
): Promise<PosCashDrawerOpenResult> {
  const payload = {
    reason: String(params.reason || '').trim() || 'drawer_open',
    source: params.source,
    storeCode: String(params.storeCode || '').trim(),
    userName: String(params.userName || '').trim(),
    drawerOpenOption: params.drawerOpenOption || 'reason_only',
    at: new Date().toISOString(),
  }

  if (typeof window !== 'undefined') {
    const shell = window.cmPosShell
    if (typeof shell?.openCashDrawer === 'function') {
      try {
        const r = await shell.openCashDrawer()
        if (r && r.ok) {
          return { success: true, endpoint: 'cm-pos-shell' }
        }
        // no_printer 등: 로컬 브리지(별도 키트) 폴백
      } catch {
        // 로컬 HTTP 폴백
      }
    }
  }

  for (const endpoint of LOCAL_DRAWER_ENDPOINTS) {
    const r = await postJsonWithTimeout(endpoint, payload)
    if (r.ok) return { success: true, endpoint }
  }
  return { success: false, error: 'all_local_bridge_endpoints_failed' }
}
