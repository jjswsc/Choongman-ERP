/**
 * 전체 HTML 문서 문자열을 숨김 iframe에 로드한 뒤 print() 호출.
 * 별도 브라우저 창/탭 없이 OS 인쇄 대화상자만 띄울 때 사용 (영수증·주방 주문서 등).
 */

/** 80mm 용지 폭(CSS px @96dpi). 뷰포트를 1px로 두면 body(80mm)·CSS 그리드가 뷰포트와 불일치해 손님 영수증만 열이 갈라지는 Chromium 이슈가 있음 → windows-pos 숨김 창과 동일 폭 유지 */
const PRINT_IFRAME_VIEWPORT_WIDTH_PX = Math.round((80 / 25.4) * 96)
/** 세로 1px는 일부 레이아웃에서 비정상; 인쇄 전 레이아웃·폰트 안정용(화면 밖) */
const PRINT_IFRAME_VIEWPORT_HEIGHT_PX = 4096

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
  /** 너무 길면 브라우저 사용자 제스처가 만료되어 print()가 무시되는 경우가 있음 */
  const printDelayMs = opts?.printDelayMs ?? 0
  /** 인쇄 미리보기·대화상자를 오래 두는 매장 대비 */
  const fallbackCleanupMs = opts?.fallbackCleanupMs ?? 120000
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
   * 0×0 은 print() 무시 사례가 있어 비영(비 0) 크기 유지.
   * 폭은 80mm 열전사와 맞춰 그리드 영수증이 1px 뷰포트에서 깨지지 않게 함.
   */
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:' +
    String(PRINT_IFRAME_VIEWPORT_WIDTH_PX) +
    'px;height:' +
    String(PRINT_IFRAME_VIEWPORT_HEIGHT_PX) +
    'px;border:0;opacity:0;pointer-events:none'
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

  const invokePrint = () => {
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
  }

  if (printDelayMs > 0) {
    setTimeout(invokePrint, printDelayMs)
  } else {
    /**
     * Capacitor(안드로이드) WebView 등: 이중 rAF는 대기만 늘릴 뿐 안정성 이득이 작은 경우가 많아 1회로 줄임.
     * 데스크톱 Chromium은 기존처럼 2프레임 대기(레이아웃·폰트 안정).
     */
    const prePrintRafPasses =
      typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? 1 : 2
    const schedulePrePrint = (remaining: number) => {
      if (remaining <= 0) {
        invokePrint()
        return
      }
      requestAnimationFrame(() => schedulePrePrint(remaining - 1))
    }
    schedulePrePrint(prePrintRafPasses)
  }
  setTimeout(() => {
    clearTimeout(startGuardTimer)
    removeIframe()
  }, fallbackCleanupMs)
}
