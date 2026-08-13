/**
 * POS 영수증 프린터로 테이블 QR 주문 슬립 출력 (웹 iframe · Windows 하이브리드 공통).
 */
import QRCode from 'qrcode'
import { printPosHtmlDocument } from '@/lib/pos-print-html'
import { buildQrTableThermalSlipHtml } from '@/lib/qr-table-thermal-slip-html'

export async function printQrTableThermalSlip(input: {
  tableName: string
  url: string
  storeLabel?: string
  scanTh?: string
  scanEn?: string
}): Promise<void> {
  const url = String(input.url || '').trim()
  const tableName = String(input.tableName || '').trim()
  if (!url || !tableName) throw new Error('qr_print_required')

  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 480,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })

  const html = buildQrTableThermalSlipHtml({
    tableName,
    qrDataUrl,
    storeLabel: input.storeLabel,
    scanTh: input.scanTh,
    scanEn: input.scanEn,
  })

  await printPosHtmlDocument(html, {
    title: `QR ${tableName}`,
    printRole: 'receipt',
    printReceiptKind: 'hall_order',
  })
}
