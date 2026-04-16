/** 인보이스 번호 생성: IV{yyyymmdd}-{orderId} (출고 관리와 동일 형식) — 서버 의존 없음 */
export function formatReceivableInvoiceNo(orderId: number, transDate: string): string {
  const datePart =
    String(transDate || '')
      .replace(/\D/g, '')
      .slice(0, 8) || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `IV${datePart}-${orderId}`
}
