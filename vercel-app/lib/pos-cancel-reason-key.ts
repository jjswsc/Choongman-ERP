/** DB·URL·집계에서 빈 취소 사유를 나타내는 고정 키(다국어 표시는 UI에서만). */
export const POS_CANCEL_REASON_EMPTY = "__POS_CANCEL_REASON_EMPTY__"

export function normalizePosCancelReasonKey(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim()
  return s || POS_CANCEL_REASON_EMPTY
}

export function displayPosCancelReasonKey(key: string, notSetLabel: string): string {
  return key === POS_CANCEL_REASON_EMPTY ? notSetLabel : key
}
