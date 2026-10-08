/** 클라이언트·서버 공용 — 테이블 QR 슬립 인쇄 잡 payload */

export type TableQrPrintJobPayload = {
  action: 'table_qr'
  tableName: string
  url: string
  storeLabel?: string
  scanTh?: string
  scanEn?: string
}

export function tableQrPayloadFromPrintJob(
  payload: Record<string, unknown> | null | undefined
): TableQrPrintJobPayload | null {
  if (!payload || typeof payload !== 'object') return null
  if (String(payload.action || '').trim() !== 'table_qr') return null
  const tableName = String(payload.tableName || '').trim()
  const url = String(payload.url || '').trim()
  if (!tableName || !url) return null
  return {
    action: 'table_qr',
    tableName,
    url,
    storeLabel: String(payload.storeLabel || '').trim() || undefined,
    scanTh: String(payload.scanTh || '').trim() || undefined,
    scanEn: String(payload.scanEn || '').trim() || undefined,
  }
}
