import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { sanitizeLinkposHypercomRef } from './api-client/pos-payment-gateways'

const require = createRequire(import.meta.url)
const bridge = require('../windows-pos/linkpos-bridge-server.js') as {
  selfTestProtocol: () => void
  sanitizeHypercomText: (value: string, maxLen?: number) => string
  buildNativeQrFields: (json: Record<string, unknown>) => Array<{ type: string; data: string }>
  buildNativeQrRequestFrame: (json: Record<string, unknown>) => Buffer
  parseFrame: (buf: Buffer) => {
    txCode: string
    responseCode: string
    fields: Record<string, string>
    fieldOrder: string[]
  }
  NATIVE_QR_FIELD_ORDER: string[]
  THAI_QR_PAYMENT_INDICATOR: string
  DEFAULT_KASIKORN_BANK_ID: string
  HYPERCOM_REF_MAX_LEN: number
}

describe('LinkPOS Native QR Hypercom frame (tx 70)', () => {
  it('passes bridge self-test (D0, sale, QR field order, LRC)', () => {
    expect(() => bridge.selfTestProtocol()).not.toThrow()
  })

  it('sends 40 → A1=03 → R1 → R2 → J6=04 (not the old 40 → R1 → A1 → R2)', () => {
    const fields = bridge.buildNativeQrFields({
      amount: 199,
      reference1: 'POSQR12345678901234',
      reference2: 'TABLE1',
    })
    expect(fields.map((f) => f.type)).toEqual(['40', 'A1', 'R1', 'R2', 'J6'])
    expect(fields.map((f) => f.type).join(',')).not.toBe('40,R1,A1,R2')
    expect(fields[1]?.data).toBe('03')
    expect(fields[4]?.data).toBe('04')
    expect(fields[0]?.data).toBe('000000019900')
  })

  it('uses provided Bank ID on J6 and keeps A1=03 for Thai QR', () => {
    const fields = bridge.buildNativeQrFields({
      amount: 1,
      paymentIndicator: '03',
      bankId: '06',
      reference1: 'POSQR1',
      reference2: 'T2',
    })
    expect(fields[1]?.data).toBe(bridge.THAI_QR_PAYMENT_INDICATOR)
    expect(fields[4]?.data).toBe('06')
  })

  it('defaults A1=03 when qrType is THAI_QR (non-numeric)', () => {
    const fields = bridge.buildNativeQrFields({
      amount: 1,
      qrType: 'THAI_QR',
      reference1: 'POSQR1',
    })
    expect(fields[1]?.data).toBe('03')
  })

  it('limits R1/R2 to 20 ASCII printable chars and strips Thai', () => {
    const longAscii = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const fields = bridge.buildNativeQrFields({
      amount: 1,
      reference1: `โต๊ะ${longAscii}`,
      reference2: '충만-โต๊ะ 5',
    })
    expect(fields[2]?.data).toBe(longAscii.slice(0, 20))
    expect(fields[2]?.data.length).toBeLessThanOrEqual(bridge.HYPERCOM_REF_MAX_LEN)
    expect(fields[3]?.data).toBe('- 5')
    expect(/[^\x20-\x7E]/.test(fields[2]?.data + fields[3]?.data)).toBe(false)
    expect(bridge.sanitizeHypercomText('โต๊ะA')).toBe('A')
    expect(sanitizeLinkposHypercomRef('โต๊ะPOS-99')).toBe('POS-99')
  })

  it('builds a parseable Hypercom request frame with tx 70 and KBTG field order', () => {
    const frame = bridge.buildNativeQrRequestFrame({
      amount: 1,
      paymentIndicator: '03',
      reference1: 'POSQR123',
      reference2: 'TABLE1',
    })
    const parsed = bridge.parseFrame(frame)
    expect(parsed.txCode).toBe('70')
    expect(parsed.responseCode).toBe('00')
    expect(parsed.fieldOrder).toEqual(bridge.NATIVE_QR_FIELD_ORDER)
    expect(parsed.fields['A1']).toBe('03')
    expect(parsed.fields['J6']).toBe(bridge.DEFAULT_KASIKORN_BANK_ID)
    expect(parsed.fields['R1']).toBe('POSQR123')
    expect(parsed.fields['R2']).toBe('TABLE1')
    expect(frame.toString('hex').toUpperCase()).toBe(
      '02007336303030303030303030313037303030311C343000123030303030303030303130301C4131000230331C52310008504F5351523132331C523200065441424C45311C4A36000230341C0340'
    )
  })

  it('falls back to storeCode for R2 when table name is Thai-only, and omits empty R2', () => {
    const withStore = bridge.buildNativeQrFields({
      amount: 1,
      reference1: 'POSQR1',
      reference2: 'โต๊ะ',
      storeCode: 'UNION01',
    })
    expect(withStore.map((f) => f.type)).toEqual(['40', 'A1', 'R1', 'R2', 'J6'])
    expect(withStore.find((f) => f.type === 'R2')?.data).toBe('UNION01')

    const withoutR2 = bridge.buildNativeQrFields({
      amount: 1,
      reference1: 'POSQR1',
      reference2: 'โต๊ะ',
    })
    expect(withoutR2.map((f) => f.type)).toEqual(['40', 'A1', 'R1', 'J6'])
    expect(withoutR2.at(-1)?.data).toBe('04')
  })
})
