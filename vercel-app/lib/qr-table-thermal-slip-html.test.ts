import { describe, expect, it } from 'vitest'
import {
  buildQrTableThermalSlipHtml,
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

  it('builds an 80mm slip with table name, scan copy, and data-URI QR', () => {
    const html = buildQrTableThermalSlipHtml({
      tableName: '20',
      qrDataUrl: QR_DATA,
      storeLabel: 'Omni',
    })
    expect(html).toContain('size: 80mm')
    expect(html).toContain('TABLE')
    expect(html).toContain('>20<')
    expect(html).toContain('Omni')
    expect(html).toContain(QR_TABLE_THERMAL_SCAN_TH)
    expect(html).toContain('Scan to order from your phone')
    expect(html).toContain(QR_DATA)
    expect(html).toContain(`${QR_TABLE_THERMAL_SLIP_QR_MM}mm`)
    expect(html).not.toContain('https://')
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
