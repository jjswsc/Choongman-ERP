import { describe, expect, it } from 'vitest'
import { buildPosQueueCallLineFlexMessage } from './pos-queue-line-flex'

describe('buildPosQueueCallLineFlexMessage', () => {
  it('builds first-call card with queue number, party, branch and status button', () => {
    const flex = buildPosQueueCallLineFlexMessage({
      queueNo: 3,
      partySize: 4,
      storeLabel: 'Union Mall',
      callCount: 1,
      statusUrl: 'https://erp.example.com/q/abc',
      occurredAt: new Date('2026-10-15T05:30:00.000Z'),
    })
    const json = JSON.stringify(flex.contents)
    expect(flex.altText).toContain('ถึงคิวของคุณแล้วครับ')
    expect(flex.altText).toContain('003')
    expect(json).toContain('"text":"003"')
    expect(json).toContain('4 ท่าน')
    expect(json).toContain('Union Mall')
    expect(json).toContain('https://erp.example.com/q/abc')
    expect(json).toContain('#E8F6EE')
    expect(json).toContain('15 ต.ค. 2569 · 12:30 น.')
  })

  it('marks re-calls and drops the button without an https url', () => {
    const flex = buildPosQueueCallLineFlexMessage({
      queueNo: 12,
      partySize: 2,
      storeLabel: '',
      callCount: 3,
      statusUrl: '/q/abc',
    })
    const json = JSON.stringify(flex.contents)
    expect(flex.altText).toContain('ครั้งที่ 3')
    expect(json).toContain('#FEF3C7')
    expect(json).not.toContain('"type":"button"')
    expect(json).not.toContain('สาขา')
  })
})
