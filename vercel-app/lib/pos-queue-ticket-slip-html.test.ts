import { describe, expect, it } from 'vitest'
import { buildPosQueueTicketSlipHtml, formatPosQueueIssuedAtBangkok } from './pos-queue-ticket-slip-html'
import { queueTicketPayloadFromPrintJob } from './pos-queue-ticket-print-job'

describe('buildPosQueueTicketSlipHtml', () => {
  it('renders padded number, party size, teams ahead and QR', () => {
    const html = buildPosQueueTicketSlipHtml({
      queueNo: 7,
      partySize: 4,
      teamsAhead: 2,
      issuedAt: '2026-10-14T05:30:00.000Z',
      storeLabel: 'Union Mall',
      qrDataUrl: 'data:image/png;base64,AAAA',
    })
    expect(html).toContain('>007<')
    expect(html).toContain('4 ท่าน')
    expect(html).toContain('รออีก 2 คิว')
    expect(html).toContain('Union Mall')
    expect(html).toContain('data:image/png;base64,AAAA')
    expect(html).toContain('ครับ')
    expect(html).not.toContain('ค่ะ')
  })

  it('omits QR block without a data URL', () => {
    const html = buildPosQueueTicketSlipHtml({ queueNo: 1, partySize: 1, teamsAhead: 0, issuedAt: '' })
    expect(html).not.toContain('<img')
    expect(html).toContain('1 person')
  })

  it('formats issue time in Bangkok', () => {
    expect(formatPosQueueIssuedAtBangkok('2026-10-14T17:30:00.000Z')).toBe('15/10, 00:30')
  })
})

describe('queueTicketPayloadFromPrintJob', () => {
  it('accepts queue_ticket payload only', () => {
    expect(queueTicketPayloadFromPrintJob({ action: 'table_qr', queueNo: 3 })).toBeNull()
    expect(queueTicketPayloadFromPrintJob({ action: 'queue_ticket', queueNo: 0 })).toBeNull()
    expect(
      queueTicketPayloadFromPrintJob({ action: 'queue_ticket', ticketId: 9, queueNo: 3, partySize: 2, teamsAhead: 1 })
    ).toMatchObject({ action: 'queue_ticket', ticketId: 9, queueNo: 3, partySize: 2, teamsAhead: 1 })
  })
})
