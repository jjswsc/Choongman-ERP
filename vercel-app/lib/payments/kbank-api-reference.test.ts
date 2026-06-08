import { describe, expect, it } from 'vitest'
import {
  formatKbankApiErrorMessage,
  formatKbankHttpErrorMessage,
  isKbankAccessTokenExpiredError,
  isKbankBusinessSuccess,
  isKbankCreditCardQrUnavailableError,
  isKbankRateLimitError,
  readKbankResponseStatusCode,
  normalizeKbankTxnStatusToPos,
  resolveKbankCreditCardBrandLabels,
  resolveKbankDisplayQrTypeDetails,
  resolveKbankDisplayQrTypeFromResponse,
  resolveKbankOpenApiErrorMessage,
  resolveKbankQrTypeCode,
  maskKbankMessageForLog,
  inferKbankQrTypeFromEmvPayload,
  isKbankQrSessionTxnNo,
  isKbankPaymentTxnNo,
  extractKbankPaymentTxnNo,
  resolveKbankInquiryTxnNoForRequest,
  resolveKbankVoidTxnNoForRequest,
  isKbankInquiryResponseApproved,
  isKbankPaymentAttemptApproved,
  normalizeKbankWebhookPaymentStatus,
} from './kbank-api-reference'

describe('kbank-api-reference', () => {
  it('maps qr types per API reference', () => {
    expect(resolveKbankQrTypeCode('THAI_QR')).toBe('3')
    expect(resolveKbankQrTypeCode('CREDIT_CARD')).toBe('4')
    expect(resolveKbankQrTypeCode('COMBO')).toBe('5')
  })

  it('maps txnStatus and statusCode', () => {
    expect(normalizeKbankTxnStatusToPos('PAID')).toBe('approved')
    expect(normalizeKbankTxnStatusToPos('REQUESTED')).toBe('pending')
    expect(normalizeKbankTxnStatusToPos('EXPIRED')).toBe('declined')
    expect(normalizeKbankTxnStatusToPos('', '11')).toBe('declined')
    expect(normalizeKbankTxnStatusToPos('', '10')).toBe('failed')
  })

  it('detects business success code 00', () => {
    expect(isKbankBusinessSuccess('00')).toBe(true)
    expect(isKbankBusinessSuccess('10')).toBe(false)
    expect(isKbankBusinessSuccess('200')).toBe(false)
  })

  it('reads statusCode from body or assumes 00 on HTTP 2xx', () => {
    expect(readKbankResponseStatusCode({ statusCode: '10' }, 200)).toBe('10')
    expect(readKbankResponseStatusCode({}, 200)).toBe('00')
    expect(readKbankResponseStatusCode({}, 502)).toBe('502')
  })

  it('resolves card brands from cardScheme/sof', () => {
    expect(resolveKbankCreditCardBrandLabels({ cardScheme: 'VISA' })).toEqual(['VISA'])
    expect(resolveKbankCreditCardBrandLabels({ sof: 'CC' })).toContain('VISA')
  })

  it('maps Generic Response Code openapi_error messages in English', () => {
    expect(resolveKbankOpenApiErrorMessage('Access Token expired')).toContain('expired')
    expect(
      formatKbankHttpErrorMessage(401, {
        code: 'openapi_error',
        message: 'Invalid Consumer Secret',
      })
    ).toContain('Invalid Consumer Secret')
  })

  it('detects expired access token message', () => {
    expect(isKbankAccessTokenExpiredError('Access Token expired')).toBe(true)
  })

  it('maps EMQRNCC credit card QR registration errors', () => {
    expect(isKbankCreditCardQrUnavailableError('EMQRNCC', '')).toBe(true)
    expect(formatKbankApiErrorMessage('EMQRNCC', '')).toContain('not registered')
    expect(
      formatKbankApiErrorMessage('', 'This merchant has not registered for QR credit card. (EMQRNCC)')
    ).toContain('not registered')
  })

  it('distinguishes Generate session txnNo from payment txnNo', () => {
    expect(isKbankQrSessionTxnNo('APIC1780542865020JY5')).toBe(true)
    expect(isKbankPaymentTxnNo('26440008')).toBe(true)
    expect(resolveKbankInquiryTxnNoForRequest('APIC1780542865020JY5', { qrType: 'CREDIT_CARD' })).toBe(
      undefined
    )
    expect(resolveKbankInquiryTxnNoForRequest('26440008', { qrType: 'CREDIT_CARD' })).toBe('26440008')
    expect(resolveKbankVoidTxnNoForRequest('APIC1780542865020JY5')).toBeUndefined()
    expect(extractKbankPaymentTxnNo({ txnNo: 'APIC1780542865020JY5', data: { txnNo: '26440008' } })).toBe(
      '26440008'
    )
  })

  it('detects rate limit quota messages', () => {
    expect(
      isKbankRateLimitError(
        'Rate limit quota violation. Quota limit exceeded. Identifier : ChoongmanTest-UAT3.1.70.209'
      )
    ).toBe(true)
  })

  it('resolves display qr type from bank qrType or sof', () => {
    expect(resolveKbankDisplayQrTypeFromResponse({ qrType: '3' })).toBe('THAI_QR')
    expect(resolveKbankDisplayQrTypeFromResponse({ qrType: '4' })).toBe('CREDIT_CARD')
    expect(resolveKbankDisplayQrTypeFromResponse({ sof: 'PP' })).toBe('THAI_QR')
    expect(resolveKbankDisplayQrTypeFromResponse({ sof: 'CC' })).toBe('CREDIT_CARD')
    expect(
      resolveKbankDisplayQrTypeFromResponse({
        qrType: '3',
        requested: 'CREDIT_CARD',
      })
    ).toBe('THAI_QR')
    expect(
      resolveKbankDisplayQrTypeDetails({
        requested: 'CREDIT_CARD',
      }).source
    ).toBe('requested')
  })

  it('infers Thai QR from PromptPay EMV when bank omits qrType', () => {
    const emv = '000201010212' + 'A000000677010112' + 'x'.repeat(40)
    expect(inferKbankQrTypeFromEmvPayload(emv)).toBe('THAI_QR')
    expect(
      resolveKbankDisplayQrTypeDetails({
        requested: 'CREDIT_CARD',
        emvPayload: emv,
      })
    ).toEqual({
      displayType: 'THAI_QR',
      source: 'emv_payload',
      bankQrTypeCode: '',
      bankSof: '',
    })
  })

  it('masks secrets and qr payload for logs', () => {
    const masked = maskKbankMessageForLog({
      partnerSecret: 'top-secret',
      qrType: '4',
      qrCode: '000201010212' + 'x'.repeat(80),
      nested: { access_token: 'abc' },
    }) as Record<string, unknown>
    expect(masked.partnerSecret).toBe('***')
    expect(String(masked.qrCode)).toContain('[qr:')
    expect((masked.nested as Record<string, unknown>).access_token).toBe('***')
  })

  it('detects inquiry approved from nested txnStatus PAID', () => {
    expect(
      isKbankInquiryResponseApproved('pending', { txnStatus: 'PAID', statusCode: '00' }, '00')
    ).toBe(true)
    expect(
      isKbankInquiryResponseApproved(
        'pending',
        { statusCode: '00', data: { txnStatus: 'PAID' } },
        '00'
      )
    ).toBe(true)
    expect(isKbankInquiryResponseApproved('pending', { txnStatus: 'REQUESTED' }, '00')).toBe(false)
  })

  it('detects payment attempt approved from trace and amount (CC callback)', () => {
    expect(
      isKbankPaymentAttemptApproved({
        status: 'pending',
        responseCode: '00',
        approvedAmount: 259,
        traceNo: '483113',
      })
    ).toBe(true)
    expect(
      normalizeKbankWebhookPaymentStatus('', '00', 259, '483113')
    ).toBe('approved')
  })
})
