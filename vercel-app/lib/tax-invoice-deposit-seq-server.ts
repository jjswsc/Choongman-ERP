import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { isTaxInvoiceDocumentNo, parseTaxInvoiceDocNoSuffix } from '@/lib/tax-invoice-doc-no'

type OverrideRow = { code?: string; value?: string }
type ReceivableRow = { id?: number; invoice_no?: string | null; memo?: string | null }

function issueDateDigits(issueDate: string): string | null {
  const digits = String(issueDate || '').replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(0, 8) : null
}

function seqFromDocNoForDate(docNo: string | undefined | null, dateDigits: string): number | null {
  const raw = String(docNo || '').trim()
  if (!raw || !isTaxInvoiceDocumentNo(raw)) return null
  const m = raw.match(new RegExp(`^IV\\.${dateDigits}-(\\d+)$`, 'i'))
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseOverridePayload(value: string | undefined | null): { documentNo?: string; issueDate?: string } {
  try {
    const parsed = JSON.parse(String(value || '{}')) as { documentNo?: string; issueDate?: string }
    return {
      documentNo: String(parsed.documentNo || '').trim() || undefined,
      issueDate: String(parsed.issueDate || '').trim().slice(0, 10) || undefined,
    }
  } catch {
    return {}
  }
}

function overrideCodesForRef(refType: string, refId: number): string[] {
  const rt = String(refType || '').trim()
  if (!rt || !Number.isFinite(refId) || refId <= 0) return []
  if (rt === 'AccountingPO' || rt === 'PO') {
    return [
      `invoice_print_override:tax:PO:${refId}`,
      `invoice_print_override:tax:AccountingPO:${refId}`,
    ]
  }
  return [`invoice_print_override:tax:${rt}:${refId}`]
}

/**
 * Tax Invoice 문서번호 순번 (IV.YYYYMMDD-NNN 의 NNN).
 * issueDate 기준 이미 저장된 번호의 max+1.
 * 같은 출처는 재사용하되, 다른 출처와 중복이면 새 순번 부여.
 */
export async function resolveTaxInvoiceDepositSeq(params: {
  issueDate: string
  accrualId?: number
  refType?: string
  refId?: number
  existingDocumentNo?: string
}): Promise<number> {
  const date = String(params.issueDate || '').trim().slice(0, 10)
  const dateDigits = issueDateDigits(date)
  if (!dateDigits || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 1

  const accrualId = Number(params.accrualId || 0)
  const refType = String(params.refType || '').trim()
  const refId = Number(params.refId || 0)
  const existingDocumentNo = String(params.existingDocumentNo || '').trim()
  const selfCodes = new Set(overrideCodesForRef(refType, refId))

  const usedByOthers = new Set<number>()

  const overrides = (await supabaseSelectFilterAllPages(
    'invoice_settings',
    'code=like.invoice_print_override:tax:*',
    { select: 'code,value', order: 'code.asc', pageSize: 2000 }
  )) as OverrideRow[]

  let selfSeq: number | null = null
  for (const row of overrides) {
    const code = String(row.code || '')
    const payload = parseOverridePayload(row.value)
    const seq = seqFromDocNoForDate(payload.documentNo, dateDigits)
    if (seq == null) continue
    if (selfCodes.has(code)) {
      if (selfSeq == null) selfSeq = seq
      continue
    }
    usedByOthers.add(seq)
  }

  const receivables = (await supabaseSelectFilterAllPages(
    'receivable_transactions',
    `invoice_no=like.IV.${dateDigits}-*`,
    { select: 'id,invoice_no,memo', order: 'id.asc', pageSize: 5000 }
  )) as ReceivableRow[]

  for (const row of receivables) {
    const isSelf = accrualId > 0 && Number(row.id) === accrualId
    for (const candidate of [row.invoice_no, row.memo]) {
      const seq = seqFromDocNoForDate(candidate, dateDigits)
      if (seq == null) continue
      if (isSelf) {
        if (selfSeq == null) selfSeq = seq
        continue
      }
      usedByOthers.add(seq)
    }
  }

  // 화면의 현재 문서번호(아직 저장 전)도 후보로
  if (selfSeq == null && existingDocumentNo) {
    const fromExisting = parseTaxInvoiceDocNoSuffix(existingDocumentNo)
    const matched = seqFromDocNoForDate(existingDocumentNo, dateDigits)
    if (matched != null && fromExisting != null) selfSeq = matched
  }

  // override에 아직 없고 accrual로도 못 찾은 경우 한 번 더 조회
  if (selfSeq == null && accrualId > 0) {
    const self = (await supabaseSelectFilter(
      'receivable_transactions',
      `id=eq.${accrualId}`,
      { select: 'id,invoice_no,memo', limit: 1 }
    )) as ReceivableRow[] | null
    const row = self?.[0]
    for (const candidate of [row?.invoice_no, row?.memo]) {
      const seq = seqFromDocNoForDate(candidate, dateDigits)
      if (seq != null) {
        selfSeq = seq
        break
      }
    }
  }

  if (selfSeq != null && !usedByOthers.has(selfSeq)) return selfSeq

  const maxSeq = usedByOthers.size > 0 ? Math.max(...usedByOthers) : 0
  // self가 중복(-001 등이 여러 출처에 있음)이면 self도 used에 포함해 max 계산
  const ceiling = selfSeq != null && usedByOthers.has(selfSeq)
    ? Math.max(maxSeq, selfSeq)
    : maxSeq
  return ceiling + 1
}
