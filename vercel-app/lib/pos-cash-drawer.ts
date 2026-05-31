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

export function shouldWarnPosCashDrawerFailure(errorRaw: unknown): boolean {
  const error = String(errorRaw || '').trim()
  if (!error) return true
  if (error === 'pin_cancelled') return false
  if (error === 'store_required') return false
  return true
}

export function formatPosCashDrawerFailureMessage(
  t: (key: string) => string,
  errorRaw: unknown
): string {
  const tx = (key: string, fallback: string) => {
    const s = t(key)
    return !s || s === key ? fallback : s
  }
  const error = String(errorRaw || '').trim()
  if (!error) return tx('posDrawerOpenBridgeFail', '현금 서랍 열기에 실패했습니다.')
  if (error.startsWith('shell:')) {
    const shellReason = error.slice('shell:'.length)
    if (shellReason === 'forbidden') {
      return tx(
        'posDrawerOpenErrForbidden',
        'POS 앱 권한으로 돈통을 열 수 없습니다. 하이브리드 앱에서 다시 시도해 주세요.'
      )
    }
    if (shellReason === 'no_printer') {
      return tx(
        'posDrawerOpenErrNoPrinter',
        '영수증 프린터가 지정되지 않아 돈통을 열 수 없습니다. 프린터 점검에서 receiptDeviceName을 확인해 주세요.'
      )
    }
    if (shellReason === 'drawer_kick_failed') {
      return tx(
        'posDrawerOpenErrDrawerKickFailed',
        '프린터에는 연결되었지만 돈통 킥 명령이 실패했습니다. 프린터/돈통 케이블과 드라이버를 확인해 주세요.'
      )
    }
    if (shellReason === 'shell_exception') {
      return tx(
        'posDrawerOpenErrShellException',
        'POS 하이브리드 앱 내부 통신 오류로 돈통 열기에 실패했습니다. 앱을 재시작해 주세요.'
      )
    }
    return tx('posDrawerOpenBridgeFail', '현금 서랍 열기에 실패했습니다.')
  }
  if (error === 'all_local_bridge_endpoints_failed') {
    return tx(
      'posDrawerOpenErrAllLocalBridgeFailed',
      '로컬 브리지 연결에 실패했습니다. POS 브릿지 서비스 실행 상태를 확인해 주세요.'
    )
  }
  if (error === 'bridge_response_failed') {
    return tx(
      'posDrawerOpenErrBridgeResponseFailed',
      '브리지 응답은 왔지만 성공으로 확인되지 않았습니다. 브리지 로그를 확인해 주세요.'
    )
  }
  return tx('posDrawerOpenBridgeFail', '현금 서랍 열기에 실패했습니다.')
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

  let shellFailReason = ''
  if (typeof window !== 'undefined') {
    const shell = window.cmPosShell
    if (typeof shell?.openCashDrawer === 'function') {
      try {
        const r = await shell.openCashDrawer()
        if (r && r.ok) {
          return { success: true, endpoint: 'cm-pos-shell' }
        }
        shellFailReason = String(r?.reason || '').trim()
        // no_printer 등: 로컬 브리지(별도 키트) 폴백
      } catch {
        shellFailReason = 'shell_exception'
        // 로컬 HTTP 폴백
      }
    }
  }

  for (const endpoint of LOCAL_DRAWER_ENDPOINTS) {
    const r = await postJsonWithTimeout(endpoint, payload)
    if (r.ok) return { success: true, endpoint }
  }
  if (shellFailReason) {
    return { success: false, error: `shell:${shellFailReason}` }
  }
  return { success: false, error: 'all_local_bridge_endpoints_failed' }
}
