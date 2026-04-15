/**
 * 공지 읽음 여부 — 클라이언트(홈 탭)와 API `getMyNotices`가 동일 규칙을 쓰도록 유지.
 * notice_reads.status 또는 합성 status(New 등)에 대응.
 */
export function isNoticeReadStatus(status: string): boolean {
  const s = String(status ?? "").trim()
  if (!s || s === "New") return false
  const lower = s.toLowerCase()
  if (/^(확인|확인함)$/.test(s)) return true
  if (lower === "read") return true
  if (/^(อ่านแล้ว|รับทราบ|ยืนยัน|ตกลง)$/.test(s)) return true
  if (/^(read|confirmed|acknowledged|done)(ed)?$/i.test(lower)) return true
  return false
}
