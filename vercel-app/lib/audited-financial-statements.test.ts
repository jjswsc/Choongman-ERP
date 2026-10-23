import { describe, expect, it } from 'vitest'
import {
  AUDITED_FS_FY2568,
  BANGNA_BIZZO_TAX_ID,
  buildAuditedYearActivityLines,
  buildOpeningLinesFromAuditedBs,
  incorporationOpeningBs,
} from '@/lib/audited-financial-statements'
import { buildTaxBookStatements, taxJournalBalanced } from '@/lib/tax-book'

describe('audited financial statements FY2568', () => {
  it('has four legal entities', () => {
    expect(AUDITED_FS_FY2568).toHaveLength(4)
    expect(AUDITED_FS_FY2568.map((r) => r.taxId).sort()).toEqual(
      ['0105563161764', '0105566137147', '0105566228126', '0105568080622'].sort()
    )
  })

  it('BS totals match line sums for each entity', () => {
    for (const row of AUDITED_FS_FY2568) {
      const { bs } = row
      const assets =
        bs.cash + bs.tradeAndOtherReceivables + bs.inventories + bs.equipmentNet
      const liabEq =
        bs.tradeAndOtherPayables +
        bs.shortTermLoansRelatedParties +
        bs.shareCapital +
        bs.retainedEarnings
      expect(Math.abs(assets - bs.totalAssets)).toBeLessThan(0.02)
      expect(Math.abs(liabEq - (bs.totalLiabilities + bs.totalEquity))).toBeLessThan(0.02)
      expect(Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity))).toBeLessThan(0.02)
    }
  })

  it('builds balanced Bangna opening from audited BS', () => {
    const bangna = AUDITED_FS_FY2568.find((r) => r.taxId === BANGNA_BIZZO_TAX_ID)!
    const lines = buildOpeningLinesFromAuditedBs(bangna.bs)
    expect(taxJournalBalanced(lines)).toBe(true)
    expect(lines.find((l) => l.accountCode === '1010')?.amount).toBe(299915.41)
    expect(lines.find((l) => l.accountCode === '2150')?.side).toBe('credit')
    expect(lines.find((l) => l.accountCode === '3120')?.side).toBe('debit')
  })

  it('year activity bridges prior→ending BS with P&L and stays balanced', () => {
    for (const row of AUDITED_FS_FY2568) {
      const openingBs = row.priorBs || incorporationOpeningBs(row.bs.shareCapital)
      const activity = buildAuditedYearActivityLines({
        openingBs,
        endingBs: row.bs,
        pl: row.pl,
      })
      expect(taxJournalBalanced(activity)).toBe(true)
      expect(activity.some((l) => l.accountCode === '4110' || l.accountCode === '5110')).toBe(true)

      // 기초+발생 시산이 감사 말 BS·당기순손익과 맞는지(미마감)
      const tb = new Map<string, { debit: number; credit: number; name?: string }>()
      const addLines = (lines: ReturnType<typeof buildOpeningLinesFromAuditedBs>) => {
        for (const ln of lines) {
          const cur = tb.get(ln.accountCode) || { debit: 0, credit: 0, name: ln.accountName }
          if (ln.side === 'debit') cur.debit += ln.amount
          else cur.credit += ln.amount
          tb.set(ln.accountCode, cur)
        }
      }
      addLines(buildOpeningLinesFromAuditedBs(openingBs))
      addLines(activity)
      const rows = [...tb.entries()].map(([accountCode, v]) => ({
        accountCode,
        accountName: v.name,
        debit: v.debit,
        credit: v.credit,
      }))
      const stmt = buildTaxBookStatements(rows)
      expect(stmt.balanced).toBe(true)
      expect(Math.abs(stmt.unclosedProfit - row.pl.netIncome)).toBeLessThan(0.05)
      expect(Math.abs(stmt.assets - row.bs.totalAssets)).toBeLessThan(0.05)
    }
  })
})
