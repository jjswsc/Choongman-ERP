import { describe, expect, it } from 'vitest'
import {
  buildQrTableThermalSlipHtml,
  formatQrTableThermalSlipPrintedAt,
  pickQrTokenForTable,
  QR_TABLE_THERMAL_SCAN_TH,
  QR_TABLE_THERMAL_SLIP_QR_MM,
} from '@/lib/qr-table-thermal-slip-html'

const QR_DATA = 'data:image/png;base64,abc'

describe('qr-table-thermal-slip-html', () => {
  it('picks the token whose table name matches exactly', () => {
    const tokens = [
      { tableName: '1F-2', token: 'a' },
      { tableName: '20', token: 'b' },
    ]
    expect(pickQrTokenForTable(tokens, '20')?.token).toBe('b')
    expect(pickQrTokenForTable(tokens, ' 1F-2 ')?.token).toBe('a')
    expect(pickQrTokenForTable(tokens, '2')).toBeUndefined()
  })

  it('builds an 80mm slip with table name, scan copy, print time, and data-URI QR', () => {
    const printedAtLabel = 'พิมพ์ 2026-10-31 12:40'
    const html = buildQrTableThermalSlipHtml({
      tableName: '20',
      qrDataUrl: QR_DATA,
      storeLabel: 'Omni',
      printedAtLabel,
    })
    expect(html).toContain('size: 80mm')
    expect(html).toContain('TABLE')
    expect(html).toContain('>20<')
    expect(html).toContain('Omni')
    expect(html).toContain(QR_TABLE_THERMAL_SCAN_TH)
    expect(html).toContain('Scan to order from your phone')
    expect(html).toContain(printedAtLabel)
    expect(html).toContain(QR_DATA)
    expect(html).toContain(`${QR_TABLE_THERMAL_SLIP_QR_MM}mm`)
    expect(html).not.toContain('https://')
  })

  it('formats Bangkok wall-clock print time for the slip', () => {
    const label = formatQrTableThermalSlipPrintedAt(new Date('2026-10-31T05:40:00.000Z'))
    expect(label).toBe('พิมพ์ 2026-10-31 12:40')
  })

  it('strips Korean 번 from the slip table label', () => {
    const html = buildQrTableThermalSlipHtml({
      tableName: '30번',
      qrDataUrl: QR_DATA,
      storeLabel: 'CM Union Mall',
    })
    expect(html).toContain('>30<')
    expect(html).not.toContain('30번')
  })

  it('keeps the floor prefix so the slip matches the admin QR card', () => {
    const html = buildQrTableThermalSlipHtml({ tableName: '1F-1', qrDataUrl: QR_DATA })
    expect(html).toContain('>1F-1<')
  })

  it('rejects remote QR images', () => {
    expect(() =>
      buildQrTableThermalSlipHtml({
        tableName: '20',
        qrDataUrl: 'https://example.com/qr.png',
      })
    ).toThrow('qr_data_url_required')
  })
})
