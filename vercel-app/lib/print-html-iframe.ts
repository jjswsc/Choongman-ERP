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
}

export function printHtmlInHiddenIframe(
  fullDocumentHtml: string,
  opts?: PrintHtmlInHiddenIframeOptions
): void {
  const printDelayMs = opts?.printDelayMs ?? 450
  const fallbackCleanupMs = opts?.fallbackCleanupMs ?? 30000

  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', opts?.title || 'Print')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none;visibility:hidden'
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
  const removeIframe = () => {
    if (cleaned) return
    cleaned = true
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
    opts?.onAfterCleanup?.()
  }

  cw.onafterprint = removeIframe
  setTimeout(() => {
    try {
      cw.focus()
      cw.print()
    } catch {
      removeIframe()
    }
  }, printDelayMs)
  setTimeout(removeIframe, fallbackCleanupMs)
}
