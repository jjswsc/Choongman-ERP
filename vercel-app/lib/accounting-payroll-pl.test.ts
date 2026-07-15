import { describe, expect, it } from 'vitest'
import {
  aggregatePayrollRecordsForPl,
  isPayrollRecordIncludedInPl,
  isSalaryLikePlExpenseRow,
  payrollRecordGrossExpenseBaht,
  resolveSalaryAccountSubjects,
} from '@/lib/accounting-payroll-pl'

describe('payrollRecordGrossExpenseBaht', () => {
  it('sums net + sso + tax', () => {
    expect(payrollRecordGrossExpenseBaht({ net_pay: 9000, sso: 500, tax: 200 })).toBe(9700)
  })
})

describe('isPayrollRecordIncludedInPl', () => {
  it('includes 확정 and paid', () => {
    expect(isPayrollRecordIncludedInPl('확정')).toBe(true)
    expect(isPayrollRecordIncludedInPl('paid')).toBe(true)
  })
  it('excludes cancelled/draft', () => {
    expect(isPayrollRecordIncludedInPl('취소')).toBe(false)
    expect(isPayrollRecordIncludedInPl('draft')).toBe(false)
  })
})

describe('resolveSalaryAccountSubjects + salary-like rows', () => {
  const meta = new Map([
    [10, { code: '5310', name: '급여', type: 'expense' }],
    [20, { code: '5520', name: '기타경비', type: 'expense' }],
    [30, { code: '1110', name: '현금이체', type: 'asset' }],
  ])

  it('prefers 5310', () => {
    const r = resolveSalaryAccountSubjects(meta)
    expect(r.preferredId).toBe(10)
    expect(r.salarySubjectIds.has(10)).toBe(true)
  })

  it('detects salary-like by account or memo', () => {
    const { salarySubjectIds } = resolveSalaryAccountSubjects(meta)
    expect(
      isSalaryLikePlExpenseRow({
        accountSubjectId: 10,
        memo: null,
        subjectMeta: meta,
        salarySubjectIds,
      })
    ).toBe(true)
    expect(
      isSalaryLikePlExpenseRow({
        accountSubjectId: 20,
        memo: '6월 급여 지급',
        subjectMeta: meta,
        salarySubjectIds,
      })
    ).toBe(true)
    expect(
      isSalaryLikePlExpenseRow({
        accountSubjectId: 20,
        memo: '렌트료',
        subjectMeta: meta,
        salarySubjectIds,
      })
    ).toBe(false)
  })
})

describe('aggregatePayrollRecordsForPl', () => {
  it('aggregates HQ stores only for HQ scope', () => {
    const { preferredId, salarySubjectIds } = resolveSalaryAccountSubjects(
      new Map([[10, { code: '5310', name: '급여', type: 'expense' }]])
    )
    const agg = aggregatePayrollRecordsForPl({
      rows: [
        { id: 1, store: '본사', name: 'A', net_pay: 10000, sso: 500, tax: 0, status: '확정' },
        { id: 2, store: 'Ekkamai', name: 'B', net_pay: 8000, sso: 400, tax: 0, status: '확정' },
      ],
      storeFilter: '본사',
      isHQ: true,
      preferredSubjectId: preferredId,
      salarySubjectIds,
    })
    expect(agg.rowCount).toBe(1)
    expect(agg.total).toBe(10500)
  })
})
