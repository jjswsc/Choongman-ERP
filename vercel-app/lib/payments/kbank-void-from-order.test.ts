import { describe, expect, it } from 'vitest'
import {
  evaluateKbankVoidEligibilityFromAttempts,
  needsKbankVoidInquiry,
  pickKbankVoidRefsFromAttempts,
} from './kbank-void-from-order'

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
        terminalId: '09000107',
      },
    ])
    expect(refs?.alreadyVoided).toBe(true)
    expect(refs?.partnerTxnUid).toBe('PorigUid')
  })
})

describe('evaluateKbankVoidEligibilityFromAttempts', () => {
  it('does not mix transaction refs from another bill', () => {
    const billA = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PbillA',
        status: 'approved',
        approvalCode: '11111111',
        terminalId: 'TERM-A',
      },
    ])
    const billB = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PbillB',
        status: 'approved',
        approvalCode: '22222222',
        terminalId: 'TERM-B',
      },
    ])
    expect(billA.partnerTxnUid).toBe('PbillA')
    expect(billA.txnNo).toBe('11111111')
    expect(billB.partnerTxnUid).toBe('PbillB')
    expect(billB.txnNo).toBe('22222222')
    expect(billA.txnNo).not.toBe(billB.txnNo)
  })

  it('blocks Credit Card Void when inquiry returned only APIC session id', () => {
    const el = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PsessionOnly',
        status: 'pending',
        approvalCode: 'APIC1780542865020JY5',
        requestRaw: JSON.stringify({ qrType: 'CREDIT_CARD' }),
      },
      {
        provider: 'kbank_qr_api',
        txCode: 'STATUS',
        localTxId: 'CHKAPIC',
        status: 'approved',
        approvalCode: 'APIC1780542865020JY5',
        responseRaw: JSON.stringify({ statusCode: '00', txnStatus: 'PAID', txnNo: 'APIC1780542865020JY5' }),
      },
    ])
    expect(el.paid).toBe(true)
    expect(el.qrType).toBe('CREDIT_CARD')
    expect(el.canVoid).toBe(false)
    expect(el.reason).toBe('apic_session_only')
    expect(el.hasApicSessionTxnNo).toBe(true)
    expect(el.txnNo).toBe('')
  })

  it('allows Thai QR Void when inquiry returned only APIC session id', () => {
    const el = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PthaiApic',
        status: 'pending',
        approvalCode: 'APIC1788341214404YTL',
        requestRaw: JSON.stringify({ qrType: 'THAI_QR' }),
      },
      {
        provider: 'kbank_qr_api',
        txCode: 'STATUS',
        localTxId: 'CHKTHAIAPIC',
        status: 'approved',
        responseCode: '00',
        responseRaw: JSON.stringify({
          statusCode: '00',
          txnStatus: 'PAID',
          txnNo: 'APIC1788341214404YTL',
        }),
      },
    ])
    expect(el.paid).toBe(true)
    expect(el.qrType).toBe('THAI_QR')
    expect(el.canVoid).toBe(true)
    expect(el.reason).toBe('ok')
    expect(el.txnNo).toBe('APIC1788341214404YTL')
  })

  it('reads numeric txnNo from nested result in inquiry JSON', () => {
    const el = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PnestedResult',
        status: 'pending',
        approvalCode: 'APICNESTEDRESULT',
      },
      {
        provider: 'kbank_qr_api',
        txCode: 'STATUS',
        localTxId: 'CHKNESTED',
        status: 'approved',
        responseCode: '00',
        responseRaw: JSON.stringify({
          statusCode: '00',
          txnStatus: 'PAID',
          txnNo: 'APIC1780542865020JY5',
          result: { txnNo: '26440008', allowVoid: 'Y' },
        }),
      },
    ])
    expect(el.canVoid).toBe(true)
    expect(el.txnNo).toBe('26440008')
    expect(el.reason).toBe('ok')
  })

  it('blocks Void when allowVoid is N', () => {
    const el = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PnoVoid',
        status: 'approved',
        approvalCode: '33333333',
        responseRaw: JSON.stringify({ allowVoid: 'N', txnNo: '33333333' }),
      },
    ])
    expect(el.paid).toBe(true)
    expect(el.allowVoid).toBe('N')
    expect(el.canVoid).toBe(false)
    expect(el.reason).toBe('allow_void_n')
  })

  it('does not treat statusCode 00 without txnStatus PAID as paid', () => {
    const el = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PpendingPay',
        status: 'pending',
        approvalCode: 'APIC20260825XXXX',
      },
      {
        provider: 'kbank_qr_api',
        txCode: 'STATUS',
        localTxId: 'CHK00',
        status: 'pending',
        responseCode: '00',
        responseRaw: JSON.stringify({ statusCode: '00', txnStatus: 'REQUESTED' }),
      },
    ])
    expect(el.paid).toBe(false)
    expect(el.canVoid).toBe(false)
    expect(el.reason).toBe('not_paid')
  })

  it('allows Void when paid, allowVoid Y, and numeric payment txnNo exist', () => {
    const el = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PokUid',
        status: 'pending',
        approvalCode: 'APIC20260825OK',
        terminalId: '09000107',
        requestRaw: JSON.stringify({ qrType: 'THAI_QR' }),
      },
      {
        provider: 'kbank_qr_api',
        txCode: 'STATUS',
        localTxId: 'CHKOK',
        status: 'approved',
        approvalCode: '26440008',
        traceNo: '26440008',
        responseCode: '00',
        responseRaw: JSON.stringify({
          statusCode: '00',
          txnStatus: 'PAID',
          txnNo: '26440008',
          allowVoid: 'Y',
        }),
      },
    ])
    expect(el).toMatchObject({
      partnerTxnUid: 'PokUid',
      txnNo: '26440008',
      terminalId: '09000107',
      qrType: 'THAI_QR',
      allowVoid: 'Y',
      paid: true,
      alreadyVoided: false,
      canVoid: true,
      reason: 'ok',
    })
  })

  it('requests Inquiry only when the bill has no numeric payment txnNo yet', () => {
    const apicOnly = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'PneedInq',
        status: 'pending',
        approvalCode: 'APIC20260825NEED',
      },
    ])
    expect(needsKbankVoidInquiry(apicOnly)).toBe(true)
    const ready = evaluateKbankVoidEligibilityFromAttempts([
      {
        provider: 'kbank_qr_api',
        txCode: 'QR',
        localTxId: 'Pready',
        status: 'approved',
        approvalCode: '26440009',
      },
    ])
    expect(ready.canVoid).toBe(true)
    expect(needsKbankVoidInquiry(ready)).toBe(false)
  })
})
