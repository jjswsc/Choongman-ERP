/**
 * 전체 HTML 문서 문자열을 숨김 iframe에 로드한 뒤 print() 호출.
 * 별도 브라우저 창/탭 없이 OS 인쇄 대화상자만 띄울 때 사용 (영수증·주방 주문서 등).
 */

export type PrintHtmlInHiddenIframeOptions = {
  /** iframe title (접근성) */
  title?: string
  /** document.write 직후 print()까지 지연 ms */
  printDelayMs?: number
  /** onafterprint 미발생 등 대비, 이 시간 후 iframe 제거 (기본 30000) */
  fallbackCleanupMs?: number
  /** contentWindow 를 얻지 못했을 때 */
  onPrintUnavailable?: () => void
  /** iframe 제거 시 최대 1회 (onafterprint / 오류 / fallback 타임아웃) */
  onAfterCleanup?: () => void
  /** print 다이얼로그/프린터 파이프라인 시작 감지 대기(ms). 초과 시 onPrintUnavailable 호출 */
  printStartTimeoutMs?: number
  /**
   * print() 직전 숨김 iframe contentWindow 에 focus() 할지.
   * 자동 인쇄에서는 false 로 두면 POS 화면 포커스가 덜 빼앗겨, 인쇄 창이 닫힌 뒤 전환이 덜 튀는 경우가 많음.
   * (일부 환경에서만 print() 에 focus 가 필요할 수 있어 기본은 true)
   */
  focusIframeBeforePrint?: boolean
  /**
   * 정리 후 인쇄 전에 활성화되어 있던 document.activeElement 로 포커스 복원.
   * 인쇄 대화상자 종료 뒤 키보드/포커스가 어색할 때 완화.
   */
  restoreDocumentFocus?: boolean
}

export function printHtmlInHiddenIframe(
  fullDocumentHtml: string,
  opts?: PrintHtmlInHiddenIframeOptions
): void {
  const printDelayMs = opts?.printDelayMs ?? 450
  const fallbackCleanupMs = opts?.fallbackCleanupMs ?? 30000
  const printStartTimeoutMs = opts?.printStartTimeoutMs ?? 1800
  const focusIframeBeforePrint = opts?.focusIframeBeforePrint !== false
  const restoreDocumentFocus = opts?.restoreDocumentFocus !== false
  const previousActive =
    restoreDocumentFocus && typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null

  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', opts?.title || 'Print')
  iframe.setAttribute('aria-hidden', 'true')
  /**
   * 일부 Chromium 환경에서 0x0 + visibility:hidden iframe 의 print() 호출이 무시되는 케이스가 있어
   * 1x1 투명 프레임을 화면 밖으로 보냅니다.
   */
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
  document.body.appendChild(iframe)
  const cw = iframe.contentWindow
  if (!cw) {
    iframe.remove()
    opts?.onPrintUnavailable?.()
    return
  }
  cw.document.open()
  cw.document.write(fullDocumentHtml)
  cw.document.close()

  let cleaned = false
  let printStarted = false
  const restoreFocusIfNeeded = () => {
    if (!restoreDocumentFocus || !previousActive) return
    const run = () => {
      try {
        if (typeof previousActive.focus === 'function') {
          previousActive.focus({ preventScroll: true })
        }
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(() => requestAnimationFrame(run))
  }
  const removeIframe = () => {
    if (cleaned) return
    cleaned = true
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
    restoreFocusIfNeeded()
    opts?.onAfterCleanup?.()
  }

  cw.onbeforeprint = () => {
    printStarted = true
  }
  cw.onafterprint = () => {
    printStarted = true
    removeIframe()
  }

  const startGuardTimer = setTimeout(() => {
    if (!printStarted) {
      opts?.onPrintUnavailable?.()
      removeIframe()
    }
  }, printDelayMs + printStartTimeoutMs)

  setTimeout(() => {
    try {
      if (focusIframeBeforePrint) {
        cw.focus()
      }
      cw.print()
      /** 일부 Chromium은 iframe print 시 beforeprint/afterprint 가 안 떠 가드가 오탐 → print() 직후 인쇄 시작으로 간주 */
      printStarted = true
      clearTimeout(startGuardTimer)
    } catch {
      clearTimeout(startGuardTimer)
      removeIframe()
      opts?.onPrintUnavailable?.()
    }
  }, printDelayMs)
  setTimeout(() => {
    clearTimeout(startGuardTimer)
    removeIframe()
  }, fallbackCleanupMs)
}
