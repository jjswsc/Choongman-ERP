/**
 * FlowAccount 시산(Trial Balance) 엑셀/CSV 행 → ExternalTrialBalanceRow.
 * 클라이언트·서버 공통. 계정코드·기말 차·대만 있으면 된다.
 */

import type { ExternalTrialBalanceRow } from '@/lib/tax-book-opening'

function cellStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

function cellNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = cellStr(v).replace(/,/g, '').replace(/\s/g, '')
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function looksLikeAccountCode(s: string): boolean {
  return /^\d{3,6}(\.\d{1,3})?$/.test(s)
}

/**
 * 시트 2차원 배열(헤더 포함 가능)에서 시산 행을 뽑는다.
 * 열 추정: 계정코드 / End Debit|Debit / End Credit|Credit
 */
export function parseFlowTrialBalanceSheet(rows: unknown[][]): ExternalTrialBalanceRow[] {
  if (!Array.isArray(rows) || rows.length < 2) return []
  let headerIdx = -1
  let codeCol = -1
  let debitCol = -1
  let creditCol = -1

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i] || []
    const labels = row.map((c) => cellStr(c).toLowerCase())
    const codeI = labels.findIndex(
      (l) =>
        l.includes('account code') ||
        l.includes('รหัสบัญชี') ||
        l === 'code' ||
        l === 'account' ||
        l.includes('계정')
    )
    const drI = labels.findIndex(
      (l) =>
        l.includes('end debit') ||
        l.includes('ending debit') ||
        l === 'debit' ||
        l.includes('เดบิต') ||
        l.includes('차변')
    )
    const crI = labels.findIndex(
      (l) =>
        l.includes('end credit') ||
        l.includes('ending credit') ||
        l === 'credit' ||
        l.includes('เครดิต') ||
        l.includes('대변')
    )
    if (codeI >= 0 && drI >= 0 && crI >= 0) {
      headerIdx = i
      codeCol = codeI
      debitCol = drI
      creditCol = crI
      break
    }
  }

  const out: ExternalTrialBalanceRow[] = []
  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || []
      const code = cellStr(row[codeCol]).replace(/^'/, '')
      if (!looksLikeAccountCode(code)) continue
      const endDebit = cellNum(row[debitCol])
      const endCredit = cellNum(row[creditCol])
      if (Math.abs(endDebit) < 0.005 && Math.abs(endCredit) < 0.005) continue
      out.push({ code, endDebit, endCredit })
    }
    return out
  }

  // 헤더 없으면 첫 열이 계정코드, 숫자 두 열이 차·대로 추정
  for (const row of rows) {
    if (!row?.length) continue
    const code = cellStr(row[0]).replace(/^'/, '')
    if (!looksLikeAccountCode(code)) continue
    const nums = row.slice(1).map(cellNum).filter((n) => Number.isFinite(n))
    if (nums.length < 2) continue
    out.push({ code, endDebit: nums[nums.length - 2] || 0, endCredit: nums[nums.length - 1] || 0 })
  }
  return out
}
