import {
  printHtmlInHiddenIframe,
  type PrintHtmlInHiddenIframeOptions,
} from '@/lib/print-html-iframe'

/**
 * 주문 영수증(directPrint) 직후 주방전을 바로 호출하면, 일부 ESC/POS 드라이버가 스풀에서
 * 두 작업을 한 롤에 이어 붙임(Zywell Zy808 등). 영수증 파이프라인 정리 후 이 시간만큼
 * 지연한 뒤 주방전을 시작한다.
 */
export const POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS = 1800

export type PrintPosHtmlDocumentOptions = PrintHtmlInHiddenIframeOptions & {
  /**
   * Windows 하이브리드 셸: true면 무인쇄(열전사 최적화)를 건너뛰고 **시스템 인쇄 대화상자**만 띄움.
   * 자동 인쇄를 끈 뒤 수동으로 프린터를 고를 때 사용.
   */
  preferSystemPrintDialog?: boolean
}

/**
 * POS 영수증·주방전 등: Windows 하이브리드 셸이면 main 프로세스 인쇄(iframe.print 무시 대응),
 * 그 외(크롬 등 웹)는 기존 숨김 iframe 인쇄만 사용.
 */
export function printPosHtmlDocument(
  fullDocumentHtml: string,
  opts?: PrintPosHtmlDocumentOptions
): void {
  const win = typeof window !== 'undefined' ? window : undefined
  const shell =
    win &&
    (
      win as Window & {
        cmPosShell?: {
          platform?: string
          printHtml?: (
            h: string,
            o?: { preferDialog?: boolean }
          ) => Promise<{ ok?: boolean }>
        }
      }
    ).cmPosShell

  /** preload에 printHtml만 있으면 셸 인쇄 (플랫폼 문자열 누락·구버전 호환) */
  const useShell = typeof shell?.printHtml === 'function'
  const preferDialog = opts?.preferSystemPrintDialog === true

  if (useShell) {
    void shell
      .printHtml!(fullDocumentHtml, preferDialog ? { preferDialog: true } : undefined)
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
