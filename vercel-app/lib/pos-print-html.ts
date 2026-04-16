import {
  printHtmlInHiddenIframe,
  type PrintHtmlInHiddenIframeOptions,
} from '@/lib/print-html-iframe'
import { appAlert } from '@/lib/app-message'
import { getClientUiLang, getUiString } from '@/lib/i18n'

/**
 * 주문 영수증(directPrint) 직후 주방전을 바로 호출하면, 일부 ESC/POS 드라이버가 스풀에서
 * 두 작업을 한 롤에 이어 붙임(Zywell Zy808 등). 영수증 파이프라인 정리 후 이 시간만큼
 * 지연한 뒤 주방전을 시작한다.
 */
export const POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS = 4000

/**
 * 주방전이 여러 장일 때 장·장 사이 간격(동일 드라이버 스풀 합침 완화).
 */
export const POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS = 1200

/**
 * 주방 자동 인쇄 직후 고객용 영수증 자동 인쇄 전(모달 경로). 주방 컷·스풀 안정화.
 */
export const POS_THERMAL_AFTER_KITCHEN_TO_RECEIPT_MS = 1000

/** 하이브리드 셸: Windows `runtime-config.json`의 receipt vs kitchen1~3 프린터로 분기 */
export type PosPrintTargetRole = 'receipt' | 'kitchen'

export type PrintPosHtmlDocumentOptions = PrintHtmlInHiddenIframeOptions & {
  /**
   * Windows 하이브리드 셸: true면 무인쇄(열전사 최적화)를 건너뛰고 **시스템 인쇄 대화상자**만 띄움.
   * 자동 인쇄를 끈 뒤 수동으로 프린터를 고를 때 사용.
   */
  preferSystemPrintDialog?: boolean
  /** Windows 하이브리드: 영수증 vs 주방 무인쇄 대상 프린터 (runtime-config `print.*DeviceName`) */
  printRole?: PosPrintTargetRole
  /** 주방 슬립이 주방 1·2·3 중 어디로 갈지 — `printRole: 'kitchen'`일 때만 사용 */
  kitchenStation?: 1 | 2 | 3
  /** 하이브리드 무인쇄 실패 시 알림 생략 */
  suppressPrintError?: boolean
  /** 인쇄 성공 후 ESC/POS 절단만 실패했을 때 알림 (기본 true) */
  alertOnCutFailure?: boolean
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
            o?: {
              preferDialog?: boolean
              printRole?: PosPrintTargetRole
              kitchenStation?: number
            }
          ) => Promise<{
            ok?: boolean
            reason?: string
            cutOk?: boolean
            cutReason?: string
          }>
        }
      }
    ).cmPosShell

  /** preload에 printHtml만 있으면 셸 인쇄 (플랫폼 문자열 누락·구버전 호환) */
  const useShell = typeof shell?.printHtml === 'function'
  const preferDialog = opts?.preferSystemPrintDialog === true
  const shellOpts =
    preferDialog || opts?.printRole || opts?.kitchenStation != null
      ? {
          preferDialog,
          ...(opts?.printRole ? { printRole: opts.printRole } : {}),
          ...(opts?.kitchenStation != null ? { kitchenStation: opts.kitchenStation } : {}),
        }
      : undefined

  if (useShell) {
    const uiLang = getClientUiLang()
    void shell
      .printHtml!(fullDocumentHtml, shellOpts)
      .then((r) => {
        const ok = Boolean(r?.ok)
        if (ok) {
          if (r?.cutOk === false && opts?.alertOnCutFailure !== false) {
            const detail = r?.cutReason ? ` (${String(r.cutReason)})` : ''
            void appAlert(getUiString(uiLang, 'posPrintCutFailedDetail', { detail }))
          }
          opts?.onAfterCleanup?.()
          return
        }
        const reason: string =
          r && typeof (r as { reason?: string }).reason === 'string'
            ? String((r as { reason?: string }).reason)
            : 'print_failed'
        if (opts?.suppressPrintError !== true) {
          void appAlert(getUiString(uiLang, 'posPrintFailedWithReason', { reason }))
        }
        printHtmlInHiddenIframe(fullDocumentHtml, opts)
      })
      .catch(() => {
        if (opts?.suppressPrintError !== true) {
          void appAlert(getUiString(uiLang, 'posPrintRequestError'))
        }
        printHtmlInHiddenIframe(fullDocumentHtml, opts)
      })
    return
  }

  printHtmlInHiddenIframe(fullDocumentHtml, opts)
}
