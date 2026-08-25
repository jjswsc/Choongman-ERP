import { describe, expect, it } from 'vitest'
import { buildHypercomV1Frame, parseHypercomFrame } from './hypercom-v2'

describe('parseHypercomFrame header offsets', () => {
  it('reads tx 20 / response 00 from a sale frame', () => {
    const frame = buildHypercomV1Frame({
      txCode: '20',
      moreIndicator: '1',
      fields: [{ type: '40', data: '000000000100' }],
    })
    const parsed = parseHypercomFrame(frame)
    expect(parsed.txCode).toBe('20')
    expect(parsed.responseCode).toBe('00')
  })

  it('reads tx 26 / response 00 from a void frame (not 60 from the old off-by-one)', () => {
    const frame = buildHypercomV1Frame({
      txCode: '26',
      moreIndicator: '1',
      fields: [{ type: '65', data: '000001' }],
    })
    const parsed = parseHypercomFrame(frame)
    expect(parsed.txCode).toBe('26')
    expect(parsed.responseCode).toBe('00')
  })

  it('reads a declined void as ND, not 6N', () => {
    const frame = buildHypercomV1Frame({
      txCode: '26',
      reqResIndicator: '1',
      responseCode: 'ND',
      moreIndicator: '0',
      fields: [{ type: '65', data: '000001' }],
    })
    const parsed = parseHypercomFrame(frame)
    expect(parsed.txCode).toBe('26')
    expect(parsed.responseCode).toBe('ND')
  })
})
