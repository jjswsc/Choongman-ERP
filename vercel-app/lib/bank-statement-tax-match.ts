/**
 * Statement CSV 가져오기 시, 지출관리에서 먼저 등록한 세금 납부 줄과
 * 같은 출금을 한 줄로 합친다 (미분류 중복 insert 방지).
 */

import {
  bankNoteUserDisplayText,
  extractWithdrawalCategoryFromNote,
  isTaxSettlementWithdrawalCategory,
  looksLikeTaxAuthorityRemittanceMemo,
  mergeWithdrawalCategoryIntoBankNote,
  stripExpenseInternalSourceMarker,
} from '@/lib/bank-transaction-note-meta'

export type TaxMergeCandidate = {
  id: number
  memo: string
  note: string
  category: string
}

export function combinedBankText(memo: string, note: string): string {
  return `${String(memo || '').trim()} ${bankNoteUserDisplayText(note)}`.replace(/\s+/g, ' ').trim()
}

export function isTaxSettlementBankRow(row: {
  category?: string | null
  note?: string | null
  memo?: string | null
}): boolean {
  if (String(row.category || '').toLowerCase() === 'tax') return true
  const w = extractWithdrawalCategoryFromNote(String(row.note || ''))
  if (w && isTaxSettlementWithdrawalCategory(w)) return true
  return looksLikeTaxAuthorityRemittanceMemo(combinedBankText(String(row.memo || ''), String(row.note || '')))
}

/** PP.30 07.69 / ภ.พ.30 / PND.53 등 납부 식별 키 */
export function extractTaxRemittanceFingerprints(text: string): string[] {
  const s = String(text || '')
  const out = new Set<string>()

  const addPeriod = (form: string, mm: string, yy: string) => {
    const month = String(mm || '').padStart(2, '0')
    const year = String(yy || '').slice(-2)
    if (!month || !year) return
    out.add(`${form}-${month}-${year}`)
  }

  for (const m of s.matchAll(/\bpp\.?\s*[-.]?\s*30\s*[-./]?\s*(\d{1,2})\s*[-./]\s*(\d{2,4})\b/gi)) {
    addPeriod('pp30', m[1], m[2])
  }
  for (const m of s.matchAll(/ภ\.?\s*พ\.?\s*30\s*[-./]?\s*(\d{1,2})\s*[-./]\s*(\d{2,4})/gi)) {
    addPeriod('pp30', m[1], m[2])
  }
  for (const m of s.matchAll(/ภพ\.?\s*30\s*[-./]?\s*(\d{1,2})\s*[-./]\s*(\d{2,4})/gi)) {
    addPeriod('pp30', m[1], m[2])
  }
  if (/\bpp\.?\s*[-.]?\s*30\b/i.test(s) || /ภ\.?\s*พ\.?\s*30|ภพ\.?\s*30/i.test(s)) {
    out.add('pp30')
  }

  for (const m of s.matchAll(/\bpnd\s*\.?\s*(1|3|53|54)\b/gi)) {
    out.add(`pnd${m[1].toLowerCase()}`)
  }
  for (const m of s.matchAll(/ภ\.?\s*ง\.?\s*ด\.?\s*(1|3|53|54)\b/gi)) {
    out.add(`pnd${m[1]}`)
  }

  return [...out]
}

function specificFingerprints(fps: string[]): string[] {
  return fps.filter((f) => f !== 'pp30')
}

export function taxRemittanceFingerprintsOverlap(existingText: string, incomingText: string): boolean {
  const a = extractTaxRemittanceFingerprints(existingText)
  const b = extractTaxRemittanceFingerprints(incomingText)
  const aSpec = specificFingerprints(a)
  const bSpec = specificFingerprints(b)
  if (aSpec.some((x) => bSpec.includes(x))) return true
  return false
}

function incomingLooksLikeTaxStatement(memo: string, note: string): boolean {
  const text = combinedBankText(memo, note)
  if (looksLikeTaxAuthorityRemittanceMemo(text)) return true
  return extractTaxRemittanceFingerprints(text).length > 0
}

function displaySnippetMatch(existing: TaxMergeCandidate, incomingMemo: string, incomingNote: string): boolean {
  const incomingText = combinedBankText(incomingMemo, incomingNote).toLowerCase()
  const existingDisplay = (
    bankNoteUserDisplayText(existing.note) || String(existing.memo || '').trim()
  ).replace(/\s+/g, ' ').trim()
  if (existingDisplay.length >= 4 && incomingText.includes(existingDisplay.toLowerCase())) return true

  const incomingDisplay = bankNoteUserDisplayText(incomingNote)
  const existingText = combinedBankText(existing.memo, existing.note).toLowerCase()
  if (incomingDisplay.length >= 4 && existingText.includes(incomingDisplay.toLowerCase())) return true
  return false
}

/**
 * 같은 날짜·유형·금액 버킷 안에서, Statement 한 줄과 합칠 세금 납부 행 인덱스.
 * 없으면 -1.
 */
export function findTaxStatementMergeIndex(
  pool: TaxMergeCandidate[],
  incomingMemo: string,
  incomingNote: string
): number {
  const taxIdxs: number[] = []
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].id > 0 && isTaxSettlementBankRow(pool[i])) taxIdxs.push(i)
  }
  if (taxIdxs.length === 0) return -1

  const incomingText = combinedBankText(incomingMemo, incomingNote)

  for (const i of taxIdxs) {
    const existingText = combinedBankText(pool[i].memo, pool[i].note)
    if (taxRemittanceFingerprintsOverlap(existingText, incomingText)) return i
  }

  for (const i of taxIdxs) {
    if (displaySnippetMatch(pool[i], incomingMemo, incomingNote)) return i
  }

  if (taxIdxs.length === 1 && incomingLooksLikeTaxStatement(incomingMemo, incomingNote)) {
    return taxIdxs[0]
  }

  return -1
}

export function composeMergedTaxBankFields(
  existing: { memo: string; note: string; category: string },
  incoming: { memo: string; note: string }
): { memo: string | null; note: string | null; category: 'tax' } {
  const incomingMemo = String(incoming.memo || '').trim()
  const existingMemo = String(existing.memo || '').trim()
  const memo = incomingMemo || existingMemo || null

  const wCat = extractWithdrawalCategoryFromNote(existing.note)
  const user =
    bankNoteUserDisplayText(existing.note) ||
    bankNoteUserDisplayText(incoming.note) ||
    ''

  let note: string | null
  if (wCat && isTaxSettlementWithdrawalCategory(wCat)) {
    note = mergeWithdrawalCategoryIntoBankNote(user, wCat)
  } else {
    const cleaned = stripExpenseInternalSourceMarker(String(existing.note || ''))
    note = user || bankNoteUserDisplayText(cleaned) || cleaned || null
  }
  if (note) note = stripExpenseInternalSourceMarker(note) || note

  return {
    memo,
    note: note || null,
    category: 'tax',
  }
}
