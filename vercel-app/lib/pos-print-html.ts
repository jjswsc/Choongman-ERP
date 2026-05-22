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
 * (서로 다른 단말이 같은 프린터로 거의 동시에 찍는 경우도 유사하며, Windows 하이브리드에서는
 *  홀·결제별 ESC/POS 절단을 켜 두는 것이 안전하다.)
 */
export const POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS = 3000
/** 하이브리드(Electron)에서는 스풀 연결 여유를 유지하되 지연을 소폭 단축 */
export const POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS_HYBRID = 1200

/**
 * 주방전이 여러 장일 때 장·장 사이 간격(동일 드라이버 스풀 합침 완화).
 */
export const POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS = 1200
export const POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS_HYBRID = 700

/** 더치페이·분할 결제 영수증이 연속으로 나갈 때 장·장 사이 간격(스풀 합침·다음 장 누락 완화) */
export const POS_THERMAL_BETWEEN_SPLIT_RECEIPTS_MS = 1200
export const POS_THERMAL_BETWEEN_SPLIT_RECEIPTS_MS_HYBRID = 700

/**
 * 숨김 iframe 인쇄 가드(`onPrintUnavailable`)를 Promise로 감쌀 때 `reject`에 쓰는 고정 메시지.
 * 번역 문자열을 `Error.message`에 넣으면 locale마다 catch 분기가 깨짐.
 */
export const POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE = '__CM_POS_PRINT_DOCUMENT_UNAVAILABLE__'

/**
 * 주방 자동 인쇄 직후 고객용 영수증 자동 인쇄 전(모달 경로). 주방 컷·스풀 안정화.
 */
export const POS_THERMAL_AFTER_KITCHEN_TO_RECEIPT_MS = 1000
export const POS_THERMAL_AFTER_KITCHEN_TO_RECEIPT_MS_HYBRID = 600

/**
 * 영수증(홀 주문) 직후 주방전 시작 지연.
 * - 웹: 기존 보수값 유지
 * - 하이브리드 셸: 소폭 단축
 */
export function resolveAfterReceiptToKitchenDelayMs(): number {
  if (typeof window !== 'undefined' && typeof window.cmPosShell?.printHtml === 'function') {
    return POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS_HYBRID
  }
  return POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
}

export function resolveBetweenKitchenSlipsDelayMs(): number {
  if (typeof window !== 'undefined' && typeof window.cmPosShell?.printHtml === 'function') {
    return POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS_HYBRID
  }
  return POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS
}

export function resolveBetweenSplitReceiptsDelayMs(): number {
  if (typeof window !== 'undefined' && typeof window.cmPosShell?.printHtml === 'function') {
    return POS_THERMAL_BETWEEN_SPLIT_RECEIPTS_MS_HYBRID
  }
  return POS_THERMAL_BETWEEN_SPLIT_RECEIPTS_MS
}

export function resolveAfterKitchenToReceiptDelayMs(): number {
  if (typeof window !== 'undefined' && typeof window.cmPosShell?.printHtml === 'function') {
    return POS_THERMAL_AFTER_KITCHEN_TO_RECEIPT_MS_HYBRID
  }
  return POS_THERMAL_AFTER_KITCHEN_TO_RECEIPT_MS
}

let shellPrintQueue = Promise.resolve()

function enqueueShellPrint<T>(task: () => Promise<T>): Promise<T> {
  const next = shellPrintQueue.catch(() => undefined).then(task)
  shellPrintQueue = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

/** 하이브리드 셸: Windows `runtime-config.json`의 receipt vs kitchen1~3 프린터로 분기 */
export type PosPrintTargetRole = 'receipt' | 'kitchen'

/** `printRole: 'receipt'`일 때만 사용 — ESC/POS 절단을 홀 주문서 vs 결제 영수증으로 나눔 */
export type PosPrintReceiptKind = 'hall_order' | 'payment'

export type PrintPosHtmlDocumentOptions = PrintHtmlInHiddenIframeOptions & {
  /**
   * Windows 하이브리드 셸: true면 무인쇄(열전사 최적화)를 건너뛰고 **시스템 인쇄 대화상자**만 띄움.
   * 프린터를 바꿀 때만 쓰고, 일부 드라이버에서는 80mm 무인쇄보다 축소되어 나올 수 있음.
   */
  preferSystemPrintDialog?: boolean
  /** Windows 하이브리드: 영수증 vs 주방 무인쇄 대상 프린터 (runtime-config `print.*DeviceName`) */
  printRole?: PosPrintTargetRole
  /**
   * Windows 하이브리드: `printRole: 'receipt'`일 때 ESC/POS 절단 구분(홀 주문서 / 결제 영수증).
   * 생략 시 셸은 예전 단일 `printEscPosCutAfterReceiptHtml` 플래그로 처리(호환).
   */
  printReceiptKind?: PosPrintReceiptKind
  /**
   * Windows 하이브리드: 매장 프린터 설정 등에서 계산한 값. 있으면 셸의 로컬 runtime-config보다 우선.
   */
  escPosCutOverride?: boolean
  /** 주방 슬립이 주방 1·2·3 중 어디로 갈지 — `printRole: 'kitchen'`일 때만 사용 */
  kitchenStation?: 1 | 2 | 3
  /** 하이브리드 무인쇄 실패 시 알림 생략 */
  suppressPrintError?: boolean
  /** 인쇄 성공 후 ESC/POS 절단만 실패했을 때 알림 (기본 true) */
  alertOnCutFailure?: boolean
  /** Windows 셸 printHtml 결과(이유·컷 실패 포함) 수집용 */
  onShellPrintResult?: (result: {
    ok?: boolean
    reason?: string
    cutOk?: boolean
    cutReason?: string
    printStage?: string
    warnings?: string[]
    usedDevice?: string
  }) => void
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
              printReceiptKind?: PosPrintReceiptKind
              escPosCutOverride?: boolean
              kitchenStation?: number
            }
          ) => Promise<{
            ok?: boolean
            reason?: string
            cutOk?: boolean
            cutReason?: string
            printStage?: string
            warnings?: string[]
            usedDevice?: string
          }>
        }
      }
    ).cmPosShell

  /** preload에 printHtml만 있으면 셸 인쇄 (플랫폼 문자열 누락·구버전 호환) */
  const useShell = typeof shell?.printHtml === 'function'
  const preferDialog = opts?.preferSystemPrintDialog === true
  const shellOpts =
    preferDialog ||
    opts?.printRole ||
    opts?.kitchenStation != null ||
    opts?.printReceiptKind != null ||
    opts?.escPosCutOverride !== undefined
      ? {
          preferDialog,
          ...(opts?.printRole ? { printRole: opts.printRole } : {}),
          ...(opts?.printReceiptKind ? { printReceiptKind: opts.printReceiptKind } : {}),
          ...(opts?.escPosCutOverride !== undefined ? { escPosCutOverride: Boolean(opts.escPosCutOverride) } : {}),
          ...(opts?.kitchenStation != null ? { kitchenStation: opts.kitchenStation } : {}),
        }
      : undefined

  if (useShell) {
    const uiLang = getClientUiLang()
    void enqueueShellPrint(() => shell.printHtml!(fullDocumentHtml, shellOpts))
      .then((r) => {
        opts?.onShellPrintResult?.(r || {})
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
        opts?.onShellPrintResult?.({ ok: false, reason: 'shell_invoke_error' })
        if (opts?.suppressPrintError !== true) {
          void appAlert(getUiString(uiLang, 'posPrintRequestError'))
        }
        printHtmlInHiddenIframe(fullDocumentHtml, opts)
      })
    return
  }

  printHtmlInHiddenIframe(fullDocumentHtml, opts)
}
