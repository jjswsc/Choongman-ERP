/** 모바일 수리 신고 탭: 실매장 직원만 (본사/Office 제외) */
export function isPhysicalStoreForRepair(store: string | undefined | null): boolean {
  const s = String(store || "").trim()
  if (!s) return false
  const up = s.toLowerCase()
  if (up.includes("office")) return false
  if (["본사", "오피스", "본점", "cm office"].includes(up)) return false
  if (s === "Office") return false
  return true
}
