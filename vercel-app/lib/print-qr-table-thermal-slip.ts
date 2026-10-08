/**
 * POS 영수증 프린터로 테이블 QR 주문 슬립 출력 (웹 iframe · Windows 하이브리드 공통).
 * 오더 태블릿·휴대폰은 로컬 about:blank 인쇄 대신 메인 POS 큐로 보낸다.
 */
import QRCode from 'qrcode'
import type { PosPrinterSettings } from '@/lib/api-client'
import { isCmPosHybridShell, isPosAndroidWebPrintClient } from '@/lib/cm-pos-shell'
import { printPosHtmlDocument } from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import { buildQrTableThermalSlipHtml } from '@/lib/qr-table-thermal-slip-html'

/** 로컬 열전사 인쇄가 되면 false. 메인 POS로 큐잉해야 하면 true. */
export function shouldQueueTableQrPrintToMainPos(): boolean {
  if (typeof window === 'undefined') return true
  if (isCmPosHybridShell()) return false
  if (isPosAndroidWebPrintClient()) return true
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return true
  try {
    const v = localStorage.getItem('pos_main_device')
    if (v === '0' || v === 'false') return true
  } catch {
    /* ignore */
  }
  return false
}

export async function printQrTableThermalSlip(input: {
  tableName: string
  url: string
  storeLabel?: string
  scanTh?: string
  scanEn?: string
  printerSettings?: PosPrinterSettings | null
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
    escPosCutOverride: resolveEscPosCutOverride(input.printerSettings, {
      printRole: 'receipt',
      printReceiptKind: 'hall_order',
    }),
  })
}
