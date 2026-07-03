/** 지출·패티캐시 문서 첨부 — OCR·스캔 사용자 설정 (localStorage) */

export const EXPENSE_DOC_OCR_AUTO_FILL_KEY = 'cm_expense_doc_ocr_auto_fill'
export const EXPENSE_DOC_SCAN_SKIP_KEY = 'cm_expense_doc_scan_skip'

function readBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    // ignore
  }
  return defaultValue
}

function writeBool(key: string, value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // ignore
  }
}

export function readExpenseDocOcrAutoFill(): boolean {
  return readBool(EXPENSE_DOC_OCR_AUTO_FILL_KEY, true)
}

export function writeExpenseDocOcrAutoFill(enabled: boolean): void {
  writeBool(EXPENSE_DOC_OCR_AUTO_FILL_KEY, enabled)
}

/** true면 사진 선택 시 스캔 보정 화면을 건너뜀 */
export function readExpenseDocScanSkip(): boolean {
  return readBool(EXPENSE_DOC_SCAN_SKIP_KEY, false)
}

export function writeExpenseDocScanSkip(skip: boolean): void {
  writeBool(EXPENSE_DOC_SCAN_SKIP_KEY, skip)
}
