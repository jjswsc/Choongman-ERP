import { resolveKbankVoidTxnNoForRequest } from '@/lib/payments/kbank-api-reference'

export type KbankVoidAttemptLike = {
  provider?: string | null
  bankId?: string | null
  txCode?: string | null
  localTxId?: string | null
  status?: string | null
  approvalCode?: string | null
  traceNo?: string | null
  terminalId?: string | null
}

export type KbankVoidOrderRefs = {
  partnerTxnUid: string
  txnNo: string
  terminalId: string
  alreadyVoided: boolean
}

function isKbankAttempt(a: KbankVoidAttemptLike): boolean {
  const provider = String(a.provider || '').toLowerCase()
  const bankId = String(a.bankId || '').toUpperCase()
  return provider.includes('kbank') || bankId === 'KBANK'
}

function localTxIdOf(a: KbankVoidAttemptLike): string {
  return String(a.localTxId || '').trim()
}

function isVoidAttempt(a: KbankVoidAttemptLike): boolean {
  const code = String(a.txCode || '').trim().toUpperCase()
  const id = localTxIdOf(a).toUpperCase()
  return code === 'VOID' || id.startsWith('VOD') || id.includes(':VOID')
}

function isGenerateQrAttempt(a: KbankVoidAttemptLike): boolean {
  if (!isKbankAttempt(a) || isVoidAttempt(a)) return false
  const code = String(a.txCode || '').trim().toUpperCase()
  const id = localTxIdOf(a)
  if (!id) return false
  if (/^CHK/i.test(id) || /^kbank-webhook/i.test(id)) return false
  if (['STATUS', 'INQUIRY', 'WEBHOOK'].includes(code)) return false
  return code === 'QR' || code === 'GENERATE'
}

function pickTxnNo(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const n = resolveKbankVoidTxnNoForRequest(v) || ''
    if (n) return n
  }
  return ''
}

/** Resolve KBank Void ids from payment-attempt rows of one POS order. */
export function pickKbankVoidRefsFromAttempts(
  attempts: KbankVoidAttemptLike[] | null | undefined
): KbankVoidOrderRefs | null {
  const rows = (attempts || []).filter(isKbankAttempt)
  if (rows.length === 0) return null

  const alreadyVoided = rows.some(
    (a) => isVoidAttempt(a) && String(a.status || '').trim().toLowerCase() === 'approved'
  )
  const generates = rows.filter(isGenerateQrAttempt)
  const approvedGenerate = generates.find(
    (a) => String(a.status || '').trim().toLowerCase() === 'approved'
  )
  const generate = approvedGenerate || generates[0]
  const partnerTxnUid = localTxIdOf(generate || {})
  if (!partnerTxnUid) return alreadyVoided ? { partnerTxnUid: '', txnNo: '', terminalId: '', alreadyVoided } : null

  const txnNo = pickTxnNo(
    generate?.approvalCode,
    generate?.traceNo,
    ...rows.flatMap((a) => [a.approvalCode, a.traceNo])
  )
  const terminalId = String(generate?.terminalId || rows.find((a) => String(a.terminalId || '').trim())?.terminalId || '').trim()

  return { partnerTxnUid, txnNo, terminalId, alreadyVoided }
}
