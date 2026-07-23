import { supabaseSelectFilter, supabaseSelectFilterAllPages, supabaseUpsert } from '@/lib/supabase-server'
import { buildTaxInvoiceDocNo, isTaxInvoiceDocumentNo, parseTaxInvoiceDocNoSuffix } from '@/lib/tax-invoice-doc-no'

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

function parseOverridePayload(value: string | undefined | null): {
  documentNo?: string
  issueDate?: string
  dueDate?: string
  referenceNo?: string
  shipTo?: string
} {
  try {
    const parsed = JSON.parse(String(value || '{}')) as {
      documentNo?: string
      issueDate?: string
      dueDate?: string
      referenceNo?: string
      shipTo?: string
    }
    return {
      documentNo: String(parsed.documentNo || '').trim() || undefined,
      issueDate: String(parsed.issueDate || '').trim().slice(0, 10) || undefined,
      dueDate: String(parsed.dueDate || '').trim().slice(0, 10) || undefined,
      referenceNo: String(parsed.referenceNo || '').trim() || undefined,
      shipTo: String(parsed.shipTo || '').trim() || undefined,
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

function primaryOverrideCode(refType: string, refId: number): string | null {
  const codes = overrideCodesForRef(refType, refId)
  return codes[0] || null
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

  // receivable.invoice_no 에 남은 레거시 Tax Invoice 번호(잘못된 덮어쓰기)도 사용 중으로 취급.
  // self 소유는 「해당 accrual에만 단독」일 때만 인정 — 여러 행이 같은 IV.날짜-순번이면 충돌로 보고 재할당.
  const receivables = (await supabaseSelectFilterAllPages(
    'receivable_transactions',
    `invoice_no=like.IV.${dateDigits}-*`,
    { select: 'id,invoice_no,memo', order: 'id.asc', pageSize: 5000 }
  )) as ReceivableRow[]

  const seqOwners = new Map<number, Set<number>>()
  for (const row of receivables) {
    const rowId = Number(row.id || 0)
    for (const candidate of [row.invoice_no, row.memo]) {
      const seq = seqFromDocNoForDate(candidate, dateDigits)
      if (seq == null) continue
      let set = seqOwners.get(seq)
      if (!set) {
        set = new Set()
        seqOwners.set(seq, set)
      }
      if (rowId > 0) set.add(rowId)
    }
  }
  for (const [seq, owners] of seqOwners) {
    const onlySelf = accrualId > 0 && owners.size === 1 && owners.has(accrualId)
    if (onlySelf) {
      if (selfSeq == null) selfSeq = seq
    } else {
      usedByOthers.add(seq)
    }
  }

  // 화면의 현재 문서번호(아직 저장 전)도 후보로
  if (selfSeq == null && existingDocumentNo) {
    const fromExisting = parseTaxInvoiceDocNoSuffix(existingDocumentNo)
    const matched = seqFromDocNoForDate(existingDocumentNo, dateDigits)
    if (matched != null && fromExisting != null) selfSeq = matched
  }

  if (selfSeq != null && !usedByOthers.has(selfSeq)) return selfSeq

  const maxSeq = usedByOthers.size > 0 ? Math.max(...usedByOthers) : 0
  // self가 중복(-001 등이 여러 출처에 있음)이면 self도 used에 포함해 max 계산
  const ceiling = selfSeq != null && usedByOthers.has(selfSeq)
    ? Math.max(maxSeq, selfSeq)
    : maxSeq
  return ceiling + 1
}

/**
 * 순번 조회 + override 즉시 예약(원자적 재시도).
 * getSeq → 별도 reserve 사이 레이스로 같은 IV.날짜-순번이 여러 건에 붙는 것을 막는다.
 */
export async function resolveAndReserveTaxInvoiceDepositSeq(params: {
  issueDate: string
  accrualId?: number
  refType?: string
  refId?: number
  existingDocumentNo?: string
  referenceNo?: string
  dueDate?: string
  shipTo?: string
}): Promise<{ seq: number; documentNo: string }> {
  const issueDate = String(params.issueDate || '').trim().slice(0, 10)
  const refType = String(params.refType || '').trim()
  const refId = Number(params.refId || 0)
  const code = primaryOverrideCode(refType, refId)

  let lastSeq = 1
  let lastDoc = buildTaxInvoiceDocNo(issueDate, 1)

  for (let attempt = 0; attempt < 8; attempt++) {
    const seq = await resolveTaxInvoiceDepositSeq({
      issueDate,
      accrualId: params.accrualId,
      refType: refType || undefined,
      refId: refId > 0 ? refId : undefined,
      existingDocumentNo: params.existingDocumentNo,
    })
    const documentNo = buildTaxInvoiceDocNo(issueDate, seq)
    lastSeq = seq
    lastDoc = documentNo

    if (!code) {
      return { seq, documentNo }
    }

    // 기존 override와 병합 — 재오픈·순번 예약 시 dueDate/shipTo/referenceNo가 기본값으로 덮이지 않게
    // PO ↔ AccountingPO 양쪽 키를 조회해 최신(updatedAt) 우선
    let existing: ReturnType<typeof parseOverridePayload> & { updatedAt?: string } = {}
    try {
      const codes = overrideCodesForRef(refType, refId)
      const found: (ReturnType<typeof parseOverridePayload> & { updatedAt?: string })[] = []
      for (const c of codes) {
        const prevRows = (await supabaseSelectFilter(
          'invoice_settings',
          `code=eq.${encodeURIComponent(c)}`,
          { select: 'value', limit: 1 }
        )) as OverrideRow[] | null
        if (!prevRows?.[0]) continue
        try {
          const raw = JSON.parse(String(prevRows[0].value || '{}')) as {
            documentNo?: string
            issueDate?: string
            dueDate?: string
            referenceNo?: string
            shipTo?: string
            updatedAt?: string
          }
          found.push({
            documentNo: String(raw.documentNo || '').trim() || undefined,
            issueDate: String(raw.issueDate || '').trim().slice(0, 10) || undefined,
            dueDate: String(raw.dueDate || '').trim().slice(0, 10) || undefined,
            referenceNo: String(raw.referenceNo || '').trim() || undefined,
            shipTo: String(raw.shipTo || '').trim() || undefined,
            updatedAt: String(raw.updatedAt || '').trim() || undefined,
          })
        } catch {
          /* ignore malformed */
        }
      }
      found.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      if (found[0]) existing = found[0]
    } catch {
      existing = {}
    }

    const dueFromParam = String(params.dueDate || '').trim().slice(0, 10)
    const refFromParam = String(params.referenceNo || '').trim()
    // 재오픈 시 dueDate=issueDate 기본값만 넘기면, 예전에 따로 저장한 dueDate를 유지
    let dueDate = issueDate
    if (dueFromParam && /^\d{4}-\d{2}-\d{2}$/.test(dueFromParam)) {
      if (
        dueFromParam === issueDate &&
        existing.dueDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(existing.dueDate) &&
        existing.dueDate !== issueDate
      ) {
        dueDate = existing.dueDate
      } else {
        dueDate = dueFromParam
      }
    } else if (existing.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(existing.dueDate)) {
      dueDate = existing.dueDate
    }

    const payload = {
      issueDate,
      dueDate,
      referenceNo: refFromParam || existing.referenceNo || undefined,
      documentNo,
      shipTo:
        params.shipTo !== undefined
          ? String(params.shipTo || '').trim() || undefined
          : existing.shipTo || undefined,
      updatedAt: new Date().toISOString(),
    }
    await supabaseUpsert(
      'invoice_settings',
      [{ code, value: JSON.stringify(payload) }],
      'code'
    )

    // 예약 직후 재검증 — 다른 출처와 충돌하면 다음 순번으로 재시도
    const verified = await resolveTaxInvoiceDepositSeq({
      issueDate,
      accrualId: params.accrualId,
      refType,
      refId,
      existingDocumentNo: documentNo,
    })
    if (verified === seq) {
      return { seq, documentNo }
    }
  }

  return { seq: lastSeq, documentNo: lastDoc }
}
