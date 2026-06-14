function asPlainObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function pickFirstNonEmptyText(
  sources: Array<Record<string, unknown> | null>,
  keys: readonly string[]
): string {
  for (const src of sources) {
    if (!src) continue
    for (const key of keys) {
      const raw = src[key]
      if (typeof raw === 'string') {
        const value = raw.trim()
        if (value) return value
        continue
      }
      if (typeof raw === 'number' || typeof raw === 'bigint') {
        const value = String(raw).trim()
        if (value) return value
      }
    }
  }
  return ''
}

export function extractKbankGenerateResponseInfo(raw: unknown): {
  qrPayload: string
  originalTxnId: string
  txnNo: string
  referenceId: string
  sof: unknown
  cardScheme: string
  allowVoid: string
} {
  const root = asPlainObject(raw)
  const data = asPlainObject(root?.data)
  const result = asPlainObject(root?.result)
  const payment = asPlainObject(root?.payment)
  const paymentInfo = asPlainObject(root?.paymentInfo)
  const sources = [root, data, result, payment, paymentInfo]
  return {
    qrPayload: pickFirstNonEmptyText(sources, [
      'qrPayload',
      'qrCode',
      'qrString',
      'qrData',
      'payload',
      'qrRawData',
      'qrRaw',
      'thaiQr',
    ]),
    originalTxnId: pickFirstNonEmptyText(sources, [
      'origPartnerTxnUid',
      'originalTransactionId',
      'transactionId',
      'partnerTxnUid',
    ]),
    txnNo: pickFirstNonEmptyText(sources, ['txnNo', 'transactionNo']),
    referenceId: pickFirstNonEmptyText(sources, ['refId', 'referenceId']),
    sof: (() => {
      for (const src of sources) {
        if (!src || src.sof == null) continue
        return src.sof
      }
      return ''
    })(),
    cardScheme: pickFirstNonEmptyText(sources, ['cardScheme', 'card_scheme']),
    allowVoid: pickFirstNonEmptyText(sources, ['allowVoid', 'allow_void']),
  }
}

/** Inquiry/Void/Cancel — origPartnerTxnUid must match our Generate partnerTxnUid (not bank echo). */
export function kbankOrigPartnerTxnUidForFollowup(partnerTxnUid: string): string {
  return String(partnerTxnUid || '').trim().slice(0, 32)
}

export function buildKbankGenerateAuditPaste(input: {
  partnerTxnUid: string
  amount: number
  requestedQrType: string
  sentQrTypeCode?: string
  bankQrTypeCode?: string | null
  bankSof?: string | null
  requestMessage?: Record<string, unknown> | null
  responseMessage?: unknown
  storeCode?: string
}): string {
  const lines = [
    'KBank Generate QR',
    `store: ${String(input.storeCode || '').trim() || '-'}`,
    `partnerTxnUid: ${input.partnerTxnUid}`,
    `amount: ${input.amount.toFixed(2)} THB`,
    `requestedQrType: ${input.requestedQrType}`,
    `sentQrType: ${String(input.sentQrTypeCode || '-').trim() || '-'}`,
    `bankQrType: ${String(input.bankQrTypeCode || '-').trim() || '-'}`,
    `bankSof: ${String(input.bankSof || '-').trim() || '-'}`,
    '',
    '=== Request Body (masked) ===',
    JSON.stringify(input.requestMessage || {}, null, 2),
    '',
    '=== Response Body (masked) ===',
    JSON.stringify(input.responseMessage || {}, null, 2),
  ]
  return lines.join('\n')
}

function readEmvTagValue(payload: string, wantedTag: string): string {
  let i = 0
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2)
    const lenText = payload.slice(i + 2, i + 4)
    if (!/^\d{2}$/.test(lenText)) return ''
    const len = Number(lenText)
    const valueStart = i + 4
    const valueEnd = valueStart + len
    if (valueEnd > payload.length) return ''
    if (tag === wantedTag) return payload.slice(valueStart, valueEnd).trim()
    i = valueEnd
  }
  return ''
}

export function extractAmountFromEmvQrPayload(payload: string): number {
  const raw = String(payload || '').trim()
  if (!raw) return 0
  const amountText = readEmvTagValue(raw, '54')
  if (!amountText) return 0
  const amount = Number(amountText.replace(/,/g, '').trim())
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 100) / 100
}
