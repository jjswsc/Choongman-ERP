import {
  printHtmlInHiddenIframe,
  type PrintHtmlInHiddenIframeOptions,
} from '@/lib/print-html-iframe'

/**
 * POS 영수증·주방전 등: Windows 하이브리드 셸이면 main 프로세스 인쇄(iframe.print 무시 대응),
 * 그 외(크롬 등 웹)는 기존 숨김 iframe 인쇄만 사용.
 */
export function printPosHtmlDocument(
  fullDocumentHtml: string,
  opts?: PrintHtmlInHiddenIframeOptions
): void {
  const win = typeof window !== 'undefined' ? window : undefined
  const shell =
    win &&
    (
      win as Window & {
        cmPosShell?: {
          platform?: string
          printHtml?: (h: string) => Promise<{ ok?: boolean }>
        }
      }
    ).cmPosShell

  /** preload에 printHtml만 있으면 셸 인쇄 (플랫폼 문자열 누락·구버전 호환) */
  const useShell = typeof shell?.printHtml === 'function'

  if (useShell) {
    void shell
      .printHtml!(fullDocumentHtml)
      .then((r) => {
        if (r?.ok) {
          opts?.onAfterCleanup?.()
          return
        }
        printHtmlInHiddenIframe(fullDocumentHtml, opts)
      })
      .catch(() => {
        printHtmlInHiddenIframe(fullDocumentHtml, opts)
      })
    return
  }

  printHtmlInHiddenIframe(fullDocumentHtml, opts)
}
