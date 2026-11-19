/**
 * 공지 「확인」액션 판별 — 모바일 UI 언어(ยืนยัน 등)와 무관하게 서버가 동일하게 처리.
 */

export function isNoticeConfirmAction(action: unknown): boolean {
  const s = String(action ?? '').trim()
  if (!s) return false
  if (s === '다음에' || s === 'later' || s === 'Later' || s === 'ไว้ก่อน' || s === 'ดูภายหลัง') {
    return false
  }
  const lower = s.toLowerCase()
  if (s === '확인' || s === '확인함') return true
  if (/^(อ่านแล้ว|รับทราบ|ยืนยัน|ตกลง)$/.test(s)) return true
  if (lower === 'confirm' || lower === 'confirmed' || lower === 'ack' || lower === 'acknowledge') {
    return true
  }
  if (lower === 'read' || lower === 'done') return true
  return false
}
