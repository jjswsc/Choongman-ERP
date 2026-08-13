import { describe, expect, it } from 'vitest'
import { pickKbankVoidRefsFromAttempts } from './kbank-void-from-order'

describe('pickKbankVoidRefsFromAttempts', () => {
  it('returns null when there is no KBank attempt', () => {
    expect(
      pickKbankVoidRefsFromAttempts([
        { provider: 'kbtg_linkpos', txCode: 'SALE', localTxId: 'LP1', status: 'approved' },
      ])
    ).toBeNull()
  })

  it('picks generate QR partnerTxnUid and numeric txnNo', () => {
    const refs = pickKbankVoidRefsFromAttempts([
      {
        provider: 'kbank_qr_api',
        bankId: 'KBANK',
        txCode: 'QR',
        localTxId: 'P1723512345abcd',
        status: 'approved',
        approvalCode: '202608131704587',
        traceNo: '202608131704587',
        terminalId: '09000107',
      },
    ])
    expect(refs).toEqual({
      partnerTxnUid: 'P1723512345abcd',
      txnNo: '202608131704587',
      terminalId: '09000107',
      alreadyVoided: false,
    })
  })

  it('ignores APIC session ids and reads txnNo from a later inquiry row', () => {
    const refs = pickKbankVoidRefsFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'STATUS',
        localTxId: 'CHK123',
        status: 'approved',
        approvalCode: '26440008',
      },
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PabcGenerateUid01',
        status: 'pending',
        approvalCode: 'APIC20260813XXXX',
      },
    ])
    expect(refs?.partnerTxnUid).toBe('PabcGenerateUid01')
    expect(refs?.txnNo).toBe('26440008')
    expect(refs?.alreadyVoided).toBe(false)
  })

  it('marks already voided when a VOID attempt is approved', () => {
    const refs = pickKbankVoidRefsFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'VOID',
        localTxId: 'VOD123:VOID',
        status: 'approved',
      },
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PorigUid',
        status: 'approved',
        approvalCode: '12345678',
      },
    ])
    expect(refs?.alreadyVoided).toBe(true)
    expect(refs?.partnerTxnUid).toBe('PorigUid')
  })
})
